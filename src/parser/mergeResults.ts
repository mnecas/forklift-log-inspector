/**
 * Merge two ParsedData results into one.
 *
 * Used for:
 *  - Combining log pipeline + YAML pipeline results
 *  - Accumulating results from multiple files / archives
 *
 * Strategy for duplicate plans (same namespace/name):
 *  - The plan with real log data (VMs not from YAML) is used as the base
 *  - The other plan enriches it with spec, VM metadata, status, etc.
 *  - If neither or both have log data, the first argument wins as base
 */

import type { ParsedData, Plan, VM, Summary } from '../types';

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Merge two ParsedData into a single combined result.
 * Either (or both) inputs may be null.
 */
export function mergeResults(
  a: ParsedData | null,
  b: ParsedData | null,
): ParsedData {
  if (!a && !b) return emptyResult();
  if (!a) return b!;
  if (!b) return a;
  return mergeBoth(a, b);
}

// ── Deduplication ─────────────────────────────────────────────────────────

function deduplicateMaps<T extends { name: string; namespace: string }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map(m => `${m.namespace}/${m.name}`));
  const result = [...a];
  for (const item of b) {
    const key = `${item.namespace}/${item.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// ── Merge logic ────────────────────────────────────────────────────────────

function mergeBoth(dataA: ParsedData, dataB: ParsedData): ParsedData {
  // Index plans from B by key
  const bPlanMap = new Map<string, Plan>();
  for (const plan of dataB.plans) {
    bPlanMap.set(planKey(plan), plan);
  }

  const mergedPlans: Plan[] = [];
  const matchedKeys = new Set<string>();

  // Walk plans from A, merge with B if matched
  for (const planA of dataA.plans) {
    const key = planKey(planA);
    const planB = bPlanMap.get(key);

    if (planB) {
      matchedKeys.add(key);
      mergedPlans.push(mergePlans(planA, planB));
    } else {
      mergedPlans.push(planA);
    }
  }

  // Add plans only in B
  for (const planB of dataB.plans) {
    if (!matchedKeys.has(planKey(planB))) {
      mergedPlans.push(planB);
    }
  }

  // Combine events and sort
  const events = [...dataA.events, ...dataB.events];
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Recompute stats
  const stats = {
    totalLines: dataA.stats.totalLines + dataB.stats.totalLines,
    parsedLines: dataA.stats.parsedLines + dataB.stats.parsedLines,
    errorLines: dataA.stats.errorLines + dataB.stats.errorLines,
    duplicateLines: dataA.stats.duplicateLines + dataB.stats.duplicateLines,
    plansFound: mergedPlans.length,
    vmsFound: mergedPlans.reduce(
      (sum, p) => sum + Object.keys(p.vms).length,
      0,
    ),
  };

  const summary = computeSummary(mergedPlans);

  // Combine network and storage maps (deduplicated by namespace/name)
  const networkMaps = deduplicateMaps(dataA.networkMaps || [], dataB.networkMaps || []);
  const storageMaps = deduplicateMaps(dataA.storageMaps || [], dataB.storageMaps || []);

  return { plans: mergedPlans, events, stats, summary, networkMaps, storageMaps };
}

// ── Plan merging ───────────────────────────────────────────────────────────

/**
 * Check whether a plan has real log-pipeline data (VMs not from YAML).
 */
function hasLogData(plan: Plan): boolean {
  return Object.values(plan.vms).some(vm => !vm.fromYaml);
}

/**
 * Merge two plans with the same namespace/name.
 *
 * The plan with real log-pipeline data is used as the base (richer events,
 * phase logs, raw entries). The other enriches it with spec, VM metadata,
 * and a more accurate status if the base status is inconclusive.
 *
 * If both or neither have log data, the first argument is used as base.
 */
function mergePlans(planA: Plan, planB: Plan): Plan {
  // Pick the log-derived plan as base, YAML-derived as enrichment
  const bHasLogs = hasLogData(planB);
  const aHasLogs = hasLogData(planA);
  const [base, other] = bHasLogs && !aHasLogs ? [planB, planA] : [planA, planB];

  const merged: Plan = { ...base };

  // Spec: take whichever has it
  if (other.spec && !merged.spec) {
    merged.spec = other.spec;
  }

  // Archived: true if either says so
  if (other.archived) {
    merged.archived = true;
  }

  // Status: if base is inconclusive, prefer other's definitive status
  if (
    (merged.status === 'Pending' || merged.status === 'Ready') &&
    other.status !== 'Pending' &&
    other.status !== 'Ready'
  ) {
    merged.status = other.status;
  }

  // Conditions: merge, prefer base but add missing from other
  if (other.conditions.length > 0) {
    const existingTypes = new Set(merged.conditions.map(c => c.type));
    for (const cond of other.conditions) {
      if (!existingTypes.has(cond.type)) {
        merged.conditions.push(cond);
      }
    }
  }

  // Errors: add unique errors from other
  if (other.errors.length > 0 && merged.errors.length === 0) {
    merged.errors = [...other.errors];
  }

  // Panics: add from other if base has none
  if (other.panics.length > 0 && merged.panics.length === 0) {
    merged.panics = [...other.panics];
  }

  // VMs: merge each VM
  for (const [vmId, otherVM] of Object.entries(other.vms)) {
    const baseVM = merged.vms[vmId];
    if (baseVM) {
      enrichVM(baseVM, otherVM);
    } else {
      merged.vms[vmId] = otherVM;
    }
  }

  return merged;
}

/**
 * Enrich a base VM with metadata from another VM.
 * Fills in fields that are missing from the base.
 * Mutates baseVM in place.
 */
function enrichVM(baseVM: VM, otherVM: VM): void {
  if (otherVM.operatingSystem && !baseVM.operatingSystem) {
    baseVM.operatingSystem = otherVM.operatingSystem;
  }
  if (otherVM.restorePowerState && !baseVM.restorePowerState) {
    baseVM.restorePowerState = otherVM.restorePowerState;
  }
  if (otherVM.newName && !baseVM.newName) {
    baseVM.newName = otherVM.newName;
  }
  if (otherVM.error && !baseVM.error) {
    baseVM.error = otherVM.error;
  }
  if (otherVM.conditions && (!baseVM.conditions || baseVM.conditions.length === 0)) {
    baseVM.conditions = otherVM.conditions;
  }
  if (otherVM.warmInfo && !baseVM.warmInfo) {
    baseVM.warmInfo = otherVM.warmInfo;
    baseVM.precopyCount = otherVM.precopyCount;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function planKey(plan: Plan): string {
  return `${plan.namespace}/${plan.name}`;
}

function computeSummary(plans: Plan[]): Summary {
  const summary: Summary = {
    totalPlans: plans.length,
    running: 0,
    succeeded: 0,
    failed: 0,
    archived: 0,
    pending: 0,
  };

  for (const plan of plans) {
    if (plan.archived) summary.archived++;
    switch (plan.status) {
      case 'Running':
        summary.running++;
        break;
      case 'Succeeded':
        summary.succeeded++;
        break;
      case 'Failed':
        summary.failed++;
        break;
      case 'Pending':
      case 'Ready':
        summary.pending++;
        break;
    }
  }

  return summary;
}

function emptyResult(): ParsedData {
  return {
    plans: [],
    events: [],
    stats: {
      totalLines: 0,
      parsedLines: 0,
      errorLines: 0,
      duplicateLines: 0,
      plansFound: 0,
      vmsFound: 0,
    },
    summary: {
      totalPlans: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      archived: 0,
      pending: 0,
    },
    networkMaps: [],
    storageMaps: [],
  };
}
