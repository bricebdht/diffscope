#!/usr/bin/env node
// Publishes Claude's review on the pull request: pushes the review page and the
// close-ups to a per-PR branch (diffscope-review/pr-<number>, one force-pushed
// commit), then posts or updates a single PR comment showing the verdicts with
// the images. Also deletes the review branches of closed PRs and the ones older
// than the retention period, so the images expire.
//
// Usage: node publish-review.mjs <manifest.json> [--repo <owner/name>] [--remote <name>]
//                                [--retention-days <n>] [--dry-run]
//   Reads the suggestions file referenced by the manifest (it must have
//   pullRequest.number) and the diffscope-review.html built next to it.
//   --dry-run  writes the comment to diffscope-review-comment.md without pushing or posting.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BRANCH_PREFIX = 'diffscope-review/pr-';
const DEFAULT_RETENTION_DAYS = 7;
// The first line of the comment, used to find it again (and by projects that check it).
const MARKER = '<!-- diffscope-review -->';
// GitHub rejects comments over 65536 characters.
const MAX_COMMENT = 65000;
// Close-ups are shown at most this wide in the comment.
const MAX_IMAGE_WIDTH = 300;
const MAX_REGIONS = 3;

const VERDICTS = {
  reject: { label: 'Needs changes', count: 'to fix', icon: '❌', order: 0 },
  unsure: { label: 'Unsure', count: 'unsure', icon: '⚠️', order: 1 },
  approve: { label: 'Approve', count: 'approved', icon: '✅', order: 2 },
};
const CATEGORIES = {
  intended: 'Intended change',
  regression: 'Likely regression',
  noise: 'Rendering noise',
  unknown: 'Unclear',
};
const MERGE = {
  ready: '✅ Ready to merge',
  changes: '❌ Changes needed before merging',
  unsure: '⚠️ Needs a human look before merging',
};

const verdictOf = (s) => (VERDICTS[s?.verdict] ? s.verdict : 'unsure');

