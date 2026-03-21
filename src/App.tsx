import { useState } from 'react';
import { useReviewStore } from '@/store/review-store';
import { Header } from '@/components/Header';
import { FilterBar } from '@/components/FilterBar';
import { DiffGrid } from '@/components/DiffGrid';
import { ComparisonModal } from '@/components/ComparisonModal';
import { ImportDialog } from '@/components/ImportDialog';
import { EmptyState } from '@/components/EmptyState';

function App() {
  const [importOpen, setImportOpen] = useState(false);
  const diffs = useReviewStore(s => s.diffs);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <Header onImportClick={() => setImportOpen(true)} />
      <FilterBar />
      {diffs.length === 0 ? (
        <EmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <div className="flex-1 overflow-auto">
          <DiffGrid />
        </div>
      )}
      <ComparisonModal />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

export default App;
