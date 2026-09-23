/**
 * Zip a Playwright report directory (default: playwright-report/) into a .zip
 * (default: playwright-report.zip), with the report files at the zip root.
 *
 * Usage: node scripts/zip-report.mjs [reportDir] [zipPath]
 *
 * Cross-platform replacement for:
 *   cd playwright-report && zip -r ../playwright-report.zip . && cd ..
 *
 * On Windows it uses the bsdtar shipped with Windows (System32\tar.exe) rather
 * than PowerShell's Compress-Archive, which writes backslash path separators
 * that zip readers (Diffscope included) don't understand. The zip CLI is used
 * everywhere else, so no extra npm dependencies are needed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const reportDir = resolve(process.argv[2] ?? "playwright-report");
const zipPath = resolve(process.argv[3] ?? "playwright-report.zip");

if (!existsSync(reportDir)) {
  console.error(`${reportDir} not found – nothing to zip.`);
  process.exit(1);
}

rmSync(zipPath, { force: true });
const entries = readdirSync(reportDir);

if (process.platform === "win32") {
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  execFileSync(tar, ["-a", "-cf", zipPath, ...entries], { cwd: reportDir, stdio: "inherit" });
} else {
  execFileSync("zip", ["-r", zipPath, ...entries], { cwd: reportDir, stdio: "inherit" });
}

console.log(`Wrote ${zipPath}`);
