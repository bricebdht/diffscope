import type { AiCategory, AiConfidence, AiSuggestion, AiSuggestions, AiVerdict } from './types';

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
  };
}
