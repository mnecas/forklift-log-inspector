import { useMemo } from 'react';
import type { Plan, NetworkMapResource, StorageMapResource } from '../types';
import { useStore, useSearchQuery, useDevMode, useNetworkMaps, useStorageMaps } from '../store/useStore';
import { VMCard } from './VMCard';
import { ErrorSection } from './ErrorSection';
import { SchedulerView } from './SchedulerView';
import { getStatusBadgeClass } from '../utils/badgeUtils';
import { formatDateLocale } from '../utils/dateUtils';
import { SearchHighlight } from './common';

interface PlanCardProps {
  plan: Plan;
}

/**
 * Determine the data source label for a plan:
 *  - "Logs"       — only log-pipeline data
 *  - "YAML"       — only YAML-pipeline data
 *  - "YAML + Logs" — both pipelines contributed
 */
function getDataSourceLabel(plan: Plan): string {
  const vmList = Object.values(plan.vms);
  const hasYaml = !!plan.spec || vmList.some(vm => vm.fromYaml === true);
  const hasLogs =
    vmList.some(vm => !vm.fromYaml) ||
    !!plan.migration ||
    plan.panics.length > 0 ||
    (plan.scheduleHistory && plan.scheduleHistory.length > 0);

  if (hasYaml && hasLogs) return 'YAML + Logs';
  if (hasYaml) return 'YAML';
  return 'Logs';
}

export function PlanCard({ plan }: PlanCardProps) {
  const { togglePlanExpanded, isPlanExpanded } = useStore();
  const searchQuery = useSearchQuery();
  const devMode = useDevMode();
  const networkMaps = useNetworkMaps();
  const storageMaps = useStorageMaps();
  const planKey = `${plan.namespace}/${plan.name}`;
  const isExpanded = isPlanExpanded(planKey);

  const vms = useMemo(() => Object.values(plan.vms), [plan.vms]);

  const networkMapName = plan.spec?.networkMap;
  const storageMapName = plan.spec?.storageMap;

  const networkMap = useMemo(() => {
    if (networkMapName) {
      const found = networkMaps.find(m => m.name === networkMapName && m.namespace === plan.namespace);
      if (found) return found;
    }
    // Fallback: match by ownerPlanName
    return networkMaps.find(m => m.ownerPlanName === plan.name && m.namespace === plan.namespace);
  }, [networkMaps, networkMapName, plan.name, plan.namespace]);

  const storageMap = useMemo(() => {
    if (storageMapName) {
      const found = storageMaps.find(m => m.name === storageMapName && m.namespace === plan.namespace);
      if (found) return found;
    }
    // Fallback: match by ownerPlanName
    return storageMaps.find(m => m.ownerPlanName === plan.name && m.namespace === plan.namespace);
  }, [storageMaps, storageMapName, plan.name, plan.namespace]);

  const statusBadgeClass = getStatusBadgeClass(plan.status);
  const dataSource = devMode ? getDataSourceLabel(plan) : '';

  const hasPanics = plan.panics.length > 0;
  const hasErrors = plan.errors.some((e) => e.level === 'error');

  const hasStorageOffload = useMemo(
    () => vms.some((vm) => vm.transferMethod === 'StorageOffload'),
    [vms],
  );

  // Derive effective migration type: prefer plan-level, fall back to VMs
  const effectiveMigrationType = useMemo(() => {
    if (plan.migrationType !== 'Unknown') return plan.migrationType;
    for (const vm of vms) {
      if (vm.migrationType !== 'Unknown') return vm.migrationType;
    }
    return 'Unknown';
  }, [plan.migrationType, vms]);

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

          {effectiveMigrationType !== 'Unknown' && (
            <span className="px-2 py-1 rounded text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400">
              {effectiveMigrationType}
            </span>
          )}

          {hasStorageOffload && (
            <span className="px-2 py-1 rounded text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
              Storage Offload
            </span>
          )}

          {devMode && dataSource && (
            <span className={`px-2 py-1 rounded text-xs ${
              dataSource === 'YAML + Logs'
                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : dataSource === 'Logs'
                  ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                  : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
            }`}>
              {dataSource}
            </span>
          )}

          <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${statusBadgeClass}`}>
            {plan.status}
          </span>

          {plan.archived && (
            <span className="px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400">
              Archived
            </span>
          )}

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
              <span className="ml-2 text-slate-900 dark:text-gray-100">{formatDateLocale(plan.firstSeen) || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Last Seen:</span>
              <span className="ml-2 text-slate-900 dark:text-gray-100">{formatDateLocale(plan.lastSeen) || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-gray-400">Conditions:</span>
              <span className="ml-2 text-slate-900 dark:text-gray-100">{plan.conditions.length}</span>
            </div>
          </div>

          {/* Plan Settings (YAML spec) */}
          {plan.spec && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400">Plan Settings</h4>
              {plan.spec.description && (
                <p className="text-sm text-slate-600 dark:text-gray-300 italic">{plan.spec.description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {plan.spec.targetNamespace && (
                  <SpecPill label="Target NS" value={plan.spec.targetNamespace} />
                )}
                {plan.spec.sourceProvider && (
                  <SpecPill label="Source" value={plan.spec.sourceProvider} />
                )}
                {plan.spec.destinationProvider && (
                  <SpecPill label="Destination" value={plan.spec.destinationProvider} />
                )}
                {plan.spec.transferNetwork && (
                  <SpecPill label="Transfer Network" value={plan.spec.transferNetwork} />
                )}
                {plan.spec.targetPowerState && (
                  <SpecPill label="Power State" value={plan.spec.targetPowerState} />
                )}
                <BoolPill label="Preflight Inspection" value={plan.spec.runPreflightInspection} />
                <BoolPill label="Compatibility Mode" value={plan.spec.useCompatibilityMode} />
                <BoolPill label="Preserve Static IPs" value={plan.spec.preserveStaticIPs} />
                <BoolPill label="Preserve Cluster CPU" value={plan.spec.preserveClusterCPUModel} />
                <BoolPill label="Skip Guest Conversion" value={plan.spec.skipGuestConversion} />
                <BoolPill label="Shared Disks" value={plan.spec.migrateSharedDisks} />
                <BoolPill label="Delete Conversion Pod" value={plan.spec.deleteGuestConversionPod} />
                <BoolPill label="Delete VM on Failure" value={plan.spec.deleteVmOnFailMigration} />
                <BoolPill label="Legacy Drivers" value={plan.spec.installLegacyDrivers} />
              </div>
              <MapSection label="Network Map" kind="network" mapResource={networkMap} fallbackName={plan.spec.networkMap} />
              <MapSection label="Storage Map" kind="storage" mapResource={storageMap} fallbackName={plan.spec.storageMap} />
            </div>
          )}

          {/* Maps (shown even for log-derived plans via ownerPlanName matching) */}
          {(networkMap || storageMap) && !plan.spec && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400">Resource Maps</h4>
              <MapSection label="Network Map" kind="network" mapResource={networkMap} fallbackName={undefined} />
              <MapSection label="Storage Map" kind="storage" mapResource={storageMap} fallbackName={undefined} />
            </div>
          )}

          {/* Conditions */}
          {plan.conditions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400">Conditions</h4>
              <div className="flex flex-wrap gap-2">
                {plan.conditions.map((cond, idx) => {
                  let colorClass = 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400';
                  if (cond.status === 'True') {
                    if (cond.type === 'Failed') {
                      colorClass = 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400';
                    } else if (cond.type === 'Canceled') {
                      // keep default gray
                    } else if (cond.type === 'Ready' || cond.type === 'Succeeded' || cond.type === 'Executing') {
                      colorClass = 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400';
                    } else {
                      colorClass = 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400';
                    }
                  }
                  return (
                    <div
                      key={idx}
                      className={`px-3 py-1.5 rounded-lg text-xs ${colorClass}`}
                      title={cond.message}
                    >
                      {cond.type}: {cond.status}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scheduler View */}
          {plan.scheduleHistory && plan.scheduleHistory.length > 0 && (
            <SchedulerView scheduleHistory={plan.scheduleHistory} />
          )}

          {/* Errors and Panics — collapsed by default when plan succeeds */}
          <ErrorSection errors={plan.errors} panics={plan.panics} defaultOpen={plan.status === 'Failed'} />

          {/* VMs */}
          {vms.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-500 dark:text-gray-400">
                Virtual Machines ({vms.length})
              </h4>
              <div className="space-y-3">
                {vms.map((vm) => (
                  <VMCard key={vm.id} vm={vm} planName={plan.name} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Spec display helpers ──────────────────────────────────────────────

function SpecPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300">
      <span className="font-medium text-slate-500 dark:text-gray-400">{label}:</span>
      {value}
    </span>
  );
}

function BoolPill({ label, value }: { label: string; value?: boolean }) {
  if (value === undefined) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
        value
          ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-gray-400'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-green-500' : 'bg-slate-400 dark:bg-gray-500'}`} />
      {label}
    </span>
  );
}

