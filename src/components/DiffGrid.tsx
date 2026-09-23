import { useReviewStore } from '@/store/review-store';
import { DiffCard } from './DiffCard';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
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

function ReviewedSection({ label, labelClassName, items, open, onToggle, onCardClick }: {
  label: string;
  labelClassName: string;
  items: DiffEntry[];
  open: boolean;
  onToggle: () => void;
  onCardClick: (diff: DiffEntry) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6 border-t border-border pt-4">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer w-full"
      >
        <span className={labelClassName}>{label}</span>
        <span className="text-xs text-muted-foreground/60">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        <span className="ml-auto">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 pt-3">
          {items.map(d => (
            <DiffCard key={d.id} diff={d} onClick={() => onCardClick(d)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffGrid() {
  const {
    diffs,
    filteredDiffs,
    openModal,
    getStatus,
    rejectedSectionOpen,
    approvedSectionOpen,
    toggleRejectedSection,
    toggleApprovedSection,
    aiSuggestions,
  } = useReviewStore();

  if (diffs.length === 0) return null;

  const pending = filteredDiffs.filter(d => getStatus(d.id) === 'pending');
  const rejected = filteredDiffs.filter(d => getStatus(d.id) === 'changes');
  const approved = filteredDiffs.filter(d => getStatus(d.id) === 'approved');
  const reviewedCount = rejected.length + approved.length;

  const handleCardClick = (diff: DiffEntry) => {
    const idx = filteredDiffs.findIndex(d => d.id === diff.id);
    if (idx !== -1) openModal(idx);
  };

  if (pending.length === 0 && reviewedCount === 0) {
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
      {aiSuggestions?.summary && (
        <div className="mb-5 flex gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          <p><span className="font-medium">Claude's summary:</span> {aiSuggestions.summary}</p>
        </div>
      )}
      {pending.length === 0 && reviewedCount > 0 ? (
        <div className="text-center py-10 pb-4">
          <h2 className="text-lg font-semibold text-green-500 mb-1">All caught up!</h2>
          <p className="text-sm text-muted-foreground">{reviewedCount} item{reviewedCount !== 1 ? 's' : ''} reviewed.</p>
        </div>
      ) : (
        Object.keys(pendingBySuite).map(suite => (
            <SuiteGroup key={suite} suite={suite} items={pendingBySuite[suite]} onCardClick={handleCardClick} />
        ))
      )}

      <ReviewedSection
        label="Needs Changes"
        labelClassName="text-red-400"
        items={rejected}
        open={rejectedSectionOpen}
        onToggle={toggleRejectedSection}
        onCardClick={handleCardClick}
      />
      <ReviewedSection
        label="Approved"
        labelClassName="text-green-500"
        items={approved}
        open={approvedSectionOpen}
        onToggle={toggleApprovedSection}
        onCardClick={handleCardClick}
      />
    </div>
  );
}
