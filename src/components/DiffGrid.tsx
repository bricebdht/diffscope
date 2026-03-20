import { useReviewStore } from '@/store/review-store';
import { DiffCard } from './DiffCard';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DiffEntry } from '@/lib/types';

function SuiteGroup({ suite, items, onCardClick }: {
  suite: string;
  items: DiffEntry[];
  onCardClick: (diff: DiffEntry) => void;
}) {
  const label = suite;
  return (
    <div className="mb-7">
      <div className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        {label}
        <span className="text-xs text-muted-foreground/60 font-normal">{items.length}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
        {items.map(d => (
          <DiffCard key={d.id} diff={d} onClick={() => onCardClick(d)} />
        ))}
      </div>
    </div>
  );
}

export function DiffGrid() {
  const { diffs, filteredDiffs, openModal, getStatus, reviewedSectionOpen, toggleReviewedSection } = useReviewStore();

  if (diffs.length === 0) return null;

  const pending = filteredDiffs.filter(d => getStatus(d.id) === 'pending');
  const reviewed = filteredDiffs.filter(d => getStatus(d.id) !== 'pending');

  const handleCardClick = (diff: DiffEntry) => {
    const idx = filteredDiffs.findIndex(d => d.id === diff.id);
    if (idx !== -1) openModal(idx);
  };

  if (pending.length === 0 && reviewed.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground mb-2">No items match filters</h2>
        <p className="text-sm">Try clearing your filters.</p>
      </div>
    );
  }

  // Group pending items by suite
  const pendingBySuite: Record<string, DiffEntry[]> = {};
  for (const d of pending) {
    if (!pendingBySuite[d.suite]) pendingBySuite[d.suite] = [];
    pendingBySuite[d.suite].push(d);
  }

  return (
    <div className="p-4">
      {pending.length === 0 && reviewed.length > 0 ? (
        <div className="text-center py-10 pb-4">
          <h2 className="text-lg font-semibold text-green-500 mb-1">All caught up!</h2>
          <p className="text-sm text-muted-foreground">{reviewed.length} item{reviewed.length !== 1 ? 's' : ''} reviewed.</p>
        </div>
      ) : (
        Object.keys(pendingBySuite).map(suite => (
            <SuiteGroup key={suite} suite={suite} items={pendingBySuite[suite]} onCardClick={handleCardClick} />
        ))
      )}

      {reviewed.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <button
            onClick={toggleReviewedSection}
            className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer w-full"
          >
            <span>Reviewed</span>
            <span className="text-xs text-muted-foreground/60">{reviewed.length} item{reviewed.length !== 1 ? 's' : ''}</span>
            <span className="ml-auto">
              {reviewedSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {reviewedSectionOpen && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 pt-3">
              {reviewed.map(d => (
                <DiffCard key={d.id} diff={d} onClick={() => handleCardClick(d)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
