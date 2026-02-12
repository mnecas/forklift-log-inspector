/**
 * Shared helpers for virt-v2v log parsing.
 * Line categorization, command parsing, version detection, and regex patterns.
 */

import type {
  V2VLineCategory,
  V2VError,
  V2VExitStatus,
  V2VPipelineStage,
  V2VApiCall,
  V2VGuestCommand,
  V2VHostCommand,
  V2VComponentVersions,
} from '../../types/v2v';

// ── Line matching regexes ────────────────────────────────────────────────────

/** virt-v2v pipeline stage: `[   0.0] Setting up the source` (1 decimal) */
export const STAGE_RE = /^\[\s*(\d+\.\d)\]\s+(.+)$/;

/** Kernel boot line: `[    0.000000]` (3+ decimals) */
export const KERNEL_BOOT_RE = /^\[\s*\d+\.\d{3,}\]/;

/** libguestfs trace api call — captures: [1]=handle (v2v, virtio_win, ...), [2]=api name, [3]=args */
export const LIBGUESTFS_TRACE_RE = /^libguestfs: trace: (\w+): (\S+)\s*(.*)/;

/** libguestfs add_drive */
export const LIBGUESTFS_DRIVE_RE =
  /add_drive\s+"([^"]*)"\s+"format:([^"]*)"\s+"protocol:([^"]*)"\s+"server:([^"]*)"/;

/** libguestfs set_memsize */
export const LIBGUESTFS_MEMSIZE_RE = /set_memsize\s+(\d+)/;

/** libguestfs set_smp */
export const LIBGUESTFS_SMP_RE = /set_smp\s+(\d+)/;

/** libguestfs backend */
export const LIBGUESTFS_BACKEND_RE = /^libguestfs: launch: backend=(.+)/;

/** libguestfs identifier from kernel command line */
export const LIBGUESTFS_ID_RE = /guestfs_identifier=(\S+)/;

/** command execution: `command: blkid '-c' ...` */
export const COMMAND_RE = /^command:\s+(\S+)\s*(.*)/;

/** command return code: `command: blkid returned 0` */
export const CMD_RETURN_RE = /^command:\s+(\S+)\s+returned\s+(\d+)/;

/** command stdout header: `command: blkid: stdout:` */
export const CMD_STDOUT_RE = /^command:\s+(\S+):\s+stdout:$/;

/** commandrvf metadata: `commandrvf: stdout=y stderr=y flags=0x0` */
export const COMMANDRVF_META_RE = /^commandrvf:\s+stdout=[yn]\s+stderr=[yn]\s+flags=/;

/** commandrvf execution: `commandrvf: udevadm --debug settle` */
export const COMMANDRVF_EXEC_RE = /^commandrvf:\s+(\S+)\s*(.*)/;

/** chroot execution */
export const CHROOT_RE = /^chroot:\s+(\S+):\s+running\s+'([^']+)'/;

/** libguestfs command: run: */
export const LIBGUESTFS_CMD_RE = /^libguestfs: command: run:\s*(.*)/;

/** virt-v2v monitoring progress */
export const MONITOR_PROGRESS_RE = /virt-v2v monitoring:\s*Progress update, completed\s+(\d+)\s*%/;

/** virt-v2v monitoring disk copy */
export const MONITOR_DISK_RE = /virt-v2v monitoring:\s*Copying disk\s+(\d+)\s+out of\s+(\d+)/;

/** guestfsd request start: `guestfsd: <= list_partitions (0x8) request length 40 bytes` */
export const GUESTFSD_START_RE = /^guestfsd:\s+<=\s+(\w+)\s+\(0x[\da-f]+\)/i;

/** guestfsd request end: `guestfsd: => list_partitions (0x8) took 0.04 secs` */
export const GUESTFSD_END_RE = /^guestfsd:\s+=>\s+(\w+)\s+\(0x[\da-f]+\)\s+took\s+([\d.]+)\s+secs/i;

