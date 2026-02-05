/**
 * Unified date/time formatting utilities
 */

/**
 * Format a date string to a human-readable datetime format
 * Output: "YYYY-MM-DD HH:mm:ss.mmm"
 */
export function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format a timestamp (Date or string) to ISO-like format without timezone
 * Output: "YYYY-MM-DD HH:mm:ss.mmm"
 */
export function formatTimestamp(date: Date | string | undefined): string {
  if (!date) return 'Unknown time';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return typeof date === 'string' ? date : 'Unknown time';
    return d.toISOString().replace('T', ' ').replace('Z', '');
  } catch {
    return typeof date === 'string' ? date : 'Unknown time';
  }
}

/**
 * Get relative time string (e.g., "2 hours ago", "5 minutes ago")
 */
export function getRelativeTime(date: Date | string): string {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    }
    if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    }
    if (diffSeconds > 0) {
      return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`;
    }
    return 'just now';
  } catch {
    return '';
  }
}
