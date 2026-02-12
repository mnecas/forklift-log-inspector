// Types for the V2V / Inspector Log Visualization

export type V2VLogType =
  | 'virt-v2v'
  | 'virt-v2v-in-place'
  | 'virt-v2v-inspector'
  | 'virt-v2v-customize';

/** A pipeline stage parsed from `[  X.Y] Stage name` lines */
export interface V2VPipelineStage {
  name: string;
  elapsedSeconds: number;
  lineNumber: number;
}

/** Disk copy progress from virt-v2v monitoring output */
export interface V2VDiskProgress {
  diskNumber: number;
  totalDisks: number;
  percentComplete: number;
  lineNumber: number;
}

/** An NBDKIT instance (one per disk), grouped by socket path */
export interface NbdkitConnection {
  id: string;
  socketPath: string;
  uri: string;
  plugin: string;
  filters: string[];
  diskFile: string;
  startLine: number;
  endLine: number;
  logLines: string[];
  /** VDDK server IP (from config key=server) */
  server?: string;
  /** VDDK VM moref (from config key=vm) */
  vmMoref?: string;
  /** Transport mode (e.g. "nbdssl", "file") */
  transportMode?: string;
  /** Underlying disk size in bytes (from cow: underlying file size) */
  backingSize?: number;
}

/** Libguestfs appliance configuration and trace calls */
export interface LibguestfsInfo {
  backend: string;
  identifier: string;
  memsize: number;
  smp: number;
  drives: LibguestfsDrive[];
  apiCalls: LibguestfsApiCall[];
  launchLines: string[];
}

export interface LibguestfsDrive {
  path: string;
  format: string;
  protocol: string;
  server: string;
}

export interface LibguestfsApiCall {
  name: string;
  args: string;
  result: string;
  lineNumber: number;
}

/** A low-level command executed inside the guest VM */
export interface V2VGuestCommand {
  command: string;
  args: string[];
  source: 'command' | 'commandrvf' | 'chroot';
  returnCode?: number;
  stdoutLines: string[];
  lineNumber: number;
}

/**
 * A libguestfs API call with its nested guest commands.
 *
 * Flow: libguestfs trace (call) -> guestfsd request -> commands inside VM -> guestfsd response -> libguestfs trace (result)
 */
export interface V2VApiCall {
  /** API function name (e.g. `vfs_type`, `list_partitions`, `mount`) */
  name: string;
  /** Arguments passed to the API call */
  args: string;
  /** Return value from the result trace line */
  result: string;
  /** Libguestfs handle identifier (e.g. 'v2v' for guest, 'virtio_win' for ISO) */
  handle: string;
  /** Time in seconds taken by guestfsd (from `guestfsd: => ... took N secs`) */
  durationSecs?: number;
  /** Guest commands that ran as part of this API call */
  guestCommands: V2VGuestCommand[];
  /** Line number of the trace call */
  lineNumber: number;
}

/** A host-level command run by libguestfs (e.g. supermin, qemu-img) */
export interface V2VHostCommand {
  command: string;
  args: string[];
  lineNumber: number;
}

/** Drive letter mapping (e.g. C: => /dev/sda2) — Windows */
export interface V2VDriveMapping {
  letter: string;
  device: string;
}

/** Linux fstab entry (device -> mountpoint) */
export interface V2VFstabEntry {
  device: string;
  mountpoint: string;
}

/** Guest OS information extracted from inspection */
export interface V2VGuestInfo {
  root: string;
  type: string;
  distro: string;
  osinfo: string;
  arch: string;
  majorVersion: number;
  minorVersion: number;
  productName: string;
  productVariant: string;
  packageFormat: string;
  packageManagement: string;
  hostname: string;
  buildId: string;
  windowsSystemroot: string;
  windowsSoftwareHive: string;
  windowsSystemHive: string;
  windowsCurrentControlSet: string;
  driveMappings: V2VDriveMapping[];
  fstab: V2VFstabEntry[];
}

/** An installed application detected in the guest OS (from inspect_list_applications2) */
export interface V2VInstalledApp {
  name: string;
  displayName: string;
  version: string;
  publisher: string;
  installPath: string;
  description: string;
  arch: string;
}

/** A single registry value operation (read or write) */
export interface V2VHivexValueOp {
  /** Registry value name (e.g. "DisplayName", "Type", "Start") */
  name: string;
  /** Decoded value (human-readable string) */
  value: string;
  /** Line number in the raw log where this value was read/written */
  lineNumber: number;
}

/** A Windows Registry hive access session (open → navigate → close) */
export interface V2VRegistryHiveAccess {
  hivePath: string;
  mode: 'read' | 'write';
  /** Registry key path navigated via hivex_node_get_child (e.g. Microsoft\Windows\CurrentVersion\Uninstall) */
  keyPath: string;
  /** Values read or written during this key path traversal */
  values: V2VHivexValueOp[];
  lineNumber: number;
}

