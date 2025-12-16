/**
 * Required program type definitions
 *
 * Types for managing external programs required by services.
 * Matches Rust types in src-tauri/src/types/required_program.rs
 */

/** A program required by one or more services */
export interface RequiredProgramDef {
  /** Stable identifier used in service definitions (e.g. "bleachbit") */
  id: string;
  /** Display name */
  name: string;
  /** Brief description */
  description: string;
  /** Expected executable filename(s) to search for */
  exeNames: string[];
  /** Download/info URL (optional) */
  url?: string;
}

/** Status of a required program */
export interface RequiredProgramStatus {
  /** Program definition */
  definition: RequiredProgramDef;
  /** Whether the program was found */
  found: boolean;
  /** Detected or configured path (if found) */
  path?: string;
  /** Whether using a custom path override */
  isCustom: boolean;
}
