/**
 * Battery Report Renderer
 *
 * Custom renderer for powercfg /batteryreport results.
 * Shows battery health, capacity degradation, and history.
 */

import { BatteryCharging, Info, Zap, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface CapacityHistoryEntry {
  date: string;
  fullChargeCapacity: number;
  designCapacity: number;
}

interface BatteryData {
  type: 'battery_report';
  noBattery?: boolean;
  designCapacityMwh: number;
  fullChargeCapacityMwh: number;
  healthPercent: number;
  cycleCount: number | null;
  capacityHistory: CapacityHistoryEntry[];
  batteryName: string;
  manufacturer: string;
  chemistry: string;
  chargePercent: number | null;
  state: string | null;
  technology: string | null;
  timeToFullSecs: number | null;
  timeToEmptySecs: number | null;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as BatteryData | undefined;

  if (!data || data.type !== 'battery_report') return null;

  if (data.noBattery) {
    return (
      <Card className="overflow-hidden border-0 shadow-lg">
        <CardHeader className="px-4 py-2 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20">
          <CardTitle className="flex items-center gap-2 text-sm">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-500">
              <BatteryCharging className="h-5 w-5" />
            </div>
            Battery Report
            <Badge className="ml-auto bg-blue-500/10 text-blue-500 border-blue-500/20">No Battery</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <p className="text-sm">No battery detected. This appears to be a desktop system.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const health = data.healthPercent;
  const isGood = health >= 80;
  const isDegraded = health >= 50 && health < 80;
  const isCritical = health < 50 && health > 0;

  const getStatusColor = () => {
    if (isCritical) return 'from-red-500/10 to-orange-500/10 dark:from-red-500/20 dark:to-orange-500/20';
    if (isDegraded) return 'from-yellow-500/10 to-orange-500/10 dark:from-yellow-500/20 dark:to-orange-500/20';
    return 'from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20';
  };

  const getHealthColor = () => {
    if (isCritical) return 'text-red-500';
    if (isDegraded) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getProgressColor = () => {
    if (isCritical) return 'bg-red-500';
    if (isDegraded) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Build a simple capacity chart from history
  const recentHistory = data.capacityHistory.slice(-12);

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className={`px-4 py-2 bg-gradient-to-r ${getStatusColor()}`}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className={`p-2 rounded-lg ${isGood ? 'bg-green-500/20 text-green-500' : isDegraded ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'}`}>
            <BatteryCharging className="h-5 w-5" />
          </div>
          Battery Report
          <Badge className={`ml-auto ${isGood ? 'bg-green-500/10 text-green-500 border-green-500/20' : isDegraded ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
            {isGood ? 'Healthy' : isDegraded ? 'Degraded' : 'Replace'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-4">
        {/* Health Gauge */}
        <div className="text-center">
          <p className={`text-4xl font-bold ${getHealthColor()}`}>
            {health.toFixed(1)}%
          </p>
          <p className="text-sm text-muted-foreground">Battery Health</p>
          <div className="mt-2 h-3 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getProgressColor()}`}
              style={{ width: `${Math.min(100, health)}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Design Capacity</p>
            <p className="font-medium">{(data.designCapacityMwh / 1000).toFixed(1)} Wh</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Current Full Charge</p>
            <p className="font-medium">{(data.fullChargeCapacityMwh / 1000).toFixed(1)} Wh</p>
          </div>
          {data.cycleCount !== null && (
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Cycle Count</p>
              <p className="font-medium">{data.cycleCount}</p>
            </div>
          )}
          {data.chemistry && (
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Chemistry</p>
              <p className="font-medium">{data.chemistry}</p>
            </div>
          )}
          {data.chargePercent != null && (
            <div className="p-3 rounded-lg bg-muted/30 border flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Current Charge</p>
                <p className="font-medium">{data.chargePercent.toFixed(0)}%</p>
              </div>
            </div>
          )}
          {data.state && (
            <div className="p-3 rounded-lg bg-muted/30 border flex items-center gap-2">
              <BatteryCharging className="h-4 w-4 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">State</p>
                <p className="font-medium capitalize">{data.state.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          {(data.timeToFullSecs || data.timeToEmptySecs) && (
            <div className="p-3 rounded-lg bg-muted/30 border flex items-center gap-2 col-span-2">
              <Clock className="h-4 w-4 text-cyan-500 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">
                  {data.timeToFullSecs ? 'Time to Full' : 'Time Remaining'}
                </p>
                <p className="font-medium">
                  {formatTime(data.timeToFullSecs || data.timeToEmptySecs || 0)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Battery Info */}
        {(data.batteryName || data.manufacturer) && (
          <div className="p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs text-muted-foreground">Battery Info</p>
            <p className="text-sm font-medium">
              {[data.manufacturer, data.batteryName].filter(Boolean).join(' — ')}
            </p>
          </div>
        )}

        {/* Capacity History Chart */}
        {recentHistory.length > 1 && (
          <div>
            <p className="text-sm font-medium mb-2">Capacity History</p>
            <div className="flex items-end gap-1 h-24">
              {recentHistory.map((entry, i) => {
                const pct = entry.designCapacity > 0
                  ? (entry.fullChargeCapacity / entry.designCapacity) * 100
                  : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 group relative"
                    title={`${entry.date}: ${pct.toFixed(0)}%`}
                  >
                    <div
                      className={`w-full rounded-t transition-all ${pct >= 80 ? 'bg-green-500/70' : pct >= 50 ? 'bg-yellow-500/70' : 'bg-red-500/70'}`}
                      style={{ height: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{recentHistory[0]?.date}</span>
              <span>{recentHistory[recentHistory.length - 1]?.date}</span>
            </div>
          </div>
        )}

        {/* Warning */}
        {isCritical && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm font-medium text-red-600 dark:text-red-500">
              ⚠ Battery has significantly degraded. Consider replacement.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as BatteryData | undefined;

  if (!data || data.type !== 'battery_report') return null;

  if (data.noBattery) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100">
            <BatteryCharging className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="font-bold text-gray-800">Battery: Not Applicable</p>
            <p className="text-sm text-gray-500">Desktop system — no battery present.</p>
          </div>
        </div>
      </div>
    );
  }

  const health = data.healthPercent;
  const isGood = health >= 80;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <BatteryCharging className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood ? '✓' : '⚠'} Battery Health: {health.toFixed(0)}%
          </p>
          <p className="text-sm text-gray-500">
            Capacity: {(data.fullChargeCapacityMwh / 1000).toFixed(1)} Wh of {(data.designCapacityMwh / 1000).toFixed(1)} Wh design
            {data.cycleCount !== null && ` | ${data.cycleCount} cycles`}
            {data.chargePercent != null && ` | ${data.chargePercent.toFixed(0)}% charged`}
          </p>
          {health < 50 && (
            <p className="text-sm text-red-600 mt-1">⚠ Battery replacement recommended</p>
          )}
        </div>
        <div className={`text-2xl ${isGood ? 'text-green-500' : 'text-yellow-500'}`}>
          {health.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function BatteryReportRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') return <CustomerRenderer {...props} />;
  return <FindingsRenderer {...props} />;
}
