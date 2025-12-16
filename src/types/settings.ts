/**
 * Application settings type definitions
 * Stored in data/settings.json
 * 
 * Settings are organized into categories for scalability.
 * Use the useSettings() hook to access settings from any component.
 */

// =============================================================================
// Theme Types
// =============================================================================

/**
 * Valid theme mode options (light/dark/system)
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Available color schemes (CSS class names applied to html element)
 * Add new schemes here and in globals.css with .theme-{name} class
 */
export type ColorScheme = 'default' | 'techbay' | 'autoservice' | 'amber-minimal' | 'amethyst-haze' | 'catppuccin' | 'supabase' | 'nature' | 'cyberpunk' | 'claude';

/**
 * Combined theme (for backwards compatibility)
 */
export type Theme = ThemeMode;

/**
 * Valid log level options
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// =============================================================================
// Color Scheme Definitions
// =============================================================================

export interface ColorSchemeInfo {
  id: ColorScheme;
  name: string;
  description: string;
  /** Preview colors for the scheme selector */
  preview: {
    primary: string;
    accent: string;
    background: string;
  };
}

/**
 * Available color schemes with metadata
 * Add new TweakCN themes here
 */
export const COLOR_SCHEMES: ColorSchemeInfo[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean monochrome theme',
    preview: {
      primary: '#1a1a1a',
      accent: '#6b7280',
      background: '#ffffff',
    },
  },
  {
    id: 'techbay',
    name: 'Techbay',
    description: 'Coral red accent theme',
    preview: {
      primary: '#ce5d5b',
      accent: '#d77c7a',
      background: '#ffffff',
    },
  },
  {
    id: 'autoservice',
    name: 'AutoService',
    description: 'Original AutoService-inspired dark UI',
    preview: {
      primary: '#4f8cff',
      accent: '#1f2430',
      background: '#0f1115',
    },
  },
  {
    id: 'amber-minimal',
    name: 'Amber Minimal',
    description: 'Warm amber accent theme',
    preview: {
      primary: '#f59e0b',
      accent: '#d97706',
      background: '#ffffff',
    },
  },
  {
    id: 'amethyst-haze',
    name: 'Amethyst Haze',
    description: 'Soft purple tones',
    preview: {
      primary: '#8a79ab',
      accent: '#e6a5b8',
      background: '#f8f7fa',
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    description: 'Pastel color palette',
    preview: {
      primary: '#8839ef',
      accent: '#04a5e5',
      background: '#eff1f5',
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Green developer theme',
    preview: {
      primary: '#72e3ad',
      accent: '#3b82f6',
      background: '#fcfcfc',
    },
  },
  {
    id: 'nature',
    name: 'Nature',
    description: 'Earthy green tones',
    preview: {
      primary: '#2e7d32',
      accent: '#c8e6c9',
      background: '#f8f5f0',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon pink and cyan',
    preview: {
      primary: '#ff00c8',
      accent: '#00ffcc',
      background: '#f8f9fa',
    },
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Warm terracotta theme',
    preview: {
      primary: '#c96442',
      accent: '#e9e6dc',
      background: '#faf9f5',
    },
  },
];

// =============================================================================
// Category Interfaces
// =============================================================================

/**
 * Appearance settings for theming and visual preferences
 */
export interface AppearanceSettings {
  /** User's theme mode preference (light/dark/system) */
  theme: ThemeMode;
  /** Color scheme (applied as CSS class) */
  colorScheme: ColorScheme;
  /** Whether animations are enabled */
  enableAnimations: boolean;
}

/**
 * Data and storage related settings
 */
export interface DataSettings {
  /** Logging verbosity level */
  logLevel: LogLevel;
}

/**
 * Report-related settings
 */
export interface ReportsSettings {
  /** Whether to automatically save reports when services complete */
  autoSaveReports: boolean;
  /** Number of days to retain reports (0 = keep forever) */
  reportRetentionDays: number;
  /** Whether to include detailed logs in saved reports */
  includeLogsInReport: boolean;
}

/**
 * Business branding and technician settings
 */
export interface BusinessSettings {
  /** Whether business mode is enabled */
  enabled: boolean;
  /** Business name */
  name: string;
  /** Business logo path (relative to data dir) */
  logoPath?: string;
  /** Street address */
  address: string;
  /** Phone number */
  phone: string;
  /** Email address */
  email: string;
  /** Website URL */
  website: string;
  /** Tax File Number (Australian) */
  tfn: string;
  /** Australian Business Number */
  abn: string;
  /** List of technician names */
  technicians: string[];
}

/**
 * Required program path overrides
 */
export interface ProgramsSettings {
  /** Custom path overrides for required programs (keyed by program ID) */
  overrides: Record<string, string>;
}

/**
 * A single technician tab configuration
 */
export interface TechnicianTab {
  /** Unique identifier for the tab */
  id: string;
  /** Display name shown in the tab bar */
  name: string;
  /** URL to load in the iframe */
  url: string;
  /** Icon to display (preset icon name, or undefined for auto-favicon) */
  icon?: string;
}

/**
 * Available preset icons for technician tabs
 */
export const TECHNICIAN_TAB_ICONS = [
  { id: 'globe', name: 'Globe', description: 'Default web icon' },
  { id: 'file-text', name: 'Document', description: 'Documentation or files' },
  { id: 'folder', name: 'Folder', description: 'File management' },
  { id: 'database', name: 'Database', description: 'Data or storage' },
  { id: 'mail', name: 'Mail', description: 'Email or messaging' },
  { id: 'calendar', name: 'Calendar', description: 'Scheduling or dates' },
  { id: 'settings', name: 'Settings', description: 'Configuration' },
  { id: 'user', name: 'User', description: 'Account or profile' },
  { id: 'shopping-cart', name: 'Cart', description: 'Shopping or orders' },
  { id: 'credit-card', name: 'Payment', description: 'Billing or payments' },
  { id: 'bar-chart', name: 'Analytics', description: 'Charts or stats' },
  { id: 'code', name: 'Code', description: 'Development tools' },
  { id: 'terminal', name: 'Terminal', description: 'Console or CLI' },
  { id: 'cloud', name: 'Cloud', description: 'Cloud services' },
  { id: 'lock', name: 'Security', description: 'Security or auth' },
  { id: 'tool', name: 'Tools', description: 'Utilities' },
  { id: 'wrench', name: 'Wrench', description: 'Repair or maintenance' },
  { id: 'monitor', name: 'Monitor', description: 'Display or screen' },
  { id: 'smartphone', name: 'Phone', description: 'Mobile' },
  { id: 'headphones', name: 'Support', description: 'Help or support' },
] as const;

export type TechnicianTabIconId = typeof TECHNICIAN_TAB_ICONS[number]['id'];

/**
 * Technician tabs settings
 */
export interface TechnicianTabsSettings {
  /** List of custom technician tabs */
  tabs: TechnicianTab[];
  /** Whether to use website favicons for tab icons (when no icon is set) */
  useFavicons: boolean;
}

import type { ServicePreset } from './service';

/**
 * Service presets settings (custom presets)
 */
export interface PresetsSettings {
  /** Custom service presets created or modified by the user */
  customPresets: ServicePreset[];
}

// =============================================================================
// Main Settings Interface
// =============================================================================

/**
 * Main application settings interface
 * 
 * @example
 * ```typescript
 * const { settings } = useSettings();
 * console.log(settings.appearance.theme); // 'system'
 * console.log(settings.appearance.colorScheme); // 'techbay'
 * ```
 */
export interface AppSettings {
  /** Settings schema version for migration */
  version: string;
  /** Appearance settings (theme, colors) */
  appearance: AppearanceSettings;
  /** Data and storage settings */
  data: DataSettings;
  /** Report-related settings */
  reports: ReportsSettings;
  /** Business branding and technician settings */
  business: BusinessSettings;
  /** Required program path overrides */
  programs: ProgramsSettings;
  /** Custom technician tabs for embedding external websites */
  technicianTabs: TechnicianTabsSettings;
  /** Custom service presets */
  presets: PresetsSettings;
}

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default appearance settings
 */
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'system',
  colorScheme: 'default',
  enableAnimations: true,
};

/**
 * Default data settings
 */
export const DEFAULT_DATA: DataSettings = {
  logLevel: 'info',
};

/**
 * Default reports settings
 */
export const DEFAULT_REPORTS: ReportsSettings = {
  autoSaveReports: true,
  reportRetentionDays: 0,
  includeLogsInReport: true,
};

/**
 * Default business settings (disabled by default)
 */
export const DEFAULT_BUSINESS: BusinessSettings = {
  enabled: false,
  name: '',
  logoPath: undefined,
  address: '',
  phone: '',
  email: '',
  website: '',
  tfn: '',
  abn: '',
  technicians: [],
};

/**
 * Default programs settings
 */
export const DEFAULT_PROGRAMS: ProgramsSettings = {
  overrides: {},
};

/**
 * Default technician tabs settings
 */
export const DEFAULT_TECHNICIAN_TABS: TechnicianTabsSettings = {
  tabs: [],
  useFavicons: true,
};

/**
 * Default presets settings
 */
export const DEFAULT_PRESETS: PresetsSettings = {
  customPresets: [],
};

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: '0.7.0',
  appearance: DEFAULT_APPEARANCE,
  data: DEFAULT_DATA,
  reports: DEFAULT_REPORTS,
  business: DEFAULT_BUSINESS,
  programs: DEFAULT_PROGRAMS,
  technicianTabs: DEFAULT_TECHNICIAN_TABS,
  presets: DEFAULT_PRESETS,
};

