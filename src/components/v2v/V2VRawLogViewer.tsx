import { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react';
import { useV2VStore } from '../../store/useV2VStore';
import type { V2VToolRun, V2VLineCategory } from '../../types/v2v';
import { highlightSearch } from './shared';
import { VirtualizedLogViewer, SearchNavControls } from './VirtualizedLogViewer';
import type { LogSearchMatchInfo } from './VirtualizedLogViewer';
import { LineLink } from './LineLink';

interface V2VRawLogViewerProps {
  toolRun: V2VToolRun;
}

const CATEGORY_FILTERS: { key: V2VLineCategory | 'all'; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: 'bg-slate-600' },
  { key: 'stage', label: 'Stages', color: 'bg-blue-500' },
  { key: 'nbdkit', label: 'nbdkit', color: 'bg-purple-500' },
  { key: 'libguestfs', label: 'libguestfs', color: 'bg-indigo-500' },
  { key: 'guestfsd', label: 'guestfsd', color: 'bg-cyan-500' },
  { key: 'command', label: 'Commands', color: 'bg-teal-500' },
  { key: 'kernel', label: 'Kernel', color: 'bg-slate-500' },
  { key: 'error', label: 'Errors', color: 'bg-red-500' },
  { key: 'warning', label: 'Warnings', color: 'bg-orange-500' },
  { key: 'monitor', label: 'Monitor', color: 'bg-green-500' },
  { key: 'info', label: 'Info', color: 'bg-sky-500' },
];

const LINE_COLORS: Record<V2VLineCategory, string> = {
  stage: 'text-blue-600 dark:text-blue-400',
  nbdkit: 'text-purple-600 dark:text-purple-400',
  libguestfs: 'text-indigo-600 dark:text-indigo-400',
  guestfsd: 'text-cyan-600 dark:text-cyan-400',
  command: 'text-teal-600 dark:text-teal-400',
  kernel: 'text-slate-500 dark:text-slate-500',
  info: 'text-sky-600 dark:text-sky-400',
  error: 'text-red-600 dark:text-red-400 font-semibold',
  warning: 'text-orange-600 dark:text-orange-400',
  monitor: 'text-green-600 dark:text-green-400',
  xml: 'text-slate-500 dark:text-gray-500',
  yaml: 'text-slate-500 dark:text-gray-500',
  other: 'text-slate-700 dark:text-gray-300',
};

/** Row height in pixels for virtual scrolling */
const ROW_HEIGHT = 20;
/** Container max-height in pixels */
const VIEWPORT_HEIGHT = 600;
/** Debounce delay for search input (ms) */
const SEARCH_DEBOUNCE_MS = 200;

interface FilteredLine {
  index: number;
  text: string;
  category: V2VLineCategory;
  globalLine: number;
}

