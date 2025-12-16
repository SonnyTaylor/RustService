/**
 * KVRT Scan Service Renderer
 *
 * Custom renderer for the kvrt-scan service results.
 * Shows virus scan results with detection counts and threat list.
 */

import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface KvrtDetection {
  threat: string;
  objectPath: string;
  action: string | null;
}

interface KvrtSummaryData {
  type: 'kvrt_summary';
  processed: number | null;
  processingErrors: number | null;
  detected: number | null;
  passwordProtected: number | null;
  corrupted: number | null;
  removedCount: number;
  detections: KvrtDetection[];
  exitCode: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSeverityColor(detected: number, removed: number): string {
  if (detected === 0) return 'hsl(142, 71%, 45%)'; // green
  if (removed >= detected) return 'hsl(48, 96%, 53%)'; // yellow
  return 'hsl(0, 84%, 60%)'; // red
}

function getSeverityTextColor(detected: number, removed: number): string {
  if (detected === 0) return 'text-green-500';
  if (removed >= detected) return 'text-yellow-500';
  return 'text-red-500';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  // Extract summary data from findings
  const summaryFinding = result.findings.find(
    (f) => (f.data as KvrtSummaryData | undefined)?.type === 'kvrt_summary'
  );
  const summaryData = summaryFinding?.data as KvrtSummaryData | undefined;

  // Error state
  if (!summaryData) {
    const errorFinding = result.findings.find((f) => f.severity === 'error');
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-red-500/10 to-orange-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </div>
            Virus Scan (KVRT)
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
              FAILED
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-500">{errorFinding?.title || 'Scan Failed'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {errorFinding?.description || result.error || 'Could not complete virus scan'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const detected = summaryData.detected ?? 0;
  const removed = summaryData.removedCount ?? 0;
  const processed = summaryData.processed ?? 0;

  const isClean = detected === 0;
  const allRemoved = detected > 0 && removed >= detected;

  const chartData = [
    {
      name: 'clean',
      value: isClean ? 100 : allRemoved ? 80 : 40,
      fill: getSeverityColor(detected, removed),
    },
  ];

  const chartConfig: ChartConfig = {
    value: {
      label: 'Status',
      color: getSeverityColor(detected, removed),
    },
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-red-500/10 to-orange-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isClean ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
              {isClean ? (
                <ShieldCheck className="h-5 w-5 text-green-500" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-red-500" />
              )}
            </div>
            Virus Scan (KVRT)
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                isClean
                  ? 'bg-green-500/10 text-green-500'
                  : allRemoved
                    ? 'bg-yellow-500/10 text-yellow-500'
                    : 'bg-red-500/10 text-red-500'
              }`}
            >
              {isClean ? 'CLEAN' : allRemoved ? 'THREATS REMOVED' : 'THREATS DETECTED'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Status Radial Chart */}
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
                    <RadialBar dataKey="value" cornerRadius={10} background />
                  </RadialBarChart>
                </ChartContainer>
                {/* Centered icon */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {isClean ? (
                    <ShieldCheck className={`h-10 w-10 ${getSeverityTextColor(detected, removed)}`} />
                  ) : (
                    <ShieldAlert className={`h-10 w-10 ${getSeverityTextColor(detected, removed)}`} />
                  )}
                </div>
              </div>
              <div className="mt-2 text-center">
                <p className={`text-lg font-bold ${getSeverityTextColor(detected, removed)}`}>
                  {isClean ? 'No Threats' : `${detected} Threat${detected !== 1 ? 's' : ''}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {processed.toLocaleString()} objects scanned
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <Shield className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Objects Processed</p>
                  <p className="text-lg font-bold">{processed.toLocaleString()}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${detected > 0 ? 'text-red-500' : 'text-green-500'}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Threats Detected</p>
                  <p className={`text-lg font-bold ${detected > 0 ? 'text-red-500' : ''}`}>{detected}</p>
                </div>
              </div>

              {detected > 0 && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <CheckCircle2 className={`h-5 w-5 ${removed >= detected ? 'text-green-500' : 'text-yellow-500'}`} />
                  <div>
                    <p className="text-sm text-muted-foreground">Threats Removed</p>
                    <p className="text-lg font-bold">{removed}</p>
                  </div>
                </div>
              )}

              {(summaryData.passwordProtected ?? 0) > 0 && (
                <div className="p-3 rounded-xl bg-muted/50 border flex items-center gap-3">
                  <FileWarning className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Password Protected</p>
                    <p className="text-lg font-bold">{summaryData.passwordProtected}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detection List */}
          {summaryData.detections.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Detected Threats</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {summaryData.detections.map((detection, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-red-500 truncate">{detection.threat}</p>
                        <p className="text-muted-foreground truncate text-xs mt-0.5">
                          {detection.objectPath}
                        </p>
                      </div>
                      {detection.action && (
                        <span className="text-xs px-2 py-0.5 rounded bg-muted shrink-0">
                          {detection.action}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
  const summaryFinding = result.findings.find(
    (f) => (f.data as KvrtSummaryData | undefined)?.type === 'kvrt_summary'
  );
  const summaryData = summaryFinding?.data as KvrtSummaryData | undefined;

  if (!summaryData) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <ShieldAlert className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
              Virus Scan
            </p>
            <p className="text-xl font-bold text-gray-900">Scan Failed</p>
            <p className="text-sm text-gray-500">{result.error || 'Could not complete scan'}</p>
          </div>
          <div className="text-2xl text-red-500">✗</div>
        </div>
      </div>
    );
  }

  const detected = summaryData.detected ?? 0;
  const removed = summaryData.removedCount ?? 0;
  const isClean = detected === 0;
  const allRemoved = detected > 0 && removed >= detected;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isClean ? 'bg-green-100' : 'bg-yellow-100'}`}>
          {isClean ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-yellow-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Virus Scan (KVRT)
          </p>
          <p className="text-xl font-bold text-gray-900">
            {isClean ? 'No Threats Found' : allRemoved ? 'Threats Removed' : 'Threats Detected'}
          </p>
          <p className="text-sm text-gray-500">
            Scanned {(summaryData.processed ?? 0).toLocaleString()} objects
            {detected > 0 && `, ${detected} threat${detected !== 1 ? 's' : ''} found`}
            {removed > 0 && `, ${removed} removed`}
          </p>
          {detected > 0 && !allRemoved && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ Some threats require manual review
            </p>
          )}
        </div>
        <div className={`text-2xl ${isClean ? 'text-green-500' : allRemoved ? 'text-yellow-500' : 'text-red-500'}`}>
          {isClean ? '✓' : allRemoved ? '⚠' : '✗'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function KvrtScanRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
