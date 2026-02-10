import { useCallback, useState, useMemo } from 'react';
import type { VM, RawLogEntry, GroupedLogEntry, CycleData, CyclePhaseData, WarmInfo } from '../types';
import { formatDateTime } from '../utils/dateUtils';
import { Modal, LogGroupCard, LogFilterBar } from './common';
import { formatDuration } from '../parser/utils';
import { PrecopyLoopPhases, PrecopyLoopPhasesSet, Phases } from '../parser/constants';
import { PrecopyOverview } from './PrecopyOverview';

interface CycleLogsModalProps {
  vm: VM;
  onClose: () => void;
}

export function CycleLogsModal({ vm, onClose }: CycleLogsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [expandedCycles, setExpandedCycles] = useState<Set<number>>(new Set([1]));
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleCycle = useCallback((cycle: number) => {
    setExpandedCycles(prev => {
      const next = new Set(prev);
      if (next.has(cycle)) {
        next.delete(cycle);
      } else {
        next.add(cycle);
      }
      return next;
    });
  }, []);

  const togglePhase = useCallback((key: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

  // Build cycle data from VM's phase history and logs
  const cycles = useMemo((): CycleData[] => {
    const maxIteration = vm.phaseHistory.reduce(
      (max, ph) => (ph.iteration && ph.iteration > max ? ph.iteration : max),
      0
    );

    if (maxIteration <= 0) return [];

    const result: CycleData[] = [];

    for (let iter = 1; iter <= maxIteration; iter++) {
      // Collect phase entries for this iteration
      const phaseEntries = vm.phaseHistory.filter(
        ph => PrecopyLoopPhasesSet.has(ph.name) && ph.iteration === iter
      );

      if (phaseEntries.length === 0) continue;

      // Get the overall time range for this cycle
      const cycleStart = phaseEntries.reduce((min, ph) => {
        const t = new Date(ph.startedAt).getTime();
        return t < min ? t : min;
      }, Infinity);

      const cycleEnd = phaseEntries.reduce((max, ph) => {
        const t = ph.endedAt ? new Date(ph.endedAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);

      // Build phase data - iterate in the canonical precopy loop order
      const phases: CyclePhaseData[] = [];

      for (const phaseName of PrecopyLoopPhases) {
        const phaseEntry = phaseEntries.find(pe => pe.name === phaseName);
        if (!phaseEntry) continue;

        const phaseStart = new Date(phaseEntry.startedAt).getTime();
        const phaseEnd = phaseEntry.endedAt
          ? new Date(phaseEntry.endedAt).getTime()
          : Infinity;

        // Filter logs for this phase within this cycle's time range
        const allPhaseLogs = vm.phaseLogs[phaseName] || [];
        const cycleLogs = allPhaseLogs.filter(log => {
          const logTime = new Date(log.timestamp).getTime();
          return logTime >= phaseStart && logTime <= phaseEnd;
        });

        // Group logs by message
        const grouped = groupLogEntries(cycleLogs);

        const durationMs =
          phaseEntry.startedAt && phaseEntry.endedAt
            ? new Date(phaseEntry.endedAt).getTime() -
              new Date(phaseEntry.startedAt).getTime()
            : undefined;

        phases.push({
          phase: phaseName,
          logs: cycleLogs,
          groupedLogs: grouped,
          startedAt: new Date(phaseEntry.startedAt),
          endedAt: phaseEntry.endedAt ? new Date(phaseEntry.endedAt) : undefined,
          durationMs,
        });
      }

      const totalLogs = phases.reduce((sum, p) => sum + p.logs.length, 0);
      const cycleDurationMs = cycleEnd > 0 && cycleStart < Infinity
        ? cycleEnd - cycleStart
        : undefined;

      result.push({
        iteration: iter,
        startedAt: cycleStart < Infinity ? new Date(cycleStart) : undefined,
        endedAt: cycleEnd > 0 ? new Date(cycleEnd) : undefined,
        durationMs: cycleDurationMs,
        phases,
        totalLogs,
      });
    }

    return result;
  }, [vm.phaseHistory, vm.phaseLogs]);

  // Total logs and cycle count
  const totalLogs = cycles.reduce((sum, c) => sum + c.totalLogs, 0);
  const cycleCount = cycles.length;

  // Build warmInfo: prefer vm.warmInfo (from SetCheckpoint logs / YAML),
  // fall back to deriving it from the computed cycles data
  const warmInfo = useMemo((): WarmInfo | undefined => {
    if (vm.warmInfo && vm.warmInfo.precopies.length > 0) {
      return vm.warmInfo;
    }
    // Build from cycles data
    if (cycles.length === 0) return undefined;

    const precopies = cycles.map(cycle => {
      // Check if the cycle completed (has AddCheckpoint with endedAt)
      const hasCompleted = cycle.phases.some(
        p => p.phase === Phases.AddCheckpoint && p.endedAt
      );
      return {
        iteration: cycle.iteration,
        snapshot: `iteration-${cycle.iteration}`,
        startedAt: cycle.startedAt,
        endedAt: cycle.endedAt,
        durationMs: cycle.durationMs,
        disks: [] as string[],
        _completed: hasCompleted,
      };
    });

    const successes = precopies.filter(p => p._completed).length;
    // Don't count the last in-progress iteration as a failure
    const inProgress = precopies.length > 0 && !precopies[precopies.length - 1]._completed ? 1 : 0;
    const failures = precopies.length - successes - inProgress;

    return {
      precopies: precopies.map(({ _completed: _, ...rest }) => rest),
      successes,
      failures: failures > 0 ? failures : 0,
      consecutiveFailures: 0,
    };
  }, [vm.warmInfo, cycles]);

  const hasWarmInfo = warmInfo != null && warmInfo.precopies.length > 0;
  const [activeTab, setActiveTab] = useState<'visual' | 'logs'>(cycles.length > 0 ? 'visual' : 'logs');

  // Level counts across all cycles
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, error: 0, warning: 0, info: 0, debug: 0 };
    for (const cycle of cycles) {
      for (const phase of cycle.phases) {
        for (const log of phase.logs) {
          counts.all++;
          const level = log.level === 'warn' ? 'warning' : log.level;
          if (counts[level] !== undefined) {
            counts[level]++;
          }
        }
      }
    }
    return counts;
  }, [cycles]);

  // Filter grouped logs
  const filterGroupedLogs = useCallback(
    (groups: GroupedLogEntry[]): GroupedLogEntry[] => {
      let result = groups;

      if (levelFilter !== 'all') {
        result = result.filter(
          g =>
            g.level === levelFilter ||
            (levelFilter === 'warning' && g.level === 'warn')
        );
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        result = result.filter(g => g.message.toLowerCase().includes(query));
      }

      return result;
    },
    [levelFilter, searchQuery]
  );

  // Check if a phase has any matching logs after filters
  const phaseHasMatchingLogs = useCallback(
    (phase: CyclePhaseData): boolean => {
      return filterGroupedLogs(phase.groupedLogs).length > 0;
    },
    [filterGroupedLogs]
  );

  // Check if a cycle has any matching logs after filters
  const cycleHasMatchingLogs = useCallback(
    (cycle: CycleData): boolean => {
      return cycle.phases.some(p => phaseHasMatchingLogs(p));
    },
    [phaseHasMatchingLogs]
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${vm.name} - Precopy Cycles`}
      subtitle={hasWarmInfo
        ? `Warm Migration - ${warmInfo!.precopies.length} precopy iteration${warmInfo!.precopies.length !== 1 ? 's' : ''}`
        : `${cycleCount} cycle${cycleCount !== 1 ? 's' : ''} across ${PrecopyLoopPhases.length} phases (${totalLogs} total logs)`
      }
      maxWidth="5xl"
    >
      {/* Tab switcher */}
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
              Raw Logs ({totalLogs})
            </span>
          </button>
        </div>
      )}

      {/* Precopy Overview tab */}
      {hasWarmInfo && activeTab === 'visual' && (
        <PrecopyOverview warmInfo={warmInfo!} />
      )}

      {/* Raw Logs tab */}
      {(!hasWarmInfo || activeTab === 'logs') && (
        <>
          <LogFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            levelFilter={levelFilter}
            onLevelFilterChange={setLevelFilter}
            levelCounts={levelCounts}
          />

          {/* Cycles list */}
          <div className="p-4 space-y-4">
            {cycles.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                No precopy cycles found
              </div>
            ) : (
              cycles.map(cycle => {
                const isExpanded = expandedCycles.has(cycle.iteration);
                const hasMatches = cycleHasMatchingLogs(cycle);

                if (!hasMatches && (searchQuery.trim() || levelFilter !== 'all')) {
                  return null;
                }

                return (
                  <div
                    key={cycle.iteration}
                    className="border border-cyan-200 dark:border-cyan-800 rounded-lg overflow-hidden"
                  >
                    {/* Cycle header */}
                    <button
                      onClick={() => toggleCycle(cycle.iteration)}
                      className="w-full px-4 py-3 bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-between hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className={`w-4 h-4 text-cyan-600 dark:text-cyan-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                          Cycle {cycle.iteration}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500 text-white">
                          {cycle.totalLogs} log{cycle.totalLogs !== 1 ? 's' : ''}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-gray-300">
                          {cycle.phases.length} phase{cycle.phases.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-gray-400">
                        {cycle.durationMs && (
                          <span className="text-cyan-600 dark:text-cyan-400 font-medium">
                            {formatDuration(cycle.durationMs)}
                          </span>
                        )}
                        <span className="text-xs">
                          {cycle.startedAt && formatDateTime(cycle.startedAt.toISOString())}
                          {cycle.endedAt &&
                            ` - ${formatDateTime(cycle.endedAt.toISOString())}`}
                        </span>
                      </div>
                    </button>

                    {/* Cycle content - phases */}
                    {isExpanded && (
                      <div className="p-3 space-y-2 bg-white dark:bg-slate-800">
                        {cycle.phases.map(phase => {
                          const phaseKey = `${cycle.iteration}-${phase.phase}`;
                          const isPhaseExpanded = expandedPhases.has(phaseKey);
                          const filteredLogs = filterGroupedLogs(phase.groupedLogs);
                          const phaseLogCount = phase.logs.length;

                          if (
                            filteredLogs.length === 0 &&
                            (searchQuery.trim() || levelFilter !== 'all')
                          ) {
                            return null;
                          }

                          return (
                            <div
                              key={phaseKey}
                              className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
                            >
                              {/* Phase header */}
                              <button
                                onClick={() => togglePhase(phaseKey)}
                                className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <svg
                                    className={`w-3.5 h-3.5 text-slate-500 dark:text-gray-400 transition-transform ${isPhaseExpanded ? 'rotate-90' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                  <span className="font-medium text-sm text-slate-800 dark:text-gray-200">
                                    {phase.phase}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                    {phaseLogCount} log{phaseLogCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-gray-400">
                                  {phase.durationMs != null && (
                                    <span className="text-green-600 dark:text-green-400 font-medium">
                                      {formatDuration(phase.durationMs)}
                                    </span>
                                  )}
                                  {phase.startedAt && (
                                    <span>
                                      {formatDateTime(phase.startedAt.toISOString())}
                                      {phase.endedAt &&
                                        ` - ${formatDateTime(phase.endedAt.toISOString())}`}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* Phase logs */}
                              {isPhaseExpanded && (
                                <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-2 bg-slate-50 dark:bg-slate-800/50">
                                  {filteredLogs.length === 0 ? (
                                    <div className="text-center py-3 text-slate-500 dark:text-gray-400 text-sm">
                                      No logs matching your criteria
                                    </div>
                                  ) : (
                                    filteredLogs.map((group, idx) => (
                                      <LogGroupCard
                                        key={`${phaseKey}-${idx}`}
                                        group={group}
                                        isExpanded={expandedGroups.has(
                                          `${phaseKey}-${idx}`
                                        )}
                                        onToggle={() =>
                                          toggleGroup(`${phaseKey}-${idx}`)
                                        }
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
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Helper functions ──────────────────────────────────────────────────

function groupLogEntries(logs: RawLogEntry[]): GroupedLogEntry[] {
  const groups = new Map<string, GroupedLogEntry>();
  const order: string[] = [];

  for (const log of logs) {
    const key = `${log.level}:${log.message}`;
    const existing = groups.get(key);

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
      groups.set(key, {
        message: log.message,
        count: 1,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        level: log.level,
        entries: [log],
      });
      order.push(key);
    }
  }

  return order.map(k => groups.get(k)!);
}
