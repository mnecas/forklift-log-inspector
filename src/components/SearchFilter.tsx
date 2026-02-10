import { useCallback, useMemo } from 'react';
import { useStore, usePlans, useSearchQuery, useStatusFilter } from '../store/useStore';

export function SearchFilter() {
  const plans = usePlans();
  const searchQuery = useSearchQuery();
  const statusFilter = useStatusFilter();
  const { setSearchQuery, setStatusFilter } = useStore();

  // Calculate counts for each status
  const statusCounts = useMemo(() => {
    const counts = {
      all: plans.length,
      Running: 0,
      Succeeded: 0,
      Failed: 0,
      Archived: 0,
    };

    for (const plan of plans) {
      if (plan.status in counts) {
        counts[plan.status as keyof typeof counts]++;
      }
    }

    return counts;
  }, [plans]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, [setSearchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  const filters = [
    { id: 'all', label: 'All', count: statusCounts.all },
    { id: 'Running', label: 'Running', count: statusCounts.Running },
    { id: 'Succeeded', label: 'Succeeded', count: statusCounts.Succeeded },
    { id: 'Failed', label: 'Failed', count: statusCounts.Failed },
    { id: 'Archived', label: 'Archived', count: statusCounts.Archived },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search input */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            id="global-search-input"
            type="text"
            placeholder="Search plans, VMs, namespaces..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg pl-10 pr-10 py-2 text-slate-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2 flex-wrap">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatusFilter(filter.id)}
              className={`
                px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${statusFilter === filter.id
                  ? 'bg-pink-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100'
                }
              `}
            >
              {filter.label}
              <span className="ml-1.5 opacity-70">({filter.count})</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
