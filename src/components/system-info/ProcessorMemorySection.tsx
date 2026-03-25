/**
 * ProcessorMemorySection Component
 *
 * Displays CPU specs, per-core usage, memory/swap usage, and RAM slot details.
 */

import {
  Cpu,
  MemoryStick,
  Database,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SystemInfo } from '@/types';
import { formatBytes } from '@/types';
import { SectionHeader, InfoRow, UsageBar } from '@/components/system-info/system-info-helpers';

interface ProcessorMemorySectionProps {
  systemInfo: SystemInfo;
}

export function ProcessorMemorySection({ systemInfo }: ProcessorMemorySectionProps) {
  return (
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
  );
}
