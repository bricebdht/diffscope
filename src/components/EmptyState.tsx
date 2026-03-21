import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState({ onImport }: { onImport: () => void }) {
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
        </p>
        <Button onClick={onImport} className="gap-2">
          <Upload className="h-4 w-4" />
          Import report
        </Button>
      </div>
    </div>
  );
}
