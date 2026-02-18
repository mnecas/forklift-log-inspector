import { useMemo, useState } from 'react';
import { usePlans, useSearchQuery, useStatusFilter, useNetworkMaps, useStorageMaps } from '../store/useStore';
import type { NetworkMapResource, StorageMapResource } from '../types';
import { PlanCard } from './PlanCard';
import { EmptyState } from './common';

export function PlansGrid() {
  const plans = usePlans();
  const searchQuery = useSearchQuery();
  const statusFilter = useStatusFilter();
  const networkMaps = useNetworkMaps();
  const storageMaps = useStorageMaps();

  const filteredPlans = useMemo(() => {
    let result = plans;

    // Apply status filter
    if (statusFilter === 'Archived') {
      result = result.filter((plan) => plan.archived);
    } else if (statusFilter !== 'all') {
      result = result.filter((plan) => plan.status === statusFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((plan) => {
        // Search in plan name
        if (plan.name.toLowerCase().includes(query)) return true;
        // Search in namespace
        if (plan.namespace.toLowerCase().includes(query)) return true;
        // Search in VM names
        for (const vm of Object.values(plan.vms)) {
          if (vm.name.toLowerCase().includes(query)) return true;
        }
        return false;
      });
    }

    return result;
  }, [plans, searchQuery, statusFilter]);

  if (plans.length === 0) {
    if (networkMaps.length === 0 && storageMaps.length === 0) {
      return (
        <div className="max-w-7xl mx-auto px-6">
          <EmptyState
            icon="document"
            title="No logs loaded"
            description="Upload a log file to get started"
          />
        </div>
      );
    }

    // Show standalone maps when no plans are loaded
    return (
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="space-y-4">
          {networkMaps.length > 0 && (
            <ResourceMapCard title="Network Maps" maps={networkMaps} kind="network" />
          )}
          {storageMaps.length > 0 && (
            <ResourceMapCard title="Storage Maps" maps={storageMaps} kind="storage" />
          )}
        </div>
      </div>
    );
  }

  if (filteredPlans.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6">
        <EmptyState
          icon="search"
          title="No matching plans"
          description="Try adjusting your search or filters"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      <div className="space-y-4">
        {filteredPlans.map((plan) => (
          <PlanCard key={`${plan.namespace}/${plan.name}`} plan={plan} />
        ))}
        {networkMaps.length > 0 && (
          <ResourceMapCard title="Network Maps" maps={networkMaps} kind="network" />
        )}
        {storageMaps.length > 0 && (
          <ResourceMapCard title="Storage Maps" maps={storageMaps} kind="storage" />
        )}
      </div>
    </div>
  );
}

function ResourceMapCard({ title, maps, kind }: { title: string; maps: (NetworkMapResource | StorageMapResource)[]; kind: 'network' | 'storage' }) {
  const [expandedMaps, setExpandedMaps] = useState<Set<string>>(new Set());

  const toggleMap = (key: string) => {
    setExpandedMaps(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-sm text-slate-500 dark:text-gray-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {maps.map((map) => {
          const mapKey = `${map.namespace}/${map.name}`;
          const isExpanded = expandedMaps.has(mapKey);

          return (
            <div key={mapKey}>
              <button
                onClick={() => toggleMap(mapKey)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-lg text-slate-900 dark:text-gray-100">{map.name}</span>
                    <span className="text-sm text-slate-500 dark:text-gray-400">{map.namespace}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {map.ownerPlanName && (
                    <span className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-gray-400">
                      Plan: {map.ownerPlanName}
                    </span>
                  )}
                  <span className="text-sm text-slate-500 dark:text-gray-400">
                    {map.entries.length} mapping{map.entries.length !== 1 ? 's' : ''}
                  </span>
                  {map.conditions.map((cond, idx) => {
                    let colorClass = 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400';
                    if (cond.status === 'True' && cond.type === 'Ready') {
                      colorClass = 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400';
                    } else if (cond.status === 'True' && cond.type === 'Failed') {
                      colorClass = 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400';
                    }
                    return (
                      <span key={idx} className={`px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${colorClass}`} title={cond.message}>
                        {cond.type}
                      </span>
                    );
                  })}
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

              {isExpanded && (
                <div className="px-5 pb-5 space-y-3 border-t border-slate-200 dark:border-slate-700">
                  {map.provider && (
                    <div className="pt-3 flex flex-wrap gap-2">
                      {map.provider.source && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300">
                          <span className="font-medium text-slate-500 dark:text-gray-400">Source:</span>
                          {map.provider.source.name}{map.provider.source.namespace ? ` (${map.provider.source.namespace})` : ''}
                        </span>
                      )}
                      {map.provider.destination && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300">
                          <span className="font-medium text-slate-500 dark:text-gray-400">Destination:</span>
                          {map.provider.destination.name}{map.provider.destination.namespace ? ` (${map.provider.destination.namespace})` : ''}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2">
                    <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-2">Mappings</h4>
                    <div className="space-y-1.5">
                      {map.entries.map((entry, idx) => {
                        const sourceName = kind === 'network'
                          ? ((map as NetworkMapResource).references?.find(r => r.id === entry.source.id)?.name || entry.source.name || entry.source.id || 'unknown')
                          : (entry.source.name || entry.source.id || 'unknown');

                        let destLabel: string;
                        if (kind === 'network') {
                          const dest = entry.destination as { type?: string; name?: string; namespace?: string };
                          destLabel = dest.type === 'pod'
                            ? 'Pod Network'
                            : `${dest.name || ''}${dest.type ? ` (${dest.type})` : ''}`;
                        } else {
                          const dest = entry.destination as { storageClass?: string; name?: string };
                          destLabel = dest.storageClass || dest.name || 'default';
                        }

                        return (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300 truncate max-w-[250px]" title={sourceName}>
                              {sourceName}
                            </span>
                            <svg className="w-4 h-4 text-slate-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            <span className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 truncate max-w-[250px]" title={destLabel}>
                              {destLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {map.conditions.length > 0 && (
                    <div className="pt-2">
                      <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400 mb-2">Conditions</h4>
                      <div className="flex flex-wrap gap-2">
                        {map.conditions.map((cond, idx) => {
                          let colorClass = 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400';
                          if (cond.status === 'True') {
                            if (cond.type === 'Failed') {
                              colorClass = 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400';
                            } else if (cond.type === 'Ready') {
                              colorClass = 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400';
                            }
                          }
                          return (
                            <div key={idx} className={`px-3 py-1.5 rounded-lg text-xs ${colorClass}`} title={cond.message}>
                              {cond.type}: {cond.status} {cond.message && `— ${cond.message}`}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
