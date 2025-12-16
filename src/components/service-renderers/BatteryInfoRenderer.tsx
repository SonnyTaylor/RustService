/**
 * Battery Info Service Renderer
 *
 * Custom renderer for the battery-info service results.
 * Shows battery health with radial gauge and detailed stats.
 */

import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  BatteryCharging,
  Zap,
  Heart,
  RefreshCw,
  Clock,
  Info,
} from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface BatteryData {
  type: 'battery_status';
  batteryIndex: number;
  chargePercent: number;
  healthPercent: number;
  healthStatus: string;
  state: string;
  technology: string;
  cycleCount: number | null;
  timeToFullSecs: number | null;
  timeToEmptySecs: number | null;
  vendor: string | null;
  model: string | null;
}

interface NoBatteryData {
  type: 'no_battery';
}

// =============================================================================
// Helper Functions
// =============================================================================

function getHealthColor(health: number): string {
  if (health >= 80) return 'hsl(142, 71%, 45%)'; // green
  if (health >= 60) return 'hsl(48, 96%, 53%)'; // yellow
  if (health >= 40) return 'hsl(25, 95%, 53%)'; // orange
  return 'hsl(0, 84%, 60%)'; // red
}

function getHealthTextColor(health: number): string {
  if (health >= 80) return 'text-green-500';
  if (health >= 60) return 'text-yellow-500';
  if (health >= 40) return 'text-orange-500';
  return 'text-red-500';
}

function getBatteryIcon(state: string, charge: number) {
  if (state.toLowerCase().includes('charging')) {
    return <BatteryCharging className="h-6 w-6" />;
  }
  if (charge >= 80) return <BatteryFull className="h-6 w-6" />;
  if (charge >= 50) return <BatteryMedium className="h-6 w-6" />;
  if (charge >= 20) return <BatteryLow className="h-6 w-6" />;
  return <BatteryWarning className="h-6 w-6" />;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  // Check for no battery
  const noBatteryFinding = result.findings.find(
    (f) => (f.data as NoBatteryData | undefined)?.type === 'no_battery'
  );

  if (noBatteryFinding) {
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-gray-500/10 to-slate-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-500/20">
              <Battery className="h-5 w-5 text-gray-500" />
            </div>
            Battery Health Check
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-gray-500/10 text-gray-500">
              N/A
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Info className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No Battery Detected</h3>
            <p className="text-muted-foreground mt-1">
              This system does not have a battery installed. This is normal for desktop computers.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get battery data
  const batteryFinding = result.findings.find(
    (f) => (f.data as BatteryData | undefined)?.type === 'battery_status'
  );
  const batteryData = batteryFinding?.data as BatteryData | undefined;

  if (!batteryData) {
    return null;
  }

  const {
    chargePercent,
    healthPercent,
    healthStatus,
    state,
    technology,
    cycleCount,
    timeToFullSecs,
    timeToEmptySecs,
  } = batteryData;

  const chartData = [{ health: healthPercent, fill: getHealthColor(healthPercent) }];
  const chartConfig: ChartConfig = {
    health: {
      label: 'Health',
      color: getHealthColor(healthPercent),
    },
  };

  const isHealthy = healthPercent >= 80;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${healthPercent >= 60 ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
              {getBatteryIcon(state, chargePercent)}
            </div>
            Battery Health Check
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                isHealthy ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
              }`}
            >
              {healthStatus.toUpperCase()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Health Radial Chart */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <ChartContainer config={chartConfig} className="h-[160px] w-[160px]">
                  <RadialBarChart
                    data={chartData}
                    startAngle={90}
                    endAngle={-270}
                    innerRadius={55}
                    outerRadius={75}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="health" cornerRadius={10} background />
                  </RadialBarChart>
                </ChartContainer>
                {/* Centered text overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className={`text-2xl font-bold ${getHealthTextColor(healthPercent)}`}>
                    {healthPercent.toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Health</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Heart className={`h-4 w-4 ${getHealthTextColor(healthPercent)}`} />
                <span className="text-sm font-medium">{healthStatus}</span>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              {/* Current Charge */}
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <Zap className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Current Charge</p>
                  <p className="text-lg font-bold">{chargePercent.toFixed(0)}%</p>
                </div>
              </div>

              {/* State */}
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                {getBatteryIcon(state, chargePercent)}
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <p className="text-lg font-bold capitalize">{state.replace('_', ' ')}</p>
                </div>
              </div>

              {/* Technology */}
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <Battery className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Technology</p>
                  <p className="text-lg font-bold">{technology.replace('_', '-')}</p>
                </div>
              </div>

              {/* Cycle Count */}
              {cycleCount !== null && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Charge Cycles</p>
                    <p className="text-lg font-bold">{cycleCount}</p>
                  </div>
                </div>
              )}

              {/* Time Estimate */}
              {(timeToFullSecs || timeToEmptySecs) && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Clock className="h-5 w-5 text-cyan-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {timeToFullSecs ? 'Time to Full' : 'Time Remaining'}
                    </p>
                    <p className="text-lg font-bold">
                      {formatTime(timeToFullSecs || timeToEmptySecs || 0)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recommendation */}
          {healthPercent < 80 && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
              <Info className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                {healthPercent < 60
                  ? 'Battery health is significantly degraded. Consider replacing the battery soon.'
                  : 'Battery is showing some wear. Monitor for further degradation.'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  // Check for no battery
  const noBatteryFinding = result.findings.find(
    (f) => (f.data as NoBatteryData | undefined)?.type === 'no_battery'
  );

  if (noBatteryFinding) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gray-100">
            <Battery className="h-5 w-5 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
              Battery
            </p>
            <p className="text-xl font-bold text-gray-900">No Battery (Desktop)</p>
            <p className="text-sm text-gray-500">This is normal for desktop computers</p>
          </div>
          <div className="text-2xl text-gray-400">–</div>
        </div>
      </div>
    );
  }

  const batteryFinding = result.findings.find(
    (f) => (f.data as BatteryData | undefined)?.type === 'battery_status'
  );
  const batteryData = batteryFinding?.data as BatteryData | undefined;

  if (!batteryData) {
    return null;
  }

  const { chargePercent, healthPercent, healthStatus } = batteryData;
  const isHealthy = healthPercent >= 80;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isHealthy ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Battery className={`h-5 w-5 ${isHealthy ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Battery Health
          </p>
          <p className="text-xl font-bold text-gray-900">
            {healthStatus} ({healthPercent.toFixed(0)}%)
          </p>
          <p className="text-sm text-gray-500">
            Currently at {chargePercent.toFixed(0)}% charge
          </p>
          {!isHealthy && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {healthPercent < 60 ? 'Consider replacing battery' : 'Monitor battery health'}
            </p>
          )}
        </div>
        <div className={`text-2xl ${isHealthy ? 'text-green-500' : 'text-yellow-500'}`}>
          {isHealthy ? '✓' : '⚠'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function BatteryInfoRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
