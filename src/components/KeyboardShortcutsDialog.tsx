import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Keyboard } from 'lucide-react';

const shortcuts = [
  {
    category: 'Review',
    items: [
      { keys: ['A'], description: 'Approve the current diff' },
      { keys: ['X'], description: 'Reject the current diff' },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: ['←'], description: 'Previous diff' },
      { keys: ['→'], description: 'Next diff' },
      { keys: ['Esc'], description: 'Close the comparison view' },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 border border-border rounded bg-muted text-xs font-mono">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Keyboard shortcuts" />
        }
      >
        <Keyboard className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These shortcuts are available when the comparison view is open.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {group.category}
              </h3>
              <div className="flex flex-col gap-1.5">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <Kbd key={key}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
