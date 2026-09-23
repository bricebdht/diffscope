import type { AiCategory, AiConfidence, AiVerdict } from './types';

export const AI_VERDICT_LABELS: Record<AiVerdict, string> = {
  approve: 'Approve',
  reject: 'Needs Changes',
  unsure: 'Unsure',
};

export const AI_CATEGORY_LABELS: Record<AiCategory, string> = {
  intended: 'Intended change',
  regression: 'Likely regression',
  noise: 'Rendering noise',
  unknown: 'Unclear',
};

export const AI_CONFIDENCE_LABELS: Record<AiConfidence, string> = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence',
};
