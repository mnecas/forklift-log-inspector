/**
 * Unified badge color utility functions
 */

/**
 * Get color classes for log level badges
 */
export function getLevelBadgeClass(level: string): string {
  const levelLower = level.toLowerCase();
  const classes: Record<string, string> = {
    error: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
    warn: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    warning: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    info: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
    debug: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400',
  };
  return classes[levelLower] || classes.info;
}

/**
 * Get color classes for log level badges with borders (for cards)
 */
export function getLevelColorClasses(level: string): string {
  const classes: Record<string, string> = {
    error: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30',
    warning: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/30',
    warn: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/30',
    info: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30',
    debug: 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400 border-slate-200 dark:border-gray-500/30',
  };
  return classes[level] || classes.info;
}

/**
 * Get solid color classes for level badges
 */
export function getLevelSolidBadgeClass(level: string): string {
  const classes: Record<string, string> = {
    error: 'bg-red-500 text-white',
    warning: 'bg-yellow-500 text-white',
    warn: 'bg-yellow-500 text-white',
    info: 'bg-blue-500 text-white',
    debug: 'bg-slate-500 text-white',
  };
  return classes[level] || classes.info;
}

/**
 * Get color classes for phase badges
 */
export function getPhaseBadgeClass(phase: string): string {
  const phaseColors: Record<string, string> = {
    Initialize: 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-400',
    CutoverReady: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
    StorePowerState: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
    AllocateDisks: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
    CopyDisks: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
    CopyingPaused: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
    CreateGuestConversionPod: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
    ConvertGuest: 'bg-lime-100 dark:bg-lime-500/20 text-lime-700 dark:text-lime-400',
    CopyDisksVirtV2V: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400',
    CreateVM: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    PostHook: 'bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-400',
    Completed: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  };
  return phaseColors[phase] || 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-400';
}

/**
 * Get color classes for plan status badges
 */
export function getStatusBadgeClass(status: string): string {
  const statusColors: Record<string, string> = {
    Pending: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    Ready: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    Running: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
    Succeeded: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
    Failed: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
    Archived: 'bg-slate-100 dark:bg-gray-500/20 text-slate-600 dark:text-gray-400',
  };
  return statusColors[status] || statusColors.Pending;
}

/**
 * Get color classes for resource type badges
 */
export function getResourceColorClass(resourceType: string): string {
  const colorMap: Record<string, string> = {
    VirtualMachine: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
    Pod: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
    Secret: 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    ConfigMap: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
    PVC: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
    PersistentVolumeClaim: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
    Service: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',
  };
  return colorMap[resourceType] || 'bg-slate-100 dark:bg-slate-500/20 text-slate-700 dark:text-slate-400';
}
