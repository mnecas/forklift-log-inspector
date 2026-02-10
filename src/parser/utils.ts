import type { LogEntry, VM, RawLogEntry, GroupedLogEntry, PhaseLogSummary, PhaseInfo, WarmInfo, PrecopyInfo } from '../types';
import { VMRegex, WarmOnlyPhases, ColdDiskPhases, MigrationTypes, Phases, PrecopyLoopPhasesSet, PrecopyLoopStartPhase } from './constants';

/**
 * Parse various log timestamp formats
 */
export function parseTimestamp(ts: string): Date {
  if (!ts) return new Date(0);

  // Try ISO 8601 / RFC 3339 format (container logs)
  let date = new Date(ts);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try standard log format with milliseconds "2026-02-05 02:57:29.093"
  const stdMatch = ts.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?$/);
  if (stdMatch) {
    const [, datePart, timePart, ms] = stdMatch;
    const isoStr = `${datePart}T${timePart}${ms ? `.${ms}` : ''}Z`;
    date = new Date(isoStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date(0);
}

/**
 * Parse VM info from string format "id:vm-1002 name:'ameen-RHEL9'"
 */
export function parseVMInfo(vmStr: string): { id: string; name: string } {
  const matches = vmStr.match(VMRegex);
  if (matches && matches.length >= 3) {
    return { id: matches[1], name: matches[2] };
  }
  return { id: '', name: '' };
}

/**
 * Get VM info from log entry (either from vmRef or vm string/object)
 */
export function getVMInfo(entry: LogEntry): { id: string; name: string } {
  // Try VMRef first (structured format)
  if (entry.vmRef?.id) {
    return { id: entry.vmRef.id, name: entry.vmRef.name || '' };
  }
  // Check if vm field exists
  if (entry.vm) {
    // Handle vm as string format: "id:vm-1002 name:'ameen-RHEL9'"
    if (typeof entry.vm === 'string') {
      return parseVMInfo(entry.vm);
    }
    // Handle vm as object: { id?: string; name?: string }
    const vmObj = entry.vm as { id?: string; name?: string };
    return { id: vmObj.id || '', name: vmObj.name || '' };
  }
  return { id: '', name: '' };
}

/**
 * Truncate string to max length
 */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

/**
 * Safely extract string from object
 */
export function getStringFromMap(obj: Record<string, unknown> | undefined, key: string): string {
  if (!obj) return '';
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

/**
 * Detect migration type for a VM based on phases
 */
export function detectVMMigrationType(phaseHistory: PhaseInfo[]): string {
  let hasWarmPhase = false;
  let hasDiskPhase = false;
  let hasConversion = false;

  for (const ph of phaseHistory) {
    if (WarmOnlyPhases.has(ph.name)) {
      hasWarmPhase = true;
    }
    if (ColdDiskPhases.has(ph.name)) {
      hasDiskPhase = true;
    }
    if (ph.name === Phases.CreateGuestConversionPod || ph.name === Phases.ConvertGuest) {
      hasConversion = true;
    }
  }

  if (hasWarmPhase) {
    return MigrationTypes.Warm;
  }
  if (hasConversion && !hasDiskPhase) {
    return MigrationTypes.OnlyConversion;
  }
  if (hasDiskPhase || phaseHistory.length > 0) {
    return MigrationTypes.Cold;
  }
  return MigrationTypes.Unknown;
}

/**
 * Group similar log entries by message
 */
export function groupLogs(logs: RawLogEntry[]): GroupedLogEntry[] {
  const groups = new Map<string, GroupedLogEntry>();
  const order: string[] = [];

  for (const log of logs) {
    const existing = groups.get(log.message);
    if (existing) {
      existing.count++;
      existing.lastSeen = log.timestamp;
      existing.entries.push(log);
    } else {
      groups.set(log.message, {
        message: log.message,
        count: 1,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        level: log.level,
        entries: [log],
      });
      order.push(log.message);
    }
  }

  return order.map(msg => groups.get(msg)!);
}

/**
 * Compute phase log summaries for a VM
 */
export function computePhaseLogSummaries(vm: VM): Record<string, PhaseLogSummary> {
  if (!vm.phaseLogs) return {};

  const summaries: Record<string, PhaseLogSummary> = {};

  // Build phase times map
  const phaseTimes = new Map<string, PhaseInfo>();
  for (const ph of vm.phaseHistory) {
    phaseTimes.set(ph.name, ph);
  }

  for (const [phase, logs] of Object.entries(vm.phaseLogs)) {
    if (logs.length === 0) continue;

    const summary: PhaseLogSummary = {
      phase,
      totalLogs: logs.length,
      groupedLogs: groupLogs(logs),
    };

    // Get phase timing from history
    const phaseInfo = phaseTimes.get(phase);
    if (phaseInfo) {
      if (phaseInfo.startedAt) {
        summary.startTime = phaseInfo.startedAt.toISOString();
      }
      if (phaseInfo.endedAt) {
        summary.endTime = phaseInfo.endedAt.toISOString();
        if (phaseInfo.startedAt) {
          const durationMs = phaseInfo.endedAt.getTime() - phaseInfo.startedAt.getTime();
          summary.durationMs = durationMs;
          summary.duration = formatDuration(durationMs);
        }
      }
    }

    summaries[phase] = summary;
  }

  return summaries;
}

/**
 * Build WarmInfo from controller log phase history.
 * Groups precopy loop phases by iteration number and derives timing/summary.
 */
export function buildWarmInfoFromPhaseHistory(phaseHistory: PhaseInfo[]): WarmInfo | undefined {
  // Collect all precopy loop phases that have an iteration number
  const iterationMap = new Map<number, PhaseInfo[]>();
  for (const ph of phaseHistory) {
    if (PrecopyLoopPhasesSet.has(ph.name) && ph.iteration) {
      const phases = iterationMap.get(ph.iteration) || [];
      phases.push(ph);
      iterationMap.set(ph.iteration, phases);
    }
  }

  if (iterationMap.size === 0) return undefined;

  const precopies: PrecopyInfo[] = [];
  let successes = 0;
  let failures = 0;

  // Sort by iteration number
  const sortedIterations = Array.from(iterationMap.entries()).sort((a, b) => a[0] - b[0]);

  for (const [iteration, phases] of sortedIterations) {
    // Find the earliest start and latest end across all phases in this iteration
    let startedAt: Date | undefined;
    let endedAt: Date | undefined;
    let allPhasesCompleted = true;

    for (const ph of phases) {
      if (ph.startedAt) {
        if (!startedAt || ph.startedAt < startedAt) {
          startedAt = ph.startedAt;
        }
      }
      if (ph.endedAt) {
        if (!endedAt || ph.endedAt > endedAt) {
          endedAt = ph.endedAt;
        }
      } else {
        allPhasesCompleted = false;
      }
    }

    const durationMs = startedAt && endedAt
      ? endedAt.getTime() - startedAt.getTime()
      : undefined;

    // Check if this iteration has the final loop phase (AddCheckpoint) completed
    const hasAddCheckpoint = phases.some(
      ph => ph.name === Phases.AddCheckpoint && ph.endedAt
    );

    // Check if the first phase of this iteration started (CopyDisks)
    const hasCopyDisksStart = phases.some(
      ph => ph.name === PrecopyLoopStartPhase && ph.startedAt
    );

    if (hasAddCheckpoint) {
      successes++;
    } else if (hasCopyDisksStart && !allPhasesCompleted) {
      // Iteration started but didn't complete - could be in progress or failed
      // Only count as failure if there's a subsequent iteration (meaning this one was retried)
      const hasLaterIteration = sortedIterations.some(([i]) => i > iteration);
      if (hasLaterIteration) {
        failures++;
      }
    }

    precopies.push({
      iteration,
      snapshot: `iteration-${iteration}`,
      startedAt,
      endedAt,
      durationMs,
      disks: [],
    });
  }

  return {
    precopies,
    successes,
    failures,
    consecutiveFailures: 0,
  };
}

/**
 * Check if a line looks like part of a panic stack trace
 */
export function isPanicLine(line: string): boolean {
  return line.startsWith('panic:') || line.startsWith('goroutine ');
}
