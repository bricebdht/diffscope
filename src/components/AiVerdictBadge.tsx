import { Check, HelpCircle, Sparkles, X } from 'lucide-react';
import type { AiVerdict } from '@/lib/types';
import { cn } from '@/lib/utils';

const STYLES: Record<AiVerdict, string> = {
  approve: 'bg-green-950 text-green-300 border-green-800',
  reject: 'bg-red-950 text-red-300 border-red-800',
  unsure: 'bg-amber-950 text-amber-300 border-amber-800',
};

const ICONS = { approve: Check, reject: X, unsure: HelpCircle };

/** Compact marker for Claude's suggested verdict. */
export function AiVerdictBadge({ verdict, label, size = 'sm', className }: {
  verdict: AiVerdict;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const Icon = ICONS[verdict];
  const icon = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border font-medium',
        size === 'md' ? 'px-1.5 py-0.5 text-sm' : 'px-1 py-0.5 text-xs',
        STYLES[verdict],
        className,
      )}
    >
      <Sparkles className={icon} />
      <Icon className={icon} />
      {label}
    </span>
  );
}
