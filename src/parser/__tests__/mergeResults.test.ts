import { describe, it, expect } from 'vitest';
import { mergeResults } from '../mergeResults';
import type { ParsedData, Plan } from '../../types';

function makePlan(name: string, namespace: string, overrides: Partial<Plan> = {}): Plan {
  return {
    name,
    namespace,
    status: 'Pending',
    archived: false,
    migrationType: 'Unknown',
    conditions: [],
    vms: {},
    errors: [],
    panics: [],
    firstSeen: new Date(0),
    lastSeen: new Date(0),
    ...overrides,
  };
}

function makeParsedData(plans: Plan[], totalLines = 0): ParsedData {
  return {
    plans,
    events: [],
    stats: {
      totalLines,
      parsedLines: totalLines,
      errorLines: 0,
      duplicateLines: 0,
      plansFound: plans.length,
      vmsFound: plans.reduce((sum, p) => sum + Object.keys(p.vms).length, 0),
    },
    summary: {
      totalPlans: plans.length,
      running: 0,
      succeeded: 0,
      failed: 0,
      archived: 0,
      pending: plans.length,
    },
    networkMaps: [],
    storageMaps: [],
  };
}

describe('mergeResults', () => {
  it('returns empty result when both inputs are null', () => {
    const result = mergeResults(null, null);

    expect(result.plans).toHaveLength(0);
    expect(result.events).toHaveLength(0);
    expect(result.stats.totalLines).toBe(0);
    expect(result.stats.plansFound).toBe(0);
  });

  it('returns first input when second is null', () => {
    const a = makeParsedData([makePlan('plan-a', 'ns1')], 10);
    const result = mergeResults(a, null);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].name).toBe('plan-a');
    expect(result.stats.totalLines).toBe(10);
  });

  it('returns second input when first is null', () => {
    const b = makeParsedData([makePlan('plan-b', 'ns2')], 20);
    const result = mergeResults(null, b);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].name).toBe('plan-b');
    expect(result.stats.totalLines).toBe(20);
  });

  it('merges two results with different plans', () => {
    const a = makeParsedData([makePlan('plan-a', 'ns1')], 10);
    const b = makeParsedData([makePlan('plan-b', 'ns2')], 20);

    const result = mergeResults(a, b);

    expect(result.plans).toHaveLength(2);
    expect(result.plans.map(p => p.name).sort()).toEqual(['plan-a', 'plan-b']);
    expect(result.stats.totalLines).toBe(30);
  });

  it('merges two results with overlapping plans (same namespace/name)', () => {
    const planA = makePlan('plan', 'ns', { status: 'Running', vms: { 'vm-1': { id: 'vm-1', name: 'v1', currentPhase: 'Copy', currentStep: '', migrationType: 'Unknown', transferMethod: 'Unknown', phaseHistory: [], dataVolumes: [], createdResources: [], phaseLogs: {}, firstSeen: new Date(), lastSeen: new Date() } } });
    const planB = makePlan('plan', 'ns', { status: 'Succeeded', spec: { description: 'From YAML' } });
    const a = makeParsedData([planA], 10);
    const b = makeParsedData([planB], 5);

    const result = mergeResults(a, b);

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].namespace).toBe('ns');
    expect(result.plans[0].name).toBe('plan');
    expect(result.plans[0].spec?.description).toBe('From YAML');
    expect(result.stats.totalLines).toBe(15);
  });

  it('correctly computes merged stats', () => {
    const a = makeParsedData([makePlan('a', 'ns')], 100);
    a.stats.parsedLines = 90;
    a.stats.errorLines = 5;
    a.stats.duplicateLines = 5;

    const b = makeParsedData([makePlan('b', 'ns')], 50);
    b.stats.parsedLines = 45;
    b.stats.errorLines = 3;
    b.stats.duplicateLines = 2;

    const result = mergeResults(a, b);

    expect(result.stats.totalLines).toBe(150);
    expect(result.stats.parsedLines).toBe(135);
    expect(result.stats.errorLines).toBe(8);
    expect(result.stats.duplicateLines).toBe(7);
    expect(result.stats.plansFound).toBe(2);
  });
});
