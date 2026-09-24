import { useState } from 'react';
import { Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '@/store/review-store';
import { loadDemoReport } from '@/lib/demo';

export function EmptyState({ onImport }: { onImport: () => void }) {
  const { clearReport, setDiffs, setAiSuggestions } = useReviewStore();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryDemo = async () => {
    setLoadingDemo(true);
    setError(null);
    try {
      const { diffs, suggestions } = await loadDemoReport();
      clearReport();
      setDiffs(diffs);
      setAiSuggestions(suggestions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sample report.');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-5 max-w-md">
        <div className="mb-6 mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Upload className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No report loaded</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Import a Playwright HTML report to start reviewing visual diffs.
          Drop a <code className="bg-muted px-1 py-0.5 rounded text-xs">playwright-report</code> folder
          or a <code className="bg-muted px-1 py-0.5 rounded text-xs">.zip</code> archive.
          Everything stays in your browser.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onImport} className="gap-2">
            <Upload className="h-4 w-4" />
            Import report
          </Button>
          <Button variant="outline" onClick={tryDemo} disabled={loadingDemo} className="gap-2">
            {loadingDemo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Try with a sample report
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The sample is a small dashboard with 23 visual diffs, already pre-reviewed by Claude.
        </p>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
