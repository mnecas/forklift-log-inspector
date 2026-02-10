import { useCallback, useState, useMemo } from 'react';
import type { RawLogEntry, PhaseLogSummary, GroupedLogEntry, PhaseIteration, WarmInfo } from '../types';
import { formatDateTime } from '../utils/dateUtils';
import { Modal, LogGroupCard, LogFilterBar } from './common';
import { formatDuration } from '../parser/utils';
import { PrecopyOverview } from './PrecopyOverview';

interface PhaseLogsModalProps {
  phase: string;
  vmName?: string;
  logs: RawLogEntry[];
  summary?: PhaseLogSummary;
  iterations?: PhaseIteration[];
  warmInfo?: WarmInfo;
  onClose: () => void;
}

export function PhaseLogsModal({ phase, vmName, logs, summary, iterations, warmInfo, onClose }: PhaseLogsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1]));
  const [activeTab, setActiveTab] = useState<'visual' | 'logs'>(warmInfo ? 'visual' : 'logs');

  const hasMultipleIterations = iterations && iterations.length > 1;
  const hasWarmInfo = warmInfo && warmInfo.precopies.length > 0;

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleIteration = useCallback((iteration: number) => {
    setExpandedIterations(prev => {
      const next = new Set(prev);
      if (next.has(iteration)) {
        next.delete(iteration);
      } else {
        next.add(iteration);
      }
      return next;
    });
  }, []);

  // Group logs by iteration
  const logsByIteration = useMemo(() => {
    if (!hasMultipleIterations || !iterations) return null;

    const iterationLogs: Map<number, RawLogEntry[]> = new Map();
    
    // Initialize all iterations
    for (const iter of iterations) {
      iterationLogs.set(iter.iteration, []);
    }

    // Assign logs to iterations based on timestamp
    for (const log of logs) {
      const logTime = new Date(log.timestamp).getTime();
      
      // Find which iteration this log belongs to
      for (const iter of iterations) {
        const startTime = iter.startedAt.getTime();
        const endTime = iter.endedAt ? iter.endedAt.getTime() : Infinity;
        
        if (logTime >= startTime && logTime <= endTime) {
          iterationLogs.get(iter.iteration)?.push(log);
          break;
        }
      }
    }

    return iterationLogs;
  }, [logs, iterations, hasMultipleIterations]);

  // Group logs within each iteration (or all logs if no iterations)
  const groupedLogsByIteration = useMemo((): Map<number | 'all', GroupedLogEntry[]> => {
    if (!hasMultipleIterations || !logsByIteration) {
      // No iterations - return single group with all logs
      const result = new Map<number | 'all', GroupedLogEntry[]>();
      result.set('all', summary?.groupedLogs || []);
      return result;
    }

    const result = new Map<number | 'all', GroupedLogEntry[]>();
    
    for (const [iteration, iterLogs] of logsByIteration) {
      // Group logs for this iteration
      const messageGroups = new Map<string, GroupedLogEntry>();
      
      for (const log of iterLogs) {
        const key = `${log.level}:${log.message}`;
        const existing = messageGroups.get(key);
        
        if (existing) {
          existing.count++;
          existing.entries.push(log);
          if (log.timestamp > existing.lastSeen) {
            existing.lastSeen = log.timestamp;
          }
          if (log.timestamp < existing.firstSeen) {
            existing.firstSeen = log.timestamp;
          }
        } else {
          messageGroups.set(key, {
            message: log.message,
            count: 1,
            firstSeen: log.timestamp,
            lastSeen: log.timestamp,
            level: log.level,
            entries: [log],
          });
        }
      }
      
      result.set(iteration, Array.from(messageGroups.values()));
    }

    return result;
  }, [logsByIteration, hasMultipleIterations, summary?.groupedLogs]);

  // Filter grouped logs based on search and level
  const filterGroupedLogs = useCallback((groups: GroupedLogEntry[]): GroupedLogEntry[] => {
    let result = groups;

    if (levelFilter !== 'all') {
      result = result.filter((group) => group.level === levelFilter || (levelFilter === 'warning' && group.level === 'warn'));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((group) =>
        group.message.toLowerCase().includes(query)
      );
    }

    return result;
  }, [levelFilter, searchQuery]);

  // Count unique messages and total
  const uniqueCount = summary?.groupedLogs?.length || 0;
  const totalCount = logs.length;

  // Count by level
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, error: 0, warning: 0, info: 0, debug: 0 };
    for (const group of summary?.groupedLogs || []) {
      counts.all += group.count;
      const level = group.level === 'warn' ? 'warning' : group.level;
      if (counts[level] !== undefined) {
        counts[level] += group.count;
      }
    }
    return counts;
  }, [summary]);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={vmName ? `${vmName} - ${phase}` : phase}
      subtitle={hasWarmInfo
        ? `Warm Migration - ${warmInfo.precopies.length} precopy iteration${warmInfo.precopies.length !== 1 ? 's' : ''}`
        : `${uniqueCount} unique message${uniqueCount !== 1 ? 's' : ''} (${totalCount} total)`
      }
      maxWidth="5xl"
    >
      {/* Timing info */}
        {((summary?.startTime && formatDateTime(summary.startTime)) || (summary?.endTime && formatDateTime(summary.endTime)) || summary?.duration) && (
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {summary?.startTime && formatDateTime(summary.startTime) && (
              <div>
                <span className="font-medium text-slate-700 dark:text-gray-300">Started:</span>
                <span className="ml-2 text-slate-600 dark:text-gray-400">
                  {formatDateTime(summary.startTime)}
                </span>
              </div>
            )}
            {summary?.endTime && formatDateTime(summary.endTime) && (
              <div>
                <span className="font-medium text-slate-700 dark:text-gray-300">Ended:</span>
                <span className="ml-2 text-slate-600 dark:text-gray-400">
                  {formatDateTime(summary.endTime)}
                </span>
              </div>
            )}
            {summary?.duration && (
              <div>
                <span className="font-medium text-slate-700 dark:text-gray-300">Duration:</span>
                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                  {summary.duration}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Tab switcher for warm info */}
        {hasWarmInfo && (
          <div className="px-6 py-2 border-b border-slate-200 dark:border-slate-700 flex gap-1">
            <button
              onClick={() => setActiveTab('visual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'visual'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Precopy Overview
              </span>
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Raw Logs ({totalCount})
              </span>
            </button>
          </div>
        )}

        {/* Visual precopy overview tab */}
        {hasWarmInfo && activeTab === 'visual' && (
          <PrecopyOverview warmInfo={warmInfo} />
        )}

        {/* Logs tab */}
        {(!hasWarmInfo || activeTab === 'logs') && (
          <>
            <LogFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              levelFilter={levelFilter}
              onLevelFilterChange={setLevelFilter}
              levelCounts={levelCounts}
            />

            {/* Grouped logs list */}
            <div className="p-4 space-y-3">
              {hasMultipleIterations && iterations ? (
                // Show logs grouped by iteration/cycle
                <div className="space-y-4">
                  {iterations.map((iter) => {
                    const iterLogs = groupedLogsByIteration.get(iter.iteration) || [];
                    const filteredLogs = filterGroupedLogs(iterLogs);
                    const isExpanded = expandedIterations.has(iter.iteration);
                    const iterLogCount = iterLogs.reduce((sum, g) => sum + g.count, 0);
                    
                    return (
                      <div key={iter.iteration} className="border border-cyan-200 dark:border-cyan-800 rounded-lg overflow-hidden">
                        {/* Iteration header */}
                        <button
                          onClick={() => toggleIteration(iter.iteration)}
                          className="w-full px-4 py-3 bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-between hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`w-4 h-4 text-cyan-600 dark:text-cyan-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                              Cycle {iter.iteration}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500 text-white">
                              {iterLogCount} log{iterLogCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-gray-400">
                            {iter.durationMs && (
                              <span className="text-cyan-600 dark:text-cyan-400 font-medium">
                                {formatDuration(iter.durationMs)}
                              </span>
                            )}
                            <span className="text-xs">
                              {formatDateTime(iter.startedAt.toISOString())}
                              {iter.endedAt && ` - ${formatDateTime(iter.endedAt.toISOString())}`}
                            </span>
                          </div>
                        </button>
                        
                        {/* Iteration logs */}
                        {isExpanded && (
                          <div className="p-3 space-y-2 bg-white dark:bg-slate-800">
                            {filteredLogs.length === 0 ? (
                              <div className="text-center py-4 text-slate-500 dark:text-gray-400 text-sm">
                                No logs matching your criteria in this cycle
                              </div>
                            ) : (
                              filteredLogs.map((group, idx) => (
                                <LogGroupCard
                                  key={`${iter.iteration}-${idx}`}
                                  group={group}
                                  isExpanded={expandedGroups.has(`${iter.iteration}-${idx}`)}
                                  onToggle={() => toggleGroup(`${iter.iteration}-${idx}`)}
                                  searchQuery={searchQuery}
                                />
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Single iteration or no iteration info - show flat list
                (() => {
                  const allLogs = groupedLogsByIteration.get('all') || summary?.groupedLogs || [];
                  const filteredLogs = filterGroupedLogs(allLogs);
                  
                  return filteredLogs.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                      No logs matching your criteria
                    </div>
                  ) : (
                    filteredLogs.map((group, idx) => (
                      <LogGroupCard
                        key={idx}
                        group={group}
                        isExpanded={expandedGroups.has(`all-${idx}`)}
                        onToggle={() => toggleGroup(`all-${idx}`)}
                        searchQuery={searchQuery}
                      />
                    ))
                  );
                })()
              )}
            </div>
          </>
        )}
    </Modal>
  );
}


