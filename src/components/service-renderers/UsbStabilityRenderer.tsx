/**
 * USB Stability Test Service Renderer
 *
 * Custom renderer for the usb-stability service results.
 * Shows speed benchmarks, integrity status, random I/O latency,
 * and fake-drive detection results.
 */

import {
  Usb,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Zap,
  HardDrive,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface UsbSummaryData {
  type: 'usb_summary';
  drivePath: string;
  volumeLabel: string;
  fileSystem: string;
  totalSpaceBytes: number;
  availableSpaceBytes: number;
  testSizeMb: number;
  intensity: string;
  writeSpeedMbps: number;
  readSpeedMbps: number;
  writeDurationSecs: number;
  readDurationSecs: number;
  integrityPass: boolean;
  integrityErrors: number;
  integrityChecked: boolean;
  overallStatus: string;
  totalDurationSecs: number;
}

interface UsbSpeedData {
  type: 'usb_write_speed' | 'usb_read_speed';
  speedMbps: number;
  rating: string;
}

interface UsbIntegrityData {
  type: 'usb_integrity';
  pass: boolean;
  errorCount: number;
  firstErrorOffset: number | null;
  bytesVerified: number;
}

interface UsbRandomIoData {
  type: 'usb_random_io';
  avgMs: number;
  minMs: number;
  maxMs: number;
  iterations: number;
  blockSize: number;
}

interface UsbCapacityData {
  type: 'usb_capacity';
  pass: boolean;
  expectedMb: number;
  actualUsedMb: number;
  discrepancyMb: number;
  fakeDriveSuspected?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSpeedColor(mbps: number): string {
  if (mbps >= 100) return 'text-blue-500';
  if (mbps >= 50) return 'text-green-500';
  if (mbps >= 20) return 'text-yellow-500';
  if (mbps >= 5) return 'text-orange-500';
  return 'text-red-500';
}

function getSpeedBg(mbps: number): string {
  if (mbps >= 100) return 'bg-blue-500/10';
  if (mbps >= 50) return 'bg-green-500/10';
  if (mbps >= 20) return 'bg-yellow-500/10';
  if (mbps >= 5) return 'bg-orange-500/10';
  return 'bg-red-500/10';
}

function getSpeedBarColor(mbps: number): string {
  if (mbps >= 100) return 'hsl(217, 91%, 60%)'; // blue
  if (mbps >= 50) return 'hsl(142, 71%, 45%)'; // green
  if (mbps >= 20) return 'hsl(48, 96%, 53%)'; // yellow
  if (mbps >= 5) return 'hsl(25, 95%, 53%)'; // orange
  return 'hsl(0, 84%, 60%)'; // red
}

function getSpeedLabel(mbps: number): string {
  if (mbps >= 100) return 'USB 3.0+';
  if (mbps >= 50) return 'USB 3.0';
  if (mbps >= 20) return 'USB 2.0';
  if (mbps >= 5) return 'Slow';
  return 'Very Slow';
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1_073_741_824;
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1_048_576).toFixed(0)} MB`;
}

function getStatusBadge(status: string) {
  const colors: Record<string, string> = {
    PASS: 'bg-green-500/10 text-green-500',
    'PASS WITH WARNINGS': 'bg-yellow-500/10 text-yellow-500',
    'ISSUES DETECTED': 'bg-orange-500/10 text-orange-500',
    FAIL: 'bg-red-500/10 text-red-500',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ definition, result }: ServiceRendererProps) {
  const summaryFinding = result.findings.find(
    (f) => (f.data as UsbSummaryData | undefined)?.type === 'usb_summary'
  );
  const summary = summaryFinding?.data as UsbSummaryData | undefined;

  const writeData = result.findings.find(
    (f) => (f.data as UsbSpeedData | undefined)?.type === 'usb_write_speed'
  )?.data as UsbSpeedData | undefined;

  const readData = result.findings.find(
    (f) => (f.data as UsbSpeedData | undefined)?.type === 'usb_read_speed'
  )?.data as UsbSpeedData | undefined;

  const integrityData = result.findings.find(
    (f) => (f.data as UsbIntegrityData | undefined)?.type === 'usb_integrity'
  )?.data as UsbIntegrityData | undefined;

  const randomIoData = result.findings.find(
    (f) => (f.data as UsbRandomIoData | undefined)?.type === 'usb_random_io'
  )?.data as UsbRandomIoData | undefined;

  const capacityData = result.findings.find(
    (f) => (f.data as UsbCapacityData | undefined)?.type === 'usb_capacity'
  )?.data as UsbCapacityData | undefined;

  if (!summary) return null;

  // Speed bar max for visual scale (cap at 200 MB/s)
  const speedMax = 200;

  const statusBadge = summary.overallStatus === 'PASS'
    ? { label: 'PASS', color: 'green' as const }
    : summary.overallStatus === 'PASS WITH WARNINGS'
      ? { label: 'PASS WITH WARNINGS', color: 'yellow' as const }
      : summary.overallStatus === 'ISSUES DETECTED'
        ? { label: 'ISSUES DETECTED', color: 'yellow' as const }
        : { label: 'FAIL', color: 'red' as const };

  return (
    <ServiceCardWrapper definition={definition} result={result} statusBadge={statusBadge}>
      <div className="space-y-4">
        {/* Drive Info */}
        <p className="text-xs text-muted-foreground">
          {summary.drivePath} — {summary.volumeLabel} ({formatBytes(summary.totalSpaceBytes)}, {summary.fileSystem})
        </p>

        {/* Fake Drive Warning */}
        {capacityData && !capacityData.pass && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-500">⚠ Fake Drive Suspected</p>
              <p className="text-sm text-red-400">
                Capacity mismatch detected — this drive may have less real storage than advertised.
                Do NOT use for important data.
              </p>
            </div>
          </div>
        )}

        {/* Speed Benchmarks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Write Speed */}
          <div className={`p-4 rounded-xl border ${getSpeedBg(summary.writeSpeedMbps)}`}>
            <div className="flex items-center gap-2 mb-2">
              <ArrowUp className={`h-4 w-4 ${getSpeedColor(summary.writeSpeedMbps)}`} />
              <span className="text-sm font-medium">Write Speed</span>
              <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${getSpeedBg(summary.writeSpeedMbps)} ${getSpeedColor(summary.writeSpeedMbps)}`}>
                {writeData?.rating || getSpeedLabel(summary.writeSpeedMbps)}
              </span>
            </div>
            <p className={`text-2xl font-bold ${getSpeedColor(summary.writeSpeedMbps)}`}>
              {summary.writeSpeedMbps.toFixed(1)} <span className="text-sm font-normal">MB/s</span>
            </p>
            <Progress
              value={Math.min((summary.writeSpeedMbps / speedMax) * 100, 100)}
              className="h-1.5 mt-2"
              style={{ '--progress-color': getSpeedBarColor(summary.writeSpeedMbps) } as React.CSSProperties}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {summary.testSizeMb} MB in {summary.writeDurationSecs.toFixed(1)}s
            </p>
          </div>

          {/* Read Speed */}
          <div className={`p-4 rounded-xl border ${getSpeedBg(summary.readSpeedMbps)}`}>
            <div className="flex items-center gap-2 mb-2">
              <ArrowDown className={`h-4 w-4 ${getSpeedColor(summary.readSpeedMbps)}`} />
              <span className="text-sm font-medium">Read Speed</span>
              <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${getSpeedBg(summary.readSpeedMbps)} ${getSpeedColor(summary.readSpeedMbps)}`}>
                {readData?.rating || getSpeedLabel(summary.readSpeedMbps)}
              </span>
            </div>
            <p className={`text-2xl font-bold ${getSpeedColor(summary.readSpeedMbps)}`}>
              {summary.readSpeedMbps.toFixed(1)} <span className="text-sm font-normal">MB/s</span>
            </p>
            <Progress
              value={Math.min((summary.readSpeedMbps / speedMax) * 100, 100)}
              className="h-1.5 mt-2"
              style={{ '--progress-color': getSpeedBarColor(summary.readSpeedMbps) } as React.CSSProperties}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {summary.testSizeMb} MB in {summary.readDurationSecs.toFixed(1)}s
            </p>
          </div>
        </div>

        {/* Integrity & Random I/O */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Integrity Check */}
          {integrityData && (
            <div className={`p-4 rounded-xl border ${integrityData.pass ? 'bg-green-500/5' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                {integrityData.pass ? (
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-medium">Data Integrity</span>
              </div>
              <p className={`text-2xl font-bold ${integrityData.pass ? 'text-green-500' : 'text-red-500'}`}>
                {integrityData.pass ? 'PASS' : 'FAIL'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {integrityData.pass
                  ? `${formatBytes(integrityData.bytesVerified)} verified — zero corruption`
                  : `${integrityData.errorCount.toLocaleString()} errors detected`}
              </p>
            </div>
          )}

          {/* Not checked */}
          {!integrityData && summary.integrityChecked === false && (
            <div className="p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Data Integrity</span>
              </div>
              <p className="text-lg font-bold text-muted-foreground">Skipped</p>
              <p className="text-xs text-muted-foreground mt-1">
                Enable "Data Integrity Check" option for verification
              </p>
            </div>
          )}

          {/* Random I/O */}
          {randomIoData && (
            <div className="p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">Random I/O Latency</span>
              </div>
              <p className="text-2xl font-bold text-purple-500">
                {randomIoData.avgMs.toFixed(2)} <span className="text-sm font-normal">ms avg</span>
              </p>
              <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                <span>Min: {randomIoData.minMs.toFixed(2)}ms</span>
                <span>Max: {randomIoData.maxMs.toFixed(2)}ms</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {randomIoData.iterations} × {(randomIoData.blockSize / 1024).toFixed(0)}KB random reads
              </p>
            </div>
          )}
        </div>

        {/* Capacity Check */}
        {capacityData && (
          <div className={`p-4 rounded-xl border ${capacityData.pass ? 'bg-green-500/5' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className={`h-4 w-4 ${capacityData.pass ? 'text-green-500' : 'text-red-500'}`} />
              <span className="text-sm font-medium">Capacity Verification</span>
              <span className={`ml-auto text-xs font-medium ${capacityData.pass ? 'text-green-500' : 'text-red-500'}`}>
                {capacityData.pass ? 'PASS' : 'FAILED'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Expected ~{capacityData.expectedMb} MB used, actual ~{capacityData.actualUsedMb} MB
              {capacityData.discrepancyMb > 0 && ` (±${capacityData.discrepancyMb} MB discrepancy)`}
            </p>
          </div>
        )}

        {/* Test Info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span>Intensity: {summary.intensity}</span>
          <span>Test size: {summary.testSizeMb} MB</span>
          <span>Duration: {summary.totalDurationSecs.toFixed(1)}s</span>
        </div>
      </div>
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const summaryFinding = result.findings.find(
    (f) => (f.data as UsbSummaryData | undefined)?.type === 'usb_summary'
  );
  const summary = summaryFinding?.data as UsbSummaryData | undefined;

  if (!summary) return null;

  const passed = summary.overallStatus === 'PASS';
  const hasWarnings = summary.overallStatus === 'PASS WITH WARNINGS';

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${passed ? 'bg-green-100' : hasWarnings ? 'bg-yellow-100' : 'bg-red-100'}`}>
          <Usb className={`h-5 w-5 ${passed ? 'text-green-600' : hasWarnings ? 'text-yellow-600' : 'text-red-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            USB Drive Test
          </p>
          <p className="text-xl font-bold text-gray-900">
            {summary.volumeLabel} ({summary.drivePath})
          </p>
          <div className="text-sm text-gray-500 mt-1 space-y-0.5">
            <p>
              Storage: {formatBytes(summary.totalSpaceBytes)} ({summary.fileSystem})
            </p>
            <p>
              Write Speed: {summary.writeSpeedMbps.toFixed(1)} MB/s — Read Speed: {summary.readSpeedMbps.toFixed(1)} MB/s
            </p>
            {summary.integrityChecked && (
              <p>
                Data Integrity: {summary.integrityPass ? '✓ Verified' : `✗ ${summary.integrityErrors} errors found`}
              </p>
            )}
          </div>
          {!passed && !hasWarnings && (
            <p className="text-sm text-red-600 mt-2">
              ⚠ Issues detected — this drive may need to be replaced
            </p>
          )}
          {hasWarnings && (
            <p className="text-sm text-yellow-600 mt-2">
              ⚠ Minor issues detected — drive is functional but may have reduced performance
            </p>
          )}
        </div>
        <div className={`text-2xl ${passed ? 'text-green-500' : hasWarnings ? 'text-yellow-500' : 'text-red-500'}`}>
          {passed ? '✓' : hasWarnings ? '⚠' : '✗'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function UsbStabilityRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
