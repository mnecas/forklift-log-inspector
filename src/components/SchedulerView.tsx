import { useState } from 'react';
import type { ScheduleSnapshot } from '../types';
import { formatTimestamp } from '../utils/dateUtils';

interface SchedulerViewProps {
  scheduleHistory: ScheduleSnapshot[];
}

export function SchedulerView({ scheduleHistory }: SchedulerViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(scheduleHistory.length - 1);

  const snapshot = scheduleHistory[selectedIdx];
  if (!snapshot) return null;

  const inflightHosts = Object.entries(snapshot.inflight);
  const pendingHosts = Object.entries(snapshot.pending);

  const totalInflight = inflightHosts.reduce((sum, [, vms]) => sum + Math.max(vms.length, 1), 0);
  const totalPending = pendingHosts.reduce((sum, [, vms]) => sum + Math.max(vms.length, 1), 0);

  return (
    <div className="space-y-2">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left text-sm font-medium text-slate-500 dark:text-gray-400 flex items-center gap-2 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 6L14 10L6 14V6Z" />
        </svg>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>Scheduler ({scheduleHistory.length} snapshot{scheduleHistory.length !== 1 ? 's' : ''})</span>
        <span className="text-xs text-slate-400 dark:text-gray-500">
          ({totalInflight} in-flight, {totalPending} pending)
        </span>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="pl-5 space-y-3">
          {/* Snapshot stepper */}
          {scheduleHistory.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIdx(Math.max(0, selectedIdx - 1))}
                disabled={selectedIdx === 0}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500 dark:text-gray-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs text-slate-500 dark:text-gray-400 font-medium tabular-nums">
                {selectedIdx + 1} / {scheduleHistory.length}
              </span>
              <button
                onClick={() => setSelectedIdx(Math.min(scheduleHistory.length - 1, selectedIdx + 1))}
                disabled={selectedIdx === scheduleHistory.length - 1}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500 dark:text-gray-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
            {/* Timestamp */}
            <div className="text-xs text-slate-500 dark:text-gray-400">
              {formatTimestamp(snapshot.timestamp)}
            </div>

            {/* Summary row */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                  {totalInflight} In-flight
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {totalPending} Pending
                </span>
              </div>
              {snapshot.nextVM && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">
                    Next: {snapshot.nextVM.name || snapshot.nextVM.id}
                  </span>
                </div>
              )}
            </div>

            {/* Host layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <HostColumn
                title="In-flight"
                hosts={inflightHosts}
                color="blue"
                emptyText="No VMs currently in-flight"
              />
              <HostColumn
                title="Pending"
                hosts={pendingHosts}
                color="amber"
                emptyText="No VMs pending"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HostColumn({ title, hosts, color, emptyText }: {
  title: string;
  hosts: [string, { id?: string; name?: string }[]][];
  color: 'blue' | 'amber';
  emptyText: string;
}) {
  const colorStyles = {
    blue: {
      header: 'text-blue-700 dark:text-blue-300',
      dot: 'bg-blue-500',
      hostBg: 'bg-blue-50 dark:bg-blue-900/20',
      hostBorder: 'border-blue-200 dark:border-blue-800',
      vmBg: 'bg-blue-100 dark:bg-blue-800/40',
      vmText: 'text-blue-800 dark:text-blue-200',
    },
    amber: {
      header: 'text-amber-700 dark:text-amber-300',
      dot: 'bg-amber-500',
      hostBg: 'bg-amber-50 dark:bg-amber-900/20',
      hostBorder: 'border-amber-200 dark:border-amber-800',
      vmBg: 'bg-amber-100 dark:bg-amber-800/40',
      vmText: 'text-amber-800 dark:text-amber-200',
    },
  };

  const s = colorStyles[color];

  if (hosts.length === 0) {
    return (
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.header}`}>
          {title}
        </div>
        <div className="text-xs text-slate-400 dark:text-gray-500 italic">
          {emptyText}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.header}`}>
        {title}
      </div>
      <div className="space-y-2">
        {hosts.map(([host, vms]) => (
          <div
            key={host}
            className={`rounded-lg border ${s.hostBorder} ${s.hostBg} p-2.5`}
          >
            {/* Host name */}
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="w-3.5 h-3.5 text-slate-500 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
              <span className="text-xs font-medium text-slate-700 dark:text-gray-300 truncate">
                {host}
              </span>
              <span className={`ml-auto flex-shrink-0 w-5 h-5 rounded-full ${s.dot} text-white text-[10px] font-bold flex items-center justify-center`}>
                {vms.length || '?'}
              </span>
            </div>

            {/* VMs */}
            {vms.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {vms.map((vm, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${s.vmBg} ${s.vmText}`}
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {vm.name || vm.id || `VM ${idx + 1}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
