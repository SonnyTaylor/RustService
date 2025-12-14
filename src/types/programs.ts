/**
 * Program type definitions
 * 
 * Types for managing portable programs in the data folder.
 */

/**
 * Represents a portable program managed by RustService
 */
export interface Program {
  /** Unique identifier for the program */
  id: string;
  /** Display name */
  name: string;
  /** Description of what the program does */
  description: string;
  /** Version string (user-provided) */
  version: string;
  /** Absolute path to the executable */
  exePath: string;
  /** Path to extracted/custom icon (relative to data folder) */
  iconPath: string | null;
  /** Whether this is a CLI-only tool (cannot be launched from GUI) */
  isCli: boolean;
  /** Number of times this program has been launched */
  launchCount: number;
  /** When the program was added (ISO string) */
  createdAt: string;
  /** Last time the program was launched (ISO string) */
  lastLaunched: string | null;
}

/**
 * Sort options for programs list
 */
export type ProgramSortOption = 
  | 'name-asc' 
  | 'name-desc' 
  | 'most-used' 
  | 'recently-added' 
  | 'recently-launched';

/**
 * Sort option configuration
 */
export interface ProgramSortConfig {
  value: ProgramSortOption;
  label: string;
}

/**
 * Available sort options
 */
export const PROGRAM_SORT_OPTIONS: ProgramSortConfig[] = [
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'most-used', label: 'Most Used' },
  { value: 'recently-added', label: 'Recently Added' },
  { value: 'recently-launched', label: 'Recently Launched' },
];
