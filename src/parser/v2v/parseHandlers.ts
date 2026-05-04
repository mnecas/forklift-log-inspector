/**
 * Handler functions for parseToolRunSection.
 *
 * Each handler processes a specific category of log lines and updates the shared ParseContext.
 * The main loop calls handlers in order until one claims the line.
 */

import type {
  V2VPipelineStage,
  V2VDiskProgress,
  NbdkitConnection,
  V2VApiCall,
  V2VGuestCommand,
  V2VHostCommand,
  V2VError,
  V2VLineCategory,
  V2VComponentVersions,
  V2VDiskSummary,
  V2VSourceVM,
  V2VFileCopy,
  V2VInstalledApp,
  V2VRegistryHiveAccess,
  V2VGuestInfo,
  V2VBlkidEntry,
  LibguestfsDrive,
  LibguestfsApiCall,
} from '../../types/v2v';

import {
  HivexSessionState,
  flushHivexSession,
  decodeHivexData,
} from './hivexParser';

import {
  finalizeNbdkit,
  NBDKIT_SOCKET_RE,
  NBDKIT_URI_RE,
  NBDKIT_PLUGIN_RE,
  NBDKIT_FILTER_RE,
  NBDKIT_FILE_RE,
  NBDKIT_SERVER_RE,
  NBDKIT_VM_RE,
  NBDKIT_TRANSPORT_RE,
  COW_FILE_SIZE_RE,
} from './nbdkitParser';

import {
  buildGuestInfo,
  parseInstalledApps,
  parseLibvirtXML,
  parseBlkidLine,
} from './guestInfoParser';

import {
  extractOriginalSize,
  extractReadFileContent,
  extractWriteContent,
} from './fileCopyParser';

import {
  categorizeLine,
  isKnownPrefix,
  isNoisyCommand,
  parseCommandArgs,
  isErrorFalsePositive,
  extractSource,
  parseVersionFields,
  STAGE_RE,
  KERNEL_BOOT_RE,
  ERROR_RE,
  WARNING_RE,
  MONITOR_PROGRESS_RE,
  MONITOR_DISK_RE,
  HOST_FREE_SPACE_RE,
  LIBGUESTFS_TRACE_RE,
  LIBGUESTFS_DRIVE_RE,
  LIBGUESTFS_MEMSIZE_RE,
  LIBGUESTFS_SMP_RE,
  LIBGUESTFS_BACKEND_RE,
  LIBGUESTFS_ID_RE,
  COMMAND_RE,
  CMD_RETURN_RE,
  CMD_STDOUT_RE,
  COMMANDRVF_META_RE,
  COMMANDRVF_EXEC_RE,
  CHROOT_RE,
  LIBGUESTFS_CMD_RE,
  GUESTFSD_START_RE,
  GUESTFSD_END_RE,
  findQueueByApiName,
  attachGuestfsdToApiCall,
  buildHostCommand,
} from './v2vHelpers';

// ────────────────────────────────────────────────────────────────────────────
// ParseContext — shared mutable state for all handlers
// ────────────────────────────────────────────────────────────────────────────

export interface ParseContext {
  // Input
  sectionLines: string[];
  globalLineOffset: number;

  // Output accumulators
  stages: V2VPipelineStage[];
  diskProgress: V2VDiskProgress[];
  nbdkitConnections: NbdkitConnection[];
  errors: V2VError[];
  lineCategories: V2VLineCategory[];

  // API call tracking
  completedApiCalls: V2VApiCall[];
  openApiCalls: Map<string, V2VApiCall[]>;
  activeGuestfsd: { name: string; commands: V2VGuestCommand[] } | null;
  hostCommands: V2VHostCommand[];

  // Libguestfs state
  lgBackend: string;
  lgIdentifier: string;
  lgMemsize: number;
  lgSmp: number;
  lgDrives: LibguestfsDrive[];
  lgApiCalls: LibguestfsApiCall[];
  lgLaunchLines: string[];

  // NBDKIT state
  currentNbdkit: Partial<NbdkitConnection> | null;
  nbdkitMap: Map<string, NbdkitConnection>;

  // Multi-line command state
  pendingLibguestfsCmd: string[];
  pendingLibguestfsCmdLine: number;

  // Stdout capture
  stdoutCapture: { cmdName: string } | null;

  // Guest info
  guestInfo: V2VGuestInfo | null;
  guestInfoRaw: Map<string, string>;
  blkidEntries: V2VBlkidEntry[];

  // Versions
  versions: V2VComponentVersions;

  // Disk summary
  diskSummary: V2VDiskSummary;

  // Source VM
  sourceVM: V2VSourceVM | null;
  xmlCapture: string[] | null;

  // VirtIO Win / file copy
  virtioWinIsoPath: string | null;
  fileCopies: V2VFileCopy[];
  pendingVirtioWinRead: { source: string; sizeBytes: number | null; lineNumber: number } | null;
  pendingV2VReads: Map<string, { content: string | null; sizeBytes: number | null; lineNumber: number }>;
  lastV2VReadFilePath: string | null;

  // Installed apps & registry
  installedApps: V2VInstalledApp[];
  registryHiveAccesses: V2VRegistryHiveAccess[];
  currentHivexSession: HivexSessionState | null;
}

