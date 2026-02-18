/**
 * Generic content-based file discovery inside extracted archives.
 *
 * Classifies files by inspecting their content (not their path) and
 * runs them through the appropriate parsing pipeline. Works with any
 * archive layout: MTV must-gather, cluster must-gather, `oc adm inspect`,
 * namespace dumps, etc.
 */

import type { TarEntry } from './tarExtractor';
import type { ParsedData, ArchiveResult } from '../types';
import type { V2VFileEntry } from '../types/v2v';
import { extractArchive } from './tarExtractor';
import { parseLogFile } from './logParser';
import { parsePlanYaml } from './planYamlParser';
import { isV2VLog, parseV2VLog } from './v2vLogParser';
import { mergeResults } from './mergeResults';
import { V2V_PATH_RE, isV2VLogByPath } from './v2v/pathClassifier';

export type ProgressCallback = (stage: string, detail?: string) => void;

export type { ArchiveResult };

// ── Content-based classifiers ──────────────────────────────────────────────

/** Signatures that identify forklift-controller JSON log lines */
const LOG_SIGNATURES = [
  '"logger":"plan|',
  '"logger": "plan|',
  '"controller":"plan"',
  '"controller": "plan"',
];

/**
 * Maximum bytes to check for content-based classification.
 * Checking only the first 8 KB is sufficient – if the first few hundred
 * log lines don't contain a forklift signature the file is not a forklift log.
 */
const CLASSIFY_CHECK_BYTES = 8 * 1024;

/**
 * Check whether a file looks like forklift-controller JSON log output.
 *
 * Optimisation: only scans the first CLASSIFY_CHECK_BYTES of the content
 * to avoid scanning multi-megabyte files that are clearly not forklift logs.
 *
 * Primary check: content contains one of the distinctive log signatures.
 * Fallback: the path mentions "forklift-controller" and the first
 * non-empty line starts with '{' (JSON lines).
 */
function isForkliftLogFile(entry: TarEntry): boolean {
  // Use only the prefix for the signature scan
  const sample = entry.content.length > CLASSIFY_CHECK_BYTES
    ? entry.content.slice(0, CLASSIFY_CHECK_BYTES)
    : entry.content;

  for (const sig of LOG_SIGNATURES) {
    if (sample.includes(sig)) return true;
  }

  // Fallback: path hint + JSON-lines shape (still fast, only checks first line)
  if (entry.path.toLowerCase().includes('forklift-controller')) {
    const firstLine = sample.trimStart().split('\n', 1)[0]?.trim();
    if (firstLine?.startsWith('{')) return true;
  }

  return false;
}

// V2V_PATH_RE, isV2VLogByPath imported from ./v2v/pathClassifier

/**
 * Patterns that identify Forklift Kubernetes resources.
 * Both `kind: Plan` / `kind:Plan` variants are covered, plus NetworkMap and StorageMap.
 */
const PLAN_KIND_RE = /kind:\s*Plan\b/;
const NETWORKMAP_KIND_RE = /kind:\s*NetworkMap\b/;
const STORAGEMAP_KIND_RE = /kind:\s*StorageMap\b/;
const FORKLIFT_API_RE = /forklift\.konveyor\.io/;

/**
 * Check whether a file contains a Forklift YAML resource (Plan, NetworkMap, or StorageMap).
 * Only checks the first CLASSIFY_CHECK_BYTES for large files.
 */