function run(cmd, args, input) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim();
    throw new Error(`${cmd} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

const git = (...args) => run('git', args);
const gh = (...args) => run('gh', args);

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(repo|remote|retention-days|dry-run)$/);
    if (!m) {
      if (argv[i].startsWith('--')) throw new Error(`Unknown argument: ${argv[i]}`);
      args.positional.push(argv[i]);
    } else if (m[1] === 'dry-run') {
      args.dryRun = true;
    } else {
      args[m[1]] = argv[++i];
    }
  }
  return args;
}

// Plain text from the suggestions file, safe to put in Markdown: no HTML, no
// line breaks that would end a list item or a heading.
const md = (value) => String(value ?? '')
  .replace(/[<>]/g, c => (c === '<' ? '&lt;' : '&gt;'))
  .replace(/\s*\n\s*/g, ' ')
  .trim();

// The review's own merge recommendation, or one derived from the verdicts.
function mergeRecommendation(suggestions, counts) {
  const verdict = MERGE[suggestions.merge?.verdict] ? suggestions.merge.verdict
    : counts.reject ? 'changes' : counts.unsure ? 'unsure' : 'ready';
  return { verdict, reason: suggestions.merge?.reason };
}

// Files to push, keyed by their path on the review branch.
function collectFiles(manifest, reviewHtml) {
  const root = path.dirname(manifest.manifestPath);
  const files = new Map([['index.html', reviewHtml]]);
  for (const diff of manifest.diffs) {
    const sets = diff.regions?.length ? diff.regions.slice(0, MAX_REGIONS).map(r => r.images) : [diff.images];
    for (const images of sets) {
      for (const file of Object.values(images || {})) {
        if (file && fs.existsSync(file)) files.set(path.relative(root, file).split(path.sep).join('/'), file);
      }
    }
  }
  return files;
}

// Creates an orphan commit holding the files, without touching the working tree
// or the index, and returns its sha.
function commitFiles(files, message) {
  const entries = [...files.entries()];
  const shas = run('git', ['hash-object', '-w', '--stdin-paths'], entries.map(([, file]) => file).join('\n') + '\n').split(/\r?\n/);

  // Nested { name: sha | subtree } map, written bottom-up with mktree.
  const tree = {};
  entries.forEach(([p], i) => {
    const parts = p.split('/');
    let node = tree;
    for (const dir of parts.slice(0, -1)) node = node[dir] ??= {};
    node[parts.at(-1)] = shas[i];
  });
  const writeTree = (node) => {
    const lines = Object.entries(node).map(([name, value]) => (typeof value === 'string'
      ? `100644 blob ${value}\t${name}`
      : `040000 tree ${writeTree(value)}\t${name}`));
    return run('git', ['mktree'], lines.join('\n') + '\n');
  };

  return git('commit-tree', writeTree(tree), '-m', message);
}

// The git remote pointing at the repository (origin when none matches).
function findRemote(repo, wanted) {
  if (wanted) return wanted;
  const remotes = git('remote', '-v').split(/\r?\n/);
  const match = remotes.find(line => /\(push\)$/.test(line) && line.toLowerCase().includes(repo.toLowerCase()));
  return match ? match.split(/\s+/)[0] : 'origin';
}

// Deletes review branches of closed PRs and the ones older than the retention.
function pruneBranches(repo, currentPr, retentionDays) {
  const refs = gh('api', `repos/${repo}/git/matching-refs/heads/${BRANCH_PREFIX}`, '--jq', '.[] | [.ref, .object.sha] | @tsv');
  const pruned = [];
  for (const line of refs.split(/\r?\n/).filter(Boolean)) {
    const [ref, sha] = line.split('\t');
    const branch = ref.replace(/^refs\/heads\//, '');
    const number = Number(branch.slice(BRANCH_PREFIX.length));
    if (number === currentPr) continue; // overwritten below
    try {
      const state = number ? gh('pr', 'view', String(number), '--repo', repo, '--json', 'state', '-q', '.state') : 'UNKNOWN';
      const date = new Date(gh('api', `repos/${repo}/git/commits/${sha}`, '-q', '.committer.date'));
      const ageDays = (Date.now() - date.getTime()) / 86400000;
      if (state !== 'OPEN' || ageDays > retentionDays) {
        gh('api', '-X', 'DELETE', `repos/${repo}/git/refs/heads/${branch}`);
        pruned.push(branch);
      }
    } catch (err) {
      console.error(`publish-review: could not prune ${branch}: ${err.message}`);
    }
  }
  return pruned;
}

function imageTable(images, url, width) {
  const cells = ['expected', 'actual', 'diff'].map(kind => (images?.[kind] && url(images[kind])
    ? `<td><img src="${url(images[kind])}" width="${width}" alt="${kind}"></td>`
    : '<td>not available</td>'));
  return `<table><tr><th>Expected</th><th>Actual</th><th>Diff</th></tr><tr>${cells.join('')}</tr></table>`;
}

function diffSection(diff, s, url) {
  const title = [diff.snapshot, diff.projectName].filter(Boolean).map(md).join(' · ');
  const meta = s
    ? `${CATEGORIES[s.category] || CATEGORIES.unknown} · ${s.confidence || 'low'} confidence`
    : 'No suggestion for this diff';
  const lines = [
    `#### ${VERDICTS[verdictOf(s)].icon} ${title}${s?.group ? ` — ${md(s.group)}` : ''}`,
    '',
    `<sub>${meta}${diff.changedPixels != null ? ` · ${diff.changedPixels.toLocaleString('en-US')} changed px` : ''}</sub>`,
    '',
  ];
  if (s?.summary) lines.push(`**${md(s.summary)}**`, '');
  if (s?.details) lines.push(md(s.details), '');
  if (s?.relatedFiles?.length) lines.push(`Related: ${s.relatedFiles.map(f => `\`${md(f)}\``).join(', ')}`, '');
  if (url) {
    const sets = diff.regions?.length
      ? diff.regions.slice(0, MAX_REGIONS).map(r => ({ images: r.images, width: Math.min(r.width || MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH) }))
      : [{ images: diff.images, width: MAX_IMAGE_WIDTH }];
    for (const { images, width } of sets) lines.push(imageTable(images, url, width), '');
  }
  return lines.join('\n');
}

function renderComment({ manifest, suggestions, url, reviewedCommit, prHead, branchUrl, htmlUrl, retentionDays }) {
  const byId = new Map((suggestions.suggestions || []).map(s => [s.id, s]));
  const rows = manifest.diffs
    .map(diff => ({ diff, s: byId.get(diff.id) }))
    .sort((a, b) =>
      VERDICTS[verdictOf(a.s)].order - VERDICTS[verdictOf(b.s)].order
      || (a.s?.group ?? '').localeCompare(b.s?.group ?? '')
      || a.diff.snapshot.localeCompare(b.diff.snapshot));
  const counts = { reject: 0, unsure: 0, approve: 0 };
  for (const { s } of rows) counts[verdictOf(s)]++;
  const merge = mergeRecommendation(suggestions, counts);

  const head = [
    MARKER,
    `<!-- diffscope-review-commit: ${reviewedCommit || 'unknown'} -->`,
    `## ✦ Diffscope review: ${MERGE[merge.verdict]}`,
    '',
  ];
  if (merge.reason) head.push(`> ${md(merge.reason)}`, '');
  const facts = [
    reviewedCommit ? `Reviewed commit \`${reviewedCommit.slice(0, 7)}\`` : null,
    suggestions.branch ? `branch \`${md(suggestions.branch)}\`` : null,
    `${rows.length} diff${rows.length === 1 ? '' : 's'}: ${Object.entries(VERDICTS).map(([v, { icon, count }]) => `${icon} ${counts[v]} ${count}`).join(' · ')}`,
  ].filter(Boolean);
  head.push(facts.join(' · '), '');
  if (reviewedCommit && prHead && reviewedCommit !== prHead) {
    head.push(`> [!WARNING]\n> The PR has new commits since this review (head is now \`${prHead.slice(0, 7)}\`). Run \`/diffscope:review\` again.`, '');
  }
  if (suggestions.summary) head.push(md(suggestions.summary), '');

  const generatedAt = suggestions.generatedAt ? new Date(suggestions.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null;
  const footer = [
    '---',
    `<sub>Generated by Claude Code with <code>/diffscope:review</code>${generatedAt ? ` on ${generatedAt}` : ''}. `
      + (branchUrl
        ? `The images live on the <a href="${branchUrl}">review branch</a>, deleted after ${retentionDays} days or when the PR is closed: run the review again to bring them back. <a href="${htmlUrl}">Standalone review page</a> (download and open in a browser).`
        : '')
      + '</sub>',
  ];

  // Needs changes and unsure diffs in full, approved ones folded. When the
  // comment gets too long, approved diffs lose their images, then their details.
  const build = (approvedMode) => {
    const parts = [...head];
    for (const v of ['reject', 'unsure']) {
      const group = rows.filter(r => verdictOf(r.s) === v);
      if (!group.length) continue;
      parts.push(`### ${VERDICTS[v].icon} ${VERDICTS[v].label} (${group.length})`, '');
      for (const { diff, s } of group) parts.push(diffSection(diff, s, url));
    }
    const approved = rows.filter(r => verdictOf(r.s) === 'approve');
    if (approved.length) {
      parts.push(`<details><summary><b>${VERDICTS.approve.icon} ${VERDICTS.approve.label} (${approved.length})</b></summary>`, '');
      if (approvedMode === 'list') {
        for (const { diff, s } of approved) parts.push(`- **${md(diff.snapshot)}**${diff.projectName ? ` · ${md(diff.projectName)}` : ''}: ${md(s?.summary)}`);
        parts.push('');
      } else {
        for (const { diff, s } of approved) parts.push(diffSection(diff, s, approvedMode === 'full' ? url : null));
      }
      parts.push('</details>', '');
    }
    return [...parts, ...footer].join('\n');
  };

  for (const mode of ['full', 'text', 'list']) {
    const body = build(mode);
    if (body.length <= MAX_COMMENT) return { body, merge, counts };
  }
  throw new Error('The review is too long for a GitHub comment, even without the approved diffs\' images.');
}

