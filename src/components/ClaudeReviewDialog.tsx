import { useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, FileJson, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '@/store/review-store';
import { checkReportMatch, parseSuggestionsFile } from '@/lib/suggestions';
import { computePixelCount } from '@/lib/report-parser';
import { AI_VERDICT_LABELS } from '@/lib/ai-labels';
import type { AiReportMismatch, AiVerdict } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AiVerdictBadge } from './AiVerdictBadge';

const SUGGESTIONS_FILE = 'diffscope-suggestions.json';

const SETUP_STEPS = [
  {
    title: 'Install the plugin in Claude Code (once)',
    commands: ['/plugin marketplace add bricebdht/diffscope', '/plugin install diffscope@diffscope'],
  },
  {
    title: 'In your project, on the branch to review, run',
    commands: ['/diffscope:review'],
    note: `Claude downloads the Playwright report of the branch's latest CI run (or pass a local report path), reviews every diff against your code changes, opens an HTML summary and writes ${SUGGESTIONS_FILE} next to the report.`,
  },
];

// Singular and plural forms.
const MISMATCH_LABELS: Record<keyof AiReportMismatch, [string, string]> = {
  changed: ['has other screenshots than the one Claude reviewed', 'have other screenshots than the ones Claude reviewed'],
  unreviewed: ["wasn't reviewed by Claude", "weren't reviewed by Claude"],
  missing: ['was reviewed by Claude but is not in this report', 'were reviewed by Claude but are not in this report'],
};
const MAX_NAMES = 3;

/** Warns that the suggestions were written for another report (or another run). */
function MismatchWarning({ mismatch }: { mismatch: AiReportMismatch }) {
  return (
    <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-amber-300 mb-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Claude reviewed another report
      </p>
      <p className="text-xs text-muted-foreground mb-2">
        Its verdicts may not apply to these screenshots. Check that the report and the suggestions come from the same CI run.
      </p>
      <ul className="list-disc pl-5 space-y-1 text-xs">
        {(Object.keys(MISMATCH_LABELS) as (keyof AiReportMismatch)[]).filter(k => mismatch[k].length).map(k => (
          <li key={k}>
            {mismatch[k].length} diff{mismatch[k].length === 1 ? '' : 's'} {MISMATCH_LABELS[k][mismatch[k].length === 1 ? 0 : 1]}:{' '}
            <span className="text-muted-foreground">
              {mismatch[k].slice(0, MAX_NAMES).join(', ')}
              {mismatch[k].length > MAX_NAMES && ` and ${mismatch[k].length - MAX_NAMES} more`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: the command stays selectable
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1.5">
      <code className="flex-1 text-xs font-mono select-all">{command}</code>
      <button
        type="button"
        onClick={copy}
        className="text-muted-foreground hover:text-foreground cursor-pointer"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Explains the Claude Code plugin and imports the suggestions file it writes
 * (`/diffscope:review`), or shows and clears the loaded suggestions.
 */
export function ClaudeReviewDialog() {
  const { diffs, aiSuggestions, setAiSuggestions } = useReviewStore();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // The suggestions copied from the review comment on the pull request.
  const [pasted, setPasted] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (diffs.length === 0) return null;

  const withSuggestion = aiSuggestions ? diffs.filter(d => aiSuggestions.byId[d.id]) : [];
  const counts: Record<AiVerdict, number> = { reject: 0, unsure: 0, approve: 0 };
  for (const d of withSuggestion) counts[aiSuggestions!.byId[d.id].verdict]++;

  const importText = async (text: string) => {
    setError(null);
    try {
      const ai = parseSuggestionsFile(text);
      if (!diffs.some(d => ai.byId[d.id])) {
        throw new Error('None of these suggestions match the diffs of the loaded report. Was it generated from this report?');
      }
      // Pixel counts are filled in the background after the report loads: count
      // the ones that aren't there yet.
      const pixelCounts: Record<string, number | null> = {};
      if (ai.reportDiffs) {
        await Promise.all(diffs.map(async d => {
          pixelCounts[d.id] = d.pixelCount ?? await computePixelCount(d);
        }));
      }
      const mismatch = checkReportMatch(diffs, ai, pixelCounts);
      setAiSuggestions(mismatch ? { ...ai, mismatch } : ai);
      setPasted('');
      // Nothing left to do here unless the report doesn't match: the verdicts now show on the grid.
      if (!mismatch) setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the suggestions file.');
    }
  };
  const handleFile = async (file: File) => importText(await file.text());

  const dropZone = (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      className={cn(
        'rounded-lg border-2 border-dashed p-4 text-center transition-colors',
        dragOver ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <FileJson className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm mb-2">
        Drop <code className="text-xs font-mono">{SUGGESTIONS_FILE}</code> here
      </p>
      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" />
        {aiSuggestions ? 'Replace with another file' : 'Choose file'}
      </Button>
      <p className="mt-3 mb-1.5 text-xs text-muted-foreground">or paste it from the review comment on the pull request</p>
      <div className="flex gap-2">
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='{"format":"diffscope-suggestions",…}'
          rows={1}
          spellCheck={false}
          className="flex-1 min-w-0 resize-none rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs font-mono"
        />
        <Button size="sm" className="text-xs" disabled={!pasted.trim()} onClick={() => importText(pasted)}>
          Import
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn('gap-1.5 text-xs', aiSuggestions && 'border-violet-800 text-violet-300')}
            title="See Claude's pre-review of these diffs"
          />
        }
      >
        <Sparkles className="h-3.5 w-3.5" />
        {aiSuggestions ? `Claude review ${withSuggestion.length}/${diffs.length}` : 'Claude review'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Claude review
          </DialogTitle>
          <DialogDescription>
            Claude can pre-review every diff of this report, next to your branch's code changes, and
            suggest a verdict with an explanation. It only suggests: you still approve or reject each diff.
          </DialogDescription>
        </DialogHeader>

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

        {aiSuggestions ? (
          <div className="flex flex-col gap-4 text-sm">
            {aiSuggestions.mismatch && <MismatchWarning mismatch={aiSuggestions.mismatch} />}
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-medium mb-2">
                {withSuggestion.length} of {diffs.length} diffs have a suggestion
                {aiSuggestions.generatedAt && (
                  <span className="font-normal text-muted-foreground">
                    {' '}· generated {new Date(aiSuggestions.generatedAt).toLocaleString()}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(counts) as AiVerdict[]).map(v => (
                  <AiVerdictBadge key={v} verdict={v} label={`${counts[v]} ${AI_VERDICT_LABELS[v]}`} size="md" />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Where to find it</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>A badge with Claude's verdict on each card.</li>
                <li>Its explanation and related files at the top of the comparison view.</li>
                <li>The <span className="text-foreground">Claude</span> filter to show one verdict at a time.</li>
              </ul>
            </div>
            {dropZone}
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => { setAiSuggestions(null); setError(null); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove Claude's suggestions
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            <ol className="flex flex-col gap-3">
              {SETUP_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <p>{step.title}</p>
                    {step.commands.map(c => <CopyCommand key={c} command={c} />)}
                    {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
                  </div>
                </li>
              ))}
              <li className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  3
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p>Import the file here to see Claude's verdict on each diff</p>
                  {dropZone}
                </div>
              </li>
            </ol>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
