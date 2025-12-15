/**
 * Settings Page Component
 *
 * Scalable settings interface with sidebar navigation for categories.
 * Features a modern, spacious layout with cards that fill the available space.
 */

import { useState, useEffect } from 'react';
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
  ExternalLink,
  Github,
  Heart,
  FileText,
  Trash2,
  Building2,
  Plus,
  Pencil,
  X,
  ImageIcon,
  User,
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/components/settings-context';
import { useTheme } from '@/components/theme-provider';
import type { SettingsCategory, ThemeMode, LogLevel, BusinessSettings } from '@/types/settings';
import { COLOR_SCHEMES, DEFAULT_BUSINESS } from '@/types/settings';

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
    id: 'reports',
    label: 'Reports',
    description: 'Report settings',
    icon: FileText,
    iconColor: 'text-blue-500',
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Branding & technicians',
    icon: Building2,
    iconColor: 'text-orange-500',
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
        <h3 className="text-2xl font-semibold mb-1">Appearance</h3>
        <p className="text-muted-foreground">
          Customize how the application looks
        </p>
      </div>

      {/* Theme Mode & Color Scheme - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Theme Mode Card */}
        <Card className="h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              Theme Mode
            </CardTitle>
            <CardDescription>Choose between light and dark mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setThemeMode(value)}
                  className={`
                    flex flex-col items-center gap-3 p-5 rounded-xl border-2
                    transition-all duration-200 hover:scale-[1.02]
                    ${themeMode === value
                      ? 'border-primary bg-primary/10 shadow-md'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <Icon className={`h-6 w-6 ${themeMode === value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${themeMode === value ? 'text-primary' : ''}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Color Preview Card */}
        <Card className="h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="h-5 w-5 text-pink-500" />
              Current Theme
            </CardTitle>
            <CardDescription>Preview of your current color scheme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current scheme display */}
              {(() => {
                const currentScheme = COLOR_SCHEMES.find(s => s.id === colorScheme);
                return currentScheme ? (
                  <div className="p-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        <div 
                          className="w-8 h-8 rounded-full border-2 border-background shadow-md"
                          style={{ backgroundColor: currentScheme.preview.primary }}
                        />
                        <div 
                          className="w-8 h-8 rounded-full border-2 border-background shadow-md"
                          style={{ backgroundColor: currentScheme.preview.accent }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{currentScheme.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {currentScheme.description}
                        </div>
                      </div>
                      <Check className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                ) : null;
              })()}
              {/* Sample UI elements */}
              <div className="flex flex-wrap gap-2">
                <Badge>Primary Badge</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Color Scheme Selection - Full Width Grid */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Color Scheme
          </CardTitle>
          <CardDescription>Choose a color palette for the interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {COLOR_SCHEMES.map((scheme) => (
              <button
                key={scheme.id}
                onClick={() => setColorScheme(scheme.id)}
                className={`
                  relative flex flex-col gap-3 p-4 rounded-xl border-2 text-left
                  transition-all duration-200 hover:scale-[1.02]
                  ${colorScheme === scheme.id
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
              >
                {/* Color preview dots */}
                <div className="flex gap-2">
                  <div 
                    className="w-5 h-5 rounded-full border border-border/50 shadow-sm"
                    style={{ backgroundColor: scheme.preview.primary }}
                  />
                  <div 
                    className="w-5 h-5 rounded-full border border-border/50 shadow-sm"
                    style={{ backgroundColor: scheme.preview.accent }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {scheme.name}
                    {colorScheme === scheme.id && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {scheme.description}
                  </div>
                </div>
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
        <CardContent className="pt-6">
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

function ReportsPanel() {
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

function BusinessPanel() {
  const { settings, updateSetting, isLoading } = useSettings();
  const [newTechnician, setNewTechnician] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // Local state for form fields - prevents race conditions when typing
  const [localName, setLocalName] = useState('');
  const [localAddress, setLocalAddress] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [localEmail, setLocalEmail] = useState('');
  const [localWebsite, setLocalWebsite] = useState('');
  const [localLogoPath, setLocalLogoPath] = useState('');
  const [localTfn, setLocalTfn] = useState('');
  const [localAbn, setLocalAbn] = useState('');
  const [initialized, setInitialized] = useState(false);

  const business = settings.business ?? DEFAULT_BUSINESS;

  // Initialize local state from settings when they load
  useEffect(() => {
    if (!isLoading && !initialized) {
      setLocalName(business.name);
      setLocalAddress(business.address);
      setLocalPhone(business.phone);
      setLocalEmail(business.email);
      setLocalWebsite(business.website);
      setLocalLogoPath(business.logoPath ?? '');
      setLocalTfn(business.tfn);
      setLocalAbn(business.abn);
      setInitialized(true);
    }
  }, [business, isLoading, initialized]);

  // Reset initialized when business mode is toggled to re-sync
  useEffect(() => {
    if (business.enabled) {
      setLocalName(business.name);
      setLocalAddress(business.address);
      setLocalPhone(business.phone);
      setLocalEmail(business.email);
      setLocalWebsite(business.website);
      setLocalLogoPath(business.logoPath ?? '');
      setLocalTfn(business.tfn);
      setLocalAbn(business.abn);
    }
  }, [business.enabled]);

  const handleToggleEnabled = async (checked: boolean) => {
    await updateSetting('business.enabled', checked);
  };

  // Save on blur instead of on every keystroke
  const handleFieldBlur = async (field: keyof BusinessSettings, value: string) => {
    const currentValue = field === 'logoPath' ? (business.logoPath ?? '') : (business[field] as string);
    if (value !== currentValue) {
      await updateSetting(`business.${field}` as 'business.name', value);
    }
  };

  const handleAddTechnician = async () => {
    if (!newTechnician.trim()) return;
    const updated = [...business.technicians, newTechnician.trim()];
    await updateSetting('business.technicians', updated);
    setNewTechnician('');
  };

  const handleRemoveTechnician = async (index: number) => {
    const updated = business.technicians.filter((_, i) => i !== index);
    await updateSetting('business.technicians', updated);
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingName(business.technicians[index]);
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null || !editingName.trim()) return;
    const updated = [...business.technicians];
    updated[editingIndex] = editingName.trim();
    await updateSetting('business.technicians', updated);
    setEditingIndex(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingName('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">Business Mode</h3>
        <p className="text-muted-foreground">
          Configure business branding and technician information for customer reports
        </p>
      </div>

      {/* Enable Business Mode */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-orange-500" />
            Business Mode
          </CardTitle>
          <CardDescription>
            Enable business branding on reports and service receipts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="business-enabled" className="text-sm font-medium">Enable Business Mode</Label>
              <p className="text-xs text-muted-foreground">Show business details on prints and reports</p>
            </div>
            <Switch
              id="business-enabled"
              checked={business.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business Details - Only show if enabled */}
      {business.enabled && (
        <>
          {/* Business Info */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-blue-500" />
                Business Details
              </CardTitle>
              <CardDescription>
                Your business information displayed on customer reports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business-name">Business Name</Label>
                  <Input
                    id="business-name"
                    placeholder="Techbay Computer Specialists"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => handleFieldBlur('name', localName)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-address">Address</Label>
                  <Input
                    id="business-address"
                    placeholder="336 Highett Rd, Highett VIC 3190"
                    value={localAddress}
                    onChange={(e) => setLocalAddress(e.target.value)}
                    onBlur={() => handleFieldBlur('address', localAddress)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-phone">Phone</Label>
                  <Input
                    id="business-phone"
                    placeholder="03 9554 4321"
                    value={localPhone}
                    onChange={(e) => setLocalPhone(e.target.value)}
                    onBlur={() => handleFieldBlur('phone', localPhone)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-email">Email</Label>
                  <Input
                    id="business-email"
                    placeholder="admin@techbay.net.au"
                    value={localEmail}
                    onChange={(e) => setLocalEmail(e.target.value)}
                    onBlur={() => handleFieldBlur('email', localEmail)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-website">Website</Label>
                  <Input
                    id="business-website"
                    placeholder="https://www.techbay.net.au"
                    value={localWebsite}
                    onChange={(e) => setLocalWebsite(e.target.value)}
                    onBlur={() => handleFieldBlur('website', localWebsite)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-logo">Logo Path (optional)</Label>
                  <Input
                    id="business-logo"
                    placeholder="business-logo.png"
                    value={localLogoPath}
                    onChange={(e) => setLocalLogoPath(e.target.value)}
                    onBlur={() => handleFieldBlur('logoPath', localLogoPath)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business-tfn">TFN (Tax File Number)</Label>
                  <Input
                    id="business-tfn"
                    placeholder="123 456 789"
                    value={localTfn}
                    onChange={(e) => setLocalTfn(e.target.value)}
                    onBlur={() => handleFieldBlur('tfn', localTfn)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-abn">ABN (Australian Business Number)</Label>
                  <Input
                    id="business-abn"
                    placeholder="12 345 678 910"
                    value={localAbn}
                    onChange={(e) => setLocalAbn(e.target.value)}
                    onBlur={() => handleFieldBlur('abn', localAbn)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technicians */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-green-500" />
                Technicians
              </CardTitle>
              <CardDescription>
                Manage technicians who can be assigned to services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Technician List */}
              {business.technicians.length > 0 ? (
                <div className="space-y-2">
                  {business.technicians.map((tech, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 group"
                    >
                      {editingIndex === index ? (
                        <>
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <Button size="sm" onClick={handleSaveEdit} disabled={isLoading}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 font-medium">{tech}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleStartEdit(index)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                            onClick={() => handleRemoveTechnician(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No technicians added yet. Add your first technician below.
                </p>
              )}

              {/* Add Technician */}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter technician name..."
                  value={newTechnician}
                  onChange={(e) => setNewTechnician(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTechnician();
                  }}
                  disabled={isLoading}
                />
                <Button onClick={handleAddTechnician} disabled={isLoading || !newTechnician.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">About</h3>
        <p className="text-muted-foreground">
          Information about RustService
        </p>
      </div>

      {/* App Info & Build Info - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              RustService
            </CardTitle>
            <CardDescription>Windows Desktop Toolkit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Version</div>
                <code className="font-mono font-semibold">0.1.0</code>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Platform</div>
                <span className="font-semibold text-sm">Windows 10/11</span>
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Tauri 2.0</Badge>
              <Badge variant="outline">React 19</Badge>
              <Badge variant="outline">Rust</Badge>
              <Badge variant="outline">TypeScript</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Credits
            </CardTitle>
            <CardDescription>Built with love</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A portable toolkit for computer repair technicians and power users.
              Designed for efficiency and ease of use.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Github className="h-4 w-4" />
                GitHub
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features Card - Full Width */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">100%</div>
              <div className="text-sm text-muted-foreground">Portable</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">Fast</div>
              <div className="text-sm text-muted-foreground">Rust Powered</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">Modern</div>
              <div className="text-sm text-muted-foreground">UI Design</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-primary">Free</div>
              <div className="text-sm text-muted-foreground">Open Source</div>
            </div>
          </div>
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
      case 'reports':
        return <ReportsPanel />;
      case 'business':
        return <BusinessPanel />;
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
        <div className="p-8">
          {renderPanel()}
        </div>
      </ScrollArea>
    </div>
  );
}