// Posts the comment, or updates the previous review comment of the same user.
function upsertComment(repo, number, body) {
  const me = gh('api', 'user', '-q', '.login');
  const ids = gh('api', '--paginate', `repos/${repo}/issues/${number}/comments`, '--jq',
    `.[] | select(.user.login == "${me}" and (.body | startswith("${MARKER}"))) | .id`).split(/\r?\n/).filter(Boolean);
  const input = path.join(os.tmpdir(), `diffscope-comment-${process.pid}.json`);
  fs.writeFileSync(input, JSON.stringify({ body }));
  try {
    const id = ids.at(-1);
    const res = id
      ? gh('api', '-X', 'PATCH', `repos/${repo}/issues/comments/${id}`, '--input', input, '-q', '.html_url')
      : gh('api', '-X', 'POST', `repos/${repo}/issues/${number}/comments`, '--input', input, '-q', '.html_url');
    return { url: res, updated: Boolean(id) };
  } finally {
    fs.rmSync(input, { force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = args.positional[0];
  if (!manifestPath) throw new Error('Usage: node publish-review.mjs <manifest.json> [--repo <owner/name>] [--remote <name>] [--retention-days <n>] [--dry-run]');
  const retentionDays = Number(args['retention-days'] ?? DEFAULT_RETENTION_DAYS);

  const manifest = { ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifestPath: path.resolve(manifestPath) };
  if (!fs.existsSync(manifest.suggestionsPath)) throw new Error(`Suggestions file not found: ${manifest.suggestionsPath}`);
  const suggestions = JSON.parse(fs.readFileSync(manifest.suggestionsPath, 'utf8'));
  const reviewHtml = path.join(path.dirname(manifest.suggestionsPath), 'diffscope-review.html');
  if (!fs.existsSync(reviewHtml)) throw new Error(`Review page not found: ${reviewHtml} (run build-html-report.mjs first).`);

  const number = suggestions.pullRequest?.number;
  if (!number) throw new Error('The suggestions file has no pullRequest.number: there is no pull request to comment on.');
  const repo = args.repo
    || suggestions.pullRequest.url?.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1]
    || gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
  const reviewedCommit = suggestions.commit || null;
  const branch = `${BRANCH_PREFIX}${number}`;

  if (args.dryRun) {
    const { body } = renderComment({
      manifest, suggestions, reviewedCommit, retentionDays,
      url: (file) => `file:///${file.replace(/\\/g, '/')}`,
    });
    const out = path.join(path.dirname(manifest.suggestionsPath), 'diffscope-review-comment.md');
    fs.writeFileSync(out, body);
    console.log(JSON.stringify({ dryRun: true, comment: out, length: body.length }, null, 2));
    return;
  }

  try {
    gh('auth', 'status');
  } catch {
    throw new Error('The GitHub CLI (gh) is not installed or not logged in. Run `gh auth login` first.');
  }
  const prHead = gh('pr', 'view', String(number), '--repo', repo, '--json', 'headRefOid', '-q', '.headRefOid');

  const pruned = pruneBranches(repo, number, retentionDays);

  const files = collectFiles(manifest, reviewHtml);
  const commit = commitFiles(files, `Diffscope review of #${number}${reviewedCommit ? ` at ${reviewedCommit.slice(0, 7)}` : ''}`);
  run('git', ['push', '--force', '--quiet', findRemote(repo, args.remote), `${commit}:refs/heads/${branch}`]);

  // Pinned to the commit, so a later review never changes what an old comment shows.
  const blob = (p) => `https://github.com/${repo}/blob/${commit}/${p.split('/').map(encodeURIComponent).join('/')}`;
  const rel = new Map([...files.entries()].map(([p, file]) => [file, p]));
  const { body, merge, counts } = renderComment({
    manifest, suggestions, reviewedCommit, prHead, retentionDays,
    url: (file) => (rel.has(file) ? `${blob(rel.get(file))}?raw=true` : null),
    branchUrl: `https://github.com/${repo}/tree/${branch}`,
    htmlUrl: `${blob('index.html')}?raw=true`,
  });
  const comment = upsertComment(repo, number, body);

  console.log(JSON.stringify({
    comment: comment.url,
    updated: comment.updated,
    reviewBranch: branch,
    reviewedCommit,
    prHead,
    // true when the PR got new commits after the reviewed one.
    stale: Boolean(reviewedCommit && prHead && reviewedCommit !== prHead),
    merge: merge.verdict,
    counts,
    pruned,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`publish-review: ${err.message}`);
  process.exit(1);
}
