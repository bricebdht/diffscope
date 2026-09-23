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
export function AiVerdictBadge({ verdict, label, className }: {
  verdict: AiVerdict;
  label?: string;
  className?: string;
}) {
  const Icon = ICONS[verdict];
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] font-medium', STYLES[verdict], className)}>
      <Sparkles className="h-2.5 w-2.5" />
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
