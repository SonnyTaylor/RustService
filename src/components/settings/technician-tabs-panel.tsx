/**
 * Technician Tabs Panel Component
 *
 * Add, edit, and manage custom web tabs embedded in the app.
 */

import { useState } from 'react';
import {
  Check,
  Plus,
  Pencil,
  X,
  ImageIcon,
  Trash2,
  Globe,
  AlertTriangle,
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/components/settings-context';
import type { TechnicianTab } from '@/types/settings';
import { DEFAULT_TECHNICIAN_TABS, TECHNICIAN_TAB_ICONS } from '@/types/settings';
import { getIconComponent } from './settings-helpers';

// =============================================================================
// Technician Tabs Panel
// =============================================================================

export function TechnicianTabsPanel() {
  const { settings, updateSetting, isLoading } = useSettings();
  const [newTabName, setNewTabName] = useState('');
  const [newTabUrl, setNewTabUrl] = useState('');
  const [newTabIcon, setNewTabIcon] = useState<string | undefined>(undefined); // undefined = auto/favicon
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingIcon, setEditingIcon] = useState<string | undefined>(undefined);
  const [urlError, setUrlError] = useState('');

  const tabs = settings.technicianTabs?.tabs ?? DEFAULT_TECHNICIAN_TABS.tabs;
  const useFavicons = settings.technicianTabs?.useFavicons ?? true;

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleAddTab = async () => {
    if (!newTabName.trim()) return;

    let url = newTabUrl.trim();
    if (!url) {
      setUrlError('URL is required');
      return;
    }

    // Add https:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    if (!validateUrl(url)) {
      setUrlError('Please enter a valid URL');
      return;
    }

    const newTab: TechnicianTab = {
      id: crypto.randomUUID(),
      name: newTabName.trim(),
      url: url,
      icon: newTabIcon,
    };

    const updated = [...tabs, newTab];
    await updateSetting('technicianTabs.tabs', updated);
    setNewTabName('');
    setNewTabUrl('');
    setNewTabIcon(undefined);
    setUrlError('');
  };

  const handleDeleteTab = async (id: string) => {
    const updated = tabs.filter(tab => tab.id !== id);
    await updateSetting('technicianTabs.tabs', updated);
  };

  const handleStartEdit = (tab: TechnicianTab) => {
    setEditingId(tab.id);
    setEditingName(tab.name);
    setEditingUrl(tab.url);
    setEditingIcon(tab.icon);
  };

  const handleSaveEdit = async () => {
    if (editingId === null || !editingName.trim()) return;

    let url = editingUrl.trim();
    if (!url) return;

    // Add https:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    const updated = tabs.map(tab =>
      tab.id === editingId
        ? { ...tab, name: editingName.trim(), url: url, icon: editingIcon }
        : tab
    );

    await updateSetting('technicianTabs.tabs', updated);
    setEditingId(null);
    setEditingName('');
    setEditingUrl('');
    setEditingIcon(undefined);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingUrl('');
    setEditingIcon(undefined);
  };

  const handleToggleFavicons = async (checked: boolean) => {
    await updateSetting('technicianTabs.useFavicons', checked);
  };

  const handleUpdateTabIcon = async (tabId: string, iconId: string | undefined) => {
    const updated = tabs.map(tab =>
      tab.id === tabId ? { ...tab, icon: iconId } : tab
    );
    await updateSetting('technicianTabs.tabs', updated);
  };

  // Icon picker component
  const IconPicker = ({ value, onChange, size = 'sm' }: {
    value: string | undefined;
    onChange: (icon: string | undefined) => void;
    size?: 'sm' | 'lg';
  }) => {
    const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
    const triggerWidth = size === 'lg' ? 'w-[200px]' : 'w-[180px]';

    // Get current icon for display
    const currentIcon = value ? TECHNICIAN_TAB_ICONS.find(i => i.id === value) : null;
    const CurrentIconComponent = value ? getIconComponent(value) : ImageIcon;

    return (
      <Select
        value={value ?? 'auto'}
        onValueChange={(v) => onChange(v === 'auto' ? undefined : v)}
      >
        <SelectTrigger className={triggerWidth}>
          <div className="flex items-center gap-2">
            <CurrentIconComponent className={iconSize} />
            <span className="truncate">{currentIcon?.name ?? 'Auto (Favicon)'}</span>
          </div>
        </SelectTrigger>
        <SelectContent
          position="popper"
          sideOffset={4}
          className="w-[220px]"
          style={{ maxHeight: '240px' }}
        >
          <SelectItem value="auto">
            <div className="flex items-center gap-2">
              <ImageIcon className={iconSize} />
              <span>Auto (Favicon)</span>
            </div>
          </SelectItem>
          {TECHNICIAN_TAB_ICONS.map((icon) => {
            const IconComponent = getIconComponent(icon.id);
            return (
              <SelectItem key={icon.id} value={icon.id}>
                <div className="flex items-center gap-2">
                  <IconComponent className={iconSize} />
                  <span>{icon.name}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">Technician Tabs</h3>
        <p className="text-muted-foreground">
          Add custom web tabs to embed external websites in the app
        </p>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-blue-500" />
            Icon Settings
          </CardTitle>
          <CardDescription>
            Configure how tab icons are displayed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="use-favicons" className="text-sm font-medium">Use website favicons</Label>
              <p className="text-xs text-muted-foreground">Automatically fetch and display website icons for tabs without a custom icon</p>
            </div>
            <Switch
              id="use-favicons"
              checked={useFavicons}
              onCheckedChange={handleToggleFavicons}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Info Card about iframes */}
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">Note about website compatibility</p>
              <p className="text-muted-foreground mt-1">
                Some websites block embedding in iframes for security. If a tab shows a blank page or error, the website may not support embedding.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add New Tab */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-green-500" />
            Add New Tab
          </CardTitle>
          <CardDescription>
            Create a new tab to embed an external website
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-tab-name">Tab Name</Label>
              <Input
                id="new-tab-name"
                placeholder="e.g., Google Drive"
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-tab-url">URL</Label>
              <Input
                id="new-tab-url"
                placeholder="e.g., https://drive.google.com"
                value={newTabUrl}
                onChange={(e) => {
                  setNewTabUrl(e.target.value);
                  setUrlError('');
                }}
                disabled={isLoading}
                className={urlError ? 'border-destructive' : ''}
              />
              {urlError && (
                <p className="text-xs text-destructive">{urlError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <IconPicker value={newTabIcon} onChange={setNewTabIcon} size="lg" />
            </div>
          </div>
          <Button
            onClick={handleAddTab}
            disabled={isLoading || !newTabName.trim() || !newTabUrl.trim()}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Tab
          </Button>
        </CardContent>
      </Card>

      {/* Configured Tabs */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-500" />
            Configured Tabs
            {tabs.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {tabs.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Tabs will appear in the navigation bar after the Settings tab
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tabs.length === 0 ? (
            <div className="text-center py-8">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No technician tabs configured yet. Add one above!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tabs.map((tab) => {
                const TabIcon = tab.icon ? getIconComponent(tab.icon) : Globe;
                return (
                  <div
                    key={tab.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group"
                  >
                    {editingId === tab.id ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1"
                          placeholder="Tab name"
                        />
                        <Input
                          value={editingUrl}
                          onChange={(e) => setEditingUrl(e.target.value)}
                          className="flex-1"
                          placeholder="URL"
                        />
                        <IconPicker value={editingIcon} onChange={setEditingIcon} />
                        <Button size="sm" onClick={handleSaveEdit} variant="default">
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={handleCancelEdit} variant="ghost">
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <TabIcon className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            {tab.name}
                            {!tab.icon && useFavicons && (
                              <Badge variant="outline" className="text-xs">Favicon</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {tab.url}
                          </div>
                        </div>
                        <IconPicker
                          value={tab.icon}
                          onChange={(icon) => handleUpdateTabIcon(tab.id, icon)}
                        />
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(tab)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTab(tab.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
