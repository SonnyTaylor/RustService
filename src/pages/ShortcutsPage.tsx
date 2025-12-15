/**
 * Shortcuts Page Component
 *
 * Quick access shortcuts to commonly used Windows features and tools
 * for computer repair technicians.
 */

import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Search,
  Zap,
  Monitor,
  HardDrive,
  Network,
  Settings,
  Terminal,
  Shield,
  Cpu,
  Activity,
  Power,
  Users,
  FolderOpen,
  Wrench,
  Database,
  FileText,
  AlertTriangle,
  Clock,
  Laptop,
  RefreshCw,
  SquareTerminal,
  KeyRound,
  WifiOff,
  Flame,
  Eye,
  ClipboardList,
  Cog,
  MonitorCog,
  Printer,
  Volume2,
  MousePointer,
  Palette,
  Globe,
  Lock,
  HardDriveDownload,
  ScanLine,
  LayoutGrid,
  Trash2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

/**
 * Shortcut definition
 */
interface Shortcut {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  command: string;
  args?: string[];
  adminRequired?: boolean;
}

/**
 * Category of shortcuts
 */
interface ShortcutCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  shortcuts: Shortcut[];
}

/**
 * All available shortcuts organized by category
 */
const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: 'system',
    name: 'System Tools',
    description: 'Core system utilities and diagnostics',
    icon: Monitor,
    iconColor: 'text-blue-500',
    shortcuts: [
      { id: 'taskmgr', name: 'Task Manager', description: 'Monitor processes & performance', icon: Activity, command: 'taskmgr' },
      { id: 'devmgmt', name: 'Device Manager', description: 'Hardware & drivers', icon: Cpu, command: 'devmgmt.msc' },
      { id: 'msconfig', name: 'System Config', description: 'Startup & boot options', icon: Cog, command: 'msconfig' },
      { id: 'msinfo', name: 'System Information', description: 'Detailed system info', icon: FileText, command: 'msinfo32' },
      { id: 'winver', name: 'About Windows', description: 'Windows version info', icon: FileText, command: 'winver' },
      { id: 'resmon', name: 'Resource Monitor', description: 'Advanced resource usage', icon: Activity, command: 'resmon' },
      { id: 'perfmon', name: 'Performance Monitor', description: 'Performance counters', icon: Activity, command: 'perfmon' },
      { id: 'perfmon-report', name: 'Performance Report', description: '60-second diagnostics report', icon: ClipboardList, command: 'perfmon', args: ['/report'] },
      { id: 'dxdiag', name: 'DirectX Diagnostics', description: 'Graphics & sound info', icon: Monitor, command: 'dxdiag' },
      { id: 'sys-adv', name: 'Advanced System Settings', description: 'Performance, profiles, startup', icon: Cog, command: 'SystemPropertiesAdvanced.exe' },
      { id: 'sys-protect', name: 'System Protection', description: 'Restore points & protection', icon: Shield, command: 'SystemPropertiesProtection.exe' },
      { id: 'admintools', name: 'Windows Tools', description: 'Administrative Tools folder', icon: Wrench, command: 'control', args: ['admintools'] },
      { id: 'verifier', name: 'Driver Verifier', description: 'Test driver stability', icon: Shield, command: 'verifier', adminRequired: true },
    ]
  },
  {
    id: 'disk',
    name: 'Disk & Storage',
    description: 'Drive management and repair tools',
    icon: HardDrive,
    iconColor: 'text-green-500',
    shortcuts: [
      { id: 'diskmgmt', name: 'Disk Management', description: 'Partition & volume management', icon: HardDrive, command: 'diskmgmt.msc' },
      { id: 'diskpart', name: 'Diskpart', description: 'Command-line disk utility', icon: SquareTerminal, command: 'cmd', args: ['/k', 'diskpart'], adminRequired: true },
      { id: 'defrag', name: 'Defragment & Optimize', description: 'Optimize drive performance', icon: RefreshCw, command: 'dfrgui' },
      { id: 'cleanmgr', name: 'Disk Cleanup', description: 'Free up disk space', icon: Trash2, command: 'cleanmgr' },
      { id: 'volumes', name: 'Volumes (MountVol)', description: 'List volumes & mount points', icon: HardDrive, command: 'cmd', args: ['/k', 'mountvol'] },
      { id: 'chkdsk', name: 'Check Disk', description: 'Scan for disk errors', icon: ScanLine, command: 'cmd', args: ['/k', 'echo Run: chkdsk C: /f /r && echo.'], adminRequired: true },
      { id: 'sfc', name: 'System File Checker', description: 'Repair system files', icon: Shield, command: 'cmd', args: ['/k', 'sfc /scannow'], adminRequired: true },
      { id: 'dism', name: 'DISM Tool', description: 'Repair Windows image', icon: HardDriveDownload, command: 'cmd', args: ['/k', 'DISM /Online /Cleanup-Image /RestoreHealth'], adminRequired: true },
      { id: 'vssadmin', name: 'Shadow Copies', description: 'List volume shadow copies', icon: Database, command: 'cmd', args: ['/k', 'vssadmin list shadows'], adminRequired: true },
    ]
  },
  {
    id: 'network',
    name: 'Network & Internet',
    description: 'Network configuration and diagnostics',
    icon: Network,
    iconColor: 'text-purple-500',
    shortcuts: [
      { id: 'ncpa', name: 'Network Connections', description: 'Manage network adapters', icon: Network, command: 'ncpa.cpl' },
      { id: 'firewall', name: 'Windows Firewall', description: 'Firewall with advanced security', icon: Flame, command: 'wf.msc' },
      { id: 'inetcpl', name: 'Internet Options', description: 'Browser & connection settings', icon: Globe, command: 'inetcpl.cpl' },
      { id: 'rdp', name: 'Remote Desktop', description: 'Remote Desktop Connection', icon: Monitor, command: 'mstsc' },
      { id: 'rasphone', name: 'VPN / Dial-up', description: 'Classic phonebook entries', icon: Globe, command: 'rasphone' },
      { id: 'ipconfig', name: 'IP Config', description: 'View network configuration', icon: Network, command: 'cmd', args: ['/k', 'ipconfig /all'] },
      { id: 'ping', name: 'Ping Test', description: 'Ping 8.8.8.8 once', icon: Activity, command: 'cmd', args: ['/k', 'ping 8.8.8.8'] },
      { id: 'tracert', name: 'Traceroute', description: 'Trace route to 8.8.8.8', icon: Network, command: 'cmd', args: ['/k', 'tracert 8.8.8.8'] },
      { id: 'flushdns', name: 'Flush DNS', description: 'Clear DNS cache', icon: RefreshCw, command: 'cmd', args: ['/k', 'ipconfig /flushdns'], adminRequired: true },
      { id: 'netsh-wlan', name: 'WiFi Profiles', description: 'View saved WiFi passwords', icon: WifiOff, command: 'cmd', args: ['/k', 'netsh wlan show profiles'], adminRequired: true },
    ]
  },
  {
    id: 'controlpanel',
    name: 'Control Panel',
    description: 'Classic Windows settings applets',
    icon: Settings,
    iconColor: 'text-orange-500',
    shortcuts: [
      { id: 'control', name: 'Control Panel', description: 'Classic control panel', icon: LayoutGrid, command: 'control' },
      { id: 'appwiz', name: 'Programs & Features', description: 'Installed programs', icon: FolderOpen, command: 'appwiz.cpl' },
      { id: 'powercfg', name: 'Power Options', description: 'Power plans & settings', icon: Power, command: 'powercfg.cpl' },
      { id: 'sysdm', name: 'System Properties', description: 'Computer name & advanced', icon: Laptop, command: 'sysdm.cpl' },
      { id: 'folder-options', name: 'File Explorer Options', description: 'Hidden files, extensions, view', icon: FolderOpen, command: 'control', args: ['folders'] },
      { id: 'main', name: 'Mouse Properties', description: 'Mouse & pointer settings', icon: MousePointer, command: 'main.cpl' },
      { id: 'desk', name: 'Display Settings', description: 'Resolution & scaling', icon: Palette, command: 'desk.cpl' },
      { id: 'mmsys', name: 'Sound Settings', description: 'Audio devices', icon: Volume2, command: 'mmsys.cpl' },
      { id: 'timedate', name: 'Date & Time', description: 'Time zone & clock settings', icon: Clock, command: 'timedate.cpl' },
      { id: 'region', name: 'Region', description: 'Locale & formats', icon: Globe, command: 'intl.cpl' },
      { id: 'printers', name: 'Devices & Printers', description: 'Printers & hardware', icon: Printer, command: 'control', args: ['printers'] },
      { id: 'userpasswords', name: 'User Accounts', description: 'User account settings', icon: Users, command: 'netplwiz' },
    ]
  },
  {
    id: 'cmdline',
    name: 'Command Line',
    description: 'Terminal and shell access',
    icon: Terminal,
    iconColor: 'text-slate-500',
    shortcuts: [
      { id: 'cmd', name: 'Command Prompt', description: 'Windows command-line', icon: SquareTerminal, command: 'cmd' },
      { id: 'cmd-admin', name: 'CMD (Admin)', description: 'Elevated command prompt', icon: SquareTerminal, command: 'cmd', adminRequired: true },
      { id: 'powershell', name: 'PowerShell', description: 'Windows PowerShell', icon: Terminal, command: 'powershell' },
      { id: 'powershell-admin', name: 'PowerShell (Admin)', description: 'Elevated PowerShell', icon: Terminal, command: 'powershell', adminRequired: true },
      { id: 'wt', name: 'Windows Terminal', description: 'Modern terminal app', icon: Terminal, command: 'wt' },
      { id: 'wt-admin', name: 'Terminal (Admin)', description: 'Elevated terminal', icon: Terminal, command: 'wt', adminRequired: true },
      { id: 'netstat', name: 'Netstat', description: 'Active connections & ports', icon: Network, command: 'cmd', args: ['/k', 'netstat -ano'] },
      { id: 'whoami', name: 'WhoAmI', description: 'Current user & groups', icon: Users, command: 'cmd', args: ['/k', 'whoami /all'] },
      { id: 'driverquery', name: 'Driver Query', description: 'List installed drivers', icon: Cpu, command: 'cmd', args: ['/k', 'driverquery /v'] },
    ]
  },
  {
    id: 'advanced',
    name: 'Advanced Tools',
    description: 'Registry, services, and system management',
    icon: Wrench,
    iconColor: 'text-red-500',
    shortcuts: [
      { id: 'regedit', name: 'Registry Editor', description: 'Edit Windows registry', icon: Database, command: 'regedit', adminRequired: true },
      { id: 'services', name: 'Services', description: 'Manage Windows services', icon: Cog, command: 'services.msc' },
      { id: 'eventvwr', name: 'Event Viewer', description: 'System & app logs', icon: ClipboardList, command: 'eventvwr.msc' },
      { id: 'compmgmt', name: 'Computer Management', description: 'System tools hub', icon: MonitorCog, command: 'compmgmt.msc' },
      { id: 'fsmgmt', name: 'Shared Folders', description: 'Shares, sessions, open files', icon: FolderOpen, command: 'fsmgmt.msc' },
      { id: 'certlm', name: 'Certificates (Local Computer)', description: 'Local machine certificate store', icon: KeyRound, command: 'certlm.msc' },
      { id: 'comexp', name: 'Component Services', description: 'COM+ & DCOM settings', icon: Cog, command: 'comexp.msc' },
      { id: 'dcomcnfg', name: 'DCOM Config', description: 'Component Services entry point', icon: Cog, command: 'dcomcnfg' },
      { id: 'lusrmgr', name: 'Local Users & Groups', description: 'Manage users', icon: Users, command: 'lusrmgr.msc' },
      { id: 'gpedit', name: 'Group Policy Editor', description: 'Local policy settings', icon: Lock, command: 'gpedit.msc' },
      { id: 'secpol', name: 'Security Policy', description: 'Local security settings', icon: Shield, command: 'secpol.msc' },
      { id: 'certmgr', name: 'Certificate Manager', description: 'Manage certificates', icon: KeyRound, command: 'certmgr.msc' },
      { id: 'taskschd', name: 'Task Scheduler', description: 'Scheduled tasks', icon: Clock, command: 'taskschd.msc' },
      { id: 'optionalfeatures', name: 'Windows Features', description: 'Enable/disable features', icon: Zap, command: 'optionalfeatures' },
      { id: 'reliability', name: 'Reliability Monitor', description: 'System stability history', icon: Eye, command: 'perfmon', args: ['/rel'] },
      { id: 'recovery', name: 'Recovery Options', description: 'Recovery environment', icon: AlertTriangle, command: 'rstrui' },
    ]
  },
];

