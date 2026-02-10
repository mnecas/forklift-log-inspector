import { describe, it, expect } from 'vitest';
import {
  parseTimestamp,
  parseVMInfo,
  truncate,
  getStringFromMap,
  formatDuration,
  isPanicLine,
  groupLogs,
} from '../utils';
import type { RawLogEntry } from '../../types';

describe('parseTimestamp', () => {
  it('parses ISO 8601 timestamps', () => {
    const result = parseTimestamp('2026-02-05T12:30:45.123Z');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // Feb = 1
    expect(result.getUTCHours()).toBe(12);
  });

  it('parses standard log format timestamps', () => {
    const result = parseTimestamp('2026-02-05 02:57:29.093');
    expect(result.getFullYear()).toBe(2026);
    expect(result.getUTCSeconds()).toBe(29);
  });

  it('returns epoch for empty string', () => {
    const result = parseTimestamp('');
    expect(result.getTime()).toBe(0);
  });

  it('returns epoch for invalid timestamps', () => {
    const result = parseTimestamp('not-a-date');
    expect(result.getTime()).toBe(0);
  });
});

describe('parseVMInfo', () => {
  it('parses VM info from standard format', () => {
    const result = parseVMInfo("id:vm-1002 name:'test-vm'");
    expect(result.id).toBe('vm-1002');
    expect(result.name).toBe('test-vm');
  });

  it('returns empty strings for invalid format', () => {
    const result = parseVMInfo('garbage');
    expect(result.id).toBe('');
    expect(result.name).toBe('');
  });
});

describe('truncate', () => {
  it('truncates long strings', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('does not truncate short strings', () => {
    expect(truncate('hi', 5)).toBe('hi');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('getStringFromMap', () => {
  it('extracts string values', () => {
    expect(getStringFromMap({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('returns empty string for missing keys', () => {
    expect(getStringFromMap({ foo: 'bar' }, 'baz')).toBe('');
  });

  it('returns empty string for non-string values', () => {
    expect(getStringFromMap({ foo: 42 }, 'foo')).toBe('');
  });

  it('handles undefined object', () => {
    expect(getStringFromMap(undefined, 'foo')).toBe('');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(3500)).toBe('3.5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125000)).toBe('2m 5s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(7500000)).toBe('2h 5m');
  });
});

describe('isPanicLine', () => {
  it('detects panic lines', () => {
    expect(isPanicLine('panic: runtime error')).toBe(true);
  });

  it('detects goroutine lines', () => {
    expect(isPanicLine('goroutine 1 [running]:')).toBe(true);
  });

  it('rejects normal lines', () => {
    expect(isPanicLine('{"level":"info"}')).toBe(false);
  });
});

describe('groupLogs', () => {
  it('groups logs by message', () => {
    const logs: RawLogEntry[] = [
      { timestamp: '2026-01-01T00:00:00Z', level: 'info', message: 'hello', rawLine: '{}' },
      { timestamp: '2026-01-01T00:01:00Z', level: 'info', message: 'hello', rawLine: '{}' },
      { timestamp: '2026-01-01T00:02:00Z', level: 'error', message: 'oops', rawLine: '{}' },
    ];

    const result = groupLogs(logs);
    expect(result).toHaveLength(2);
    expect(result[0].message).toBe('hello');
    expect(result[0].count).toBe(2);
    expect(result[1].message).toBe('oops');
    expect(result[1].count).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(groupLogs([])).toHaveLength(0);
  });
});
