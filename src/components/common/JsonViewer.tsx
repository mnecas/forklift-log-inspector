import { useMemo } from 'react';

interface JsonViewerProps {
  json: string;
  className?: string;
}

/**
 * Render formatted JSON with syntax highlighting
 */
export function JsonViewer({ json, className = '' }: JsonViewerProps) {
  const highlighted = useMemo(() => {
    let formatted: string;
    try {
      const parsed = JSON.parse(json);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      formatted = json;
    }

    return formatted.split('\n').map((line, idx) => {
      // Highlight keys
      const keyMatch = line.match(/^(\s*)"([^"]+)":/);
      if (keyMatch) {
        const [, indent, key] = keyMatch;
        const rest = line.slice(keyMatch[0].length);
        return (
          <div key={idx}>
            <span>{indent}</span>
            <span className="text-blue-600 dark:text-blue-400">"{key}"</span>
            <span className="text-slate-600 dark:text-slate-400">:</span>
            <JsonValue value={rest} />
          </div>
        );
      }
      return <div key={idx} className="text-slate-700 dark:text-slate-300">{line}</div>;
    });
  }, [json]);

  return <div className={`text-xs font-mono ${className}`}>{highlighted}</div>;
}

/**
 * Render a JSON value with appropriate color
 */
function JsonValue({ value }: { value: string }) {
  const trimmed = value.trim();
  
  // String value
  if (trimmed.startsWith('"')) {
    return <span className="text-green-600 dark:text-green-400">{value}</span>;
  }
  // Number
  if (/^\s*-?\d/.test(trimmed)) {
    return <span className="text-orange-600 dark:text-orange-400">{value}</span>;
  }
  // Boolean or null
  if (/^\s*(true|false|null)/.test(trimmed)) {
    return <span className="text-purple-600 dark:text-purple-400">{value}</span>;
  }
  // Object/Array brackets
  return <span className="text-slate-600 dark:text-slate-400">{value}</span>;
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
