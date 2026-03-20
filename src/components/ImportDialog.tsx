import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '@/store/review-store';
import { parsePlaywrightReport } from '@/lib/report-parser';
import { Upload, FolderOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { setDiffs, clearReport } = useReviewStore();

  const processFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    setError(null);
    setProgress('Looking for index.html...');

    try {
      // Find index.html
      const indexFile = files.find(f => {
        const rp = f.webkitRelativePath || f.name;
        return rp === 'index.html' || rp.endsWith('/index.html');
      });

      if (!indexFile) {
        throw new Error('index.html not found. Please drop the playwright-report folder or select the index.html file.');
      }

      setProgress('Parsing report...');
      clearReport();
      const diffs = await parsePlaywrightReport(indexFile);
      setProgress(`Found ${diffs.length} diffs`);
      setDiffs(diffs);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setLoading(false);
      setProgress('');
    }
  }, [setDiffs, clearReport, onClose]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const items = e.dataTransfer.items;
    if (!items) return;

    // Collect all files via webkitGetAsEntry traversal
    const entries = Array.from(items)
      .map(i => i.webkitGetAsEntry?.())
      .filter((e): e is FileSystemEntry => e != null);

    if (entries.length === 0) {
      // Fallback to regular files
      const files = Array.from(e.dataTransfer.files);
      await processFiles(files);
      return;
    }

    setLoading(true);
    setProgress('Reading files...');
    const allFiles: File[] = [];

    async function traverse(entry: FileSystemEntry, _prefix: string) {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        await new Promise<void>(resolve => fileEntry.file(f => {
          allFiles.push(f);
          resolve();
        }));
      } else if (entry.isDirectory) {
        const dirEntry = entry as FileSystemDirectoryEntry;
        const reader = dirEntry.createReader();
        await new Promise<void>(resolve => reader.readEntries(async entries => {
          for (const e of entries) await traverse(e, _prefix + entry.name + '/');
          resolve();
        }));
      }
    }

    try {
      for (const e of entries) await traverse(e, '');
      await processFiles(allFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setLoading(false);
      setProgress('');
    }
  }, [processFiles]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-xl p-7 w-[min(480px,90vw)] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Import Playwright Report</h2>
          {!loading && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Drop your <code className="bg-muted px-1 py-0.5 rounded text-xs">playwright-report</code> folder below,
          or select the <code className="bg-muted px-1 py-0.5 rounded text-xs">index.html</code> file directly.
        </p>

        {/* Drop zone */}
        {!loading && (
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all',
              dragOver
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border text-muted-foreground hover:border-muted-foreground'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => folderInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <div className="font-medium text-sm mb-1">Drop folder here</div>
            <div className="text-xs">
              or{' '}
              <button
                className="text-primary underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                browse for index.html
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col gap-2 items-center py-6">
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
            </div>
            <span className="text-xs text-muted-foreground">{progress}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => {
              clearReport();
              onClose();
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Clear report
          </Button>
        </div>

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".html"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is not in React types
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
    </div>
  );
}
