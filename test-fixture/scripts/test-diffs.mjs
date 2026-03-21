/**
 * Run Playwright tests in diff-generation mode.
 * Sets GENERATE_DIFFS=true and swallows the expected non-zero exit code
 * (tests intentionally fail because screenshots diverge from baselines).
 *
 * Cross-platform replacement for:
 *   GENERATE_DIFFS=true npx playwright test --reporter=html || true
 */
import { execSync } from "node:child_process";

try {
  execSync("npx playwright test --reporter=html", {
    stdio: "inherit",
    env: { ...process.env, GENERATE_DIFFS: "true" },
  });
} catch {
  // Expected – the tests fail on purpose to produce diff artifacts.
}
