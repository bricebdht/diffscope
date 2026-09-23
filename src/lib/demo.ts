import { parsePlaywrightZip, withPixelCounts } from './report-parser';
import { parseSuggestionsFile } from './suggestions';
import type { AiSuggestions, DiffEntry } from './types';

// Built by `npm run demo` in test-fixture/ (see test-fixture/scripts/build-demo.mjs).
const DEMO_DIR = `${import.meta.env.BASE_URL}demo/`;

/** Loads the sample report shipped in public/demo/, with its Claude review. */
export async function loadDemoReport(): Promise<{ diffs: DiffEntry[]; suggestions: AiSuggestions | null }> {
  const [zipRes, suggestionsRes] = await Promise.all([
    fetch(`${DEMO_DIR}playwright-report.zip`),
    fetch(`${DEMO_DIR}diffscope-suggestions.json`),
  ]);
  if (!zipRes.ok) throw new Error(`Could not download the sample report (HTTP ${zipRes.status}).`);

  const zip = new File([await zipRes.blob()], 'playwright-report.zip', { type: 'application/zip' });
  const diffs = await withPixelCounts(await parsePlaywrightZip(zip));
  const suggestions = suggestionsRes.ok ? parseSuggestionsFile(await suggestionsRes.text()) : null;
  return { diffs, suggestions };
}
