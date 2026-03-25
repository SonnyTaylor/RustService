/**
 * Event Log helper components and formatters
 *
 * Small presentational components and pure formatting functions
 * used by the EventLogPage.
 */

import {
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
} from 'lucide-react';

/** Level icon component */
export function LevelIcon({ level }: { level: string }) {
  const l = level.toLowerCase();
  if (l === 'critical')
    return <XCircle className="h-4 w-4 text-red-600" />;
  if (l === 'error')
    return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (l === 'warning')
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  if (l === 'information')
    return <Info className="h-4 w-4 text-blue-500" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

/** Format an ISO timestamp as a locale string */
export function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

/** Compute ISO start time from a time range option */
export function computeStartTime(range: string): string | undefined {
  if (range === 'all') return undefined;
  const now = new Date();
  switch (range) {
    case '1h':
      return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
    default:
      return undefined;
  }
}
