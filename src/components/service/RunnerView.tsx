/**
 * Runner View Component
 *
 * Real-time service execution monitor with progress tracking,
 * inline error display, live findings feed, and smarter ETA.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Square,
  CheckCircle2,
  AlertCircle,
  Timer,
  Clock,
  Zap,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import type {
  ServiceReport,
  ServiceDefinition,
  ServiceQueueItem,
  ServiceFinding,
} from '@/types/service';
import { getIcon, formatDuration } from './utils';

// =============================================================================
// Types
// =============================================================================

export interface RunnerViewProps {
  report: ServiceReport | null;
  definitions: ServiceDefinition[];
  logs: string[];
  onCancel: () => void;
  onBack: () => void;
  queue: ServiceQueueItem[];
  cancelError?: string | null;
}

// =============================================================================
// Severity Colors
// =============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-purple-500/30 bg-purple-500/5 text-purple-700 dark:text-purple-400',
  error: 'border-destructive/30 bg-destructive/5 text-destructive',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  info: 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400',
  success: 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400',
};

// =============================================================================
// Component
// =============================================================================

export function RunnerView({ report, definitions, logs, onCancel, onBack, queue, cancelError }: RunnerViewProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taskElapsedMs, setTaskElapsedMs] = useState(0);
  const startTimeRef = useRef(Date.now());
  const taskStartRef = useRef(Date.now());
  // Per-task elapsed timers for parallel mode (keyed by queue index)
  const [parallelTaskTimers, setParallelTaskTimers] = useState<Map<number, number>>(new Map());
  const parallelTaskStartRef = useRef<Map<number, number>>(new Map());
  // Track expanded failed items
  const [expandedFailed, setExpandedFailed] = useState<Set<string>>(new Set());

  // Estimated times per service from the definitions
  const definitionMap = new Map(definitions.map((d) => [d.id, d]));

  // Use the queue prop as fallback when report is not yet populated
  const enabledServices = (report?.queue ?? queue).filter((q) => q.enabled);
  const isParallel = report?.parallelMode ?? false;
  const currentIndex = report?.currentServiceIndex ?? 0;
  const currentIndices = report?.currentServiceIndices ?? [];
  const completedCount = report?.results?.length ?? 0;
  const totalCount = enabledServices.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const currentService = enabledServices[currentIndex];
  const currentDef = currentService ? definitionMap.get(currentService.serviceId) : null;

  // Smarter ETA: use actual completion times to compute speed factor
  const completedResults = report?.results ?? [];
  const actualCompletedMs = completedResults.reduce((s, r) => s + r.durationMs, 0);
  const estimatedCompletedMs = completedResults.reduce((s, r) => {
    const def = definitionMap.get(r.serviceId);
    return s + (def?.estimatedDurationSecs ?? 30) * 1000;
  }, 0);
  const speedFactor = estimatedCompletedMs > 0 ? actualCompletedMs / estimatedCompletedMs : 1;

  // Remaining services estimate
  const completedServiceIds = new Set(completedResults.map(r => r.serviceId));
  const remainingServices = enabledServices.filter(item => !completedServiceIds.has(item.serviceId));
  const remainingEstMs = remainingServices.reduce((s, item) => {
    const def = definitionMap.get(item.serviceId);
    return s + (def?.estimatedDurationSecs ?? 30) * 1000;
  }, 0);
  const activeCount = isParallel ? Math.max(1, currentIndices.length) : 1;
  const estimatedRemainingMs = Math.max(0, (remainingEstMs * speedFactor) / activeCount);

  // Total estimated for overall progress bar (including speed factor)
  const totalEstimatedMs = enabledServices.reduce((acc, q) => {
    const def = definitionMap.get(q.serviceId);
    return acc + (def?.estimatedDurationSecs ?? 30) * 1000;
  }, 0);

  // Collect notable findings from completed services
  const liveFindings: Array<{ serviceName: string; finding: ServiceFinding }> = [];
  for (const result of completedResults) {
    const def = definitionMap.get(result.serviceId);
    for (const finding of result.findings) {
      if (finding.severity === 'warning' || finding.severity === 'error' || finding.severity === 'critical') {
        liveFindings.push({ serviceName: def?.name ?? result.serviceId, finding });
      }
    }
  }

  // Count failed services
  const failedResults = completedResults.filter(r => !r.success);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Elapsed time ticker
  useEffect(() => {
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
      if (!isParallel) {
        setTaskElapsedMs(Date.now() - taskStartRef.current);
      } else {
        // Update all parallel task timers
        const now = Date.now();
        const newTimers = new Map<number, number>();
        parallelTaskStartRef.current.forEach((start, idx) => {
          newTimers.set(idx, now - start);
        });
        setParallelTaskTimers(newTimers);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isParallel]);

  // Track when current task changes (sequential mode)
  useEffect(() => {
    if (!isParallel) {
      taskStartRef.current = Date.now();
    }
  }, [currentIndex, isParallel]);

  // Track parallel task starts/stops
  useEffect(() => {
    if (isParallel) {
      const prevIndices = new Set(parallelTaskStartRef.current.keys());
      const newIndices = new Set(currentIndices);

      // Add new tasks
      for (const idx of currentIndices) {
        if (!prevIndices.has(idx)) {
          parallelTaskStartRef.current.set(idx, Date.now());
        }
      }
      // Remove completed tasks
      for (const idx of prevIndices) {
        if (!newIndices.has(idx)) {
          parallelTaskStartRef.current.delete(idx);
        }
      }
    }
  }, [currentIndices, isParallel]);

  // Build service status list
  const activeIndexSet = new Set(isParallel ? currentIndices : (currentService ? [currentIndex] : []));

  const serviceStatuses = enabledServices.map((item, index) => {
    const def = definitionMap.get(item.serviceId);
    const result = report?.results?.find(r => r.serviceId === item.serviceId);
    let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
    if (completedServiceIds.has(item.serviceId)) {
      status = result?.success ? 'completed' : 'failed';
    } else if (isParallel ? activeIndexSet.has(index) : index === currentIndex) {
      status = 'running';
    }
    return { item, def, result, status, index };
  });

  // Get active services for the header display
  const activeServices = serviceStatuses.filter(s => s.status === 'running');

  const toggleFailedExpanded = (serviceId: string) => {
    setExpandedFailed(prev => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-5 pb-4 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex items-center justify-center w-10 h-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Running Services</h2>
              {isParallel && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400 gap-1">
                  <FlaskConical className="h-2.5 w-2.5" />
                  Parallel
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {isParallel ? (
                activeServices.length > 0 ? (
                  <>
                    <span className="text-primary font-medium">{activeServices.length} running</span>
                    {' — '}
                    {completedCount} of {totalCount} complete
                  </>
                ) : (
                  'Starting...'
                )
              ) : (
                currentDef ? (
                  <>
                    <span className="text-primary font-medium">{currentDef.name}</span>
                    {' — '}
                    Step {currentIndex + 1} of {totalCount}
                  </>
                ) : (
                  'Starting...'
                )
              )}
            </p>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-col items-end gap-1">
            <Button
              variant="destructive"
              size="sm"
              onClick={onCancel}
              className="gap-2"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </Button>
            {cancelError && (
              <p className="text-xs text-destructive">{cancelError}</p>
            )}
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3">
          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {completedCount} of {totalCount} tasks complete
                {isParallel && activeServices.length > 0 && (
                  <span className="ml-1 text-primary">({activeServices.length} active)</span>
                )}
              </span>
              <span className="font-medium text-primary">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2.5" />
          </div>

          {/* Time Stats */}
          <div className={`grid gap-3 ${isParallel ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">Elapsed:</span>{' '}
                <span className="font-medium">{formatDuration(elapsedMs)}</span>
              </div>
            </div>
            {!isParallel && (
              <div className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Task:</span>{' '}
                  <span className="font-medium">{formatDuration(taskElapsedMs)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <span className="text-muted-foreground">ETA:</span>{' '}
                <span className="font-medium">
                  {estimatedRemainingMs > 0 ? `~${formatDuration(estimatedRemainingMs)}` : 'Almost done'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content: Task List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Failed Services Banner */}
          {failedResults.length > 0 && (
            <Alert variant="destructive" className="border-destructive/30">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">{failedResults.length} service{failedResults.length > 1 ? 's' : ''} failed</span>
                {' — '}
                {failedResults.map((r, i) => {
                  const def = definitionMap.get(r.serviceId);
                  return (
                    <span key={r.serviceId}>
                      {i > 0 && ', '}
                      {def?.name ?? r.serviceId}{r.error ? `: ${r.error}` : ''}
                    </span>
                  );
                })}
              </AlertDescription>
            </Alert>
          )}

          {/* Active Task Cards */}
          {isParallel ? (
            // Parallel mode: show all active tasks
            activeServices.length > 0 && (
              <div className="space-y-2">
                {activeServices.map(({ item, def, index }) => {
                  if (!def) return null;
                  const Icon = getIcon(def.icon);
                  const elapsed = parallelTaskTimers.get(index) ?? 0;
                  return (
                    <Card key={item.serviceId} className="border-primary/30 bg-primary/5 overflow-hidden !p-0 !gap-0">
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="p-2 rounded-xl bg-primary/20 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{def.name}</h3>
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0 rounded-full font-medium">
                                Running
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div className="font-medium">{formatDuration(elapsed)}</div>
                            <div>~{def.estimatedDurationSecs}s est.</div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )
          ) : (
            // Sequential mode: show single active task card with per-service progress
            currentDef && (
              <Card className="border-primary/30 bg-primary/5 overflow-hidden !p-0 !gap-0">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                        {(() => { const Icon = getIcon(currentDef.icon); return <Icon className="h-5 w-5" />; })()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary animate-pulse" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{currentDef.name}</h3>
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                          Running
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{currentDef.description}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div className="font-medium">{formatDuration(taskElapsedMs)}</div>
                      <div>~{currentDef.estimatedDurationSecs}s est.</div>
                    </div>
                  </div>

                  {/* Per-service estimated progress bar */}
                  <Progress
                    value={Math.min(100, (taskElapsedMs / (currentDef.estimatedDurationSecs * 1000)) * 100)}
                    className="h-1 mt-3"
                  />

                  {/* Latest log line */}
                  {logs.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-background/80 rounded-lg border text-xs font-mono text-muted-foreground">
                      <span className="text-primary/60 shrink-0">&#10095;</span>
                      <span className="truncate">{logs[logs.length - 1]}</span>
                    </div>
                  )}
                </div>
              </Card>
            )
          )}

          {/* Live Findings Feed */}
          {liveFindings.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Findings So Far ({liveFindings.length})
              </h3>
              {liveFindings.slice(-5).map((f, i) => (
                <div
                  key={i}
                  className={`text-xs px-3 py-2 rounded-lg border ${SEVERITY_COLORS[f.finding.severity] ?? SEVERITY_COLORS.info}`}
                >
                  <span className="font-medium">{f.serviceName}:</span>{' '}
                  {f.finding.title}
                </div>
              ))}
              {liveFindings.length > 5 && (
                <p className="text-[10px] text-muted-foreground italic px-1">
                  +{liveFindings.length - 5} more findings...
                </p>
              )}
            </div>
          )}

          {/* Task Queue List */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Task Queue
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowLogs(!showLogs)}
              >
                {showLogs ? 'Hide Logs' : 'Show Logs'}
              </Button>
            </div>

            {serviceStatuses.map(({ item, def, result, status, index }) => {
              if (!def) return null;
              const Icon = getIcon(def.icon);
              const isActive = status === 'running';
              const isFailed = status === 'failed';
              const taskElapsed = isParallel ? (parallelTaskTimers.get(index) ?? 0) : taskElapsedMs;
              const isExpanded = expandedFailed.has(item.serviceId);

              return (
                <div key={item.serviceId + '-' + index}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isFailed ? 'cursor-pointer' : ''
                    } ${
                      isActive
                        ? 'bg-primary/10 border border-primary/20'
                        : status === 'completed'
                        ? 'bg-muted/30'
                        : isFailed
                        ? 'bg-destructive/5 border border-destructive/20'
                        : 'bg-transparent opacity-50'
                    }`}
                    onClick={isFailed ? () => toggleFailedExpanded(item.serviceId) : undefined}
                  >
                    {/* Status Indicator */}
                    <div className="shrink-0">
                      {status === 'running' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : isFailed ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                    </div>

                    {/* Service Icon */}
                    <div className={`p-1.5 rounded-lg ${
                      isActive ? 'bg-primary/20 text-primary' :
                      status === 'completed' ? 'bg-green-500/10 text-green-500' :
                      isFailed ? 'bg-destructive/10 text-destructive' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>

                    {/* Name + Error */}
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${
                        status === 'pending' ? 'text-muted-foreground' : ''
                      }`}>
                        {def.name}
                      </span>
                      {isFailed && result?.error && (
                        <p className="text-xs text-destructive mt-0.5 truncate">
                          {result.error}
                        </p>
                      )}
                    </div>

                    {/* Duration / Status */}
                    <div className="text-xs text-muted-foreground text-right shrink-0 flex items-center gap-1.5">
                      {status === 'completed' && result ? (
                        <span className="text-green-600 dark:text-green-500">
                          {formatDuration(result.durationMs)}
                        </span>
                      ) : isFailed && result ? (
                        <span className="text-destructive font-medium">Failed</span>
                      ) : status === 'running' ? (
                        <span className="text-primary">{formatDuration(taskElapsed)}</span>
                      ) : (
                        <span>~{def.estimatedDurationSecs}s</span>
                      )}
                      {isFailed && (
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </div>

                  {/* Expanded error details for failed services */}
                  {isFailed && isExpanded && result && (
                    <div className="ml-10 mr-3 mt-1 mb-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
                      {result.error && (
                        <p className="text-xs text-destructive font-medium">{result.error}</p>
                      )}
                      {result.logs.length > 0 && (
                        <div className="font-mono text-[11px] space-y-0.5 text-muted-foreground max-h-32 overflow-y-auto">
                          {result.logs.slice(-10).map((log, idx) => (
                            <div key={idx} className="flex gap-2">
                              <span className="text-destructive/40 select-none shrink-0">&#10095;</span>
                              <span>{log}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Expandable Log Section */}
          {showLogs && (
            <div className="mt-4">
              <div className="font-mono text-xs space-y-1 bg-muted/30 rounded-xl p-4 border max-h-60 overflow-y-auto">
                {logs.length === 0 && (
                  <div className="text-muted-foreground animate-pulse">Starting services...</div>
                )}
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="text-muted-foreground flex gap-2"
                  >
                    <span className="text-primary/60 select-none shrink-0">&#10095;</span>
                    <span>{log}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
