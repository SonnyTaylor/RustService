/**
 * Theme Provider Component
 * 
 * Provides theme context to the application with support for
 * light, dark, and system themes. Persists preference via Tauri backend.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Theme, AppSettings, DEFAULT_SETTINGS } from '@/types';

interface ThemeProviderContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeProviderContext = createContext<ThemeProviderContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
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
 * ThemeProvider component that wraps the application and provides theme context
 */
export function ThemeProvider({ children, defaultTheme = 'system' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(getSystemTheme());

  // Load saved theme preference on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const settings = await invoke<AppSettings>('get_settings');
        if (settings?.theme) {
          setThemeState(settings.theme);
        }
      } catch (error) {
        console.warn('Failed to load theme settings:', error);
      }
    }
    loadTheme();
  }, []);

  // Update resolved theme when theme or system preference changes
  useEffect(() => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    setResolvedTheme(resolved);

    // Apply theme class to document root
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolved);

    // Listen for system theme changes when in 'system' mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? 'dark' : 'light';
        setResolvedTheme(newTheme);
        root.classList.remove('light', 'dark');
        root.classList.add(newTheme);
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Function to set theme and persist to settings
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      await invoke('save_settings', { 
        settings: { ...DEFAULT_SETTINGS, theme: newTheme } 
      });
    } catch (error) {
      console.warn('Failed to save theme settings:', error);
    }
  };

  return (
    <ThemeProviderContext.Provider value={{ theme, setTheme, resolvedTheme }}>
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