export function V2VRawLogViewer({ toolRun }: V2VRawLogViewerProps) {
  const { componentFilter, searchQuery, highlightedLine, highlightVersion, setComponentFilter, setSearchQuery } =
    useV2VStore();
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset filters and search when the component mounts (e.g. opening the Raw Log section)
  useEffect(() => {
    setComponentFilter('all');
    setSearchQuery('');
    setLocalSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search input to avoid filtering on every keystroke
  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [setSearchQuery],
  );

  // Sync localSearch when store query changes externally
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Pre-compute category counts once (not on every render)
  const categoryCounts = useMemo(() => {
    const counts = new Map<V2VLineCategory | 'all', number>();
    counts.set('all', toolRun.rawLines.length);
    for (const cat of toolRun.lineCategories) {
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return counts;
  }, [toolRun.rawLines.length, toolRun.lineCategories]);

  // Filter lines by category only (search no longer filters — it highlights)
  const filteredLines = useMemo(() => {
    const lines: FilteredLine[] = [];
    const hasFilter = componentFilter !== 'all';

    for (let i = 0; i < toolRun.rawLines.length; i++) {
      const category = toolRun.lineCategories[i] || 'other';

      if (hasFilter && category !== componentFilter) continue;

      lines.push({
        index: i,
        text: toolRun.rawLines[i],
        category,
        globalLine: toolRun.startLine + i,
      });
    }
    return lines;
  }, [toolRun, componentFilter]);

  // Extract just the text for VirtualizedLogViewer
  const filteredTexts = useMemo(() => filteredLines.map((fl) => fl.text), [filteredLines]);

  // Build a globalLine → filteredIndex lookup for fast highlight jumps
  const highlightIndex = useMemo(() => {
    if (highlightedLine === null) return -1;
    for (let i = 0; i < filteredLines.length; i++) {
      if (filteredLines[i].globalLine === highlightedLine) return i;
      if (filteredLines[i].globalLine > highlightedLine) break;
    }
    return -1;
  }, [highlightedLine, filteredLines]);

  const lowerSearch = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  // Custom row renderer using FilteredLine data for colors and line numbers
  const renderRow = useCallback(
    ({ lineIndex, isMatch, isCurrent, searchQuery: rowQuery }: {
      text: string;
      lineIndex: number;
      isMatch: boolean;
      isCurrent: boolean;
      searchQuery: string;
    }) => {
      const fl = filteredLines[lineIndex];
      if (!fl) return null;
      return (
        <LogRow
          line={fl}
          isHighlighted={highlightedLine === fl.globalLine}
          isSearchMatch={isMatch}
          isCurrentMatch={isCurrent}
          searchQuery={rowQuery}
        />
      );
    },
    [filteredLines, highlightedLine],
  );

  // Custom header with search input + category filter pills
  const renderHeader = useCallback(
    (matchInfo: LogSearchMatchInfo) => (
      <div className="space-y-2 mb-2">
        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search log..."
              aria-label="Search log"
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && localSearch) {
                  e.stopPropagation();
                  handleSearchChange('');
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) matchInfo.goPrev();
                  else matchInfo.goNext();
                }
              }}
              className="flex-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
            />
            {lowerSearch && matchInfo.matchCount > 0 && (
              <SearchNavControls
                matchCount={matchInfo.matchCount}
                currentMatchIdx={matchInfo.currentMatchIdx}
                goNext={matchInfo.goNext}
                goPrev={matchInfo.goPrev}
              />
            )}
            {lowerSearch && matchInfo.matchCount === 0 && (
              <span className="text-[10px] text-red-400 dark:text-red-500 flex-shrink-0">No matches</span>
            )}
            {localSearch && (
              <button
                onClick={() => handleSearchChange('')}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                title="Clear search"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORY_FILTERS.map(({ key, label, color }) => {
              const isActive = componentFilter === key;
              const count = categoryCounts.get(key) || 0;
              if (count === 0 && key !== 'all') return null;

              return (
                <button
                  key={key}
                  onClick={() => setComponentFilter(key)}
                  className={`
                    px-2 py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1
                    ${isActive
                      ? `${color} text-white`
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }
                  `}
                >
                  {label}
                  <span className="opacity-60">({count.toLocaleString()})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="text-[10px] text-slate-400 dark:text-gray-500">
          {filteredLines.length.toLocaleString()} lines
          {filteredLines.length !== toolRun.rawLines.length &&
            ` (filtered from ${toolRun.rawLines.length.toLocaleString()})`}
        </div>
      </div>
    ),
    [localSearch, lowerSearch, componentFilter, categoryCounts, filteredLines.length, toolRun.rawLines.length, handleSearchChange, setComponentFilter],
  );

  return (
    <VirtualizedLogViewer
      lines={filteredTexts}
      search={searchQuery}
      onSearchChange={setSearchQuery}
      config={{
        rowHeight: ROW_HEIGHT,
        viewportHeight: VIEWPORT_HEIGHT,
        searchDebounceMs: SEARCH_DEBOUNCE_MS,
      }}
      renderHeader={renderHeader}
      renderRow={renderRow}
      scrollToLine={highlightIndex >= 0 ? highlightIndex : null}
      scrollToVersion={highlightVersion}
      showLineCount={false}
      emptyState={
        <div className="p-6 text-center text-slate-400 dark:text-gray-500 text-xs">
          No lines match the current filters.
        </div>
      }
      scrollContainerClassName="font-mono text-[11px] leading-[1.6] bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-auto"
    />
  );
}

// ── Memoized row component ─────────────────────────────────────────

interface LogRowProps {
  line: FilteredLine;
  isHighlighted: boolean;
  isSearchMatch: boolean;
  isCurrentMatch: boolean;
  searchQuery: string;
}

const LogRow = memo(function LogRow({ line, isHighlighted, isSearchMatch, isCurrentMatch, searchQuery }: LogRowProps) {
  let rowBg = '';
  if (isCurrentMatch) {
    rowBg = 'bg-yellow-200 dark:bg-yellow-900/40';
  } else if (isHighlighted) {
    rowBg = 'bg-yellow-100 dark:bg-yellow-900/30';
  } else if (isSearchMatch) {
    rowBg = 'bg-yellow-50 dark:bg-yellow-900/15';
  }

  return (
    <div
      className={`flex min-w-full hover:bg-slate-100 dark:hover:bg-slate-800/50 ${rowBg}`}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Line number gutter — sticky so it stays visible during horizontal scroll */}
      <div
        className="px-2 py-0 text-right select-none w-[60px] flex-shrink-0 whitespace-nowrap border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 z-10"
        style={{ position: 'sticky', left: 0 }}
      >
        <LineLink line={line.globalLine} label={String(line.globalLine + 1)} />
      </div>
      {/* Log text — no truncation, allows horizontal scroll */}
      <div
        className={`px-3 py-0 whitespace-nowrap ${LINE_COLORS[line.category]}`}
      >
        {searchQuery && isSearchMatch ? highlightSearch(line.text, searchQuery) : line.text}
      </div>
    </div>
  );
});
