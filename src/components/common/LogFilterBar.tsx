interface LogFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  levelFilter: string;
  onLevelFilterChange: (level: string) => void;
  levelCounts: Record<string, number>;
}

export function LogFilterBar({
  searchQuery,
  onSearchChange,
  levelFilter,
  onLevelFilterChange,
  levelCounts,
}: LogFilterBarProps) {
  return (
    <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3">
      <input
        type="text"
        placeholder="Search logs..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="flex-1 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex gap-1 flex-wrap">
        {Object.entries(levelCounts).map(([level, count]) =>
          count > 0 || level === 'all' ? (
            <button
              key={level}
              onClick={() => onLevelFilterChange(level)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium
                ${levelFilter === level
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
                }
              `}
            >
              {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}
