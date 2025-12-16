/**
 * Startup Manager Types
 * 
 * TypeScript interfaces for startup program management.
 */

/** Source location of a startup item */
export type StartupSource = 
  | 'registryCurrentUser'
  | 'registryLocalMachine'
  | 'startupFolderUser'
  | 'startupFolderAllUsers'
  | 'taskScheduler';

/** Startup impact level */
export type StartupImpact = 'high' | 'medium' | 'low' | 'unknown';

/** Startup item information */
export interface StartupItem {
  id: string;
  name: string;
  command: string;
  path: string | null;
  source: StartupSource;
  sourceLocation: string;
  enabled: boolean;
  publisher: string | null;
  description: string | null;
  impact: StartupImpact;
}

/** Get human-readable source name */
export function getSourceDisplayName(source: StartupSource): string {
  switch (source) {
    case 'registryCurrentUser':
      return 'Registry (User)';
    case 'registryLocalMachine':
      return 'Registry (System)';
    case 'startupFolderUser':
      return 'Startup Folder (User)';
    case 'startupFolderAllUsers':
      return 'Startup Folder (All Users)';
    case 'taskScheduler':
      return 'Task Scheduler';
    default:
      return 'Unknown';
  }
}

/** Get impact badge color */
export function getImpactColor(impact: StartupImpact): string {
  switch (impact) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'outline';
  }
}
