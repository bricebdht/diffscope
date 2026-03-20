import { Badge } from '@/components/ui/badge';
import { useReviewStore } from '@/store/review-store';
import type { DiffEntry } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Check, X, Smartphone } from 'lucide-react';

interface DiffCardProps {
  diff: DiffEntry;
  onClick: () => void;
}

export function DiffCard({ diff, onClick }: DiffCardProps) {
  const getStatus = useReviewStore(s => s.getStatus);
  const status = getStatus(diff.id);

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5',
        'bg-card',
        status === 'approved' && 'border-green-800 hover:border-green-500',
        status === 'changes' && 'border-red-900 hover:border-red-500',
        status === 'pending' && 'border-border hover:border-primary',
      )}
    >
      {/* Status dot */}
      <div className={cn(
        'absolute top-1.5 left-1.5 z-10 h-2 w-2 rounded-full',
        status === 'approved' && 'bg-green-500',
        status === 'changes' && 'bg-red-500',
        status === 'pending' && 'bg-yellow-500',
      )} />

      {/* Thumbnail */}
      <div className="relative h-[140px] overflow-hidden bg-muted flex items-start justify-center">
        {diff.thumbBlob ? (
          <img
            src={diff.thumbBlob}
            alt={diff.description}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="text-muted-foreground p-5 text-xs">No screenshot</div>
        )}

        {/* Diff badge */}
        {diff.hasDiff && (
          <span className="absolute top-1 left-6 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            DIFF
          </span>
        )}

        {/* Status badge */}
        {status === 'approved' && (
          <span className="absolute bottom-1 right-1 bg-green-500 text-white rounded p-0.5">
            <Check className="h-3 w-3" />
          </span>
        )}
        {status === 'changes' && (
          <span className="absolute bottom-1 right-1 bg-red-500 text-white rounded p-0.5">
            <X className="h-3 w-3" />
          </span>
        )}

        {/* Mobile badge */}
        {diff.viewport === 'phone' && (
          <span className="absolute top-1 right-1 bg-black/70 text-muted-foreground rounded p-0.5">
            <Smartphone className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-2">
        <div className="text-xs font-medium truncate">{diff.description}</div>
        <div className="flex items-center gap-1 flex-wrap mt-1">
          {diff.viewport === 'phone' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-purple-950 text-purple-300">
              mobile
            </Badge>
          )}
          {diff.pixelCount != null && (
            <span className="text-[10px] font-semibold text-red-400">
              {diff.pixelCount.toLocaleString()} px
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
