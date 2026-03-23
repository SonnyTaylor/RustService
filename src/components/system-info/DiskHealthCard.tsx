import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import type { DiskHealthInfo } from './types';
import { InfoRow } from './system-info-helpers';

// ============================================================================
// Disk Health Card Component
// ============================================================================

export function DiskHealthCard({ disk }: { disk: DiskHealthInfo }) {
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
      <CardContent className="space-y-2">
        <InfoRow label="Firmware" value={disk.firmware} mono />
        {disk.temperatureC !== null && (
          <div className="flex justify-between items-center py-2">
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
          <div className="flex justify-between items-center py-2">
            <span className="text-muted-foreground text-sm">Reallocated Sectors</span>
            <Badge variant={disk.reallocatedSectors > 0 ? 'destructive' : 'secondary'}>
              {disk.reallocatedSectors}
            </Badge>
          </div>
        )}
        {disk.pendingSectors !== null && (
          <div className="flex justify-between items-center py-2">
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

export function formatRestorePointDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}