// =============================================================================
// Settings Key Types (for update_setting command)
// =============================================================================

/**
 * Valid setting key paths for the update_setting command
 */
export type SettingKey =
  | 'appearance.theme'
  | 'appearance.colorScheme'
  | 'appearance.enableAnimations'
  | 'data.logLevel'
  | 'reports.autoSaveReports'
  | 'reports.reportRetentionDays'
  | 'reports.includeLogsInReport'
  | 'business.enabled'
  | 'business.name'
  | 'business.logoPath'
  | 'business.address'
  | 'business.phone'
  | 'business.email'
  | 'business.website'
  | 'business.tfn'
  | 'business.abn'
  | 'business.technicians'
  | 'technicianTabs.tabs'
  | 'technicianTabs.useFavicons'
  | 'presets.customPresets';

/**
 * Type-safe mapping of setting keys to their value types
 */
export type SettingValueType<K extends SettingKey> =
  K extends 'appearance.theme' ? ThemeMode :
  K extends 'appearance.colorScheme' ? ColorScheme :
  K extends 'appearance.enableAnimations' ? boolean :
  K extends 'data.logLevel' ? LogLevel :
  K extends 'reports.autoSaveReports' ? boolean :
  K extends 'reports.reportRetentionDays' ? number :
  K extends 'reports.includeLogsInReport' ? boolean :
  K extends 'business.enabled' ? boolean :
  K extends 'business.name' ? string :
  K extends 'business.logoPath' ? string | undefined :
  K extends 'business.address' ? string :
  K extends 'business.phone' ? string :
  K extends 'business.email' ? string :
  K extends 'business.website' ? string :
  K extends 'business.tfn' ? string :
  K extends 'business.abn' ? string :
  K extends 'business.technicians' ? string[] :
  K extends 'technicianTabs.tabs' ? TechnicianTab[] :
  K extends 'technicianTabs.useFavicons' ? boolean :
  K extends 'presets.customPresets' ? ServicePreset[] :
  never;

/**
 * Settings category IDs for sidebar navigation
 */
export type SettingsCategory = 'appearance' | 'data' | 'reports' | 'business' | 'programs' | 'technicianTabs' | 'servicePresets' | 'serviceMetrics' | 'about';

