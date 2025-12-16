/**
 * FurMark GPU Stress Test Service Renderer
 *
 * Custom renderer for the furmark service results.
 * Shows GPU stress test results with FPS metrics and temperature.
 */

import {
  Flame,
  Thermometer,
  Gauge,
  Timer,
  Cpu,
  Activity,
} from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface FpsStats {
  min: number;
  avg: number;
  max: number;
}

interface Resolution {
  width: number;
  height: number;
}

interface GpuInfo {
  index: number;
  name: string;
  id: string;
  max_temperature_c: number | null;
  max_usage_percent: number | null;
  max_core_clock_mhz: number | null;
  min_core_clock_mhz: number | null;
}

interface FurmarkResultData {
  type: 'furmark_result';
  demo: string | null;
  renderer: string | null;
  api: string | null;
  resolution: Resolution | null;
  frames: number | null;
  durationMs: number | null;
  fps: FpsStats | null;
  gpus: GpuInfo[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function getTempStatus(temp: number): { color: string; textColor: string; label: string } {
  if (temp >= 95) {
    return { color: 'hsl(0, 84%, 60%)', textColor: 'text-red-500', label: 'CRITICAL' };
  }
  if (temp >= 85) {
    return { color: 'hsl(48, 96%, 53%)', textColor: 'text-yellow-500', label: 'HOT' };
  }
  if (temp >= 70) {
    return { color: 'hsl(25, 95%, 53%)', textColor: 'text-orange-500', label: 'WARM' };
  }
  return { color: 'hsl(142, 71%, 45%)', textColor: 'text-green-500', label: 'COOL' };
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings.find(
    (f) => (f.data as FurmarkResultData | undefined)?.type === 'furmark_result'
  );
  const data = finding?.data as FurmarkResultData | undefined;

  if (!data) {
    const errorFinding = result.findings.find((f) => f.severity === 'error');
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-orange-500/10 to-red-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <Flame className="h-5 w-5 text-red-500" />
            </div>
            GPU Stress Test (FurMark)
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
              FAILED
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-500">{errorFinding?.title || 'Test Failed'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {errorFinding?.description || result.error || 'Could not complete GPU stress test'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const gpu = data.gpus[0];
  const temp = gpu?.max_temperature_c ?? 0;
  const tempStatus = getTempStatus(temp);
  const fpsAvg = data.fps?.avg ?? 0;

  // Temperature chart (0-100°C scale mapped to 0-100%)
  const tempValue = Math.min(100, temp);
  const chartData = [{ name: 'temp', value: tempValue, fill: tempStatus.color }];
  const chartConfig: ChartConfig = { value: { label: 'Temperature', color: tempStatus.color } };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-orange-500/10 to-red-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${temp < 85 ? 'bg-green-500/20' : 'bg-orange-500/20'}`}>
              <Flame className={`h-5 w-5 ${temp < 85 ? 'text-green-500' : 'text-orange-500'}`} />
            </div>
            GPU Stress Test (FurMark)
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${tempStatus.textColor}`}
              style={{ backgroundColor: `${tempStatus.color}20` }}
            >
              {tempStatus.label}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Temperature Gauge */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <ChartContainer config={chartConfig} className="h-[160px] w-[160px]">
                  <RadialBarChart data={chartData} startAngle={90} endAngle={-270} innerRadius={55} outerRadius={75}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" cornerRadius={10} background />
                  </RadialBarChart>
                </ChartContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Thermometer className={`h-8 w-8 ${tempStatus.textColor}`} />
                  <span className={`text-xl font-bold ${tempStatus.textColor}`}>{temp}°C</span>
                </div>
              </div>
              <div className="mt-2 text-center">
                <p className="text-sm text-muted-foreground">Max Temperature</p>
                {gpu?.name && (
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">{gpu.name}</p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <Gauge className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Average FPS</p>
                  <p className="text-lg font-bold">{fpsAvg}</p>
                </div>
              </div>

              {data.fps && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Activity className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">FPS Range</p>
                    <p className="text-lg font-bold">
                      {data.fps.min} - {data.fps.max}
                    </p>
                  </div>
                </div>
              )}

              {gpu?.max_usage_percent !== null && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Cpu className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">GPU Usage</p>
                    <p className="text-lg font-bold">{gpu.max_usage_percent}%</p>
                  </div>
                </div>
              )}

              {data.frames !== null && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Total Frames</p>
                    <p className="text-lg font-bold">{data.frames.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resolution & Duration Info */}
          <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
            {data.resolution && (
              <span>Resolution: {data.resolution.width}x{data.resolution.height}</span>
            )}
            {data.durationMs && (
              <span>Duration: {(data.durationMs / 1000).toFixed(1)}s</span>
            )}
            {data.api && <span>API: {data.api}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings.find(
    (f) => (f.data as FurmarkResultData | undefined)?.type === 'furmark_result'
  );
  const data = finding?.data as FurmarkResultData | undefined;

  if (!data) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <Flame className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">GPU Stress Test</p>
            <p className="text-xl font-bold text-gray-900">Test Failed</p>
            <p className="text-sm text-gray-500">{result.error || 'Could not complete test'}</p>
          </div>
          <div className="text-2xl text-red-500">✗</div>
        </div>
      </div>
    );
  }

  const gpu = data.gpus[0];
  const temp = gpu?.max_temperature_c ?? 0;
  const isHealthy = temp < 85;
  const fpsAvg = data.fps?.avg ?? 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isHealthy ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Flame className={`h-5 w-5 ${isHealthy ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            GPU Stress Test (FurMark)
          </p>
          <p className="text-xl font-bold text-gray-900">
            {isHealthy ? 'GPU Stable' : 'High Temperature'}
          </p>
          <p className="text-sm text-gray-500">
            {gpu?.name || 'GPU'} • {temp}°C max temp • {fpsAvg} avg FPS
          </p>
          {!isHealthy && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ Consider improving GPU cooling
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

export function FurmarkRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
