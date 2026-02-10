import { useMemo, useState } from 'react';
import type { Event } from '../types';
import { formatDateTime } from '../utils/dateUtils';

interface EventTimelineProps {
  events: Event[];
}

const EVENT_TYPE_STYLES: Record<string, { bg: string; border: string; dot: string; icon: string }> = {
  'plan-created': {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    dot: 'bg-blue-500',
    icon: 'text-blue-500',
  },
  'vm-started': {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    dot: 'bg-green-500',
    icon: 'text-green-500',
  },
  'phase-transition': {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-200 dark:border-cyan-800',
    dot: 'bg-cyan-500',
    icon: 'text-cyan-500',
  },
  'error': {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    dot: 'bg-red-500',
    icon: 'text-red-500',
  },
  'vm-completed': {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-800',
    dot: 'bg-emerald-500',
    icon: 'text-emerald-500',
  },
};

const DEFAULT_STYLE = {
  bg: 'bg-slate-50 dark:bg-slate-800/50',
  border: 'border-slate-200 dark:border-slate-700',
  dot: 'bg-slate-400',
  icon: 'text-slate-400',
};

export function EventTimeline({ events }: EventTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  // Sort events chronologically
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [events],
  );

  // Unique event types for filter
  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of events) types.add(e.type);
    return Array.from(types).sort();
  }, [events]);

  // Filtered events
  const filteredEvents = useMemo(
    () => filterType === 'all' ? sortedEvents : sortedEvents.filter(e => e.type === filterType),
    [sortedEvents, filterType],
  );

  if (events.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        <svg
          className={`w-4 h-4 text-slate-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 6L14 10L6 14V6Z" />
        </svg>
        <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-300">
          Event Timeline
        </h3>
        <span className="text-xs text-slate-500 dark:text-gray-400">
          ({events.length} event{events.length !== 1 ? 's' : ''})
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {/* Type filter */}
          {eventTypes.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
                }`}
              >
                All ({events.length})
              </button>
              {eventTypes.map(type => {
                const count = events.filter(e => e.type === type).length;
                return (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      filterType === type
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
                    }`}
                  >
                    {type.replace(/-/g, ' ')} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Timeline */}
          <div className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-700 space-y-3 max-h-96 overflow-y-auto scrollbar-visible">
            {filteredEvents.map((event, idx) => {
              const style = EVENT_TYPE_STYLES[event.type] || DEFAULT_STYLE;
              return (
                <div key={idx} className="relative">
                  {/* Dot on the timeline */}
                  <div className={`absolute -left-[29px] top-3 w-3 h-3 rounded-full ${style.dot} border-2 border-white dark:border-slate-900`} />

                  {/* Event card */}
                  <div className={`rounded-lg border ${style.border} ${style.bg} px-4 py-2.5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold uppercase tracking-wider ${style.icon}`}>
                            {event.type.replace(/-/g, ' ')}
                          </span>
                          {event.planName && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-gray-300">
                              {event.namespace}/{event.planName}
                            </span>
                          )}
                          {event.vmName && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              {event.vmName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 dark:text-gray-300 mt-0.5">
                          {event.description}
                        </p>
                        {event.phase && (
                          <span className="text-xs text-slate-500 dark:text-gray-400">
                            Phase: {event.phase}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                        {formatDateTime(event.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
