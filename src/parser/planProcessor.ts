import type { LogEntry, Plan, Condition, RawLogEntry, WarmInfo, PrecopyInfo } from '../types';
import { LogStore } from './LogStore';
import { PlanStatuses, Phases, ConditionStatus, PrecopyLoopPhasesSet, PrecopyLoopStartPhase } from './constants';
import { getVMInfo, truncate, getStringFromMap } from './utils';

/**
 * Process plan-related log entries
 */
export function processPlanLog(store: LogStore, entry: LogEntry, ts: Date): void {
  // Extract plan name and namespace
  const planName = entry.plan?.name || '';
  const namespace = entry.plan?.namespace || '';

  if (!planName || !namespace) return;

  const plan = store.getOrCreatePlan(namespace, planName);

  // Skip logs from old migrations (except migration start events which reset the plan)
  const msg = entry.msg || '';
  if (entry.migration && plan.migration && entry.migration !== plan.migration) {
    // Allow Migration [STARTED] to go through as it resets the plan
    if (msg !== 'Migration [STARTED]') {
      return; // Skip logs from old migration runs
    }
  }

  // Update timestamps
  if (plan.firstSeen.getTime() === 0) {
    plan.firstSeen = ts;
  }
  plan.lastSeen = ts;

  // Ensure VM exists if this log references one
  const { id: vmID } = getVMInfo(entry);
  if (vmID) {
    ensureVMExists(plan, entry, ts);
  }

  // Check for archived plan
  if (msg.includes('Aborting reconcile of archived plan')) {
    plan.archived = true;
    return;
  }

  // Check for succeeded plan
  if (msg.includes('Skipping reconcile of succeeded plan')) {
    plan.status = PlanStatuses.Succeeded;
    return;
  }

  // Check for migration start
  if (msg === 'Migration [STARTED]') {
    // If this is a new migration (rerun), reset the plan data
    if (entry.migration && plan.migration && entry.migration !== plan.migration) {
      // New migration detected - reset VMs, errors, panics, conditions
      plan.vms = {};
      plan.errors = [];
      plan.panics = [];
      plan.conditions = [];
      plan.firstSeen = ts;
    }
    
    plan.status = PlanStatuses.Running;
    if (entry.migration) {
      plan.migration = entry.migration;
    }
    store.addEvent({
      timestamp: entry.ts,
      type: 'migration_start',
      planName,
      namespace,
      description: 'Migration started',
    });
    return;
  }

  // Check for migration succeeded
  if (msg === 'Migration [SUCCEEDED]') {
    plan.status = PlanStatuses.Succeeded;
    // Mark all VMs in this plan as Completed
    for (const vm of Object.values(plan.vms)) {
      if (vm.currentPhase !== Phases.Completed) {
        // Close previous phase
        if (vm.phaseHistory.length > 0) {
          const lastPhase = vm.phaseHistory[vm.phaseHistory.length - 1];
          if (!lastPhase.endedAt) {
            lastPhase.endedAt = ts;
          }
        }
        vm.currentPhase = Phases.Completed;
        vm.phaseHistory.push({
          name: Phases.Completed,
          step: '',
          startedAt: ts,
          endedAt: ts,
        });
      }
    }
    store.addEvent({
      timestamp: entry.ts,
      type: 'migration_succeeded',
      planName,
      namespace,
      description: 'Migration succeeded',
    });
    return;
  }

  // Check for migration run with phase
  if (msg === 'Migration [RUN]' && vmID) {
    processVMPhase(store, plan, entry, ts);
    storeVMLog(plan, entry);
    return;
  }

  // Check for SetCheckpoint (warm migration precopy data)
  if (msg === 'SetCheckpoint' && vmID) {
    processSetCheckpoint(plan, entry, ts);
    storeVMLog(plan, entry);
    return;
  }

  // Check for itinerary transition
  if (msg === 'Itinerary transition') {
    processPhaseTransition(store, plan, entry, ts);
    return;
  }

  // Check for condition changes
  if (msg.startsWith('Condition added')) {
    processConditionAdded(store, plan, entry, ts);
    return;
  }

  if (msg.startsWith('Condition deleted')) {
    processConditionDeleted(plan, entry);
    return;
  }

  // Check for DataVolume creation
  if (msg === 'Created DataVolume.' && entry.dv) {
    processDataVolume(plan, entry, ts);
    return;
  }

  // Check for other resource creations
  if (msg.includes('created.') || msg.startsWith('Created ')) {
    processCreatedResource(plan, entry, ts, msg);
    return;
  }

  // Check for error-level logs with 'error' field
  if (entry.level === 'error' && entry.error) {
    processErrorLog(store, plan, planName, namespace, entry, ts);
    return;
  }

  // Check for active migration found
  if (msg.includes('Found (active) migration')) {
    plan.status = PlanStatuses.Running;
    if (entry.migration) {
      plan.migration = entry.migration;
    }
    return;
  }

  // Check for 'err' field in logs (warnings/errors that don't fail the plan)
  if (entry.err) {
    processWarningLog(store, plan, planName, namespace, entry, ts);
  }

  // For any other log that mentions a VM, store it under that VM's current phase
  if (vmID) {
    storeVMLog(plan, entry);
  }
}

