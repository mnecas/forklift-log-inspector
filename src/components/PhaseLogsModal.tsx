import { useCallback, useState, useMemo } from 'react';
import type { RawLogEntry, PhaseLogSummary, GroupedLogEntry, PhaseIteration, WarmInfo, PrecopyInfo } from '../types';
import { formatDateTime, formatTimestamp } from '../utils/dateUtils';
import { Modal, LogGroupCard, LogFilterBar } from './common';
import { formatDuration } from '../parser/utils';

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
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1])); // First iteration expanded by default
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

  // Compute total transfer duration for warm info
  const totalTransferDuration = useMemo(() => {
    if (!hasWarmInfo) return 0;
    return warmInfo.precopies.reduce((sum, p) => sum + (p.durationMs || 0), 0);
  }, [warmInfo, hasWarmInfo]);


  // Collect all unique disk names across all precopies
  const allDisks = useMemo(() => {
    if (!hasWarmInfo) return [];
    const diskSet = new Set<string>();
    for (const p of warmInfo.precopies) {
      for (const d of p.disks) diskSet.add(d);
    }
    return Array.from(diskSet);
  }, [warmInfo, hasWarmInfo]);

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
          <div className="p-6 space-y-6">
            {/* Summary cards row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="Precopies"
                value={String(warmInfo.precopies.length)}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                }
                color="cyan"
              />
              <SummaryCard
                label="Successes"
                value={String(warmInfo.successes)}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                }
                color="green"
              />
              <SummaryCard
                label="Failures"
                value={String(warmInfo.failures)}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                }
                color={warmInfo.failures > 0 ? 'red' : 'slate'}
              />
              <SummaryCard
                label="Total Duration"
                value={totalTransferDuration ? formatDuration(totalTransferDuration) : 'N/A'}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                color="blue"
              />
            </div>

            {/* Disks involved */}
            {allDisks.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  Disks ({allDisks.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {allDisks.map((disk, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                      {disk}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline of precopies */}
            <div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Precopy Iterations
              </h4>
              <div className="space-y-3">
                {warmInfo.precopies.map((precopy) => (
                  <PrecopyCard
                    key={precopy.iteration}
                    precopy={precopy}
                    totalPrecopies={warmInfo.precopies.length}
                    isExpanded={expandedIterations.has(precopy.iteration)}
                    onToggle={() => toggleIteration(precopy.iteration)}
                  />
                ))}
              </div>
            </div>

            {/* Consecutive failures warning */}
            {warmInfo.consecutiveFailures > 0 && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    {warmInfo.consecutiveFailures} consecutive failure{warmInfo.consecutiveFailures !== 1 ? 's' : ''}
                  </p>
                  {warmInfo.nextPrecopyAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Next precopy scheduled: {formatTimestamp(warmInfo.nextPrecopyAt)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
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

// ── Helper Components ─────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-200 dark:border-cyan-800',
    text: 'text-cyan-700 dark:text-cyan-300',
    icon: 'text-cyan-500 dark:text-cyan-400',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    icon: 'text-green-500 dark:text-green-400',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-300',
    icon: 'text-red-500 dark:text-red-400',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-gray-300',
    icon: 'text-slate-400 dark:text-gray-500',
  },
};

function SummaryCard({ label, value, icon, color }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  const c = colorMap[color] || colorMap.slate;
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={c.icon}>{icon}</span>
        <span className={`text-xs font-medium uppercase tracking-wider ${c.text} opacity-70`}>
          {label}
        </span>
      </div>
      <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
    </div>
  );
}

function PrecopyCard({ precopy, totalPrecopies, isExpanded, onToggle }: {
  precopy: PrecopyInfo;
  totalPrecopies: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors">
      {/* Card header */}
      <button
        onClick={onToggle}
        className="w-full text-left"
      >
        <div className="px-4 py-3 flex items-center gap-4">
          {/* Iteration number badge */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-500 dark:bg-cyan-600 flex items-center justify-center text-white font-bold text-sm">
            {precopy.iteration}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-gray-200 text-sm">
                Precopy {precopy.iteration} of {totalPrecopies}
              </span>
              {precopy.durationMs && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {formatDuration(precopy.durationMs)}
                </span>
              )}
              {precopy.disks.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                  {precopy.disks.length} disk{precopy.disks.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Snapshot name */}
            <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">
              <span className="font-medium">Snapshot:</span> {precopy.snapshot}
            </div>

          </div>

          {/* Expand chevron */}
          <svg
            className={`w-5 h-5 text-slate-400 dark:text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Time range */}
            {precopy.startedAt && (
              <DetailItem
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                label="Started"
                value={formatTimestamp(precopy.startedAt)}
              />
            )}
            {precopy.endedAt && (
              <DetailItem
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                }
                label="Completed"
                value={formatTimestamp(precopy.endedAt)}
              />
            )}

            {/* Snapshot */}
            <DetailItem
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              label="Snapshot"
              value={precopy.snapshot}
            />

            {/* Duration */}
            {precopy.durationMs && (
              <DetailItem
                icon={
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
                label="Duration"
                value={formatDuration(precopy.durationMs)}
              />
            )}
          </div>

          {/* Disks for this precopy */}
          {precopy.disks.length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                Disks transferred
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {precopy.disks.map((disk, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                    {disk}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 dark:text-gray-500 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-xs font-medium text-slate-500 dark:text-gray-400 block">{label}</span>
        <span className="text-sm text-slate-800 dark:text-gray-200 break-all">{value}</span>
      </div>
    </div>
  );
}