/** error patterns (context-aware) */
export const ERROR_RE = /\berror[:\s]/i;
export const WARNING_RE = /\bwarning[:\s]/i;

/** check_host_free_space: large_tmpdir=/var/tmp free_space=56748552192 */
export const HOST_FREE_SPACE_RE = /^check_host_free_space:\s+large_tmpdir=(\S+)\s+free_space=(\d+)/;

// ── Version detection regexes ────────────────────────────────────────────────

/** info: virt-v2v: virt-v2v 2.7.1rhel=9,release=8.el9_6 (x86_64) */
export const VERSION_VIRTV2V_RE = /^info:\s*(?:virt-v2v[\w-]*):\s*virt-v2v\s+([\d.]+\S*)/;
/** info: libvirt version: 10.10.0 */
export const VERSION_LIBVIRT_RE = /^info:\s*libvirt version:\s*([\d.]+)/;
/** nbdkit 1.38.5 (nbdkit-...) */
export const VERSION_NBDKIT_RE = /\bnbdkit\s+([\d]+\.[\d]+\.[\d]+)/;
/** VMware VixDiskLib (7.0.3) Release ... */
export const VERSION_VDDK_RE = /VMware VixDiskLib \(([\d.]+)\)/;
/** libguestfs: qemu version: 9.1  or  qemu version (reported by libvirt) = 10000000 */
export const VERSION_QEMU_RE = /libguestfs:\s*qemu version[^:]*:\s*([\d.]+)/;
/** libguestfs: trace: v2v: version = <struct guestfs_version = major: 1, minor: 56, release: 1 */
export const VERSION_LIBGUESTFS_RE =
  /libguestfs: trace: \w+: version = <struct guestfs_version = major: (\d+), minor: (\d+), release: (\d+)/;
/** virtio-win version from ISO path: virtio-win-1.9.46.iso */
export const VERSION_VIRTIO_WIN_RE = /virtio-win-([\d.]+)\.iso/;

// ── Line categorization / noise filtering ────────────────────────────────────

/** false-positive error patterns to ignore */
export const ERROR_FALSE_POSITIVES = [
  /get_backend_setting = NULL \(error\)/,
  /usbserial.*error/i,
  /error: No error/,
  /TLS disabled/,
];

/** Known line prefixes that indicate stdout capture should stop. */
export const KNOWN_PREFIXES = [
  'command:',
  'commandrvf:',
  'chroot:',
  'guestfsd:',
  'libguestfs:',
  'nbdkit:',
  'supermin:',
  'libnbd:',
  'info:',
  'virt-v2v',
  'umount-all:',
  'Building command',
  'windows:',
  'hivex:',
  // Noisy udev / systemd / varlink / debug prefixes (stop stdout capture)
  'udev:',
  'udevadm:',
  'varlink:',
  'list_filesystems:',
];

/** Commands to omit entirely (noisy, run before every disk operation). */
export const NOISY_COMMANDS = ['udevadm'];

/** Noisy stderr / interstitial lines that should stop stdout capture. */
export const NOISY_LINE_RE =
  /^(?:No filesystem is currently mounted on|Failed to determine unit we run in|SELinux enabled state cached to|varlink:|udev:|udevadm:)/;

/** Corrupted prefixes from interleaved concurrent process output. */
export const CORRUPTED_PREFIX_RE =
  /^(?:gulibguestfs:|estfsd:|uestfsd:|stfsd:|glibguestfs:|guelibguestfs:|gueslibguestfs:|guestfsdlibguestfs:|tfsd:)/;

/** Data-driven version detection: try each regex against the line. */
export const VERSION_MATCHERS: { key: keyof V2VComponentVersions; re: RegExp; fmt?: (m: RegExpMatchArray) => string }[] = [
  { key: 'virtV2v', re: VERSION_VIRTV2V_RE },
  { key: 'libvirt', re: VERSION_LIBVIRT_RE },
  { key: 'nbdkit', re: VERSION_NBDKIT_RE },
  { key: 'vddk', re: VERSION_VDDK_RE },
  { key: 'qemu', re: VERSION_QEMU_RE },
  { key: 'libguestfs', re: VERSION_LIBGUESTFS_RE, fmt: (m) => `${m[1]}.${m[2]}.${m[3]}` },
  { key: 'virtioWin', re: VERSION_VIRTIO_WIN_RE },
];

