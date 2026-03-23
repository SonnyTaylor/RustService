// ============================================================================
// Disk Health & Restore Point Types
// ============================================================================

export interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  rawValue: string;
}

export interface DiskHealthInfo {
  device: string;
  model: string;
  serial: string;
  firmware: string;
  healthPassed: boolean;
  temperatureC: number | null;
  powerOnHours: number | null;
  reallocatedSectors: number | null;
  pendingSectors: number | null;
  crcErrors: number | null;
  wearLevelingPct: number | null;
  attributes: SmartAttribute[];
}

export interface DiskHealthResponse {
  disks: DiskHealthInfo[];
  smartctlFound: boolean;
  error: string | null;
}

export interface RestorePoint {
  sequenceNumber: number;
  description: string;
  creationTime: string;
  restoreType: string;
}

export interface RestorePointsResponse {
  restorePoints: RestorePoint[];
  error: string | null;
}
