import { useRef, useCallback, useEffect } from 'react';
import type { DiffEntry } from '@/lib/types';

interface SideBySideViewProps {
  diff: DiffEntry;
}

export function SideBySideView({ diff }: SideBySideViewProps) {
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const syncing = useRef(false);

  const handleScroll = useCallback((sourceIdx: number) => {
    if (syncing.current) return;
    syncing.current = true;
    const source = panelRefs.current[sourceIdx];
    if (source) {
      for (let i = 0; i < panelRefs.current.length; i++) {
        if (i !== sourceIdx && panelRefs.current[i]) {
          panelRefs.current[i]!.scrollTop = source.scrollTop;
        }
      }
    }
    syncing.current = false;
  }, []);

  useEffect(() => {
    // Reset scroll positions when diff changes
    for (const panel of panelRefs.current) {
      if (panel) panel.scrollTop = 0;
    }
  }, [diff.id]);

  const setRef = (idx: number) => (el: HTMLDivElement | null) => {
    panelRefs.current[idx] = el;
  };

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Expected */}
      <div
        ref={setRef(0)}
        onScroll={() => handleScroll(0)}
        className="flex-1 overflow-auto relative min-w-0"
      >
        <div className="sticky top-0 z-[5] text-[11px] font-bold py-0.5 text-center bg-blue-500/90 text-white">
          EXPECTED
        </div>
        {diff.expectedBlob ? (
          <img src={diff.expectedBlob} alt="expected" className="block w-full h-auto" />
        ) : (
          <div className="p-4 text-xs text-muted-foreground text-center">No expected image</div>
        )}
      </div>

      {/* Actual */}
      <div
        ref={setRef(1)}
        onScroll={() => handleScroll(1)}
        className="flex-1 overflow-auto relative min-w-0 border-l border-border"
      >
        <div className="sticky top-0 z-[5] text-[11px] font-bold py-0.5 text-center bg-red-500/90 text-white">
          ACTUAL
        </div>
        {diff.actualBlob ? (
          <img src={diff.actualBlob} alt="actual" className="block w-full h-auto" />
        ) : (
          <div className="p-4 text-xs text-muted-foreground text-center">No actual image</div>
        )}
      </div>

      {/* Diff */}
      {diff.hasDiff && diff.diffBlob && (
        <div
          ref={setRef(2)}
          onScroll={() => handleScroll(2)}
          className="flex-1 overflow-auto relative min-w-0 border-l border-border"
        >
          <div className="sticky top-0 z-[5] text-[11px] font-bold py-0.5 text-center bg-yellow-500/90 text-gray-900">
            DIFF
          </div>
          <img src={diff.diffBlob} alt="diff" className="block w-full h-auto" />
        </div>
      )}
    </div>
  );
}
