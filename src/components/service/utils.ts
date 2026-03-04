/**
 * Service Component Utilities
 *
 * Shared icon mapping, formatters, and constants used across
 * the service page sub-components.
 */

import {
  Wrench,
  Stethoscope,
  ShieldCheck,
  Settings2,
  Wifi,
  HardDrive,
  Gauge,
  BatteryFull,
  ShieldAlert,
  Sparkles,
  MonitorCheck,
  Activity,
  Download,
  Network,
  Trash2,
  Usb,
  Weight,
  PackageCheck,
  FileSearch,
  CloudDownload,
  Zap,
  BatteryCharging,
  PackageSearch,
  Globe,
} from 'lucide-react';

// =============================================================================
// Icon Mapping
// =============================================================================

export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  stethoscope: Stethoscope,
  wrench: Wrench,
  'shield-check': ShieldCheck,
  'settings-2': Settings2,
  wifi: Wifi,
  'hard-drive': HardDrive,
  gauge: Gauge,
  'battery-full': BatteryFull,
  'shield-alert': ShieldAlert,
  sparkles: Sparkles,
  'monitor-check': MonitorCheck,
  activity: Activity,
  download: Download,
  network: Network,
  'trash-2': Trash2,
  usb: Usb,
  weight: Weight,
  'package-check': PackageCheck,
  'file-scan': FileSearch,
  'cloud-download': CloudDownload,
  zap: Zap,
  'battery-charging': BatteryCharging,
  'package-search': PackageSearch,
  globe: Globe,
};

export function getIcon(iconName: string) {
  return ICON_MAP[iconName] || Wrench;
}

// =============================================================================
// Formatters
// =============================================================================

/** Format milliseconds into a human-readable duration string */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// =============================================================================
// Preset Gradients
// =============================================================================

export const PRESET_GRADIENTS: Record<string, { from: string; to: string; accent: string; bullet: string }> = {
  diagnostics: { from: 'from-blue-500/20', to: 'to-cyan-500/10', accent: 'text-blue-500', bullet: 'bg-blue-500' },
  general: { from: 'from-emerald-500/20', to: 'to-green-500/10', accent: 'text-emerald-500', bullet: 'bg-emerald-500' },
  complete: { from: 'from-violet-500/20', to: 'to-purple-500/10', accent: 'text-violet-500', bullet: 'bg-violet-500' },
  custom: { from: 'from-amber-500/20', to: 'to-orange-500/10', accent: 'text-amber-500', bullet: 'bg-amber-500' },
};
