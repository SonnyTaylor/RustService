/**
 * Settings Page Component
 * 
 * Application settings - Theme, data folder, and configuration
 */

import { Settings, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { invoke } from '@tauri-apps/api/core';

export function SettingsPage() {
  const handleOpenDataFolder = async () => {
    try {
      const dataDir = await invoke<string>('get_data_dir');
      await invoke('open_folder', { path: dataDir });
    } catch (error) {
      console.error('Failed to open data folder:', error);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="h-8 w-8" />
        <h2 className="text-2xl font-semibold">Settings</h2>
      </div>

      {/* Theme Section */}
      <section className="mb-8">
        <h3 className="text-lg font-medium mb-4">Appearance</h3>
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-sm text-muted-foreground">
              Select your preferred color scheme
            </p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* Data Folder Section */}
      <section className="mb-8">
        <h3 className="text-lg font-medium mb-4">Data & Storage</h3>
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div>
            <p className="font-medium">Data Folder</p>
            <p className="text-sm text-muted-foreground">
              Programs, scripts, logs, and reports are stored here
            </p>
          </div>
          <Button variant="outline" onClick={handleOpenDataFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Open Folder
          </Button>
        </div>
      </section>

      {/* About Section */}
      <section>
        <h3 className="text-lg font-medium mb-4">About</h3>
        <div className="p-4 rounded-lg border bg-card">
          <p className="font-medium">RustService</p>
          <p className="text-sm text-muted-foreground">
            Version 0.1.0 - Windows Desktop Toolkit
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            A portable toolkit for computer repair technicians and power users.
          </p>
        </div>
      </section>
    </div>
  );
}
