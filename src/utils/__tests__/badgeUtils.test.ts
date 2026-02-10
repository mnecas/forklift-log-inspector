import { describe, it, expect } from 'vitest';
import {
  getLevelBadgeClass,
  getLevelColorClasses,
  getLevelSolidBadgeClass,
  getStatusBadgeClass,
  getResourceColorClass,
} from '../badgeUtils';

describe('getLevelBadgeClass', () => {
  it('returns error classes for "error"', () => {
    expect(getLevelBadgeClass('error')).toContain('red');
  });

  it('returns warning classes for "warn"', () => {
    expect(getLevelBadgeClass('warn')).toContain('yellow');
  });

  it('returns warning classes for "WARNING" (case insensitive)', () => {
    expect(getLevelBadgeClass('WARNING')).toContain('yellow');
  });

  it('returns info classes as default', () => {
    expect(getLevelBadgeClass('unknown')).toContain('blue');
  });
});

describe('getLevelColorClasses', () => {
  it('returns classes with border for error', () => {
    const result = getLevelColorClasses('error');
    expect(result).toContain('red');
    expect(result).toContain('border');
  });

  it('handles warn as warning', () => {
    expect(getLevelColorClasses('warn')).toContain('yellow');
  });
});

describe('getLevelSolidBadgeClass', () => {
  it('returns solid classes', () => {
    expect(getLevelSolidBadgeClass('error')).toContain('bg-red-500');
    expect(getLevelSolidBadgeClass('info')).toContain('bg-blue-500');
  });
});

describe('getStatusBadgeClass', () => {
  it('returns correct classes for each status', () => {
    expect(getStatusBadgeClass('Running')).toContain('blue');
    expect(getStatusBadgeClass('Succeeded')).toContain('green');
    expect(getStatusBadgeClass('Failed')).toContain('red');
    expect(getStatusBadgeClass('Archived')).toContain('slate');
  });

  it('returns Pending style for unknown statuses', () => {
    expect(getStatusBadgeClass('Custom')).toContain('yellow');
  });
});

describe('getResourceColorClass', () => {
  it('returns correct classes for known resource types', () => {
    expect(getResourceColorClass('VirtualMachine')).toContain('purple');
    expect(getResourceColorClass('Pod')).toContain('green');
  });

  it('returns default for unknown types', () => {
    expect(getResourceColorClass('Unknown')).toContain('slate');
  });
});
