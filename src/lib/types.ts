export interface DiffEntry {
  id: string;
  baseName: string;
  suite: string;
  viewport: 'desktop' | 'phone';
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
  verdict: AiVerdict;
  category: AiCategory;
  confidence: AiConfidence;
  summary: string;
  details?: string;
  relatedFiles?: string[];
  group?: string;
}

export interface AiSuggestions {
  summary?: string;
  generatedAt?: string;
  byId: Record<string, AiSuggestion>;
}
