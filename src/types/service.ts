/**
 * Service system type definitions
 *
 * Types for the modular service automation system.
 * Matches Rust types in src-tauri/src/types/service.rs
 */

// =============================================================================
// Service Identification
// =============================================================================

/** Unique identifier for a service */
export type ServiceId = string;

/** Unique identifier for a service run/report */
export type ReportId = string;

// =============================================================================
// Service Definitions
// =============================================================================

/** Option for select-type service options */
export interface SelectOption {
  value: string;
  label: string;
}

/** Schema for a service option field */
export interface ServiceOptionSchema {
  /** Option identifier */
  id: string;
  /** Display label */
  label: string;
  /** Option type: "number", "string", "boolean", "select" */
  optionType: 'number' | 'string' | 'boolean' | 'select';
  /** Default value */
  defaultValue: unknown;
  /** For number type: minimum value */
  min?: number;
  /** For number type: maximum value */
  max?: number;
  /** For select type: available options */
  options?: SelectOption[];
  /** Help text for the option */
  description?: string;
}

/** Definition of a service that can be run */
export interface ServiceDefinition {
  /** Unique service identifier */
  id: ServiceId;
  /** Display name */
  name: string;
  /** Description of what the service does */
  description: string;
  /** Category for grouping (e.g., "diagnostics", "cleanup", "security") */
  category: string;
  /** Estimated duration in seconds (for progress estimation) */
  estimatedDurationSecs: number;
  /** Program IDs required to run this service (from programs.json) */
  requiredPrograms: string[];
  /** Configurable options for this service */
  options: ServiceOptionSchema[];
  /** Icon name (lucide icon identifier) */
  icon: string;
}

// =============================================================================
// Service Presets
// =============================================================================

/** Service configuration within a preset */
export interface PresetServiceConfig {
  /** Service ID */
  serviceId: ServiceId;
  /** Whether enabled by default in this preset */
  enabled: boolean;
  /** Default options for this service in the preset */
  options: Record<string, unknown>;
}

/** A preset configuration of services */
export interface ServicePreset {
  /** Preset identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Services included in this preset (with default options) */
  services: PresetServiceConfig[];
  /** Icon name */
  icon: string;
  /** Accent color for the card */
  color: string;
}

// =============================================================================
// Service Queue
// =============================================================================

/** An item in the service run queue */
export interface ServiceQueueItem {
  /** Service ID */
  serviceId: ServiceId;
  /** Whether this service is enabled for the run */
  enabled: boolean;
  /** Order in the queue (0-indexed) */
  order: number;
  /** User-configured options */
  options: Record<string, unknown>;
}

// =============================================================================
// Service Results
// =============================================================================

/** Severity level for a finding */
export type FindingSeverity = 'info' | 'success' | 'warning' | 'error' | 'critical';

/** A single finding from a service */
export interface ServiceFinding {
  /** Severity level */
  severity: FindingSeverity;
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Recommended action (if any) */
  recommendation?: string;
  /** Raw data (for technical details) */
  data?: unknown;
}

/** Result of running a single service */
export interface ServiceResult {
  /** Service ID that was run */
  serviceId: ServiceId;
  /** Whether the service completed successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Findings from the service */
  findings: ServiceFinding[];
  /** Log output from the service */
  logs: string[];
}

/** Status of a service run */
export type ServiceRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A complete service run report */
export interface ServiceReport {
  /** Unique report ID */
  id: ReportId;
  /** When the run started (ISO string) */
  startedAt: string;
  /** When the run completed (ISO string, null if still running) */
  completedAt?: string;
  /** Overall status */
  status: ServiceRunStatus;
  /** Total duration in milliseconds */
  totalDurationMs?: number;
  /** Queue that was run */
  queue: ServiceQueueItem[];
  /** Results for each service */
  results: ServiceResult[];
  /** Index of currently running service (for progress) */
  currentServiceIndex?: number;
}

// =============================================================================
// Service Run State
// =============================================================================

/** Global service run state */
export interface ServiceRunState {
  /** Whether a service run is currently active */
  isRunning: boolean;
  /** Current report being generated */
  currentReport?: ServiceReport;
}

// =============================================================================
// UI State
// =============================================================================

/** Current phase of the service page */
export type ServicePhase = 'presets' | 'queue' | 'running' | 'results';

/** Service page state */
export interface ServicePageState {
  /** Current phase */
  phase: ServicePhase;
  /** Selected preset (if any) */
  selectedPreset?: ServicePreset;
  /** Current queue */
  queue: ServiceQueueItem[];
  /** Current or last report */
  report?: ServiceReport;
}

// =============================================================================
// Constants
// =============================================================================

/** Map of severity to display info */
export const SEVERITY_INFO: Record<FindingSeverity, { label: string; color: string }> = {
  info: { label: 'Info', color: 'blue' },
  success: { label: 'Success', color: 'green' },
  warning: { label: 'Warning', color: 'yellow' },
  error: { label: 'Error', color: 'red' },
  critical: { label: 'Critical', color: 'purple' },
};

/** Map of run status to display info */
export const STATUS_INFO: Record<ServiceRunStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'gray' },
  running: { label: 'Running', color: 'blue' },
  completed: { label: 'Completed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'yellow' },
};
