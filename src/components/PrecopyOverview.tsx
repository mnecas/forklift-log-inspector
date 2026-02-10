import { useCallback, useState, useMemo } from 'react';
import type { WarmInfo, PrecopyInfo } from '../types';
import { formatTimestamp } from '../utils/dateUtils';
import { formatDuration } from '../parser/utils';

interface PrecopyOverviewProps {
  warmInfo: WarmInfo;
}

export function PrecopyOverview({ warmInfo }: PrecopyOverviewProps) {
  const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1]));

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

  // Compute total transfer duration
  const totalTransferDuration = useMemo(() => {
    return warmInfo.precopies.reduce((sum, p) => sum + (p.durationMs || 0), 0);
  }, [warmInfo]);

  // Collect all unique disk names across all precopies
  const allDisks = useMemo(() => {
    const diskSet = new Set<string>();
    for (const p of warmInfo.precopies) {
      for (const d of p.disks) diskSet.add(d);
    }
    return Array.from(diskSet);
  }, [warmInfo]);

  return (
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

            {/* Snapshot name (only show if it's a real snapshot, not iteration placeholder) */}
            {precopy.snapshot && !precopy.snapshot.startsWith('iteration-') && (
              <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">
                <span className="font-medium">Snapshot:</span> {precopy.snapshot}
              </div>
            )}

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

            {/* Snapshot (only show if it's a real snapshot, not iteration placeholder) */}
            {precopy.snapshot && !precopy.snapshot.startsWith('iteration-') && (
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
            )}

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