function isForkliftYamlFile(entry: TarEntry): boolean {
  const sample = entry.content.length > CLASSIFY_CHECK_BYTES
    ? entry.content.slice(0, CLASSIFY_CHECK_BYTES)
    : entry.content;
  if (!FORKLIFT_API_RE.test(sample)) return false;
  return PLAN_KIND_RE.test(sample) || NETWORKMAP_KIND_RE.test(sample) || STORAGEMAP_KIND_RE.test(sample);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Process an uploaded archive file end-to-end:
 *   1. Extract (recursively for nested tars)
 *   2. Classify files by content
 *   3. Parse with the appropriate pipeline(s)
 *   4. Merge and return
 *
 * @param file        The archive File to process
 * @param onProgress  Optional callback for reporting progress stages
 */
export async function processArchive(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ArchiveResult> {
  try {
    return await processArchiveImpl(file, onProgress);
  } catch (err) {
    console.error('processArchive failed:', err);
    return {
      logFiles: [],
      yamlFiles: [],
      v2vFiles: [],
      v2vFileEntries: [],
      parsedData: mergeResults(null, null),
    };
  }
}

async function processArchiveImpl(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ArchiveResult> {
  // 1. Extract all files (handles nested tars/gzips/zips)
  onProgress?.('Extracting archive...', file.name);
  const entries = await extractArchive(file);

  // 2. Classify
  onProgress?.('Classifying files...', `${entries.length} files extracted`);
  const logEntries: TarEntry[] = [];
  const yamlEntries: TarEntry[] = [];
  const v2vEntries: TarEntry[] = [];

  for (const entry of entries) {
    if (isForkliftLogFile(entry)) {
      logEntries.push(entry);
    } else if (isForkliftYamlFile(entry)) {
      yamlEntries.push(entry);
    } else if (
      isV2VLogByPath(entry.path) ||
      isV2VLog(entry.content.length > CLASSIFY_CHECK_BYTES
        ? entry.content.slice(0, CLASSIFY_CHECK_BYTES)
        : entry.content)
    ) {
      v2vEntries.push(entry);
    }
  }

  // 3. Parse each category
  let logResult: ParsedData | null = null;
  let yamlResult: ParsedData | null = null;
  const v2vFileEntries: V2VFileEntry[] = [];

  if (logEntries.length > 0) {
    onProgress?.('Parsing controller logs...', `${logEntries.length} file${logEntries.length !== 1 ? 's' : ''}`);
    logResult = parseLogFilesIndividually(logEntries);
  }

  if (yamlEntries.length > 0) {
    onProgress?.('Parsing Forklift YAMLs...', `${yamlEntries.length} file${yamlEntries.length !== 1 ? 's' : ''}`);
    const combined = yamlEntries.map((e) => e.content).join('\n---\n');
    yamlResult = parsePlanYaml(combined);
  }

  if (v2vEntries.length > 0) {
    onProgress?.('Parsing V2V logs...', `${v2vEntries.length} file${v2vEntries.length !== 1 ? 's' : ''}`);
    // Parse each V2V file individually so the UI can show per-file analysis
    for (const entry of v2vEntries) {
      const data = parseV2VLog(entry.content);
      data.fileName = entry.path;
      // Extract plan name and VM ID from the archive path
      const match = V2V_PATH_RE.exec(entry.path);
      v2vFileEntries.push({
        filePath: entry.path,
        data,
        planName: match?.[2],
        vmId: match ? `vm-${match[3]}` : undefined,
      });
    }
  }

  // 4. Merge
  onProgress?.('Merging results...');
  const parsedData = mergeResults(logResult, yamlResult);

  return {
    logFiles: logEntries.map((e) => e.path),
    yamlFiles: yamlEntries.map((e) => e.path),
    v2vFiles: v2vEntries.map((e) => e.path),
    v2vFileEntries,
    parsedData,
  };
}

/**
 * Parse multiple log files individually instead of joining them into one
 * giant string and splitting again.  This avoids a peak-memory spike from
 * the intermediate concatenated string and the re-allocated split array.
 */
function parseLogFilesIndividually(entries: TarEntry[]): ParsedData {
  if (entries.length === 1) {
    return parseLogFile(entries[0].content);
  }

  // Parse each file separately and merge the results
  let merged: ParsedData | null = null;
  for (const entry of entries) {
    const result = parseLogFile(entry.content);
    merged = merged ? mergeResults(merged, result) : result;
  }
  return merged ?? mergeResults(null, null);
}
