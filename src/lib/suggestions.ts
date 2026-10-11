import type { AiCategory, AiConfidence, AiReportMismatch, AiSuggestion, AiSuggestions, AiVerdict, DiffEntry } from './types';

const VERDICTS: AiVerdict[] = ['approve', 'reject', 'unsure'];
const CATEGORIES: AiCategory[] = ['intended', 'regression', 'noise', 'unknown'];
const CONFIDENCES: AiConfidence[] = ['high', 'medium', 'low'];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * Parse a `diffscope-suggestions.json` file produced by the Claude Code plugin
 * (see plugin/skills/review/SKILL.md for the format).
 */
export function parseSuggestionsFile(text: string): AiSuggestions {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }

  const file = data as Record<string, unknown>;
  if (file?.format !== 'diffscope-suggestions' || !Array.isArray(file.suggestions)) {
    throw new Error('Not a Diffscope suggestions file (expected "format": "diffscope-suggestions").');
  }
  if (file.version !== 1) {
    throw new Error(`Unsupported suggestions file version: ${String(file.version)}.`);
  }

  const byId: Record<string, AiSuggestion> = {};
  for (const raw of file.suggestions as Record<string, unknown>[]) {
    if (typeof raw?.id !== 'string') continue;
    byId[raw.id] = {
      id: raw.id,
      snapshot: optionalString(raw.snapshot),
      project: optionalString(raw.project),
      verdict: pick(raw.verdict, VERDICTS, 'unsure'),
      category: pick(raw.category, CATEGORIES, 'unknown'),
      confidence: pick(raw.confidence, CONFIDENCES, 'low'),
      summary: optionalString(raw.summary) ?? '',
      details: optionalString(raw.details),
      relatedFiles: Array.isArray(raw.relatedFiles)
        ? raw.relatedFiles.filter((f): f is string => typeof f === 'string')
        : undefined,
      group: optionalString(raw.group),
    };
  }

  return {
    summary: optionalString(file.summary),
    generatedAt: optionalString(file.generatedAt),
    byId,
    reportDiffs: parseReportDiffs(file.report),
  };
}

// The `report` fingerprint written by the plugin (build-html-report.mjs):
// { diffs: { <id>: <changed pixels or null> } }.
function parseReportDiffs(report: unknown): Record<string, number | null> | undefined {
  const diffs = (report as Record<string, unknown> | null)?.diffs;
  if (!diffs || typeof diffs !== 'object') return undefined;
  const out: Record<string, number | null> = {};
  for (const [id, pixels] of Object.entries(diffs)) out[id] = typeof pixels === 'number' ? pixels : null;
  return out;
}

/**
 * Compares the report Claude reviewed with the loaded one. Diff ids only depend
 * on the test and the snapshot, so a review of another run of the same tests
 * matches every id: the changed pixel counts tell the screenshots apart.
 * Returns null when they match, or when the file has no fingerprint.
 */
export function checkReportMatch(
  diffs: DiffEntry[],
  ai: AiSuggestions,
  pixelCounts: Record<string, number | null>,
): AiReportMismatch | null {
  const reviewed = ai.reportDiffs;
  if (!reviewed) return null;
  const name = (snapshot?: string, project?: string) => [snapshot, project].filter(Boolean).join(' · ');
  const loaded = new Set(diffs.map(d => d.id));

  const mismatch: AiReportMismatch = {
    missing: Object.keys(reviewed).filter(id => !loaded.has(id))
      .map(id => name(ai.byId[id]?.snapshot, ai.byId[id]?.project) || id),
    unreviewed: diffs.filter(d => !(d.id in reviewed)).map(d => name(d.baseName, d.project)),
    changed: diffs.filter(d => {
      const theirs = reviewed[d.id];
      const ours = pixelCounts[d.id];
      return theirs != null && ours != null && theirs !== ours;
    }).map(d => name(d.baseName, d.project)),
  };
  return mismatch.missing.length || mismatch.unreviewed.length || mismatch.changed.length ? mismatch : null;
}
