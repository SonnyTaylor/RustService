/**
 * Reports Panel Component
 *
 * Configure report auto-save, retention, and management settings.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FolderOpen,
  FileText,
  Trash2,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/components/settings-context';

export function ReportsPanel() {
  const { settings, updateSetting, isLoading } = useSettings();
  const [isClearing, setIsClearing] = useState(false);

  const handleAutoSaveChange = async (checked: boolean) => {
    await updateSetting('reports.autoSaveReports', checked);
  };

  const handleRetentionChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    await updateSetting('reports.reportRetentionDays', value);
  };

  const handleIncludeLogsChange = async (checked: boolean) => {
    await updateSetting('reports.includeLogsInReport', checked);
  };

  const handleClearAllReports = async () => {
    if (!confirm('Are you sure you want to delete all saved reports? This cannot be undone.')) {
      return;
    }
    setIsClearing(true);
    try {
      const count = await invoke<number>('clear_all_reports');
      alert(`Deleted ${count} report${count !== 1 ? 's' : ''}.`);
    } catch (error) {
      console.error('Failed to clear reports:', error);
      alert('Failed to clear reports.');
    } finally {
      setIsClearing(false);
    }
  };

  const handleOpenReportsFolder = async () => {
    try {
      const dataDir = await invoke<string>('get_data_dir');
      await invoke('open_folder', { path: `${dataDir}\\reports` });
    } catch (error) {
      console.error('Failed to open reports folder:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">Reports</h3>
        <p className="text-muted-foreground">
          Configure how service reports are saved and managed
        </p>
      </div>

      {/* Auto-save & Storage Settings - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              Auto-Save
            </CardTitle>
            <CardDescription>
              Automatically save reports when services complete
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label htmlFor="auto-save" className="text-sm font-medium">Auto-save reports</Label>
                <p className="text-xs text-muted-foreground">Save a JSON report after each service run</p>
              </div>
              <Switch
                id="auto-save"
                checked={settings.reports?.autoSaveReports ?? true}
                onCheckedChange={handleAutoSaveChange}
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label htmlFor="include-logs" className="text-sm font-medium">Include logs</Label>
                <p className="text-xs text-muted-foreground">Store detailed logs in reports</p>
              </div>
              <Switch
                id="include-logs"
                checked={settings.reports?.includeLogsInReport ?? true}
                onCheckedChange={handleIncludeLogsChange}
                disabled={isLoading}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-green-500" />
              Storage
            </CardTitle>
            <CardDescription>
              Manage report storage and retention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <Label htmlFor="retention-days" className="text-sm font-medium">Retention period</Label>
                <p className="text-xs text-muted-foreground">Days to keep reports (0 = forever)</p>
              </div>
              <Input
                id="retention-days"
                type="number"
                min={0}
                max={365}
                value={settings.reports?.reportRetentionDays ?? 0}
                onChange={handleRetentionChange}
                disabled={isLoading}
                className="w-20 text-center"
              />
            </div>
            <Button variant="outline" onClick={handleOpenReportsFolder} className="w-full">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Reports Folder
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions for report management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
            <div>
              <p className="text-sm font-medium">Clear all reports</p>
              <p className="text-xs text-muted-foreground">Permanently delete all saved reports</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAllReports}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : 'Clear All'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
