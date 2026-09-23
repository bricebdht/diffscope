import { create } from 'zustand';
import type { AiSuggestions, DiffEntry, ReviewStatus, ReviewState } from '@/lib/types';

const STORAGE_KEY = 'diffscope-review-state';
const AI_STORAGE_KEY = 'diffscope-ai-suggestions';

function loadState(): ReviewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { diffs: {} };
}

function saveState(state: ReviewState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadAiSuggestions(): AiSuggestions | null {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return null;
}

function saveAiSuggestions(ai: AiSuggestions | null) {
  try {
    if (ai) localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(ai));
    else localStorage.removeItem(AI_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type CompareMode = 'sidebyside' | 'slider';

export interface Filters {
  suite: string;
  viewport: string;
  status: string;
  search: string;
  diffsOnly: boolean;
  aiVerdict: string;
}

interface ReviewStore {
  // Data
  diffs: DiffEntry[];
  reviewState: ReviewState;
  aiSuggestions: AiSuggestions | null;

  // UI state
  filters: Filters;
  modalIndex: number | null;
  compareMode: CompareMode;
  rejectedSectionOpen: boolean;
  approvedSectionOpen: boolean;

  // Computed
  filteredDiffs: DiffEntry[];
  availableSuites: string[];

  // Actions
  setDiffs: (diffs: DiffEntry[]) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;
  openModal: (index: number) => void;
  closeModal: () => void;
  navigate: (delta: number) => void;
  setCompareMode: (mode: CompareMode) => void;
  setReview: (id: string, status: ReviewStatus, comment?: string) => void;
  setAiSuggestions: (ai: AiSuggestions | null) => void;
  toggleRejectedSection: () => void;
  toggleApprovedSection: () => void;
  getStatus: (id: string) => ReviewStatus;
  getComment: (id: string) => string;
  getStats: () => { total: number; pending: number; approved: number; changes: number };
  clearReport: () => void;
}

const defaultFilters: Filters = {
  suite: '',
  viewport: '',
  status: '',
  search: '',
  diffsOnly: true,
  aiVerdict: '',
};

// Matches the DiffGrid layout: pending grouped by suite, then Needs Changes, then Approved.
// Keeping filteredDiffs in this order makes modal navigation follow what's on screen.
function sortForDisplay(diffs: DiffEntry[], reviewState: ReviewState): DiffEntry[] {
  const pendingBySuite = new Map<string, DiffEntry[]>();
  const rejected: DiffEntry[] = [];
  const approved: DiffEntry[] = [];
  for (const d of diffs) {
    const s = reviewState.diffs[d.id]?.status || 'pending';
    if (s === 'changes') rejected.push(d);
    else if (s === 'approved') approved.push(d);
    else {
      const group = pendingBySuite.get(d.suite);
      if (group) group.push(d);
      else pendingBySuite.set(d.suite, [d]);
    }
  }
  return [...[...pendingBySuite.values()].flat(), ...rejected, ...approved];
}

function applyFilters(
  diffs: DiffEntry[],
  filters: Filters,
  reviewState: ReviewState,
  aiSuggestions: AiSuggestions | null,
): DiffEntry[] {
  return sortForDisplay(diffs.filter(d => {
    if (filters.diffsOnly && !d.hasDiff) return false;
    if (filters.suite && d.suite !== filters.suite) return false;
    if (filters.viewport && d.viewport !== filters.viewport) return false;
    if (filters.status) {
      const s = reviewState.diffs[d.id]?.status || 'pending';
      if (filters.status === 'pending' && s !== 'pending') return false;
      if (filters.status === 'approved' && s !== 'approved') return false;
      if (filters.status === 'changes' && s !== 'changes') return false;
    }
    if (filters.aiVerdict) {
      const verdict = aiSuggestions?.byId[d.id]?.verdict;
      if (filters.aiVerdict === 'none' ? verdict : verdict !== filters.aiVerdict) return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${d.description} ${d.suite} ${d.viewport}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }), reviewState);
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  diffs: [],
  reviewState: loadState(),
  aiSuggestions: loadAiSuggestions(),
  filters: { ...defaultFilters },
  modalIndex: null,
  compareMode: 'sidebyside',
  rejectedSectionOpen: true,
  approvedSectionOpen: false,
  filteredDiffs: [],
  availableSuites: [],

  setDiffs: (diffs) => {
    const state = get();
    const filteredDiffs = applyFilters(diffs, state.filters, state.reviewState, state.aiSuggestions);
    const availableSuites = [...new Set(diffs.map(d => d.suite))].sort();
    set({ diffs, filteredDiffs, availableSuites });
  },

  setFilter: (key, value) => {
    const state = get();
    const newFilters = { ...state.filters, [key]: value };
    const filteredDiffs = applyFilters(state.diffs, newFilters, state.reviewState, state.aiSuggestions);
    set({ filters: newFilters, filteredDiffs });
  },

  clearFilters: () => {
    const state = get();
    const filteredDiffs = applyFilters(state.diffs, defaultFilters, state.reviewState, state.aiSuggestions);
    set({ filters: { ...defaultFilters }, filteredDiffs });
  },

  openModal: (index) => set({ modalIndex: index }),
  closeModal: () => set({ modalIndex: null }),

  navigate: (delta) => {
    const { modalIndex, filteredDiffs } = get();
    if (modalIndex === null) return;
    const next = modalIndex + delta;
    if (next >= 0 && next < filteredDiffs.length) {
      set({ modalIndex: next });
    }
  },

  setCompareMode: (mode) => set({ compareMode: mode }),

  setReview: (id, status, comment) => {
    const state = get();
    const newReviewState = {
      ...state.reviewState,
      diffs: {
        ...state.reviewState.diffs,
        [id]: {
          status,
          comment: comment ?? state.reviewState.diffs[id]?.comment,
          reviewedAt: new Date().toISOString(),
        },
      },
    };
    saveState(newReviewState);
    const filteredDiffs = applyFilters(state.diffs, state.filters, newReviewState, state.aiSuggestions);
    set({ reviewState: newReviewState, filteredDiffs });
  },

  setAiSuggestions: (ai) => {
    const state = get();
    saveAiSuggestions(ai);
    const filters = ai ? state.filters : { ...state.filters, aiVerdict: '' };
    const filteredDiffs = applyFilters(state.diffs, filters, state.reviewState, ai);
    set({ aiSuggestions: ai, filters, filteredDiffs });
  },

  toggleRejectedSection: () => set(s => ({ rejectedSectionOpen: !s.rejectedSectionOpen })),
  toggleApprovedSection: () => set(s => ({ approvedSectionOpen: !s.approvedSectionOpen })),

  getStatus: (id) => {
    return get().reviewState.diffs[id]?.status || 'pending';
  },

  getComment: (id) => {
    return get().reviewState.diffs[id]?.comment || '';
  },

  getStats: () => {
    const { diffs, reviewState } = get();
    const total = diffs.length;
    let approved = 0, changes = 0;
    for (const d of diffs) {
      const s = reviewState.diffs[d.id]?.status;
      if (s === 'approved') approved++;
      else if (s === 'changes') changes++;
    }
    return { total, pending: total - approved - changes, approved, changes };
  },

  clearReport: () => {
    // Revoke all blob URLs
    const { diffs } = get();
    for (const d of diffs) {
      if (d.diffBlob) URL.revokeObjectURL(d.diffBlob);
      if (d.actualBlob) URL.revokeObjectURL(d.actualBlob);
      if (d.expectedBlob) URL.revokeObjectURL(d.expectedBlob);
      if (d.thumbBlob && d.thumbBlob !== d.diffBlob) URL.revokeObjectURL(d.thumbBlob);
    }
    const emptyReviewState: ReviewState = { diffs: {} };
    saveState(emptyReviewState);
    saveAiSuggestions(null);
    set({
      diffs: [],
      filteredDiffs: [],
      modalIndex: null,
      reviewState: emptyReviewState,
      aiSuggestions: null,
      filters: { ...get().filters, aiVerdict: '' },
    });
  },
}));
