/**
 * MainboardGraphicsSection Component
 *
 * Displays motherboard and GPU details.
 */

import {
  CircuitBoard,
  Gpu,
  Zap,
  Thermometer,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SystemInfo } from '@/types';
import { SectionHeader, InfoRow, UsageBar } from '@/components/system-info/system-info-helpers';

interface MainboardGraphicsSectionProps {
  systemInfo: SystemInfo;
}

export function MainboardGraphicsSection({ systemInfo }: MainboardGraphicsSectionProps) {
  return (
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
  );
}
