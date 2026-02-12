/**
 * Structured visualization for the "Opening the source" pipeline stage.
 *
 * Parses raw inter-stage log lines to extract:
 *  1. Appliance VM config (memory, vCPUs, drives, backend)
 *  2. Boot timeline (supermin, QEMU launch, kernel, guestfsd ready)
 *  3. NBDKIT/VDDK connections (VMDKs, transport modes, sizes, errors)
 */
import { useMemo, useState } from 'react';
import { formatBytes } from '../../utils/format';
import { SectionHeader } from './shared';

// ── Types ───────────────────────────────────────────────────────────────────

interface ApplianceConfig {
  memsize: number;
  smp: number;
  backend: string;
  identifier: string;
  drives: { protocol: string; server: string }[];
  qemuCmdLine: string[];
}

interface BootEvent {
  timestamp: string; // kernel timestamp like "1.23" or label
  label: string;
  detail?: string;
}

interface NbdkitConn {
  vmdk: string;
  transportMode: string;
  fileSize: number | null;
  errors: string[];
}

interface ParsedOpenSource {
  appliance: ApplianceConfig;
  bootTimeline: BootEvent[];
  nbdkitConns: NbdkitConn[];
}

// ── Parser ──────────────────────────────────────────────────────────────────

function parseOpenSourceContent(lines: string[]): ParsedOpenSource {
  const appliance: ApplianceConfig = {
    memsize: 0,
    smp: 0,
    backend: '',
    identifier: '',
    drives: [],
    qemuCmdLine: [],
  };
  const bootTimeline: BootEvent[] = [];
  const nbdkitConns: NbdkitConn[] = [];
  const seenBootEvents = new Set<string>();

  // Track QEMU command block
  let inQemuBlock = false;
  const qemuLines: string[] = [];

  // Track current NBDKIT connection being built
  let currentNbdkit: Partial<NbdkitConn> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ── Appliance config from libguestfs trace calls ─────────────────
    const memMatch = line.match(/set_memsize\s+=?\s*(\d+)/);
    if (memMatch && parseInt(memMatch[1], 10) > 0) {
      appliance.memsize = parseInt(memMatch[1], 10);
    }

    const smpMatch = line.match(/set_smp\s+=?\s*(\d+)/);
    if (smpMatch && parseInt(smpMatch[1], 10) > 0) {
      appliance.smp = parseInt(smpMatch[1], 10);
    }

    const backendMatch = line.match(/get_backend\s+=\s+"([^"]+)"/);
    if (backendMatch) appliance.backend = backendMatch[1];

    const idMatch = line.match(/set_identifier\s+"([^"]+)"/);
    if (idMatch) appliance.identifier = idMatch[1];

    // add_drive "" "format:raw" "protocol:nbd" "server:unix:/tmp/..."
    const driveMatch = line.match(/add_drive\s+"[^"]*"\s+"format:\w+"\s+"protocol:(\w+)"\s+"server:([^"]+)"/);
    if (driveMatch) {
      appliance.drives.push({ protocol: driveMatch[1], server: driveMatch[2] });
    }

    // ── QEMU command line block ──────────────────────────────────────
    if (line.includes('/usr/libexec/qemu-kvm') && !line.startsWith('libguestfs:')) {
      inQemuBlock = true;
      qemuLines.push(line.replace(/\s*\\$/, '').trim());
      continue;
    }
    if (inQemuBlock) {
      const trimmed = line.replace(/\s*\\$/, '').trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('"')) {
        qemuLines.push(trimmed);
        continue;
      } else {
        inQemuBlock = false;
        appliance.qemuCmdLine = qemuLines;
      }
    }

    // ── Boot timeline events ─────────────────────────────────────────
    if (line.includes('begin building supermin appliance') && !seenBootEvents.has('supermin-start')) {
      seenBootEvents.add('supermin-start');
      bootTimeline.push({ timestamp: '', label: 'Building supermin appliance' });
    }
    if (line.includes('finished building supermin appliance') && !seenBootEvents.has('supermin-done')) {
      seenBootEvents.add('supermin-done');
      bootTimeline.push({ timestamp: '', label: 'Supermin appliance built' });
    }

    const superminKernelMatch = line.match(/supermin: kernel: picked vmlinuz\s+(.+)/);
    if (superminKernelMatch && !seenBootEvents.has('kernel-pick')) {
      seenBootEvents.add('kernel-pick');
      bootTimeline.push({ timestamp: '', label: 'Kernel selected', detail: superminKernelMatch[1].trim() });
    }

    if (line.includes('begin testing qemu features') && !seenBootEvents.has('qemu-test')) {
      seenBootEvents.add('qemu-test');
      bootTimeline.push({ timestamp: '', label: 'Testing QEMU features' });
    }

    const qemuVerMatch = line.match(/qemu version:\s+(.+)/);
    if (qemuVerMatch && !seenBootEvents.has('qemu-ver')) {
      seenBootEvents.add('qemu-ver');
      bootTimeline.push({ timestamp: '', label: 'QEMU version', detail: qemuVerMatch[1].trim() });
    }

    const kvmMatch = line.match(/qemu KVM:\s+(.+)/);
    if (kvmMatch && !seenBootEvents.has('kvm')) {
      seenBootEvents.add('kvm');
      bootTimeline.push({ timestamp: '', label: 'KVM', detail: kvmMatch[1].trim() });
    }

    // Kernel boot line with timestamp
    const kernelBootMatch = line.match(/\[\s*([\d.]+)\]\s+Linux version\s+(\S+)/);
    if (kernelBootMatch && !seenBootEvents.has('kernel-boot')) {
      seenBootEvents.add('kernel-boot');
      bootTimeline.push({ timestamp: kernelBootMatch[1], label: 'Kernel boot', detail: kernelBootMatch[2] });
    }

    // SCSI disk detection
    const scsiMatch = line.match(/\[\s*([\d.]+)\]\s+scsi\s+\d+:\d+:\d+:\d+:\s+Direct-Access\s+(.+)/);
    if (scsiMatch && !seenBootEvents.has(`scsi-${scsiMatch[2]}`)) {
      seenBootEvents.add(`scsi-${scsiMatch[2]}`);
      bootTimeline.push({ timestamp: scsiMatch[1], label: 'Disk detected', detail: scsiMatch[2].trim() });
    }

    // Appliance ready
    if (line.includes('appliance is up') && !seenBootEvents.has('appliance-up')) {
      seenBootEvents.add('appliance-up');
      bootTimeline.push({ timestamp: '', label: 'Appliance is up (guestfsd ready)' });
    }

    // ── NBDKIT / VDDK connections ────────────────────────────────────
    // VixDiskLib_Open -> new connection
    const vddkOpenMatch = line.match(/VixDiskLib_Open\s+\(connection,\s+(.+?),\s+\d+,/);
    if (vddkOpenMatch) {
      // Finalize previous
      if (currentNbdkit) {
        nbdkitConns.push({
          vmdk: currentNbdkit.vmdk || '',
          transportMode: currentNbdkit.transportMode || 'unknown',
          fileSize: currentNbdkit.fileSize ?? null,
          errors: currentNbdkit.errors || [],
        });
      }
      currentNbdkit = { vmdk: vddkOpenMatch[1].trim(), errors: [] };
    }

    // Transport mode
    const transportMatch = line.match(/transport mode:\s+(\w+)/);
    if (transportMatch && currentNbdkit) {
      currentNbdkit.transportMode = transportMatch[1];
    }

    // COW underlying file size
    const sizeMatch = line.match(/cow: underlying file size:\s+(\d+)/);
    if (sizeMatch && currentNbdkit) {
      currentNbdkit.fileSize = parseInt(sizeMatch[1], 10);
    }

    // VDDK errors
    if (currentNbdkit && (line.includes('error -[') || line.includes('Cannot use advanced transport'))) {
      const errText = line.replace(/^.*?debug:\s*/, '').trim();
      if (errText && !currentNbdkit.errors?.includes(errText)) {
        currentNbdkit.errors!.push(errText);
      }
    }
  }

  // Finalize last NBDKIT connection
  if (currentNbdkit) {
    nbdkitConns.push({
      vmdk: currentNbdkit.vmdk || '',
      transportMode: currentNbdkit.transportMode || 'unknown',
      fileSize: currentNbdkit.fileSize ?? null,
      errors: currentNbdkit.errors || [],
    });
  }

  return { appliance, bootTimeline, nbdkitConns };
}

