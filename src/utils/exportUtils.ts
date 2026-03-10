/**
 * Export utilities for downloading parsed plan data as JSON, CSV, or HTML report.
 */
import type { Plan, ParseStats, Summary, Event, NetworkMapResource, StorageMapResource } from '../types';
import type { V2VFileEntry } from '../types/v2v';
import type { EmbeddedData } from './embeddedData';

interface ExportData {
  plans: Plan[];
  events: Event[];
  summary: Summary;
  stats: ParseStats;
}

export interface InteractiveExportData extends ExportData {
  v2vFileEntries: V2VFileEntry[];
  networkMaps: NetworkMapResource[];
  storageMaps: StorageMapResource[];
  sourceFileName?: string;
}

// ── JSON Export ─────────────────────────────────────────────────────────────

/**
 * Serialize Date objects to ISO strings so JSON.stringify produces valid output.
 */
function dateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function exportAsJSON(data: ExportData): void {
  const json = JSON.stringify(data, dateReplacer, 2);
  downloadFile(json, 'forklift-log-report.json', 'application/json');
}

// ── CSV Export ──────────────────────────────────────────────────────────────

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportAsCSV(data: ExportData): void {
  const rows: string[][] = [];

  // Header
  rows.push([
    'Plan', 'Namespace', 'Status', 'Migration Type', 'VMs',
    'Errors', 'Panics', 'First Seen', 'Last Seen',
  ]);

  for (const plan of data.plans) {
    const vmCount = Object.keys(plan.vms).length;
    rows.push([
      plan.name,
      plan.namespace,
      plan.status,
      plan.migrationType,
      String(vmCount),
      String(plan.errors.length),
      String(plan.panics.length),
      plan.firstSeen instanceof Date ? plan.firstSeen.toISOString() : String(plan.firstSeen),
      plan.lastSeen instanceof Date ? plan.lastSeen.toISOString() : String(plan.lastSeen),
    ]);
  }

  // Add VM details section
  rows.push([]);
  rows.push(['--- VM Details ---']);
  rows.push([
    'Plan', 'VM ID', 'VM Name', 'Current Phase', 'Current Step',
    'Migration Type', 'Transfer Method', 'First Seen', 'Last Seen', 'Error',
  ]);

  for (const plan of data.plans) {
    for (const vm of Object.values(plan.vms)) {
      rows.push([
        plan.name,
        vm.id,
        vm.name,
        vm.currentPhase,
        vm.currentStep,
        vm.migrationType,
        vm.transferMethod,
        vm.firstSeen instanceof Date ? vm.firstSeen.toISOString() : String(vm.firstSeen),
        vm.lastSeen instanceof Date ? vm.lastSeen.toISOString() : String(vm.lastSeen),
        vm.error ? vm.error.reasons.join('; ') : '',
      ]);
    }
  }

  const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\n');
  downloadFile(csv, 'forklift-log-report.csv', 'text/csv');
}

// ── HTML Report Export ──────────────────────────────────────────────────────

