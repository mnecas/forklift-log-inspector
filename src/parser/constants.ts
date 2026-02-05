// Migration types
export const MigrationTypes = {
  Unknown: 'Unknown',
  Warm: 'Warm',
  Cold: 'Cold',
  OnlyConversion: 'OnlyConversion',
} as const;

// Plan statuses
export const PlanStatuses = {
  Pending: 'Pending',
  Ready: 'Ready',
  Running: 'Running',
  Succeeded: 'Succeeded',
  Failed: 'Failed',
  Archived: 'Archived',
} as const;

// Pipeline steps
export const PipelineSteps = {
  Unknown: 'Unknown',
  Initialize: 'Initialize',
  PreflightInspection: 'PreflightInspection',
  DiskAllocation: 'DiskAllocation',
  DiskTransfer: 'DiskTransfer',
  DiskTransferV2v: 'DiskTransferV2v',
  Cutover: 'Cutover',
  ImageConversion: 'ImageConversion',
  VMCreation: 'VMCreation',
} as const;

// Common VM phases
export const Phases = {
  Started: 'Started',
  PreHook: 'PreHook',
  PostHook: 'PostHook',
  Completed: 'Completed',
  // Warm and cold phases
  AddCheckpoint: 'AddCheckpoint',
  AddFinalCheckpoint: 'AddFinalCheckpoint',
  AllocateDisks: 'AllocateDisks',
  ConvertGuest: 'ConvertGuest',
  ConvertOpenstackSnapshot: 'ConvertOpenstackSnapshot',
  CopyDisks: 'CopyDisks',
  CopyDisksVirtV2V: 'CopyDisksVirtV2V',
  CopyingPaused: 'CopyingPaused',
  CreateDataVolumes: 'CreateDataVolumes',
  CreateFinalSnapshot: 'CreateFinalSnapshot',
  CreateGuestConversionPod: 'CreateGuestConversionPod',
  CreateInitialSnapshot: 'CreateInitialSnapshot',
  CreateSnapshot: 'CreateSnapshot',
  CreateVM: 'CreateVM',
  Finalize: 'Finalize',
  PreflightInspection: 'PreflightInspection',
  PowerOffSource: 'PowerOffSource',
  RemoveFinalSnapshot: 'RemoveFinalSnapshot',
  RemovePenultimateSnapshot: 'RemovePenultimateSnapshot',
  RemovePreviousSnapshot: 'RemovePreviousSnapshot',
  StoreInitialSnapshotDeltas: 'StoreInitialSnapshotDeltas',
  StorePowerState: 'StorePowerState',
  StoreSnapshotDeltas: 'StoreSnapshotDeltas',
  WaitForDataVolumesStatus: 'WaitForDataVolumesStatus',
  WaitForFinalDataVolumesStatus: 'WaitForFinalDataVolumesStatus',
  WaitForFinalSnapshot: 'WaitForFinalSnapshot',
  WaitForFinalSnapshotRemoval: 'WaitForFinalSnapshotRemoval',
  WaitForInitialSnapshot: 'WaitForInitialSnapshot',
  WaitForPenultimateSnapshotRemoval: 'WaitForPenultimateSnapshotRemoval',
  WaitForPowerOff: 'WaitForPowerOff',
  WaitForPreviousSnapshotRemoval: 'WaitForPreviousSnapshotRemoval',
  WaitForSnapshot: 'WaitForSnapshot',
} as const;

// Warm-only phases
export const WarmOnlyPhases: Set<string> = new Set([
  Phases.CreateInitialSnapshot,
  Phases.WaitForInitialSnapshot,
  Phases.StoreInitialSnapshotDeltas,
  Phases.WaitForDataVolumesStatus,
  Phases.CopyingPaused,
  Phases.RemovePreviousSnapshot,
  Phases.WaitForPreviousSnapshotRemoval,
  Phases.CreateSnapshot,
  Phases.WaitForSnapshot,
  Phases.StoreSnapshotDeltas,
  Phases.AddCheckpoint,
  Phases.RemovePenultimateSnapshot,
  Phases.WaitForPenultimateSnapshotRemoval,
  Phases.CreateFinalSnapshot,
  Phases.WaitForFinalSnapshot,
  Phases.WaitForFinalDataVolumesStatus,
  Phases.AddFinalCheckpoint,
  Phases.Finalize,
  Phases.RemoveFinalSnapshot,
  Phases.WaitForFinalSnapshotRemoval,
]);

// Cold disk phases
export const ColdDiskPhases: Set<string> = new Set([
  Phases.CopyDisks,
  Phases.AllocateDisks,
  Phases.CopyDisksVirtV2V,
]);

