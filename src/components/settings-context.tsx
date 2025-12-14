/**
 * Settings Context
 * 
 * Provides global access to application settings from any component.
 * Settings are loaded on mount and cached in React state.
 * 
 * @example
 * ```tsx
 * import { useSettings } from '@/components/settings-context';
 * 
 * function MyComponent() {
 *   const { settings, updateSetting, isLoading } = useSettings();
 *   
 *   return (
 *     <button onClick={() => updateSetting('appearance.theme', 'dark')}>
 *       Current: {settings.appearance.theme}
 *     </button>
 *   );
 * }
 * ```
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AppSettings, SettingKey, SettingValueType } from '@/types/settings';
import { DEFAULT_SETTINGS } from '@/types/settings';

// =============================================================================
// Context Types
// =============================================================================

interface SettingsContextValue {
  /** Current settings object - always available (uses defaults while loading) */
  settings: AppSettings;
  /** Whether settings are currently being loaded from disk */
  isLoading: boolean;
  /** Any error that occurred during load/save */
  error: string | null;
  /** Update a single setting by key path */
  updateSetting: <K extends SettingKey>(key: K, value: SettingValueType<K>) => Promise<void>;
  /** Save entire settings object (for bulk updates) */
  saveSettings: (settings: AppSettings) => Promise<void>;
  /** Reload settings from disk */
  refreshSettings: () => Promise<void>;
}

// =============================================================================
// Context
// =============================================================================

const SettingsContext = createContext<SettingsContextValue | null>(null);

// =============================================================================
// Provider Component
// =============================================================================

interface SettingsProviderProps {
  children: ReactNode;
}

/**
 * Settings provider component
 * 
 * Wrap your app with this to enable settings access from any component
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await invoke<AppSettings>('get_settings');
      setSettings(loaded);
    } catch (e) {
      console.error('Failed to load settings:', e);
      setError(e instanceof Error ? e.message : String(e));
      // Keep default settings on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateSetting = useCallback(async <K extends SettingKey>(
    key: K,
    value: SettingValueType<K>
  ) => {
    try {
      setError(null);
      // Update via Rust command - returns updated settings
      const updated = await invoke<AppSettings>('update_setting', {
        key,
        value: JSON.stringify(value),
      });
      setSettings(updated);
    } catch (e) {
      console.error(`Failed to update setting ${key}:`, e);
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      setError(null);
      await invoke('save_settings', { settings: newSettings });
      setSettings(newSettings);
    } catch (e) {
      console.error('Failed to save settings:', e);
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  const value: SettingsContextValue = {
    settings,
    isLoading,
    error,
    updateSetting,
    saveSettings,
    refreshSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Access settings from any component
 * 
 * @returns Settings context with current values and update functions
 * @throws Error if used outside of SettingsProvider
 * 
 * @example
 * ```tsx
 * const { settings, updateSetting } = useSettings();
 * 
 * // Read a setting
 * const theme = settings.appearance.theme;
 * 
 * // Update a setting
 * await updateSetting('appearance.theme', 'dark');
 * ```
 */
export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  
  return context;
}

// =============================================================================
// Utility Hook for Single Setting
// =============================================================================

/**
 * Hook for accessing a single setting value
 * 
 * @param key - The setting key path
 * @returns Tuple of [value, setValue]
 * 
 * @example
 * ```tsx
 * const [theme, setTheme] = useSetting('appearance.theme');
 * ```
 */
export function useSetting<K extends SettingKey>(
  key: K
): [SettingValueType<K>, (value: SettingValueType<K>) => Promise<void>] {
  const { settings, updateSetting } = useSettings();
  
  // Extract the value based on the key path
  const getValue = (): SettingValueType<K> => {
    const parts = key.split('.') as [keyof AppSettings, string];
    const category = settings[parts[0]] as Record<string, unknown>;
    return category[parts[1]] as SettingValueType<K>;
  };
  
  const setValue = async (value: SettingValueType<K>) => {
    await updateSetting(key, value);
  };
  
  return [getValue(), setValue];
}
