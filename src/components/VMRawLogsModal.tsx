import { useCallback, useMemo, useState } from 'react';
import type { VM, RawLogEntry } from '../types';
import { formatTimestamp } from '../utils/dateUtils';
import { getLevelBadgeClass, getPhaseBadgeClass } from '../utils/badgeUtils';
import { Modal, JsonViewer, CopyButton, EmptyState, SearchHighlight } from './common';

interface VMRawLogsModalProps {
  vm: VM;
  onClose: () => void;
}

export function VMRawLogsModal({ vm, onClose }: VMRawLogsModalProps) {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Get all logs combined and sorted by timestamp
  const allLogs = useMemo(() => {
    if (!vm.phaseLogs) return [];
    
    const logs: RawLogEntry[] = [];
    for (const [phase, phaseLogs] of Object.entries(vm.phaseLogs)) {
      for (const log of phaseLogs) {
        logs.push({ ...log, phase: phase });
      }
    }
    
    // Sort by timestamp
    logs.sort((a, b) => {
      try {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } catch {
        return 0;
      }
    });
    
    return logs;
  }, [vm.phaseLogs]);

  // Get unique phases for filter
  const phases = useMemo(() => {
    const phaseSet = new Set<string>();
    allLogs.forEach(log => {
      if (log.phase) phaseSet.add(log.phase);
    });
    return Array.from(phaseSet).sort();
  }, [allLogs]);

  // Get unique levels for filter
  const levels = useMemo(() => {
    const levelSet = new Set<string>();
    allLogs.forEach(log => {
      if (log.level) levelSet.add(log.level.toLowerCase());
    });
    return Array.from(levelSet).sort();
  }, [allLogs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      if (filterPhase !== 'all' && log.phase !== filterPhase) return false;
      if (filterLevel !== 'all' && log.level.toLowerCase() !== filterLevel) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesMessage = log.message.toLowerCase().includes(search);
        const matchesRaw = log.rawLine.toLowerCase().includes(search);
        if (!matchesMessage && !matchesRaw) return false;
      }
      return true;
    });
  }, [allLogs, filterPhase, filterLevel, searchTerm]);

  const toggleExpanded = useCallback((idx: number) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const footerContent = (
    <div className="flex justify-between items-center">
      <span className="text-sm text-slate-500 dark:text-gray-400">
        Click on a log entry to view the raw JSON. Press Escape to close.
      </span>
      <button
        onClick={onClose}
        className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 
                   text-slate-700 dark:text-gray-200 rounded-lg transition-colors text-sm font-medium"
      >
        Close
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Raw Logs: ${vm.name}`}
      subtitle={`${filteredLogs.length} of ${allLogs.length} logs`}
      maxWidth="6xl"
      footer={footerContent}
    >
      {/* Filters */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-center bg-slate-50 dark:bg-slate-800/50">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 
                         bg-white dark:bg-slate-700 text-slate-900 dark:text-gray-100 text-sm
                         focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>
          
          {/* Phase filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500 dark:text-gray-400">Phase:</label>
            <select
              value={filterPhase}
              onChange={e => setFilterPhase(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 
                         bg-white dark:bg-slate-700 text-slate-900 dark:text-gray-100 text-sm
                         focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">All Phases</option>
              {phases.map(phase => (
                <option key={phase} value={phase}>{phase}</option>
              ))}
            </select>
          </div>

          {/* Level filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500 dark:text-gray-400">Level:</label>
            <select
              value={filterLevel}
              onChange={e => setFilterLevel(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 
                         bg-white dark:bg-slate-700 text-slate-900 dark:text-gray-100 text-sm
                         focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">All Levels</option>
              {levels.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        </div>

      {/* Logs List */}
      <div className="p-4 space-y-2">
        {filteredLogs.length === 0 ? (
          <EmptyState 
            icon="search" 
            title="No logs found" 
            description="Try adjusting your search or filters"
          />
        ) : (
          filteredLogs.map((log, idx) => (
            <div 
              key={idx}
              className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
            >
              {/* Log header - clickable */}
              <button
                onClick={() => toggleExpanded(idx)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                {/* Expand icon */}
                <svg
                  className={`w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400 transition-transform ${expandedLogs.has(idx) ? 'rotate-90' : ''}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M6 6L14 10L6 14V6Z" />
                </svg>
                
                {/* Timestamp */}
                <span className="text-xs text-slate-500 dark:text-gray-400 font-mono flex-shrink-0 w-44">
                  {formatTimestamp(log.timestamp)}
                </span>
                
                {/* Level badge */}
                <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase flex-shrink-0 ${getLevelBadgeClass(log.level)}`}>
                  {log.level}
                </span>
                
                {/* Phase badge */}
                {log.phase && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${getPhaseBadgeClass(log.phase)}`}>
                    {log.phase}
                  </span>
                )}
                
                {/* Message */}
                <span className="text-sm text-slate-700 dark:text-gray-200 truncate flex-1">
                  <SearchHighlight text={log.message} searchQuery={searchTerm} />
                </span>
              </button>

              {/* Expanded raw JSON */}
              {expandedLogs.has(idx) && (
                <div className="px-4 pb-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="mt-3 p-3 rounded overflow-x-auto bg-slate-100 dark:bg-slate-800 relative group">
                    <JsonViewer json={log.rawLine} />
                    <CopyButton 
                      text={log.rawLine} 
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      label="Copy JSON"
                    />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