/**
 * Shortcut button component
 */
function ShortcutButton({ shortcut }: { shortcut: Shortcut }) {
  const [loading, setLoading] = useState(false);
  const Icon = shortcut.icon;

  const handleClick = async () => {
    try {
      setLoading(true);
      await invoke('open_shortcut', {
        command: shortcut.command,
        args: shortcut.args || null,
        runAsAdmin: shortcut.adminRequired || false,
      });
    } catch (error) {
      console.error(`Failed to open ${shortcut.name}:`, error);
    } finally {
      setTimeout(() => setLoading(false), 300);
    }
  };

  return (
    <Button
      variant="outline"
      className="h-auto p-3 flex flex-col items-start gap-1.5 hover:bg-muted/80 transition-colors"
      onClick={handleClick}
      disabled={loading}
    >
      <div className="flex items-center gap-2.5 w-full">
        <div className={`p-1.5 rounded-md bg-muted ${loading ? 'animate-pulse' : ''}`}>
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <span className="truncate">{shortcut.name}</span>
            {shortcut.adminRequired && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                Admin
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {shortcut.description}
          </div>
        </div>
      </div>
    </Button>
  );
}

/**
 * Shortcuts Page - Main component
 */
export function ShortcutsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter shortcuts based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return SHORTCUT_CATEGORIES;

    const query = searchQuery.toLowerCase();
    return SHORTCUT_CATEGORIES.map(category => ({
      ...category,
      shortcuts: category.shortcuts.filter(
        shortcut =>
          shortcut.name.toLowerCase().includes(query) ||
          shortcut.description.toLowerCase().includes(query) ||
          shortcut.command.toLowerCase().includes(query)
      )
    })).filter(category => category.shortcuts.length > 0);
  }, [searchQuery]);

  const totalShortcuts = SHORTCUT_CATEGORIES.reduce((acc, cat) => acc + cat.shortcuts.length, 0);
  const filteredCount = filteredCategories.reduce((acc, cat) => acc + cat.shortcuts.length, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Shortcuts</h2>
          <Badge variant="secondary" className="ml-1">
            {filteredCount}
          </Badge>
        </div>

        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="secondary" className="text-xs">
            {filteredCount} / {totalShortcuts}
          </Badge>
        </div>
      </div>

      {/* Shortcuts grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
          {filteredCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No shortcuts found</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          ) : (
            filteredCategories.map((category) => {
              const CategoryIcon = category.icon;
              return (
                <Card key={category.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CategoryIcon className={`h-5 w-5 ${category.iconColor}`} />
                      {category.name}
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {category.shortcuts.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {category.shortcuts.map((shortcut) => (
                        <ShortcutButton key={shortcut.id} shortcut={shortcut} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
