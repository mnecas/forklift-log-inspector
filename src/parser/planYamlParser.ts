import yaml from 'js-yaml';
import type { Plan, PlanSpec, VM, VMError, PhaseInfo, Condition, ParsedData, ParseStats, Summary, PhaseLogSummary, RawLogEntry, MigrationType, WarmInfo, PrecopyInfo } from '../types';
import { PlanStatuses, MigrationTypes, PipelineSteps, phaseToStep } from './constants';
import { formatDuration, groupLogs } from './utils';

// Types for the raw YAML structures
interface YamlPlanResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    uid?: string;
  };
  spec?: {
    description?: string;
    type?: string;
    warm?: boolean;
    vms?: Array<{ id?: string; name?: string }>;
    targetNamespace?: string;
    archived?: boolean;
    preserveStaticIPs?: boolean;
    skipGuestConversion?: boolean;
    useCompatibilityMode?: boolean;
    runPreflightInspection?: boolean;
    targetPowerState?: string;
    migrateSharedDisks?: boolean;
    pvcNameTemplateUseGenerateName?: boolean;
    preserveClusterCpuModel?: boolean;
    deleteGuestConversionPod?: boolean;
    deleteVmOnFailMigration?: boolean;
    installLegacyDrivers?: boolean;
    transferNetwork?: { name?: string; namespace?: string };
    provider?: {
      source?: { name?: string };
      destination?: { name?: string };
    };
    map?: {
      network?: { name?: string };
      storage?: { name?: string };
    };
  };
  status?: {
    conditions?: YamlCondition[];
    observedGeneration?: number;
    migration?: {
      started?: string;
      completed?: string;
      vms?: YamlVMStatus[];
      history?: unknown[];
    };
  };
}

interface YamlCondition {
  type?: string;
  status?: string;
  category?: string;
  message?: string;
  lastTransitionTime?: string;
  durable?: boolean;
}

interface YamlPipelineStep {
  name?: string;
  description?: string;
  phase?: string;
  started?: string;
  completed?: string;
  progress?: { completed?: number; total?: number };
  annotations?: Record<string, string>;
  tasks?: YamlTask[];
  error?: {
    phase?: string;
    reasons?: string[];
  };
}

interface YamlTask {
  name?: string;
  phase?: string;
  started?: string;
  completed?: string;
  reason?: string;
  progress?: { completed?: number; total?: number };
  annotations?: Record<string, string>;
}

interface YamlPrecopy {
  snapshot?: string;
  start?: string;
  end?: string;
  createTaskId?: string;
  removeTaskId?: string;
  deltas?: Array<{
    deltaId?: string;
    disk?: string;
  }>;
}

interface YamlVMStatus {
  id?: string;
  name?: string;
  newName?: string;
  phase?: string;
  started?: string;
  completed?: string;
  operatingSystem?: string;
  restorePowerState?: string;
  conditions?: YamlCondition[];
  pipeline?: YamlPipelineStep[];
  warm?: {
    precopies?: YamlPrecopy[];
    successes?: number;
    failures?: number;
    consecutiveFailures?: number;
    nextPrecopyAt?: string;
  };
  error?: {
    phase?: string;
    reasons?: string[];
  };
  luks?: Record<string, unknown>;
}

interface YamlKubernetesList {
  apiVersion?: string;
  kind?: string;
  items?: YamlPlanResource[];
  metadata?: unknown;
}

/**
 * Check if content looks like YAML (not JSON log lines)
 */
export function isYamlContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return false;
  if (trimmed.includes('apiVersion:') && trimmed.includes('kind:')) return true;
  if (trimmed.startsWith('---')) return true;
  return false;
}

/**
 * Parse Plan YAML content and return structured data
 */
export function parsePlanYaml(content: string): ParsedData {
  const docs = yaml.loadAll(content) as unknown[];

  const planResources: YamlPlanResource[] = [];

  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const obj = doc as Record<string, unknown>;

    if (obj.kind === 'PlanList' || obj.kind === 'List') {
      const list = doc as YamlKubernetesList;
      if (list.items && Array.isArray(list.items)) {
        for (const item of list.items) {
          if (isPlanResource(item)) {
            planResources.push(item);
          }
        }
      }
      continue;
    }

    if (isPlanResource(doc)) {
      planResources.push(doc as YamlPlanResource);
    }
  }

  const plans: Plan[] = planResources.map(convertPlanResource);

  const stats: ParseStats = {
    totalLines: content.split('\n').length,
    parsedLines: content.split('\n').length,
    errorLines: 0,
    duplicateLines: 0,
    plansFound: plans.length,
    vmsFound: plans.reduce((sum, p) => sum + Object.keys(p.vms).length, 0),
  };

  const summary: Summary = {
    totalPlans: plans.length,
    running: plans.filter(p => p.status === PlanStatuses.Running).length,
    succeeded: plans.filter(p => p.status === PlanStatuses.Succeeded).length,
    failed: plans.filter(p => p.status === PlanStatuses.Failed).length,
    archived: plans.filter(p => p.status === PlanStatuses.Archived).length,
    pending: plans.filter(p => p.status === PlanStatuses.Pending || p.status === PlanStatuses.Ready).length,
  };

  return { plans, events: [], summary, stats };
}

