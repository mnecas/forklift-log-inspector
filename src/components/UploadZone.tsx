import { useState, useCallback, useRef, DragEvent, ChangeEvent } from 'react';
import { useStore } from '../store/useStore';
import { useToast } from './Toast';
import { parseLogFile, parsePlanYaml, isYamlContent } from '../parser';

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [clearOnUpload, setClearOnUpload] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setParseResult, clearData } = useStore();
  const { showToast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    // Validate file type
    const validExtensions = ['.log', '.txt', '.json', '.yaml', '.yml'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(ext)) {
      showToast(`Invalid file type. Allowed: ${validExtensions.join(', ')}`, 'error');
      return;
    }

    setIsProcessing(true);

    try {
      if (clearOnUpload) {
        clearData();
      }

      const content = await file.text();
      const isYaml = ext === '.yaml' || ext === '.yml' || isYamlContent(content);

      const result = isYaml ? parsePlanYaml(content) : parseLogFile(content);
      setParseResult(result);

      const fileType = isYaml ? 'Plan YAML' : 'log';
      showToast(
        isYaml
          ? `Parsed ${fileType}: found ${result.stats.plansFound} plan${result.stats.plansFound !== 1 ? 's' : ''}, ${result.stats.vmsFound} VM${result.stats.vmsFound !== 1 ? 's' : ''}`
          : `Parsed ${result.stats.parsedLines.toLocaleString()} lines, found ${result.stats.plansFound} plans`,
        'success'
      );
    } catch (error) {
      console.error('Error parsing file:', error);
      showToast('Failed to parse file', 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [clearOnUpload, clearData, setParseResult, showToast]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFile]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-4">
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragging
            ? 'border-pink-500 bg-pink-500/10'
            : 'border-slate-300 dark:border-slate-600 hover:border-pink-500/50 hover:bg-slate-50 dark:hover:bg-slate-800'
          }
          ${isProcessing ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.txt,.json,.yaml,.yml"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 dark:text-gray-400">Processing file...</p>
          </div>
        ) : (
          <>
            <svg
              className="w-12 h-12 mx-auto mb-4 text-slate-400 dark:text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-slate-900 dark:text-gray-100 font-medium mb-1">
              Drop your log file or Plan YAML here, or click to browse
            </p>
            <p className="text-slate-500 dark:text-gray-400 text-sm">
              Supports .log, .txt, .json, .yaml, .yml files
            </p>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-center">
        <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={clearOnUpload}
            onChange={(e) => setClearOnUpload(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700
                       checked:bg-pink-500 checked:border-pink-500
                       focus:ring-2 focus:ring-pink-500 focus:ring-offset-0"
          />
          Clear existing data on upload
        </label>
      </div>
    </div>
  );
}
