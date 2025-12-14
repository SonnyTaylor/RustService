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
export type ColorScheme = 'default' | 'techbay';

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
  /** Legacy: Accent color for UI elements (hex format) - deprecated, use colorScheme */
  accentColor: string;
}

/**
 * Data and storage related settings
 */
export interface DataSettings {
  /** Enable automatic settings backup */
  autoBackup: boolean;
  /** Logging verbosity level */
  logLevel: LogLevel;
}

/**
 * Application behavior settings
 */
export interface ApplicationSettings {
  /** Start the application minimized to tray */
  startMinimized: boolean;
  /** Check for updates on startup */
  checkUpdates: boolean;
  /** Confirm before closing the application */
  confirmOnExit: boolean;
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
  /** Application behavior settings */
  application: ApplicationSettings;
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
  accentColor: '#3b82f6',
};

/**
 * Default data settings
 */
export const DEFAULT_DATA: DataSettings = {
  autoBackup: false,
  logLevel: 'info',
};

/**
 * Default application settings
 */
export const DEFAULT_APPLICATION: ApplicationSettings = {
  startMinimized: false,
  checkUpdates: true,
  confirmOnExit: false,
};

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  version: '0.3.0',
  appearance: DEFAULT_APPEARANCE,
  data: DEFAULT_DATA,
  application: DEFAULT_APPLICATION,
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
  | 'appearance.accentColor'
  | 'data.autoBackup'
  | 'data.logLevel'
  | 'application.startMinimized'
  | 'application.checkUpdates'
  | 'application.confirmOnExit';

/**
 * Type-safe mapping of setting keys to their value types
 */
export type SettingValueType<K extends SettingKey> = 
  K extends 'appearance.theme' ? ThemeMode :
  K extends 'appearance.colorScheme' ? ColorScheme :
  K extends 'appearance.accentColor' ? string :
  K extends 'data.autoBackup' ? boolean :
  K extends 'data.logLevel' ? LogLevel :
  K extends 'application.startMinimized' ? boolean :
  K extends 'application.checkUpdates' ? boolean :
  K extends 'application.confirmOnExit' ? boolean :
  never;

/**
 * Settings category IDs for sidebar navigation
 */
export type SettingsCategory = 'appearance' | 'data' | 'application' | 'about';
