/**
 * Zip the playwright-report/ directory into playwright-report.zip.
 *
 * Cross-platform replacement for:
 *   cd playwright-report && zip -r ../playwright-report.zip . && cd ..
 *
 * Uses PowerShell on Windows and the zip CLI everywhere else,
 * so no extra npm dependencies are needed.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const reportDir = resolve("playwright-report");
const zipPath = resolve("playwright-report.zip");

if (!existsSync(reportDir)) {
  console.error("playwright-report/ directory not found – nothing to zip.");
  process.exit(1);
}

if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${reportDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" },
  );
} else {
  execSync(`zip -r "${zipPath}" .`, {
    cwd: reportDir,
    stdio: "inherit",
  });
}
