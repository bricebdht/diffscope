#!/usr/bin/env node
// Publishes Claude's review of a CI report on the pull request: posts or
// updates a single PR comment with the merge recommendation and every diff's
// verdict (text only), a link to the run's report artifact, and the
// suggestions file to paste into Diffscope next to that report.
//
// Usage: node publish-review.mjs <manifest.json> [--repo <owner/name>] [--dry-run]
//   Reads the suggestions file referenced by the manifest. It must have
//   pullRequest.number and run (the reviewed CI run): a local report has no
//   reliable commit and nothing for the PR's readers to download.
//   --dry-run  writes the comment to diffscope-review-comment.md without posting it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The first line of the comment, used to find it again (and by projects that check it).
const MARKER = '<!-- diffscope-review -->';
// GitHub rejects comments over 65536 characters.
const MAX_COMMENT = 65000;
const APP_URL = 'https://bricebdht.github.io/diffscope/';

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

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim();
    throw new Error(`${cmd} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

const gh = (...args) => run('gh', args);

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(repo|dry-run)$/);
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

const diffTitle = (diff) => [diff.snapshot, diff.projectName].filter(Boolean).map(md).join(' · ');

function diffSection(diff, s) {
  const meta = s
    ? `${CATEGORIES[s.category] || CATEGORIES.unknown} · ${s.confidence || 'low'} confidence`
    : 'No suggestion for this diff';
  const lines = [
    `#### ${VERDICTS[verdictOf(s)].icon} ${diffTitle(diff)}${s?.group ? ` — ${md(s.group)}` : ''}`,
    '',
    `<sub>${meta}${diff.changedPixels != null ? ` · ${diff.changedPixels.toLocaleString('en-US')} changed px` : ''}</sub>`,
    '',
  ];
  if (s?.summary) lines.push(`**${md(s.summary)}**`, '');
  if (s?.details) lines.push(md(s.details), '');
  if (s?.relatedFiles?.length) lines.push(`Related: ${s.relatedFiles.map(f => `\`${md(f)}\``).join(', ')}`, '');
  return lines.join('\n');
}

const diffLine = (diff, s) => `- ${VERDICTS[verdictOf(s)].icon} **${diffTitle(diff)}**${s?.summary ? `: ${md(s.summary)}` : ''}`;

function renderComment({ manifest, suggestions, prHead }) {
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
  const reviewedCommit = suggestions.commit;
  const ciRun = suggestions.run;

  const head = [
    MARKER,
    `<!-- diffscope-review-commit: ${reviewedCommit} -->`,
    `## ✦ Diffscope review: ${MERGE[merge.verdict]}`,
    '',
  ];
  if (merge.reason) head.push(`> ${md(merge.reason)}`, '');
  const facts = [
    `Reviewed commit \`${reviewedCommit.slice(0, 7)}\``,
    ciRun.url ? `[CI run](${ciRun.url})` : null,
    `${rows.length} diff${rows.length === 1 ? '' : 's'}: ${Object.entries(VERDICTS).map(([v, { icon, count }]) => `${icon} ${counts[v]} ${count}`).join(' · ')}`,
  ].filter(Boolean);
  head.push(facts.join(' · '), '');
  if (prHead && reviewedCommit !== prHead) {
    head.push(`> [!WARNING]\n> The PR has new commits since this review (head is now \`${prHead.slice(0, 7)}\`). Run \`/diffscope:review\` again once CI has run.`, '');
  }
  if (suggestions.summary) head.push(md(suggestions.summary), '');

  const report = ciRun.artifactUrl
    ? `[download the \`${md(ciRun.artifact || 'report')}\` artifact](${ciRun.artifactUrl})`
    : `download the \`${md(ciRun.artifact || 'report')}\` artifact of the [CI run](${ciRun.url})`;
  const howTo = [
    '### See the screenshots in Diffscope',
    '',
    `1. ${report} (it expires with the run's artifacts);`,
    `2. drop the zip into [Diffscope](${APP_URL});`,
    '3. click **Claude review**, then paste the suggestions below.',
    '',
  ];
  const json = [
    '<details><summary>Suggestions file (<code>diffscope-suggestions.json</code>)</summary>',
    '',
    '```json',
    // Escaped so a backtick in the text can't close the code block.
    JSON.stringify(suggestions).replace(/`/g, '\\u0060'),
    '```',
    '',
    '</details>',
    '',
  ];
  const generatedAt = suggestions.generatedAt ? new Date(suggestions.generatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null;
  const footer = [
    '---',
    `<sub>Generated by Claude Code with <code>/diffscope:review</code>${generatedAt ? ` on ${generatedAt}` : ''}.</sub>`,
  ];

  // Needs changes and unsure diffs in full, approved ones folded. When the
  // comment gets too long, approved diffs become a list, then every diff, then
  // the suggestions file goes (it can be rebuilt by running the review again).
  const build = ({ approvedFull, othersFull, withJson }) => {
    const parts = [...head];
    for (const v of ['reject', 'unsure']) {
      const group = rows.filter(r => verdictOf(r.s) === v);
      if (!group.length) continue;
      parts.push(`### ${VERDICTS[v].icon} ${VERDICTS[v].label} (${group.length})`, '');
      if (othersFull) for (const { diff, s } of group) parts.push(diffSection(diff, s));
      else parts.push(...group.map(({ diff, s }) => diffLine(diff, s)), '');
    }
    const approved = rows.filter(r => verdictOf(r.s) === 'approve');
    if (approved.length) {
      parts.push(`<details><summary><b>${VERDICTS.approve.icon} ${VERDICTS.approve.label} (${approved.length})</b></summary>`, '');
      if (approvedFull) for (const { diff, s } of approved) parts.push(diffSection(diff, s));
      else parts.push(...approved.map(({ diff, s }) => diffLine(diff, s)), '');
      parts.push('</details>', '');
    }
    parts.push(...howTo);
    if (withJson) parts.push(...json);
    else parts.push('_The suggestions file is too long for a comment: run `/diffscope:review` on this branch to get it._', '');
    return [...parts, ...footer].join('\n');
  };

  const modes = [
    { approvedFull: true, othersFull: true, withJson: true },
    { approvedFull: false, othersFull: true, withJson: true },
    { approvedFull: false, othersFull: false, withJson: true },
    { approvedFull: false, othersFull: false, withJson: false },
  ];
  for (const mode of modes) {
    const body = build(mode);
    if (body.length <= MAX_COMMENT) return { body, merge, counts };
  }
  throw new Error('The review is too long for a GitHub comment, even as a plain list of diffs.');
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
  if (!manifestPath) throw new Error('Usage: node publish-review.mjs <manifest.json> [--repo <owner/name>] [--dry-run]');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!fs.existsSync(manifest.suggestionsPath)) throw new Error(`Suggestions file not found: ${manifest.suggestionsPath}`);
  const suggestions = JSON.parse(fs.readFileSync(manifest.suggestionsPath, 'utf8'));

  const number = suggestions.pullRequest?.number;
  if (!number) throw new Error('The suggestions file has no pullRequest.number: there is no pull request to comment on.');
  if (!suggestions.run?.url || typeof suggestions.commit !== 'string') {
    throw new Error('The suggestions file has no run or commit: only reviews of a CI report are posted on the pull request.');
  }
  const repo = args.repo
    || suggestions.pullRequest.url?.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1]
    || gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');

  if (args.dryRun) {
    const { body } = renderComment({ manifest, suggestions });
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

  const { body, merge, counts } = renderComment({ manifest, suggestions, prHead });
  const comment = upsertComment(repo, number, body);

  console.log(JSON.stringify({
    comment: comment.url,
    updated: comment.updated,
    reviewedCommit: suggestions.commit,
    prHead,
    // true when the PR got new commits after the reviewed one.
    stale: suggestions.commit !== prHead,
    merge: merge.verdict,
    counts,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`publish-review: ${err.message}`);
  process.exit(1);
}
