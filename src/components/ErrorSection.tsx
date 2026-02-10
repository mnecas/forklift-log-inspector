import { useState, useMemo } from 'react';
import type { ErrorEntry, PanicEntry } from '../types';
import { formatTimestamp } from '../utils/dateUtils';
import { JsonViewer, StackTraceView, CopyButton } from './common';

interface ErrorSectionProps {
  errors: ErrorEntry[];
  panics: PanicEntry[];
}

export function ErrorSection({ errors, panics }: ErrorSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Count errors vs warnings for display (hooks must be called before early returns)
  const errorCount = useMemo(() => errors.filter(e => e.level === 'error').length, [errors]);
  const warningCount = useMemo(() => errors.filter(e => e.level !== 'error').length, [errors]);
  const totalCount = errors.length + panics.length;

  if (errors.length === 0 && panics.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left text-sm font-medium text-slate-500 dark:text-gray-400 flex items-center gap-2 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 6L14 10L6 14V6Z" />
        </svg>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Errors & Warnings ({totalCount})</span>
        {(errorCount > 0 || warningCount > 0 || panics.length > 0) && (
          <span className="text-xs text-slate-400 dark:text-gray-500">
            ({panics.length > 0 ? `${panics.length} panics, ` : ''}{errorCount} errors, {warningCount} warnings)
          </span>
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="space-y-4 pl-5">
          {/* Panics */}
          {panics.length > 0 && (
            <div className="space-y-3">
              {panics.map((panic, idx) => (
                <PanicCard key={idx} panic={panic} />
              ))}
            </div>
          )}

          {/* Errors & Warnings */}
          {errors.length > 0 && (
            <div className="space-y-3">
              {errors.map((error, idx) => (
                <ErrorCard key={idx} error={error} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ErrorCardProps {
  error: ErrorEntry;
}

function ErrorCard({ error }: ErrorCardProps) {
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const isError = error.level === 'error';
  const bgColor = isError
    ? 'bg-red-50 dark:bg-red-500/10'
    : 'bg-yellow-50 dark:bg-yellow-500/10';
  const borderColor = isError
    ? 'border-red-200 dark:border-red-500/30'
    : 'border-yellow-200 dark:border-yellow-500/30';
  const textColor = isError
    ? 'text-red-700 dark:text-red-400'
    : 'text-yellow-700 dark:text-yellow-400';
  const mutedTextColor = isError
    ? 'text-red-500 dark:text-red-400/70'
    : 'text-yellow-600 dark:text-yellow-400/70';
  const codeBlockBg = isError
    ? 'bg-red-50 dark:bg-red-500/10'
    : 'bg-yellow-50 dark:bg-yellow-500/10';

  return (
    <div className={`rounded-lg border overflow-hidden ${bgColor} ${borderColor}`}>
      {/* Timestamp */}
      <div className={`px-4 pt-3 text-xs ${mutedTextColor}`}>
        {formatTimestamp(error.timestamp)}
      </div>

      {/* Message */}
      <div className="px-4 py-2">
        <div className={`text-sm px-3 py-2 rounded border-l-4 ${
          isError 
            ? 'bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200 border-red-500' 
            : 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-200 border-yellow-500'
        }`}>
          {error.message}
        </div>
      </div>

      {/* Error detail */}
      {error.error && (
        <div className={`px-4 pb-2 text-sm ${textColor} break-words`}>
          {error.error}
        </div>
      )}

      {/* Collapsible sections */}
      <div className="border-t border-inherit">
        {/* Stack Trace toggle */}
        {error.stacktrace && (
          <div>
            <button
              onClick={() => setShowStackTrace(!showStackTrace)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/30 dark:hover:bg-black/10 ${mutedTextColor}`}
            >
              <svg
                className={`w-3 h-3 transition-transform ${showStackTrace ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 6L14 10L6 14V6Z" />
              </svg>
              Stack Trace
            </button>
            {showStackTrace && (
              <div className="px-4 pb-3">
                <div className={`p-3 rounded overflow-x-auto ${codeBlockBg} relative group`}>
                  <StackTraceView stacktrace={error.stacktrace} />
                  <CopyButton 
                    text={error.stacktrace} 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    label="Copy Stack Trace"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw JSON toggle */}
        {error.rawLine && (
          <div className={error.stacktrace ? 'border-t border-inherit' : ''}>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/30 dark:hover:bg-black/10 ${mutedTextColor}`}
            >
              <svg
                className={`w-3 h-3 transition-transform ${showRawJson ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 6L14 10L6 14V6Z" />
              </svg>
              Raw JSON
            </button>
            {showRawJson && (
              <div className="px-4 pb-3">
                <div className={`p-3 rounded overflow-x-auto ${codeBlockBg} relative group`}>
                  <JsonViewer json={error.rawLine} />
                  <CopyButton 
                    text={error.rawLine} 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    label="Copy JSON"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface PanicCardProps {
  panic: PanicEntry;
}

function PanicCard({ panic }: PanicCardProps) {
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <div className="rounded-lg border overflow-hidden bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30">
      {/* Timestamp */}
      <div className="px-4 pt-3 text-xs text-red-500 dark:text-red-400/70">
        {formatTimestamp(panic.timestamp)}
      </div>

      {/* Message */}
      <div className="px-4 py-2">
        <div className="text-sm px-3 py-2 rounded border-l-4 border-red-500 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200">
          {panic.vmName && `[${panic.vmName}] `}{panic.message}
        </div>
      </div>

      {/* Controller/Reconcile info */}
      {(panic.controller || panic.reconcileId) && (
        <div className="px-4 pb-2 text-xs text-red-500 dark:text-red-400/70 flex gap-4">
          {panic.controller && <span>Controller: {panic.controller}</span>}
          {panic.reconcileId && <span>Reconcile ID: {panic.reconcileId}</span>}
        </div>
      )}

      {/* Collapsible sections */}
      <div className="border-t border-red-200 dark:border-red-500/30">
        {/* Stack Trace toggle */}
        {panic.stacktrace && (
          <div>
            <button
              onClick={() => setShowStackTrace(!showStackTrace)}
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/30 dark:hover:bg-black/10 text-red-500 dark:text-red-400/70"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showStackTrace ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 6L14 10L6 14V6Z" />
              </svg>
              Stack Trace
            </button>
            {showStackTrace && (
              <div className="px-4 pb-3">
                <div className="p-3 rounded overflow-x-auto bg-red-50 dark:bg-red-500/10 relative group">
                  <StackTraceView stacktrace={panic.stacktrace} />
                  <CopyButton 
                    text={panic.stacktrace} 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    label="Copy Stack Trace"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw JSON toggle */}
        {panic.rawLines && panic.rawLines.length > 0 && (
          <div className={panic.stacktrace ? 'border-t border-red-200 dark:border-red-500/30' : ''}>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/30 dark:hover:bg-black/10 text-red-500 dark:text-red-400/70"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showRawJson ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 6L14 10L6 14V6Z" />
              </svg>
              Raw JSON
            </button>
            {showRawJson && (
              <div className="px-4 pb-3">
                <div className="p-3 rounded overflow-x-auto bg-red-50 dark:bg-red-500/10 space-y-4 relative group">
                  {panic.rawLines.map((line, idx) => (
                    <JsonViewer key={idx} json={line} />
                  ))}
                  <CopyButton 
                    text={panic.rawLines.join('\n')} 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    label="Copy JSON"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