function MapSection({
  label,
  kind,
  mapResource,
  fallbackName
}: {
  label: string;
  kind: 'network' | 'storage';
  mapResource?: NetworkMapResource | StorageMapResource;
  fallbackName?: string;
}) {
  if (!mapResource && !fallbackName) return null;

  if (!mapResource) {
    return <SpecPill label={label} value={fallbackName!} />;
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-500 dark:text-gray-400">{label}: {mapResource.name}</div>
      <div className="space-y-1">
        {mapResource.entries.map((entry, idx) => {
          // Resolve source name from references if available
          const resolvedSourceName = kind === 'network'
            ? (mapResource as NetworkMapResource).references?.find(r => r.id === entry.source.id)?.name
            : undefined;
          const sourceName = resolvedSourceName || entry.source.name || entry.source.id || 'unknown';

          // Build destination label
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
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-gray-300 truncate max-w-[200px]" title={sourceName}>
                {sourceName}
              </span>
              <svg className="w-3 h-3 text-slate-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 truncate max-w-[200px]" title={destLabel}>
                {destLabel}
              </span>
            </div>
          );
        })}
      </div>
      {/* Show conditions if any are not Ready */}
      {mapResource.conditions.length > 0 && mapResource.conditions.some(c => !(c.type === 'Ready' && c.status === 'True')) && (
        <div className="flex flex-wrap gap-1 mt-1">
          {mapResource.conditions.map((cond, idx) => {
            let colorClass = 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400';
            if (cond.status === 'True' && cond.type === 'Failed') {
              colorClass = 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400';
            }
            return (
              <span key={idx} className={`px-2 py-0.5 rounded text-xs ${colorClass}`} title={cond.message}>
                {cond.type}: {cond.status}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