/** An error or warning entry */
export interface V2VError {
  level: 'error' | 'warning';
  source: string;
  message: string;
  lineNumber: number;
  rawLine: string;
}

/** The log line category for filtering and coloring */
export type V2VLineCategory =
  | 'stage'
  | 'nbdkit'
  | 'libguestfs'
  | 'guestfsd'
  | 'command'
  | 'kernel'
  | 'info'
  | 'error'
  | 'warning'
  | 'monitor'
  | 'xml'
  | 'yaml'
  | 'other';

/** A file copied to the guest VM (from VirtIO Win ISO, virt-tools, or generated scripts) */
export interface V2VFileCopy {
  /** Source path (ISO path like ///Balloon/2k19/amd64/balloon.sys, or host path like /usr/share/virt-tools/rhsrvany.exe) */
  source: string;
  /** Destination path on the guest VM */
  destination: string;
  /** File size in bytes (if known from "original size N bytes" in trace) */
  sizeBytes: number | null;
  /** Origin: 'virtio_win' (ISO driver), 'virt-tools' (host utility), 'script' (generated), or 'guest' (read-modify-write on guest) */
  origin: 'virtio_win' | 'virt-tools' | 'script' | 'guest';
  /** Decoded text content for scripts/text files (null for binary files) */
  content: string | null;
  /** Whether the content was truncated in the log */
  contentTruncated: boolean;
  lineNumber: number;
}

/** VirtIO Win ISO information and all files copied to the guest */
export interface V2VVirtioWinInfo {
  /** Path to the VirtIO Win ISO on the host */
  isoPath: string | null;
  /** All files copied to the guest */
  fileCopies: V2VFileCopy[];
}

/** Component/tool version information extracted from logs */
export interface V2VComponentVersions {
  virtV2v?: string;
  libvirt?: string;
  nbdkit?: string;
  vddk?: string;
  libguestfs?: string;
  qemu?: string;
  virtioWin?: string;
}

/** Per-disk storage info */
export interface V2VDiskInfo {
  index: number;
  sizeBytes?: number;
  sourceFile?: string;
  transportMode?: string;
  server?: string;
  vmMoref?: string;
}

/** Disk / storage summary */
export interface V2VDiskSummary {
  hostFreeSpace?: number;
  hostTmpDir?: string;
  disks: V2VDiskInfo[];
}

/** Source VM metadata extracted from libvirt XML */
export interface V2VSourceVM {
  name?: string;
  memoryKB?: number;
  vcpus?: number;
  firmware?: string;
  disks: { path: string; format?: string; device?: string }[];
  networks: { model?: string; source?: string; type?: string }[];
}

/** Inferred exit status of a tool run */
export type V2VExitStatus = 'success' | 'error' | 'in_progress' | 'unknown';

/** A single tool invocation (e.g. virt-v2v, virt-v2v-inspector) */
export interface V2VToolRun {
  tool: V2VLogType;
  commandLine: string;
  /** Inferred exit status: success if "Finishing off" reached with no fatal errors */
  exitStatus: V2VExitStatus;
  startLine: number;
  endLine: number;
  stages: V2VPipelineStage[];
  diskProgress: V2VDiskProgress[];
  nbdkitConnections: NbdkitConnection[];
  libguestfs: LibguestfsInfo;
  /** Libguestfs API calls with nested guest commands */
  apiCalls: V2VApiCall[];
  /** Host-level commands (supermin, qemu-img, etc.) */
  hostCommands: V2VHostCommand[];
  /** Guest OS information from inspection */
  guestInfo: V2VGuestInfo | null;
  /** Installed applications detected in the guest (Windows registry / RPM / etc.) */
  installedApps: V2VInstalledApp[];
  /** Windows Registry hive access sessions */
  registryHiveAccesses: V2VRegistryHiveAccess[];
  /** VirtIO Win / file copy information */
  virtioWin: V2VVirtioWinInfo;
  /** Component/tool versions detected in the log */
  versions: V2VComponentVersions;
  /** Disk/storage summary (sizes, free space, transport) */
  diskSummary: V2VDiskSummary;
  /** Source VM metadata from libvirt XML */
  sourceVM: V2VSourceVM | null;
  errors: V2VError[];
  rawLines: string[];
  /** Per-line category for filtering/coloring */
  lineCategories: V2VLineCategory[];
}

/** Top-level parse result for v2v logs */
export interface V2VParsedData {
  toolRuns: V2VToolRun[];
  totalLines: number;
  fileName?: string;
}
