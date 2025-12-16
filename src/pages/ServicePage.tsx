/**
 * Service Page Component
 *
 * Service automation tab - Queue and run maintenance tasks
 * Multi-step flow: Presets → Queue → Runner → Results
 * Services persist when navigating away from the tab.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Wrench,
  Stethoscope,
  ShieldCheck,
  Settings2,
  GripVertical,
  Play,
  ArrowLeft,
  Loader2,
  XCircle,
  Wifi,
  Clock,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettings } from '@/components/settings-context';

import type {
  ServicePreset,
  ServiceDefinition,
  ServiceQueueItem,
  ServiceReport,
  ServiceRunState,
  ServicePhase,
} from '@/types/service';
import { ServiceReportView } from '@/components/service-report-view';

// =============================================================================
// Icon Mapping
// =============================================================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  stethoscope: Stethoscope,
  wrench: Wrench,
  'shield-check': ShieldCheck,
  'settings-2': Settings2,
  wifi: Wifi,
};

function getIcon(iconName: string) {
  return ICON_MAP[iconName] || Wrench;
}

// =============================================================================
// Sortable Queue Item Component
// =============================================================================

interface SortableQueueItemProps {
  item: ServiceQueueItem;
  definition: ServiceDefinition;
  onToggle: (serviceId: string) => void;
  onOptionsChange: (serviceId: string, options: Record<string, unknown>) => void;
}

function SortableQueueItem({
  item,
  definition,
  onToggle,
  onOptionsChange,
}: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.serviceId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const Icon = getIcon(definition.icon);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-4 p-4 rounded-xl border-2 bg-card/50 backdrop-blur-sm transition-all duration-200 ${
        item.enabled
          ? 'border-border hover:border-primary/30 hover:bg-card/80 hover:shadow-lg'
          : 'border-muted/50 opacity-50'
      } ${isDragging ? 'shadow-2xl ring-2 ring-primary/50' : ''}`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-2 rounded-lg hover:bg-muted/80 transition-colors touch-none group-hover:bg-muted/50"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Service Icon */}
      <div
        className={`p-3 rounded-xl transition-colors ${
          item.enabled
            ? 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>

      {/* Service Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold truncate">{definition.name}</h4>
        <p className="text-sm text-muted-foreground truncate">{definition.description}</p>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>~{definition.estimatedDurationSecs}s</span>
        </div>
      </div>

      {/* Options (inline for simple options) */}
      {item.enabled && definition.options.length > 0 && (
        <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2">
          {definition.options.slice(0, 2).map((opt) => (
            <div key={opt.id} className="flex items-center gap-2">
              <Label
                htmlFor={`${item.serviceId}-${opt.id}`}
                className="text-xs text-muted-foreground whitespace-nowrap"
              >
                {opt.label}:
              </Label>
              {opt.optionType === 'number' && (
                <Input
                  id={`${item.serviceId}-${opt.id}`}
                  type="number"
                  min={opt.min}
                  max={opt.max}
                  value={(item.options[opt.id] as number) ?? opt.defaultValue}
                  onChange={(e) =>
                    onOptionsChange(item.serviceId, {
                      ...item.options,
                      [opt.id]: parseInt(e.target.value) || opt.defaultValue,
                    })
                  }
                  className="h-8 w-16 text-sm"
                />
              )}
              {opt.optionType === 'string' && (
                <Input
                  id={`${item.serviceId}-${opt.id}`}
                  type="text"
                  value={(item.options[opt.id] as string) ?? opt.defaultValue}
                  onChange={(e) =>
                    onOptionsChange(item.serviceId, {
                      ...item.options,
                      [opt.id]: e.target.value,
                    })
                  }
                  className="h-8 w-28 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Enable Toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{item.enabled ? 'On' : 'Off'}</span>
        <Switch checked={item.enabled} onCheckedChange={() => onToggle(item.serviceId)} />
      </div>
    </div>
  );
}

// =============================================================================
// Presets View
// =============================================================================

interface PresetsViewProps {
  presets: ServicePreset[];
  onSelectPreset: (preset: ServicePreset) => void;
}

// Preset gradient colors for visual distinction
const PRESET_GRADIENTS: Record<string, { from: string; to: string; accent: string; bullet: string }> = {
  diagnostics: { from: 'from-blue-500/20', to: 'to-cyan-500/10', accent: 'text-blue-500', bullet: 'bg-blue-500' },
  general: { from: 'from-emerald-500/20', to: 'to-green-500/10', accent: 'text-emerald-500', bullet: 'bg-emerald-500' },
  complete: { from: 'from-violet-500/20', to: 'to-purple-500/10', accent: 'text-violet-500', bullet: 'bg-violet-500' },
  custom: { from: 'from-amber-500/20', to: 'to-orange-500/10', accent: 'text-amber-500', bullet: 'bg-amber-500' },
};

function PresetsView({ presets, onSelectPreset }: PresetsViewProps) {
  // Detailed descriptions for each preset with task counts
  const presetDetails: Record<string, { tasks: string[]; badge: string; description: string }> = {
    diagnostics: {
      description: 'Quick system health check',
      badge: '5 tasks',
      tasks: [
        'SMART Disk Report',
        'Disk Space Analysis',
        'Windows Satisfaction Report',
        'Battery Health',
        'Network Tests (Ping & Speed)',
      ],
    },
    general: {
      description: 'Standard maintenance service',
      badge: '8 tasks',
      tasks: [
        'Adware & Malware Removal (ADWCleaner)',
        'Virus Scanning (KVRT)',
        'Registry & Junk Cleanup (BleachBit)',
        'Drive Cleanup (DriveCleanup)',
        'Browser Notifications Disable',
        'Startup Programs Disable',
        'System Diagnostics',
        'Network Tests',
      ],
    },
    complete: {
      description: 'Full system maintenance & repair',
      badge: '12+ tasks',
      tasks: [
        'All General Service tasks',
        'System File Check (SFC Scan)',
        'Windows Image Repair (DISM)',
        'Disk Check (ChkDsk)',
        'Windows Update Check',
        'Extended Network Testing (10 min iPerf)',
      ],
    },
    custom: {
      description: 'Build your own service queue',
      badge: 'Flexible',
      tasks: [
        'Pick and choose from all services',
        'Configure options per service',
        'Reorder execution queue',
        'Save as custom preset',
      ],
    },
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <Wrench className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Service Presets</h2>
            <p className="text-muted-foreground">
              Choose a preset to get started, or create a custom service queue
            </p>
          </div>
        </div>
      </div>

      <Separator className="mx-6" />

      {/* 4-Column Preset Grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {presets.map((preset) => {
              const Icon = getIcon(preset.icon);
              const details = presetDetails[preset.id] || { tasks: [], badge: '', description: '' };
              const gradient = PRESET_GRADIENTS[preset.id] || PRESET_GRADIENTS.custom;

              return (
                <Card
                  key={preset.id}
                  className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-2 hover:border-primary/30 flex flex-col bg-card/50 backdrop-blur-sm overflow-hidden !py-0 !gap-0"
                  onClick={() => onSelectPreset(preset)}
                >
                  {/* Gradient Header */}
                  <div className={`bg-gradient-to-br ${gradient.from} ${gradient.to} p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl bg-background/80 shadow-sm backdrop-blur-sm ${gradient.accent} transition-transform group-hover:scale-110 duration-200`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">
                            {preset.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {details.description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                    </div>
                    
                    {/* Badge */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-background/60 backdrop-blur-sm ${gradient.accent}`}>
                        {details.badge}
                      </span>
                    </div>
                  </div>
                  
                  {/* Task List */}
                  <div className="px-5 py-4 flex-1">
                    <ul className="space-y-2">
                      {details.tasks.slice(0, 6).map((item, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2 group-hover:text-foreground/80 transition-colors">
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${gradient.bullet}`} />
                          <span className="leading-tight">{item}</span>
                        </li>
                      ))}
                      {details.tasks.length > 6 && (
                        <li className="text-xs text-muted-foreground italic pl-3.5">
                          +{details.tasks.length - 6} more tasks...
                        </li>
                      )}
                    </ul>
                  </div>
                  
                  {/* Footer CTA */}
                  <div className="px-5 py-3.5 border-t bg-muted/30 group-hover:bg-primary/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                        Click to configure
                      </span>
                      <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Start
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Queue View
// =============================================================================

interface QueueViewProps {
  queue: ServiceQueueItem[];
  definitions: ServiceDefinition[];
  presetName?: string;
  onBack: () => void;
  onStart: () => void;
  onQueueChange: (queue: ServiceQueueItem[]) => void;
}

function QueueView({ queue, definitions, presetName, onBack, onStart, onQueueChange }: QueueViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const definitionMap = new Map(definitions.map((d) => [d.id, d]));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = queue.findIndex((q) => q.serviceId === active.id);
      const newIndex = queue.findIndex((q) => q.serviceId === over.id);
      const newQueue = arrayMove(queue, oldIndex, newIndex).map((item, index) => ({
        ...item,
        order: index,
      }));
      onQueueChange(newQueue);
    }
  };

  const handleToggle = (serviceId: string) => {
    onQueueChange(
      queue.map((item) =>
        item.serviceId === serviceId ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const handleOptionsChange = (serviceId: string, options: Record<string, unknown>) => {
    onQueueChange(
      queue.map((item) =>
        item.serviceId === serviceId ? { ...item, options } : item
      )
    );
  };

  const enabledCount = queue.filter((q) => q.enabled).length;
  const totalDuration = queue
    .filter((q) => q.enabled)
    .reduce((acc, q) => acc + (definitionMap.get(q.serviceId)?.estimatedDurationSecs || 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Service Queue</h2>
            <p className="text-muted-foreground">
              {presetName && <span className="text-primary font-medium">{presetName}</span>}
              {presetName && ' • '}
              Drag to reorder, toggle to enable/disable
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{enabledCount} services enabled</div>
            <div>~{totalDuration}s estimated</div>
          </div>
        </div>
      </div>

      <Separator className="mx-6" />

      {/* Queue List */}
      <ScrollArea className="flex-1 min-h-0 px-6 py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={queue.map((q) => q.serviceId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3 pb-4">
              {queue.map((item) => {
                const def = definitionMap.get(item.serviceId);
                if (!def) return null;
                return (
                  <SortableQueueItem
                    key={item.serviceId}
                    item={item}
                    definition={def}
                    onToggle={handleToggle}
                    onOptionsChange={handleOptionsChange}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      {/* Footer */}
      <div className="p-6 pt-4 border-t bg-muted/30">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={onStart}
            disabled={enabledCount === 0}
            className="flex-1 gap-2 h-12 text-base font-semibold"
            size="lg"
          >
            <Play className="h-5 w-5" />
            Start Service ({enabledCount} {enabledCount === 1 ? 'task' : 'tasks'})
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Runner View
// =============================================================================

interface RunnerViewProps {
  report: ServiceReport | null;
  definitions: ServiceDefinition[];
  logs: string[];
  onCancel: () => void;
  onBack: () => void;
}

function RunnerView({ report, definitions, logs, onCancel, onBack }: RunnerViewProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const enabledServices = report?.queue.filter((q) => q.enabled) || [];
  const currentIndex = report?.currentServiceIndex ?? 0;
  const completedCount = report?.results.length || 0;
  const progress = enabledServices.length > 0
    ? (completedCount / enabledServices.length) * 100
    : 0;

  const definitionMap = new Map(definitions.map((d) => [d.id, d]));
  const currentService = enabledServices[currentIndex];
  const currentDef = currentService ? definitionMap.get(currentService.serviceId) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <div className="relative">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div className="absolute inset-0 animate-ping opacity-50">
                  <Loader2 className="h-6 w-6 text-primary" />
                </div>
              </div>
              Running Services
            </h2>
            <p className="text-muted-foreground mt-1">
              {currentDef ? (
                <>
                  <span className="text-primary font-medium">{currentDef.name}</span>
                  {' • '}
                </>
              ) : null}
              Step {currentIndex + 1} of {enabledServices.length}
            </p>
          </div>
          <Button variant="destructive" onClick={onCancel} className="gap-2">
            <XCircle className="h-4 w-4" />
            Cancel
          </Button>
        </div>

        {/* Progress */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>
      </div>

      <Separator className="mx-6" />

      {/* Logs */}
      <ScrollArea className="flex-1 min-h-0 p-6">
        <div className="font-mono text-sm space-y-1.5 bg-muted/30 rounded-xl p-4 border">
          {logs.length === 0 && (
            <div className="text-muted-foreground animate-pulse">Starting services...</div>
          )}
          {logs.map((log, index) => (
            <div
              key={index}
              className="text-muted-foreground flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200"
            >
              <span className="text-primary/60 select-none">❯</span>
              <span>{log}</span>
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Results View
// =============================================================================

interface ResultsViewProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  onNewService: () => void;
  onBack: () => void;
}

function ResultsView({ report, definitions, onNewService, onBack }: ResultsViewProps) {
  return (
    <ServiceReportView
      report={report}
      definitions={definitions}
      onBack={onBack}
      onNewService={onNewService}
      headerTitle="Service Complete"
      backButtonLabel="Back to Presets"
    />
  );
}

// =============================================================================
// Main Service Page Component
// =============================================================================

export function ServicePage() {
  const { settings } = useSettings();
  const [phase, setPhase] = useState<ServicePhase>('presets');
  const [presets, setPresets] = useState<ServicePreset[]>([]);
  const [definitions, setDefinitions] = useState<ServiceDefinition[]>([]);
  const [queue, setQueue] = useState<ServiceQueueItem[]>([]);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPresetName, setSelectedPresetName] = useState<string>();

  const [missingRequirements, setMissingRequirements] = useState<Record<string, string[]> | null>(null);
  const [showMissingDialog, setShowMissingDialog] = useState(false);
  
  // Business mode dialog state
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');

  // Load initial data and check for running service
  const loadData = useCallback(async () => {
    try {
      const [presetsData, defsData, stateData] = await Promise.all([
        invoke<ServicePreset[]>('get_service_presets'),
        invoke<ServiceDefinition[]>('get_service_definitions'),
        invoke<ServiceRunState>('get_service_run_state'),
      ]);

      setPresets(presetsData);
      setDefinitions(defsData);

      // Restore state if service was running
      if (stateData.isRunning && stateData.currentReport) {
        setReport(stateData.currentReport);
        setQueue(stateData.currentReport.queue);
        setPhase('running');
      } else if (stateData.currentReport && stateData.currentReport.status !== 'running') {
        setReport(stateData.currentReport);
        setQueue(stateData.currentReport.queue);
        setPhase('results');
      }
    } catch (error) {
      console.error('Failed to load service data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for service events
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    const setupListeners = async () => {
      // Log events - deduplicate consecutive identical logs
      const unsubLog = await listen<{ serviceId: string; log: string }>('service-log', (event) => {
        setLogs((prev) => {
          // Avoid duplicate consecutive logs (can happen with StrictMode)
          if (prev.length > 0 && prev[prev.length - 1] === event.payload.log) {
            return prev;
          }
          return [...prev, event.payload.log];
        });
      });
      unsubscribers.push(unsubLog);

      // Progress events
      const unsubProgress = await listen<{ currentIndex: number; totalCount: number }>(
        'service-progress',
        (event) => {
          setReport((prev) =>
            prev ? { ...prev, currentServiceIndex: event.payload.currentIndex } : null
          );
        }
      );
      unsubscribers.push(unsubProgress);

      // Completion event
      const unsubComplete = await listen<ServiceReport>('service-completed', (event) => {
        setReport(event.payload);
        setPhase('results');
      });
      unsubscribers.push(unsubComplete);

      // State change events
      const unsubState = await listen<ServiceRunState>('service-state-changed', (event) => {
        if (!event.payload.isRunning && event.payload.currentReport) {
          setReport(event.payload.currentReport);
          if (event.payload.currentReport.status !== 'running') {
            setPhase('results');
          }
        }
      });
      unsubscribers.push(unsubState);
    };

    setupListeners();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // Handlers
  const handleSelectPreset = (preset: ServicePreset) => {
    const queueItems: ServiceQueueItem[] = preset.services.map((s, index) => ({
      serviceId: s.serviceId,
      enabled: s.enabled,
      order: index,
      options: s.options as Record<string, unknown>,
    }));
    setQueue(queueItems);
    setSelectedPresetName(preset.name);
    setPhase('queue');
  };

  const handleBack = () => {
    if (phase === 'queue') {
      setPhase('presets');
    } else if (phase === 'running') {
      // Don't go back during running - user might lose progress
      // Could show a confirmation dialog here
    } else if (phase === 'results') {
      setPhase('presets');
    }
  };

  const handleStart = async () => {
    // Validate external program requirements before starting
    try {
      const enabledServiceIds = queue.filter((q) => q.enabled).map((q) => q.serviceId);
      if (enabledServiceIds.length > 0) {
        const missing = await invoke<Record<string, string[]>>('validate_service_requirements', {
          serviceIds: enabledServiceIds,
        });

        if (Object.keys(missing).length > 0) {
          setMissingRequirements(missing);
          setShowMissingDialog(true);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to validate service requirements:', e);
      // Fall through and allow the run attempt; backend may still error.
    }

    // If business mode is enabled, show dialog first
    if (settings.business?.enabled) {
      setShowStartDialog(true);
      return;
    }
    // Otherwise start directly
    await startServiceRun();
  };

  const startServiceRun = async (technicianName?: string, custName?: string) => {
    try {
      setShowStartDialog(false);
      setLogs([]);
      setPhase('running');

      // Safety check: validate requirements again right before starting
      const enabledServiceIds = queue.filter((q) => q.enabled).map((q) => q.serviceId);
      if (enabledServiceIds.length > 0) {
        const missing = await invoke<Record<string, string[]>>('validate_service_requirements', {
          serviceIds: enabledServiceIds,
        });
        if (Object.keys(missing).length > 0) {
          setMissingRequirements(missing);
          setShowMissingDialog(true);
          setPhase('queue');
          return;
        }
      }

      const result = await invoke<ServiceReport>('run_services', { 
        queue,
        technicianName: technicianName || null,
        customerName: custName || null,
      });
      setReport(result);
      setPhase('results');
    } catch (error) {
      console.error('Service run failed:', error);
      setPhase('queue');
    }
  };

  const handleStartWithBusinessInfo = async () => {
    await startServiceRun(selectedTechnician || undefined, customerName || undefined);
    // Reset dialog state
    setSelectedTechnician('');
    setCustomerName('');
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_service_run');
      setPhase('queue');
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
  };

  const handleNewService = () => {
    setQueue([]);
    setReport(null);
    setLogs([]);
    setSelectedPresetName(undefined);
    setPhase('presets');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-muted-foreground">Loading services...</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden min-h-0 flex flex-col">
      {phase === 'presets' && (
        <PresetsView presets={presets} onSelectPreset={handleSelectPreset} />
      )}
      {phase === 'queue' && (
        <QueueView
          queue={queue}
          definitions={definitions}
          presetName={selectedPresetName}
          onBack={handleBack}
          onStart={handleStart}
          onQueueChange={setQueue}
        />
      )}
      {phase === 'running' && (
        <RunnerView
          report={report}
          definitions={definitions}
          logs={logs}
          onCancel={handleCancel}
          onBack={handleBack}
        />
      )}
      {phase === 'results' && report && (
        <ResultsView
          report={report}
          definitions={definitions}
          onNewService={handleNewService}
          onBack={handleBack}
        />
      )}

      {/* Missing Requirements Dialog */}
      <Dialog open={showMissingDialog} onOpenChange={setShowMissingDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Missing Required Programs</DialogTitle>
            <DialogDescription>
              One or more enabled services require external programs that are not configured yet.
              Configure them in Settings → Programs, then try again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {missingRequirements &&
              Object.entries(missingRequirements).map(([serviceId, missing]) => {
                const def = definitions.find((d) => d.id === serviceId);
                return (
                  <div key={serviceId} className="rounded-lg border bg-muted/20 p-3">
                    <div className="font-medium">{def?.name ?? serviceId}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Missing: <span className="font-mono">{missing.join(', ')}</span>
                    </div>
                  </div>
                );
              })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMissingDialog(false);
                // Navigate to Settings tab, then to Programs category
                window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'settings' }));
                window.dispatchEvent(new CustomEvent('navigate-settings-category', { detail: 'programs' }));
              }}
            >
              Go to Settings
            </Button>
            <Button onClick={() => setShowMissingDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business Mode Start Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start Service</DialogTitle>
            <DialogDescription>
              Enter service details for the customer report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="technician">Technician</Label>
              <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                <SelectTrigger>
                  <SelectValue placeholder="Select technician..." />
                </SelectTrigger>
                <SelectContent>
                  {settings.business?.technicians?.map((tech) => (
                    <SelectItem key={tech} value={tech}>
                      {tech}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer Name</Label>
              <Input
                id="customer-name"
                placeholder="Enter customer name..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartWithBusinessInfo}>
              Start Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
