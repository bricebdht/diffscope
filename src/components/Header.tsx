import { useReviewStore } from '@/store/review-store';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

export function Header({ onImportClick }: { onImportClick: () => void }) {
  const { diffs, getStats } = useReviewStore();
  const stats = getStats();
  const progress = stats.total > 0 ? ((stats.approved + stats.changes) / stats.total * 100) : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <h1 className="text-sm font-semibold whitespace-nowrap">Diffscope</h1>
        {diffs.length > 0 && (
          <>
            <div className="flex-1 min-w-[120px] h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {stats.approved + stats.changes}/{stats.total} reviewed
            </span>
          </>
        )}
        <KeyboardShortcutsDialog />
        <Button variant="outline" size="sm" onClick={onImportClick} className="gap-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" />
          Import report
        </Button>
      </div>
    </header>
  );
}
