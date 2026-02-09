import { useState, useMemo } from 'react';
import type { VM, RawLogEntry, PhaseIteration } from '../types';
import { PhasePipeline } from './PhasePipeline';
import { PhaseLogsModal } from './PhaseLogsModal';
import { CycleLogsModal } from './CycleLogsModal';
import { VMRawLogsModal } from './VMRawLogsModal';
import { formatDuration, computePhaseLogSummaries } from '../parser/utils';
import { formatDateLocale } from '../utils/dateUtils';
import { getResourceColorClass } from '../utils/badgeUtils';
import { PrecopyLoopPhasesSet } from '../parser/constants';

interface VMCardProps {
  vm: VM;
}

export function VMCard({ vm }: VMCardProps) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [showCycleLogs, setShowCycleLogs] = useState(false);
  const [showRawLogs, setShowRawLogs] = useState(false);

  // Calculate VM duration from first to last seen
  const duration = useMemo(() => {
    if (!vm.firstSeen) return null;
    const endTime = vm.lastSeen || new Date();
    const durationMs = endTime.getTime() - vm.firstSeen.getTime();
    return formatDuration(durationMs);
  }, [vm.firstSeen, vm.lastSeen]);

  // Compute phase log summaries
  const phaseSummaries = useMemo(() => {
    // Use pre-computed summaries if available, otherwise compute
    if (vm.phaseLogSummaries && Object.keys(vm.phaseLogSummaries).length > 0) {
      return vm.phaseLogSummaries;
    }
    return computePhaseLogSummaries(vm);
  }, [vm]);

  // Get logs for selected phase
  const selectedPhaseLogs = useMemo((): RawLogEntry[] => {
    if (!selectedPhase || !vm.phaseLogs) return [];
    return vm.phaseLogs[selectedPhase] || [];
  }, [selectedPhase, vm.phaseLogs]);

  // Get iterations for selected phase (if it's a precopy loop phase)
  const selectedPhaseIterations = useMemo((): PhaseIteration[] => {
    if (!selectedPhase || !PrecopyLoopPhasesSet.has(selectedPhase)) return [];
    
    const iterations: PhaseIteration[] = [];
    for (const ph of vm.phaseHistory || []) {
      if (ph.name === selectedPhase && ph.iteration) {
        const durationMs = ph.startedAt && ph.endedAt
          ? new Date(ph.endedAt).getTime() - new Date(ph.startedAt).getTime()
          : undefined;
        iterations.push({
          iteration: ph.iteration,
          startedAt: new Date(ph.startedAt),
          endedAt: ph.endedAt ? new Date(ph.endedAt) : undefined,
          durationMs,
        });
      }
    }
    return iterations.sort((a, b) => a.iteration - b.iteration);
  }, [selectedPhase, vm.phaseHistory]);

  // Count total logs across all phases
  const totalLogs = useMemo(() => {
    if (!vm.phaseLogs) return 0;
    return Object.values(vm.phaseLogs).reduce((sum, logs) => sum + logs.length, 0);
  }, [vm.phaseLogs]);

  return (
    <>
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 space-y-4">
        {/* VM Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h4 className="font-medium text-slate-900 dark:text-gray-100">
              {vm.name}
              <span className="ml-2 text-sm text-slate-500 dark:text-gray-400 font-normal">
                ({vm.id})
              </span>
            </h4>
            {vm.migrationType !== 'Unknown' && (
              <span className="px-2 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 uppercase font-semibold">
                {vm.migrationType}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm">
            {duration && (
              <span className="text-slate-500 dark:text-gray-400" title="Duration">
                {duration}
              </span>
            )}
            <button
              onClick={() => setShowRawLogs(true)}
              className="px-3 py-1 rounded-lg text-xs font-medium
                         bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500
                         text-slate-700 dark:text-gray-200 transition-colors flex items-center gap-1.5"
              title="View all raw logs for this VM"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {totalLogs} log{totalLogs !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        {/* Phase Pipeline */}
        <PhasePipeline
          vm={vm}
          phaseSummaries={phaseSummaries}
          onPhaseClick={setSelectedPhase}
          onCycleViewClick={() => setShowCycleLogs(true)}
        />

        {/* VM Error Banner */}
        {vm.error && (
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                Failed at phase: {vm.error.phase}
              </p>
              {vm.error.reasons.map((reason, idx) => (
                <p key={idx} className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">
                  {reason}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* VM Failed Condition (when no error details) */}
        {!vm.error && vm.conditions?.some(c => c.type === 'Failed' && c.status === 'True') && (
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {vm.conditions.find(c => c.type === 'Failed')?.message || 'The VM migration has failed.'}
            </p>
          </div>
        )}

        {/* VM Details */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {formatDateLocale(vm.firstSeen) && (
            <div className="text-slate-500 dark:text-gray-400">
              <span className="font-medium">First seen:</span> {formatDateLocale(vm.firstSeen)}
            </div>
          )}
          {formatDateLocale(vm.lastSeen) && (
            <div className="text-slate-500 dark:text-gray-400">
              <span className="font-medium">Last seen:</span> {formatDateLocale(vm.lastSeen)}
            </div>
          )}
          {duration && (
            <div className="text-slate-500 dark:text-gray-400">
              <span className="font-medium">Total duration:</span>{' '}
              <span className="text-green-600 dark:text-green-400 font-semibold">{duration}</span>
            </div>
          )}
          <div className="text-slate-500 dark:text-gray-400">
            <span className="font-medium">Phase:</span> {vm.currentPhase || 'N/A'}
          </div>
          <div className="text-slate-500 dark:text-gray-400">
            <span className="font-medium">Step:</span> {vm.currentStep || 'N/A'}
          </div>
          {vm.operatingSystem && (
            <div className="text-slate-500 dark:text-gray-400">
              <span className="font-medium">OS:</span> {vm.operatingSystem}
            </div>
          )}
          {vm.restorePowerState && (
            <div className="text-slate-500 dark:text-gray-400">
              <span className="font-medium">Power State:</span> {vm.restorePowerState}
            </div>
          )}
          {vm.newName && (
            <div className="text-slate-500 dark:text-gray-400">
              <span className="font-medium">Renamed to:</span>{' '}
              <span className="text-blue-600 dark:text-blue-400">{vm.newName}</span>
            </div>
          )}
        </div>

        {/* Data Volumes */}
        {vm.dataVolumes && vm.dataVolumes.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">Data Volumes</span>
            <div className="flex flex-wrap gap-2">
              {vm.dataVolumes.map((dv, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400"
                >
                  {dv.name}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Created Resources */}
        {vm.createdResources && vm.createdResources.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">Created Resources</span>
            <div className="flex flex-wrap gap-2">
              {vm.createdResources.map((resource, idx) => (
                <div
                  key={idx}
                  className={`px-2 py-1 rounded text-xs ${getResourceColorClass(resource.type)}`}
                  title={`Created at ${resource.createdAt.toLocaleString()}`}
                >
                  <span className="font-medium">{resource.type}:</span> {resource.name || 'unnamed'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phase Logs Modal */}
      {selectedPhase && (
        <PhaseLogsModal
          phase={selectedPhase}
          vmName={vm.name}
          logs={selectedPhaseLogs}
          summary={phaseSummaries[selectedPhase]}
          iterations={selectedPhaseIterations}
          warmInfo={selectedPhase === 'DiskTransfer' ? vm.warmInfo : undefined}
          onClose={() => setSelectedPhase(null)}
        />
      )}

      {/* Cycle Logs Modal */}
      {showCycleLogs && (
        <CycleLogsModal
          vm={vm}
          onClose={() => setShowCycleLogs(false)}
        />
      )}

      {/* Raw Logs Modal */}
      {showRawLogs && (
        <VMRawLogsModal
          vm={vm}
          onClose={() => setShowRawLogs(false)}
        />
      )}
    </>
  );
}
