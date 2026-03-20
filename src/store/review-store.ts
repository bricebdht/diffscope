import { create } from 'zustand';
import type { DiffEntry, ReviewStatus, ReviewState } from '@/lib/types';

const STORAGE_KEY = 'diffscope-review-state';

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

export type CompareMode = 'sidebyside' | 'slider';

export interface Filters {
  suite: string;
  viewport: string;
  status: string;
  search: string;
  diffsOnly: boolean;
}

interface ReviewStore {
  // Data
  diffs: DiffEntry[];
  reviewState: ReviewState;

  // UI state
  filters: Filters;
  modalIndex: number | null;
  compareMode: CompareMode;
  reviewedSectionOpen: boolean;

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
  toggleReviewedSection: () => void;
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
};

function applyFilters(diffs: DiffEntry[], filters: Filters, reviewState: ReviewState): DiffEntry[] {
  return diffs.filter(d => {
    if (filters.diffsOnly && !d.hasDiff) return false;
    if (filters.suite && d.suite !== filters.suite) return false;
    if (filters.viewport && d.viewport !== filters.viewport) return false;
    if (filters.status) {
      const s = reviewState.diffs[d.id]?.status || 'pending';
      if (filters.status === 'pending' && s !== 'pending') return false;
      if (filters.status === 'approved' && s !== 'approved') return false;
      if (filters.status === 'changes' && s !== 'changes') return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${d.description} ${d.suite} ${d.viewport}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  diffs: [],
  reviewState: loadState(),
  filters: { ...defaultFilters },
  modalIndex: null,
  compareMode: 'sidebyside',
  reviewedSectionOpen: false,
  filteredDiffs: [],
  availableSuites: [],

  setDiffs: (diffs) => {
    const state = get();
    const filteredDiffs = applyFilters(diffs, state.filters, state.reviewState);
    const availableSuites = [...new Set(diffs.map(d => d.suite))].sort();
    set({ diffs, filteredDiffs, availableSuites });
  },

  setFilter: (key, value) => {
    const state = get();
    const newFilters = { ...state.filters, [key]: value };
    const filteredDiffs = applyFilters(state.diffs, newFilters, state.reviewState);
    set({ filters: newFilters, filteredDiffs });
  },

  clearFilters: () => {
    const state = get();
    const filteredDiffs = applyFilters(state.diffs, defaultFilters, state.reviewState);
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
    const filteredDiffs = applyFilters(state.diffs, state.filters, newReviewState);
    set({ reviewState: newReviewState, filteredDiffs });
  },

  toggleReviewedSection: () => set(s => ({ reviewedSectionOpen: !s.reviewedSectionOpen })),

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
    set({ diffs: [], filteredDiffs: [], modalIndex: null });
  },
}));
