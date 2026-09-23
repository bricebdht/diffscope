import { FileCode } from 'lucide-react';
import type { AiSuggestion } from '@/lib/types';
import { AI_CATEGORY_LABELS, AI_CONFIDENCE_LABELS, AI_VERDICT_LABELS } from '@/lib/ai-labels';
import { AiVerdictBadge } from './AiVerdictBadge';

/** Claude's pre-review of the diff shown in the comparison modal. */
export function AiSuggestionPanel({ suggestion }: { suggestion: AiSuggestion }) {
  return (
    <div className="px-4 py-2 border-b border-border bg-muted/30 text-xs space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground">Claude suggests</span>
        <AiVerdictBadge verdict={suggestion.verdict} label={AI_VERDICT_LABELS[suggestion.verdict]} />
        <span className="text-muted-foreground">
          {AI_CATEGORY_LABELS[suggestion.category]} · {AI_CONFIDENCE_LABELS[suggestion.confidence]}
        </span>
        {suggestion.group && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {suggestion.group}
          </span>
        )}
      </div>
      {suggestion.summary && <p className="font-medium">{suggestion.summary}</p>}
      {suggestion.details && <p className="text-muted-foreground">{suggestion.details}</p>}
      {suggestion.relatedFiles && suggestion.relatedFiles.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-muted-foreground">
          <FileCode className="h-3 w-3" />
          {suggestion.relatedFiles.map(f => (
            <code key={f} className="rounded bg-muted px-1 py-0.5 text-[10px]">{f}</code>
          ))}
        </div>
      )}
    </div>
  );
}
