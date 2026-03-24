import { useEffect, useCallback, useState } from 'react';
import { useReviewStore } from '@/store/review-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SliderView } from './SliderView';
import { SideBySideView } from './SideBySideView';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Smartphone,
  Monitor,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ComparisonModal() {
  const {
    filteredDiffs,
    modalIndex,
    closeModal,
    navigate,
    compareMode,
    setCompareMode,
    setReview,
    getStatus,
    getComment,
  } = useReviewStore();

  const [comment, setComment] = useState('');
  const diff = modalIndex !== null ? filteredDiffs[modalIndex] : null;

  // Sync comment with store when diff changes
  useEffect(() => {
    if (diff) {
      setComment(getComment(diff.id));
    }
  }, [diff?.id, diff, getComment]);

  const handleReview = useCallback((status: 'approved' | 'changes') => {
    if (!diff) return;
    const reviewedId = diff.id;
    setReview(reviewedId, status, comment);

    // Read fresh state after the store update — filteredDiffs may have changed
    const store = useReviewStore.getState();
    const freshDiffs = store.filteredDiffs;
    const freshGetStatus = store.getStatus;

    // Find where the reviewed diff sits now (it may have been removed by the active filter)
    const currentIdx = freshDiffs.findIndex(d => d.id === reviewedId);

    // Search forward from the position after the reviewed diff (or from 0 if it was removed)
    const searchStart = currentIdx === -1 ? 0 : currentIdx + 1;

    let nextIdx = -1;
    // Forward scan
    for (let i = searchStart; i < freshDiffs.length; i++) {
      if (freshGetStatus(freshDiffs[i].id) === 'pending') { nextIdx = i; break; }
    }
    // Wrap-around scan
    if (nextIdx === -1) {
      const wrapEnd = currentIdx === -1 ? freshDiffs.length : currentIdx;
      for (let i = 0; i < wrapEnd; i++) {
        if (freshGetStatus(freshDiffs[i].id) === 'pending') { nextIdx = i; break; }
      }
    }

    if (nextIdx !== -1) {
      store.openModal(nextIdx);
    } else {
      closeModal();
    }
  }, [diff, comment, setReview, closeModal]);

  const handleSkip = useCallback(() => {
    navigate(1);
  }, [navigate]);

  // Keyboard
  useEffect(() => {
    if (!diff) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (isInput) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          navigate(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigate(1);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          handleReview('approved');
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          handleReview('changes');
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [diff, navigate, closeModal, handleReview]);

  if (!diff) return null;

  const status = getStatus(diff.id);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="bg-card border border-border rounded-xl w-[min(95vw,1200px)] max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap min-h-[52px]">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeModal}>
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold flex-1 min-w-0 truncate">{diff.description}</span>
          <div className="flex gap-1">
            <Badge variant="secondary" className="text-[10px]">{diff.suite}</Badge>
            <Badge variant="secondary" className="text-[10px]">
              {diff.viewport === 'phone' ? <Smartphone className="h-3 w-3 mr-0.5" /> : <Monitor className="h-3 w-3 mr-0.5" />}
              {diff.viewport === 'phone' ? 'Mobile' : 'Desktop'}
            </Badge>
            {diff.pixelCount != null && (
              <Badge variant="destructive" className="text-[10px]">{diff.pixelCount.toLocaleString()} px</Badge>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
              Prev
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(1)}>
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
        </div>

        {/* Comparison area */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Mode tabs */}
          <div className="flex border-b border-border px-4">
            <button
              className={cn(
                'px-3.5 py-1.5 text-xs cursor-pointer border-b-2 -mb-px transition-colors',
                compareMode === 'sidebyside'
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              )}
              onClick={() => setCompareMode('sidebyside')}
            >
              3-Panel
            </button>
            {diff.expectedBlob && (
              <button
                className={cn(
                  'px-3.5 py-1.5 text-xs cursor-pointer border-b-2 -mb-px transition-colors',
                  compareMode === 'slider'
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                )}
                onClick={() => setCompareMode('slider')}
              >
                Slider
              </button>
            )}
          </div>

          {/* View */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {compareMode === 'slider' && diff.expectedBlob ? (
              <SliderView diff={diff} />
            ) : (
              <SideBySideView diff={diff} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'gap-1 text-xs',
              status === 'approved'
                ? 'bg-green-900 border-green-700 text-green-300 hover:bg-green-800'
                : 'bg-green-950/50 border-green-900 text-green-400 hover:bg-green-900 hover:text-green-300'
            )}
            onClick={() => handleReview('approved')}
          >
            <Check className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'gap-1 text-xs',
              status === 'changes'
                ? 'bg-red-900 border-red-700 text-red-300 hover:bg-red-800'
                : 'bg-red-950/50 border-red-900 text-red-400 hover:bg-red-900 hover:text-red-300'
            )}
            onClick={() => handleReview('changes')}
          >
            <X className="h-3.5 w-3.5" />
            Needs Changes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground gap-1"
            onClick={handleSkip}
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip
          </Button>
          <Input
            type="text"
            placeholder="Comment (optional)..."
            className="flex-1 min-w-[150px] h-7 text-xs"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">A</kbd> approve
            <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">X</kbd> reject
            <kbd className="px-1 py-0.5 border border-border rounded text-[10px]">← →</kbd> navigate
          </div>
        </div>
      </div>
    </div>
  );
}
