/**
 * System Info Page Component
 * 
 * Displays comprehensive hardware and OS information using shadcn components.
 * Data is collected via the sysinfo Rust crate on the backend.
 * 
 * Designed to be extensible for additional system info sections.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useReactToPrint } from 'react-to-print';
import {
  Monitor,
  Cpu,
  MemoryStick,
  HardDrive,
  RefreshCw,
  Server,
  Clock,
  CircuitBoard,
  Gpu,
  Battery,
  Thermometer,
  Zap,
  Network,
  Users,
  Activity,
  Printer,
  Shield,
  History,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { 
  SystemInfo, 
  formatBytes, 
  formatUptime, 
  calculatePercentage 
} from '@/types';
import { useSettings } from '@/components/settings-context';
import { PrintableSystemInfo } from '@/components/printable-system-info';

// ============================================================================
// Disk Health & Restore Point Types
// ============================================================================

interface SmartAttribute {
  id: number;
  name: string;
  value: number;
  worst: number;
  threshold: number;
  rawValue: string;
}

interface DiskHealthInfo {
  device: string;
  model: string;
  serial: string;
  firmware: string;
  healthPassed: boolean;
  temperatureC: number | null;
  powerOnHours: number | null;
  reallocatedSectors: number | null;
  pendingSectors: number | null;
  crcErrors: number | null;
  wearLevelingPct: number | null;
  attributes: SmartAttribute[];
}

interface DiskHealthResponse {
  disks: DiskHealthInfo[];
  smartctlFound: boolean;
  error: string | null;
}

interface RestorePoint {
  sequenceNumber: number;
  description: string;
  creationTime: string;
  restoreType: string;
}

interface RestorePointsResponse {
  restorePoints: RestorePoint[];
  error: string | null;
}

/**
 * Info row component for displaying label-value pairs
 */
function InfoRow({ label, value, mono = false }: { 
  label: string; 
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>
        {value || 'N/A'}
      </span>
    </div>
  );
}

/**
 * Usage bar component for memory/disk usage visualization
 */
function UsageBar({ 
  label, 
  used, 
  total,
}: { 
  label: string;
  used: number;
  total: number;
}) {
  const percentage = calculatePercentage(used, total);
  const isHigh = percentage > 85;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {formatBytes(used)} / {formatBytes(total)}
          <Badge 
            variant={isHigh ? 'destructive' : 'secondary'} 
            className="ml-2 text-xs"
          >
            {percentage}%
          </Badge>
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={`h-2 ${isHigh ? '[&>div]:bg-destructive' : ''}`}
      />
    </div>
  );
}

/**
 * Loading skeleton for system info cards
 */
