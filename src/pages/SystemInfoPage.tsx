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
  AlertCircle,
  Loader2,
  Layers,
  Database,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
} from '@/types';
import { useSettings } from '@/components/settings-context';
import { PrintableSystemInfo } from '@/components/printable-system-info';

import type { DiskHealthResponse, RestorePointsResponse } from '@/components/system-info/types';
import {
  SectionHeader,
  InfoRow,
  UsageBar,
  LoadingSkeleton,
  RefreshOverlay,
} from '@/components/system-info/system-info-helpers';
import { DiskHealthCard, formatRestorePointDate } from '@/components/system-info/DiskHealthCard';

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

  // Build system identity string
  const systemIdentity = [
    systemInfo.systemProduct?.vendor,
    systemInfo.systemProduct?.model,
  ].filter(Boolean).join(' ');

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="relative p-4 space-y-8">
          <RefreshOverlay visible={refreshing} />

      {/* ================================================================ */}
      {/* Header with controls                                             */}
      {/* ================================================================ */}
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

      {/* ================================================================ */}
      {/* Hero Card — System Overview                                      */}
      {/* ================================================================ */}
      <Card className="bg-gradient-to-r from-card to-card/80 border-border/60">
        <CardContent className="py-6 px-8">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Identity */}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Device</p>
              <p className="text-lg font-semibold">{systemInfo.os.hostname || 'Unknown'}</p>
              {systemIdentity && (
                <p className="text-sm text-muted-foreground">{systemIdentity}</p>
              )}
              {systemInfo.systemProduct?.serialNumber && (
                <p className="text-xs text-muted-foreground font-mono">
                  S/N: {systemInfo.systemProduct.serialNumber}
                </p>
              )}
            </div>
            {/* OS */}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Operating System</p>
              <p className="text-lg font-semibold">{systemInfo.os.name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">{systemInfo.os.osVersion}</p>
            </div>
            {/* Uptime */}
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Uptime</p>
              <p className="text-lg font-semibold">{formatUptime(systemInfo.uptimeSeconds)}</p>
              {bootTimeLabel && (
                <p className="text-sm text-muted-foreground">Boot: {bootTimeLabel}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================ */}
      {/* Operating System & BIOS                                          */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <SectionHeader icon={Server} title="System Details" iconColor="text-blue-500" />
        <div className="grid gap-6 md:grid-cols-2">
          {/* OS Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5 text-blue-500" />
                Operating System
              </CardTitle>
              <CardDescription>System and kernel information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="Name" value={systemInfo.os.name} />
              <InfoRow label="Version" value={systemInfo.os.osVersion} />
              <InfoRow label="Build" value={systemInfo.os.longOsVersion} />
              <InfoRow label="Kernel" value={systemInfo.os.kernelVersion} mono />
              <InfoRow label="Hostname" value={systemInfo.os.hostname} />
            </CardContent>
          </Card>

          {/* BIOS Card */}
          {systemInfo.bios && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers className="h-5 w-5 text-blue-500" />
                  BIOS / Firmware
                </CardTitle>
                <CardDescription>System firmware details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <InfoRow label="Manufacturer" value={systemInfo.bios.manufacturer} />
                <InfoRow label="Version" value={systemInfo.bios.version} mono />
                <InfoRow label="Release Date" value={systemInfo.bios.releaseDate} />
                <InfoRow label="Serial Number" value={systemInfo.bios.serialNumber} mono />
                {systemInfo.systemProduct?.uuid && (
                  <InfoRow label="System UUID" value={systemInfo.systemProduct.uuid} mono />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Processor & Memory                                               */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <SectionHeader icon={Cpu} title="Processor & Memory" iconColor="text-orange-500" />
        <div className="grid gap-6 md:grid-cols-2">
          {/* CPU Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cpu className="h-5 w-5 text-orange-500" />
                Processor
              </CardTitle>
              <CardDescription>CPU specifications and usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
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
              {systemInfo.cpuSocket && (
                <InfoRow label="Socket" value={systemInfo.cpuSocket} />
              )}
              {systemInfo.cpuL2CacheKb != null && (
                <InfoRow label="L2 Cache" value={`${systemInfo.cpuL2CacheKb.toLocaleString()} KB`} />
              )}
              {systemInfo.cpuL3CacheKb != null && (
                <InfoRow label="L3 Cache" value={`${(systemInfo.cpuL3CacheKb / 1024).toFixed(0)} MB`} />
              )}
              <Separator className="my-2" />
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground text-sm">Average CPU usage</span>
                <Badge variant={systemInfo.cpu.globalUsage > 80 ? 'destructive' : 'secondary'}>
                  {systemInfo.cpu.globalUsage.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={systemInfo.cpu.globalUsage} className="h-2" />
            </CardContent>
          </Card>

          {/* Memory Card */}
          <Card>
            <CardHeader>
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

          {/* CPU Cores Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cpu className="h-5 w-5 text-orange-500" />
                CPU Cores
              </CardTitle>
              <CardDescription>Per-core usage snapshot</CardDescription>
            </CardHeader>
            <CardContent>
              {systemInfo.cpu.cores.length > 0 ? (
                <ScrollArea className="h-52">
                  <div className="space-y-2.5 pr-2">
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

          {/* RAM Slots Card */}
          {systemInfo.ramSlots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5 text-green-500" />
                  Memory Modules
                </CardTitle>
                <CardDescription>
                  {systemInfo.ramSlots.length} DIMM{systemInfo.ramSlots.length > 1 ? 's' : ''} installed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-52">
                  <div className="space-y-4 pr-2">
                    {systemInfo.ramSlots.map((slot, index) => (
                      <div key={`ram-${index}`} className="space-y-1.5 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {slot.deviceLocator || slot.bankLabel || `Slot ${index + 1}`}
                          </span>
                          <div className="flex items-center gap-2">
                            {slot.capacityBytes != null && (
                              <Badge variant="secondary">{formatBytes(slot.capacityBytes)}</Badge>
                            )}
                            {slot.speedMhz != null && (
                              <Badge variant="outline">{slot.speedMhz} MHz</Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
                          {slot.manufacturer && <span>Mfr: {slot.manufacturer}</span>}
                          {slot.memoryType && <span>Type: {slot.memoryType}</span>}
                          {slot.partNumber && <span>P/N: {slot.partNumber}</span>}
                          {slot.formFactor && <span>Form: {slot.formFactor}</span>}
                          {slot.serialNumber && <span className="font-mono">S/N: {slot.serialNumber}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* Motherboard & GPU                                                */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <SectionHeader icon={CircuitBoard} title="Mainboard & Graphics" iconColor="text-purple-500" />
        <div className="grid gap-6 md:grid-cols-2">
          {/* Motherboard Card */}
          {systemInfo.motherboard && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CircuitBoard className="h-5 w-5 text-purple-500" />
                  Motherboard
                </CardTitle>
                <CardDescription>Board manufacturer and model</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gpu className="h-5 w-5 text-red-500" />
                  Graphics Card
                </CardTitle>
                <CardDescription>GPU specifications and usage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
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
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground text-sm flex items-center gap-1">
                    <Zap className="h-3 w-3" /> GPU Load
                  </span>
                  <Badge variant={systemInfo.gpu.loadPct > 80 ? 'destructive' : 'secondary'}>
                    {systemInfo.gpu.loadPct}%
                  </Badge>
                </div>
                {systemInfo.gpu.temperature > 0 && (
                  <div className="flex justify-between items-center py-2">
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
        </div>
      </div>

      {/* ================================================================ */}
      {/* Power & Thermals                                                 */}
      {/* ================================================================ */}
      {(systemInfo.batteries.length > 0 || systemInfo.components.length > 0) && (
        <div className="space-y-4">
          <SectionHeader icon={Battery} title="Power & Thermals" iconColor="text-yellow-500" />
          <div className="grid gap-6 md:grid-cols-2">
            {/* Battery Cards */}
            {systemInfo.batteries.map((battery, index) => (
              <Card key={`battery-${index}`}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Battery className="h-5 w-5 text-yellow-500" />
                    Battery {systemInfo.batteries.length > 1 ? index + 1 : ''}
                  </CardTitle>
                  <CardDescription>
                    {battery.vendor || 'Unknown'} {battery.model ? `• ${battery.model}` : ''} • {battery.technology}
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
                    label="Design Capacity"
                    value={`${battery.energyFullDesignWh.toFixed(1)} Wh`}
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

            {/* Temperature Sensors Card */}
            {systemInfo.components.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Thermometer className="h-5 w-5 text-red-500" />
                    Temperature Sensors
                  </CardTitle>
                  <CardDescription>Hardware component temperatures</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className={systemInfo.components.length > 6 ? 'h-52' : ''}>
                    <div className="space-y-2">
                      {systemInfo.components.map((component, index) => (
                        <div key={`temp-${index}`} className="flex justify-between items-center py-2">
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
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Storage                                                          */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <SectionHeader icon={HardDrive} title="Storage" iconColor="text-slate-500" />

        {/* Storage Devices */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {systemInfo.disks.map((disk, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="pb-3">
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

        {/* Disk Health (S.M.A.R.T.) */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Disk Health (S.M.A.R.T.)
            </h4>
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
      </div>

      {/* ================================================================ */}
      {/* Network                                                          */}
      {/* ================================================================ */}
      {systemInfo.networks.length > 0 && (
        <div className="space-y-4">
          <SectionHeader icon={Network} title="Network Interfaces" iconColor="text-sky-500" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {systemInfo.networks.map((net, index) => (
              <Card key={`net-${index}`} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-medium truncate">
                      {net.name}
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs font-mono">
                    {net.macAddress}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground block text-xs mb-0.5">Received</span>
                      <span className="font-medium">{formatBytes(net.totalReceived)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-xs mb-0.5">Transmitted</span>
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

      {/* ================================================================ */}
      {/* System Activity                                                  */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <SectionHeader icon={Activity} title="System Activity" iconColor="text-cyan-500" />
        <div className="grid gap-6 md:grid-cols-2">
          {/* Top Processes Card */}
          {systemInfo.topProcesses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-cyan-500" />
                  Top Processes
                </CardTitle>
                <CardDescription>Highest CPU usage right now</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-52">
                  <div className="space-y-2.5 pr-2">
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

          {/* Load Average Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-cyan-500" />
                System Load
              </CardTitle>
              <CardDescription>CPU load averages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground text-sm">1 minute</span>
                <Badge variant={systemInfo.loadAvg.one > 1.0 ? 'destructive' : 'secondary'}>
                  {systemInfo.loadAvg.one.toFixed(2)}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground text-sm">5 minutes</span>
                <Badge variant={systemInfo.loadAvg.five > 1.0 ? 'destructive' : 'secondary'}>
                  {systemInfo.loadAvg.five.toFixed(2)}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2">
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-indigo-500" />
                  System Users
                </CardTitle>
                <CardDescription>{systemInfo.users.length} user(s) on this system</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {systemInfo.users.map((user, index) => (
                  <div key={`user-${index}`} className="py-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{user.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {user.groups.length} group(s)
                      </Badge>
                    </div>
                    {user.groups.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
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
      </div>

      {/* ================================================================ */}
      {/* System Restore Points                                            */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader icon={History} title="System Restore Points" iconColor="text-slate-500" />
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
          <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1 pb-2">
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
