import { useSummary } from '../store/useStore';

export function StatsBar() {
  const summary = useSummary();

  const stats = [
    { label: 'Total Plans', value: summary.totalPlans, color: 'text-slate-900 dark:text-gray-100' },
    { label: 'Running', value: summary.running, color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Succeeded', value: summary.succeeded, color: 'text-green-600 dark:text-green-400' },
    { label: 'Failed', value: summary.failed, color: 'text-red-600 dark:text-red-400' },
    { label: 'Archived', value: summary.archived, color: 'text-slate-500 dark:text-gray-400' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center"
          >
            <div className={`text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-sm text-slate-500 dark:text-gray-400 mt-1">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
