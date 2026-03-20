import { useRef, useCallback, useEffect, useState } from 'react';
import type { DiffEntry } from '@/lib/types';

interface SliderViewProps {
  diff: DiffEntry;
}

export function SliderView({ diff }: SliderViewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const actualRef = useRef<HTMLImageElement>(null);
  const expectedRef = useRef<HTMLImageElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pct, setPct] = useState(50);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  const updateSize = useCallback(() => {
    const actual = actualRef.current;
    const outer = outerRef.current;
    if (!actual || !outer || !actual.naturalWidth) return;
    const scale = Math.min(1, outer.clientWidth / actual.naturalWidth);
    const w = Math.round(actual.naturalWidth * scale);
    const h = Math.round(actual.naturalHeight * scale);
    setImgSize({ w, h });
  }, []);

  useEffect(() => {
    setPct(50);
    setImgSize(null);
  }, [diff.id]);

  const handleMove = useCallback((clientX: number) => {
    const actual = actualRef.current;
    if (!actual) return;
    const rect = actual.getBoundingClientRect();
    const newPct = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    setPct(newPct);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [dragging, handleMove]);

  return (
    <div
      ref={outerRef}
      className="flex-1 overflow-auto relative min-h-0 select-none cursor-col-resize"
      onMouseDown={(e) => {
        setDragging(true);
        handleMove(e.clientX);
        e.preventDefault();
      }}
      onTouchStart={(e) => {
        setDragging(true);
        handleMove(e.touches[0].clientX);
      }}
    >
      <div className="relative leading-none">
        <img
          ref={actualRef}
          src={diff.actualBlob || ''}
          alt="actual"
          onLoad={updateSize}
          style={imgSize ? { width: imgSize.w, height: imgSize.h } : undefined}
          className="block"
        />
        <img
          ref={expectedRef}
          src={diff.expectedBlob || ''}
          alt="expected"
          style={{
            ...(imgSize ? { width: imgSize.w, height: imgSize.h } : {}),
            clipPath: `inset(0 ${100 - pct}% 0 0)`,
          }}
          className="block absolute top-0 left-0 z-[1]"
        />
        {/* Divider */}
        <div
          ref={dividerRef}
          className="absolute top-0 bottom-0 w-[3px] bg-white z-10 pointer-events-none"
          style={{
            left: imgSize ? `${imgSize.w * pct / 100}px` : `${pct}%`,
            boxShadow: '0 0 6px rgba(0,0,0,0.7)',
          }}
        >
          <div className="sticky top-1/2 -translate-x-1/2 bg-white text-gray-700 text-[10px] px-1.5 py-0.5 rounded w-fit mx-auto shadow">
            ◀▶
          </div>
        </div>
        {/* Labels */}
        <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded z-[9] pointer-events-none bg-blue-500/90 text-white">
          EXPECTED
        </span>
        <span className="absolute top-2 right-2 text-[11px] font-bold px-2 py-0.5 rounded z-[9] pointer-events-none bg-red-500/90 text-white">
          ACTUAL
        </span>
      </div>
    </div>
  );
}
