import type { GroupedLogEntry } from '../../types';
import { formatDateTime } from '../../utils/dateUtils';
import { getLevelColorClasses, getLevelSolidBadgeClass } from '../../utils/badgeUtils';
import { CopyButton } from './CopyButton';
import { SearchHighlight } from './SearchHighlight';
import { formatRawJson } from './JsonViewer';

export interface LogGroupCardProps {
  group: GroupedLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  searchQuery: string;
}

export function LogGroupCard({ group, isExpanded, onToggle, searchQuery }: LogGroupCardProps) {
  const levelClass = getLevelColorClasses(group.level);
  const badgeClass = getLevelSolidBadgeClass(group.level);

  const timeRange =
    group.firstSeen && group.lastSeen
      ? `${formatDateTime(group.firstSeen)} - ${formatDateTime(group.lastSeen)}`
      : group.firstSeen
        ? formatDateTime(group.firstSeen)
        : '';

  return (
    <div className={`rounded-lg border overflow-hidden ${levelClass}`}>
      {/* Header row */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Level badge */}
        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${badgeClass}`}>
          {group.level === 'warn' ? 'warning' : group.level}
        </span>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-slate-900 dark:text-gray-100">
            <SearchHighlight text={group.message} searchQuery={searchQuery} />
          </span>
        </div>

        {/* Count badge */}
        {group.count > 1 && (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-500 text-white flex-shrink-0">
            {group.count}x
          </span>
        )}

        {/* Time range */}
        <span className="text-xs text-slate-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
          {timeRange}
        </span>
      </div>

      {/* Expandable entries section */}
      {group.count > 0 && (
        <div className="border-t border-inherit">
          <button
            onClick={onToggle}
            className="w-full px-4 py-2 text-left text-sm text-blue-600 dark:text-blue-400 hover:bg-white/50 dark:hover:bg-black/10 flex items-center gap-1"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isExpanded ? 'Hide' : 'Show all'} {group.count} {group.count === 1 ? 'entry' : 'entries'}
          </button>

          {isExpanded && (
            <div className="bg-white/50 dark:bg-black/20 divide-y divide-slate-200 dark:divide-slate-700">
              {group.entries.map((entry, entryIdx) => (
                <div key={entryIdx} className="px-4 py-3 flex gap-4">
                  {/* Timestamp */}
                  <div className="text-sm text-slate-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0 w-40">
                    {formatDateTime(entry.timestamp)}
                  </div>

                  {/* Raw JSON */}
                  <div className="flex-1 min-w-0 relative group">
                    <pre className="text-xs bg-slate-100 dark:bg-slate-800 rounded p-3 overflow-x-auto text-slate-800 dark:text-gray-200 font-mono whitespace-pre-wrap">
                      {formatRawJson(entry.rawLine)}
                    </pre>
                    <CopyButton
                      text={formatRawJson(entry.rawLine)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      label="Copy JSON"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
