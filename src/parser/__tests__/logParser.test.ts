import { describe, it, expect } from 'vitest';
import { parseLogFile } from '../logParser';

describe('parseLogFile', () => {
  it('parses basic plan log entries', () => {
    const logContent = [
      '{"level":"info","ts":"2026-02-05T12:00:00.000Z","logger":"plan|test-ns/my-plan","msg":"Reconcile started","plan":{"name":"my-plan","namespace":"test-ns"}}',
      '{"level":"info","ts":"2026-02-05T12:00:01.000Z","logger":"plan|test-ns/my-plan","msg":"Reconcile completed","plan":{"name":"my-plan","namespace":"test-ns"}}',
    ].join('\n');

    const result = parseLogFile(logContent);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].name).toBe('my-plan');
    expect(result.plans[0].namespace).toBe('test-ns');
    expect(result.stats.parsedLines).toBe(2);
  });

  it('handles empty content', () => {
    const result = parseLogFile('');
    expect(result.plans).toHaveLength(0);
    expect(result.stats.totalLines).toBe(1); // One empty line
  });

  it('skips duplicate lines', () => {
    const line = '{"level":"info","ts":"2026-02-05T12:00:00.000Z","logger":"plan|ns/plan","msg":"test","plan":{"name":"plan","namespace":"ns"}}';
    const logContent = [line, line].join('\n');

    const result = parseLogFile(logContent);
    expect(result.stats.duplicateLines).toBe(1);
    expect(result.stats.parsedLines).toBe(1);
  });

  it('handles container log format (timestamp prefix)', () => {
    const logContent = '2026-02-05T12:00:00.000Z {"level":"info","logger":"plan|ns/plan","msg":"test","plan":{"name":"plan","namespace":"ns"}}';

    const result = parseLogFile(logContent);
    expect(result.stats.parsedLines).toBe(1);
    expect(result.plans).toHaveLength(1);
  });

  it('tracks non-JSON lines as errors', () => {
    const logContent = 'this is not json\nalso not json';

    const result = parseLogFile(logContent);
    expect(result.stats.errorLines).toBe(2);
    expect(result.stats.parsedLines).toBe(0);
  });

  it('detects panic stack traces', () => {
    const logContent = [
      '{"level":"info","ts":"2026-02-05T12:00:00.000Z","logger":"plan|ns/plan","msg":"test","plan":{"name":"plan","namespace":"ns"}}',
      'panic: runtime error: invalid memory address',
      'goroutine 1 [running]:',
      'main.main()',
      '{"level":"info","ts":"2026-02-05T12:00:01.000Z","logger":"plan|ns/plan","msg":"after panic","plan":{"name":"plan","namespace":"ns"}}',
    ].join('\n');

    const result = parseLogFile(logContent);
    expect(result.stats.parsedLines).toBe(2);
    // Panic lines are tracked as error lines
    expect(result.stats.errorLines).toBe(3);
  });
});