/**
 * Ensure VM exists in plan
 */
export function ensureVMExists(plan: Plan, entry: LogEntry, ts: Date): void {
  const { id: vmID, name: vmName } = getVMInfo(entry);
  if (!vmID) return;

  let vm = plan.vms[vmID];
  if (!vm) {
    vm = {
      id: vmID,
      name: vmName,
      currentPhase: '',
      currentStep: '',
      migrationType: 'Unknown',
      phaseHistory: [],
      dataVolumes: [],
      createdResources: [],
      phaseLogs: {},
      firstSeen: ts,
      lastSeen: ts,
    };
    plan.vms[vmID] = vm;
  }

  vm.lastSeen = ts;

  // Update phase if entry has one and VM doesn't have a current phase yet
  if (entry.phase && !vm.currentPhase) {
    vm.currentPhase = entry.phase;
    vm.phaseHistory.push({
      name: entry.phase,
      step: '',
      startedAt: ts,
    });
  }
}

/**
 * Get the current precopy loop iteration for a VM
 */
function getCurrentPrecopyIteration(vm: { phaseHistory: { name: string; iteration?: number }[] }): number {
  // Find the highest iteration number from precopy loop phases
  let maxIteration = 0;
  for (const phase of vm.phaseHistory) {
    if (PrecopyLoopPhasesSet.has(phase.name) && phase.iteration) {
      maxIteration = Math.max(maxIteration, phase.iteration);
    }
  }
  return maxIteration;
}

/**
 * Process VM phase updates
 */
function processVMPhase(store: LogStore, plan: Plan, entry: LogEntry, ts: Date): void {
  const { id: vmID, name: vmName } = getVMInfo(entry);
  if (!vmID) return;

  let vm = plan.vms[vmID];
  if (!vm) {
    vm = {
      id: vmID,
      name: vmName,
      currentPhase: '',
      currentStep: '',
      migrationType: 'Unknown',
      phaseHistory: [],
      dataVolumes: [],
      createdResources: [],
      phaseLogs: {},
      firstSeen: ts,
      lastSeen: ts,
    };
    plan.vms[vmID] = vm;
  }

  vm.lastSeen = ts;

  // Update phase if changed
  if (entry.phase && entry.phase !== vm.currentPhase) {
    // Close previous phase
    if (vm.phaseHistory.length > 0) {
      const lastPhase = vm.phaseHistory[vm.phaseHistory.length - 1];
      if (!lastPhase.endedAt) {
        lastPhase.endedAt = ts;
      }
    }

    // Determine iteration number for precopy loop phases
    let iteration: number | undefined;
    if (PrecopyLoopPhasesSet.has(entry.phase)) {
      const currentIteration = getCurrentPrecopyIteration(vm);
      
      if (entry.phase === PrecopyLoopStartPhase) {
        // Starting a new loop iteration
        iteration = currentIteration + 1;
      } else {
        // Continuation of current iteration (or first iteration if none yet)
        iteration = currentIteration || 1;
      }
    }

    // Start new phase
    vm.currentPhase = entry.phase;
    vm.phaseHistory.push({
      name: entry.phase,
      step: '',
      startedAt: ts,
      iteration,
    });

    const iterationSuffix = iteration ? ` (iteration ${iteration})` : '';
    store.addEvent({
      timestamp: entry.ts,
      type: 'phase_change',
      planName: plan.name,
      namespace: plan.namespace,
      vmName,
      description: `VM entered phase: ${entry.phase}${iterationSuffix}`,
      phase: entry.phase,
    });
  }

  // Check if completed
  if (entry.phase === Phases.Completed) {
    plan.status = PlanStatuses.Succeeded;
  }
}

