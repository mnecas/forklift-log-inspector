import { describe, it, expect } from 'vitest';
import {
  categorizeLine,
  isKnownPrefix,
  isNoisyCommand,
  parseCommandArgs,
  isErrorFalsePositive,
  extractSource,
  inferExitStatus,
  buildHostCommand,
  parseVersionFields,
  ERROR_RE,
  WARNING_RE,
} from '../v2v/v2vHelpers';
import type { V2VPipelineStage, V2VError, V2VComponentVersions } from '../../types/v2v';

// ────────────────────────────────────────────────────────────────────────────
// categorizeLine
// ────────────────────────────────────────────────────────────────────────────

describe('categorizeLine', () => {
  it('categorizes kernel boot lines', () => {
    expect(categorizeLine('[    0.000000] Linux version 5.14...')).toBe('kernel');
  });

  it('categorizes pipeline stage lines', () => {
    expect(categorizeLine('[   0.0] Setting up the source')).toBe('stage');
    expect(categorizeLine('[ 100.0] Finishing off')).toBe('stage');
  });

  it('categorizes nbdkit lines', () => {
    expect(categorizeLine('nbdkit: vddk: debug: connecting')).toBe('nbdkit');
    expect(categorizeLine('running nbdkit --unix /tmp/sock vddk')).toBe('nbdkit');
    expect(categorizeLine('nbdkit[in]: debug: nbdkit 1.46.2')).toBe('nbdkit');
    expect(categorizeLine('nbdkit[out]: debug: registered plugin')).toBe('nbdkit');
    expect(categorizeLine('nbdkit[in0]: debug: TLS disabled')).toBe('nbdkit');
    expect(categorizeLine('nbdkit[in1]: debug: service mode')).toBe('nbdkit');
  });

  it('categorizes libguestfs lines', () => {
    expect(categorizeLine('libguestfs: trace: v2v: add_drive')).toBe('libguestfs');
  });

  it('categorizes guestfsd lines', () => {
    expect(categorizeLine('guestfsd: <= list_partitions (0x8)')).toBe('guestfsd');
  });

  it('categorizes command lines', () => {
    expect(categorizeLine('command: blkid -c /dev/null')).toBe('command');
    expect(categorizeLine('commandrvf: udevadm settle')).toBe('command');
    expect(categorizeLine("chroot: /: running 'blkid'")).toBe('command');
  });

  it('categorizes info lines', () => {
    expect(categorizeLine('info: virt-v2v: virt-v2v 2.7.1 (x86_64)')).toBe('info');
  });

  it('categorizes monitor lines', () => {
    expect(categorizeLine('virt-v2v monitoring: Progress update, completed 50 %')).toBe(
      'monitor',
    );
  });

  it('categorizes XML lines', () => {
    expect(categorizeLine('  <domain type="kvm">')).toBe('xml');
  });

  it('categorizes YAML lines', () => {
    expect(categorizeLine('apiVersion: v1')).toBe('yaml');
    expect(categorizeLine('kind: VirtualMachine')).toBe('yaml');
  });

  it('categorizes warning lines', () => {
    expect(categorizeLine('warning: disk is larger than expected')).toBe('warning');
    expect(categorizeLine('WARNING: something')).toBe('warning');
  });

  it('categorizes error lines (non-false-positive)', () => {
    expect(categorizeLine('error: failed to connect')).toBe('error');
    expect(categorizeLine('virt-v2v: error: disk not found')).toBe('error');
  });

  it('categorizes false-positive error as other (not error)', () => {
    expect(categorizeLine('get_backend_setting = NULL (error)')).not.toBe('error');
    expect(categorizeLine('usbserial: error in callback')).not.toBe('error');
    expect(categorizeLine('error: No error')).not.toBe('error');
  });

  it('categorizes unknown lines as other', () => {
    expect(categorizeLine('random log line')).toBe('other');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ERROR_RE / WARNING_RE (error/warning detection)
// ────────────────────────────────────────────────────────────────────────────

describe('ERROR_RE and WARNING_RE', () => {
  it('ERROR_RE matches error: and error ', () => {
    expect(ERROR_RE.test('error: failed')).toBe(true);
    expect(ERROR_RE.test('virt-v2v error something')).toBe(true);
  });

  it('WARNING_RE matches warning: and warning ', () => {
    expect(WARNING_RE.test('warning: disk size')).toBe(true);
    expect(WARNING_RE.test('WARNING something')).toBe(true);
  });

  it('ERROR_RE does not match "error" in middle of word', () => {
    expect(ERROR_RE.test('terrorist')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isKnownPrefix
// ────────────────────────────────────────────────────────────────────────────

describe('isKnownPrefix', () => {
  it('returns true for command:', () => {
    expect(isKnownPrefix('command: blkid')).toBe(true);
  });

  it('returns true for libguestfs:', () => {
    expect(isKnownPrefix('libguestfs: trace: v2v')).toBe(true);
  });

  it('returns true for pipeline stage', () => {
    expect(isKnownPrefix('[   0.0] Setting up')).toBe(true);
  });

  it('returns true for i_ inspection lines', () => {
    expect(isKnownPrefix('i_root = /dev/sda1')).toBe(true);
  });

  it('returns false for unknown prefix', () => {
    expect(isKnownPrefix('random output')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isNoisyCommand
// ────────────────────────────────────────────────────────────────────────────

describe('isNoisyCommand', () => {
  it('returns true for udevadm', () => {
    expect(isNoisyCommand('udevadm')).toBe(true);
  });

  it('returns false for other commands', () => {
    expect(isNoisyCommand('blkid')).toBe(false);
    expect(isNoisyCommand('ls')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseCommandArgs
// ────────────────────────────────────────────────────────────────────────────

describe('parseCommandArgs', () => {
  it('splits unquoted args', () => {
    expect(parseCommandArgs('-c /dev/null')).toEqual(['-c', '/dev/null']);
  });

  it('respects single-quoted strings', () => {
    expect(parseCommandArgs("'-c' '/dev/null'")).toEqual(['-c', '/dev/null']);
  });

  it('respects double-quoted strings', () => {
    expect(parseCommandArgs('"-c" "/dev/null"')).toEqual(['-c', '/dev/null']);
  });

  it('handles mixed quoted and unquoted', () => {
    expect(parseCommandArgs("blkid '-c' /dev/null")).toEqual([
      'blkid',
      '-c',
      '/dev/null',
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCommandArgs('')).toEqual([]);
  });

  it('handles quoted string with spaces', () => {
    expect(parseCommandArgs("'path with spaces'")).toEqual(['path with spaces']);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// isErrorFalsePositive
// ────────────────────────────────────────────────────────────────────────────

describe('isErrorFalsePositive', () => {
  it('returns true for get_backend_setting = NULL (error)', () => {
    expect(isErrorFalsePositive('get_backend_setting = NULL (error)')).toBe(true);
  });

  it('returns true for usbserial error', () => {
    expect(isErrorFalsePositive('usbserial: error in callback')).toBe(true);
  });

  it('returns true for error: No error', () => {
    expect(isErrorFalsePositive('error: No error')).toBe(true);
  });

  it('returns true for nbdkit debug lines', () => {
    expect(isErrorFalsePositive('nbdkit: vddk: debug: error in timestamp')).toBe(
      true,
    );
    expect(isErrorFalsePositive('nbdkit[in]: debug: error in timestamp')).toBe(
      true,
    );
    expect(isErrorFalsePositive('nbdkit[out0]: debug: error in timestamp')).toBe(
      true,
    );
  });

  it('returns false for real errors', () => {
    expect(isErrorFalsePositive('virt-v2v: error: disk not found')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// extractSource
// ────────────────────────────────────────────────────────────────────────────

describe('extractSource', () => {
  it('extracts nbdkit', () => {
    expect(extractSource('nbdkit: debug: msg')).toBe('nbdkit');
    expect(extractSource('nbdkit[in]: debug: msg')).toBe('nbdkit');
    expect(extractSource('nbdkit[out]: debug: msg')).toBe('nbdkit');
    expect(extractSource('nbdkit[in0]: debug: msg')).toBe('nbdkit');
  });

  it('extracts libguestfs', () => {
    expect(extractSource('libguestfs: trace: v2v')).toBe('libguestfs');
  });

  it('extracts virt-v2v', () => {
    expect(extractSource('virt-v2v: error: msg')).toBe('virt-v2v');
  });

  it('extracts virt-v2v-in-place', () => {
    expect(extractSource('virt-v2v-in-place: starting')).toBe('virt-v2v-in-place');
  });

  it('extracts virt-v2v-inspector', () => {
    expect(extractSource('virt-v2v-inspector: info')).toBe('virt-v2v-inspector');
  });

  it('returns unknown for unrecognized', () => {
    expect(extractSource('random line')).toBe('unknown');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// inferExitStatus
// ────────────────────────────────────────────────────────────────────────────

describe('inferExitStatus', () => {
  it('returns success when Finishing off stage present', () => {
    const stages: V2VPipelineStage[] = [
      { name: 'Finishing off', elapsedSeconds: 100, lineNumber: 10 },
    ];
    expect(inferExitStatus(stages, [], [])).toBe('success');
  });

  it('returns success when virt-v2v monitoring: Finished', () => {
    const rawLines = ['virt-v2v monitoring: Finished'];
    expect(inferExitStatus([], [], rawLines)).toBe('success');
  });

  it('returns error when fatal virt-v2v error and no Finishing off', () => {
    const errors: V2VError[] = [
      {
        level: 'error',
        source: 'virt-v2v',
        message: 'disk not found',
        lineNumber: 5,
        rawLine: 'virt-v2v: error: disk not found',
      },
    ];
    expect(inferExitStatus([], errors, [])).toBe('error');
  });

  it('returns success when Finishing off even with fatal error', () => {
    const stages: V2VPipelineStage[] = [
      { name: 'Finishing off', elapsedSeconds: 100, lineNumber: 10 },
    ];
    const errors: V2VError[] = [
      {
        level: 'error',
        source: 'virt-v2v',
        message: 'some error',
        lineNumber: 5,
        rawLine: 'virt-v2v: error: msg',
      },
    ];
    expect(inferExitStatus(stages, errors, [])).toBe('success');
  });

  it('ignores warning-level errors for fatal check', () => {
    const errors: V2VError[] = [
      {
        level: 'warning',
        source: 'virt-v2v',
        message: 'warning',
        lineNumber: 5,
        rawLine: 'virt-v2v: warning: msg',
      },
    ];
    expect(inferExitStatus([], errors, [])).toBe('unknown');
  });

  it('returns in_progress when stages exist but no finish signal', () => {
    const stages: V2VPipelineStage[] = [
      { name: 'Setting up the source', elapsedSeconds: 0, lineNumber: 1 },
    ];
    expect(inferExitStatus(stages, [], [])).toBe('in_progress');
  });

  it('returns unknown when no signals', () => {
    expect(inferExitStatus([], [], [])).toBe('unknown');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// buildHostCommand
// ────────────────────────────────────────────────────────────────────────────

describe('buildHostCommand', () => {
  it('builds command from parts', () => {
    const cmd = buildHostCommand(['qemu-img', 'convert', '-f', 'raw'], 42);
    expect(cmd.command).toBe('qemu-img');
    expect(cmd.args).toEqual(['convert', '-f', 'raw']);
    expect(cmd.lineNumber).toBe(42);
  });

  it('handles single part', () => {
    const cmd = buildHostCommand(['blkid'], 1);
    expect(cmd.command).toBe('blkid');
    expect(cmd.args).toEqual([]);
  });

  it('handles empty parts', () => {
    const cmd = buildHostCommand([], 0);
    expect(cmd.command).toBe('');
    expect(cmd.args).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// parseVersionFields
// ────────────────────────────────────────────────────────────────────────────

describe('parseVersionFields', () => {
  it('parses virt-v2v version', () => {
    const versions: V2VComponentVersions = {};
    parseVersionFields(
      'info: virt-v2v: virt-v2v 2.7.1rhel=9,release=8.el9_6 (x86_64)',
      versions,
    );
    expect(versions.virtV2v).toBe('2.7.1rhel=9,release=8.el9_6');
  });

  it('parses libvirt version', () => {
    const versions: V2VComponentVersions = {};
    parseVersionFields('info: libvirt version: 10.10.0', versions);
    expect(versions.libvirt).toBe('10.10.0');
  });

  it('parses nbdkit version', () => {
    const versions: V2VComponentVersions = {};
    parseVersionFields('nbdkit 1.38.5 (nbdkit-vddk-plugin)', versions);
    expect(versions.nbdkit).toBe('1.38.5');
  });

  it('parses libguestfs version with custom format', () => {
    const versions: V2VComponentVersions = {};
    parseVersionFields(
      'libguestfs: trace: v2v: version = <struct guestfs_version = major: 1, minor: 56, release: 1',
      versions,
    );
    expect(versions.libguestfs).toBe('1.56.1');
  });

  it('does not overwrite existing version', () => {
    const versions: V2VComponentVersions = { virtV2v: '2.6.0' };
    parseVersionFields(
      'info: virt-v2v: virt-v2v 2.7.1 (x86_64)',
      versions,
    );
    expect(versions.virtV2v).toBe('2.6.0');
  });

  it('ignores lines with no version match', () => {
    const versions: V2VComponentVersions = {};
    parseVersionFields('random log line', versions);
    expect(Object.keys(versions)).toHaveLength(0);
  });
});
