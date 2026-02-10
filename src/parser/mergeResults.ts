/**
 * Merge ParsedData from the log pipeline and the Plan YAML pipeline.
 *
 * Strategy:
 *  - Logs only  → return as-is
 *  - YAML only  → return as-is
 *  - Both       → logs are primary; YAML enriches with spec, VM metadata, etc.
 */

import type { ParsedData, Plan, VM, Summary } from '../types';

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Merge results from both pipelines into a single ParsedData.
 * Either (or both) inputs may be null.
 */
export function mergeResults(
  logResult: ParsedData | null,
  yamlResult: ParsedData | null,
): ParsedData {
  // Only one source present → return it directly
  if (!logResult && !yamlResult) {
    return emptyResult();
  }
  if (!logResult) return yamlResult!;
  if (!yamlResult) return logResult;

  // Both present → merge
  return mergeBoth(logResult, yamlResult);
}

// ── Merge logic ────────────────────────────────────────────────────────────

function mergeBoth(logData: ParsedData, yamlData: ParsedData): ParsedData {
  // Index YAML plans by key (namespace/name)
  const yamlPlanMap = new Map<string, Plan>();
  for (const plan of yamlData.plans) {
    yamlPlanMap.set(planKey(plan), plan);
  }

  // Enrich log plans with YAML data
  const mergedPlans: Plan[] = [];
  const matchedYamlKeys = new Set<string>();

  for (const logPlan of logData.plans) {
    const key = planKey(logPlan);
    const yamlPlan = yamlPlanMap.get(key);

    if (yamlPlan) {
      matchedYamlKeys.add(key);
      mergedPlans.push(enrichPlan(logPlan, yamlPlan));
    } else {
      mergedPlans.push(logPlan);
    }
  }

  // Add YAML-only plans (not present in logs)
  for (const yamlPlan of yamlData.plans) {
    if (!matchedYamlKeys.has(planKey(yamlPlan))) {
      mergedPlans.push(yamlPlan);
    }
  }

  // Combine events
  const events = [...logData.events, ...yamlData.events];
  // Sort by timestamp
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Recompute stats
  const stats = {
    totalLines: logData.stats.totalLines + yamlData.stats.totalLines,
    parsedLines: logData.stats.parsedLines + yamlData.stats.parsedLines,
    errorLines: logData.stats.errorLines + yamlData.stats.errorLines,
    duplicateLines: logData.stats.duplicateLines + yamlData.stats.duplicateLines,
    plansFound: mergedPlans.length,
    vmsFound: mergedPlans.reduce(
      (sum, p) => sum + Object.keys(p.vms).length,
      0,
    ),
  };

  // Recompute summary from the merged plan list
  const summary = computeSummary(mergedPlans);

  return { plans: mergedPlans, events, stats, summary };
}

// ── Plan enrichment ────────────────────────────────────────────────────────

/**
 * Enrich a log-derived plan with data only available in the YAML pipeline.
 * The log plan is used as the base (it has richer event/phase-log data).
 */
function enrichPlan(logPlan: Plan, yamlPlan: Plan): Plan {
  const enriched: Plan = { ...logPlan };

  // YAML spec (never present in log-derived plans)
  if (yamlPlan.spec) {
    enriched.spec = yamlPlan.spec;
  }

  // If the log-derived status is inconclusive but YAML has a definitive status, use the YAML status
  if (
    (enriched.status === 'Pending' || enriched.status === 'Ready') &&
    yamlPlan.status !== 'Pending' &&
    yamlPlan.status !== 'Ready'
  ) {
    enriched.status = yamlPlan.status;
  }

  // Enrich VMs
  for (const [vmId, yamlVM] of Object.entries(yamlPlan.vms)) {
    const logVM = enriched.vms[vmId];
    if (logVM) {
      enrichVM(logVM, yamlVM);
    } else {
      // VM only exists in YAML → add it
      enriched.vms[vmId] = yamlVM;
    }
  }

  return enriched;
}

/**
 * Enrich a log-derived VM with YAML-only metadata.
 * Mutates the logVM in place.
 */
function enrichVM(logVM: VM, yamlVM: VM): void {
  // Fields that only come from YAML status
  if (yamlVM.operatingSystem && !logVM.operatingSystem) {
    logVM.operatingSystem = yamlVM.operatingSystem;
  }
  if (yamlVM.restorePowerState && !logVM.restorePowerState) {
    logVM.restorePowerState = yamlVM.restorePowerState;
  }
  if (yamlVM.newName && !logVM.newName) {
    logVM.newName = yamlVM.newName;
  }
  if (yamlVM.error && !logVM.error) {
    logVM.error = yamlVM.error;
  }
  if (yamlVM.conditions && (!logVM.conditions || logVM.conditions.length === 0)) {
    logVM.conditions = yamlVM.conditions;
  }
  // Warm info from YAML is more structured (has disk info, snapshots)
  if (yamlVM.warmInfo && !logVM.warmInfo) {
    logVM.warmInfo = yamlVM.warmInfo;
    logVM.precopyCount = yamlVM.precopyCount;
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
  };
}
