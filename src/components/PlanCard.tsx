import { useMemo } from 'react';
import type { Plan } from '../types';
import { useStore, useSearchQuery } from '../store/useStore';
import { VMCard } from './VMCard';
import { ErrorSection } from './ErrorSection';
import { getStatusBadgeClass } from '../utils/badgeUtils';
import { SearchHighlight } from './common';

interface PlanCardProps {
  plan: Plan;
}

export function PlanCard({ plan }: PlanCardProps) {
  const { togglePlanExpanded, isPlanExpanded } = useStore();
  const searchQuery = useSearchQuery();
  const planKey = `${plan.namespace}/${plan.name}`;
  const isExpanded = isPlanExpanded(planKey);

  const vms = useMemo(() => Object.values(plan.vms), [plan.vms]);

  const statusBadgeClass = getStatusBadgeClass(plan.status);

  const hasPanics = plan.panics.length > 0;
  const hasErrors = plan.errors.some((e) => e.level === 'error');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Plan Header */}
      <button
        onClick={() => togglePlanExpanded(planKey)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-gray-100">
                <SearchHighlight text={plan.name} searchQuery={searchQuery} />
              </h3>
              {hasPanics && (
                <span className="px-2 py-0.5 rounded text-xs bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {plan.panics.length}
                </span>
              )}
              {hasErrors && !hasPanics && (
                <span className="px-2 py-0.5 rounded text-xs bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-gray-400">
              <SearchHighlight text={plan.namespace} searchQuery={searchQuery} />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-slate-500 dark:text-gray-400">
            <div>{vms.length} VM{vms.length !== 1 ? 's' : ''}</div>
          </div>

          {plan.migrationType !== 'Unknown' && (
            <span className="px-2 py-1 rounded text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
              {plan.migrationType}
            </span>
          )}

          <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${statusBadgeClass}`}>
            {plan.status}
          </span>

          <svg
            className={`w-5 h-5 text-slate-400 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-200 dark:border-slate-700">
          {/* Plan info */}
          <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-gray-400">Migration:</span>
              <span className="ml-2 text-slate-900 dark:text-gray-100">{plan.migration || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">First Seen:</span>
              <span className="ml-2 text-slate-900 dark:text-gray-100">{plan.firstSeen.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Last Seen:</span>
              <span className="ml-2 text-slate-900 dark:text-gray-100">{plan.lastSeen.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Conditions:</span>
              <span className="ml-2 text-slate-900 dark:text-gray-100">{plan.conditions.length}</span>
            </div>
          </div>

          {/* Conditions */}
          {plan.conditions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400">Conditions</h4>
              <div className="flex flex-wrap gap-2">
                {plan.conditions.map((cond, idx) => (
                  <div
                    key={idx}
                    className={`
                      px-3 py-1.5 rounded-lg text-xs
                      ${cond.status === 'True'
                        ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                        : 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400'
                      }
                    `}
                    title={cond.message}
                  >
                    {cond.type}: {cond.status}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors and Panics */}
          <ErrorSection errors={plan.errors} panics={plan.panics} />

          {/* VMs */}
          {vms.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400">
                Virtual Machines ({vms.length})
              </h4>
              <div className="space-y-3">
                {vms.map((vm) => (
                  <VMCard key={vm.id} vm={vm} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
