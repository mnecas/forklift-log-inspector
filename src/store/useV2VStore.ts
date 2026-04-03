import { create } from 'zustand';
import type { V2VParsedData, V2VLineCategory, V2VFileEntry } from '../types/v2v';

interface V2VState {
  // Data — per-file V2V entries
  v2vFileEntries: V2VFileEntry[];

  // UI state
  /** Index of the currently selected file in v2vFileEntries */
  selectedFileIndex: number;
  /** Index of the currently selected tool run within the selected file */
  selectedToolRun: number;
  componentFilter: V2VLineCategory | 'all';
  searchQuery: string;
  highlightedLine: number | null;
  /** Incremented on every setHighlightedLine call so the scroll effect re-triggers even for the same line */
  highlightVersion: number;
  expandedPanels: Record<string, boolean>;

  // Derived helpers (computed, not stored)
  /** Get the currently active file's parsed V2V data (or null) */
  getActiveV2VData: () => V2VParsedData | null;

  // Actions
  setV2VFileEntries: (entries: V2VFileEntry[]) => void;
  clearV2VData: () => void;
  setSelectedFile: (index: number) => void;
  setSelectedToolRun: (index: number) => void;
  setComponentFilter: (filter: V2VLineCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  setHighlightedLine: (line: number | null) => void;
  togglePanel: (panelId: string) => void;
  isPanelExpanded: (panelId: string) => boolean;
}

/** Default panel expansion state — aligned with CollapsibleSection ids in V2VDashboard. */
const DEFAULT_EXPANDED_PANELS: Record<string, boolean> = {
  pipeline: true,
  guestinfo: true,
  commands: false,
  errors: false,
  rawlog: false,
};

export const useV2VStore = create<V2VState>()((set, get) => ({
  // Initial state
  v2vFileEntries: [],
  selectedFileIndex: 0,
  selectedToolRun: 0,
  componentFilter: 'all',
  searchQuery: '',
  highlightedLine: null,
  highlightVersion: 0,
  expandedPanels: { ...DEFAULT_EXPANDED_PANELS },

  // Derived helpers
  getActiveV2VData: () => {
    const entries = get().v2vFileEntries;
    const idx = get().selectedFileIndex;
    return entries[idx]?.data ?? null;
  },

  // Actions
  setV2VFileEntries: (entries: V2VFileEntry[]) => {
    // Auto-select first file with errors, or first file
    let selectedFileIdx = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].data.toolRuns.some((r) => r.exitStatus === 'error')) {
        selectedFileIdx = i;
        break;
      }
    }

    const selectedData = entries[selectedFileIdx]?.data;
    const failedRunIdx = selectedData?.toolRuns.findIndex((r) => r.exitStatus === 'error') ?? -1;
    const selectedRunIdx = failedRunIdx >= 0 ? failedRunIdx : 0;
    const selectedRun = selectedData?.toolRuns[selectedRunIdx];
    const hasErrors = selectedRun?.exitStatus === 'error' && selectedRun.errors.length > 0;

    set({
      v2vFileEntries: entries,
      selectedFileIndex: selectedFileIdx,
      selectedToolRun: selectedRunIdx,
      componentFilter: 'all',
      searchQuery: '',
      highlightedLine: null,
      expandedPanels: {
        ...DEFAULT_EXPANDED_PANELS,
        errors: hasErrors ?? false,
      },
    });
  },

  clearV2VData: () => {
    set({
      v2vFileEntries: [],
      selectedFileIndex: 0,
      selectedToolRun: 0,
      componentFilter: 'all',
      searchQuery: '',
      highlightedLine: null,
      expandedPanels: { ...DEFAULT_EXPANDED_PANELS },
    });
  },

  setSelectedFile: (index: number) => {
    const entries = get().v2vFileEntries;
    const data = entries[index]?.data;
    if (!data) return;

    const failedRunIdx = data.toolRuns.findIndex((r) => r.exitStatus === 'error');
    const runIdx = failedRunIdx >= 0 ? failedRunIdx : 0;
    const run = data.toolRuns[runIdx];
    const hasErrors = run ? run.exitStatus === 'error' && run.errors.length > 0 : false;

    set({
      selectedFileIndex: index,
      selectedToolRun: runIdx,
      componentFilter: 'all',
      searchQuery: '',
      highlightedLine: null,
      expandedPanels: {
        ...DEFAULT_EXPANDED_PANELS,
        errors: hasErrors,
      },
    });
  },

  setSelectedToolRun: (index: number) => {
    const data = get().getActiveV2VData();
    const run = data?.toolRuns[index];
    const hasErrors = run ? run.exitStatus === 'error' && run.errors.length > 0 : false;
    set((state) => ({
      selectedToolRun: index,
      highlightedLine: null,
      expandedPanels: {
        ...state.expandedPanels,
        errors: hasErrors,
      },
    }));
  },

  setComponentFilter: (filter: V2VLineCategory | 'all') => {
    set({ componentFilter: filter });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setHighlightedLine: (line: number | null) => {
    set((state) => ({
      highlightedLine: line,
      highlightVersion: state.highlightVersion + 1,
      componentFilter: line !== null ? 'all' : state.componentFilter,
      expandedPanels: line !== null
        ? { ...state.expandedPanels, rawlog: true }
        : state.expandedPanels,
    }));
  },

  togglePanel: (panelId: string) => {
    set((state) => ({
      expandedPanels: {
        ...state.expandedPanels,
        [panelId]: !state.expandedPanels[panelId],
      },
    }));
  },

  isPanelExpanded: (panelId: string) => {
    return get().expandedPanels[panelId] ?? false;
  },
}));

// Helper hooks
export const useSelectedToolRun = () => useV2VStore((s) => s.selectedToolRun);
export const useComponentFilter = () => useV2VStore((s) => s.componentFilter);
export const useV2VSearchQuery = () => useV2VStore((s) => s.searchQuery);
export const useHighlightedLine = () => useV2VStore((s) => s.highlightedLine);
