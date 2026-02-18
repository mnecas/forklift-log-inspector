import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Plan, Event, ParseStats, Summary, ParsedData, NetworkMapResource, StorageMapResource } from '../types';

export type ViewMode = 'plans' | 'v2v';

interface AppState {
  // Data
  plans: Plan[];
  events: Event[];
  networkMaps: NetworkMapResource[];
  storageMaps: StorageMapResource[];
  stats: ParseStats;
  summary: Summary;
  
  // UI state
  theme: 'dark' | 'light';
  themeInitialized: boolean;
  devMode: boolean;
  searchQuery: string;
  statusFilter: string;
  expandedPlans: string[];
  selectedPlanIndex: number;
  showKeyboardHelp: boolean;
  viewMode: ViewMode;
  
  // Actions
  setParseResult: (result: ParsedData) => void;
  clearData: () => void;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  initializeTheme: () => void;
  toggleDevMode: () => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  togglePlanExpanded: (planKey: string) => void;
  isPlanExpanded: (planKey: string) => boolean;
  setSelectedPlanIndex: (index: number) => void;
  navigatePlan: (direction: 'up' | 'down') => void;
  toggleSelectedPlanExpanded: () => void;
  setShowKeyboardHelp: (show: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
}

const initialStats: ParseStats = {
  totalLines: 0,
  parsedLines: 0,
  errorLines: 0,
  duplicateLines: 0,
  plansFound: 0,
  vmsFound: 0,
};

const initialSummary: Summary = {
  totalPlans: 0,
  running: 0,
  succeeded: 0,
  failed: 0,
  archived: 0,
  pending: 0,
};

/**
 * Detect system color scheme preference
 */
function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark'; // Default to dark
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial data state
      plans: [],
      events: [],
      networkMaps: [],
      storageMaps: [],
      stats: initialStats,
      summary: initialSummary,
      
      // Initial UI state
      theme: 'dark',
      themeInitialized: false,
      devMode: false,
      searchQuery: '',
      statusFilter: 'all',
      expandedPlans: [],
      selectedPlanIndex: -1,
      showKeyboardHelp: false,
      viewMode: 'plans',
      
      // Actions
      setParseResult: (result: ParsedData) => {
        set({
          plans: result.plans,
          events: result.events,
          networkMaps: result.networkMaps,
          storageMaps: result.storageMaps,
          stats: result.stats,
          summary: result.summary,
          selectedPlanIndex: result.plans.length > 0 ? 0 : -1,
        });
      },
      
      clearData: () => {
        set({
          plans: [],
          events: [],
          networkMaps: [],
          storageMaps: [],
          stats: initialStats,
          summary: initialSummary,
          expandedPlans: [],
          selectedPlanIndex: -1,
          viewMode: 'plans',
        });
      },
      
      toggleTheme: () => {
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark',
        }));
      },
      
      setTheme: (theme: 'dark' | 'light') => {
        set({ theme });
      },
      
      initializeTheme: () => {
        const state = get();
        // Only initialize if not already done and no stored preference
        if (!state.themeInitialized) {
          const systemTheme = getSystemTheme();
          set({ theme: systemTheme, themeInitialized: true });
        }
      },
      
      toggleDevMode: () => {
        set((state) => ({ devMode: !state.devMode }));
      },
      
      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },
      
      setStatusFilter: (filter: string) => {
        set({ statusFilter: filter });
      },
      
      togglePlanExpanded: (planKey: string) => {
        set((state) => {
          const expanded = state.expandedPlans;
          if (expanded.includes(planKey)) {
            return { expandedPlans: expanded.filter(k => k !== planKey) };
          } else {
            return { expandedPlans: [...expanded, planKey] };
          }
        });
      },
      
      isPlanExpanded: (planKey: string) => {
        return get().expandedPlans.includes(planKey);
      },
      
      setSelectedPlanIndex: (index: number) => {
        set({ selectedPlanIndex: index });
      },
      
      navigatePlan: (direction: 'up' | 'down') => {
        const state = get();
        const { plans, selectedPlanIndex } = state;
        if (plans.length === 0) return;
        
        let newIndex: number;
        if (direction === 'down') {
          newIndex = selectedPlanIndex < plans.length - 1 ? selectedPlanIndex + 1 : 0;
        } else {
          newIndex = selectedPlanIndex > 0 ? selectedPlanIndex - 1 : plans.length - 1;
        }
        set({ selectedPlanIndex: newIndex });
      },
      
      toggleSelectedPlanExpanded: () => {
        const state = get();
        const { plans, selectedPlanIndex } = state;
        if (selectedPlanIndex < 0 || selectedPlanIndex >= plans.length) return;
        
        const plan = plans[selectedPlanIndex];
        const planKey = `${plan.namespace}/${plan.name}`;
        const expanded = state.expandedPlans;
        
        if (expanded.includes(planKey)) {
          set({ expandedPlans: expanded.filter(k => k !== planKey) });
        } else {
          set({ expandedPlans: [...expanded, planKey] });
        }
      },
      
      setShowKeyboardHelp: (show: boolean) => {
        set({ showKeyboardHelp: show });
      },
      
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode });
      },
    }),
    {
      name: 'forklift-log-inspector',
      partialize: (state) => ({
        theme: state.theme,
        themeInitialized: state.themeInitialized,
        devMode: state.devMode,
      }),
    }
  )
);

// Helper hooks
export const usePlans = () => useStore((state) => state.plans);
export const useEvents = () => useStore((state) => state.events);
export const useStats = () => useStore((state) => state.stats);
export const useSummary = () => useStore((state) => state.summary);
export const useTheme = () => useStore((state) => state.theme);
export const useSearchQuery = () => useStore((state) => state.searchQuery);
export const useStatusFilter = () => useStore((state) => state.statusFilter);
export const useSelectedPlanIndex = () => useStore((state) => state.selectedPlanIndex);
export const useShowKeyboardHelp = () => useStore((state) => state.showKeyboardHelp);
export const useDevMode = () => useStore((state) => state.devMode);
export const useViewMode = () => useStore((state) => state.viewMode);
export const useNetworkMaps = () => useStore((state) => state.networkMaps);
export const useStorageMaps = () => useStore((state) => state.storageMaps);