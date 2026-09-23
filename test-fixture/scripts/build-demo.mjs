/**
 * Builds the sample report behind Diffscope's "Try with a sample report" button:
 * runs the dashboard spec (baseline, then with the injected CSS changes) and
 * zips the HTML report into ../public/demo/playwright-report.zip.
 *
 * Only index.html and data/ are kept: Diffscope doesn't need the trace viewer.
 * Local absolute paths (in error stack traces) are made relative, since the
 * demo is public.
 *
 * The demo's Claude review (../public/demo/diffscope-suggestions.json) is not
 * generated here: it comes from reviewing this report with /diffscope:review.
 * Diff ids depend on Playwright's testId (spec file, test title, project), so it
 * keeps matching as long as the dashboard tests and projects aren't renamed.
 */
import { execSync, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeReport } from "./sanitize-report.mjs";

const SPEC = "e2e/dashboard.spec.ts";
const demoDir = resolve("..", "public", "demo");
const stagingDir = resolve("test-results", "demo-report");

execSync(`npx playwright test ${SPEC} --update-snapshots`, { stdio: "inherit" });

try {
  execSync(`npx playwright test ${SPEC} --reporter=html`, {
    stdio: "inherit",
    env: { ...process.env, GENERATE_DIFFS: "true", PLAYWRIGHT_HTML_OPEN: "never" },
  });
} catch {
  // Expected – the tests fail on purpose to produce diff artifacts.
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(resolve("playwright-report", "index.html"), resolve(stagingDir, "index.html"));
cpSync(resolve("playwright-report", "data"), resolve(stagingDir, "data"), { recursive: true });
sanitizeReport(stagingDir, process.cwd());

mkdirSync(demoDir, { recursive: true });
execFileSync(process.execPath, ["scripts/zip-report.mjs", stagingDir, resolve(demoDir, "playwright-report.zip")], {
  stdio: "inherit",
});
