#!/usr/bin/env node
// Downloads the Playwright HTML report of the latest GitHub Actions run of a
// branch, using the GitHub CLI (gh). Prints a JSON summary with the local
// report folder, to pass to extract-report.mjs.
//
// Usage: node fetch-ci-report.mjs [--branch <name>] [--run <id>] [--artifact <name>]
//                                 [--repo <owner/name>] [--out <dir>]
//   --branch    defaults to the current git branch
//   --run       a specific workflow run instead of the latest one of the branch
//   --artifact  a specific artifact name instead of the auto-detected report
//   --repo      defaults to the repository of the current directory

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// How many recent runs of the branch to look through for a report artifact.
const RUN_LOOKBACK = 20;

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim();
    throw new Error(`${cmd} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

const gh = (...args) => run('gh', args);
const ghJson = (...args) => JSON.parse(gh(...args));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(branch|run|artifact|repo|out)$/);
    if (!m) throw new Error(`Unknown argument: ${argv[i]}`);
    args[m[1]] = argv[++i];
  }
  return args;
}

// Ranks artifact names: the merged HTML report first, never the raw blob reports
// that sharded runs upload before merging.
function reportScore(name) {
  const n = name.toLowerCase();
  if (n.includes('blob-report')) return 0;
  if (n === 'playwright-report') return 4;
  if (n.includes('playwright-report')) return 3;
  if (n.includes('html-report')) return 2;
  if (n.includes('playwright') || n.includes('report')) return 1;
  return 0;
}

function listArtifacts(repo, runId) {
  const res = ghJson('api', `repos/${repo}/actions/runs/${runId}/artifacts?per_page=100`);
  return (res.artifacts || [])
    .filter(a => !a.expired)
    .map(a => ({ name: a.name, size: a.size_in_bytes, score: reportScore(a.name) }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  try {
    gh('auth', 'status');
  } catch {
    throw new Error('The GitHub CLI (gh) is not installed or not logged in. Run `gh auth login` first.');
  }

  const repo = args.repo || gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
  const branch = args.branch || run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

  let runs;
  if (args.run) {
    runs = [ghJson('run', 'view', args.run, '--repo', repo, '--json', 'databaseId,headSha,headBranch,status,conclusion,workflowName,createdAt,url')];
  } else {
    runs = ghJson('run', 'list', '--repo', repo, '--branch', branch, '--limit', String(RUN_LOOKBACK),
      '--json', 'databaseId,headSha,headBranch,status,conclusion,workflowName,createdAt,url');
    if (runs.length === 0) throw new Error(`No workflow runs found for branch "${branch}" in ${repo}.`);
  }

  // Newest run first; skip runs still in progress (their artifacts may be incomplete).
  let picked = null;
  const inProgress = runs.filter(r => r.status !== 'completed');
  for (const r of runs.filter(r => r.status === 'completed')) {
    const artifacts = listArtifacts(repo, r.databaseId);
    const artifact = args.artifact
      ? artifacts.find(a => a.name === args.artifact)
      : artifacts.filter(a => a.score > 0).sort((a, b) => b.score - a.score)[0];
    if (artifact) {
      picked = { run: r, artifact, artifacts };
      break;
    }
  }

  if (!picked) {
    const what = args.artifact ? `an artifact named "${args.artifact}"` : 'a Playwright report artifact';
    const pending = inProgress.length ? ` ${inProgress.length} run(s) are still in progress.` : '';
    throw new Error(`No completed run of "${branch}" in ${repo} has ${what} (looked at the last ${runs.length} runs).${pending}`);
  }

  const { run: r, artifact } = picked;
  const out = path.resolve(args.out || path.join(os.tmpdir(), 'diffscope-ci', `${r.databaseId}-${artifact.name}`));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  gh('run', 'download', String(r.databaseId), '--repo', repo, '--name', artifact.name, '--dir', out);

  // The artifact may contain the report at its root or inside a subfolder.
  const findIndex = (dir, depth) => {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
    if (depth === 0) return null;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const found = findIndex(path.join(dir, entry.name), depth - 1);
      if (found) return found;
    }
    return null;
  };
  const reportDir = findIndex(out, 2);
  if (!reportDir) throw new Error(`Downloaded "${artifact.name}" to ${out} but found no index.html in it.`);

  let localHead = null;
  try {
    localHead = run('git', ['rev-parse', 'HEAD']);
  } catch {
    // not in a git repository
  }

  console.log(JSON.stringify({
    reportDir,
    repo,
    branch,
    run: {
      id: r.databaseId,
      workflow: r.workflowName,
      conclusion: r.conclusion,
      createdAt: r.createdAt,
      url: r.url,
      headSha: r.headSha,
    },
    artifact: artifact.name,
    otherArtifacts: picked.artifacts.filter(a => a.name !== artifact.name).map(a => a.name),
    // false when the run tested another commit than the local HEAD (e.g. new local commits).
    matchesLocalHead: localHead ? localHead === r.headSha : null,
    runsInProgress: inProgress.length,
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`fetch-ci-report: ${err.message}`);
  process.exit(1);
}
