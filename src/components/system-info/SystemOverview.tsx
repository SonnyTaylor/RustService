/**
 * SystemOverview Component
 *
 * Hero card showing system identity, OS, and uptime at a glance.
 * Also includes the System Details section (OS card + BIOS card).
 */

import {
  Server,
  Layers,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SystemInfo } from '@/types';
import { formatUptime } from '@/types';
import { SectionHeader, InfoRow } from '@/components/system-info/system-info-helpers';

interface SystemOverviewProps {
  systemInfo: SystemInfo;
}

export function SystemOverview({ systemInfo }: SystemOverviewProps) {
  const bootTimeLabel =
    systemInfo.bootTime > 0
      ? new Date(systemInfo.bootTime * 1000).toLocaleString()
      : null;

  const systemIdentity = [
    systemInfo.systemProduct?.vendor,
    systemInfo.systemProduct?.model,
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* Hero Card — System Overview */}
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

      {/* Operating System & BIOS */}
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
    </>
  );
}
