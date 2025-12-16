/**
 * Service Time Tracking Types (Enhanced)
 * 
 * TypeScript interfaces for service execution time tracking,
 * PC fingerprinting, and statistical analysis.
 * 
 * Features:
 * - Extended PC specs (AVX2, GPU, power, network, CPU load)
 * - Ridge regression with Z-score normalization
 * - Time decay weighting for recency bias
 */

// =============================================================================
// Network Type
// =============================================================================

export type NetworkType = 'ethernet' | 'wifi' | 'cellular' | 'unknown';

export function getNetworkTypeLabel(type: NetworkType): string {
  switch (type) {
    case 'ethernet': return 'Ethernet';
    case 'wifi': return 'Wi-Fi';
    case 'cellular': return 'Cellular';
    default: return 'Unknown';
  }
}

// =============================================================================
// PC Fingerprint (Enhanced)
// =============================================================================

/**
 * Extended PC specifications for correlating with execution times
 */
export interface PcFingerprint {
  // Core Specs
  /** Physical core count */
  physicalCores: number;
  /** Logical core count (includes hyperthreading) */
  logicalCores: number;
  /** CPU frequency in GHz */
  frequencyGhz: number;
  /** Computed CPU score: (physical + (logical-physical)*0.3) * frequency */
  cpuScore: number;
  /** Available RAM in GB */
  availableRamGb: number;
  /** Total RAM in GB */
  totalRamGb: number;
  /** Whether the primary disk is SSD */
  diskIsSsd: boolean;

  // Extended Specs
  /** Is the system plugged in (AC power)? */
  isOnAcPower: boolean;
  /** Does the CPU support AVX2 (modern architecture proxy)? */
  hasAvx2: boolean;
  /** Is there a discrete GPU (NVIDIA/AMD)? */
  hasDiscreteGpu: boolean;
  /** Network connection type */
  networkType: NetworkType;
  /** Current CPU load percentage at time of capture (0-100) */
  cpuLoadPercent: number;
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
  /** Hash of service options (for settings-aware tracking) */
  optionsHash?: string;
}

// =============================================================================
// Regression Model
// =============================================================================

/**
 * Feature normalization statistics (mean/std for Z-score)
 */
export interface FeatureNormalization {
  means: number[];
  stdDevs: number[];
}

/**
 * Trained Ridge regression weights for a service
 */
export interface ServiceModelWeights {
  /** Y-intercept (base time in ms) */
  intercept: number;
  /** Feature coefficients */
  coefficients: number[];
  /** Number of samples used to train */
  sampleCount: number;
  /** Normalization stats for Z-score */
  normalization: FeatureNormalization;
  /** Ridge regularization lambda used */
  ridgeLambda: number;
  /** R-squared score (model quality, 0-1) */
  rSquared: number;
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
  /** Average duration (outlier-filtered + time-decay weighted), ms */
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
  /** Model quality score (R-squared, if available) */
  modelQuality?: number;
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
  /** Samples since last retrain (per service) */
  samplesSinceRetrain: Record<string, number>;
  /** Batch size for retraining */
  retrainBatchSize: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format milliseconds to human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
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

/**
 * Format model quality as percentage
 */
export function formatModelQuality(rSquared: number): string {
  return `${(rSquared * 100).toFixed(0)}%`;
}

/**
 * Get model quality color
 */
export function getModelQualityColor(rSquared: number): string {
  if (rSquared >= 0.7) return 'text-green-500';
  if (rSquared >= 0.4) return 'text-yellow-500';
  return 'text-orange-500';
}
