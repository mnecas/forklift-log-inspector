import type { LogEntry, Plan, ParsedData, ScheduleSnapshot } from '../types';
import { LogStore } from './LogStore';
import { ContainerLogPrefixRegex } from './constants';
import { parseTimestamp, isPanicLine } from './utils';
import { processPlanLog } from './planProcessor';
import { processPanicLog, processReconcilerError, savePanicStacktrace } from './panicProcessor';

/**
 * Parse log file content and return structured data
 */
export function parseLogFile(content: string): ParsedData {
  const store = new LogStore();
  const lines = content.split('\n');

  // Track panic context
  let currentPanicPlan: Plan | undefined;
  let currentPanicLines: string[] = [];
  let inPanicStacktrace = false;

  for (const line of lines) {
    store.incrementStat('totalLines');

    if (!line.trim()) continue;

    // Skip duplicate lines
    if (store.isLineProcessed(line)) {
      store.incrementStat('duplicateLines');
      continue;
    }

    // Check for container log format (timestamp prefix followed by JSON)
    let jsonContent = line;
    let containerTimestamp = '';
    const matches = line.match(ContainerLogPrefixRegex);
    if (matches) {
      containerTimestamp = matches[1];
      jsonContent = matches[2];
    }

    // Try to parse as JSON
    let entry: LogEntry;
    try {
      entry = JSON.parse(jsonContent);
    } catch {
      // Non-JSON line - could be part of panic stack trace
      if (inPanicStacktrace || isPanicLine(line)) {
        inPanicStacktrace = true;
        currentPanicLines.push(line);

        // Check if this looks like the start of a panic
        if (line.startsWith('panic:') && !currentPanicPlan) {
          currentPanicPlan = store.getMostRecentPlan();
        }
      }
      store.incrementStat('errorLines');
      continue;
    }

    // If JSON didn't have a timestamp but we extracted one from container log prefix
    if (!entry.ts && containerTimestamp) {
      entry.ts = containerTimestamp;
    }

    // If we were collecting panic lines and hit a new JSON entry, save the panic
    if (inPanicStacktrace && currentPanicPlan && currentPanicLines.length > 0) {
      savePanicStacktrace(currentPanicPlan, currentPanicLines);
      currentPanicLines = [];
      currentPanicPlan = undefined;
      inPanicStacktrace = false;
    }

    // Store raw line
    entry.rawLine = line;

    // Mark line as processed
    store.markLineProcessed(line);

    store.incrementStat('parsedLines');
    processEntry(store, entry);
  }

  // Save any remaining panic lines
  if (inPanicStacktrace && currentPanicPlan && currentPanicLines.length > 0) {
    savePanicStacktrace(currentPanicPlan, currentPanicLines);
  }

  return store.getResult();
}

/**
 * Process a single log entry
 */
function processEntry(store: LogStore, entry: LogEntry): void {
  const ts = parseTimestamp(entry.ts);

  // Check for panic log (controller-runtime panic observer)
  if (entry.msg?.includes('Observed a panic')) {
    processPanicLog(store, entry, ts);
    return;
  }

  // Check for reconciler error (often follows a panic)
  if (entry.msg === 'Reconciler error' && entry.controller) {
    processReconcilerError(store, entry, ts);
    return;
  }

  // Check if this is a plan-related log
  if (entry.logger?.startsWith('plan|')) {
    processPlanLog(store, entry, ts);
    return;
  }

  // Check for scheduler logs (snapshot of inflight/pending VMs)
  if (entry.msg?.includes('scheduler') || entry.logger?.includes('scheduler')) {
    processSchedulerLog(store, entry, ts);
    return;
  }
}

/**
 * Process scheduler log entries to capture scheduling snapshots
 */
function processSchedulerLog(store: LogStore, entry: LogEntry, ts: Date): void {
  // Look for structured scheduler data in the log entry
  const entryAny = entry as unknown as Record<string, unknown>;
  const inflight = entryAny.inflight as Record<string, { id?: string; name?: string }[]> | undefined;
  const pending = entryAny.pending as Record<string, { id?: string; name?: string }[]> | undefined;

  if (!inflight && !pending) return;

  const snapshot: ScheduleSnapshot = {
    timestamp: ts.toISOString(),
    inflight: inflight || {},
    pending: pending || {},
  };

  // Check for next VM info
  const nextVM = entryAny.next as { id?: string; name?: string } | undefined;
  if (nextVM) {
    snapshot.nextVM = nextVM;
  }

  // Try to associate with a plan from the logger (e.g., "scheduler|ns/plan")
  const loggerParts = entry.logger?.split('|');
  if (loggerParts && loggerParts.length >= 2) {
    const planRef = loggerParts[1];
    const plan = store.findPlan(planRef);
    if (plan) {
      if (!plan.scheduleHistory) {
        plan.scheduleHistory = [];
      }
      plan.scheduleHistory.push(snapshot);
    }
  }
}

export { LogStore };
