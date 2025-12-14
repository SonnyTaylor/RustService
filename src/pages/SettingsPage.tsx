/**
 * Settings Page Component
 *
 * Scalable settings interface with sidebar navigation for categories.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Settings,
  Palette,
  FolderOpen,
  Info,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useSettings } from '@/components/settings-context';
import { useTheme } from '@/components/theme-provider';
import type { SettingsCategory, ThemeMode, LogLevel } from '@/types/settings';
import { COLOR_SCHEMES } from '@/types/settings';

// =============================================================================
// Types
// =============================================================================

interface SidebarItem {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
}

// =============================================================================
// Constants
// =============================================================================

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme and colors',
    icon: Palette,
    iconColor: 'text-pink-500',
  },
  {
    id: 'data',
    label: 'Data & Storage',
    description: 'Folders and logs',
    icon: FolderOpen,
    iconColor: 'text-green-500',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Version info',
    icon: Info,
    iconColor: 'text-purple-500',
  },
];

// =============================================================================
// Sidebar Component
// =============================================================================

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

function SettingsSidebar({ activeCategory, onCategoryChange }: SettingsSidebarProps) {
  return (
    <div className="w-52 border-r bg-muted/30 flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Settings</h2>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeCategory === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onCategoryChange(item.id)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left
                transition-colors duration-150
                ${isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
                }
              `}
            >
              <Icon className={`h-4 w-4 ${isActive ? '' : item.iconColor}`} />
              <span className="text-sm font-medium truncate">{item.label}</span>
              {isActive && (
                <ChevronRight className="h-4 w-4 ml-auto flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// =============================================================================
// Panel Components
// =============================================================================

function AppearancePanel() {
  const { themeMode, colorScheme, setThemeMode, setColorScheme } = useTheme();

  const themeOptions: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-1">Appearance</h3>
        <p className="text-muted-foreground text-sm">
          Customize how the application looks
        </p>
      </div>

      {/* Theme Mode */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Theme Mode</CardTitle>
          <CardDescription>Choose between light and dark mode</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setThemeMode(value)}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-lg border-2
                  transition-all duration-150
                  ${themeMode === value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
              >
                <Icon className={`h-5 w-5 ${themeMode === value ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium ${themeMode === value ? 'text-primary' : ''}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Color Scheme */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Color Scheme</CardTitle>
          <CardDescription>Choose a color palette for the interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {COLOR_SCHEMES.map((scheme) => (
              <button
                key={scheme.id}
                onClick={() => setColorScheme(scheme.id)}
                className={`
                  relative flex items-center gap-3 p-4 rounded-lg border-2 text-left
                  transition-all duration-150
                  ${colorScheme === scheme.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
              >
                {/* Color preview dots */}
                <div className="flex gap-1">
                  <div 
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ backgroundColor: scheme.preview.primary }}
                  />
                  <div 
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ backgroundColor: scheme.preview.accent }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{scheme.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {scheme.description}
                  </div>
                </div>
                {colorScheme === scheme.id && (
                  <Check className="h-4 w-4 text-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataPanel() {
  const { settings, updateSetting, isLoading } = useSettings();

  const handleOpenDataFolder = async () => {
    try {
      const dataDir = await invoke<string>('get_data_dir');
      await invoke('open_folder', { path: dataDir });
    } catch (error) {
      console.error('Failed to open data folder:', error);
    }
  };

  const handleLogLevelChange = async (level: LogLevel) => {
    await updateSetting('data.logLevel', level);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-1">Data & Storage</h3>
        <p className="text-muted-foreground text-sm">
          Manage data folder and logging
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Data Folder</CardTitle>
          <CardDescription>
            Programs, scripts, logs, and reports are stored here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleOpenDataFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Data Folder
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Logging</CardTitle>
          <CardDescription>Configure log verbosity level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="log-level">Log Level</Label>
            <Select
              value={settings.data.logLevel}
              onValueChange={(value) => handleLogLevelChange(value as LogLevel)}
              disabled={isLoading}
            >
              <SelectTrigger className="w-32" id="log-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-1">About</h3>
        <p className="text-muted-foreground text-sm">
          Information about RustService
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">RustService</CardTitle>
          <CardDescription>Windows Desktop Toolkit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <code className="font-mono bg-muted px-2 py-0.5 rounded">0.1.0</code>
          </div>
          <Separator />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Platform</span>
            <code className="font-mono bg-muted px-2 py-0.5 rounded">Windows 10/11</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            A portable toolkit for computer repair technicians and power users.
            Built with Tauri, React, and Rust.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance');

  const renderPanel = () => {
    switch (activeCategory) {
      case 'appearance':
        return <AppearancePanel />;
      case 'data':
        return <DataPanel />;
      case 'about':
        return <AboutPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <SettingsSidebar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Content Panel */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-xl">
          {renderPanel()}
        </div>
      </ScrollArea>
    </div>
  );
}