// ── Helper functions ────────────────────────────────────────────────────────

export function categorizeLine(line: string): V2VLineCategory {
  if (KERNEL_BOOT_RE.test(line)) return 'kernel';
  if (STAGE_RE.test(line)) return 'stage';
  if (line.startsWith('nbdkit:') || line.startsWith('running nbdkit')) return 'nbdkit';
  if (line.startsWith('libguestfs:')) return 'libguestfs';
  if (line.startsWith('guestfsd:')) return 'guestfsd';
  if (line.startsWith('command:') || line.startsWith('commandrvf:') || line.startsWith('chroot:'))
    return 'command';
  if (line.startsWith('info:')) return 'info';
  if (/virt-v2v monitoring:/i.test(line)) return 'monitor';
  if (line.trimStart().startsWith('<')) return 'xml';
  if (/^\s*(apiVersion:|kind:|metadata:|spec:|status:|---\s*$)/.test(line)) return 'yaml';
  if (WARNING_RE.test(line)) return 'warning';
  if (ERROR_RE.test(line) && !isErrorFalsePositive(line)) return 'error';
  return 'other';
}

export function isKnownPrefix(line: string): boolean {
  for (const prefix of KNOWN_PREFIXES) {
    if (line.startsWith(prefix)) return true;
  }
  // Pipeline stages
  if (STAGE_RE.test(line) && !KERNEL_BOOT_RE.test(line)) return true;
  // Kernel boot lines
  if (KERNEL_BOOT_RE.test(line)) return true;
  // Common noisy stderr / interstitial lines
  if (NOISY_LINE_RE.test(line)) return true;
  // Corrupted / interleaved prefixes from concurrent process output
  if (CORRUPTED_PREFIX_RE.test(line)) return true;
  // Guest inspection info lines (i_root, i_type, etc.)
  if (/^i_\w+\s*=/.test(line)) return true;
  // Inspection structured block lines
  if (/^inspect_/.test(line)) return true;
  if (/^fs:\s+\/dev\//.test(line)) return true;
  if (/^check_filesystem:/.test(line)) return true;
  if (/^check_for_filesystem/.test(line)) return true;
  if (/^get_windows_systemroot/.test(line)) return true;
  // Root device header from inspect_get_roots: `/dev/sda1 (xfs):`
  if (/^\/dev\/\S+\s+\(\w+\):/.test(line)) return true;
  // Indented fields from inspect_os / inspect_get_roots structured blocks
  // e.g. "    type: linux", "    distro: amazonlinux", "    fstab: [...]"
  if (/^\s{4}\w[\w\s]*\w\s*:/.test(line)) return true;
  return false;
}

export function isNoisyCommand(name: string): boolean {
  return NOISY_COMMANDS.includes(name);
}

export function parseCommandArgs(argsStr: string): string[] {
  if (!argsStr) return [];
  // Split on spaces but respect quoted strings
  const args: string[] = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(argsStr)) !== null) {
    args.push(m[1] ?? m[2] ?? m[3]);
  }
  return args;
}

export function isErrorFalsePositive(line: string): boolean {
  for (const fp of ERROR_FALSE_POSITIVES) {
    if (fp.test(line)) return true;
  }
  // nbdkit debug lines that mention "error" in VDDK timestamps
  if (line.startsWith('nbdkit:') && line.includes('debug:')) return true;
  return false;
}