function LoadingSkeleton() {
  return (
    <div className="p-6 grid gap-6 md:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Refresh overlay skeleton (cross-fades over existing content)
 */
function RefreshOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      className={
        `absolute inset-0 pointer-events-none transition-opacity duration-300 ` +
        `${visible ? 'opacity-100' : 'opacity-0'}`
      }
      aria-hidden
    >
      <div className="absolute inset-0 bg-background/60" />
      <div className="relative p-6 grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Disk Health Card Component
// ============================================================================

function DiskHealthCard({ disk }: { disk: DiskHealthInfo }) {
  const [expanded, setExpanded] = useState(false);

  const healthColor = disk.healthPassed ? 'bg-green-500/20 text-green-600 border-green-500/30' : 'bg-red-500/20 text-red-600 border-red-500/30';
  const healthLabel = disk.healthPassed ? 'Healthy' : 'Failed';

  // Determine warning conditions
  const hasWarning = !disk.healthPassed ||
    (disk.reallocatedSectors !== null && disk.reallocatedSectors > 0) ||
    (disk.pendingSectors !== null && disk.pendingSectors > 0) ||
    (disk.temperatureC !== null && disk.temperatureC > 55);

  return (
    <Card className={hasWarning && disk.healthPassed ? 'border-yellow-500/40' : !disk.healthPassed ? 'border-red-500/40' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium truncate max-w-[70%]">
            {disk.model}
          </CardTitle>
          <Badge className={healthColor}>
            {healthLabel}
          </Badge>
        </div>
        <CardDescription className="text-xs font-mono">{disk.serial}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <InfoRow label="Firmware" value={disk.firmware} mono />
        {disk.temperatureC !== null && (
          <div className="flex justify-between items-center py-1.5">
            <span className="text-muted-foreground text-sm">Temperature</span>
            <Badge variant={disk.temperatureC > 55 ? 'destructive' : disk.temperatureC > 45 ? 'default' : 'secondary'}>
              {disk.temperatureC}°C
            </Badge>
          </div>
        )}
        {disk.powerOnHours !== null && (
          <InfoRow label="Power-On Hours" value={disk.powerOnHours.toLocaleString()} />
        )}
        {disk.reallocatedSectors !== null && (
          <div className="flex justify-between items-center py-1.5">
            <span className="text-muted-foreground text-sm">Reallocated Sectors</span>
            <Badge variant={disk.reallocatedSectors > 0 ? 'destructive' : 'secondary'}>
              {disk.reallocatedSectors}
            </Badge>
          </div>
        )}
        {disk.pendingSectors !== null && (
          <div className="flex justify-between items-center py-1.5">
            <span className="text-muted-foreground text-sm">Pending Sectors</span>
            <Badge variant={disk.pendingSectors > 0 ? 'destructive' : 'secondary'}>
              {disk.pendingSectors}
            </Badge>
          </div>
        )}
        {disk.crcErrors !== null && disk.crcErrors > 0 && (
          <InfoRow label="CRC Errors" value={disk.crcErrors.toString()} />
        )}
        {disk.wearLevelingPct !== null && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">SSD Life Remaining</span>
              <Badge variant={disk.wearLevelingPct < 20 ? 'destructive' : disk.wearLevelingPct < 50 ? 'default' : 'secondary'}>
                {disk.wearLevelingPct}%
              </Badge>
            </div>
            <Progress value={disk.wearLevelingPct} className={`h-2 ${disk.wearLevelingPct < 20 ? '[&>div]:bg-destructive' : ''}`} />
          </div>
        )}

        {/* Expandable SMART attributes */}
        {disk.attributes.length > 0 && (
          <>
            <Separator className="my-2" />
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
                  All S.M.A.R.T. Attributes ({disk.attributes.length})
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="h-48 mt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1 pr-1">ID</th>
                        <th className="text-left py-1 pr-1">Attribute</th>
                        <th className="text-right py-1 pr-1">Val</th>
                        <th className="text-right py-1 pr-1">Wst</th>
                        <th className="text-right py-1 pr-1">Thr</th>
                        <th className="text-right py-1">Raw</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disk.attributes.map((attr) => (
                        <tr key={attr.id} className={attr.value <= attr.threshold && attr.threshold > 0 ? 'bg-destructive/10' : ''}>
                          <td className="py-0.5 pr-1 font-mono text-muted-foreground">{attr.id}</td>
                          <td className="py-0.5 pr-1 truncate max-w-[120px]">{attr.name}</td>
                          <td className="py-0.5 pr-1 text-right font-mono">{attr.value}</td>
                          <td className="py-0.5 pr-1 text-right font-mono">{attr.worst}</td>
                          <td className="py-0.5 pr-1 text-right font-mono">{attr.threshold}</td>
                          <td className="py-0.5 text-right font-mono truncate max-w-[80px]">{attr.rawValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Restore Point Date Formatting
// ============================================================================

function formatRestorePointDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

/**
 * System Info Page - Main component
 */
export function SystemInfoPage() {
  const { settings } = useSettings();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [diskHealth, setDiskHealth] = useState<DiskHealthResponse | null>(null);
  const [diskHealthLoading, setDiskHealthLoading] = useState(false);
  const [restorePoints, setRestorePoints] = useState<RestorePointsResponse | null>(null);
  const [restorePointsLoading, setRestorePointsLoading] = useState(false);
  const [creatingRestorePoint, setCreatingRestorePoint] = useState(false);
  const [restorePointDesc, setRestorePointDesc] = useState('');
  const [restorePointDialogOpen, setRestorePointDialogOpen] = useState(false);
  const [restorePointError, setRestorePointError] = useState<string | null>(null);
  const [restorePointSuccess, setRestorePointSuccess] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `System_Info_${systemInfo?.os.hostname || 'Device'}`,
  });

  /**
   * Fetch system information from backend
   */
  const fetchSystemInfo = useCallback(async (isRefresh = false) => {
    try {
      // Prevent overlapping requests (auto-refresh + manual refresh)
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const requestId = ++requestIdRef.current;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      
      setError(null);
      const info = await invoke<SystemInfo>('get_system_info');

      // Avoid out-of-order updates
      if (requestId === requestIdRef.current) {
        setSystemInfo(info);
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch disk health data
  const fetchDiskHealth = useCallback(async () => {
    setDiskHealthLoading(true);
    try {
      const result = await invoke<DiskHealthResponse>('get_disk_health');
      setDiskHealth(result);
    } catch (err) {
      setDiskHealth({ disks: [], smartctlFound: false, error: String(err) });
    } finally {
      setDiskHealthLoading(false);
    }
  }, []);

  // Fetch restore points
  const fetchRestorePoints = useCallback(async () => {
    setRestorePointsLoading(true);
    try {
      const result = await invoke<RestorePointsResponse>('get_restore_points');
      setRestorePoints(result);
    } catch (err) {
      setRestorePoints({ restorePoints: [], error: String(err) });
    } finally {
      setRestorePointsLoading(false);
    }
  }, []);

  // Create a restore point
  const handleCreateRestorePoint = async () => {
    if (!restorePointDesc.trim()) return;
    setCreatingRestorePoint(true);
    setRestorePointError(null);
    setRestorePointSuccess(null);
    try {
      const msg = await invoke<string>('create_restore_point', { description: restorePointDesc.trim() });
      setRestorePointSuccess(msg);
      setRestorePointDesc('');
      setRestorePointDialogOpen(false);
      // Refresh the list
      fetchRestorePoints();
    } catch (err) {
      setRestorePointError(String(err));
    } finally {
      setCreatingRestorePoint(false);
    }
  };

  // Fetch on mount
  useEffect(() => {
    fetchSystemInfo();
    fetchDiskHealth();
    fetchRestorePoints();
  }, [fetchSystemInfo, fetchDiskHealth, fetchRestorePoints]);

  // Handle refresh
  const handleRefresh = () => fetchSystemInfo(true);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const id = window.setInterval(() => {
      fetchSystemInfo(true);
    }, 2000);

    return () => window.clearInterval(id);
  }, [autoRefresh, fetchSystemInfo]);

  // Loading state
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-destructive">
        <Monitor className="h-16 w-16" />
        <h2 className="text-xl font-semibold">Failed to load system info</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => fetchSystemInfo()}>Try Again</Button>
      </div>
    );
  }

  if (!systemInfo) return null;

  const bootTimeLabel =
    systemInfo.bootTime > 0
      ? new Date(systemInfo.bootTime * 1000).toLocaleString()
      : null;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="relative p-6 space-y-6">
          <RefreshOverlay visible={refreshing} />
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" />
            System Information
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Hardware and operating system details
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              disabled={loading}
            />
            <Label htmlFor="auto-refresh" className="text-sm text-muted-foreground">
              Auto refresh
            </Label>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePrint}
            disabled={loading || !systemInfo}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Specs
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Info Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        
        {/* OS Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-blue-500" />
              Operating System
            </CardTitle>
            <CardDescription>System and kernel information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow label="Name" value={systemInfo.os.name} />
            <InfoRow label="Version" value={systemInfo.os.osVersion} />
            <InfoRow label="Build" value={systemInfo.os.longOsVersion} />
            <InfoRow label="Kernel" value={systemInfo.os.kernelVersion} mono />
            <InfoRow label="Hostname" value={systemInfo.os.hostname} />
            <Separator className="my-2" />
            <InfoRow 
              label="Uptime" 
              value={formatUptime(systemInfo.uptimeSeconds)} 
            />
            <InfoRow label="Boot time" value={bootTimeLabel} />
          </CardContent>
        </Card>

        {/* CPU Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cpu className="h-5 w-5 text-orange-500" />
              Processor
            </CardTitle>
            <CardDescription>CPU specifications and usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow label="Model" value={systemInfo.cpu.brand} />
            <InfoRow label="Vendor" value={systemInfo.cpu.vendorId} />
            <InfoRow 
              label="Cores" 
              value={systemInfo.cpu.physicalCores?.toString() || 'N/A'} 
            />
            <InfoRow label="Threads" value={systemInfo.cpu.logicalCpus.toString()} />
            <InfoRow 
              label="Frequency" 
              value={`${systemInfo.cpu.frequencyMhz} MHz`} 
            />
            <Separator className="my-2" />
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Average CPU usage</span>
              <Badge variant={systemInfo.cpu.globalUsage > 80 ? 'destructive' : 'secondary'}>
                {systemInfo.cpu.globalUsage.toFixed(1)}%
              </Badge>
            </div>
            <Progress value={systemInfo.cpu.globalUsage} className="h-2 mt-2" />
          </CardContent>
        </Card>

        {/* CPU Cores Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Cpu className="h-5 w-5 text-orange-500" />
              CPU Cores
            </CardTitle>
            <CardDescription>Per-core usage snapshot</CardDescription>
          </CardHeader>
          <CardContent>
            {systemInfo.cpu.cores.length > 0 ? (
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-2">
                  {systemInfo.cpu.cores.map((core, index) => (
                    <div key={`core-${index}`} className="space-y-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground truncate max-w-[60%]">
                          {core.name || `Core ${index + 1}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {core.frequencyMhz} MHz
                          </span>
                          <Badge variant={core.cpuUsage > 80 ? 'destructive' : 'secondary'}>
                            {core.cpuUsage.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <Progress value={core.cpuUsage} className="h-2" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-sm text-muted-foreground">No per-core data available.</div>
            )}
          </CardContent>
        </Card>

        {/* Memory Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MemoryStick className="h-5 w-5 text-green-500" />
              Memory
            </CardTitle>
            <CardDescription>RAM and swap usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBar
              label="RAM"
              used={systemInfo.memory.usedMemory}
              total={systemInfo.memory.totalMemory}
            />
            {systemInfo.memory.totalSwap > 0 && (
              <UsageBar
                label="Swap"
                used={systemInfo.memory.usedSwap}
                total={systemInfo.memory.totalSwap}
              />
            )}
            <Separator className="my-2" />
            <InfoRow 
              label="Available" 
              value={formatBytes(systemInfo.memory.availableMemory)} 
            />
          </CardContent>
        </Card>

        {/* Top Processes Card */}
        {systemInfo.topProcesses.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-cyan-500" />
                Top Processes
              </CardTitle>
              <CardDescription>Highest CPU usage right now</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <div className="space-y-2 pr-2">
                  {systemInfo.topProcesses.slice(0, 10).map((p) => (
                    <div key={p.pid} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">PID {p.pid}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatBytes(p.memoryBytes)}</span>
                        <Badge variant={p.cpuUsage > 80 ? 'destructive' : 'secondary'}>
                          {p.cpuUsage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Motherboard Card */}
        {systemInfo.motherboard && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircuitBoard className="h-5 w-5 text-purple-500" />
                Motherboard
              </CardTitle>
              <CardDescription>Board manufacturer and model</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="Manufacturer" value={systemInfo.motherboard.vendor} />
              <InfoRow label="Model" value={systemInfo.motherboard.name} />
              <InfoRow label="Version" value={systemInfo.motherboard.version} />
              <InfoRow label="Serial" value={systemInfo.motherboard.serialNumber} mono />
            </CardContent>
          </Card>
        )}

        {/* GPU Card */}
        {systemInfo.gpu && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Gpu className="h-5 w-5 text-red-500" />
                Graphics Card
              </CardTitle>
              <CardDescription>GPU specifications and usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="Model" value={systemInfo.gpu.model} />
              <InfoRow label="Vendor" value={systemInfo.gpu.vendor} />
              <InfoRow label="Family" value={systemInfo.gpu.family} />
              <InfoRow 
                label="Device ID" 
                value={`0x${systemInfo.gpu.deviceId.toString(16).toUpperCase()}`} 
                mono 
              />
              <Separator className="my-2" />
              <UsageBar
                label="VRAM"
                used={systemInfo.gpu.usedVram}
                total={systemInfo.gpu.totalVram}
              />
              <Separator className="my-2" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm flex items-center gap-1">
                  <Zap className="h-3 w-3" /> GPU Load
                </span>
                <Badge variant={systemInfo.gpu.loadPct > 80 ? 'destructive' : 'secondary'}>
                  {systemInfo.gpu.loadPct}%
                </Badge>
              </div>
              {systemInfo.gpu.temperature > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm flex items-center gap-1">
                    <Thermometer className="h-3 w-3" /> Temperature
                  </span>
                  <Badge variant={systemInfo.gpu.temperature / 1000 > 80 ? 'destructive' : 'secondary'}>
                    {(systemInfo.gpu.temperature / 1000).toFixed(0)}°C
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Battery Cards */}
        {systemInfo.batteries.map((battery, index) => (
          <Card key={`battery-${index}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Battery className="h-5 w-5 text-yellow-500" />
                Battery {systemInfo.batteries.length > 1 ? index + 1 : ''}
              </CardTitle>
              <CardDescription>
                {battery.vendor || 'Unknown'} • {battery.technology}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Charge</span>
                  <span className="font-medium flex items-center gap-2">
                    <Badge 
                      variant={battery.state === 'Charging' ? 'default' : 
                               battery.stateOfCharge < 0.2 ? 'destructive' : 'secondary'}
                    >
                      {battery.state}
                    </Badge>
                    {(battery.stateOfCharge * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress value={battery.stateOfCharge * 100} className="h-2" />
              </div>
              <Separator className="my-2" />
              <InfoRow 
                label="Capacity" 
                value={`${battery.energyWh.toFixed(1)} / ${battery.energyFullWh.toFixed(1)} Wh`} 
              />
              <InfoRow 
                label="Health" 
                value={`${(battery.stateOfHealth * 100).toFixed(0)}%`} 
              />
              <InfoRow 
                label="Power" 
                value={`${battery.powerRateW.toFixed(1)} W`} 
              />
              <InfoRow 
                label="Voltage" 
                value={`${battery.voltage.toFixed(2)} V`} 
              />
              {battery.cycleCount && (
                <InfoRow label="Cycles" value={battery.cycleCount.toString()} />
              )}
              {battery.temperature && (
                <InfoRow label="Temp" value={`${battery.temperature.toFixed(1)}°C`} />
              )}
              {battery.timeToFullSecs && (
                <InfoRow 
                  label="Time to Full" 
                  value={formatUptime(battery.timeToFullSecs)} 
                />
              )}
              {battery.timeToEmptySecs && (
                <InfoRow 
                  label="Time Remaining" 
                  value={formatUptime(battery.timeToEmptySecs)} 
                />
              )}
            </CardContent>
          </Card>
        ))}

        {/* Temperature Sensors Card (if any) */}
        {systemInfo.components.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Thermometer className="h-5 w-5 text-red-500" />
                Temperature Sensors
              </CardTitle>
              <CardDescription>Hardware component temperatures</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {systemInfo.components.map((component, index) => (
                <div key={`temp-${index}`} className="flex justify-between items-center py-1.5">
                  <span className="text-muted-foreground text-sm truncate max-w-[60%]">
                    {component.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {component.temperature !== null && (
                      <Badge 
                        variant={
                          component.criticalTemperature !== null && 
                          component.temperature >= component.criticalTemperature 
                            ? 'destructive' 
                            : component.temperature > 70 
                              ? 'default' 
                              : 'secondary'
                        }
                      >
                        {component.temperature.toFixed(0)}°C
                      </Badge>
                    )}
                    {component.criticalTemperature !== null && (
                      <span className="text-xs text-muted-foreground">
                        (max: {component.criticalTemperature.toFixed(0)}°C)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Load Average Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-cyan-500" />
              System Load
            </CardTitle>
            <CardDescription>CPU load averages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-muted-foreground text-sm">1 minute</span>
              <Badge variant={systemInfo.loadAvg.one > 1.0 ? 'destructive' : 'secondary'}>
                {systemInfo.loadAvg.one.toFixed(2)}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-muted-foreground text-sm">5 minutes</span>
              <Badge variant={systemInfo.loadAvg.five > 1.0 ? 'destructive' : 'secondary'}>
                {systemInfo.loadAvg.five.toFixed(2)}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-muted-foreground text-sm">15 minutes</span>
              <Badge variant={systemInfo.loadAvg.fifteen > 1.0 ? 'destructive' : 'secondary'}>
                {systemInfo.loadAvg.fifteen.toFixed(2)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Users Card */}
        {systemInfo.users.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-indigo-500" />
                System Users
              </CardTitle>
              <CardDescription>{systemInfo.users.length} user(s) on this system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {systemInfo.users.map((user, index) => (
                <div key={`user-${index}`} className="py-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{user.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {user.groups.length} group(s)
                    </Badge>
                  </div>
                  {user.groups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {user.groups.slice(0, 5).map((group, gi) => (
                        <Badge key={gi} variant="secondary" className="text-xs">
                          {group}
                        </Badge>
                      ))}
                      {user.groups.length > 5 && (
                        <span className="text-xs text-muted-foreground">
                          +{user.groups.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Network Interfaces Section */}
      {systemInfo.networks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Network className="h-5 w-5" />
            Network Interfaces
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {systemInfo.networks.map((net, index) => (
              <Card key={`net-${index}`} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium truncate">
                      {net.name}
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs font-mono">
                    {net.macAddress}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs">↓ Received</span>
                      <span className="font-medium">{formatBytes(net.totalReceived)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs">↑ Transmitted</span>
                      <span className="font-medium">{formatBytes(net.totalTransmitted)}</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Packets In: {net.packetsReceived.toLocaleString()}</div>
                    <div>Packets Out: {net.packetsTransmitted.toLocaleString()}</div>
                    {(net.errorsReceived > 0 || net.errorsTransmitted > 0) && (
                      <>
                        <div className="text-destructive">RX Errors: {net.errorsReceived}</div>
                        <div className="text-destructive">TX Errors: {net.errorsTransmitted}</div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Disks Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Storage Devices
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {systemInfo.disks.map((disk, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-medium">
                    {disk.mountPoint}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {disk.diskType}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {disk.name || 'Local Disk'} • {disk.fileSystem}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageBar
                  label="Used"
                  used={disk.totalSpace - disk.availableSpace}
                  total={disk.totalSpace}
                />
                {disk.isRemovable && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    Removable
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Disk Health (S.M.A.R.T.) Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Disk Health (S.M.A.R.T.)
          </h3>
          <Button variant="outline" size="sm" onClick={fetchDiskHealth} disabled={diskHealthLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${diskHealthLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {diskHealthLoading && !diskHealth && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Scanning disk health...
            </CardContent>
          </Card>
        )}

        {diskHealth && !diskHealth.smartctlFound && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              smartctl not found. Install <span className="font-medium">smartmontools</span> or add smartctl.exe to your programs folder for S.M.A.R.T. health data.
            </AlertDescription>
          </Alert>
        )}

        {diskHealth && diskHealth.smartctlFound && diskHealth.disks.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No S.M.A.R.T. data available. Drives may not support S.M.A.R.T. or may require administrator privileges.
            </CardContent>
          </Card>
        )}

        {diskHealth && diskHealth.disks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {diskHealth.disks.map((disk, index) => (
              <DiskHealthCard key={`health-${index}`} disk={disk} />
            ))}
          </div>
        )}
      </div>

      {/* System Restore Points Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            System Restore Points
          </h3>
          <div className="flex items-center gap-2">
            <Dialog open={restorePointDialogOpen} onOpenChange={setRestorePointDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Create
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Restore Point</DialogTitle>
                  <DialogDescription>
                    Create a Windows System Restore point. This may require administrator privileges.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <input
                    type="text"
                    placeholder="Description (e.g., Before driver update)"
                    value={restorePointDesc}
                    onChange={(e) => setRestorePointDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                    maxLength={256}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && restorePointDesc.trim()) {
                        handleCreateRestorePoint();
                      }
                    }}
                  />
                  {restorePointError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{restorePointError}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreateRestorePoint}
                    disabled={!restorePointDesc.trim() || creatingRestorePoint}
                  >
                    {creatingRestorePoint && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Create Restore Point
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={fetchRestorePoints} disabled={restorePointsLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${restorePointsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {restorePointSuccess && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>{restorePointSuccess}</AlertDescription>
          </Alert>
        )}

        {restorePointsLoading && !restorePoints && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading restore points...
            </CardContent>
          </Card>
        )}

        {restorePoints && restorePoints.error && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{restorePoints.error}</AlertDescription>
          </Alert>
        )}

        {restorePoints && !restorePoints.error && restorePoints.restorePoints.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No restore points found on this system.
            </CardContent>
          </Card>
        )}

        {restorePoints && restorePoints.restorePoints.length > 0 && (
          <div className="grid gap-3">
            {restorePoints.restorePoints
              .sort((a, b) => b.sequenceNumber - a.sequenceNumber)
              .map((rp) => (
                <Card key={rp.sequenceNumber} className="overflow-hidden">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{rp.description}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRestorePointDate(rp.creationTime)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {rp.restoreType}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs ml-2">
                        #{rp.sequenceNumber}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Footer with timestamp */}
          <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" />
            Last updated: {(lastUpdated ?? new Date()).toLocaleTimeString()}
          </div>
        </div>
      </ScrollArea>

      {/* Hidden printable component */}
      <div className="hidden">
        <div ref={printRef}>
          <PrintableSystemInfo 
            systemInfo={systemInfo} 
            businessSettings={settings.business} 
          />
        </div>
      </div>
    </div>
  );
}
