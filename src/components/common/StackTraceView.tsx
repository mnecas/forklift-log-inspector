interface StackTraceViewProps {
  stacktrace: string;
  className?: string;
}

/**
 * Render stack trace with syntax highlighting
 */
export function StackTraceView({ stacktrace, className = '' }: StackTraceViewProps) {
  const lines = stacktrace
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return (
    <div className={`text-xs font-mono space-y-0.5 ${className}`}>
      {lines.map((line, idx) => (
        <StackTraceLine key={idx} line={line} />
      ))}
    </div>
  );
}

/**
 * Render a single stack trace line with colors
 */
function StackTraceLine({ line }: { line: string }) {
  // Pattern: github.com/org/repo/path.(*Type).Method
  //          /path/to/file.go:123
  
  // Check if line is a file path (starts with / or contains .go:)
  if (line.startsWith('/') || line.match(/^\s*\//) || line.match(/\.go:\d+$/)) {
    return (
      <div className="text-slate-500 dark:text-slate-400 pl-4">
        {line}
      </div>
    );
  }
  
  // Check if it's a package/function line (contains github.com or similar)
  const funcMatch = line.match(/^(.+?)\.(\([^)]+\)\.)?(\w+)$/);
  if (funcMatch) {
    const [, packagePath, receiver, funcName] = funcMatch;
    return (
      <div>
        <span className="text-green-600 dark:text-green-400">{packagePath}</span>
        {receiver && <span className="text-blue-600 dark:text-blue-400">{receiver}</span>}
        <span className="text-green-600 dark:text-green-400">.{funcName}</span>
      </div>
    );
  }
  
  // Check for simpler package.Function pattern
  const simpleMatch = line.match(/^([\w./]+)\.(\w+)$/);
  if (simpleMatch) {
    const [, pkg, func] = simpleMatch;
    return (
      <div>
        <span className="text-green-600 dark:text-green-400">{pkg}</span>
        <span className="text-green-600 dark:text-green-400">.{func}</span>
      </div>
    );
  }
  
  // Default: just render the line
  return <div className="text-slate-700 dark:text-slate-300">{line}</div>;
}
