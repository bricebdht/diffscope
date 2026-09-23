import { useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '@/store/review-store';
import { parseSuggestionsFile } from '@/lib/suggestions';

/**
 * Imports the diffscope-suggestions.json written by the Claude Code plugin
 * (`/diffscope:review`), or clears the current suggestions.
 */
export function AiSuggestionsButton() {
  const { diffs, aiSuggestions, setAiSuggestions } = useReviewStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  if (diffs.length === 0) return null;

  const matched = aiSuggestions ? diffs.filter(d => aiSuggestions.byId[d.id]).length : 0;

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const ai = parseSuggestionsFile(await file.text());
      if (!diffs.some(d => ai.byId[d.id])) {
        throw new Error('None of these suggestions match the diffs of the loaded report.');
      }
      setAiSuggestions(ai);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the suggestions file.');
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-xs text-red-400 max-w-[260px] truncate" title={error}>{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        className="gap-1.5 text-xs"
        title="Import the diffscope-suggestions.json written by the Claude Code plugin (/diffscope:review)"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {aiSuggestions ? `AI suggestions ${matched}/${diffs.length}` : 'AI suggestions'}
      </Button>
      {aiSuggestions && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => { setError(null); setAiSuggestions(null); }}
          title="Remove AI suggestions"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