// ── Component ───────────────────────────────────────────────────────────────

interface OpenSourceViewProps {
  content: string[];
}

export function OpenSourceView({ content }: OpenSourceViewProps) {
  const parsed = useMemo(() => parseOpenSourceContent(content), [content]);

  const hasData =
    parsed.appliance.memsize > 0 ||
    parsed.bootTimeline.length > 0 ||
    parsed.nbdkitConns.length > 0;

  if (!hasData) return null;

  return (
    <div className="space-y-4">
      {/* Appliance Configuration */}
      {parsed.appliance.memsize > 0 && (
        <ApplianceSection config={parsed.appliance} />
      )}

      {/* NBDKIT / VDDK Connections */}
      {parsed.nbdkitConns.length > 0 && (
        <NbdkitSection conns={parsed.nbdkitConns} />
      )}

      {/* Boot Timeline */}
      {parsed.bootTimeline.length > 0 && (
        <BootTimelineSection events={parsed.bootTimeline} />
      )}
    </div>
  );
}

// ── Sub-sections ────────────────────────────────────────────────────────────

// ── Appliance Configuration ─────────────────────────────────────────────────

function ApplianceSection({ config }: { config: ApplianceConfig }) {
  return (
    <div>
      <SectionHeader title="Libguestfs Appliance VM" />
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50">
          {config.memsize > 0 && (
            <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-[10px] font-medium">
              Memory: {config.memsize} MB
            </span>
          )}
          {config.smp > 0 && (
            <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-[10px] font-medium">
              vCPUs: {config.smp}
            </span>
          )}
          {config.backend && (
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-300 text-[10px] font-mono">
              backend: {config.backend}
            </span>
          )}
          {config.identifier && (
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-gray-300 text-[10px] font-mono">
              id: {config.identifier}
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
            {config.drives.length} drive{config.drives.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Drives list */}
        {config.drives.length > 0 && (
          <div className="px-3 py-2 space-y-1 border-t border-slate-100 dark:border-slate-800">
            {config.drives.map((d, idx) => (
              <div key={idx} className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400 dark:text-gray-500 w-8">hd{idx}</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[10px] font-mono">
                  {d.protocol}
                </span>
                <span className="font-mono text-slate-600 dark:text-gray-300 truncate">
                  {d.server}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* QEMU command line (collapsible) */}
        {config.qemuCmdLine.length > 0 && (
          <QemuCmdSection cmdLines={config.qemuCmdLine} />
        )}
      </div>
    </div>
  );
}

function QemuCmdSection({ cmdLines }: { cmdLines: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-slate-100 dark:border-slate-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
      >
        <span>QEMU command ({cmdLines.length} args)</span>
        <span>{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[10px] font-mono text-slate-600 dark:text-gray-300 bg-slate-50 dark:bg-slate-900 overflow-x-auto max-h-[300px] overflow-y-auto leading-relaxed">
          {cmdLines.join(' \\\n    ')}
        </pre>
      )}
    </div>
  );
}

// ── NBDKIT / VDDK Connections ───────────────────────────────────────────────

function NbdkitSection({ conns }: { conns: NbdkitConn[] }) {
  return (
    <div>
      <SectionHeader title="VDDK Disk Connections" count={conns.length} />
      <div className="space-y-2">
        {conns.map((conn, idx) => (
          <div
            key={idx}
            className={`border rounded-lg overflow-hidden ${
              conn.errors.length > 0
                ? 'border-amber-200 dark:border-amber-800'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 flex-wrap">
              <span className="text-[10px] text-slate-400 dark:text-gray-500">#{idx + 1}</span>
              <span className="font-mono text-[11px] text-slate-700 dark:text-gray-200 truncate max-w-[400px]">
                {conn.vmdk}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                conn.transportMode === 'nbdssl'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
              }`}>
                {conn.transportMode}
              </span>
              {conn.fileSize != null && (
                <span className="text-[10px] text-slate-500 dark:text-gray-400">
                  {formatBytes(conn.fileSize)}
                </span>
              )}
            </div>
            {conn.errors.length > 0 && (
              <div className="px-3 py-1.5 border-t border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-900/10">
                {conn.errors.map((err, eidx) => (
                  <div key={eidx} className="text-[10px] text-amber-700 dark:text-amber-400 break-words">
                    {err}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Boot Timeline ───────────────────────────────────────────────────────────

function BootTimelineSection({ events }: { events: BootEvent[] }) {
  return (
    <div>
      <SectionHeader title="Boot Timeline" count={events.length} />
      <div className="space-y-1">
        {events.map((evt, idx) => (
          <div key={idx} className="flex items-start gap-2 text-[11px]">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center pt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 flex-shrink-0" />
              {idx < events.length - 1 && (
                <div className="w-px h-3 bg-blue-200 dark:bg-blue-800" />
              )}
            </div>

            {/* Text content — baseline-aligned */}
            <div className="flex items-baseline gap-2 min-w-0">
              {/* Timestamp */}
              {evt.timestamp && (
                <span className="text-[10px] font-mono text-slate-400 dark:text-gray-500 min-w-[45px] text-right flex-shrink-0">
                  [{evt.timestamp}s]
                </span>
              )}

              {/* Label */}
              <span className="font-medium text-slate-700 dark:text-gray-200">
                {evt.label}
              </span>

              {/* Detail */}
              {evt.detail && (
                <span className="text-slate-500 dark:text-gray-400 font-mono text-[10px] truncate max-w-[300px]">
                  {evt.detail}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