export function exportAsHTMLReport(data: ExportData): void {
  const statusColor: Record<string, string> = {
    Succeeded: '#22c55e',
    Failed: '#ef4444',
    Running: '#3b82f6',
    Pending: '#94a3b8',
    Ready: '#06b6d4',
  };

  const planRows = data.plans.map(plan => {
    const vmCount = Object.keys(plan.vms).length;
    const color = statusColor[plan.status] || '#94a3b8';
    return `<tr>
      <td>${esc(plan.name)}</td>
      <td>${esc(plan.namespace)}</td>
      <td><span style="color:${color};font-weight:600">${esc(plan.status)}</span></td>
      <td>${esc(plan.migrationType)}</td>
      <td>${vmCount}</td>
      <td>${plan.errors.length}</td>
      <td>${plan.panics.length}</td>
    </tr>`;
  }).join('\n');

  const errorRows = data.plans.flatMap(plan =>
    plan.errors.map(err => `<tr>
      <td>${esc(plan.name)}</td>
      <td><span style="color:${err.level === 'error' ? '#ef4444' : '#eab308'}">${esc(err.level)}</span></td>
      <td>${esc(err.message)}</td>
      <td>${esc(err.error)}</td>
    </tr>`)
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Forklift Log Inspector Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem; color: #1e293b; }
  h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
  h2 { color: #334155; margin-top: 2rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-size: 14px; }
  th { background: #f1f5f9; font-weight: 600; }
  tr:nth-child(even) { background: #f8fafc; }
  .summary { display: flex; gap: 1.5rem; margin: 1rem 0; flex-wrap: wrap; }
  .stat { background: #f1f5f9; border-radius: 8px; padding: 1rem 1.5rem; text-align: center; min-width: 120px; }
  .stat-value { font-size: 1.5rem; font-weight: 700; }
  .stat-label { font-size: 0.875rem; color: #64748b; margin-top: 0.25rem; }
  .generated { color: #94a3b8; font-size: 0.75rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1>Forklift Log Inspector Report</h1>

<div class="summary">
  <div class="stat"><div class="stat-value">${data.summary.totalPlans}</div><div class="stat-label">Total Plans</div></div>
  <div class="stat"><div class="stat-value" style="color:#22c55e">${data.summary.succeeded}</div><div class="stat-label">Succeeded</div></div>
  <div class="stat"><div class="stat-value" style="color:#ef4444">${data.summary.failed}</div><div class="stat-label">Failed</div></div>
  <div class="stat"><div class="stat-value" style="color:#3b82f6">${data.summary.running}</div><div class="stat-label">Running</div></div>
  <div class="stat"><div class="stat-value">${data.summary.pending}</div><div class="stat-label">Pending</div></div>
  <div class="stat"><div class="stat-value">${data.summary.archived}</div><div class="stat-label">Archived</div></div>
</div>

<h2>Plans</h2>
<table>
  <thead><tr><th>Name</th><th>Namespace</th><th>Status</th><th>Type</th><th>VMs</th><th>Errors</th><th>Panics</th></tr></thead>
  <tbody>${planRows}</tbody>
</table>

${errorRows ? `<h2>Errors &amp; Warnings</h2>
<table>
  <thead><tr><th>Plan</th><th>Level</th><th>Message</th><th>Error</th></tr></thead>
  <tbody>${errorRows}</tbody>
</table>` : ''}

<h2>Parse Statistics</h2>
<table>
  <tr><th>Total Lines</th><td>${data.stats.totalLines.toLocaleString()}</td></tr>
  <tr><th>Parsed Lines</th><td>${data.stats.parsedLines.toLocaleString()}</td></tr>
  <tr><th>Error Lines</th><td>${data.stats.errorLines.toLocaleString()}</td></tr>
  <tr><th>Plans Found</th><td>${data.stats.plansFound}</td></tr>
  <tr><th>VMs Found</th><td>${data.stats.vmsFound}</td></tr>
</table>

<p class="generated">Generated by Forklift Log Inspector on ${new Date().toLocaleString()}</p>
</body>
</html>`;

  downloadFile(html, 'forklift-log-report.html', 'text/html');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Interactive HTML Export ─────────────────────────────────────────────────

/**
 * Export the full interactive app as a single self-contained HTML file.
 * Fetches the pre-built viewer template and injects the current data into it.
 */
export async function exportAsInteractiveHTML(data: InteractiveExportData): Promise<void> {
  const templateUrl = new URL('./viewer-template.html', window.location.href).href;

  const resp = await fetch(templateUrl);
  if (!resp.ok) {
    throw new Error(
      `Could not load viewer template (${resp.status}). ` +
      'Run "npm run build:viewer" first to generate the template.'
    );
  }

  let html = await resp.text();

  if (/<script[^>]+src=["'][^"']*\/@vite\/client/.test(html)) {
    throw new Error(
      'Viewer template not found — the dev server returned its own page instead. ' +
      'Run "npm run build:viewer" first to generate the template.'
    );
  }

  const embedded: EmbeddedData = {
    parsedData: {
      plans: data.plans,
      events: data.events,
      summary: data.summary,
      stats: data.stats,
      networkMaps: data.networkMaps,
      storageMaps: data.storageMaps,
    },
    v2vFileEntries: data.v2vFileEntries,
  };

  const json = JSON.stringify(embedded, dateReplacer);

  // Escape `</` so the HTML parser never sees a closing tag inside the script
  const safeJson = json.replace(/<\//g, '<\\/');
  const injection = `<script>window.__FORKLIFT_EMBEDDED_DATA__=${safeJson};</script>`;

  // Insert before the LAST </head> — earlier occurrences are string literals
  // inside the bundled JS and must not be touched.
  const idx = html.lastIndexOf('</head>');
  if (idx === -1) throw new Error('Viewer template is missing </head> tag.');
  html = html.slice(0, idx) + injection + '\n' + html.slice(idx);

  const outName = data.sourceFileName
    ? data.sourceFileName.replace(/\.[^.]+$/, '') + '.html'
    : 'forklift-interactive-report.html';
  downloadFile(html, outName, 'text/html');
}

// ── Download helper ─────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
