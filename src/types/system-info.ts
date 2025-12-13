/**
 * System Information Types
 * 
 * TypeScript interfaces matching Rust structs for system data.
 * Designed to be extensible for future system info additions.
 */

/**
 * Operating system information
 */
export interface OsInfo {
  /** OS name (e.g., "Windows") */
  name: string | null;
  /** Kernel version */
  kernelVersion: string | null;
  /** OS version (e.g., "10.0.22631") */
  osVersion: string | null;
  /** Long OS version with build info */
  longOsVersion: string | null;
  /** Computer hostname */
  hostname: string | null;
}

/**
 * CPU/Processor information
 */
export interface CpuInfo {
  /** CPU brand string (e.g., "AMD Ryzen 9 5900X") */
  brand: string;
  /** Vendor ID (e.g., "AuthenticAMD", "GenuineIntel") */
  vendorId: string;
  /** Number of physical cores */
  physicalCores: number | null;
  /** Number of logical CPUs (threads) */
  logicalCpus: number;
  /** CPU frequency in MHz */
  frequencyMhz: number;
  /** Global CPU usage percentage (0-100) */
  globalUsage: number;
}

/**
 * Memory (RAM/Swap) information
 */
export interface MemoryInfo {
  /** Total RAM in bytes */
  totalMemory: number;
  /** Used RAM in bytes */
  usedMemory: number;
  /** Available RAM in bytes */
  availableMemory: number;
  /** Total swap in bytes */
  totalSwap: number;
  /** Used swap in bytes */
  usedSwap: number;
}

/**
 * Disk/Storage information
 */
export interface DiskInfo {
  /** Disk name/label */
  name: string;
  /** Mount point (e.g., "C:\\") */
  mountPoint: string;
  /** Total space in bytes */
  totalSpace: number;
  /** Available space in bytes */
  availableSpace: number;
  /** File system type (e.g., "NTFS") */
  fileSystem: string;
  /** Disk type (SSD, HDD, etc.) */
  diskType: string;
  /** Is removable media */
  isRemovable: boolean;
}

/**
 * Motherboard information
 */
export interface MotherboardInfo {
  /** Motherboard model name */
  name: string | null;
  /** Manufacturer/vendor name */
  vendor: string | null;
  /** Version/revision */
  version: string | null;
  /** Serial number */
  serialNumber: string | null;
}

/**
 * GPU/Graphics card information
 */
export interface GpuInfo {
  /** GPU vendor (e.g., "NVIDIA", "AMD", "Intel") */
  vendor: string;
  /** GPU model name */
  model: string;
  /** GPU family/architecture */
  family: string;
  /** Device ID */
  deviceId: number;
  /** Total VRAM in bytes */
  totalVram: number;
  /** Used VRAM in bytes */
  usedVram: number;
  /** GPU load percentage (0-100) */
  loadPct: number;
  /** Temperature in millicelsius (divide by 1000 for °C) */
  temperature: number;
}

/**
 * Battery information
 */
export interface BatteryInfo {
  /** State of charge (0.0 - 1.0) */
  stateOfCharge: number;
  /** Current energy in watt-hours */
  energyWh: number;
  /** Full charge energy in watt-hours */
  energyFullWh: number;
  /** Design capacity in watt-hours */
  energyFullDesignWh: number;
  /** Power draw/charge rate in watts */
  powerRateW: number;
  /** Voltage in volts */
  voltage: number;
  /** State of health (0.0 - 1.0) */
  stateOfHealth: number;
  /** Current state: "Charging", "Discharging", "Full", "Empty", "Unknown" */
  state: string;
  /** Battery technology */
  technology: string;
  /** Temperature in Celsius (if available) */
  temperature: number | null;
  /** Cycle count (if available) */
  cycleCount: number | null;
  /** Vendor name */
  vendor: string | null;
  /** Model name */
  model: string | null;
  /** Time to full in seconds (if charging) */
  timeToFullSecs: number | null;
  /** Time to empty in seconds (if discharging) */
  timeToEmptySecs: number | null;
}

/**
 * Temperature sensor/component information
 */
export interface ComponentInfo {
  /** Component label/name */
  label: string;
  /** Current temperature in Celsius */
  temperature: number | null;
  /** Maximum recorded temperature in Celsius */
  maxTemperature: number | null;
  /** Critical temperature threshold in Celsius */
  criticalTemperature: number | null;
  /** Component identifier */
  id: string | null;
}

/**
 * System load average information
 */
export interface LoadAvgInfo {
  /** Average load within one minute */
  one: number;
  /** Average load within five minutes */
  five: number;
  /** Average load within fifteen minutes */
  fifteen: number;
}

/**
 * Network interface information
 */
export interface NetworkInfo {
  /** Interface name (e.g., "eth0", "Wi-Fi") */
  name: string;
  /** MAC address */
  macAddress: string;
  /** Bytes received since last refresh */
  received: number;
  /** Total bytes received */
  totalReceived: number;
  /** Bytes transmitted since last refresh */
  transmitted: number;
  /** Total bytes transmitted */
  totalTransmitted: number;
  /** Packets received since last refresh */
  packetsReceived: number;
  /** Packets transmitted since last refresh */
  packetsTransmitted: number;
  /** Receive errors since last refresh */
  errorsReceived: number;
  /** Transmit errors since last refresh */
  errorsTransmitted: number;
}

/**
 * System user information
 */
export interface UserInfo {
  /** Username */
  name: string;
  /** User groups */
  groups: string[];
}

/**
 * Complete system information response
 */
export interface SystemInfo {
  /** Operating system details */
  os: OsInfo;
  /** CPU/processor details */
  cpu: CpuInfo;
  /** Memory (RAM/swap) details */
  memory: MemoryInfo;
  /** List of all disks */
  disks: DiskInfo[];
  /** Motherboard details (may be null if unavailable) */
  motherboard: MotherboardInfo | null;
  /** GPU details (may be null if unavailable) */
  gpu: GpuInfo | null;
  /** List of all batteries */
  batteries: BatteryInfo[];
  /** Temperature sensors */
  components: ComponentInfo[];
  /** System load average */
  loadAvg: LoadAvgInfo;
  /** Network interfaces */
  networks: NetworkInfo[];
  /** System users */
  users: UserInfo[];
  /** System uptime in seconds */
  uptimeSeconds: number;
  /** Boot time as Unix timestamp */
  bootTime: number;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format uptime seconds to human-readable string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

/**
 * Calculate percentage
 */
export function calculatePercentage(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}
