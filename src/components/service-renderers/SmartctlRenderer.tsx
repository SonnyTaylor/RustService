/**
 * Smartctl Drive Health Renderer
 *
 * Custom renderer for SMART drive health results.
 * Shows health status, wear level, and drive statistics.
 */

import { HardDrive, Activity, Thermometer, Clock, RotateCcw, AlertTriangle, Check, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface DriveHealth {
  name: string;
  modelName: string;
  serialNumber?: string;
  firmwareVersion?: string;
  healthPassed?: boolean;
  wearLevelPercent?: number;
  powerOnHours?: number;
  powerCycles?: number;
  unsafeShutdowns?: number;
  mediaErrors?: number;
  dataWrittenTb?: number;
  dataReadTb?: number;
  temperatureCelsius?: number;
}

interface SmartctlData {
  type: 'smartctl_result';
  drives: DriveHealth[];
  summary: {
    total: number;
    healthy: number;
    warning: number;
    failed: number;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatHours(hours: number): string {
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);
  if (years > 0) {
    const remainingDays = days % 365;
    return `${years}y ${Math.floor(remainingDays / 30)}mo`;
  }
  if (days > 30) {
    return `${Math.floor(days / 30)}mo ${days % 30}d`;
  }
  return `${days}d ${hours % 24}h`;
}

function getWearColor(wear?: number): string {
  if (wear === undefined) return 'text-muted-foreground';
  if (wear <= 20) return 'text-green-500';
  if (wear <= 50) return 'text-yellow-500';
  if (wear <= 80) return 'text-orange-500';
  return 'text-red-500';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as SmartctlData | undefined;

  if (!data || data.type !== 'smartctl_result') {
    return null;
  }

  const { drives, summary } = data;
  const allHealthy = summary.failed === 0 && summary.warning === 0;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className={`py-4 bg-gradient-to-r ${allHealthy ? 'from-green-500/10 to-emerald-500/10' : 'from-yellow-500/10 to-orange-500/10'}`}>
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${allHealthy ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
              <Activity className={`h-5 w-5 ${allHealthy ? 'text-green-500' : 'text-yellow-500'}`} />
            </div>
            Drive Health Report
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${allHealthy ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
              {summary.total} DRIVE{summary.total !== 1 ? 'S' : ''}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {drives.map((drive, index) => (
            <div key={index} className="p-4 rounded-xl bg-muted/30 border space-y-3">
              {/* Drive Header */}
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${drive.healthPassed === false ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                  <HardDrive className={`h-5 w-5 ${drive.healthPassed === false ? 'text-red-500' : 'text-blue-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{drive.modelName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {drive.serialNumber || drive.name}
                  </p>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                  drive.healthPassed === false
                    ? 'bg-red-500/10 text-red-500'
                    : drive.healthPassed === true
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {drive.healthPassed === false ? (
                    <>
                      <AlertTriangle className="h-3 w-3" />
                      FAILED
                    </>
                  ) : drive.healthPassed === true ? (
                    <>
                      <Check className="h-3 w-3" />
                      HEALTHY
                    </>
                  ) : (
                    'UNKNOWN'
                  )}
                </div>
              </div>

              {/* Wear Level Progress */}
              {drive.wearLevelPercent !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Wear Level</span>
                    <span className={`font-medium ${getWearColor(drive.wearLevelPercent)}`}>
                      {drive.wearLevelPercent}%
                    </span>
                  </div>
                  <Progress value={drive.wearLevelPercent} className="h-2" />
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {drive.powerOnHours !== undefined && (
                  <div className="p-2 rounded-lg bg-background flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Power On</p>
                      <p className="text-sm font-medium">{formatHours(drive.powerOnHours)}</p>
                    </div>
                  </div>
                )}
                {drive.powerCycles !== undefined && (
                  <div className="p-2 rounded-lg bg-background flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Cycles</p>
                      <p className="text-sm font-medium">{drive.powerCycles.toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {drive.temperatureCelsius !== undefined && (
                  <div className="p-2 rounded-lg bg-background flex items-center gap-2">
                    <Thermometer className={`h-4 w-4 ${drive.temperatureCelsius > 60 ? 'text-red-500' : drive.temperatureCelsius > 45 ? 'text-yellow-500' : 'text-cyan-500'}`} />
                    <div>
                      <p className="text-xs text-muted-foreground">Temp</p>
                      <p className="text-sm font-medium">{drive.temperatureCelsius}°C</p>
                    </div>
                  </div>
                )}
                {drive.dataWrittenTb !== undefined && (
                  <div className="p-2 rounded-lg bg-background flex items-center gap-2">
                    <Activity className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Written</p>
                      <p className="text-sm font-medium">{drive.dataWrittenTb.toFixed(1)} TB</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {drive.mediaErrors && drive.mediaErrors > 0 && (
                <div className="p-2 rounded-lg bg-red-500/10 flex items-center gap-2 text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  {drive.mediaErrors} media error(s) detected
                </div>
              )}
            </div>
          ))}

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
  const data = finding?.data as SmartctlData | undefined;

  if (!data || data.type !== 'smartctl_result') {
    return null;
  }

  const { drives, summary } = data;
  const allHealthy = summary.failed === 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${allHealthy ? 'bg-green-100' : 'bg-red-100'}`}>
          <HardDrive className={`h-5 w-5 ${allHealthy ? 'text-green-600' : 'text-red-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Drive Health
          </p>
          <p className="text-xl font-bold text-gray-900">
            {allHealthy ? 'All Drives Healthy' : `${summary.failed} Drive(s) Need Attention`}
          </p>
          <div className="text-sm text-gray-500 mt-1 space-y-1">
            {drives.map((drive, i) => (
              <p key={i}>
                • {drive.modelName}: {drive.healthPassed === false ? '❌ Failed' : '✓ Healthy'}
                {drive.wearLevelPercent !== undefined && ` (${drive.wearLevelPercent}% wear)`}
              </p>
            ))}
          </div>
          {!allHealthy && (
            <p className="text-sm text-red-600 mt-2">
              ⚠ Backup data immediately and consider drive replacement
            </p>
          )}
        </div>
        <div className={`text-2xl ${allHealthy ? 'text-green-500' : 'text-red-500'}`}>
          {allHealthy ? '✓' : '✗'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function SmartctlRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
