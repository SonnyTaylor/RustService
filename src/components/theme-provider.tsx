/**
 * Theme Provider Component
 * 
 * Provides theme context to the application with support for:
 * - Light/Dark/System mode
 * - Color schemes (e.g., Techbay, Default)
 * 
 * Integrates with the settings context for persistence.
 */

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { COLOR_SCHEMES } from '@/types/settings';
import type { ThemeMode, ColorScheme, AppSettings } from '@/types/settings';

interface ThemeProviderContextType {
  /** Current theme mode (light/dark/system) */
  themeMode: ThemeMode;
  /** Current color scheme (default, techbay, etc.) */
  colorScheme: ColorScheme;
  /** Resolved theme (always 'light' or 'dark') */
  resolvedTheme: 'light' | 'dark';
  /** Set theme mode */
  setThemeMode: (mode: ThemeMode) => void;
  /** Set color scheme */
  setColorScheme: (scheme: ColorScheme) => void;
  /** Legacy: alias for themeMode */
  theme: ThemeMode;
  /** Legacy: alias for setThemeMode */
  setTheme: (theme: ThemeMode) => void;
}

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeMode;
  defaultColorScheme?: ColorScheme;
}

/**
 * Gets the system's preferred color scheme
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

/**
 * Apply theme classes to the document root
 */
function applyTheme(resolvedTheme: 'light' | 'dark', colorScheme: ColorScheme) {
  const root = document.documentElement;
  
  // Remove old theme mode classes
  root.classList.remove('light', 'dark');
  root.classList.add(resolvedTheme);
  
  // Remove old color scheme classes (all theme-* classes)
  const classesToRemove = Array.from(root.classList).filter(c => c.startsWith('theme-'));
  classesToRemove.forEach(c => root.classList.remove(c));
  
  // Apply new color scheme (skip 'default' as it uses :root)
  if (colorScheme !== 'default') {
    root.classList.add(`theme-${colorScheme}`);
  }
}

/**
 * ThemeProvider component that wraps the application and provides theme context
 */
export function ThemeProvider({ 
  children, 
  defaultTheme = 'system',
  defaultColorScheme = 'default'
}: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(defaultTheme);
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(defaultColorScheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(getSystemTheme());

  // Load saved settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await invoke<AppSettings>('get_settings');
        // Handle both old and new format
        const savedTheme = settings?.appearance?.theme || 
          (settings as unknown as { theme?: ThemeMode })?.theme;
        const savedScheme = settings?.appearance?.colorScheme;

        const isValidScheme = (scheme: unknown): scheme is ColorScheme =>
          typeof scheme === 'string' && COLOR_SCHEMES.some(s => s.id === scheme);
        
        if (savedTheme) {
          setThemeModeState(savedTheme as ThemeMode);
        }
        if (savedScheme && isValidScheme(savedScheme)) {
          setColorSchemeState(savedScheme);
        } else if (savedScheme) {
          setColorSchemeState('default');
        }
      } catch (error) {
        console.warn('Failed to load theme settings:', error);
      }
    }
    loadSettings();
  }, []);

  // Update resolved theme and apply classes when theme mode or color scheme changes
  useEffect(() => {
    const resolved = themeMode === 'system' ? getSystemTheme() : themeMode;
    setResolvedTheme(resolved);
    applyTheme(resolved, colorScheme);

    // Listen for system theme changes when in 'system' mode
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newTheme);
        applyTheme(newTheme, colorScheme);
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [themeMode, colorScheme]);

  // Set theme mode and persist
  const setThemeMode = useCallback(async (newMode: ThemeMode) => {
    setThemeModeState(newMode);
    try {
      await invoke('update_setting', { 
        key: 'appearance.theme',
        value: JSON.stringify(newMode)
      });
    } catch (error) {
      console.warn('Failed to save theme mode:', error);
    }
  }, []);

  // Set color scheme and persist
  const setColorScheme = useCallback(async (newScheme: ColorScheme) => {
    setColorSchemeState(newScheme);
    try {
      await invoke('update_setting', { 
        key: 'appearance.colorScheme',
        value: JSON.stringify(newScheme)
      });
    } catch (error) {
      console.warn('Failed to save color scheme:', error);
    }
  }, []);

  return (
    <ThemeProviderContext.Provider value={{ 
      themeMode,
      colorScheme,
      resolvedTheme,
      setThemeMode,
      setColorScheme,
      // Legacy aliases
      theme: themeMode,
      setTheme: setThemeMode,
    }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/**
 * Hook to access theme context
 * @throws Error if used outside of ThemeProvider
 */
export function useTheme() {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
