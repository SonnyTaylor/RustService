/**
 * Helper functions for the Programs page
 */

import type { Program, ProgramSortOption } from '@/types/programs';

export { fuzzyMatch } from '@/lib/search-utils';

/**
 * Sort programs based on selected option
 */
export function sortPrograms(programs: Program[], sortBy: ProgramSortOption): Program[] {
  const sorted = [...programs];

  switch (sortBy) {
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'most-used':
      return sorted.sort((a, b) => b.launchCount - a.launchCount);
    case 'recently-added':
      return sorted.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'recently-launched':
      return sorted.sort((a, b) => {
        if (!a.lastLaunched && !b.lastLaunched) return 0;
        if (!a.lastLaunched) return 1;
        if (!b.lastLaunched) return -1;
        return new Date(b.lastLaunched).getTime() - new Date(a.lastLaunched).getTime();
      });
    default:
      return sorted;
  }
}
