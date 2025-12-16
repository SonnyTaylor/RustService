/**
 * WinSAT Benchmark Service Renderer
 *
 * Custom renderer for the winsat service results.
 * Shows disk performance metrics with bar chart comparison.
 */

import { Gauge, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis, Cell, LabelList } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface WinsatData {
  type: 'winsat_summary';
  drive: string;
  rating: string;
  avgSpeed: number;
  metrics: {
    sequentialRead: number | null;
    sequentialWrite: number | null;
    randomRead: number | null;
    randomWrite: number | null;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSpeedColor(speed: number | null): string {
  if (!speed) return 'hsl(220, 14%, 46%)';
  if (speed >= 400) return 'hsl(142, 71%, 45%)'; // green
  if (speed >= 200) return 'hsl(180, 70%, 45%)'; // cyan
  if (speed >= 100) return 'hsl(48, 96%, 53%)'; // yellow
  return 'hsl(0, 84%, 60%)'; // red
}

function getRatingColor(rating: string): string {
  switch (rating) {
    case 'Excellent':
      return 'text-green-500 bg-green-500/10';
    case 'Good':
      return 'text-cyan-500 bg-cyan-500/10';
    case 'Average':
      return 'text-blue-500 bg-blue-500/10';
    case 'Below Average':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'Poor':
      return 'text-red-500 bg-red-500/10';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  // Extract winsat data from findings
  const winsatFinding = result.findings.find(
    (f) => (f.data as WinsatData | undefined)?.type === 'winsat_summary'
  );
  const winsatData = winsatFinding?.data as WinsatData | undefined;

  // If no data (error case), show error state
  if (!winsatData) {
    const errorFinding = result.findings.find((f) => f.severity === 'error');
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-red-500/10 to-orange-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            Disk Performance Benchmark
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
              FAILED
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-500">{errorFinding?.title || 'Benchmark Failed'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {errorFinding?.description || result.error || 'Could not complete benchmark'}
            </p>
            {errorFinding?.recommendation && (
              <p className="text-sm text-red-400 mt-2">💡 {errorFinding.recommendation}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { metrics, rating, avgSpeed, drive } = winsatData;

  // Transform data for chart
  const chartData = [
    { name: 'Seq. Read', value: metrics.sequentialRead || 0, fill: getSpeedColor(metrics.sequentialRead) },
    { name: 'Seq. Write', value: metrics.sequentialWrite || 0, fill: getSpeedColor(metrics.sequentialWrite) },
    { name: 'Random Read', value: metrics.randomRead || 0, fill: getSpeedColor(metrics.randomRead) },
    { name: 'Random Write', value: metrics.randomWrite || 0, fill: getSpeedColor(metrics.randomWrite) },
  ].filter((d) => d.value > 0);

  const chartConfig: ChartConfig = {
    value: {
      label: 'Speed (MB/s)',
      color: 'var(--chart-1)',
    },
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Gauge className="h-5 w-5 text-purple-500" />
            </div>
            Disk Performance Benchmark
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${getRatingColor(rating)}`}>
              {rating.toUpperCase()}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <p className="text-muted-foreground text-sm">Drive</p>
              <p className="text-2xl font-bold mt-1">{drive}:</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <p className="text-muted-foreground text-sm">Avg Speed</p>
              <p className="text-2xl font-bold mt-1">
                {avgSpeed.toFixed(0)}
                <span className="text-sm font-normal text-muted-foreground"> MB/s</span>
              </p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <p className="text-muted-foreground text-sm">Rating</p>
              <p className={`text-xl font-bold mt-1 ${getRatingColor(rating).split(' ')[0]}`}>
                {rating}
              </p>
            </div>
          </div>

          {/* Bar Chart */}
          {chartData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 10, right: 60 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent formatter={(value) => `${value} MB/s`} hideLabel />}
                />
                <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={30}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: number) => `${value.toFixed(0)} MB/s`}
                    className="fill-foreground"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}

          {/* Performance Note */}
          <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            <span className="text-sm text-muted-foreground">
              {avgSpeed >= 300
                ? 'SSD-level performance detected. Your disk is fast!'
                : avgSpeed >= 100
                  ? 'Decent performance. Consider upgrading to SSD for better speeds.'
                  : 'Slow disk detected. An SSD upgrade would significantly improve performance.'}
            </span>
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
  const winsatFinding = result.findings.find(
    (f) => (f.data as WinsatData | undefined)?.type === 'winsat_summary'
  );
  const winsatData = winsatFinding?.data as WinsatData | undefined;

  if (!winsatData) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
              Disk Performance
            </p>
            <p className="text-xl font-bold text-gray-900">Benchmark Unavailable</p>
            <p className="text-sm text-gray-500">{result.error || 'Could not complete benchmark'}</p>
          </div>
          <div className="text-2xl text-red-500">✗</div>
        </div>
      </div>
    );
  }

  const { rating, avgSpeed } = winsatData;
  const isGood = ['Excellent', 'Good', 'Average'].includes(rating);

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          {isGood ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Disk Performance
          </p>
          <p className="text-xl font-bold text-gray-900">Performance: {rating}</p>
          <p className="text-sm text-gray-500">
            Average speed: {avgSpeed.toFixed(0)} MB/s
          </p>
          {!isGood && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ Consider upgrading to an SSD for better performance
            </p>
          )}
        </div>
        <div className={`text-2xl ${isGood ? 'text-green-500' : 'text-yellow-500'}`}>
          {isGood ? '✓' : '⚠'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function WinsatRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
