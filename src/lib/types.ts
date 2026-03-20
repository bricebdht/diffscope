export interface DiffEntry {
  id: string;
  baseName: string;
  suite: string;
  retailer: string;
  viewport: 'desktop' | 'phone';
  description: string;
  index: string;
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

export const SUITES = [
  'full-pages',
  'challenges-components',
  'modals',
  'global-architecture',
] as const;

export const SUITE_LABELS: Record<string, string> = {
  'full-pages': 'Full Pages',
  'challenges-components': 'Challenges',
  'modals': 'Modals',
  'global-architecture': 'Architecture',
  'unknown': 'Other',
};

export const RETAILERS = [
  'default', 'cetoine', 'chondrus', 'shane', 'aran', 'pona', 'nix', 'stig', 'lynx',
] as const;