function isPlanResource(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return o.kind === 'Plan' && typeof o.apiVersion === 'string' &&
    (o.apiVersion as string).startsWith('forklift.konveyor.io/');
}

function convertPlanResource(resource: YamlPlanResource): Plan {
  const name = resource.metadata?.name || 'unknown';
  const namespace = resource.metadata?.namespace || 'default';
  const specType = resource.spec?.type || (resource.spec?.warm ? 'warm' : 'cold');

  let migrationType: MigrationType = MigrationTypes.Unknown as MigrationType;
  if (specType === 'warm') migrationType = MigrationTypes.Warm as MigrationType;
  else if (specType === 'cold') migrationType = MigrationTypes.Cold as MigrationType;

  const conditions: Condition[] = (resource.status?.conditions || []).map(c => ({
    type: c.type || '',
    status: c.status || '',
    category: c.category,
    message: c.message || '',
    timestamp: new Date(c.lastTransitionTime || 0),
  }));

  let status = PlanStatuses.Pending as string;
  if (resource.spec?.archived) {
    status = PlanStatuses.Archived;
  } else {
    for (const cond of conditions) {
      if (cond.type === 'Succeeded' && cond.status === 'True') {
        status = PlanStatuses.Succeeded;
        break;
      }
      if (cond.type === 'Failed' && cond.status === 'True') {
        status = PlanStatuses.Failed;
        break;
      }
      if (cond.type === 'Executing' && cond.status === 'True') {
        status = PlanStatuses.Running;
      }
      if (cond.type === 'Ready' && cond.status === 'True' && status === PlanStatuses.Pending) {
        status = PlanStatuses.Ready;
      }
    }
  }

  const vms: Record<string, VM> = {};
  const migrationVMs = resource.status?.migration?.vms || [];

  for (const yamlVM of migrationVMs) {
    const vm = convertVMStatus(yamlVM, migrationType);
    if (vm) {
      vms[vm.id] = vm;
    }
  }

  const migStarted = resource.status?.migration?.started;
  const migCompleted = resource.status?.migration?.completed;

  // Build plan spec info
  const spec: PlanSpec | undefined = resource.spec ? {
    description: resource.spec.description,
    targetNamespace: resource.spec.targetNamespace,
    preserveStaticIPs: resource.spec.preserveStaticIPs,
    skipGuestConversion: resource.spec.skipGuestConversion,
    useCompatibilityMode: resource.spec.useCompatibilityMode,
    runPreflightInspection: resource.spec.runPreflightInspection,
    targetPowerState: resource.spec.targetPowerState,
    migrateSharedDisks: resource.spec.migrateSharedDisks,
    pvcNameTemplateUseGenerateName: resource.spec.pvcNameTemplateUseGenerateName,
    preserveClusterCPUModel: resource.spec.preserveClusterCpuModel,
    deleteGuestConversionPod: resource.spec.deleteGuestConversionPod,
    deleteVmOnFailMigration: resource.spec.deleteVmOnFailMigration,
    installLegacyDrivers: resource.spec.installLegacyDrivers,
    transferNetwork: resource.spec.transferNetwork?.name,
    sourceProvider: resource.spec.provider?.source?.name,
    destinationProvider: resource.spec.provider?.destination?.name,
    networkMap: resource.spec.map?.network?.name,
    storageMap: resource.spec.map?.storage?.name,
  } : undefined;

  return {
    name,
    namespace,
    status: status as Plan['status'],
    migrationType,
    conditions,
    vms,
    errors: [],
    panics: [],
    firstSeen: new Date(migStarted || resource.metadata?.creationTimestamp || 0),
    lastSeen: new Date(migCompleted || migStarted || resource.metadata?.creationTimestamp || 0),
    spec,
  };
}

/**
 * Convert a YAML VM status to our internal VM type
 */
