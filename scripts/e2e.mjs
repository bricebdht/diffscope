// Runs the e2e tests against reference screenshots captured from the base branch,
// so no baseline image is ever committed (and the OS that renders them doesn't matter).
//
// Usage: node scripts/e2e.mjs [--base <ref>] [-- <playwright args>]
//   --base  the git ref to capture references from (default: origin/main)
//
// 1. Builds <base> in a temporary git worktree.
// 2. Runs this branch's tests against that build with --update-snapshots: the references.
// 3. Builds this branch and runs the tests again, comparing to the references.
// The tests always come from this branch, so a test added here gets its reference from <base> too.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const work = path.join(os.tmpdir(), 'diffscope-e2e-base');
const worktree = path.join(work, 'worktree');

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const ownArgs = sep === -1 ? argv : argv.slice(0, sep);
const playwrightArgs = sep === -1 ? [] : argv.slice(sep + 1);
const baseIdx = ownArgs.indexOf('--base');
const base = baseIdx === -1 ? 'origin/main' : ownArgs[baseIdx + 1];

function run(cmd, args, { cwd = root, env = {}, allowFail = false } = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}${cwd === root ? '' : `  (in ${cwd})`}`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (res.status !== 0 && !allowFail) {
    cleanup();
    process.exit(res.status ?? 1);
  }
  return res.status;
}

function cleanup() {
  // Unlink the shared node_modules first, so removing the worktree can't reach into ours.
  const nm = path.join(worktree, 'node_modules');
  try {
    if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm);
  } catch { /* not there */ }
  if (fs.existsSync(worktree)) {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'inherit' });
  }
  spawnSync('git', ['worktree', 'prune'], { cwd: root });
}

// --- 1. Build the base branch ----------------------------------------------
cleanup();
fs.mkdirSync(work, { recursive: true });
run('git', ['worktree', 'add', '--detach', `"${worktree}"`, base]);

const sameLock = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
  === fs.readFileSync(path.join(worktree, 'package-lock.json'), 'utf8');
if (sameLock) {
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(worktree, 'node_modules'), 'junction');
} else {
  run('npm', ['ci'], { cwd: worktree });
}
run('npm', ['run', 'build'], { cwd: worktree });

// --- 2. Capture the references from it ---------------------------------------
const snapshotDir = path.join(root, 'e2e-snapshots');
fs.rmSync(snapshotDir, { recursive: true, force: true });
const baseStatus = run('npx', ['playwright', 'test', '--update-snapshots=all', '--reporter=line', ...playwrightArgs], {
  allowFail: true,
  env: {
    E2E_APP_DIR: path.join(worktree, 'dist'),
    E2E_OUTPUT_DIR: path.join(work, 'test-results'),
    E2E_REPORT_DIR: path.join(work, 'playwright-report'),
  },
});
cleanup();
if (baseStatus !== 0) {
  // Usually a test this branch adds or changes that the base app can't pass yet.
  // Its screenshots that weren't captured show up as missing references below.
  console.warn(`\n⚠ Some tests failed against ${base}; their references may be missing.`);
}

// --- 3. Build this branch and compare -------------------------------------
run('npm', ['run', 'build']);
const status = run('npx', ['playwright', 'test', ...playwrightArgs], { allowFail: true });
process.exit(status ?? 1);
