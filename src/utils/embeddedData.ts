/**
 * Handles detection and hydration of embedded report data.
 *
 * When the app is exported as an interactive HTML file, all parsed data is
 * injected into `window.__FORKLIFT_EMBEDDED_DATA__` as a JSON-serialized
 * object. This module detects that data on startup, revives Date objects
 * (which become ISO strings in JSON), and hydrates both stores.
 */
import { useStore } from '../store/useStore';
import { useV2VStore } from '../store/useV2VStore';
import type { Plan, Event, ParseStats, Summary, NetworkMapResource, StorageMapResource } from '../types';
import type { V2VFileEntry } from '../types/v2v';

/** Shape of the embedded data blob injected into the HTML export. */
export interface EmbeddedData {
  parsedData: {
    plans: Plan[];
    events: Event[];
    summary: Summary;
    stats: ParseStats;
    networkMaps: NetworkMapResource[];
    storageMaps: StorageMapResource[];
  };
  v2vFileEntries: V2VFileEntry[];
}

declare global {
  interface Window {
    __FORKLIFT_EMBEDDED_DATA__?: EmbeddedData;
  }
}

/**
 * Check if there is embedded data on window.
 */
export function hasEmbeddedData(): boolean {
  return typeof window !== 'undefined' && window.__FORKLIFT_EMBEDDED_DATA__ != null;
}

// ── Date revival ────────────────────────────────────────────────────────

/**
 * ISO 8601 date string pattern — matches strings produced by Date.toISOString().
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Revive Date objects from ISO strings in a parsed JSON value.
 * Walks the object graph and converts any string matching ISO 8601 format to a Date.
 */
function reviveDates<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map(reviveDates) as unknown as T;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = reviveDates(v);
    }
    return result as T;
  }

  return value;
}

// ── Hydration ───────────────────────────────────────────────────────────

/**
 * Hydrate both stores from the embedded data.
 * Call this once on app mount when `hasEmbeddedData()` returns true.
 */
export function hydrateFromEmbeddedData(): void {
  const raw = window.__FORKLIFT_EMBEDDED_DATA__;
  if (!raw) return;

  // Revive Date objects that were serialized as ISO strings
  const data = reviveDates(raw);

  // Hydrate the main store (plans, events, stats, summary)
  const store = useStore.getState();
  store.setParseResult(data.parsedData);
  store.setViewMode('plans');

  // Auto-select the right view
  if (data.v2vFileEntries.length > 0 && data.parsedData.plans.length === 0) {
    store.setViewMode('v2v');
  }

  // Hydrate V2V store
  if (data.v2vFileEntries.length > 0) {
    useV2VStore.getState().setV2VFileEntries(data.v2vFileEntries);
  }
}
