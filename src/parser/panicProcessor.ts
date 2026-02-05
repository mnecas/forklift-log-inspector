import type { LogEntry, Plan } from '../types';
import { LogStore } from './LogStore';
import { PlanStatuses, PanicPrefix } from './constants';
import { truncate } from './utils';

/**
 * Process panic observer log entries
 */
export function processPanicLog(store: LogStore, entry: LogEntry, ts: Date): void {
  // Extract plan info from object field
  const planName = entry.object?.name || '';
  const namespace = entry.object?.namespace || '';

  if (!planName || !namespace) return;

  const plan = store.getOrCreatePlan(namespace, planName);
  plan.status = PlanStatuses.Failed;

  // Extract panic message - prefer the 'panic' field, fall back to parsing the message
  let panicMsg = entry.panic || '';
  if (!panicMsg) {
    panicMsg = entry.msg || '';
    const idx = panicMsg.indexOf(': ');
    if (idx > 0) {
      panicMsg = panicMsg.slice(idx + 2);
    }
  }

  // Get stacktrace from the entry
  const stacktrace = entry.stacktrace || '';

  // Check if this panic already exists (group identical panics)
  const existingIdx = plan.panics.findIndex(p => p.message === panicMsg);

  if (existingIdx >= 0) {
    plan.panics[existingIdx].count++;
    plan.panics[existingIdx].timestamp = ts;
    plan.panics[existingIdx].rawLines?.push(entry.rawLine || '');
    // Update stacktrace if we have a better one
    if (stacktrace && stacktrace.length > (plan.panics[existingIdx].stacktrace?.length || 0)) {
      plan.panics[existingIdx].stacktrace = stacktrace;
    }
  } else {
    plan.panics.push({
      timestamp: ts,
      message: panicMsg,
      controller: entry.controller,
      reconcileId: entry.reconcileID,
      stacktrace,
      rawLines: entry.rawLine ? [entry.rawLine] : [],
      count: 1,
    });
  }

  store.addEvent({
    timestamp: entry.ts,
    type: 'panic',
    planName,
    namespace,
    description: `Panic: ${truncate(panicMsg, 100)}`,
  });
}

/**
 * Process reconciler error log entries (often follows a panic)
 */
export function processReconcilerError(store: LogStore, entry: LogEntry, ts: Date): void {
  // Extract plan info from object field
  const planName = entry.object?.name || '';
  const namespace = entry.object?.namespace || '';

  if (!planName || !namespace) return;

  const plan = store.getOrCreatePlan(namespace, planName);

  // Check if this is a recovered panic error
  if (entry.error?.includes(PanicPrefix)) {
    plan.status = PlanStatuses.Failed;

    // Extract the panic message from the error
    let panicMsg = entry.error;
    const panicIdx = panicMsg.indexOf('panic: ');
    if (panicIdx >= 0) {
      panicMsg = panicMsg.slice(panicIdx + 7);
      const recoveredIdx = panicMsg.indexOf(' [recovered]');
      if (recoveredIdx > 0) {
        panicMsg = panicMsg.slice(0, recoveredIdx);
      }
    }

    // Check if we already have this panic recorded
    for (let i = 0; i < plan.panics.length; i++) {
      const existingPanic = plan.panics[i];
      if (existingPanic.message.includes(panicMsg) || panicMsg.includes(existingPanic.message)) {
        plan.panics[i].rawLines?.push(entry.rawLine || '');
        // Add stacktrace if we have one and it's different
        if (entry.stacktrace && entry.stacktrace !== existingPanic.stacktrace) {
          if (existingPanic.stacktrace) {
            plan.panics[i].stacktrace = `${existingPanic.stacktrace}\n\n--- Recovery Stacktrace ---\n${entry.stacktrace}`;
          } else {
            plan.panics[i].stacktrace = entry.stacktrace;
          }
        }
        return;
      }
    }

    // If no matching panic found, create a new entry
    plan.panics.push({
      timestamp: ts,
      message: panicMsg,
      controller: entry.controller,
      reconcileId: entry.reconcileID,
      stacktrace: entry.stacktrace,
      rawLines: entry.rawLine ? [entry.rawLine] : [],
      count: 1,
    });
  }
}

/**
 * Save raw panic stack trace lines to the most recent panic
 */
export function savePanicStacktrace(plan: Plan, lines: string[]): void {
  if (!plan || lines.length === 0) return;

  const stacktrace = lines.join('\n');

  // Try to find the most recent panic entry for this plan
  if (plan.panics.length > 0) {
    const lastIdx = plan.panics.length - 1;
    plan.panics[lastIdx].stacktrace = stacktrace;
    plan.panics[lastIdx].rawLines = [
      ...(plan.panics[lastIdx].rawLines || []),
      ...lines,
    ];
  } else {
    // Create a new panic entry for orphaned stack trace
    let panicMsg = 'Unknown panic';
    if (lines.length > 0 && lines[0].startsWith('panic: ')) {
      panicMsg = lines[0].slice(7);
    }
    plan.panics.push({
      timestamp: plan.lastSeen,
      message: panicMsg,
      stacktrace,
      rawLines: lines,
      count: 1,
    });
    plan.status = PlanStatuses.Failed;
  }
}
