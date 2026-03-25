/**
 * PowerThermalsSection Component
 *
 * Displays battery information and temperature sensor readings.
 */

import {
  Battery,
  Thermometer,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SystemInfo } from '@/types';
import { formatUptime } from '@/types';
import { SectionHeader, InfoRow } from '@/components/system-info/system-info-helpers';

interface PowerThermalsSectionProps {
  systemInfo: SystemInfo;
}

export function PowerThermalsSection({ systemInfo }: PowerThermalsSectionProps) {
  if (systemInfo.batteries.length === 0 && systemInfo.components.length === 0) {
    return null;
  }

  return (
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
  );
}