/**
 * Process SetCheckpoint log entries to extract warm migration precopy data.
 * The SetCheckpoint message contains accumulated precopies with snapshot names,
 * disk deltas, and timing information.
 */
function processSetCheckpoint(plan: Plan, entry: LogEntry, _ts: Date): void {
  const { id: vmID } = getVMInfo(entry);
  if (!vmID) return;

  const vm = plan.vms[vmID];
  if (!vm) return;

  // Access extra fields from the SetCheckpoint entry
  const entryRecord = entry as unknown as Record<string, unknown>;
  const precopies = entryRecord.precopies as Array<{
    start?: string;
    end?: string;
    snapshot?: string;
    createTaskId?: string;
    removeTaskId?: string;
    deltas?: Array<{ disk?: string; deltaId?: string }>;
  }> | undefined;

  if (!precopies || precopies.length === 0) return;

  // Build PrecopyInfo from the raw precopies data
  const precopyInfos: PrecopyInfo[] = precopies.map((p, i) => {
    const start = p.start ? new Date(p.start) : undefined;
    const end = p.end ? new Date(p.end) : undefined;
    const durationMs = start && end ? end.getTime() - start.getTime() : undefined;
    return {
      iteration: i + 1,
      snapshot: p.snapshot || 'unknown',
      startedAt: start,
      endedAt: end,
      durationMs,
      disks: (p.deltas || []).map(d => d.disk || '').filter(Boolean),
    };
  });

  // Count successes (precopies with an end time) and failures
  const successes = precopyInfos.filter(p => p.endedAt).length;
  const totalAttempted = precopyInfos.length;
  const failures = totalAttempted - successes - (precopyInfos.some(p => !p.endedAt) ? 1 : 0); // Don't count in-progress as failure

  // Check if this is the final checkpoint
  const isFinal = entryRecord.final === true;

  const warmInfo: WarmInfo = {
    precopies: precopyInfos,
    successes,
    failures: failures > 0 ? failures : 0,
    consecutiveFailures: 0,
  };

  // Always update warmInfo with the latest SetCheckpoint data (accumulates)
  vm.warmInfo = warmInfo;
  vm.precopyCount = precopyInfos.length;

  // Mark as warm migration if not already set
  if (vm.migrationType === 'Unknown') {
    vm.migrationType = 'Warm';
  }

  // Store final checkpoint info for reference
  if (isFinal) {
    vm.warmInfo.consecutiveFailures = 0; // Final checkpoint means success
  }
}

/**
 * Process itinerary transitions
 */
function processPhaseTransition(store: LogStore, plan: Plan, entry: LogEntry, ts: Date): void {
  const currentPhase = entry['current phase'];
  const nextPhase = entry['next phase'];

  if (!currentPhase || !nextPhase) return;

  store.addEvent({
    timestamp: entry.ts,
    type: 'phase_transition',
    planName: plan.name,
    namespace: plan.namespace,
    description: `${currentPhase} → ${nextPhase}`,
    phase: nextPhase,
  });

  // If transitioning to Completed, update all VMs
  if (nextPhase === Phases.Completed) {
    for (const vm of Object.values(plan.vms)) {
      if (vm.currentPhase !== Phases.Completed) {
        // Close previous phase
        if (vm.phaseHistory.length > 0) {
          const lastPhase = vm.phaseHistory[vm.phaseHistory.length - 1];
          if (!lastPhase.endedAt) {
            lastPhase.endedAt = ts;
          }
        }
        vm.currentPhase = Phases.Completed;
        vm.phaseHistory.push({
          name: Phases.Completed,
          step: '',
          startedAt: ts,
          endedAt: ts,
        });
      }
    }
    plan.status = PlanStatuses.Succeeded;
  }
}

/**
 * Process condition additions
 */
