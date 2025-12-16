/**
 * Disk Space Service Renderer
 *
 * Custom renderer for the disk-space service results.
 * Shows disk usage per drive with color-coded progress bars.
 */

import { HardDrive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface DriveData {
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  fileSystem: string;
  diskKind: string;
  status: string;
}

interface DiskSummaryData {
  type: 'disk_summary';
  drives: DriveData[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function getUsageColor(percent: number): string {
  if (percent >= 95) return 'hsl(0, 84%, 60%)'; // red
  if (percent >= 85) return 'hsl(25, 95%, 53%)'; // orange
  if (percent >= 70) return 'hsl(48, 96%, 53%)'; // yellow
  return 'hsl(142, 71%, 45%)'; // green
}

function getUsageTextColor(percent: number): string {
  if (percent >= 85) return 'text-red-500';
  if (percent >= 70) return 'text-yellow-500';
  return 'text-green-500';
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1_073_741_824;
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  // Extract summary data from findings
  const summaryFinding = result.findings.find(
    (f) => (f.data as DiskSummaryData | undefined)?.type === 'disk_summary'
  );
  const summaryData = summaryFinding?.data as DiskSummaryData | undefined;
  const drives = summaryData?.drives || [];

  const hasIssues = drives.some((d) => d.usagePercent >= 85);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <HardDrive className="h-5 w-5 text-blue-500" />
            </div>
            Disk Space Analysis
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                !hasIssues ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
              }`}
            >
              {!hasIssues ? 'HEALTHY' : 'ATTENTION NEEDED'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Drive Cards */}
          <div className="grid gap-3">
            {drives.map((drive) => (
              <div
                key={drive.mountPoint}
                className="p-4 rounded-xl bg-muted/50 border flex items-center gap-4"
              >
                <div
                  className={`p-2 rounded-lg ${
                    drive.usagePercent >= 85
                      ? 'bg-red-500/10'
                      : drive.usagePercent >= 70
                        ? 'bg-yellow-500/10'
                        : 'bg-green-500/10'
                  }`}
                >
                  {drive.usagePercent >= 85 ? (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  ) : (
                    <CheckCircle2
                      className={`h-5 w-5 ${
                        drive.usagePercent >= 70 ? 'text-yellow-500' : 'text-green-500'
                      }`}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{drive.mountPoint}</span>
                    <span className={`text-sm font-medium ${getUsageTextColor(drive.usagePercent)}`}>
                      {drive.usagePercent}%
                    </span>
                  </div>
                  <Progress
                    value={drive.usagePercent}
                    className="h-2"
                    style={{ '--progress-color': getUsageColor(drive.usagePercent) } as React.CSSProperties}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{formatBytes(drive.availableBytes)} free</span>
                    <span>{formatBytes(drive.totalBytes)} total</span>
                  </div>
                </div>
              </div>
            ))}
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
  const summaryFinding = result.findings.find(
    (f) => (f.data as DiskSummaryData | undefined)?.type === 'disk_summary'
  );
  const summaryData = summaryFinding?.data as DiskSummaryData | undefined;
  const drives = summaryData?.drives || [];

  const hasIssues = drives.some((d) => d.usagePercent >= 85);
  const criticalDrives = drives.filter((d) => d.usagePercent >= 85);

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${hasIssues ? 'bg-yellow-100' : 'bg-green-100'}`}>
          <HardDrive className={`h-5 w-5 ${hasIssues ? 'text-yellow-600' : 'text-green-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Disk Storage
          </p>
          <p className="text-xl font-bold text-gray-900">
            {hasIssues ? 'Low Disk Space Detected' : 'Storage Healthy'}
          </p>
          <div className="text-sm text-gray-500 mt-1 space-y-0.5">
            {drives.map((drive) => (
              <p key={drive.mountPoint}>
                {drive.mountPoint} {formatBytes(drive.availableBytes)} free ({drive.usagePercent}% used)
              </p>
            ))}
          </div>
          {criticalDrives.length > 0 && (
            <p className="text-sm text-yellow-600 mt-2">
              ⚠ Consider freeing up space on {criticalDrives.map((d) => d.mountPoint).join(', ')}
            </p>
          )}
        </div>
        <div className={`text-2xl ${hasIssues ? 'text-yellow-500' : 'text-green-500'}`}>
          {hasIssues ? '⚠' : '✓'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function DiskSpaceRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
