/**
 * Event Log Types
 * 
 * TypeScript interfaces for Windows Event Log viewing.
 */

/** Event log source/channel information */
export interface EventLogSource {
  name: string;
  displayName: string;
  recordsCount: number | null;
  logType: string;
}

/** Event severity level */
export type EventLevel = 
  | 'critical'
  | 'error'
  | 'warning'
  | 'information'
  | 'verbose'
  | 'unknown';

/** Single event log entry */
export interface EventLogEntry {
  id: number;
  recordId: number;
  timeCreated: string;
  level: EventLevel;
  levelDisplay: string;
  source: string;
  providerName: string;
  message: string;
  taskCategory: string | null;
  keywords: string[];
  computer: string;
  user: string | null;
}

/** Query filter for event logs */
export interface EventLogFilter {
  logName: string;
  level?: string; // "Error", "Warning", "Information", "All"
  startTime?: string; // ISO 8601 format
  endTime?: string;
  sourceFilter?: string;
  keywordFilter?: string;
  limit?: number;
}

/** Event log statistics */
export interface EventLogStats {
  logName: string;
  errors24h: number;
  warnings24h: number;
  errors7d: number;
  warnings7d: number;
  errors30d: number;
  warnings30d: number;
  critical24h: number;
}

/** Get row color class based on event level */
export function getLevelRowClass(level: EventLevel | string): string {
  const levelLower = level.toLowerCase();
  if (levelLower === 'critical' || levelLower === 'error') {
    return 'bg-destructive/10 border-l-2 border-l-destructive';
  }
  if (levelLower === 'warning') {
    return 'bg-yellow-500/10 border-l-2 border-l-yellow-500';
  }
  return '';
}

/** Get badge variant based on event level */
export function getLevelBadgeVariant(level: EventLevel | string): 'destructive' | 'default' | 'secondary' | 'outline' {
  const levelLower = level.toLowerCase();
  if (levelLower === 'critical' || levelLower === 'error') {
    return 'destructive';
  }
  if (levelLower === 'warning') {
    return 'default';
  }
  return 'secondary';
}

/** Format event timestamp for display */
export function formatEventTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

/** Format event timestamp as relative time */
export function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  } catch {
    return isoString;
  }
}
