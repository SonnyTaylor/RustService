/**
 * Bluescreen (BSOD) Analysis Types
 * 
 * TypeScript interfaces for crash dump analysis.
 */

/** Summary of a BSOD crash */
export interface BsodEntry {
  id: string;
  dumpPath: string;
  crashTime: string;
  stopCode: string;
  stopCodeName: string | null;
  faultingModule: string | null;
  bugCheckCode: string;
  parameters: string[];
  fileSizeBytes: number;
}

/** Detailed BSOD analysis */
export interface BsodDetails {
  dumpPath: string;
  dumpType: string;
  crashTime: string;
  uptimeBeforeCrash: string | null;
  stopCode: string;
  stopCodeName: string | null;
  stopCodeDescription: string | null;
  bugCheckCode: string;
  parameters: string[];
  faultingModule: string | null;
  faultingModulePath: string | null;
  stackTrace: string[];
  loadedModules: string[];
  possibleCauses: string[];
  recommendations: string[];
}

/** BSOD statistics */
export interface BsodStats {
  totalCrashes: number;
  crashesLast7Days: number;
  crashesLast30Days: number;
  mostCommonStopCode: string | null;
  mostCommonModule: string | null;
  oldestCrash: string | null;
  newestCrash: string | null;
}

/** Format crash timestamp for display */
export function formatCrashTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

/** Format file size for display */
export function formatDumpSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get severity color based on crash frequency */
export function getCrashFrequencyColor(crashes7d: number): string {
  if (crashes7d >= 3) return 'destructive';
  if (crashes7d >= 1) return 'default';
  return 'secondary';
}

/** Common stop code categories */
export const STOP_CODE_CATEGORIES = {
  driver: ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'DRIVER_POWER_STATE_FAILURE', 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED'],
  memory: ['PAGE_FAULT_IN_NONPAGED_AREA', 'MEMORY_MANAGEMENT', 'PFN_LIST_CORRUPT', 'BAD_POOL_HEADER'],
  hardware: ['WHEA_UNCORRECTABLE_ERROR', 'KERNEL_DATA_INPAGE_ERROR', 'UNEXPECTED_KERNEL_MODE_TRAP'],
  graphics: ['VIDEO_TDR_FAILURE', 'VIDEO_SCHEDULER_INTERNAL_ERROR', 'VIDEO_MEMORY_MANAGEMENT_INTERNAL'],
  system: ['CRITICAL_PROCESS_DIED', 'SYSTEM_SERVICE_EXCEPTION', 'KERNEL_SECURITY_CHECK_FAILURE'],
};

/** Get stop code category */
export function getStopCodeCategory(stopCodeName: string | null): string {
  if (!stopCodeName) return 'Unknown';
  
  for (const [category, codes] of Object.entries(STOP_CODE_CATEGORIES)) {
    if (codes.some(code => stopCodeName.toUpperCase().includes(code))) {
      return category.charAt(0).toUpperCase() + category.slice(1);
    }
  }
  
  return 'Other';
}
