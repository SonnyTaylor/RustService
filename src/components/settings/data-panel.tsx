/**
 * Data & Storage Panel Component
 *
 * Manage data folder location and logging preferences.
 */

import { invoke } from '@tauri-apps/api/core';
import {
  FolderOpen,
  Info,
  ExternalLink,
} from 'lucide-react';

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
import { useSettings } from '@/components/settings-context';
import type { LogLevel } from '@/types/settings';

export function DataPanel() {
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
        <h3 className="text-2xl font-semibold mb-1">Data & Storage</h3>
        <p className="text-muted-foreground">
          Manage data folder and logging preferences
        </p>
      </div>

      {/* Data Folder & Logging - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-green-500" />
              Data Folder
            </CardTitle>
            <CardDescription>
              Programs, scripts, logs, and reports are stored here
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              All your portable data is stored in a dedicated folder for easy backup and USB portability.
            </p>
            <Button variant="outline" onClick={handleOpenDataFolder} className="w-full sm:w-auto">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Data Folder
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              Logging
            </CardTitle>
            <CardDescription>Configure application log verbosity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Higher verbosity levels provide more detailed logs for troubleshooting.
            </p>
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
              <Label htmlFor="log-level" className="text-sm font-medium">Log Level</Label>
              <Select
                value={settings.data.logLevel}
                onValueChange={(value) => handleLogLevelChange(value as LogLevel)}
                disabled={isLoading}
              >
                <SelectTrigger className="w-36" id="log-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Storage Info Card - Full Width */}
      <Card className="bg-muted/20">
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">Portable Storage</h4>
              <p className="text-sm text-muted-foreground">
                RustService stores all data relative to the application directory, making it fully portable.
                You can copy the entire folder to a USB drive and use it on any Windows computer.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