// Warm migration phases (ordered)
export const WarmMigrationPhases = [
  Phases.Started,
  Phases.PreHook,
  Phases.CreateInitialSnapshot,
  Phases.WaitForInitialSnapshot,
  Phases.StoreInitialSnapshotDeltas,
  Phases.PreflightInspection,
  Phases.CreateDataVolumes,
  Phases.WaitForDataVolumesStatus,
  Phases.CopyDisks,
  Phases.CopyingPaused,
  Phases.RemovePreviousSnapshot,
  Phases.WaitForPreviousSnapshotRemoval,
  Phases.CreateSnapshot,
  Phases.WaitForSnapshot,
  Phases.StoreSnapshotDeltas,
  Phases.AddCheckpoint,
  Phases.StorePowerState,
  Phases.PowerOffSource,
  Phases.WaitForPowerOff,
  Phases.RemovePenultimateSnapshot,
  Phases.WaitForPenultimateSnapshotRemoval,
  Phases.CreateFinalSnapshot,
  Phases.WaitForFinalSnapshot,
  Phases.WaitForFinalDataVolumesStatus,
  Phases.AddFinalCheckpoint,
  Phases.Finalize,
  Phases.RemoveFinalSnapshot,
  Phases.WaitForFinalSnapshotRemoval,
  Phases.CreateGuestConversionPod,
  Phases.ConvertGuest,
  Phases.CreateVM,
  Phases.PostHook,
  Phases.Completed,
];

// Cold migration phases (ordered)
export const ColdMigrationPhases = [
  Phases.Started,
  Phases.PreHook,
  Phases.StorePowerState,
  Phases.PowerOffSource,
  Phases.WaitForPowerOff,
  Phases.CreateDataVolumes,
  Phases.AllocateDisks,
  Phases.CreateGuestConversionPod,
  Phases.ConvertGuest,
  Phases.CopyDisksVirtV2V,
  Phases.CreateVM,
  Phases.PostHook,
  Phases.Completed,
];

// Only conversion phases (ordered)
export const OnlyConversionPhases = [
  Phases.Started,
  Phases.PreHook,
  Phases.StorePowerState,
  Phases.PowerOffSource,
  Phases.WaitForPowerOff,
  Phases.CreateGuestConversionPod,
  Phases.ConvertGuest,
  Phases.CreateVM,
  Phases.PostHook,
  Phases.Completed,
];

// Get phases for migration type
export function getPhasesForMigrationType(migrationType: string): string[] {
  switch (migrationType) {
    case MigrationTypes.Warm:
      return WarmMigrationPhases;
    case MigrationTypes.Cold:
      return ColdMigrationPhases;
    case MigrationTypes.OnlyConversion:
      return OnlyConversionPhases;
    default:
      return [...WarmMigrationPhases]; // Return all phases for unknown
  }
}

// Map phase to pipeline step
export function phaseToStep(phase: string, isWarm: boolean): string {
  switch (phase) {
    case Phases.Started:
    case Phases.CreateInitialSnapshot:
    case Phases.WaitForInitialSnapshot:
    case Phases.StoreInitialSnapshotDeltas:
      return PipelineSteps.Initialize;
    case Phases.AllocateDisks:
      return PipelineSteps.DiskAllocation;
    case Phases.CopyDisks:
    case Phases.CopyingPaused:
    case Phases.RemovePreviousSnapshot:
    case Phases.WaitForPreviousSnapshotRemoval:
    case Phases.CreateSnapshot:
    case Phases.WaitForSnapshot:
    case Phases.StoreSnapshotDeltas:
    case Phases.AddCheckpoint:
    case Phases.ConvertOpenstackSnapshot:
      return PipelineSteps.DiskTransfer;
    case Phases.CreateDataVolumes:
    case Phases.WaitForDataVolumesStatus:
      return PipelineSteps.Initialize;
    case Phases.RemovePenultimateSnapshot:
    case Phases.WaitForPenultimateSnapshotRemoval:
    case Phases.CreateFinalSnapshot:
    case Phases.WaitForFinalSnapshot:
    case Phases.WaitForFinalDataVolumesStatus:
    case Phases.AddFinalCheckpoint:
    case Phases.Finalize:
    case Phases.RemoveFinalSnapshot:
    case Phases.WaitForFinalSnapshotRemoval:
      return PipelineSteps.Cutover;
    case Phases.CreateGuestConversionPod:
    case Phases.ConvertGuest:
      return PipelineSteps.ImageConversion;
    case Phases.CopyDisksVirtV2V:
      return PipelineSteps.DiskTransferV2v;
    case Phases.CreateVM:
      return PipelineSteps.VMCreation;
    case Phases.PreHook:
    case Phases.PostHook:
      return phase;
    case Phases.StorePowerState:
    case Phases.PowerOffSource:
    case Phases.WaitForPowerOff:
      return isWarm ? PipelineSteps.Cutover : PipelineSteps.Initialize;
    case Phases.PreflightInspection:
      return PipelineSteps.PreflightInspection;
    case Phases.Completed:
      return PipelineSteps.VMCreation;
    default:
      return PipelineSteps.Unknown;
  }
}

// Condition status values
export const ConditionStatus = {
  True: 'True',
  False: 'False',
} as const;

// Panic-related constants
export const PanicPrefix = 'panic:';
export const GoroutinePrefix = 'goroutine ';

// Container log regex pattern
export const ContainerLogPrefixRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(\{.*)$/;

// VM regex pattern
export const VMRegex = /id:(vm-\d+)\s+name:'([^']+)'/;
