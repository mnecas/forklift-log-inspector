import type { LogEntry, Plan, ParsedData } from '../types';
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

  // Check for migration logs
  if (entry.logger?.startsWith('migration|')) {
    processMigrationLog(store, entry, ts);
    return;
  }

  // Check for migrator logs
  if (entry.logger === 'migrator') {
    processMigratorLog(store, entry, ts);
    return;
  }
}

/**
 * Process migration controller logs
 */
function processMigrationLog(_store: LogStore, _entry: LogEntry, _ts: Date): void {
  // Migration logs don't contain as much useful info as plan logs
  // but we could track them if needed
}

/**
 * Process migrator logs
 */
function processMigratorLog(_store: LogStore, _entry: LogEntry, _ts: Date): void {
  // Can track migrator build events if needed
}

export { LogStore };
