import { useState, useMemo } from 'react';
import type { ScheduleSnapshot } from '../types';
import { formatTimestamp } from '../utils/dateUtils';

interface SchedulerViewProps {
  scheduleHistory: ScheduleSnapshot[];
}

interface VMScheduleEntry {
  id: string;
  name: string;
  scheduledAt: string;
  order: number;
}

interface HostCapacityPoint {
  timestamp: string;
  inflight: number;
  pending: number;
}

export function SchedulerView({ scheduleHistory }: SchedulerViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'hosts' | 'events'>('timeline');

  const analysis = useMemo(() => {
    const scheduledVMs: VMScheduleEntry[] = [];
    const allHosts = new Set<string>();
    let maxInflight = 0;
    let schedulerFullCount = 0;

    const capacityByHost = new Map<string, HostCapacityPoint[]>();

    let vmOrder = 0;
    for (const snap of scheduleHistory) {
      if (snap.type === 'vm_scheduled' && snap.scheduledVM) {
        vmOrder++;
        scheduledVMs.push({
          id: snap.scheduledVM.id,
          name: snap.scheduledVM.name,
          scheduledAt: snap.timestamp,
          order: vmOrder,
        });
      }

      if (snap.type === 'schedule_built') {
        for (const [host, count] of Object.entries(snap.inflight)) {
          allHosts.add(host);
          maxInflight = Math.max(maxInflight, count);
          if (!capacityByHost.has(host)) capacityByHost.set(host, []);
          capacityByHost.get(host)!.push({
            timestamp: snap.timestamp,
            inflight: count,
            pending: snap.pending[host] || 0,
          });
        }
        for (const [host, count] of Object.entries(snap.pending)) {
          allHosts.add(host);
          if (!capacityByHost.has(host)) capacityByHost.set(host, []);
          const existing = capacityByHost.get(host)!;
          const lastEntry = existing[existing.length - 1];
          if (lastEntry && lastEntry.timestamp === snap.timestamp) {
            lastEntry.pending = count;
          } else {
            existing.push({
              timestamp: snap.timestamp,
              inflight: snap.inflight[host] || 0,
              pending: count,
            });
          }
        }
      }

      if (snap.type === 'scheduler_full') {
        schedulerFullCount++;
      }
    }

    const buildEvents = scheduleHistory.filter(s => s.type === 'schedule_built');
    const lastBuild = buildEvents[buildEvents.length - 1];

    return {
      scheduledVMs,
      allHosts: Array.from(allHosts),
      maxInflight,
      schedulerFullCount,
      capacityByHost,
      totalScheduleBuilds: buildEvents.length,
      lastBuild,
    };
  }, [scheduleHistory]);

  const totalScheduledVMs = analysis.scheduledVMs.length;
  const summaryParts: string[] = [];
  if (totalScheduledVMs > 0) summaryParts.push(`${totalScheduledVMs} VM${totalScheduledVMs !== 1 ? 's' : ''} scheduled`);
  if (analysis.allHosts.length > 0) summaryParts.push(`${analysis.allHosts.length} host${analysis.allHosts.length !== 1 ? 's' : ''}`);
  if (analysis.lastBuild) summaryParts.push(`${analysis.lastBuild.totalInflight} in-flight`);

  return (
    <div className="space-y-2">
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
        <span>Scheduler ({analysis.totalScheduleBuilds} snapshot{analysis.totalScheduleBuilds !== 1 ? 's' : ''})</span>
        {summaryParts.length > 0 && (
          <span className="text-xs text-slate-400 dark:text-gray-500">
            ({summaryParts.join(', ')})
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="pl-5 space-y-3">
          {/* Summary cards */}
          <div className="flex gap-3 flex-wrap">
            <SummaryCard
              label="VMs Scheduled"
              value={totalScheduledVMs}
              color="green"
              icon={<MonitorIcon />}
            />
            <SummaryCard
              label="Hosts"
              value={analysis.allHosts.length}
              color="blue"
              icon={<ServerIcon />}
            />
            <SummaryCard
              label="Peak In-flight"
              value={analysis.maxInflight}
              color="cyan"
              icon={<ActivityIcon />}
            />
            {analysis.schedulerFullCount > 0 && (
              <SummaryCard
                label="Scheduler Full"
                value={analysis.schedulerFullCount}
                color="amber"
                icon={<PauseIcon />}
              />
            )}
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
            <TabButton label="VM Timeline" active={activeTab === 'timeline'} onClick={() => setActiveTab('timeline')} />
            <TabButton label="Host Capacity" active={activeTab === 'hosts'} onClick={() => setActiveTab('hosts')} />
            <TabButton label="Events" active={activeTab === 'events'} onClick={() => setActiveTab('events')} />
          </div>

          {/* Tab content */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            {activeTab === 'timeline' && (
              <VMTimeline vms={analysis.scheduledVMs} />
            )}
            {activeTab === 'hosts' && (
              <HostCapacity
                capacityByHost={analysis.capacityByHost}
                hosts={analysis.allHosts}
                maxInflight={analysis.maxInflight}
              />
            )}
            {activeTab === 'events' && (
              <EventLog events={scheduleHistory} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── VM Timeline ──────────────────────────────────────────────────────

function VMTimeline({ vms }: { vms: VMScheduleEntry[] }) {
  if (vms.length === 0) {
    return (
      <div className="text-xs text-slate-400 dark:text-gray-500 italic py-4 text-center">
        No VMs were scheduled in this migration
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-3">
        VM Scheduling Order
      </div>
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-green-400 via-blue-400 to-slate-300 dark:from-green-500 dark:via-blue-500 dark:to-slate-600 rounded-full" />

        <div className="space-y-2">
          {vms.map((vm, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === vms.length - 1;
            return (
              <div key={`${vm.id}-${idx}`} className="relative flex items-start gap-3 pl-0">
                {/* Timeline dot */}
                <div className={`relative z-10 flex-shrink-0 w-[38px] flex items-center justify-center`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center
                    ${isFirst
                      ? 'border-green-500 bg-green-100 dark:bg-green-900/40'
                      : isLast
                        ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/40'
                        : 'border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-700'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full
                      ${isFirst ? 'bg-green-500' : isLast ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-500'}
                    `} />
                  </div>
                </div>

                {/* VM card */}
                <div className="flex-1 min-w-0 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 flex items-center gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-gray-300 text-[10px] font-bold flex items-center justify-center">
                    {vm.order}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-gray-200 truncate">
                      {vm.name || vm.id}
                    </div>
                    {vm.name && vm.id && (
                      <div className="text-[11px] text-slate-400 dark:text-gray-500 truncate">{vm.id}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-[11px] text-slate-400 dark:text-gray-500 tabular-nums">
                    {formatTime(vm.scheduledAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Host Capacity ────────────────────────────────────────────────────

function HostCapacity({
  capacityByHost,
  hosts,
  maxInflight,
}: {
  capacityByHost: Map<string, HostCapacityPoint[]>;
  hosts: string[];
  maxInflight: number;
}) {
  if (hosts.length === 0) {
    return (
      <div className="text-xs text-slate-400 dark:text-gray-500 italic py-4 text-center">
        No host capacity data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hosts.map(host => {
        const points = capacityByHost.get(host) || [];
        const lastPoint = points[points.length - 1];

        return (
          <div key={host} className="space-y-2">
            <div className="flex items-center gap-2">
              <ServerIcon className="w-3.5 h-3.5 text-slate-500 dark:text-gray-400" />
              <span className="text-xs font-medium text-slate-700 dark:text-gray-300">{host}</span>
            </div>

            {/* Capacity bar chart */}
            <div className="space-y-1.5">
              {points.map((point, idx) => {
                const barMax = Math.max(maxInflight, point.inflight + point.pending, 1);
                const inflightPct = (point.inflight / barMax) * 100;
                const pendingPct = (point.pending / barMax) * 100;

                return (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-gray-500 tabular-nums w-16 text-right flex-shrink-0">
                      {formatTime(point.timestamp)}
                    </span>
                    <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                      {inflightPct > 0 && (
                        <div
                          className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-300 flex items-center justify-center"
                          style={{ width: `${inflightPct}%`, minWidth: inflightPct > 0 ? '8px' : 0 }}
                        >
                          {point.inflight > 0 && (
                            <span className="text-[9px] font-bold text-white px-1">{point.inflight}</span>
                          )}
                        </div>
                      )}
                      {pendingPct > 0 && (
                        <div
                          className="h-full bg-amber-400 dark:bg-amber-500 transition-all duration-300 flex items-center justify-center"
                          style={{ width: `${pendingPct}%`, minWidth: pendingPct > 0 ? '8px' : 0 }}
                        >
                          {point.pending > 0 && (
                            <span className="text-[9px] font-bold text-white px-1">{point.pending}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {lastPoint && (
              <div className="flex gap-3 pl-[72px]">
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                  <span className="w-2 h-2 rounded-sm bg-blue-500 dark:bg-blue-400" />
                  In-flight: {lastPoint.inflight}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                  <span className="w-2 h-2 rounded-sm bg-amber-400 dark:bg-amber-500" />
                  Pending: {lastPoint.pending}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Event Log ────────────────────────────────────────────────────────

function EventLog({ events }: { events: ScheduleSnapshot[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayEvents = showAll ? events : events.slice(0, 20);

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-2">
        Scheduling Events ({events.length})
      </div>
      <div className="space-y-1">
        {displayEvents.map((event, idx) => (
          <EventRow key={idx} event={event} />
        ))}
      </div>
      {events.length > 20 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Show all {events.length} events
        </button>
      )}
    </div>
  );
}

function EventRow({ event }: { event: ScheduleSnapshot }) {
  const config = eventTypeConfig[event.type];

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/50 dark:hover:bg-slate-700/30 transition-colors">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${config.bgClass}`}>
        {config.icon}
      </div>
      <span className="text-[11px] text-slate-400 dark:text-gray-500 tabular-nums flex-shrink-0 w-20">
        {formatTime(event.timestamp)}
      </span>
      <span className="text-xs text-slate-700 dark:text-gray-300 flex-1 min-w-0">
        {config.label}
        {event.type === 'schedule_built' && (
          <span className="text-slate-400 dark:text-gray-500">
            {' '}&mdash; {event.totalInflight} in-flight, {event.totalPending} pending
          </span>
        )}
        {event.type === 'vm_scheduled' && event.scheduledVM && (
          <span className="ml-1 font-medium text-green-700 dark:text-green-400">
            {event.scheduledVM.name || event.scheduledVM.id}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────

const eventTypeConfig: Record<ScheduleSnapshot['type'], {
  label: string;
  bgClass: string;
  icon: React.ReactNode;
}> = {
  schedule_built: {
    label: 'Schedule built',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    icon: <svg className="w-3 h-3 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>,
  },
  vm_scheduled: {
    label: 'VM scheduled:',
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    icon: <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>,
  },
  scheduler_full: {
    label: 'Scheduler at capacity',
    bgClass: 'bg-amber-100 dark:bg-amber-900/30',
    icon: <svg className="w-3 h-3 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
};

function formatTime(ts: string): string {
  const full = formatTimestamp(ts);
  const parts = full.split(' ');
  return parts.length > 1 ? parts[1].slice(0, 12) : full;
}

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'cyan' | 'amber';
  icon: React.ReactNode;
}) {
  const colorMap = {
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colorMap[color]}`}>
      {icon}
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-xs opacity-80">{label}</span>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  );
}

// ── Icons ────────────────────────────────────────────────────────────

function MonitorIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "w-3.5 h-3.5"} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