export function extractSource(line: string): string {
  if (line.startsWith('nbdkit:')) return 'nbdkit';
  if (line.startsWith('libguestfs:')) return 'libguestfs';
  if (line.startsWith('guestfsd:')) return 'guestfsd';
  if (line.startsWith('supermin:')) return 'supermin';
  if (line.startsWith('libnbd:')) return 'libnbd';
  if (/^virt-v2v-in-place:/.test(line)) return 'virt-v2v-in-place';
  if (/^virt-v2v-inspector:/.test(line)) return 'virt-v2v-inspector';
  if (/^virt-v2v-customize:|^virt-customize:/.test(line)) return 'virt-v2v-customize';
  if (/^virt-v2v:/.test(line)) return 'virt-v2v';
  return 'unknown';
}

/**
 * Infer the exit status of a tool run from available signals:
 * - "Finishing off" stage reached → likely success
 * - Fatal errors from virt-v2v/virt-v2v-in-place → error
 * - "virt-v2v monitoring: Finished" in raw lines → success
 */
export function inferExitStatus(
  stages: V2VPipelineStage[],
  errors: V2VError[],
  rawLines: string[],
): V2VExitStatus {
  const hasFinishingOff = stages.some((s) => /Finishing off/i.test(s.name));
  const hasMonitorFinished = rawLines.some((l) => /virt-v2v monitoring:\s*Finished/i.test(l));

  // Fatal errors from the tool itself (not from libguestfs/nbdkit)
  const hasFatalError = errors.some(
    (e) =>
      e.level === 'error' &&
      /^virt-v2v/.test(e.source) &&
      !/warning/i.test(e.message) &&
      !/ignored\)/i.test(e.message),
  );

  if (hasFatalError && !hasFinishingOff) return 'error';
  if (hasFinishingOff || hasMonitorFinished) return 'success';
  if (hasFatalError) return 'error';

  // No clear signal — if we have stages, the run is likely still in progress (log was captured mid-run)
  if (stages.length > 0) return 'in_progress';
  return 'unknown';
}

export function buildHostCommand(parts: string[], lineNumber: number): V2VHostCommand {
  const command = parts[0] || '';
  const args = parts.slice(1);
  return { command, args, lineNumber };
}

/**
 * Find the first open API call queue whose key ends with `:apiName`.
 * Keys are stored as `handle:apiName`.
 */
export function findQueueByApiName(
  openApiCalls: Map<string, V2VApiCall[]>,
  apiName: string,
): V2VApiCall[] | undefined {
  const suffix = `:${apiName}`;
  for (const [key, queue] of openApiCalls) {
    if (key.endsWith(suffix) && queue.length > 0) return queue;
  }
  return undefined;
}

/**
 * Attach collected guestfsd commands to the matching open API call.
 * Finds by name (FIFO) and moves commands into the API call's guestCommands array.
 */
export function attachGuestfsdToApiCall(
  scope: { name: string; commands: V2VGuestCommand[] },
  openApiCalls: Map<string, V2VApiCall[]>,
  completedApiCalls: V2VApiCall[],
): void {
  if (scope.commands.length === 0) return;

  // Try open API calls first (by api name across all handles)
  const queue = findQueueByApiName(openApiCalls, scope.name);
  if (queue && queue.length > 0) {
    queue[0].guestCommands.push(...scope.commands);
    return;
  }

  // Fall back to the most recent completed API call with the same name
  for (let i = completedApiCalls.length - 1; i >= 0; i--) {
    if (completedApiCalls[i].name === scope.name) {
      completedApiCalls[i].guestCommands.push(...scope.commands);
      return;
    }
  }

  // Last resort: attach to any open API call
  for (const q of openApiCalls.values()) {
    if (q.length > 0) {
      q[0].guestCommands.push(...scope.commands);
      return;
    }
  }
}

export function parseVersionFields(line: string, versions: V2VComponentVersions): void {
  for (const { key, re, fmt } of VERSION_MATCHERS) {
    if (!versions[key]) {
      const m = line.match(re);
      if (m) {
        (versions as Record<string, string>)[key] = fmt ? fmt(m) : m[1];
      }
    }
  }
}
