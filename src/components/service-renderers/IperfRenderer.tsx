/**
 * iPerf Network Stability Test Renderer
 *
 * Custom renderer for iPerf3 network stability results.
 * Shows throughput over time chart and stability metrics.
 */

import { Network, Activity, TrendingUp, AlertTriangle, Info, ChartLine } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
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

interface IperfStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdev: number;
  cov: number;
  p10: number;
  p90: number;
  samples: number;
}

interface IperfData {
  type: 'iperf_result';
  server: string;
  direction: 'download' | 'upload';
  durationSeconds: number;
  throughputMbps: number[];
  stats: IperfStats;
  retransmits?: number;
  score: number;
  verdict: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getScoreColor(score: number): string {
  if (score >= 85) return 'text-green-500';
  if (score >= 70) return 'text-emerald-500';
  if (score >= 50) return 'text-yellow-500';
  if (score >= 30) return 'text-orange-500';
  return 'text-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 85) return 'bg-green-500/10';
  if (score >= 70) return 'bg-emerald-500/10';
  if (score >= 50) return 'bg-yellow-500/10';
  if (score >= 30) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as IperfData | undefined;

  if (!data || data.type !== 'iperf_result') {
    return null;
  }

  const { server, direction, throughputMbps, stats, retransmits, score, verdict } = data;
  const isGood = score >= 70;

  // Prepare chart data
  const chartData = throughputMbps.map((mbps, index) => ({
    second: index + 1,
    throughput: mbps,
  }));

  const chartConfig: ChartConfig = {
    throughput: {
      label: 'Throughput',
      color: isGood ? 'hsl(142, 71%, 45%)' : 'hsl(48, 96%, 53%)',
    },
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className={`py-4 bg-gradient-to-r ${isGood ? 'from-green-500/10 to-emerald-500/10' : 'from-yellow-500/10 to-orange-500/10'}`}>
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isGood ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
              <Network className={`h-5 w-5 ${isGood ? 'text-green-500' : 'text-yellow-500'}`} />
            </div>
            Network Stability Test
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${getScoreBgColor(score)} ${getScoreColor(score)}`}>
              {score.toFixed(0)}/100
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Throughput Chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ChartLine className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {direction === 'download' ? 'Download' : 'Upload'} Throughput Over Time
                </span>
              </div>
              <ChartContainer config={chartConfig} className="h-[200px] w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fillThroughput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-throughput)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-throughput)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="second"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => `${value}s`}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => `${value}`}
                    label={{ value: 'Mbps', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(value) => `${value}s`}
                        indicator="dot"
                      />
                    }
                  />
                  <Area
                    dataKey="throughput"
                    type="monotone"
                    fill="url(#fillThroughput)"
                    stroke="var(--color-throughput)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Mean</p>
              <p className="text-lg font-bold">{stats.mean.toFixed(1)} Mbps</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Range</p>
              <p className="text-lg font-bold">{stats.min.toFixed(0)}–{stats.max.toFixed(0)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Variability</p>
              <p className={`text-lg font-bold ${stats.cov > 0.1 ? 'text-yellow-500' : 'text-green-500'}`}>
                {(stats.cov * 100).toFixed(1)}%
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Samples</p>
              <p className="text-lg font-bold">{stats.samples}</p>
            </div>
          </div>

          {/* Retransmits Warning */}
          {retransmits !== undefined && retransmits > 0 && (
            <div className={`p-2 rounded-lg flex items-center gap-2 text-sm ${retransmits > 50 ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
              <AlertTriangle className="h-4 w-4" />
              {retransmits} TCP retransmit(s) during test
            </div>
          )}

          {/* Verdict */}
          <div className={`p-3 rounded-lg flex items-center gap-3 ${getScoreBgColor(score)}`}>
            <Activity className={`h-5 w-5 ${getScoreColor(score)}`} />
            <div className="flex-1">
              <span className={`font-medium ${getScoreColor(score)}`}>{verdict}</span>
              <span className="text-sm text-muted-foreground ml-2">
                to {server}
              </span>
            </div>
            <TrendingUp className={`h-5 w-5 ${getScoreColor(score)}`} />
          </div>

          {/* Recommendation */}
          {finding?.recommendation && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-2">
              <Info className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                {finding.recommendation}
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
  const finding = result.findings[0];
  const data = finding?.data as IperfData | undefined;

  if (!data || data.type !== 'iperf_result') {
    return null;
  }

  const { stats, score, verdict, direction, server, retransmits } = data;
  const isGood = score >= 70;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Network className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Network Stability ({direction})
          </p>
          <p className="text-xl font-bold text-gray-900">
            {verdict} ({score.toFixed(0)}/100)
          </p>
          <p className="text-sm text-gray-500">
            Mean: {stats.mean.toFixed(1)} Mbps (range {stats.min.toFixed(0)}–{stats.max.toFixed(0)}), {(stats.cov * 100).toFixed(1)}% variability
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Server: {server}
          </p>
          {retransmits && retransmits > 20 && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {retransmits} retransmits detected
            </p>
          )}
          {!isGood && finding?.recommendation && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {finding.recommendation}
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

export function IperfRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
