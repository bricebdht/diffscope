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