export function createParseContext(
  sectionLines: string[],
  globalLineOffset: number,
): ParseContext {
  return {
    sectionLines,
    globalLineOffset,
    stages: [],
    diskProgress: [],
    nbdkitConnections: [],
    errors: [],
    lineCategories: [],
    completedApiCalls: [],
    openApiCalls: new Map(),
    activeGuestfsd: null,
    hostCommands: [],
    lgBackend: '',
    lgIdentifier: '',
    lgMemsize: 0,
    lgSmp: 0,
    lgDrives: [],
    lgApiCalls: [],
    lgLaunchLines: [],
    currentNbdkit: null,
    nbdkitMap: new Map(),
    pendingLibguestfsCmd: [],
    pendingLibguestfsCmdLine: 0,
    stdoutCapture: null,
    guestInfo: null,
    guestInfoRaw: new Map(),
    blkidEntries: [],
    versions: {},
    diskSummary: { disks: [] },
    sourceVM: null,
    xmlCapture: null,
    virtioWinIsoPath: null,
    fileCopies: [],
    pendingVirtioWinRead: null,
    pendingV2VReads: new Map(),
    lastV2VReadFilePath: null,
    installedApps: [],
    registryHiveAccesses: [],
    currentHivexSession: null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Hivex helpers (context-bound)
// ────────────────────────────────────────────────────────────────────────────

/** Regex for "HANDLE \"NAME\"" patterns in hivex trace args. */
const HIVEX_HANDLE_NAME_RE = /(\d+)\s+"([^"]+)"/;
/** Regex for quoted string results in hivex trace args. */
const HIVEX_QUOTED_STRING_RE = /^"(.*)"$/;

