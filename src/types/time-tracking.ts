/**
 * Service Time Tracking Types
 * 
 * TypeScript interfaces for service execution time tracking,
 * PC fingerprinting, and statistical analysis.
 */

// =============================================================================
// PC Fingerprint
// =============================================================================

/**
 * Normalized PC specifications for correlating with execution times
 */
export interface PcFingerprint {
  /** CPU score: physical_cores * (frequency_ghz) */
  cpuScore: number;
  /** Available RAM in GB */
  ramGb: number;
  /** Whether the primary disk is SSD */
  diskIsSsd: boolean;
  /** Total RAM in GB */
  totalRamGb: number;
}

// =============================================================================
// Time Samples
// =============================================================================

/**
 * A single recorded service execution time
 */
export interface ServiceTimeSample {
  /** Service that was run */
  serviceId: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** When this sample was recorded (ISO 8601) */
  timestamp: string;
  /** PC specs at time of execution */
  pcFingerprint: PcFingerprint;
  /** Preset ID used (if any) */
  presetId?: string;
}

// =============================================================================
// Regression Model
// =============================================================================

/**
 * Trained linear regression weights for a service
 */
export interface ServiceModelWeights {
  /** Y-intercept (base time in ms) */
  intercept: number;
  /** CPU score coefficient */
  cpuCoef: number;
  /** RAM coefficient */
  ramCoef: number;
  /** SSD bonus coefficient */
  ssdCoef: number;
  /** Number of samples used to train */
  sampleCount: number;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Aggregated statistics for a single service
 */
export interface ServiceTimeStats {
  /** Service ID */
  serviceId: string;
  /** Average duration (outlier-filtered), ms */
  averageMs: number;
  /** Minimum recorded duration, ms */
  minMs: number;
  /** Maximum recorded duration, ms */
  maxMs: number;
  /** Median duration, ms */
  medianMs: number;
  /** Number of samples */
  sampleCount: number;
  /** Standard deviation, ms */
  stdDevMs: number;
  /** Confidence level: "low", "medium", "high" */
  confidence: 'low' | 'medium' | 'high';
  /** Estimated duration for current PC (if model trained) */
  estimatedMs?: number;
}

/**
 * Aggregated statistics for a preset
 */
export interface PresetTimeStats {
  /** Preset ID */
  presetId: string;
  /** Average total duration, ms */
  averageMs: number;
  /** Minimum total duration, ms */
  minMs: number;
  /** Maximum total duration, ms */
  maxMs: number;
  /** Number of complete runs */
  runCount: number;
  /** Confidence level */
  confidence: 'low' | 'medium' | 'high';
}

// =============================================================================
// Main Metrics Structure
// =============================================================================

/**
 * Complete service time metrics data
 */
export interface ServiceTimeMetrics {
  /** Schema version */
  version: string;
  /** All recorded time samples */
  samples: ServiceTimeSample[];
  /** Trained regression models per service */
  models: Record<string, ServiceModelWeights>;
  /** Maximum samples to keep per service */
  maxSamplesPerService: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get confidence color class
 */
export function getConfidenceColor(confidence: string): string {
  switch (confidence) {
    case 'high':
      return 'text-green-500';
    case 'medium':
      return 'text-yellow-500';
    case 'low':
      return 'text-orange-500';
    default:
      return 'text-muted-foreground';
  }
}

/**
 * Get confidence badge variant
 */
export function getConfidenceBadge(confidence: string): 'default' | 'secondary' | 'outline' {
  switch (confidence) {
    case 'high':
      return 'default';
    case 'medium':
      return 'secondary';
    default:
      return 'outline';
  }
}
