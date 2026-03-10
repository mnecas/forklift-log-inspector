import { useState, useRef, useEffect, useCallback } from 'react';
import { usePlans, useEvents, useStats, useSummary, useSourceFileName, useNetworkMaps, useStorageMaps } from '../store/useStore';
import { useV2VStore } from '../store/useV2VStore';
import { exportAsJSON, exportAsCSV, exportAsHTMLReport, exportAsInteractiveHTML } from '../utils/exportUtils';
import { useToast } from './Toast';

export function ExportButton() {
  const plans = usePlans();
  const events = useEvents();
  const stats = useStats();
  const summary = useSummary();
  const v2vFileEntries = useV2VStore((s) => s.v2vFileEntries);
  const networkMaps = useNetworkMaps();
  const storageMaps = useStorageMaps();
  const sourceFileName = useSourceFileName();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, close]);

  const hasPlans = plans.length > 0;
  const hasV2V = v2vFileEntries.length > 0;
  if (!hasPlans && !hasV2V) return null;

  const data = { plans, events, summary, stats };

  const handleExport = (format: 'json' | 'csv' | 'html') => {
    try {
      if (format === 'json') exportAsJSON(data);
      else if (format === 'csv') exportAsCSV(data);
      else exportAsHTMLReport(data);
      showToast(`Exported as ${format.toUpperCase()}`, 'success');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Export failed. Please try again.', 'error');
    }
    close();
  };

  const handleInteractiveExport = async () => {
    try {
      await exportAsInteractiveHTML({ ...data, v2vFileEntries, networkMaps, storageMaps, sourceFileName });
      showToast('Exported as Interactive HTML', 'success');
    } catch (err) {
      console.error('Interactive export failed:', err);
      showToast(
        err instanceof Error ? err.message : 'Interactive export failed. Please try again.',
        'error',
      );
    }
    close();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Export data"
        className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors text-slate-700 dark:text-gray-100 flex items-center gap-2 font-medium"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Export
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50"
        >
          {hasPlans && (
            <>
              <button
                role="menuitem"
                onClick={() => handleExport('json')}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-gray-200 transition-colors"
              >
                Export as JSON
              </button>
              <button
                role="menuitem"
                onClick={() => handleExport('csv')}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-gray-200 transition-colors"
              >
                Export as CSV
              </button>
              <button
                role="menuitem"
                onClick={() => handleExport('html')}
                className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-gray-200 transition-colors"
              >
                Export as HTML Report
              </button>
              <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
            </>
          )}
          <button
            role="menuitem"
            onClick={handleInteractiveExport}
            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-gray-200 transition-colors"
          >
            Export as Interactive HTML
          </button>
        </div>
      )}
    </div>
  );
}
