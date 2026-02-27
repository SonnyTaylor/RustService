/**
 * ServiceRunMonitor
 * 
 * Inline chat component that shows service run progress.
 * Displays a progress bar, current service, live log tail,
 * elapsed time, and control buttons (pause/resume/cancel).
 */

import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ServiceRunState, ServiceDefinition } from '@/types/service';
import {
  Pause,
  Play,
  X,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ServiceRunMonitorProps {
  reportId: string;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

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

    // Get initial state
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
          // Keep last 50 lines
          return next.length > 50 ? next.slice(-50) : next;
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
  const currentServiceName = currentServiceId
    ? definitions.get(currentServiceId)?.name ?? currentServiceId
    : 'Unknown';
  const progress = total > 0 ? (completedCount / total) * 100 : 0;

  const isComplete = report?.status === 'completed' || report?.status === 'failed' || report?.status === 'cancelled';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const statusIcon = isComplete
    ? report?.status === 'completed'
      ? <CheckCircle2 className="h-4 w-4 text-green-500" />
      : report?.status === 'cancelled'
        ? <AlertTriangle className="h-4 w-4 text-yellow-500" />
        : <XCircle className="h-4 w-4 text-red-500" />
    : isPaused
      ? <Pause className="h-4 w-4 text-orange-500" />
      : <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;

  const statusText = isComplete
    ? report?.status === 'completed'
      ? `Completed — ${completedCount} services run`
      : report?.status === 'cancelled'
        ? 'Cancelled'
        : `Failed — ${completedCount}/${total} services`
    : isPaused
      ? `Paused at service ${completedCount + 1}/${total}`
      : `Running service ${completedCount + 1}/${total}: ${currentServiceName}`;

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
            <span className="text-xs text-muted-foreground">{formatTime(elapsed)}</span>
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
                  ? 'bg-green-500'
                  : 'bg-red-500'
                : isPaused
                  ? 'bg-orange-500'
                  : 'bg-blue-500'
            )}
            style={{ width: `${isComplete ? 100 : progress}%` }}
          />
        </div>

        {/* Service Progress Dots */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {enabledQueue.map((item, i) => {
            const result = report?.results.find(r => r.serviceId === item.serviceId);
            const isCurrent = i === currentIndex && !isComplete;
            const name = definitions.get(item.serviceId)?.name ?? item.serviceId;

            return (
              <div
                key={item.serviceId}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  total <= 10 ? 'flex-1' : 'w-3',
                  result
                    ? result.success
                      ? 'bg-green-500'
                      : 'bg-red-500'
                    : isCurrent
                      ? isPaused ? 'bg-orange-500 animate-pulse' : 'bg-blue-500 animate-pulse'
                      : 'bg-muted-foreground/20'
                )}
                title={`${name}: ${result ? (result.success ? 'Passed' : 'Failed') : isCurrent ? 'Running' : 'Pending'}`}
              />
            );
          })}
        </div>

        {/* Live Log Tail */}
        {logs.length > 0 && !isComplete && (
          <div className="bg-muted/50 rounded-md p-2 max-h-24 overflow-y-auto text-xs font-mono text-muted-foreground">
            {logs.slice(-8).map((log, i) => (
              <div key={i} className="truncate">{log}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Completion Summary */}
        {isComplete && report && (
          <div className="text-xs text-muted-foreground">
            {report.results.filter(r => r.success).length} passed, {report.results.filter(r => !r.success).length} failed
            {report.totalDurationMs && ` — ${(report.totalDurationMs / 1000).toFixed(1)}s total`}
          </div>
        )}
      </div>
    </div>
  );
}
