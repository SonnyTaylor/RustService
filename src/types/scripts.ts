/**
 * Script type definitions
 *
 * Types for managing PowerShell and CMD scripts.
 */

/**
 * Script interpreter type
 */
export type ScriptType = 'powershell' | 'cmd';

/**
 * Represents a saved script managed by RustService
 */
export interface Script {
  /** Unique identifier for the script */
  id: string;
  /** Display name */
  name: string;
  /** Description of what the script does */
  description: string;
  /** Type of script interpreter */
  scriptType: ScriptType;
  /** The actual script content/code */
  content: string;
  /** Whether this script should run with admin privileges */
  runAsAdmin: boolean;
  /** Number of times this script has been executed */
  runCount: number;
  /** When the script was added (ISO string) */
  createdAt: string;
  /** Last time the script was executed (ISO string) */
  lastRun: string | null;
}

/**
 * Sort options for scripts list
 */
export type ScriptSortOption =
  | 'name-asc'
  | 'name-desc'
  | 'most-used'
  | 'recently-added'
  | 'recently-run';

/**
 * Sort option configuration
 */
export interface ScriptSortConfig {
  value: ScriptSortOption;
  label: string;
}

/**
 * Available sort options
 */
export const SCRIPT_SORT_OPTIONS: ScriptSortConfig[] = [
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
  { value: 'most-used', label: 'Most Used' },
  { value: 'recently-added', label: 'Recently Added' },
  { value: 'recently-run', label: 'Recently Run' },
];

/**
 * Script type display configuration
 */
export const SCRIPT_TYPE_OPTIONS: { value: ScriptType; label: string; description: string }[] = [
  { value: 'powershell', label: 'PowerShell', description: 'Windows PowerShell script' },
  { value: 'cmd', label: 'CMD', description: 'Command Prompt batch script' },
];