function processConditionAdded(store: LogStore, plan: Plan, entry: LogEntry, ts: Date): void {
  if (!entry.condition) return;

  const condType = getStringFromMap(entry.condition, 'type');
  const condStatus = getStringFromMap(entry.condition, 'status');
  const condMessage = getStringFromMap(entry.condition, 'message');
  const condCategory = getStringFromMap(entry.condition, 'category');

  const cond: Condition = {
    type: condType,
    status: condStatus,
    category: condCategory,
    message: condMessage,
    timestamp: ts,
  };

  // Update plan status based on condition
  if (condType === 'Executing' && condStatus === ConditionStatus.True) {
    plan.status = PlanStatuses.Running;
  } else if (condType === 'Ready' && condStatus === ConditionStatus.True && plan.status === PlanStatuses.Pending) {
    plan.status = PlanStatuses.Ready;
  } else if (condType === 'Succeeded' && condStatus === ConditionStatus.True) {
    plan.status = PlanStatuses.Succeeded;
  } else if (condType === 'Failed' && condStatus === ConditionStatus.True) {
    plan.status = PlanStatuses.Failed;
  }

  // Add or update condition
  const existingIdx = plan.conditions.findIndex(c => c.type === condType);
  if (existingIdx >= 0) {
    plan.conditions[existingIdx] = cond;
  } else {
    plan.conditions.push(cond);
  }

  store.addEvent({
    timestamp: entry.ts,
    type: 'condition',
    planName: plan.name,
    namespace: plan.namespace,
    description: `${condType}: ${condMessage}`,
  });
}

/**
 * Process condition deletions
 */
function processConditionDeleted(plan: Plan, entry: LogEntry): void {
  if (!entry.condition) return;

  const condType = getStringFromMap(entry.condition, 'type');
  plan.conditions = plan.conditions.filter(c => c.type !== condType);
}

/**
 * Process DataVolume creation
 */
function processDataVolume(plan: Plan, entry: LogEntry, ts: Date): void {
  const { id: vmID } = getVMInfo(entry);
  if (!vmID) return;

  const vm = plan.vms[vmID];
  if (!vm) return;

  vm.dataVolumes.push({
    name: entry.dv!,
    createdAt: ts,
  });

  // Store raw log entry for CreateDataVolumes phase
  const rawLogEntry: RawLogEntry = {
    timestamp: entry.ts,
    level: entry.level,
    message: `${entry.msg} (${entry.dv})`,
    phase: 'CreateDataVolumes',
    rawLine: entry.rawLine || '',
  };

  if (!vm.phaseLogs['CreateDataVolumes']) {
    vm.phaseLogs['CreateDataVolumes'] = [];
  }
  vm.phaseLogs['CreateDataVolumes'].push(rawLogEntry);
}

/**
 * Process created resources (VMs, Pods, Secrets, ConfigMaps, etc.)
 */
function processCreatedResource(plan: Plan, entry: LogEntry, ts: Date, msg: string): void {
  const { id: vmID } = getVMInfo(entry);
  if (!vmID) return;

  const vm = plan.vms[vmID];
  if (!vm) return;

  let resourceType = '';
  let resourceName = '';

  // Handle specific resource creation messages
  // Cast entry to unknown first, then to Record for accessing dynamic fields
  const entryRecord = entry as unknown as Record<string, unknown>;
  
  // "Secret created." with 'secret' field
  if (msg === 'Secret created.' && entryRecord.secret) {
    resourceType = 'Secret';
    resourceName = entryRecord.secret as string;
  }
  // "ConfigMap created." with 'configMap' field
  else if (msg === 'ConfigMap created.' && entryRecord.configMap) {
    resourceType = 'ConfigMap';
    resourceName = entryRecord.configMap as string;
  }
  // "Pod created." with 'pod' field
  else if (msg === 'Pod created.' && entryRecord.pod) {
    resourceType = 'Pod';
    resourceName = entryRecord.pod as string;
  }
  // "VirtualMachine created." with 'virtualMachine' field
  else if (msg === 'VirtualMachine created.' && entryRecord.virtualMachine) {
    resourceType = 'VirtualMachine';
    resourceName = entryRecord.virtualMachine as string;
  }
  // "PVC created." with 'pvc' field
  else if (msg === 'PVC created.' && entryRecord.pvc) {
    resourceType = 'PVC';
    resourceName = entryRecord.pvc as string;
  }
  // Generic "Created X." format
  else {
    const resourceMatch = msg.match(/^Created (\w+)\.?$/);
    if (resourceMatch) {
      resourceType = resourceMatch[1];
      // Skip DataVolumes as they're handled separately
      if (resourceType === 'DataVolume') return;
      
      // Get resource name from the 'object' field if available
      if (entry.object?.name) {
        resourceName = entry.object.namespace 
          ? `${entry.object.namespace}/${entry.object.name}`
          : entry.object.name;
      }
    }
  }

  if (!resourceType) return;

  // Check if this resource is already tracked (avoid duplicates)
  const exists = vm.createdResources.some(
    r => r.type === resourceType && r.name === resourceName
  );
  
  if (!exists) {
    vm.createdResources.push({
      type: resourceType,
      name: resourceName,
      createdAt: ts,
    });
  }
}

