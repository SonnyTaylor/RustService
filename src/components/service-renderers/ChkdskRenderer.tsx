/**
 * CHKDSK Service Renderer
 *
 * Custom renderer for the chkdsk service results.
 * Shows disk check results with health status and disk stats.
 */

import {
  HardDrive,
  HardDriveDownload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  BadgeInfo,
} from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface ChkdskResultData {
  type: 'chkdsk_result';
  drive: string;
  mode: string;
  filesystemType: string | null;
  foundNoProblems: boolean;
  errorsFound: boolean;
  madeCorrections: boolean;
  volumeInUse: boolean;
  accessDenied: boolean;
  invalidDrive: boolean;
  totalDiskKb: number | null;
  availableKb: number | null;
  badSectorsKb: number | null;
  inFilesKb: number | null;
  systemUseKb: number | null;
  durationSeconds: number | null;
  exitCode: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatBytes(kb: number | null): string {
  if (kb === null || kb === undefined) return 'N/A';
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(1)} GB`;
}

function getStatusInfo(data: ChkdskResultData): {
  color: string;
  textColor: string;
  label: string;
  icon: React.ReactNode;
} {
  if (data.accessDenied || data.invalidDrive) {
    return {
      color: 'hsl(0, 84%, 60%)',
      textColor: 'text-red-500',
      label: 'ERROR',
      icon: <XCircle className="h-10 w-10 text-red-500" />,
    };
  }
  if (data.foundNoProblems || data.madeCorrections) {
    return {
      color: 'hsl(142, 71%, 45%)',
      textColor: 'text-green-500',
      label: data.madeCorrections ? 'REPAIRED' : 'HEALTHY',
      icon: <CheckCircle2 className="h-10 w-10 text-green-500" />,
    };
  }
  if (data.errorsFound || data.volumeInUse) {
    return {
      color: 'hsl(48, 96%, 53%)',
      textColor: 'text-yellow-500',
      label: data.volumeInUse ? 'IN USE' : 'ISSUES',
      icon: <AlertTriangle className="h-10 w-10 text-yellow-500" />,
    };
  }
  return {
    color: 'hsl(142, 71%, 45%)',
    textColor: 'text-green-500',
    label: 'OK',
    icon: <CheckCircle2 className="h-10 w-10 text-green-500" />,
  };
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings.find(
    (f) => (f.data as ChkdskResultData | undefined)?.type === 'chkdsk_result'
  );
  const data = finding?.data as ChkdskResultData | undefined;

  if (!data) {
    const errorFinding = result.findings.find((f) => f.severity === 'error');
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <HardDriveDownload className="h-5 w-5 text-red-500" />
            </div>
            Disk Check (CHKDSK)
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
              FAILED
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-500">{errorFinding?.title || 'Check Failed'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {errorFinding?.description || result.error || 'Could not complete disk check'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = getStatusInfo(data);
  const usedKb = data.totalDiskKb && data.availableKb ? data.totalDiskKb - data.availableKb : null;
  const usedPercent = data.totalDiskKb && usedKb ? Math.round((usedKb / data.totalDiskKb) * 100) : 0;

  const chartData = [{ name: 'health', value: data.foundNoProblems ? 100 : data.errorsFound ? 40 : 70, fill: status.color }];
  const chartConfig: ChartConfig = { value: { label: 'Health', color: status.color } };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${data.foundNoProblems ? 'bg-green-500/20' : 'bg-blue-500/20'}`}>
              <HardDriveDownload className={`h-5 w-5 ${data.foundNoProblems ? 'text-green-500' : 'text-blue-500'}`} />
            </div>
            Disk Check (CHKDSK)
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${status.textColor} bg-current/10`} style={{ backgroundColor: `${status.color}20` }}>
              {status.label}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Status Chart */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <ChartContainer config={chartConfig} className="h-[160px] w-[160px]">
                  <RadialBarChart data={chartData} startAngle={90} endAngle={-270} innerRadius={55} outerRadius={75}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" cornerRadius={10} background />
                  </RadialBarChart>
                </ChartContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {status.icon}
                </div>
              </div>
              <div className="mt-2 text-center">
                <p className={`text-lg font-bold ${status.textColor}`}>
                  {data.foundNoProblems ? 'No Problems' : data.madeCorrections ? 'Repaired' : data.errorsFound ? 'Errors Found' : 'Complete'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Drive {data.drive} ({data.filesystemType || 'Unknown'})
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <HardDrive className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Disk Space</p>
                  <p className="text-lg font-bold">{formatBytes(data.totalDiskKb)}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Available Space</p>
                  <p className="text-lg font-bold">{formatBytes(data.availableKb)}</p>
                </div>
              </div>

              {(data.badSectorsKb ?? 0) > 0 && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Bad Sectors</p>
                    <p className="text-lg font-bold text-red-500">{formatBytes(data.badSectorsKb)}</p>
                  </div>
                </div>
              )}

              {data.durationSeconds && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Scan Duration</p>
                    <p className="text-lg font-bold">{data.durationSeconds.toFixed(1)}s</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mode Info */}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border flex items-center gap-2">
            <BadgeInfo className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Mode: <span className="font-medium">{data.mode.replace('_', ' ')}</span>
              {usedPercent > 0 && <span className="ml-2">• {usedPercent}% used</span>}
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
  const finding = result.findings.find(
    (f) => (f.data as ChkdskResultData | undefined)?.type === 'chkdsk_result'
  );
  const data = finding?.data as ChkdskResultData | undefined;

  if (!data) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <HardDriveDownload className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">Disk Check</p>
            <p className="text-xl font-bold text-gray-900">Check Failed</p>
            <p className="text-sm text-gray-500">{result.error || 'Could not complete check'}</p>
          </div>
          <div className="text-2xl text-red-500">✗</div>
        </div>
      </div>
    );
  }

  const isHealthy = data.foundNoProblems || data.madeCorrections;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isHealthy ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <HardDrive className={`h-5 w-5 ${isHealthy ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Disk Check ({data.drive})
          </p>
          <p className="text-xl font-bold text-gray-900">
            {data.foundNoProblems ? 'Disk Healthy' : data.madeCorrections ? 'Disk Repaired' : 'Issues Detected'}
          </p>
          <p className="text-sm text-gray-500">
            {data.filesystemType || 'Unknown'} filesystem
            {data.totalDiskKb && ` • ${formatBytes(data.totalDiskKb)} total`}
            {data.availableKb && ` • ${formatBytes(data.availableKb)} free`}
          </p>
          {(data.badSectorsKb ?? 0) > 0 && (
            <p className="text-sm text-red-600 mt-1">
              ⚠ {formatBytes(data.badSectorsKb)} in bad sectors
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

export function ChkdskRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
