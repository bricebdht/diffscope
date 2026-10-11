export interface DiffEntry {
  id: string;
  baseName: string;
  suite: string;
  /** Playwright project name, e.g. "chromium" or "Mobile Safari". */
  project: string;
  /** Guessed from the project name, to show a phone icon. */
  mobile: boolean;
  description: string;
  hasDiff: boolean;
  pixelCount: number | null;
  diffBlob: string | null;
  actualBlob: string | null;
  expectedBlob: string | null;
  thumbBlob: string | null;
}

export type ReviewStatus = 'pending' | 'approved' | 'changes';

export interface ReviewEntry {
  status: ReviewStatus;
  comment?: string;
  reviewedAt?: string;
}

export interface ReviewState {
  diffs: Record<string, ReviewEntry>;
  importedAt?: string;
}


export type AiVerdict = 'approve' | 'reject' | 'unsure';
export type AiCategory = 'intended' | 'regression' | 'noise' | 'unknown';
export type AiConfidence = 'high' | 'medium' | 'low';

/** A pre-review suggestion for one diff, written by the Claude Code plugin (plugin/). */
export interface AiSuggestion {
  id: string;
  /** Snapshot and project of the reviewed diff, as written in the file. */
  snapshot?: string;
  project?: string;
  verdict: AiVerdict;
  category: AiCategory;
  confidence: AiConfidence;
  summary: string;
  details?: string;
  relatedFiles?: string[];
  group?: string;
}

/** How the reviewed report differs from the loaded one: diff names in each list. */
export interface AiReportMismatch {
  /** Reviewed by Claude but not in the loaded report. */
  missing: string[];
  /** In the loaded report but not reviewed by Claude. */
  unreviewed: string[];
  /** In both, but with another number of changed pixels: other screenshots. */
  changed: string[];
}

export interface AiSuggestions {
  summary?: string;
  generatedAt?: string;
  byId: Record<string, AiSuggestion>;
  /** Changed pixel count of every diff of the reviewed report, when the file has it. */
  reportDiffs?: Record<string, number | null>;
  /** Set on import when the reviewed report isn't the loaded one. */
  mismatch?: AiReportMismatch;
}
