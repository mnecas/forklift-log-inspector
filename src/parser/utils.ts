import type { LogEntry, VM, RawLogEntry, GroupedLogEntry, PhaseLogSummary, PhaseInfo } from '../types';
import { VMRegex, WarmOnlyPhases, ColdDiskPhases, MigrationTypes, Phases } from './constants';

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
 * Check if a line looks like part of a panic stack trace
 */
export function isPanicLine(line: string): boolean {
  return line.startsWith('panic:') || line.startsWith('goroutine ');
}
