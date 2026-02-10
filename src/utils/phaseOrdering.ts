import type { VM, PhaseLogSummary } from '../types';
import { getPhasesForMigrationType } from '../parser/constants';

/**
 * Build the ordered list of phases for a VM, inserting unknown phases at the
 * correct position based on where they appeared in the phaseHistory relative
 * to the canonical (known) phase list for the migration type.
 */
export function buildOrderedPhases(
  vm: VM,
  phaseSummaries: Record<string, PhaseLogSummary>,
): string[] {
  const knownPhases = vm.fromYaml ? [] : getPhasesForMigrationType(vm.migrationType);
  const knownPhasesSet = new Set(knownPhases);

  // For YAML-sourced VMs, just use the phases from history in order (no predefined template)
  if (vm.fromYaml) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const ph of vm.phaseHistory || []) {
      if (!seen.has(ph.name)) {
        seen.add(ph.name);
        result.push(ph.name);
      }
    }
    // Also include phases that only appear in logs/summaries
    if (vm.phaseLogs) {
      for (const phase of Object.keys(vm.phaseLogs)) {
        if (!seen.has(phase)) {
          seen.add(phase);
          result.push(phase);
        }
      }
    }
    for (const phase of Object.keys(phaseSummaries)) {
      if (!seen.has(phase)) {
        seen.add(phase);
        result.push(phase);
      }
    }
    return result;
  }

  // Collect all unknown phases and figure out where each one appeared
  const unknownPhasesSet = new Set<string>();

  for (const ph of vm.phaseHistory || []) {
    if (!knownPhasesSet.has(ph.name)) unknownPhasesSet.add(ph.name);
  }
  if (vm.phaseLogs) {
    for (const phase of Object.keys(vm.phaseLogs)) {
      if (!knownPhasesSet.has(phase)) unknownPhasesSet.add(phase);
    }
  }
  for (const phase of Object.keys(phaseSummaries)) {
    if (!knownPhasesSet.has(phase)) unknownPhasesSet.add(phase);
  }

  if (unknownPhasesSet.size === 0) {
    return [...knownPhases];
  }

  // For each unknown phase, find which known phase it appeared after
  // by walking the phaseHistory (deduplicated, first occurrence only)
  const seenPhases: string[] = [];
  const seen = new Set<string>();
  for (const ph of vm.phaseHistory || []) {
    if (!seen.has(ph.name)) {
      seen.add(ph.name);
      seenPhases.push(ph.name);
    }
  }

  // Map: unknown phase -> the known phase it should be inserted after
  const insertAfter = new Map<string, string | null>();
  for (const unknown of unknownPhasesSet) {
    const idx = seenPhases.indexOf(unknown);
    if (idx === -1) {
      // Not in history (only in logs/summaries) - put at end
      insertAfter.set(unknown, null);
      continue;
    }
    // Walk backwards from this phase to find the nearest known phase before it
    let afterKnown: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (knownPhasesSet.has(seenPhases[i])) {
        afterKnown = seenPhases[i];
        break;
      }
    }
    insertAfter.set(unknown, afterKnown);
  }

  // Group unknown phases by their insertion point
  const unknownsAfterKnown = new Map<string | null, string[]>();
  for (const [unknown, after] of insertAfter) {
    if (!unknownsAfterKnown.has(after)) {
      unknownsAfterKnown.set(after, []);
    }
    unknownsAfterKnown.get(after)!.push(unknown);
  }

  // Sort unknown phases within each group by their order in phaseHistory
  for (const [, unknowns] of unknownsAfterKnown) {
    unknowns.sort((a, b) => {
      const idxA = seenPhases.indexOf(a);
      const idxB = seenPhases.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }

  // Build final list: insert unknowns that appear before any known phase first,
  // then interleave known phases with their trailing unknowns
  const result: string[] = [];

  // Unknowns before any known phase (afterKnown === null but appeared first in history)
  const beforeAll = unknownsAfterKnown.get(null) || [];
  const atEnd: string[] = [];
  for (const u of beforeAll) {
    const idx = seenPhases.indexOf(u);
    if (idx !== -1 && idx < seenPhases.findIndex(p => knownPhasesSet.has(p))) {
      result.push(u);
    } else {
      atEnd.push(u);
    }
  }

  for (const known of knownPhases) {
    result.push(known);
    const trailing = unknownsAfterKnown.get(known);
    if (trailing) {
      result.push(...trailing);
    }
  }

  // Append any remaining unknowns at end
  result.push(...atEnd);

  return result;
}
