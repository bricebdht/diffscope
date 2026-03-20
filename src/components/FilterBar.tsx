import { useReviewStore } from '@/store/review-store';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { SUITE_LABELS, RETAILERS } from '@/lib/types';

export function FilterBar() {
  const { filters, setFilter, clearFilters, getStats, diffs } = useReviewStore();
  const stats = getStats();

  if (diffs.length === 0) return null;

  return (
    <div className="border-b border-border bg-background px-4 py-2 flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Suite</span>
      <Select value={filters.suite || '__all__'} onValueChange={(v) => setFilter('suite', v === '__all__' ? '' : v ?? '')}>
        <SelectTrigger className="h-7 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {Object.entries(SUITE_LABELS).filter(([k]) => k !== 'unknown').map(([key, label]) => (
            <SelectItem key={key} value={key}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground">Retailer</span>
      <Select value={filters.retailer || '__all__'} onValueChange={(v) => setFilter('retailer', v === '__all__' ? '' : v ?? '')}>
        <SelectTrigger className="h-7 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {RETAILERS.map(r => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground">Viewport</span>
      <Select value={filters.viewport || '__all__'} onValueChange={(v) => setFilter('viewport', v === '__all__' ? '' : v ?? '')}>
        <SelectTrigger className="h-7 w-[100px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          <SelectItem value="desktop">Desktop</SelectItem>
          <SelectItem value="phone">Mobile</SelectItem>
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground">Status</span>
      <Select value={filters.status || '__all__'} onValueChange={(v) => setFilter('status', v === '__all__' ? '' : v ?? '')}>
        <SelectTrigger className="h-7 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="changes">Needs Changes</SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="search"
        placeholder="Search..."
        className="h-7 w-[160px] text-xs"
        value={filters.search}
        onChange={(e) => setFilter('search', e.target.value)}
      />

      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={filters.diffsOnly}
          onChange={(e) => setFilter('diffsOnly', e.target.checked)}
          className="accent-primary h-3.5 w-3.5"
        />
        Diffs only
      </label>

      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs text-muted-foreground gap-1">
        <X className="h-3 w-3" />
        Clear
      </Button>

      <div className="ml-auto flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-yellow-500" />
          {stats.pending} pending
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {stats.approved} approved
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {stats.changes} changes
        </span>
      </div>
    </div>
  );
}
