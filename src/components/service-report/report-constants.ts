/**
 * Service Report Constants
 *
 * Icon maps, color maps, and other constant definitions
 * used across service report components.
 */

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
} from 'lucide-react';

import type { FindingSeverity } from '@/types/service';

/** Maps finding severity to its display icon */
export const severityIcons: Record<FindingSeverity, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  critical: XCircle,
};

/** Maps finding severity to Tailwind color classes */
export const severityColors: Record<FindingSeverity, string> = {
  info: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  success: 'text-green-500 bg-green-500/10 border-green-500/20',
  warning: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  error: 'text-red-500 bg-red-500/10 border-red-500/20',
  critical: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
};

/** Category display labels for report groupings */
export const categoryLabels: Record<string, string> = {
  diagnostics: 'Diagnostics',
  cleanup: 'Cleanup',
  security: 'Security',
  maintenance: 'Maintenance',
  other: 'Other',
};
