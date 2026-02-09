import { useMemo } from 'react';
import type { VM, PhaseLogSummary, PhaseInfo } from '../types';
import { getPhasesForMigrationType, PrecopyLoopPhasesSet, PrecopyLoopPhases } from '../parser/constants';
import { formatDuration } from '../parser/utils';

// Secret dev mode: add ?dev=true to the URL to highlight unknown phases in purple
const isDevMode = () => new URLSearchParams(window.location.search).has('dev');

interface PhasePipelineProps {
  vm: VM;
  phaseSummaries: Record<string, PhaseLogSummary>;
  onPhaseClick: (phase: string) => void;
}

// Min and max widths for phase boxes (in pixels)
const MIN_WIDTH = 65;
const MAX_WIDTH = 160;

export function PhasePipeline({ vm, phaseSummaries, onPhaseClick }: PhasePipelineProps) {
  const knownPhases = vm.fromYaml ? [] : getPhasesForMigrationType(vm.migrationType);
  const knownPhasesSet = new Set(knownPhases);
  
  // Build final phase list with unknown phases inserted at the correct position
  // based on where they appeared in the phaseHistory relative to known phases.
  const phases = useMemo(() => {
    // For YAML-sourced VMs, just use the phases from history in order (no predefined template)
    if (vm.fromYaml) {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const ph of vm.phaseHistory || []) {
        if (!seen.has(ph.name)) {
          seen.add(ph.name);
          result.push(ph.name);
        }
      }
      // Also include phases that only appear in logs/summaries
      if (vm.phaseLogs) {
        for (const phase of Object.keys(vm.phaseLogs)) {
          if (!seen.has(phase)) {
            seen.add(phase);
            result.push(phase);
          }
        }
      }
      for (const phase of Object.keys(phaseSummaries)) {
        if (!seen.has(phase)) {
          seen.add(phase);
          result.push(phase);
        }
      }
      return result;
    }

    // Collect all unknown phases and figure out where each one appeared
    const unknownPhasesSet = new Set<string>();

    // Check phase history, phase logs, and summaries for unknown phases
    for (const ph of vm.phaseHistory || []) {
      if (!knownPhasesSet.has(ph.name)) unknownPhasesSet.add(ph.name);
    }
    if (vm.phaseLogs) {
      for (const phase of Object.keys(vm.phaseLogs)) {
        if (!knownPhasesSet.has(phase)) unknownPhasesSet.add(phase);
      }
    }
    for (const phase of Object.keys(phaseSummaries)) {
      if (!knownPhasesSet.has(phase)) unknownPhasesSet.add(phase);
    }

    if (unknownPhasesSet.size === 0) {
      return [...knownPhases];
    }

    // For each unknown phase, find which known phase it appeared after
    // by walking the phaseHistory (deduplicated, first occurrence only)
    const seenPhases: string[] = [];
    const seen = new Set<string>();
    for (const ph of vm.phaseHistory || []) {
      if (!seen.has(ph.name)) {
        seen.add(ph.name);
        seenPhases.push(ph.name);
      }
    }

    // Map: unknown phase -> the known phase it should be inserted after
    const insertAfter = new Map<string, string | null>();
    for (const unknown of unknownPhasesSet) {
      const idx = seenPhases.indexOf(unknown);
      if (idx === -1) {
        // Not in history (only in logs/summaries) - put at end
        insertAfter.set(unknown, null);
        continue;
      }
      // Walk backwards from this phase to find the nearest known phase before it
      let afterKnown: string | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        if (knownPhasesSet.has(seenPhases[i])) {
          afterKnown = seenPhases[i];
          break;
        }
      }
      insertAfter.set(unknown, afterKnown);
    }

    // Group unknown phases by their insertion point
    const unknownsAfterKnown = new Map<string | null, string[]>();
    for (const [unknown, after] of insertAfter) {
      if (!unknownsAfterKnown.has(after)) {
        unknownsAfterKnown.set(after, []);
      }
      unknownsAfterKnown.get(after)!.push(unknown);
    }

    // Sort unknown phases within each group by their order in phaseHistory
    for (const [, unknowns] of unknownsAfterKnown) {
      unknowns.sort((a, b) => {
        const idxA = seenPhases.indexOf(a);
        const idxB = seenPhases.indexOf(b);
        if (idxA === -1 && idxB === -1) return a.localeCompare(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }

    // Build final list: insert unknowns that appear before any known phase first,
    // then interleave known phases with their trailing unknowns
    const result: string[] = [];

    // Unknowns before any known phase (afterKnown === null but appeared first in history)
    const beforeAll = unknownsAfterKnown.get(null) || [];
    // Filter: only those that actually have no preceding known phase
    // Others with null go at the end
    const atEnd: string[] = [];
    for (const u of beforeAll) {
      const idx = seenPhases.indexOf(u);
      if (idx !== -1 && idx < seenPhases.findIndex(p => knownPhasesSet.has(p))) {
        result.push(u);
      } else {
        atEnd.push(u);
      }
    }

    for (const known of knownPhases) {
      result.push(known);
      const trailing = unknownsAfterKnown.get(known);
      if (trailing) {
        result.push(...trailing);
      }
    }

    // Append any remaining unknowns at end
    result.push(...atEnd);

    return result;
  }, [knownPhases, knownPhasesSet, vm.phaseHistory, vm.phaseLogs, phaseSummaries]);

  // Build phase times map from phaseHistory (aggregates iterations for loop phases)
  const phaseTimes = useMemo(() => {
    const map = new Map<string, { startedAt?: Date; endedAt?: Date; durationMs?: number }>();
    for (const ph of vm.phaseHistory || []) {
      const durationMs = ph.startedAt && ph.endedAt
        ? new Date(ph.endedAt).getTime() - new Date(ph.startedAt).getTime()
        : undefined;
      
      const existing = map.get(ph.name);
      if (existing && durationMs) {
        // Aggregate duration for repeated phases (precopy loop)
        map.set(ph.name, {
          startedAt: existing.startedAt,
          endedAt: ph.endedAt,
          durationMs: (existing.durationMs || 0) + durationMs,
        });
      } else {
        map.set(ph.name, { startedAt: ph.startedAt, endedAt: ph.endedAt, durationMs });
      }
    }
    return map;
  }, [vm.phaseHistory]);

  // Track iteration counts for precopy loop phases
  const phaseIterations = useMemo(() => {
    const map = new Map<string, { count: number; iterations: PhaseInfo[] }>();
    for (const ph of vm.phaseHistory || []) {
      if (PrecopyLoopPhasesSet.has(ph.name)) {
        const existing = map.get(ph.name);
        if (existing) {
          existing.count++;
          existing.iterations.push(ph);
        } else {
          map.set(ph.name, { count: 1, iterations: [ph] });
        }
      }
    }
    return map;
  }, [vm.phaseHistory]);

  // Get the maximum number of precopy loop iterations
  const maxPrecopyIterations = useMemo(() => {
    let max = 0;
    for (const ph of vm.phaseHistory || []) {
      if (ph.iteration && ph.iteration > max) {
        max = ph.iteration;
      }
    }
    return max;
  }, [vm.phaseHistory]);

  // Check if a phase is part of the precopy loop
  const isPrecopyLoopPhase = (phase: string): boolean => {
    return PrecopyLoopPhasesSet.has(phase);
  };

  // Get iteration count for a phase
  const getPhaseIterationCount = (phase: string): number => {
    return phaseIterations.get(phase)?.count || 0;
  };

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

  // Check if this is the first phase of the precopy loop
  const isFirstPrecopyLoopPhase = (phase: string): boolean => {
    return phase === PrecopyLoopPhases[0];
  };

  // Check if this is the last phase of the precopy loop
  const isLastPrecopyLoopPhase = (phase: string): boolean => {
    return phase === PrecopyLoopPhases[PrecopyLoopPhases.length - 1];
  };

  return (
    <div className="w-full">
      {/* Show precopy loop indicator if there are multiple iterations */}
      {maxPrecopyIterations > 1 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40 px-2 py-0.5 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Precopy Loop: {maxPrecopyIterations} iterations
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-y-4 gap-x-0.5">
        {phases.map((phase, index) => {
          const counts = getPhaseCounts(phase);
          const duration = getPhaseDuration(phase);
          const hasLogs = counts.total > 0;
          const isCurrent = phase === vm.currentPhase;
          const didRun = hasPhaseRun(phase);
          const phaseWidth = didRun ? getPhaseWidth(phase) : MIN_WIDTH;
          const isUnknown = isUnknownPhase(phase);
          const devMode = isDevMode();
          const showAsUnknown = isUnknown && devMode; // Only highlight as unknown in dev mode
          const isLoopPhase = isPrecopyLoopPhase(phase);
          const iterationCount = getPhaseIterationCount(phase);
          const isFirstLoop = isFirstPrecopyLoopPhase(phase);
          const isLastLoop = isLastPrecopyLoopPhase(phase);

          // Determine phase status
          let status: 'notRun' | 'running' | 'completed' | 'error' | 'unknown' | 'loop' = 'notRun';
          if (showAsUnknown && didRun) {
            status = counts.errors > 0 ? 'error' : 'unknown';
          } else if (!didRun) {
            status = 'notRun';
          } else if (isCurrent) {
            status = 'running';
          } else if (counts.errors > 0) {
            status = 'error';
          } else if (isLoopPhase && iterationCount > 1) {
            status = 'loop';
          } else if (phase === 'DiskTransfer' && vm.precopyCount && vm.precopyCount > 1) {
            status = 'loop'; // Show DiskTransfer with precopies in cyan
          } else {
            status = 'completed';
          }

          // Connector color between this phase and the next
          const nextPhase = index < phases.length - 1 ? phases[index + 1] : null;
          const nextDidRun = nextPhase ? hasPhaseRun(nextPhase) : false;
          const nextIsUnknown = nextPhase ? isUnknownPhase(nextPhase) : false;
          const nextShowAsUnknown = nextIsUnknown && devMode;
          const connectorColor = didRun && nextDidRun
            ? (showAsUnknown || nextShowAsUnknown) ? 'bg-purple-400 dark:bg-purple-500' : 'bg-green-500'
            : 'bg-gray-300 dark:bg-gray-600';

          return (
            <div key={phase} className="flex items-center">
              
              {/* Loop start indicator */}
              {isFirstLoop && didRun && maxPrecopyIterations > 1 && (
                <div className="flex items-center mr-0.5">
                  <div className="text-cyan-500 dark:text-cyan-400 text-base font-bold" title="Precopy loop start">⟳</div>
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
                            : showAsUnknown
                              ? 'bg-purple-500 text-white'
                              : status === 'loop'
                                ? 'bg-cyan-500 text-white'
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

                {/* Iteration count badge for loop phases */}
                {isLoopPhase && iterationCount > 1 && (
                  <div className="absolute -top-2.5 -left-1.5 z-10">
                    <span className="min-w-[20px] h-[20px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-cyan-500 text-white shadow-sm" title={`${iterationCount} iterations`}>
                      ×{iterationCount}
                    </span>
                  </div>
                )}

                {/* Precopy count badge for YAML DiskTransfer */}
                {vm.precopyCount && vm.precopyCount > 0 && phase === 'DiskTransfer' && (
                  <div className="absolute -top-2.5 -left-1.5 z-10">
                    <span className="min-w-[20px] h-[20px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-cyan-500 text-white shadow-sm" title={`${vm.precopyCount} precopies`}>
                      ×{vm.precopyCount}
                    </span>
                  </div>
                )}

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
                            : status === 'loop'
                              ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border-2 border-solid border-cyan-500'
                              : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-2 border-solid border-green-500'
                    }
                    ${hasLogs ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
                    ${isCurrent ? 'ring-2 ring-teal-400 ring-offset-1 dark:ring-offset-slate-800' : ''}
                  `}
                  title={`${phase}${showAsUnknown ? ' (Unknown Phase)' : ''}${isLoopPhase && iterationCount > 1 ? ` (${iterationCount} iterations)` : ''}${duration ? ` (${duration} total)` : ''}${hasLogs ? ` - ${counts.total} logs` : ''}`}
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
                      : status === 'loop'
                        ? 'text-cyan-600 dark:text-cyan-400'
                        : 'text-green-600 dark:text-green-400'
                }`}>
                  {duration || ''}
                </span>
              </div>

              {/* Loop end indicator with back arrow */}
              {isLastLoop && didRun && maxPrecopyIterations > 1 && (
                <div className="flex items-center ml-0.5">
                  <div className="text-cyan-500 dark:text-cyan-400 text-base font-bold" title="Loop back to CopyDisks">↺</div>
                </div>
              )}

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
    'PreflightInspection': 'Preflight',
    'CreateVM': 'CreateVM',
    'Initialize': 'Init',
    'DiskTransfer': 'DiskTransfer',
    'DiskTransferV2v': 'DiskV2V',
    'DiskAllocation': 'DiskAlloc',
    'Cutover': 'Cutover',
    'ImageConversion': 'ImgConv',
    'VirtualMachineCreation': 'CreateVM',
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
