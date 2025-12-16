/**
 * Trellix Stinger Service Renderer
 *
 * Custom renderer for the stinger antivirus service results.
 * Shows scan status, infection list, and file counts.
 */

import {
  Bug,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Files,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface StingerInfection {
  filePath: string;
  md5: string;
  threatName: string;
}

interface StingerResultData {
  type: 'stinger_result';
  action: string;
  includePups: boolean;
  scanPath: string | null;
  version: string | null;
  engineVersion: string | null;
  virusDataVersion: string | null;
  virusCount: number | null;
  scanStartTime: string | null;
  scanEndTime: string | null;
  totalFiles: number | null;
  cleanFiles: number | null;
  notScanned: number | null;
  infectedFiles: number | null;
  infections: StingerInfection[];
  exitCode: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getStatusInfo(data: StingerResultData): {
  color: string;
  textColor: string;
  label: string;
  icon: React.ReactNode;
} {
  const infectionCount = data.infections.length;
  
  if (infectionCount === 0) {
    return {
      color: 'hsl(142, 71%, 45%)',
      textColor: 'text-green-500',
      label: 'CLEAN',
      icon: <ShieldCheck className="h-10 w-10 text-green-500" />,
    };
  }
  
  if (data.action === 'delete') {
    return {
      color: 'hsl(48, 96%, 53%)',
      textColor: 'text-yellow-500',
      label: 'REMOVED',
      icon: <ShieldAlert className="h-10 w-10 text-yellow-500" />,
    };
  }
  
  return {
    color: 'hsl(0, 84%, 60%)',
    textColor: 'text-red-500',
    label: 'INFECTED',
    icon: <ShieldAlert className="h-10 w-10 text-red-500" />,
  };
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings.find(
    (f) => (f.data as StingerResultData | undefined)?.type === 'stinger_result'
  );
  const data = finding?.data as StingerResultData | undefined;

  if (!data) {
    const errorFinding = result.findings.find((f) => f.severity === 'error');
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <Bug className="h-5 w-5 text-red-500" />
            </div>
            Antivirus Scan (Stinger)
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
              FAILED
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-500">{errorFinding?.title || 'Scan Failed'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {errorFinding?.description || result.error || 'Could not complete antivirus scan'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = getStatusInfo(data);
  const infectionCount = data.infections.length;
  const isClean = infectionCount === 0;
  const totalFiles = data.totalFiles ?? 0;

  const chartData = [{ name: 'status', value: isClean ? 100 : data.action === 'delete' ? 70 : 30, fill: status.color }];
  const chartConfig: ChartConfig = { value: { label: 'Status', color: status.color } };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isClean ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {isClean ? (
                <ShieldCheck className="h-5 w-5 text-green-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-500" />
              )}
            </div>
            Antivirus Scan (Stinger)
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${status.textColor}`}
              style={{ backgroundColor: `${status.color}20` }}
            >
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
                  {isClean ? 'No Threats' : `${infectionCount} Threat${infectionCount !== 1 ? 's' : ''}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalFiles.toLocaleString()} files scanned
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <Files className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Files Scanned</p>
                  <p className="text-lg font-bold">{totalFiles.toLocaleString()}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${infectionCount > 0 ? 'text-red-500' : 'text-green-500'}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Threats Found</p>
                  <p className={`text-lg font-bold ${infectionCount > 0 ? 'text-red-500' : ''}`}>
                    {infectionCount}
                  </p>
                </div>
              </div>

              {data.action === 'delete' && infectionCount > 0 && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Trash2 className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Action Taken</p>
                    <p className="text-lg font-bold">Deleted</p>
                  </div>
                </div>
              )}

              {data.version && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Engine Version</p>
                    <p className="text-sm font-medium">{data.version}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Infection List */}
          {data.infections.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Detected Threats</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {data.infections.map((infection, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-red-500 truncate">{infection.threatName}</p>
                        <p className="text-muted-foreground truncate text-xs mt-0.5">
                          {infection.filePath}
                        </p>
                      </div>
                      {data.action === 'delete' && (
                        <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-600 shrink-0">
                          Removed
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scan Info */}
          <div className="mt-4 flex gap-4 text-sm text-muted-foreground flex-wrap">
            <span>Mode: {data.action === 'delete' ? 'Delete Threats' : 'Report Only'}</span>
            {data.includePups && <span>• PUP Detection: On</span>}
            {data.scanPath && <span>• Path: {data.scanPath}</span>}
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
    (f) => (f.data as StingerResultData | undefined)?.type === 'stinger_result'
  );
  const data = finding?.data as StingerResultData | undefined;

  if (!data) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <Bug className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">Antivirus Scan</p>
            <p className="text-xl font-bold text-gray-900">Scan Failed</p>
            <p className="text-sm text-gray-500">{result.error || 'Could not complete scan'}</p>
          </div>
          <div className="text-2xl text-red-500">✗</div>
        </div>
      </div>
    );
  }

  const infectionCount = data.infections.length;
  const isClean = infectionCount === 0;
  const wasRemoved = data.action === 'delete' && infectionCount > 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isClean ? 'bg-green-100' : wasRemoved ? 'bg-yellow-100' : 'bg-red-100'}`}>
          {isClean ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldAlert className={`h-5 w-5 ${wasRemoved ? 'text-yellow-600' : 'text-red-600'}`} />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Antivirus Scan (Stinger)
          </p>
          <p className="text-xl font-bold text-gray-900">
            {isClean ? 'No Threats Found' : wasRemoved ? 'Threats Removed' : 'Threats Detected'}
          </p>
          <p className="text-sm text-gray-500">
            Scanned {(data.totalFiles ?? 0).toLocaleString()} files
            {infectionCount > 0 && `, ${infectionCount} threat${infectionCount !== 1 ? 's' : ''} found`}
            {wasRemoved && `, removed`}
          </p>
          {infectionCount > 0 && !wasRemoved && (
            <p className="text-sm text-red-600 mt-1">
              ⚠ Threats require manual review or removal
            </p>
          )}
        </div>
        <div className={`text-2xl ${isClean ? 'text-green-500' : wasRemoved ? 'text-yellow-500' : 'text-red-500'}`}>
          {isClean ? '✓' : wasRemoved ? '⚠' : '✗'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function StingerRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
