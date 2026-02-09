// Types for the Forklift Log Inspector

export type PlanStatus = 'Pending' | 'Ready' | 'Running' | 'Succeeded' | 'Failed' | 'Archived';
export type MigrationType = 'Unknown' | 'Warm' | 'Cold' | 'OnlyConversion';

export interface Condition {
  type: string;
  status: string;
  category?: string;
  message: string;
  timestamp: Date;
}

export interface PhaseInfo {
  name: string;
  step: string;
  startedAt: Date;
  endedAt?: Date;
  iteration?: number; // For phases that can repeat (precopy loop)
}

export interface PhaseSummaryItem {
  label: string;
  value: string;
  type?: string;
}

export interface DataVolume {
  name: string;
  createdAt: Date;
}

export interface CreatedResource {
  type: string;
  name: string;
  createdAt: Date;
}

export interface RawLogEntry {
  timestamp: string;
  level: string;
  message: string;
  phase?: string;
  rawLine: string;
}

export interface GroupedLogEntry {
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  level: string;
  entries: RawLogEntry[];
}

export interface PhaseLogSummary {
  phase: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  durationMs?: number;
  totalLogs: number;
  groupedLogs: GroupedLogEntry[];
  summaryItems?: PhaseSummaryItem[];
}

// Iteration info for precopy loop phases
export interface PhaseIteration {
  iteration: number;
  startedAt: Date;
  endedAt?: Date;
  durationMs?: number;
}

// Structured precopy data from Plan YAML
export interface PrecopyInfo {
  iteration: number;
  snapshot: string;
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  disks: string[];
}

export interface WarmInfo {
  precopies: PrecopyInfo[];
  successes: number;
  failures: number;
  consecutiveFailures: number;
  nextPrecopyAt?: string;
}

export interface VMError {
  phase: string;
  reasons: string[];
}

export interface VM {
  id: string;
  name: string;
  currentPhase: string;
  currentStep: string;
  migrationType: MigrationType;
  phaseHistory: PhaseInfo[];
  dataVolumes: DataVolume[];
  createdResources: CreatedResource[];
  phaseLogs: Record<string, RawLogEntry[]>;
  phaseLogSummaries?: Record<string, PhaseLogSummary>;
  firstSeen: Date;
  lastSeen: Date;
  fromYaml?: boolean; // True when parsed from Plan YAML (only show actual pipeline steps)
  precopyCount?: number; // Number of precopy iterations (warm migration from YAML)
  warmInfo?: WarmInfo; // Structured warm migration precopy data
  error?: VMError; // VM-level error (from YAML status)
  conditions?: Condition[]; // VM-level conditions (from YAML status)
  operatingSystem?: string; // Guest OS (from YAML status)
  restorePowerState?: string; // Power state to restore after migration
  newName?: string; // DNS-compliant renamed name (if different from original)
}

// Cycle view: logs from all phases grouped by cycle/iteration
export interface CyclePhaseData {
  phase: string;
  logs: RawLogEntry[];
  groupedLogs: GroupedLogEntry[];
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
}

export interface CycleData {
  iteration: number;
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  phases: CyclePhaseData[];
  totalLogs: number;
}

export interface ErrorEntry {
  timestamp: Date;
  message: string;
  error: string;
  stacktrace?: string;
  rawLine?: string;
  count: number;
  level: 'error' | 'warning';
}

export interface PanicEntry {
  timestamp: Date;
  message: string;
  controller?: string;
  reconcileId?: string;
  vmName?: string;
  stacktrace?: string;
  rawLines?: string[];
  count: number;
}

export interface PlanSpec {
  description?: string;
  targetNamespace?: string;
  preserveStaticIPs?: boolean;
  skipGuestConversion?: boolean;
  useCompatibilityMode?: boolean;
  runPreflightInspection?: boolean;
  targetPowerState?: string;
  migrateSharedDisks?: boolean;
  pvcNameTemplateUseGenerateName?: boolean;
  preserveClusterCPUModel?: boolean;
  deleteGuestConversionPod?: boolean;
  deleteVmOnFailMigration?: boolean;
  installLegacyDrivers?: boolean;
  transferNetwork?: string;
  sourceProvider?: string;
  destinationProvider?: string;
  networkMap?: string;
  storageMap?: string;
}

export interface Plan {
  name: string;
  namespace: string;
  status: PlanStatus;
  migrationType: MigrationType;
  migration?: string;
  conditions: Condition[];
  vms: Record<string, VM>;
  errors: ErrorEntry[];
  panics: PanicEntry[];
  firstSeen: Date;
  lastSeen: Date;
  spec?: PlanSpec;
}

export interface Event {
  timestamp: string;
  type: string;
  planName: string;
  namespace: string;
  vmName?: string;
  description: string;
  phase?: string;
}

export interface ParseStats {
  totalLines: number;
  parsedLines: number;
  errorLines: number;
  duplicateLines: number;
  plansFound: number;
  vmsFound: number;
}

export interface Summary {
  totalPlans: number;
  running: number;
  succeeded: number;
  failed: number;
  archived: number;
  pending: number;
}

export interface ParsedData {
  plans: Plan[];
  events: Event[];
  summary: Summary;
  stats: ParseStats;
}

// Log entry as parsed from JSON
export interface LogEntry {
  level: string;
  ts: string;
  logger: string;
  msg: string;
  plan?: { name: string; namespace: string };
  migration?: string;
  vm?: string;
  vmRef?: { id: string; name: string };
  phase?: string;
  condition?: Record<string, unknown>;
  error?: string;
  err?: string;
  stacktrace?: string;
  dv?: string;
  'current phase'?: string;
  'next phase'?: string;
  controller?: string;
  object?: { name: string; namespace: string };
  reconcileID?: string;
  panic?: string;
  panicGoValue?: string;
  rawLine?: string;
}
