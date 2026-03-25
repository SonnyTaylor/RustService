/**
 * Bluescreen page utilities
 *
 * Category styling helpers for BSOD stop codes.
 */

/** Get border color class for a stop code category */
export function getCategoryBorderClass(category: string): string {
  switch (category) {
    case 'Driver':
      return 'border-l-4 border-l-yellow-500';
    case 'Memory':
      return 'border-l-4 border-l-destructive';
    case 'Hardware':
      return 'border-l-4 border-l-orange-500';
    case 'Graphics':
      return 'border-l-4 border-l-purple-500';
    case 'System':
      return 'border-l-4 border-l-blue-500';
    default:
      return 'border-l-4 border-l-muted-foreground';
  }
}

/** Get badge variant/class for a stop code category */
export function getCategoryBadgeClass(category: string): string {
  switch (category) {
    case 'Driver':
      return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
    case 'Memory':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'Hardware':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30';
    case 'Graphics':
      return 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30';
    case 'System':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground border-muted-foreground/30';
  }
}

/** Get days since crash as a human-readable string */
export function getDaysSinceCrash(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  } catch {
    return '';
  }
}