/**
 * Process error-level log entries
 */
function processErrorLog(
  store: LogStore,
  plan: Plan,
  planName: string,
  namespace: string,
  entry: LogEntry,
  ts: Date
): void {
  const msg = entry.msg || '';

  // Ignore transient startup errors
  if (entry.error?.includes('connection refused')) {
    return;
  }

  // Mark as failed for Reconcile failed errors
  if (msg.includes('Reconcile failed')) {
    plan.status = PlanStatuses.Failed;
  }

  // Get VM name if available
  const { name: vmName } = getVMInfo(entry);

  // Build message with VM name if available
  let fullMsg = msg;
  if (vmName) {
    fullMsg = `[${vmName}] ${msg}`;
  }

  // Check if this error already exists (group identical errors)
  const existingIdx = plan.errors.findIndex(
    e => e.error === entry.error && e.message === fullMsg
  );

  if (existingIdx >= 0) {
    plan.errors[existingIdx].count++;
    plan.errors[existingIdx].timestamp = ts;
  } else {
    plan.errors.push({
      timestamp: ts,
      message: fullMsg,
      error: entry.error || '',
      stacktrace: entry.stacktrace,
      rawLine: entry.rawLine,
      count: 1,
      level: 'error',
    });
  }

  store.addEvent({
    timestamp: entry.ts,
    type: 'error',
    planName,
    namespace,
    vmName,
    description: truncate(`${fullMsg}: ${entry.error}`, 150),
  });
}

/**
 * Process warning-level log entries
 */
function processWarningLog(
  store: LogStore,
  plan: Plan,
  planName: string,
  namespace: string,
  entry: LogEntry,
  ts: Date
): void {
  const { name: vmName } = getVMInfo(entry);

  const errorMsg = entry.err || '';
  let fullMsg = entry.msg || '';
  if (vmName) {
    fullMsg = `[${vmName}] ${entry.msg}`;
  }

  // Check if this error already exists
  const existingIdx = plan.errors.findIndex(e => e.error === errorMsg);

  if (existingIdx >= 0) {
    plan.errors[existingIdx].count++;
    plan.errors[existingIdx].timestamp = ts;
  } else {
    plan.errors.push({
      timestamp: ts,
      message: fullMsg,
      error: errorMsg,
      rawLine: entry.rawLine,
      count: 1,
      level: 'warning',
    });
  }

  store.addEvent({
    timestamp: entry.ts,
    type: 'warning',
    planName,
    namespace,
    vmName,
    description: truncate(`${fullMsg}: ${errorMsg}`, 150),
  });
}

/**
 * Store log entry under VM's current phase
 */
export function storeVMLog(plan: Plan, entry: LogEntry): void {
  const { id: vmID } = getVMInfo(entry);
  if (!vmID) return;

  const vm = plan.vms[vmID];
  if (!vm || !vm.currentPhase) return;

  // Determine which phase to store under
  const phase = entry.phase || vm.currentPhase;

  const rawLogEntry: RawLogEntry = {
    timestamp: entry.ts,
    level: entry.level,
    message: entry.msg || '',
    phase,
    rawLine: entry.rawLine || '',
  };

  if (!vm.phaseLogs[phase]) {
    vm.phaseLogs[phase] = [];
  }
  vm.phaseLogs[phase].push(rawLogEntry);
}
