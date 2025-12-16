/**
 * Service Metrics Settings Panel
 * 
 * Displays service execution time statistics, PC fingerprint,
 * and controls for managing metrics data.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Timer,
  Cpu,
  MemoryStick,
  HardDrive,
  Trash2,
  RefreshCw,
  Clock,
  BarChart3,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Loader2,
  Zap,
  Wifi,
  Battery,
  Monitor,
  Activity,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type {
  PcFingerprint,
  ServiceTimeStats,
  ServiceTimeMetrics,
} from '@/types/time-tracking';
import { formatDuration, getConfidenceColor, getConfidenceBadge, getNetworkTypeLabel, formatModelQuality, getModelQualityColor } from '@/types/time-tracking';

// =============================================================================
// Types
// =============================================================================

interface ServiceDefinition {
  id: string;
  name: string;
  icon: string;
  estimatedDurationSecs: number;
}

// =============================================================================
// PC Fingerprint Display (Enhanced)
// =============================================================================

function PcFingerprintCard({ fingerprint }: { fingerprint: PcFingerprint | null }) {
  if (!fingerprint) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Cpu className="h-5 w-5 text-blue-500" />
            Current PC Specs
          </CardTitle>
          <CardDescription>Loading system information...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Core specs (top row)
  const coreSpecs = [
    {
      icon: Cpu,
      label: 'CPU',
      value: fingerprint.cpuScore.toFixed(1),
      description: `${fingerprint.physicalCores}c/${fingerprint.logicalCores}t @ ${fingerprint.frequencyGhz.toFixed(1)}GHz`,
      color: 'text-blue-500',
    },
    {
      icon: MemoryStick,
      label: 'RAM',
      value: `${fingerprint.availableRamGb.toFixed(0)}GB`,
      description: `of ${fingerprint.totalRamGb.toFixed(0)}GB avail`,
      color: 'text-purple-500',
    },
    {
      icon: HardDrive,
      label: 'Storage',
      value: fingerprint.diskIsSsd ? 'SSD' : 'HDD',
      description: fingerprint.diskIsSsd ? 'Fast' : 'Slow',
      color: fingerprint.diskIsSsd ? 'text-green-500' : 'text-orange-500',
    },
    {
      icon: Activity,
      label: 'Load',
      value: `${fingerprint.cpuLoadPercent.toFixed(0)}%`,
      description: fingerprint.cpuLoadPercent > 70 ? 'High' : fingerprint.cpuLoadPercent > 30 ? 'Medium' : 'Low',
      color: fingerprint.cpuLoadPercent > 70 ? 'text-red-500' : fingerprint.cpuLoadPercent > 30 ? 'text-yellow-500' : 'text-green-500',
    },
  ];

  // Extended specs (bottom row - badges)
  const extendedSpecs = [
    {
      icon: Battery,
      label: fingerprint.isOnAcPower ? 'AC Power' : 'Battery',
      active: fingerprint.isOnAcPower,
    },
    {
      icon: Zap,
      label: 'AVX2',
      active: fingerprint.hasAvx2,
    },
    {
      icon: Monitor,
      label: 'Discrete GPU',
      active: fingerprint.hasDiscreteGpu,
    },
    {
      icon: Wifi,
      label: getNetworkTypeLabel(fingerprint.networkType),
      active: fingerprint.networkType === 'ethernet',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="h-5 w-5 text-blue-500" />
          Current PC Specs
        </CardTitle>
        <CardDescription>
          Used for estimating service durations on your machine
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Core specs grid */}
        <div className="grid grid-cols-4 gap-3">
          {coreSpecs.map((spec) => (
            <div
              key={spec.label}
              className="flex flex-col items-center p-2 rounded-lg bg-muted/50 text-center"
            >
              <spec.icon className={`h-5 w-5 ${spec.color} mb-1`} />
              <span className="text-base font-semibold">{spec.value}</span>
              <span className="text-xs text-muted-foreground">{spec.label}</span>
              <span className="text-[10px] text-muted-foreground/70 truncate w-full">{spec.description}</span>
            </div>
          ))}
        </div>
        
        {/* Extended specs badges */}
        <div className="flex flex-wrap gap-2">
          {extendedSpecs.map((spec) => (
            <Badge
              key={spec.label}
              variant={spec.active ? 'default' : 'outline'}
              className={`text-xs ${!spec.active && 'opacity-50'}`}
            >
              <spec.icon className="h-3 w-3 mr-1" />
              {spec.label}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Service Stats Row
// =============================================================================

interface ServiceStatsRowProps {
  stats: ServiceTimeStats;
  serviceName: string;
  onClear: (serviceId: string) => void;
}

function ServiceStatsRow({ stats, serviceName, onClear }: ServiceStatsRowProps) {
  const confidenceColor = getConfidenceColor(stats.confidence);
  const confidenceVariant = getConfidenceBadge(stats.confidence);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{serviceName}</span>
          <Badge variant={confidenceVariant} className="text-xs">
            {stats.sampleCount} sample{stats.sampleCount !== 1 ? 's' : ''}
          </Badge>
          {stats.modelQuality !== undefined && stats.modelQuality > 0 && (
            <Badge variant="outline" className={`text-xs ${getModelQualityColor(stats.modelQuality)}`}>
              R² {formatModelQuality(stats.modelQuality)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Avg: {formatDuration(stats.averageMs)}
          </span>
          <span>Min: {formatDuration(stats.minMs)}</span>
          <span>Max: {formatDuration(stats.maxMs)}</span>
          {stats.estimatedMs && (
            <span className="flex items-center gap-1 text-primary">
              <TrendingUp className="h-3 w-3" />
              Est: {formatDuration(stats.estimatedMs)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${confidenceColor}`}>
          {stats.confidence === 'high' && <CheckCircle className="h-4 w-4" />}
          {stats.confidence === 'medium' && '~'}
          {stats.confidence === 'low' && <AlertCircle className="h-4 w-4" />}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => onClear(stats.serviceId)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Panel
// =============================================================================

export function ServiceMetricsPanel() {
  const [fingerprint, setFingerprint] = useState<PcFingerprint | null>(null);
  const [stats, setStats] = useState<ServiceTimeStats[]>([]);
  const [metrics, setMetrics] = useState<ServiceTimeMetrics | null>(null);
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [isRetraining, setIsRetraining] = useState(false);

  // Load data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fp, allStats, allMetrics, serviceDefs] = await Promise.all([
        invoke<PcFingerprint>('get_pc_fingerprint'),
        invoke<ServiceTimeStats[]>('get_service_averages'),
        invoke<ServiceTimeMetrics>('get_service_time_metrics'),
        invoke<ServiceDefinition[]>('get_service_definitions'),
      ]);
      setFingerprint(fp);
      setStats(allStats);
      setMetrics(allMetrics);
      setServices(serviceDefs);
    } catch (error) {
      console.error('Failed to load metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Get service name from ID
  const getServiceName = (serviceId: string): string => {
    return services.find((s) => s.id === serviceId)?.name ?? serviceId;
  };

  // Clear specific service metrics
  const handleClearService = async (serviceId: string) => {
    try {
      await invoke('clear_service_metrics', { serviceId });
      await loadData();
    } catch (error) {
      console.error('Failed to clear service metrics:', error);
    }
  };

  // Clear all metrics
  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const deleted = await invoke<number>('clear_service_metrics', { serviceId: null });
      console.log(`Cleared ${deleted} samples`);
      await loadData();
    } catch (error) {
      console.error('Failed to clear all metrics:', error);
    } finally {
      setIsClearing(false);
    }
  };

  // Retrain models
  const handleRetrain = async () => {
    setIsRetraining(true);
    try {
      const trained = await invoke<number>('retrain_time_models');
      console.log(`Trained ${trained} models`);
      await loadData();
    } catch (error) {
      console.error('Failed to retrain models:', error);
    } finally {
      setIsRetraining(false);
    }
  };

  // Calculate summary stats
  const totalSamples = metrics?.samples.length ?? 0;
  const servicesTracked = stats.length;
  const modelsTraining = Object.keys(metrics?.models ?? {}).length;

  // Sort stats by sample count (most data first)
  const sortedStats = [...stats].sort((a, b) => b.sampleCount - a.sampleCount);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">Service Metrics</h3>
        <p className="text-muted-foreground">
          Track service execution times and get intelligent time estimates
        </p>
      </div>

      {/* Overview Stats & PC Fingerprint */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PcFingerprintCard fingerprint={fingerprint} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-green-500" />
              Metrics Overview
            </CardTitle>
            <CardDescription>
              Collected timing data and trained models
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50 text-center">
                <span className="text-2xl font-bold text-primary">{totalSamples}</span>
                <span className="text-xs text-muted-foreground">Total Samples</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50 text-center">
                <span className="text-2xl font-bold text-green-500">{servicesTracked}</span>
                <span className="text-xs text-muted-foreground">Services Tracked</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50 text-center">
                <span className="text-2xl font-bold text-blue-500">{modelsTraining}</span>
                <span className="text-xs text-muted-foreground">Trained Models</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetrain}
                disabled={isRetraining || totalSamples < 5}
              >
                {isRetraining ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Retrain Models
              </Button>
              <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Statistics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Timer className="h-5 w-5 text-orange-500" />
            Service Timing Statistics
          </CardTitle>
          <CardDescription>
            Outlier-resistant averages with confidence levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedStats.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Timer className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No timing data yet</p>
              <p className="text-sm">Run some services to start collecting timing statistics</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {sortedStats.map((stat) => (
                  <ServiceStatsRow
                    key={stat.serviceId}
                    stats={stat}
                    serviceName={getServiceName(stat.serviceId)}
                    onClear={handleClearService}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Confidence Explanation */}
      <Card className="bg-muted/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium mb-1">How Estimates Work</h4>
              <p className="text-sm text-muted-foreground">
                Time estimates improve as you run more services. With 5+ samples, we use linear
                regression to predict times based on your PC's CPU, RAM, and storage type.
                Outliers (unusually fast or slow runs) are automatically filtered out for accurate
                averages.
              </p>
              <div className="flex gap-4 mt-3 text-xs">
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  High: 5+ samples
                </span>
                <span className="flex items-center gap-1 text-yellow-500">~ Medium: 3-4 samples</span>
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-orange-500" />
                  Low: 1-2 samples
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions for metrics management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/5">
            <div>
              <p className="text-sm font-medium">Clear all timing data</p>
              <p className="text-xs text-muted-foreground">
                Remove all samples and trained models
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isClearing || totalSamples === 0}>
                  {isClearing ? 'Clearing...' : 'Clear All'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all timing data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {totalSamples} sample{totalSamples !== 1 ? 's' : ''}{' '}
                    and {modelsTraining} trained model{modelsTraining !== 1 ? 's' : ''}. Time
                    estimates will reset to defaults.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAll}>Clear All Data</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ServiceMetricsPanel;
