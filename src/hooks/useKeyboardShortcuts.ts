import { useEffect, useCallback } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

/**
 * Hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow Escape key even in inputs
      if (e.key !== 'Escape') {
        return;
      }
    }

    for (const shortcut of shortcuts) {
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Hook for global application keyboard shortcuts
 */
export function useGlobalShortcuts({
  onFocusSearch,
  onToggleTheme,
  onNavigateUp,
  onNavigateDown,
  onToggleExpand,
  onShowHelp,
}: {
  onFocusSearch?: () => void;
  onToggleTheme?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onToggleExpand?: () => void;
  onShowHelp?: () => void;
}) {
  const shortcuts: KeyboardShortcut[] = [];

  if (onFocusSearch) {
    shortcuts.push({
      key: '/',
      action: onFocusSearch,
      description: 'Focus search',
    });
  }

  if (onToggleTheme) {
    shortcuts.push({
      key: 'd',
      ctrl: true,
      action: onToggleTheme,
      description: 'Toggle dark mode',
    });
  }

  if (onNavigateUp) {
    shortcuts.push({
      key: 'k',
      action: onNavigateUp,
      description: 'Navigate up',
    });
  }

  if (onNavigateDown) {
    shortcuts.push({
      key: 'j',
      action: onNavigateDown,
      description: 'Navigate down',
    });
  }

  if (onToggleExpand) {
    shortcuts.push({
      key: 'Enter',
      action: onToggleExpand,
      description: 'Expand/collapse',
    });
  }

  if (onShowHelp) {
    shortcuts.push({
      key: '?',
      shift: true,
      action: onShowHelp,
      description: 'Show help',
    });
  }

  useKeyboardShortcuts(shortcuts);
}

/**
 * List of all available keyboard shortcuts for help display
 */
export const KEYBOARD_SHORTCUTS = [
  { key: '/', description: 'Focus search' },
  { key: 'Escape', description: 'Close modal / Clear search' },
  { key: 'j', description: 'Navigate to next plan' },
  { key: 'k', description: 'Navigate to previous plan' },
  { key: 'Enter', description: 'Expand/collapse selected plan' },
  { key: 'Ctrl+D', description: 'Toggle dark mode' },
  { key: '?', description: 'Show keyboard shortcuts' },
];
