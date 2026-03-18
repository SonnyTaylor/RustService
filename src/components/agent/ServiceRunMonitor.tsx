/**
 * ServiceRunMonitor
 *
 * Inline chat component that shows service run progress.
 * Displays a service list with status icons, expandable logs,
 * elapsed time, control buttons, and a rich completion summary.
 */

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ServiceRunState, ServiceDefinition, FindingSeverity } from '@/types/service';
import {
  Pause,
  Play,
  X,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
  ShieldAlert,
  AlertOctagon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ServiceRunMonitorProps {
  reportId: string;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

const SEVERITY_ICON: Record<FindingSeverity, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-chart-1' },
  success: { icon: CheckCircle2, className: 'text-chart-2' },
  warning: { icon: AlertTriangle, className: 'text-chart-4' },
  error: { icon: XCircle, className: 'text-destructive' },
  critical: { icon: AlertOctagon, className: 'text-destructive' },
};

export function ServiceRunMonitor({
  reportId,
  onPause,
  onResume,
  onCancel,
}: ServiceRunMonitorProps) {
  const [state, setState] = useState<ServiceRunState | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [definitions, setDefinitions] = useState<Map<string, ServiceDefinition>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(Date.now());

  // Load service definitions
  useEffect(() => {
    invoke<ServiceDefinition[]>('get_service_definitions').then(defs => {
      const map = new Map<string, ServiceDefinition>();
      for (const d of defs) map.set(d.id, d);
      setDefinitions(map);
    }).catch(() => {});
  }, []);

  // Elapsed time counter
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to service events
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    invoke<ServiceRunState>('get_service_run_state').then(s => setState(s)).catch(() => {});

    unlisteners.push(
      listen<ServiceRunState>('service-state-changed', (event) => {
        setState(event.payload);
      })
    );

    unlisteners.push(
      listen<{ serviceId: string; log: string }>('service-log', (event) => {
        setLogs(prev => {
          const next = [...prev, event.payload.log];
          return next.length > 100 ? next.slice(-100) : next;
        });
      })
    );

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()));
    };
  }, [reportId]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const report = state?.currentReport;
  const isRunning = state?.isRunning ?? false;
  const isPaused = state?.isPaused ?? false;
  const enabledQueue = report?.queue.filter(q => q.enabled) ?? [];
  const total = enabledQueue.length;
  const currentIndex = report?.currentServiceIndex ?? 0;
  const completedCount = report?.results.length ?? 0;
  const currentServiceId = enabledQueue[currentIndex]?.serviceId;
  const progress = total > 0 ? (completedCount / total) * 100 : 0;

  const isComplete = report?.status === 'completed' || report?.status === 'failed' || report?.status === 'cancelled';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDuration = (ms: number) => {
    const s = ms / 1000;
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  };

  const statusIcon = isComplete
    ? report?.status === 'completed'
      ? <CheckCircle2 className="h-4 w-4 text-chart-2" />
      : report?.status === 'cancelled'
        ? <AlertTriangle className="h-4 w-4 text-chart-4" />
        : <XCircle className="h-4 w-4 text-destructive" />
    : isPaused
      ? <Pause className="h-4 w-4 text-chart-4" />
      : <Activity className="h-4 w-4 text-primary animate-pulse" />;

  const statusText = isComplete
    ? report?.status === 'completed'
      ? `Completed — ${completedCount} services run`
      : report?.status === 'cancelled'
        ? 'Cancelled'
        : `Failed — ${completedCount}/${total} services`
    : isPaused
      ? `Paused at service ${completedCount + 1}/${total}`
      : `Running service ${completedCount + 1}/${total}`;

  // Compute finding severity breakdown from results
  const severityCounts = { critical: 0, error: 0, warning: 0, info: 0, success: 0 };
  const passCount = report?.results.filter(r => r.success).length ?? 0;
  const failCount = report?.results.filter(r => !r.success).length ?? 0;
  if (report) {
    for (const result of report.results) {
      for (const finding of result.findings) {
        severityCounts[finding.severity] = (severityCounts[finding.severity] || 0) + 1;
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl w-full my-3">
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="text-sm font-medium">{statusText}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(elapsed)}
            </span>
            {isRunning && !isComplete && (
              <>
                {isPaused ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onResume}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Resume
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onPause}>
                    <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={onCancel}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3">
          <div
            className={cn(
              'h-full transition-all duration-500 rounded-full',
              isComplete
                ? report?.status === 'completed'
                  ? 'bg-chart-2'
                  : 'bg-destructive'
                : isPaused
                  ? 'bg-chart-4'
                  : 'bg-primary'
            )}
            style={{ width: `${isComplete ? 100 : progress}%` }}
          />
        </div>

        {/* Service List */}
        <div className="max-h-48 overflow-y-auto mb-3 space-y-0.5">
          {enabledQueue.map((item, i) => {
            const result = report?.results.find(r => r.serviceId === item.serviceId);
            const isCurrent = i === currentIndex && !isComplete;
            const name = definitions.get(item.serviceId)?.name ?? item.serviceId;
            const findingCount = result?.findings.length ?? 0;

            return (
              <div
                key={item.serviceId}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors',
                  isCurrent && 'bg-primary/5 border border-primary/20',
                  !isCurrent && !result && 'opacity-50',
                )}
              >
                {/* Status icon */}
                {result ? (
                  result.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-chart-2 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  )
                ) : isCurrent ? (
                  isPaused ? (
                    <Pause className="h-3.5 w-3.5 text-chart-4 shrink-0" />
                  ) : (
                    <Activity className="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
                  )
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                )}

                {/* Service name */}
                <span className={cn(
                  'flex-1 truncate',
                  isCurrent && 'font-medium text-foreground',
                  result && !isCurrent && 'text-muted-foreground',
                )}>
                  {name}
                </span>

                {/* Duration */}
                {result && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDuration(result.durationMs)}
                  </span>
                )}

                {/* Finding count badge */}
                {result && findingCount > 0 && (
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full shrink-0',
                    result.success
                      ? 'bg-chart-2/10 text-chart-2'
                      : 'bg-destructive/10 text-destructive'
                  )}>
                    {findingCount}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Expandable Live Log Tail */}
        {logs.length > 0 && !isComplete && (
          <div className="mb-3">
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
            >
              {logsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {logsExpanded ? 'Collapse logs' : 'Expand logs'}
            </button>
            <div className={cn(
              'bg-muted/50 rounded-md p-2 overflow-y-auto text-xs font-mono text-muted-foreground transition-all',
              logsExpanded ? 'max-h-64' : 'max-h-20',
            )}>
              {logs.slice(logsExpanded ? -50 : -5).map((log, i) => (
                <div key={i} className="truncate">{log}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Completion Summary */}
        {isComplete && report && (
          <div className="space-y-2">
            {/* Pass/Fail counts */}
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-chart-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {passCount} passed
              </span>
              {failCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-3.5 w-3.5" />
                  {failCount} failed
                </span>
              )}
              {report.totalDurationMs && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDuration(report.totalDurationMs)} total
                </span>
              )}
            </div>

            {/* Finding severity breakdown */}
            {(severityCounts.critical + severityCounts.error + severityCounts.warning + severityCounts.info + severityCounts.success) > 0 && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>Findings:</span>
                {(['critical', 'error', 'warning', 'info', 'success'] as FindingSeverity[])
                  .filter(s => severityCounts[s] > 0)
                  .map(severity => {
                    const config = SEVERITY_ICON[severity];
                    const SevIcon = config.icon;
                    return (
                      <span key={severity} className={cn('flex items-center gap-1', config.className)}>
                        <SevIcon className="h-3 w-3" />
                        {severityCounts[severity]}
                      </span>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