function resetHivexTraversal(
  ctx: ParseContext,
  session: HivexSessionState,
  overrides?: { hasWriteOp?: boolean; firstWriteLine?: number; lineNumber?: number },
): void {
  flushHivexSession(session, ctx.registryHiveAccesses);
  session.keySegments = [];
  session.values = [];
  session.pendingGetValueName = null;
  session.pendingChildName = null;
  session.pendingChildParent = null;
  session.failedChild = null;
  session.hasWriteOp = overrides?.hasWriteOp ?? false;
  session.firstWriteLine = overrides?.firstWriteLine ?? 0;
  if (overrides?.lineNumber !== undefined) {
    session.lineNumber = overrides.lineNumber;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Guest command helpers
// ────────────────────────────────────────────────────────────────────────────

function addGuestCommand(ctx: ParseContext, cmd: V2VGuestCommand): void {
  if (ctx.activeGuestfsd) {
    ctx.activeGuestfsd.commands.push(cmd);
  } else {
    const allOpen = [...ctx.openApiCalls.values()];
    const lastQueue = allOpen[allOpen.length - 1];
    if (lastQueue && lastQueue.length > 0) {
      lastQueue[lastQueue.length - 1].guestCommands.push(cmd);
    }
  }
}

function findLastGuestCommand(ctx: ParseContext, cmdName: string): V2VGuestCommand | undefined {
  if (ctx.activeGuestfsd) {
    for (let j = ctx.activeGuestfsd.commands.length - 1; j >= 0; j--) {
      if (ctx.activeGuestfsd.commands[j].command === cmdName) return ctx.activeGuestfsd.commands[j];
    }
  }
  for (const queue of ctx.openApiCalls.values()) {
    for (let q = queue.length - 1; q >= 0; q--) {
      const cmds = queue[q].guestCommands;
      for (let j = cmds.length - 1; j >= 0; j--) {
        if (cmds[j].command === cmdName) return cmds[j];
      }
    }
  }
  for (let a = ctx.completedApiCalls.length - 1; a >= 0; a--) {
    const cmds = ctx.completedApiCalls[a].guestCommands;
    for (let j = cmds.length - 1; j >= 0; j--) {
      if (cmds[j].command === cmdName) return cmds[j];
    }
  }
  return undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: stdout capture mode
// ────────────────────────────────────────────────────────────────────────────

export function handleStdoutCapture(ctx: ParseContext, line: string): boolean {
  if (!ctx.stdoutCapture) return false;

  if (isKnownPrefix(line)) {
    ctx.stdoutCapture = null;
    return false; // fall through to normal parsing
  }

  const cmd = findLastGuestCommand(ctx, ctx.stdoutCapture.cmdName);
  if (cmd) cmd.stdoutLines.push(line);
  return true; // line consumed
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: pipeline stages
// ────────────────────────────────────────────────────────────────────────────

export function handlePipelineStages(ctx: ParseContext, line: string, globalLine: number): void {
  if (!KERNEL_BOOT_RE.test(line)) {
    const stageMatch = line.match(STAGE_RE);
    if (stageMatch) {
      ctx.stages.push({
        name: stageMatch[2].trim(),
        elapsedSeconds: parseFloat(stageMatch[1]),
        lineNumber: globalLine,
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: monitor progress
// ────────────────────────────────────────────────────────────────────────────

export function handleMonitorProgress(ctx: ParseContext, line: string, globalLine: number): void {
  const progressMatch = line.match(MONITOR_PROGRESS_RE);
  if (progressMatch) {
    const lastDisk = ctx.diskProgress.length > 0 ? ctx.diskProgress[ctx.diskProgress.length - 1] : null;
    if (lastDisk) {
      ctx.diskProgress.push({
        diskNumber: lastDisk.diskNumber,
        totalDisks: lastDisk.totalDisks,
        percentComplete: parseInt(progressMatch[1], 10),
        lineNumber: globalLine,
      });
    }
  }

  const diskMatch = line.match(MONITOR_DISK_RE);
  if (diskMatch) {
    ctx.diskProgress.push({
      diskNumber: parseInt(diskMatch[1], 10),
      totalDisks: parseInt(diskMatch[2], 10),
      percentComplete: 0,
      lineNumber: globalLine,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: versions and host free space
// ────────────────────────────────────────────────────────────────────────────

export function handleVersionsAndDiskInfo(ctx: ParseContext, line: string): void {
  parseVersionFields(line, ctx.versions);

  if (!ctx.diskSummary.hostFreeSpace) {
    const m = line.match(HOST_FREE_SPACE_RE);
    if (m) {
      ctx.diskSummary.hostTmpDir = m[1];
      ctx.diskSummary.hostFreeSpace = parseInt(m[2], 10);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: libvirt XML capture
// ────────────────────────────────────────────────────────────────────────────

export function handleLibvirtXML(ctx: ParseContext, line: string): void {
  if (ctx.xmlCapture !== null) {
    ctx.xmlCapture.push(line);
    if (line.trimStart().startsWith('</domain>')) {
      ctx.sourceVM = parseLibvirtXML(ctx.xmlCapture);
      ctx.xmlCapture = null;
    }
  } else if (!ctx.sourceVM && /<domain type=/.test(line)) {
    ctx.xmlCapture = [line];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: NBDKIT
// ────────────────────────────────────────────────────────────────────────────

export function handleNbdkit(ctx: ParseContext, line: string, globalLine: number): void {
  const isNbdkitStart =
    line.startsWith('running nbdkit:') || line.startsWith('running nbdkit ');
  const isNbdkitLine = /^nbdkit(\[[^\]]+\])?:/.test(line);
  if (isNbdkitStart) {
    ctx.currentNbdkit = { startLine: globalLine, logLines: [], filters: [] };
  }

  if (isNbdkitStart || isNbdkitLine || (ctx.currentNbdkit && line.startsWith(' '))) {
    if (ctx.currentNbdkit) {
      ctx.currentNbdkit.logLines = ctx.currentNbdkit.logLines || [];
      ctx.currentNbdkit.logLines.push(line);
      ctx.currentNbdkit.endLine = globalLine;
    }

    const socketMatch = line.match(NBDKIT_SOCKET_RE);
    if (socketMatch && ctx.currentNbdkit) ctx.currentNbdkit.socketPath = socketMatch[1];

    const uriMatch = line.match(NBDKIT_URI_RE);
    if (uriMatch && ctx.currentNbdkit) {
      ctx.currentNbdkit.uri = uriMatch[1];
      const id = ctx.currentNbdkit.socketPath || `nbdkit-${ctx.nbdkitMap.size}`;
      if (!ctx.nbdkitMap.has(id)) {
        ctx.nbdkitMap.set(id, {
          id,
          socketPath: ctx.currentNbdkit.socketPath || '',
          uri: ctx.currentNbdkit.uri || '',
          plugin: ctx.currentNbdkit.plugin || '',
          filters: ctx.currentNbdkit.filters || [],
          diskFile: ctx.currentNbdkit.diskFile || '',
          startLine: ctx.currentNbdkit.startLine || globalLine,
          endLine: globalLine,
          logLines: ctx.currentNbdkit.logLines || [],
          server: ctx.currentNbdkit.server,
          vmMoref: ctx.currentNbdkit.vmMoref,
          transportMode: ctx.currentNbdkit.transportMode,
          backingSize: ctx.currentNbdkit.backingSize,
        });
      }
    }

    const pluginMatch = line.match(NBDKIT_PLUGIN_RE);
    if (pluginMatch && ctx.currentNbdkit) ctx.currentNbdkit.plugin = pluginMatch[1];

    const filterMatch = line.match(NBDKIT_FILTER_RE);
    if (filterMatch && ctx.currentNbdkit) {
      ctx.currentNbdkit.filters = ctx.currentNbdkit.filters || [];
      if (!ctx.currentNbdkit.filters.includes(filterMatch[1])) {
        ctx.currentNbdkit.filters.push(filterMatch[1]);
      }
    }

    const fileMatch = line.match(NBDKIT_FILE_RE);
    if (fileMatch && ctx.currentNbdkit) ctx.currentNbdkit.diskFile = fileMatch[1];

    const serverMatch = line.match(NBDKIT_SERVER_RE);
    if (serverMatch && ctx.currentNbdkit) ctx.currentNbdkit.server = serverMatch[1];

    const vmMatch = line.match(NBDKIT_VM_RE);
    if (vmMatch && ctx.currentNbdkit) ctx.currentNbdkit.vmMoref = vmMatch[1];

    const transportMatch = line.match(NBDKIT_TRANSPORT_RE);
    if (transportMatch && ctx.currentNbdkit) ctx.currentNbdkit.transportMode = transportMatch[1];

    const cowMatch = line.match(COW_FILE_SIZE_RE);
    if (cowMatch && ctx.currentNbdkit) ctx.currentNbdkit.backingSize = parseInt(cowMatch[1], 10);
  } else if (ctx.currentNbdkit && !isNbdkitLine) {
    finalizeNbdkit(ctx.currentNbdkit, ctx.nbdkitMap, globalLine);
    ctx.currentNbdkit = null;
  }

  // Standalone nbdkit log lines
  if (isNbdkitLine && !ctx.currentNbdkit) {
    const lastConn = [...ctx.nbdkitMap.values()].pop();
    if (lastConn) {
      lastConn.logLines.push(line);
      lastConn.endLine = globalLine;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: libguestfs trace & config (including hivex, API calls)
// ────────────────────────────────────────────────────────────────────────────

export function handleLibguestfsTrace(ctx: ParseContext, line: string, globalLine: number): void {
  if (!line.startsWith('libguestfs:')) return;

  const backendMatch = line.match(LIBGUESTFS_BACKEND_RE);
  if (backendMatch) {
    ctx.lgBackend = backendMatch[1];
    ctx.lgLaunchLines.push(line);
  }

  const idMatch = line.match(LIBGUESTFS_ID_RE);
  if (idMatch) ctx.lgIdentifier = idMatch[1];

  if (line.includes('libguestfs: launch:')) ctx.lgLaunchLines.push(line);

  const traceMatch = line.match(LIBGUESTFS_TRACE_RE);
  if (traceMatch) {
    const traceHandle = traceMatch[1];
    const apiName = traceMatch[2];
    const apiArgs = traceMatch[3];

    const memMatch = apiArgs.match(LIBGUESTFS_MEMSIZE_RE);
    if (memMatch) ctx.lgMemsize = parseInt(memMatch[1], 10);

    const smpMatch = apiArgs.match(LIBGUESTFS_SMP_RE);
    if (smpMatch) ctx.lgSmp = parseInt(smpMatch[1], 10);

    const driveMatch = line.match(LIBGUESTFS_DRIVE_RE);
    if (driveMatch) {
      ctx.lgDrives.push({
        path: driveMatch[1],
        format: driveMatch[2],
        protocol: driveMatch[3],
        server: driveMatch[4],
      });
    }

    // Installed apps
    if (apiName === 'inspect_list_applications2' && apiArgs.startsWith('=')) {
      parseInstalledApps(apiArgs, ctx.installedApps);
    }

    // Hivex session tracking
    handleHivexTrace(ctx, apiName, apiArgs, globalLine);

    // Flat API call list for LibguestfsInfo panel
    if (!apiName.endsWith('=') && apiName !== '=') {
      ctx.lgApiCalls.push({ name: apiName, args: apiArgs, result: '', lineNumber: globalLine });
    } else if (apiName === '=' || apiArgs.startsWith('=')) {
      const lastCall = ctx.lgApiCalls[ctx.lgApiCalls.length - 1];
      if (lastCall) {
        lastCall.result = apiArgs.replace(/^=\s*/, '').trim() || apiName;
      }
    }

    // Hierarchical API call tracking
    const isResult = apiName === '=' || apiArgs.startsWith('=');
    if (!isResult && !apiName.endsWith('=')) {
      const apiCall: V2VApiCall = {
        name: apiName,
        args: apiArgs,
        result: '',
        handle: traceHandle,
        guestCommands: [],
        lineNumber: globalLine,
      };
      const queueKey = `${traceHandle}:${apiName}`;
      const queue = ctx.openApiCalls.get(queueKey) || [];
      queue.push(apiCall);
      ctx.openApiCalls.set(queueKey, queue);
    } else {
      let resultName = '';
      let resultValue = '';
      if (apiName === '=') {
        const lastLgCall = ctx.lgApiCalls[ctx.lgApiCalls.length - 1];
        if (lastLgCall) resultName = lastLgCall.name;
        resultValue = apiArgs.replace(/^=?\s*/, '').trim();
      } else if (apiArgs.startsWith('=')) {
        resultName = apiName.replace(/=$/, '');
        resultValue = apiArgs.replace(/^=\s*/, '').trim();
      }

      if (resultName) {
        const resultKey = `${traceHandle}:${resultName}`;
        const queue = ctx.openApiCalls.get(resultKey);
        if (queue && queue.length > 0) {
          const apiCall = queue.shift()!;
          apiCall.result = resultValue;
          ctx.completedApiCalls.push(apiCall);
          if (queue.length === 0) ctx.openApiCalls.delete(resultKey);
        }
      }
    }
  }

  // libguestfs command: run: (multi-line host command)
  const cmdMatch = line.match(LIBGUESTFS_CMD_RE);
  if (cmdMatch) {
    const cmdText = cmdMatch[1].trim();
    if (cmdText && !cmdText.startsWith('\\')) {
      if (ctx.pendingLibguestfsCmd.length > 0) {
        ctx.hostCommands.push(buildHostCommand(ctx.pendingLibguestfsCmd, ctx.pendingLibguestfsCmdLine));
      }
      ctx.pendingLibguestfsCmd = [cmdText];
      ctx.pendingLibguestfsCmdLine = globalLine;
    } else if (cmdText.startsWith('\\')) {
      ctx.pendingLibguestfsCmd.push(cmdText.slice(1).trim());
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: hivex trace lines (called from handleLibguestfsTrace)
// ────────────────────────────────────────────────────────────────────────────

function handleHivexTrace(ctx: ParseContext, apiName: string, apiArgs: string, globalLine: number): void {
  if (apiName === 'hivex_open' && !apiArgs.startsWith('=')) {
    flushHivexSession(ctx.currentHivexSession, ctx.registryHiveAccesses);
    const hiveMatch = apiArgs.match(/^"([^"]+)"/);
    if (hiveMatch) {
      const openMode = apiArgs.includes('write:true') ? 'write' as const : 'read' as const;
      ctx.currentHivexSession = {
        hivePath: hiveMatch[1],
        mode: openMode,
        openMode,
        keySegments: [],
        values: [],
        pendingGetValueName: null,
        pendingChildName: null,
        pendingChildParent: null,
        failedChild: null,
        lineNumber: globalLine,
        rootHandle: '',
        hasWriteOp: false,
        firstWriteLine: 0,
      };
    }
  }

  if (apiName === 'hivex_root' && ctx.currentHivexSession) {
    if (apiArgs.startsWith('= ')) {
      ctx.currentHivexSession.rootHandle = apiArgs.slice(2).trim();
    } else {
      if (ctx.currentHivexSession.keySegments.length > 0 || ctx.currentHivexSession.values.length > 0) {
        resetHivexTraversal(ctx, ctx.currentHivexSession);
      }
    }
  }

  if (apiName === 'hivex_node_get_child' && ctx.currentHivexSession) {
    if (apiArgs.startsWith('= ')) {
      const resultVal = apiArgs.slice(2).trim();
      if (resultVal !== '0' && ctx.currentHivexSession.pendingChildName) {
        ctx.currentHivexSession.keySegments.push(ctx.currentHivexSession.pendingChildName);
      } else if (resultVal === '0' && ctx.currentHivexSession.pendingChildName) {
        ctx.currentHivexSession.failedChild = ctx.currentHivexSession.pendingChildName;
      }
      ctx.currentHivexSession.pendingChildName = null;
      ctx.currentHivexSession.pendingChildParent = null;
    } else {
      const childMatch = apiArgs.match(HIVEX_HANDLE_NAME_RE);
      if (childMatch) {
        const parentHandle = childMatch[1];
        const childName = childMatch[2];
        if (ctx.currentHivexSession.rootHandle && parentHandle === ctx.currentHivexSession.rootHandle && ctx.currentHivexSession.keySegments.length > 0) {
          resetHivexTraversal(ctx, ctx.currentHivexSession, { lineNumber: globalLine });
        }
        ctx.currentHivexSession.pendingChildName = childName;
        ctx.currentHivexSession.pendingChildParent = parentHandle;
      }
    }
  }

  if (apiName === 'hivex_node_add_child' && !apiArgs.startsWith('=') && ctx.currentHivexSession) {
    ctx.currentHivexSession.hasWriteOp = true;
    if (!ctx.currentHivexSession.firstWriteLine) ctx.currentHivexSession.firstWriteLine = globalLine;
    const addMatch = apiArgs.match(HIVEX_HANDLE_NAME_RE);
    if (addMatch) {
      const parentHandle = addMatch[1];
      const childName = addMatch[2];
      if (ctx.currentHivexSession.rootHandle && parentHandle === ctx.currentHivexSession.rootHandle && ctx.currentHivexSession.keySegments.length > 0) {
        resetHivexTraversal(ctx, ctx.currentHivexSession, {
          hasWriteOp: true,
          firstWriteLine: globalLine,
          lineNumber: globalLine,
        });
      }
      if (ctx.currentHivexSession.failedChild === childName) {
        ctx.currentHivexSession.failedChild = null;
      }
      ctx.currentHivexSession.keySegments.push(childName);
    }
  }

  if (apiName === 'hivex_node_get_value' && ctx.currentHivexSession) {
    if (apiArgs.startsWith('= ')) {
      const resultVal = apiArgs.slice(2).trim();
      if (resultVal === '0') {
        ctx.currentHivexSession.pendingGetValueName = null;
      }
    } else {
      const valNameMatch = apiArgs.match(HIVEX_HANDLE_NAME_RE);
      if (valNameMatch) {
        ctx.currentHivexSession.pendingGetValueName = valNameMatch[2];
      }
    }
  }

  if (apiName === 'hivex_value_string' && ctx.currentHivexSession) {
    if (apiArgs.startsWith('= ')) {
      const valStr = apiArgs.slice(2).trim();
      const strMatch = valStr.match(HIVEX_QUOTED_STRING_RE);
      if (strMatch && ctx.currentHivexSession.pendingGetValueName) {
        ctx.currentHivexSession.values.push({
          name: ctx.currentHivexSession.pendingGetValueName,
          value: strMatch[1],
          lineNumber: globalLine,
        });
        ctx.currentHivexSession.pendingGetValueName = null;
      }
    }
  }

  if (apiName === 'hivex_value_value' && ctx.currentHivexSession) {
    if (apiArgs.startsWith('= ')) {
      const valStr = apiArgs.slice(2).trim();
      const strMatch = valStr.match(HIVEX_QUOTED_STRING_RE);
      if (strMatch && ctx.currentHivexSession.pendingGetValueName) {
        ctx.currentHivexSession.values.push({
          name: ctx.currentHivexSession.pendingGetValueName,
          value: decodeHivexData(strMatch[1], 1),
          lineNumber: globalLine,
        });
        ctx.currentHivexSession.pendingGetValueName = null;
      }
    }
  }

  if (apiName === 'hivex_value_key' && ctx.currentHivexSession) {
    if (apiArgs.startsWith('= ')) {
      const valStr = apiArgs.slice(2).trim();
      const strMatch = valStr.match(HIVEX_QUOTED_STRING_RE);
      if (strMatch) {
        ctx.currentHivexSession.pendingGetValueName = strMatch[1];
      }
    }
  }

  if (apiName === 'hivex_commit' && !apiArgs.startsWith('=') && ctx.currentHivexSession) {
    ctx.currentHivexSession.hasWriteOp = true;
    if (!ctx.currentHivexSession.firstWriteLine) ctx.currentHivexSession.firstWriteLine = globalLine;
    if (ctx.currentHivexSession.values.length > 0 || ctx.currentHivexSession.keySegments.length > 0) {
      resetHivexTraversal(ctx, ctx.currentHivexSession);
    }
  }

  if (apiName === 'hivex_node_set_value' && !apiArgs.startsWith('=') && ctx.currentHivexSession) {
    ctx.currentHivexSession.hasWriteOp = true;
    if (!ctx.currentHivexSession.firstWriteLine) ctx.currentHivexSession.firstWriteLine = globalLine;
    const setMatch = apiArgs.match(/^\d+\s+"([^"]+)"\s+(\d+)\s+"(.+)"$/);
    if (setMatch) {
      const valName = setMatch[1];
      const regType = parseInt(setMatch[2], 10);
      const rawData = setMatch[3];
      ctx.currentHivexSession.values.push({
        name: valName,
        value: decodeHivexData(rawData, regType),
        lineNumber: globalLine,
      });
    }
  }

  if (apiName === 'hivex_close' && !apiArgs.startsWith('=') && ctx.currentHivexSession) {
    flushHivexSession(ctx.currentHivexSession, ctx.registryHiveAccesses);
    ctx.currentHivexSession = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: libguestfs command flush
// ────────────────────────────────────────────────────────────────────────────

export function handleLibguestfsCmdFlush(ctx: ParseContext, line: string): void {
  if (
    ctx.pendingLibguestfsCmd.length > 0 &&
    !line.startsWith('libguestfs:') &&
    !line.trim().startsWith('\\')
  ) {
    ctx.hostCommands.push(buildHostCommand(ctx.pendingLibguestfsCmd, ctx.pendingLibguestfsCmdLine));
    ctx.pendingLibguestfsCmd = [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: guestfsd scope boundaries
// ────────────────────────────────────────────────────────────────────────────

export function handleGuestfsdScope(ctx: ParseContext, line: string): void {
  if (!line.startsWith('guestfsd:')) return;

  const startMatch = line.match(GUESTFSD_START_RE);
  if (startMatch) {
    if (ctx.activeGuestfsd) {
      attachGuestfsdToApiCall(ctx.activeGuestfsd, ctx.openApiCalls, ctx.completedApiCalls);
    }
    ctx.activeGuestfsd = { name: startMatch[1], commands: [] };
  }

  const endMatch = line.match(GUESTFSD_END_RE);
  if (endMatch) {
    const durationSecs = parseFloat(endMatch[2]);
    if (ctx.activeGuestfsd) {
      const guestfsdApiName = endMatch[1];
      const durationQueue = findQueueByApiName(ctx.openApiCalls, guestfsdApiName)
        || findQueueByApiName(ctx.openApiCalls, ctx.activeGuestfsd.name);
      if (durationQueue && durationQueue.length > 0) {
        durationQueue[0].durationSecs = durationSecs;
      }
      attachGuestfsdToApiCall(ctx.activeGuestfsd, ctx.openApiCalls, ctx.completedApiCalls);
      ctx.activeGuestfsd = null;
    } else {
      const durationQueue = findQueueByApiName(ctx.openApiCalls, endMatch[1]);
      if (durationQueue && durationQueue.length > 0) {
        durationQueue[0].durationSecs = durationSecs;
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: guest commands (command:, commandrvf:, chroot:)
// ────────────────────────────────────────────────────────────────────────────

export function handleGuestCommands(ctx: ParseContext, line: string, globalLine: number): boolean {
  if (line.startsWith('libguestfs:') || line.startsWith('guestfsd:')) return false;

  const stdoutHeaderMatch = line.match(CMD_STDOUT_RE);
  if (stdoutHeaderMatch) {
    ctx.stdoutCapture = { cmdName: stdoutHeaderMatch[1] };
    return true;
  }

  const retMatch = line.match(CMD_RETURN_RE);
  if (retMatch) {
    const retCode = parseInt(retMatch[2], 10);
    const cmd = findLastGuestCommand(ctx, retMatch[1]);
    if (cmd && cmd.returnCode === undefined) cmd.returnCode = retCode;
    return true;
  }

  if (line.startsWith('command:')) {
    const cmdExecMatch = line.match(COMMAND_RE);
    if (cmdExecMatch) {
      const args = parseCommandArgs(cmdExecMatch[2]);
      addGuestCommand(ctx, {
        command: cmdExecMatch[1],
        args,
        source: 'command',
        stdoutLines: [],
        lineNumber: globalLine,
      });
    }
  }

  if (line.startsWith('commandrvf:')) {
    if (!COMMANDRVF_META_RE.test(line)) {
      const rvfMatch = line.match(COMMANDRVF_EXEC_RE);
      if (rvfMatch && !isNoisyCommand(rvfMatch[1])) {
        const args = parseCommandArgs(rvfMatch[2]);
        addGuestCommand(ctx, {
          command: rvfMatch[1],
          args,
          source: 'commandrvf',
          stdoutLines: [],
          lineNumber: globalLine,
        });
      }
    }
  }

  if (line.startsWith('chroot:')) {
    const chrootMatch = line.match(CHROOT_RE);
    if (chrootMatch) {
      addGuestCommand(ctx, {
        command: chrootMatch[2],
        args: [],
        source: 'chroot',
        stdoutLines: [],
        lineNumber: globalLine,
      });
    }
  }

  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: guest info (i_ lines, inspect blocks)
// ────────────────────────────────────────────────────────────────────────────

export function handleGuestInfo(ctx: ParseContext, line: string): void {
  const iMatch = line.match(/^i_(\w+)\s*=\s*(.+)$/);
  if (iMatch) {
    ctx.guestInfoRaw.set(iMatch[1], iMatch[2].trim());
  }

  const rootHeaderMatch = line.match(/^(\/dev\/\S+)\s+\(\w+\):\s*$/);
  if (rootHeaderMatch && !ctx.guestInfoRaw.has('root')) {
    ctx.guestInfoRaw.set('root', rootHeaderMatch[1]);
  }

  const fsHeaderMatch = line.match(/^fs:\s+(\/dev\/\S+)\s+\(\w+\)\s+role:\s+(\w+)/);
  if (fsHeaderMatch) {
    if (fsHeaderMatch[2] === 'root' && !ctx.guestInfoRaw.has('root')) {
      ctx.guestInfoRaw.set('root', fsHeaderMatch[1]);
    }
  }

  const indentedMatch = line.match(/^\s{4}(\w[\w\s]*\w)\s*:\s*(.+)$/);
  if (indentedMatch) {
    const key = indentedMatch[1].trim();
    const val = indentedMatch[2].trim();
    const keyMap: Record<string, string> = {
      'type': 'type',
      'distro': 'distro',
      'arch': 'arch',
      'hostname': 'hostname',
      'version': 'version',
      'product_name': 'product_name',
      'product_variant': 'product_variant',
      'package_format': 'package_format',
      'package_management': 'package_management',
      'build ID': 'build_id',
      'fstab': 'fstab',
      'drive_mappings': 'drive_mappings',
      'windows_systemroot': 'windows_systemroot',
      'windows_software_hive': 'windows_software_hive',
      'windows_system_hive': 'windows_system_hive',
      'windows_current_control_set': 'windows_current_control_set',
    };
    const mappedKey = keyMap[key];
    if (mappedKey && !ctx.guestInfoRaw.has(mappedKey)) {
      ctx.guestInfoRaw.set(mappedKey, val);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: blkid
// ────────────────────────────────────────────────────────────────────────────

export function handleBlkid(ctx: ParseContext, line: string): void {
  const blkidEntry = parseBlkidLine(line);
  if (blkidEntry && !ctx.blkidEntries.some((e) => e.device === blkidEntry.device)) {
    ctx.blkidEntries.push(blkidEntry);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: VirtIO Win / file copy tracking
// ────────────────────────────────────────────────────────────────────────────

export function handleFileCopies(ctx: ParseContext, line: string, globalLine: number): void {
  const isoMatch = line.match(/copy_from_virtio_win:\s+guest tools source ISO\s+(\S+)/);
  if (isoMatch) {
    ctx.virtioWinIsoPath = isoMatch[1];
  }

  const readFileMatch = line.match(/libguestfs: trace: virtio_win: read_file "(\/\/\/[^"]+)"/);
  if (readFileMatch) {
    ctx.pendingVirtioWinRead = { source: readFileMatch[1], sizeBytes: null, lineNumber: globalLine };
  }

  if (ctx.pendingVirtioWinRead) {
    const readSize = extractOriginalSize(line);
    if (readSize !== null) {
      ctx.pendingVirtioWinRead.sizeBytes = readSize;
    }
  }

  const v2vReadFileMatch = line.match(/libguestfs: trace: v2v: read_file "([^"]+)"/);
  if (v2vReadFileMatch && !line.includes('read_file =')) {
    const readPath = v2vReadFileMatch[1];
    ctx.lastV2VReadFilePath = readPath;
    ctx.pendingV2VReads.set(readPath, { content: null, sizeBytes: null, lineNumber: globalLine });
  }

  if (ctx.lastV2VReadFilePath) {
    const v2vReadResultMatch = line.match(/libguestfs: trace: v2v: read_file = /);
    if (v2vReadResultMatch) {
      const pending = ctx.pendingV2VReads.get(ctx.lastV2VReadFilePath);
      if (pending) {
        const pendingSize = extractOriginalSize(line);
        if (pendingSize !== null) {
          pending.sizeBytes = pendingSize;
        }
        const contentResult = extractReadFileContent(line);
        if (contentResult !== null) {
          pending.content = contentResult;
        }
      }
      ctx.lastV2VReadFilePath = null;
    }
  }

  const writeMatch = line.match(/libguestfs: trace: v2v: write "([^"]+)"/);
  if (writeMatch) {
    const dest = writeMatch[1];
    const writeSize = extractOriginalSize(line);
    const contentTruncated = line.includes('<truncated,');
    const contentResult = extractWriteContent(line, dest);

    if (ctx.pendingVirtioWinRead) {
      ctx.fileCopies.push({
        source: ctx.pendingVirtioWinRead.source,
        destination: dest,
        sizeBytes: ctx.pendingVirtioWinRead.sizeBytes ?? writeSize,
        origin: 'virtio_win',
        content: null,
        contentTruncated: false,
        lineNumber: ctx.pendingVirtioWinRead.lineNumber,
      });
      ctx.pendingVirtioWinRead = null;
    } else if (ctx.pendingV2VReads.has(dest)) {
      const readInfo = ctx.pendingV2VReads.get(dest)!;
      ctx.fileCopies.push({
        source: dest,
        destination: dest,
        sizeBytes: readInfo.sizeBytes ?? writeSize,
        origin: 'guest',
        content: contentResult ?? readInfo.content,
        contentTruncated,
        lineNumber: readInfo.lineNumber,
      });
      ctx.pendingV2VReads.delete(dest);
    } else {
      ctx.fileCopies.push({
        source: '(generated)',
        destination: dest,
        sizeBytes: writeSize,
        origin: 'script',
        content: contentResult,
        contentTruncated,
        lineNumber: globalLine,
      });
    }
  }

  const uploadMatch = line.match(/libguestfs: trace: v2v: upload "([^"]+)" "([^"]+)"/);
  if (uploadMatch) {
    const src = uploadMatch[1];
    const dest = uploadMatch[2];
    if (!src.startsWith('/tmp/')) {
      ctx.fileCopies.push({
        source: src,
        destination: dest,
        sizeBytes: null,
        origin: 'virt-tools',
        content: null,
        contentTruncated: false,
        lineNumber: globalLine,
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Handler: errors & warnings
// ────────────────────────────────────────────────────────────────────────────

export function handleErrors(ctx: ParseContext, line: string, globalLine: number): void {
  if (ERROR_RE.test(line) && !isErrorFalsePositive(line)) {
    const source = extractSource(line);
    ctx.errors.push({
      level: 'error',
      source,
      message: line,
      lineNumber: globalLine,
      rawLine: line,
    });
  } else if (WARNING_RE.test(line)) {
    const source = extractSource(line);
    ctx.errors.push({
      level: 'warning',
      source,
      message: line,
      lineNumber: globalLine,
      rawLine: line,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Flush pending state after the loop
// ────────────────────────────────────────────────────────────────────────────

export function flushPendingState(ctx: ParseContext): void {
  if (ctx.pendingLibguestfsCmd.length > 0) {
    ctx.hostCommands.push(buildHostCommand(ctx.pendingLibguestfsCmd, ctx.pendingLibguestfsCmdLine));
  }
  if (ctx.activeGuestfsd) {
    attachGuestfsdToApiCall(ctx.activeGuestfsd, ctx.openApiCalls, ctx.completedApiCalls);
  }
  if (ctx.currentNbdkit) {
    finalizeNbdkit(ctx.currentNbdkit, ctx.nbdkitMap, ctx.globalLineOffset + ctx.sectionLines.length - 1);
  }

  // Move remaining open API calls to completed
  for (const queue of ctx.openApiCalls.values()) {
    ctx.completedApiCalls.push(...queue);
  }

  // Sort by line number
  ctx.completedApiCalls.sort((a, b) => a.lineNumber - b.lineNumber);

  // Build guest info
  if (ctx.guestInfoRaw.size > 0 && (ctx.guestInfoRaw.has('root') || ctx.guestInfoRaw.has('type') || ctx.guestInfoRaw.has('distro'))) {
    ctx.guestInfo = buildGuestInfo(ctx.guestInfoRaw);
    ctx.guestInfo.blkid = ctx.blkidEntries;
  }

  // Flush unclosed hivex session
  flushHivexSession(ctx.currentHivexSession, ctx.registryHiveAccesses);
  ctx.currentHivexSession = null;

  // Collect nbdkit connections
  ctx.nbdkitConnections.push(...ctx.nbdkitMap.values());

  // Build disk summary from nbdkit connections
  ctx.nbdkitConnections.forEach((conn, idx) => {
    ctx.diskSummary.disks.push({
      index: idx + 1,
      sizeBytes: conn.backingSize,
      sourceFile: conn.diskFile || undefined,
      transportMode: conn.transportMode,
      server: conn.server,
      vmMoref: conn.vmMoref,
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Re-export categorizeLine for the main parser
// ────────────────────────────────────────────────────────────────────────────

export { categorizeLine };
