import { useEffect, useCallback } from 'react';
import { useStore, useShowKeyboardHelp, useEvents, useViewMode, useNetworkMaps, useStorageMaps } from './store/useStore';
import { useV2VStore } from './store/useV2VStore';
import { ToastProvider } from './components/Toast';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { StatsBar } from './components/StatsBar';
import { SearchFilter } from './components/SearchFilter';
import { PlansGrid } from './components/PlansGrid';
import { EventTimeline } from './components/EventTimeline';
import { V2VDashboard } from './components/v2v';
import { Modal } from './components/common';
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from './hooks';

function KeyboardShortcutsHelp() {
  const showKeyboardHelp = useShowKeyboardHelp();
  const { setShowKeyboardHelp } = useStore();

  if (!showKeyboardHelp) return null;

  return (
    <Modal
      isOpen={showKeyboardHelp}
      onClose={() => setShowKeyboardHelp(false)}
      title="Keyboard Shortcuts"
      maxWidth="md"
    >
      <div className="p-6">
        <div className="space-y-3">
          {KEYBOARD_SHORTCUTS.map((shortcut, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <span className="text-slate-700 dark:text-gray-300">{shortcut.description}</span>
              <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-sm font-mono text-slate-900 dark:text-gray-100">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function AppContent() {
  const { theme, plans, devMode, initializeTheme, toggleTheme, toggleDevMode, navigatePlan, toggleSelectedPlanExpanded, setShowKeyboardHelp, setSearchQuery } = useStore();
  const events = useEvents();
  const hasV2VData = useV2VStore((s) => s.v2vFileEntries.length > 0);
  const viewMode = useViewMode();
  const networkMaps = useNetworkMaps();
  const storageMaps = useStorageMaps();

  // Initialize theme from system preference on first load
  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  // Enable dev mode from URL param (?dev=true) if not already on
  useEffect(() => {
    if (!devMode && new URLSearchParams(window.location.search).has('dev')) {
      toggleDevMode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      const stored = localStorage.getItem('forklift-log-inspector');
      if (!stored) {
        useStore.getState().setTheme(e.matches ? 'dark' : 'light');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme class to html element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Focus search handler
  const handleFocusSearch = useCallback(() => {
    const searchInput = document.getElementById('global-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }, []);

  // Clear search handler
  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    const searchInput = document.getElementById('global-search-input') as HTMLInputElement;
    if (searchInput && document.activeElement === searchInput) {
      searchInput.blur();
    }
  }, [setSearchQuery]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: '/', action: handleFocusSearch, description: 'Focus search' },
    { key: 'Escape', action: handleClearSearch, description: 'Clear search' },
    { key: 'j', action: () => navigatePlan('down'), description: 'Navigate down' },
    { key: 'k', action: () => navigatePlan('up'), description: 'Navigate up' },
    { key: 'Enter', action: toggleSelectedPlanExpanded, description: 'Toggle expand' },
    { key: 'd', ctrl: true, action: toggleTheme, description: 'Toggle theme' },
    { key: 'd', ctrl: true, shift: true, action: toggleDevMode, description: 'Toggle dev mode' },
    { key: '?', shift: true, action: () => setShowKeyboardHelp(true), description: 'Show help' },
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-gray-100 transition-colors">
      <Header />
      
      <main className="flex-1">
        <UploadZone />
        
        {/* V2V analysis view — shown when user navigates to it */}
        {viewMode === 'v2v' && hasV2VData ? (
          <V2VDashboard />
        ) : plans.length > 0 || events.length > 0 || networkMaps.length > 0 || storageMaps.length > 0 ? (
          <>
            {plans.length > 0 && (
              <>
                <StatsBar />
                <SearchFilter />
              </>
            )}
            
            {events.length > 0 && <EventTimeline events={events} />}
            <PlansGrid />
          </>
        ) : hasV2VData ? (
          <V2VDashboard />
        ) : (
          <PlansGrid />
        )}
      </main>

      <footer className="py-4 text-center text-sm text-slate-500 dark:text-gray-400 border-t border-slate-200 dark:border-slate-700">
        <span>Forklift Log Inspector - A tool for visualizing MTV migration logs</span>
        <span className="mx-2">|</span>
        <button 
          onClick={() => setShowKeyboardHelp(true)}
          className="hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
        >
          Keyboard shortcuts (?)
        </button>
      </footer>
      
      <KeyboardShortcutsHelp />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