function convertVMStatus(yamlVM: YamlVMStatus, planMigrationType: MigrationType): VM | null {
  const id = yamlVM.id || '';
  const name = yamlVM.name || '';
  if (!id && !name) return null;

  const vmId = id || name;
  const isWarm = planMigrationType === MigrationTypes.Warm;
  const precopies = (isWarm && yamlVM.warm?.precopies) ? yamlVM.warm.precopies : [];
  const precopyCount = precopies.length;

  const phaseHistory: PhaseInfo[] = [];
  const phaseLogs: Record<string, RawLogEntry[]> = {};
  const phaseLogSummaries: Record<string, PhaseLogSummary> = {};

  const stepNameMap: Record<string, string> = {
    'Initialize': PipelineSteps.Initialize,
    'PreflightInspection': PipelineSteps.PreflightInspection,
    'DiskAllocation': PipelineSteps.DiskAllocation,
    'DiskTransfer': PipelineSteps.DiskTransfer,
    'DiskTransferV2v': PipelineSteps.DiskTransferV2v,
    'Cutover': PipelineSteps.Cutover,
    'ImageConversion': PipelineSteps.ImageConversion,
    'VirtualMachineCreation': PipelineSteps.VMCreation,
  };

  for (const step of yamlVM.pipeline || []) {
    const stepName = stepNameMap[step.name || ''] || step.name || '';
    const phaseName = step.name || 'Unknown';
    const isDiskTransfer = phaseName === 'DiskTransfer';
    const stepPhase = step.phase || '';
    const isPending = stepPhase === 'Pending' || (!step.started && !step.completed && !step.error);

    // Only add to phaseHistory if the step actually ran (not Pending)
    const started = step.started ? new Date(step.started) : undefined;
    const completed = step.completed ? new Date(step.completed) : undefined;
    const durationMs = started && completed ? completed.getTime() - started.getTime() : undefined;

    if (!isPending) {
      phaseHistory.push({
        name: phaseName,
        step: stepName,
        startedAt: started || new Date(0),
        endedAt: completed,
      });
    }

    // Build logs for this step (skip pending steps with no useful info)
    if (isPending) continue;

    const logs: RawLogEntry[] = [];
    const logTimestamp = started || new Date(0);

    // Step info log
    logs.push({
      timestamp: logTimestamp.toISOString(),
      level: 'info',
      message: `${step.description || phaseName} - Phase: ${stepPhase || 'Unknown'}`,
      phase: phaseName,
      rawLine: JSON.stringify({
        step: phaseName,
        description: step.description,
        phase: stepPhase,
        progress: step.progress,
        started: step.started,
        completed: step.completed,
      }, null, 2),
    });

    // Progress info
    if (step.progress) {
      const unit = step.annotations?.unit || '';
      const progressStr = unit
        ? `${step.progress.completed || 0}/${step.progress.total || 0} ${unit}`
        : `${step.progress.completed || 0}/${step.progress.total || 0}`;
      logs.push({
        timestamp: (completed || logTimestamp).toISOString(),
        level: 'info',
        message: `Progress: ${progressStr}`,
        phase: phaseName,
        rawLine: JSON.stringify({ progress: step.progress, annotations: step.annotations }, null, 2),
      });
    }

    // Task info
    for (const task of step.tasks || []) {
      logs.push({
        timestamp: (task.started ? new Date(task.started) : logTimestamp).toISOString(),
        level: 'info',
        message: `Task: ${task.name || 'unknown'}${task.reason ? ` - ${task.reason}` : ''}${task.annotations?.Precopy ? ` (Precopy #${task.annotations.Precopy})` : ''}`,
        phase: phaseName,
        rawLine: JSON.stringify(task, null, 2),
      });
    }

    // Step error
    if (step.error) {
      for (const reason of step.error.reasons || []) {
        logs.push({
          timestamp: (completed || logTimestamp).toISOString(),
          level: 'error',
          message: `${phaseName} failed: ${reason}`,
          phase: phaseName,
          rawLine: JSON.stringify({
            step: phaseName,
            error: step.error,
          }, null, 2),
        });
      }
    }

    // For DiskTransfer in warm migrations, add precopy details
    if (isDiskTransfer && precopyCount > 0) {
      addPrecopyLogs(logs, precopies, yamlVM.warm!, phaseName);
    }

    phaseLogs[phaseName] = logs;

    phaseLogSummaries[phaseName] = {
      phase: phaseName,
      startTime: started?.toISOString(),
      endTime: completed?.toISOString(),
      duration: durationMs ? formatDuration(durationMs) : undefined,
      durationMs,
      totalLogs: logs.length,
      groupedLogs: groupLogs(logs),
      // Add precopy summary items for DiskTransfer
      summaryItems: isDiskTransfer && precopyCount > 0 ? [
        { label: 'Precopies', value: `${precopyCount}`, type: 'info' },
        { label: 'Successes', value: `${yamlVM.warm?.successes || 0}`, type: 'info' },
        ...(yamlVM.warm?.failures ? [{ label: 'Failures', value: `${yamlVM.warm.failures}`, type: 'error' }] : []),
      ] : undefined,
    };
  }

  // Extract VM-level error
  let vmError: VMError | undefined;
  if (yamlVM.error) {
    vmError = {
      phase: yamlVM.error.phase || '',
      reasons: yamlVM.error.reasons || [],
    };
  }

  // Extract VM-level conditions
  const vmConditions: Condition[] = (yamlVM.conditions || []).map(c => ({
    type: c.type || '',
    status: c.status || '',
    category: c.category,
    message: c.message || '',
    timestamp: new Date(c.lastTransitionTime || 0),
  }));

  const currentPhase = yamlVM.phase || (phaseHistory.length > 0 ? phaseHistory[phaseHistory.length - 1].name : '');
  const currentStep = currentPhase ? phaseToStep(currentPhase, isWarm) : '';

  const vmStarted = yamlVM.started ? new Date(yamlVM.started) : new Date(0);
  const vmCompleted = yamlVM.completed ? new Date(yamlVM.completed) : undefined;

  // Build structured warm info
  let warmInfo: WarmInfo | undefined;
  if (isWarm && precopyCount > 0) {
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
    warmInfo = {
      precopies: precopyInfos,
      successes: yamlVM.warm?.successes || 0,
      failures: yamlVM.warm?.failures || 0,
      consecutiveFailures: yamlVM.warm?.consecutiveFailures || 0,
      nextPrecopyAt: yamlVM.warm?.nextPrecopyAt,
    };
  }

  return {
    id: vmId,
    name,
    currentPhase,
    currentStep,
    migrationType: planMigrationType,
    phaseHistory,
    dataVolumes: [],
    createdResources: [],
    phaseLogs,
    phaseLogSummaries,
    firstSeen: vmStarted,
    lastSeen: vmCompleted || vmStarted,
    fromYaml: true,
    precopyCount: precopyCount > 0 ? precopyCount : undefined,
    warmInfo,
    error: vmError,
    conditions: vmConditions.length > 0 ? vmConditions : undefined,
    operatingSystem: yamlVM.operatingSystem,
    restorePowerState: yamlVM.restorePowerState,
    newName: yamlVM.newName && yamlVM.newName !== name ? yamlVM.newName : undefined,
  };
}

/**
 * Add precopy iteration logs to DiskTransfer
 */
function addPrecopyLogs(
  logs: RawLogEntry[],
  precopies: YamlPrecopy[],
  warm: NonNullable<YamlVMStatus['warm']>,
  phaseName: string,
): void {
  for (let i = 0; i < precopies.length; i++) {
    const precopy = precopies[i];
    const iteration = i + 1;
    const start = precopy.start ? new Date(precopy.start) : undefined;
    const end = precopy.end ? new Date(precopy.end) : undefined;
    const durationMs = start && end ? end.getTime() - start.getTime() : undefined;

    const disks = (precopy.deltas || []).map(d => d.disk).filter(Boolean).join(', ');

    logs.push({
      timestamp: (start || new Date(0)).toISOString(),
      level: 'info',
      message: `Precopy ${iteration}/${precopies.length}: ${precopy.snapshot || 'snapshot'}${durationMs ? ` (${formatDuration(durationMs)})` : ''}${disks ? ` - ${disks}` : ''}`,
      phase: phaseName,
      rawLine: JSON.stringify({
        precopyIteration: iteration,
        totalPrecopies: precopies.length,
        snapshot: precopy.snapshot,
        start: precopy.start,
        end: precopy.end,
        duration: durationMs ? formatDuration(durationMs) : undefined,
        createTaskId: precopy.createTaskId,
        removeTaskId: precopy.removeTaskId,
        deltas: precopy.deltas,
      }, null, 2),
    });
  }

  // Precopy summary
  logs.push({
    timestamp: new Date().toISOString(),
    level: warm.failures ? 'warning' : 'info',
    message: `Precopy summary: ${warm.successes || 0} successes, ${warm.failures || 0} failures`,
    phase: phaseName,
    rawLine: JSON.stringify({
      successes: warm.successes,
      failures: warm.failures,
      consecutiveFailures: warm.consecutiveFailures,
      nextPrecopyAt: warm.nextPrecopyAt,
    }, null, 2),
  });
}
