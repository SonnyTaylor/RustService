/**
 * Application settings type definitions
 * Stored in data/settings.json
 */

/**
 * Valid theme options for the application
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Main application settings interface
 */
export interface AppSettings {
  /** User's theme preference */
  theme: Theme;
  
  /** Application version for settings migration */
  version: string;
}

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  version: '0.1.0',
};
