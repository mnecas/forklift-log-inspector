import { useMemo } from 'react';
import type { VM, PhaseLogSummary } from '../types';
import { getPhasesForMigrationType } from '../parser/constants';
import { formatDuration } from '../parser/utils';

interface PhasePipelineProps {
  vm: VM;
  phaseSummaries: Record<string, PhaseLogSummary>;
  onPhaseClick: (phase: string) => void;
}

// Min and max widths for phase boxes (in pixels)
const MIN_WIDTH = 65;
const MAX_WIDTH = 160;

export function PhasePipeline({ vm, phaseSummaries, onPhaseClick }: PhasePipelineProps) {
  const knownPhases = getPhasesForMigrationType(vm.migrationType);
  const knownPhasesSet = new Set(knownPhases);
  
  // Find unknown phases from phase history, phase logs, and summaries
  const unknownPhases = useMemo(() => {
    const unknown = new Set<string>();
    
    // Check phase history
    for (const ph of vm.phaseHistory || []) {
      if (!knownPhasesSet.has(ph.name)) {
        unknown.add(ph.name);
      }
    }
    
    // Check phase logs
    if (vm.phaseLogs) {
      for (const phase of Object.keys(vm.phaseLogs)) {
        if (!knownPhasesSet.has(phase)) {
          unknown.add(phase);
        }
      }
    }
    
    // Check phase summaries
    for (const phase of Object.keys(phaseSummaries)) {
      if (!knownPhasesSet.has(phase)) {
        unknown.add(phase);
      }
    }
    
    return Array.from(unknown).sort();
  }, [vm.phaseHistory, vm.phaseLogs, phaseSummaries, knownPhasesSet]);
  
  // Combine known and unknown phases
  const phases = useMemo(() => {
    return [...knownPhases, ...unknownPhases];
  }, [knownPhases, unknownPhases]);

  // Build phase times map from phaseHistory
  const phaseTimes = useMemo(() => {
    const map = new Map<string, { startedAt?: Date; endedAt?: Date; durationMs?: number }>();
    for (const ph of vm.phaseHistory || []) {
      const durationMs = ph.startedAt && ph.endedAt
        ? new Date(ph.endedAt).getTime() - new Date(ph.startedAt).getTime()
        : undefined;
      map.set(ph.name, { startedAt: ph.startedAt, endedAt: ph.endedAt, durationMs });
    }
    return map;
  }, [vm.phaseHistory]);

  // Get duration in ms for a phase
  const getPhaseDurationMs = (phase: string): number | null => {
    const summary = phaseSummaries[phase];
    if (summary?.durationMs) {
      return summary.durationMs;
    }
    const phaseInfo = phaseTimes.get(phase);
    return phaseInfo?.durationMs || null;
  };

  // Calculate duration string for a phase
  const getPhaseDuration = (phase: string): string | null => {
    const summary = phaseSummaries[phase];
    if (summary?.duration) {
      return summary.duration;
    }
    const phaseInfo = phaseTimes.get(phase);
    if (phaseInfo?.durationMs) {
      return formatDuration(phaseInfo.durationMs);
    }
    return null;
  };

  // Calculate width scaling based on all phase durations
  const widthScale = useMemo(() => {
    const durations: number[] = [];
    for (const phase of phases) {
      const ms = getPhaseDurationMs(phase);
      if (ms && ms > 0) {
        durations.push(ms);
      }
    }
    
    if (durations.length === 0) {
      return { min: 0, max: 0 };
    }

    const min = Math.min(...durations);
    const max = Math.max(...durations);
    return { min, max };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, phaseSummaries, phaseTimes]);

  // Calculate width for a phase based on duration
  const getPhaseWidth = (phase: string): number => {
    const ms = getPhaseDurationMs(phase);
    if (!ms || !widthScale.max) {
      return MIN_WIDTH;
    }
    
    // Use square root scale for better visual distribution
    const sqrtMin = Math.sqrt(widthScale.min || 1);
    const sqrtMax = Math.sqrt(widthScale.max || 1);
    const sqrtMs = Math.sqrt(ms || 1);
    const sqrtRange = sqrtMax - sqrtMin;
    
    if (sqrtRange === 0) {
      return (MIN_WIDTH + MAX_WIDTH) / 2;
    }
    
    const ratio = (sqrtMs - sqrtMin) / sqrtRange;
    return Math.round(MIN_WIDTH + ratio * (MAX_WIDTH - MIN_WIDTH));
  };

  // Count errors and warnings for a phase
  const getPhaseCounts = (phase: string): { total: number; errors: number; warnings: number } => {
    const summary = phaseSummaries[phase];
    if (!summary) {
      return { total: 0, errors: 0, warnings: 0 };
    }

    let errors = 0;
    let warnings = 0;
    for (const group of summary.groupedLogs || []) {
      if (group.level === 'error') {
        errors += group.count;
      } else if (group.level === 'warning' || group.level === 'warn') {
        warnings += group.count;
      }
    }

    return { total: summary.totalLogs, errors, warnings };
  };

  // Check if phase has actually run (is in phase history)
  const hasPhaseRun = (phase: string): boolean => {
    return phaseTimes.has(phase);
  };

  // Check if a phase is unknown (not in the predefined list)
  const isUnknownPhase = (phase: string): boolean => {
    return !knownPhasesSet.has(phase);
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start gap-y-4 gap-x-0.5">
        {phases.map((phase, index) => {
          const counts = getPhaseCounts(phase);
          const duration = getPhaseDuration(phase);
          const hasLogs = counts.total > 0;
          const isCurrent = phase === vm.currentPhase;
          const didRun = hasPhaseRun(phase);
          const phaseWidth = didRun ? getPhaseWidth(phase) : MIN_WIDTH;
          const isUnknown = isUnknownPhase(phase);

          // Determine phase status
          let status: 'notRun' | 'running' | 'completed' | 'error' | 'unknown' = 'notRun';
          if (isUnknown && didRun) {
            status = counts.errors > 0 ? 'error' : 'unknown';
          } else if (!didRun) {
            status = 'notRun';
          } else if (isCurrent) {
            status = 'running';
          } else if (counts.errors > 0) {
            status = 'error';
          } else {
            status = 'completed';
          }

          // Connector color - green if previous phase ran, gray otherwise
          const prevPhaseRan = index > 0 && hasPhaseRun(phases[index - 1]);
          const connectorColor = prevPhaseRan && didRun
            ? 'bg-green-500'
            : isUnknown && index === knownPhases.length
              ? 'bg-purple-400 dark:bg-purple-500' // First unknown phase connector
              : 'bg-gray-300 dark:bg-gray-600';

          return (
            <div key={phase} className="flex items-center">
              {/* Separator before unknown phases */}
              {isUnknown && index === knownPhases.length && (
                <div className="flex items-center mr-1">
                  <div className="w-px h-8 bg-purple-400 dark:bg-purple-500 mx-1" />
                  <span className="text-[9px] text-purple-500 dark:text-purple-400 font-medium uppercase tracking-wider -rotate-90 -ml-2">
                    New
                  </span>
                </div>
              )}
              
              {/* Phase box with name and duration */}
              <div className="relative flex flex-col items-center">
                {/* Badge - log count or question mark */}
                <div className="absolute -top-2.5 -right-1.5 z-10">
                  {hasLogs ? (
                    <span
                      className={`
                        min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold
                        flex items-center justify-center shadow-sm
                        ${counts.errors > 0
                          ? 'bg-red-500 text-white'
                          : counts.warnings > 0
                            ? 'bg-orange-500 text-white'
                            : isUnknown
                              ? 'bg-purple-500 text-white'
                              : 'bg-blue-500 text-white'
                        }
                      `}
                    >
                      {counts.total}
                    </span>
                  ) : (
                    <span className="min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-bold flex items-center justify-center bg-yellow-400 text-yellow-800">
                      ?
                    </span>
                  )}
                </div>

                {/* Phase button */}
                <button
                  onClick={() => hasLogs && onPhaseClick(phase)}
                  disabled={!hasLogs}
                  style={{ width: `${phaseWidth}px` }}
                  className={`
                    relative px-2 py-2 rounded-lg text-xs font-medium
                    ${status === 'notRun'
                      ? 'bg-transparent text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-600'
                      : status === 'running'
                        ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-2 border-solid border-teal-500'
                        : status === 'error'
                          ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-2 border-solid border-red-500'
                          : status === 'unknown'
                            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-2 border-solid border-purple-500'
                            : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-2 border-solid border-green-500'
                    }
                    ${hasLogs ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
                    ${isCurrent ? 'ring-2 ring-teal-400 ring-offset-1 dark:ring-offset-slate-800' : ''}
                  `}
                  title={`${phase}${isUnknown ? ' (Unknown Phase)' : ''}${duration ? ` (${duration})` : ''}${hasLogs ? ` - ${counts.total} logs` : ''}`}
                >
                  <span className="block truncate text-center leading-tight">
                    {getShortPhaseName(phase)}
                  </span>
                </button>

                {/* Duration below the box */}
                <span className={`mt-1 text-[10px] font-medium h-4 ${
                  status === 'notRun' 
                    ? 'text-gray-400 dark:text-gray-600' 
                    : status === 'unknown'
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-green-600 dark:text-green-400'
                }`}>
                  {duration || ''}
                </span>
              </div>

              {/* Connector line */}
              {index < phases.length - 1 && (
                <div className={`w-5 h-0.5 ${connectorColor} flex-shrink-0 -mt-4`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Get a shortened version of the phase name for display
 */
function getShortPhaseName(phase: string): string {
  const shortNames: Record<string, string> = {
    'Started': 'Start',
    'PreHook': 'PreHook',
    'StorePowerState': 'StorePwr',
    'PowerOffSource': 'PwrOff',
    'WaitForPowerOff': 'WaitPwr',
    'CreateDataVolumes': 'CreateDV',
    'CreateSnapshot': 'CreateSnap',
    'WaitForSnapshot': 'WaitSnap',
    'StoreSnapshot': 'StoreSnap',
    'AddCheckpoint': 'AddChkpt',
    'AddFinalCheckpoint': 'FinalChkpt',
    'CreateInitialSnapshot': 'InitSnap',
    'WaitForInitialSnapshot': 'WaitInit',
    'StoreInitialSnapshot': 'StoreDeltas',
    'Preflight': 'Preflight',
    'CreateVM': 'CreateVM',
    'CopyDisks': 'Copy',
    'CopyDisksVirtV2V': 'CopyV2V',
    'CreateGuestConversionPod': 'ConvPod',
    'ConvertGuest': 'Convert',
    'CopyingPaused': 'Paused',
    'AllocateDisks': 'Allocate',
    'WaitForDataVolumes': 'WaitDV',
    'RemovePenultimateSnapshot': 'RmPenSnap',
    'WaitForRemovePenultimateSnapshot': 'WaitRmPen',
    'RemoveFinalSnapshot': 'RmFinalSnap',
    'WaitForRemoveFinalSnapshot': 'WaitRmFinal',
    'Finalize': 'Finalize',
    'FinalSnapshot': 'FinalSnap',
    'WaitForFinalSnapshot': 'WaitFinal',
    'WaitForFinalDataVolumes': 'WaitFinalDV',
    'RemovePreviousSnapshot': 'RmPrevSnap',
    'WaitForRemovePreviousSnapshot': 'WaitRmPrev',
    'PostHook': 'PostHook',
    'Completed': 'Done',
    'Canceled': 'Cancel',
  };
  return shortNames[phase] || phase.replace(/([a-z])([A-Z])/g, '$1\u200B$2').slice(0, 10);
}
