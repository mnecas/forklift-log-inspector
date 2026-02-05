import { useMemo } from 'react';

interface JsonViewerProps {
  json: string;
  className?: string;
}

/**
 * Render formatted JSON with syntax highlighting
 */
export function JsonViewer({ json, className = '' }: JsonViewerProps) {
  const highlightedHtml = useMemo(() => {
    let formatted: string;
    try {
      const parsed = JSON.parse(json);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      formatted = json;
    }

    // Apply syntax highlighting via regex replacements
    // Escape HTML first
    let html = formatted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Highlight strings (including keys)
    html = html.replace(
      /"([^"\\]|\\.)*"/g,
      (match) => {
        // Check if this is a key (followed by :)
        return `<span class="json-string">${match}</span>`;
      }
    );

    // Highlight numbers
    html = html.replace(
      /\b(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
      '<span class="json-number">$1</span>'
    );

    // Highlight booleans and null
    html = html.replace(
      /\b(true|false|null)\b/g,
      '<span class="json-boolean">$1</span>'
    );

    // Highlight keys (strings followed by :)
    html = html.replace(
      /<span class="json-string">("([^"\\]|\\.)*")<\/span>(\s*):/g,
      '<span class="json-key">$1</span>$3:'
    );

    return html;
  }, [json]);

  return (
    <pre 
      className={`text-xs font-mono whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300 ${className}`}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}

/**
 * Format raw JSON string for display
 */
export function formatRawJson(rawLine: string | undefined): string {
  if (!rawLine) return '';
  try {
    const parsed = JSON.parse(rawLine);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawLine;
  }
}
