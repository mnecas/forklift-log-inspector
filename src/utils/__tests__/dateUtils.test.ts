import { describe, it, expect } from 'vitest';
import { isValidDate, formatDateTime, formatTimestamp, formatDateLocale } from '../dateUtils';

describe('isValidDate', () => {
  it('returns true for valid dates', () => {
    expect(isValidDate(new Date('2026-02-05'))).toBe(true);
    expect(isValidDate('2026-02-05T12:00:00Z')).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(isValidDate(null)).toBe(false);
    expect(isValidDate(undefined)).toBe(false);
  });

  it('returns false for invalid dates', () => {
    expect(isValidDate('not-a-date')).toBe(false);
  });

  it('treats epoch (1970) as invalid', () => {
    expect(isValidDate(new Date(0))).toBe(false);
    expect(isValidDate('1970-01-01T00:00:00Z')).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('formats ISO dates', () => {
    const result = formatDateTime('2026-02-05T12:30:45.123Z');
    expect(result).toMatch(/2026-02-05/);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });

  it('returns empty string for epoch dates', () => {
    expect(formatDateTime('1970-01-01T00:00:00Z')).toBe('');
  });

  it('returns original string for invalid dates', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('formatTimestamp', () => {
  it('formats Date objects', () => {
    const result = formatTimestamp(new Date('2026-02-05T12:30:45.123Z'));
    expect(result).toContain('2026-02-05');
    expect(result).toContain('12:30:45');
  });

  it('formats string dates', () => {
    const result = formatTimestamp('2026-02-05T12:30:45.123Z');
    expect(result).toContain('2026-02-05');
  });

  it('returns "Unknown" for undefined', () => {
    expect(formatTimestamp(undefined)).toBe('Unknown');
  });

  it('returns "Unknown" for epoch dates', () => {
    expect(formatTimestamp(new Date(0))).toBe('Unknown');
  });
});

describe('formatDateLocale', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatDateLocale(null)).toBe('');
    expect(formatDateLocale(undefined)).toBe('');
  });

  it('returns empty string for epoch dates', () => {
    expect(formatDateLocale(new Date(0))).toBe('');
  });

  it('returns locale string for valid dates', () => {
    const result = formatDateLocale(new Date('2026-02-05T12:30:45Z'));
    expect(result).not.toBe('');
  });
});
