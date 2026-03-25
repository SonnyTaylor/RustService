/**
 * Script helper utilities
 *
 * Pure functions for sorting scripts.
 */

import type { Script, ScriptSortOption } from '@/types/scripts';

/**
 * Sort scripts based on selected option.
 * Returns a new sorted array (does not mutate the input).
 */
export function sortScripts(
  scripts: Script[],
  sortBy: ScriptSortOption
): Script[] {
  const sorted = [...scripts];

  switch (sortBy) {
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'most-used':
      return sorted.sort((a, b) => b.runCount - a.runCount);
    case 'recently-added':
      return sorted.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'recently-run':
      return sorted.sort((a, b) => {
        if (!a.lastRun && !b.lastRun) return 0;
        if (!a.lastRun) return 1;
        if (!b.lastRun) return -1;
        return (
          new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime()
        );
      });
    default:
      return sorted;
  }
}
