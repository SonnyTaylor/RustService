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
  HardDrive,
  Gauge,
  BatteryFull,
  ShieldAlert,
  Sparkles,
  MonitorCheck,
  Activity,
  Download,
  Network,
  Trash2,
  Usb,
  Weight,
  PackageCheck,
  FileSearch,
  CloudDownload,
  Zap,
  BatteryCharging,
  PackageSearch,
  Globe,
  Copy,
  Search,
  Plus,
  Square,
  CheckCircle2,
  Timer,
  AlertCircle,
  FlaskConical,
  Save,
  ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  'hard-drive': HardDrive,
  gauge: Gauge,
  'battery-full': BatteryFull,
  'shield-alert': ShieldAlert,
  sparkles: Sparkles,
  'monitor-check': MonitorCheck,
  activity: Activity,
  download: Download,
  network: Network,
  'trash-2': Trash2,
  usb: Usb,
  weight: Weight,
  'package-check': PackageCheck,
  'file-scan': FileSearch,
  'cloud-download': CloudDownload,
  zap: Zap,
  'battery-charging': BatteryCharging,
  'package-search': PackageSearch,
  globe: Globe,
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
  onToggle: (itemId: string) => void;
  onOptionsChange: (itemId: string, options: Record<string, unknown>) => void;
  onDuplicate: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  conflictWith?: string[];
}

function SortableQueueItem({
  item,
  definition,
  onToggle,
  onOptionsChange,
  onDuplicate,
  onRemove,
  conflictWith,
}: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const [estimatedMs, setEstimatedMs] = useState<number | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  // Fetch estimated time when options change
  useEffect(() => {
    let active = true;
    setEstimateLoading(true);
    const fetchEstimate = async () => {
      try {
        const ms = await invoke<number>('get_estimated_time', {
          serviceId: item.serviceId,
          options: item.options,
          defaultSecs: definition.estimatedDurationSecs,
        });
        if (active) {
          setEstimatedMs(ms);
          setEstimateLoading(false);
        }
      } catch (err) {
        console.error('Failed to estimate time:', err);
        if (active) setEstimateLoading(false);
      }
    };

    const timer = setTimeout(fetchEstimate, 500); // Debounce
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [item.serviceId, item.options, definition.estimatedDurationSecs]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const Icon = getIcon(definition.icon);

  // Helper to format time
  const formatTime = (ms: number | undefined) => {
    if (ms === undefined) return `~${definition.estimatedDurationSecs}s`;
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${(secs / 60).toFixed(1)}m`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col gap-2 p-3 rounded-xl border-2 bg-card/50 backdrop-blur-sm transition-all duration-200 ${
        item.enabled
          ? 'border-border hover:border-primary/30 hover:bg-card/80 hover:shadow-lg'
          : 'border-muted/50 opacity-50'
      } ${isDragging ? 'shadow-2xl ring-2 ring-primary/50' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        {item.enabled ? (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-muted/80 transition-colors touch-none group-hover:bg-muted/50"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : (
          <div className="p-1.5 w-7" />
        )}

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
          <div className="flex items-center gap-2">
            <h4 className="font-semibold truncate">{definition.name}</h4>
             {/* Accuracy/Time Indicator */}
            <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                estimateLoading
                  ? 'bg-muted text-muted-foreground'
                  : estimatedMs
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {estimateLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              <span>{estimateLoading ? '...' : formatTime(estimatedMs ?? undefined)}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground truncate">{definition.description}</p>
          {conflictWith && conflictWith.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">Resource conflict with: {conflictWith.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
           <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={() => onDuplicate(item.id)}
            title="Duplicate service"
          >
            <Copy className="h-4 w-4" />
          </Button>
          
          <Switch checked={item.enabled} onCheckedChange={() => onToggle(item.id)} />
          
           <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(item.id)}
            title="Remove service"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Options */}
      {item.enabled && definition.options.length > 0 && (
        <div className="ml-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-muted/30 rounded-lg p-3">
          {definition.options.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2">
              {opt.optionType === 'boolean' ? (
                 <div className="flex items-center gap-2">
                    <Switch
                        id={`${item.id}-${opt.id}`}
                        checked={(item.options[opt.id] as boolean) ?? opt.defaultValue}
                        onCheckedChange={(checked) => 
                            onOptionsChange(item.id, {
                                ...item.options,
                                [opt.id]: checked
                            })
                        }
                        className="scale-75 origin-left"
                    />
                     <Label
                        htmlFor={`${item.id}-${opt.id}`}
                        className="text-xs text-muted-foreground whitespace-nowrap cursor-pointer"
                      >
                        {opt.label}
                      </Label>
                 </div>
              ) : opt.optionType === 'select' && opt.options ? (
                 <div className="flex items-center gap-2">
                    <Label
                        htmlFor={`${item.id}-${opt.id}`}
                        className="text-xs text-muted-foreground whitespace-nowrap"
                      >
                        {opt.label}:
                      </Label>
                    <Select
                      value={(item.options[opt.id] as string) ?? opt.defaultValue}
                      onValueChange={(val) =>
                        onOptionsChange(item.id, {
                          ...item.options,
                          [opt.id]: val,
                        })
                      }
                    >
                      <SelectTrigger id={`${item.id}-${opt.id}`} className="h-7 min-w-[120px] max-w-[180px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {opt.options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                 </div>
              ) : (
                <>
                  <Label
                    htmlFor={`${item.id}-${opt.id}`}
                    className="text-xs text-muted-foreground whitespace-nowrap"
                  >
                    {opt.label}:
                  </Label>
                  {opt.optionType === 'number' && (
                    <Input
                      id={`${item.id}-${opt.id}`}
                      type="number"
                      min={opt.min}
                      max={opt.max}
                      value={(item.options[opt.id] as number) ?? opt.defaultValue}
                      onChange={(e) =>
                        onOptionsChange(item.id, {
                          ...item.options,
                          [opt.id]: parseFloat(e.target.value) || opt.defaultValue,
                        })
                      }
                      className="h-7 w-20 text-xs"
                    />
                  )}
                  {opt.optionType === 'string' && (
                    <Input
                      id={`${item.id}-${opt.id}`}
                      type="text"
                      value={(item.options[opt.id] as string) ?? opt.defaultValue}
                      onChange={(e) =>
                        onOptionsChange(item.id, {
                          ...item.options,
                          [opt.id]: e.target.value,
                        })
                      }
                      className="h-7 w-full min-w-[100px] text-xs"
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Presets View
// =============================================================================

interface PresetsViewProps {
  presets: ServicePreset[];
  definitions: ServiceDefinition[];
  onSelectPreset: (preset: ServicePreset) => void;
}

// Preset gradient colors for visual distinction
const PRESET_GRADIENTS: Record<string, { from: string; to: string; accent: string; bullet: string }> = {
  diagnostics: { from: 'from-blue-500/20', to: 'to-cyan-500/10', accent: 'text-blue-500', bullet: 'bg-blue-500' },
  general: { from: 'from-emerald-500/20', to: 'to-green-500/10', accent: 'text-emerald-500', bullet: 'bg-emerald-500' },
  complete: { from: 'from-violet-500/20', to: 'to-purple-500/10', accent: 'text-violet-500', bullet: 'bg-violet-500' },
  custom: { from: 'from-amber-500/20', to: 'to-orange-500/10', accent: 'text-amber-500', bullet: 'bg-amber-500' },
};

function PresetsView({ presets, definitions, onSelectPreset }: PresetsViewProps) {
  const defMap = new Map(definitions.map((d) => [d.id, d]));

  // Fallback descriptions for built-in presets
  const presetDescriptions: Record<string, string> = {
    diagnostics: 'Quick system health check',
    general: 'Standard maintenance service',
    complete: 'Full system maintenance & repair',
    custom: 'Build your own service queue',
  };

  // Fallback task lists for presets with no services array (e.g., custom)
  const customFallbackTasks = [
    'Pick and choose from all services',
    'Configure options per service',
    'Reorder execution queue',
    'Save as custom preset',
  ];

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
              const gradient = PRESET_GRADIENTS[preset.id] || PRESET_GRADIENTS.custom;
              const description = presetDescriptions[preset.id] || preset.description;
              const enabledServices = preset.services.filter(s => s.enabled);
              const hasServices = preset.services.length > 0;
              const taskItems = hasServices
                ? preset.services.slice(0, 6).map(svc => ({
                    name: defMap.get(svc.serviceId)?.name ?? svc.serviceId,
                    enabled: svc.enabled,
                  }))
                : customFallbackTasks.slice(0, 6).map(t => ({ name: t, enabled: true }));
              const totalTasks = hasServices ? preset.services.length : customFallbackTasks.length;
              const badge = hasServices
                ? `${enabledServices.length} task${enabledServices.length !== 1 ? 's' : ''}`
                : 'Flexible';

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
                            {description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 mt-1" />
                    </div>

                    {/* Badge */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-background/60 backdrop-blur-sm ${gradient.accent}`}>
                        {badge}
                      </span>
                    </div>
                  </div>

                  {/* Task List */}
                  <div className="px-5 py-4 flex-1">
                    <ul className="space-y-2">
                      {taskItems.map((task, idx) => (
                        <li key={idx} className={`text-sm text-muted-foreground flex items-start gap-2 group-hover:text-foreground/80 transition-colors ${!task.enabled ? 'opacity-50' : ''}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${gradient.bullet} ${!task.enabled ? 'opacity-30' : ''}`} />
                          <span className={`leading-tight ${!task.enabled ? 'line-through' : ''}`}>{task.name}</span>
                        </li>
                      ))}
                      {totalTasks > 6 && (
                        <li className="text-xs text-muted-foreground italic pl-3.5">
                          +{totalTasks - 6} more...
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
  runError?: string | null;
  onBack: () => void;
  onStart: (parallel: boolean) => void;
  onQueueChange: (queue: ServiceQueueItem[]) => void;
  onPresetSaved?: () => void;
}

function QueueView({ queue, definitions, presetName, runError, onBack, onStart, onQueueChange, onPresetSaved }: QueueViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // State for search and filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [parallelMode, setParallelMode] = useState(false);
  const [disabledOpen, setDisabledOpen] = useState(true);

  // Undo state for remove
  const [recentlyRemoved, setRecentlyRemoved] = useState<{
    item: ServiceQueueItem;
    previousQueue: ServiceQueueItem[];
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Save preset state
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetDescription, setSavePresetDescription] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  const definitionMap = new Map(definitions.map((d) => [d.id, d]));

  // Filter queue based on search query
  const filteredQueue = queue.filter((item) => {
    if (!searchQuery) return true;
    const def = definitionMap.get(item.serviceId);
    return def?.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const enabledQueue = filteredQueue.filter(q => q.enabled);
  const disabledQueue = filteredQueue.filter(q => !q.enabled);

  // Resource conflict map (only computed in parallel mode)
  const conflictMap = new Map<string, string[]>();
  if (parallelMode) {
    const enabledItems = queue.filter(q => q.enabled);
    for (let i = 0; i < enabledItems.length; i++) {
      const defA = definitionMap.get(enabledItems[i].serviceId);
      if (!defA || defA.exclusiveResources.length === 0) continue;
      const conflicts: string[] = [];
      for (let j = 0; j < enabledItems.length; j++) {
        if (i === j) continue;
        const defB = definitionMap.get(enabledItems[j].serviceId);
        if (!defB) continue;
        const shared = defA.exclusiveResources.filter(r => defB.exclusiveResources.includes(r));
        if (shared.length > 0) conflicts.push(defB.name);
      }
      if (conflicts.length > 0) conflictMap.set(enabledItems[i].id, conflicts);
    }
  }

  // Filter available services for "Add Service" dialog, grouped by category
  const availableServices = definitions.filter((def) => {
      if (!addSearchQuery) return true;
      return def.name.toLowerCase().includes(addSearchQuery.toLowerCase()) ||
             def.description.toLowerCase().includes(addSearchQuery.toLowerCase());
  });

  const groupedServices = availableServices.reduce<Record<string, ServiceDefinition[]>>((acc, def) => {
    const cat = def.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(def);
    return acc;
  }, {});

  const handleAddNewService = (serviceId: string) => {
    const def = definitionMap.get(serviceId);
    if (!def) return;

    const newService: ServiceQueueItem = {
        id: crypto.randomUUID(),
        serviceId: serviceId,
        enabled: true,
        order: queue.length,
        options: def.options.reduce((acc, opt) => {
            acc[opt.id] = opt.defaultValue;
            return acc;
        }, {} as Record<string, unknown>),
    };

    onQueueChange([...queue, newService]);
    setIsAddDialogOpen(false);
    setAddSearchQuery('');
    setSearchQuery(''); // Show the new item in queue
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = queue.findIndex((q) => q.id === active.id);
      const newIndex = queue.findIndex((q) => q.id === over.id);

      // Guard: bail if either item not found
      if (oldIndex === -1 || newIndex === -1) return;

      const newQueue = arrayMove(queue, oldIndex, newIndex).map((item, index) => ({
        ...item,
        order: index,
      }));
      onQueueChange(newQueue);
    }
  };

  const handleToggle = (itemId: string) => {
    onQueueChange(
      queue.map((item) =>
        item.id === itemId ? { ...item, enabled: !item.enabled } : item
      )
    );
  };

  const handleOptionsChange = (itemId: string, options: Record<string, unknown>) => {
    onQueueChange(
      queue.map((item) =>
        item.id === itemId ? { ...item, options } : item
      )
    );
  };

  const handleDuplicate = (itemId: string) => {
    const index = queue.findIndex((q) => q.id === itemId);
    if (index === -1) return;
    
    const itemToClone = queue[index];
    const newItem: ServiceQueueItem = {
      ...itemToClone,
      id: crypto.randomUUID(),
      order: index + 1,
    };
    
    // Insert after the original
    const newQueue = [
      ...queue.slice(0, index + 1),
      newItem,
      ...queue.slice(index + 1)
    ].map((item, idx) => ({ ...item, order: idx }));
    
    onQueueChange(newQueue);
  };

  const handleRemove = (itemId: string) => {
    // Clear any pending undo
    if (recentlyRemoved) {
      clearTimeout(recentlyRemoved.timeoutId);
      setRecentlyRemoved(null);
    }

    const previousQueue = [...queue];
    const removedItem = queue.find(q => q.id === itemId);
    const newQueue = queue.filter(q => q.id !== itemId).map((item, idx) => ({ ...item, order: idx }));
    onQueueChange(newQueue);

    if (removedItem) {
      const timeoutId = setTimeout(() => {
        setRecentlyRemoved(null);
      }, 5000);
      setRecentlyRemoved({ item: removedItem, previousQueue, timeoutId });
    }
  };

  const handleUndo = () => {
    if (recentlyRemoved) {
      clearTimeout(recentlyRemoved.timeoutId);
      onQueueChange(recentlyRemoved.previousQueue);
      setRecentlyRemoved(null);
    }
  };

  const handleSavePreset = async () => {
    if (!savePresetName.trim() || savingPreset) return;
    setSavingPreset(true);
    try {
      const preset: ServicePreset = {
        id: `custom-${crypto.randomUUID().slice(0, 8)}`,
        name: savePresetName.trim(),
        description: savePresetDescription.trim() || `Custom preset with ${enabledCount} services`,
        services: queue.filter(q => q.enabled).map(q => ({
          serviceId: q.serviceId,
          enabled: true,
          options: q.options,
        })),
        icon: 'settings-2',
        color: 'amber',
      };
      await invoke('save_service_preset', { preset });
      setShowSavePresetDialog(false);
      setSavePresetName('');
      setSavePresetDescription('');
      if (onPresetSaved) onPresetSaved();
    } catch (err) {
      console.error('Failed to save preset:', err);
    } finally {
      setSavingPreset(false);
    }
  };

  const enabledCount = queue.filter((q) => q.enabled).length;
  const totalDuration = queue
    .filter((q) => q.enabled)
    .reduce((acc, q) => acc + (definitionMap.get(q.serviceId)?.estimatedDurationSecs || 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      {/* Compact Header */}
      <div className="p-4 border-b bg-background/95 backdrop-blur z-10">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          
          <h2 className="text-lg font-bold truncate">Service Queue</h2>
          
          <div className="flex-1" />
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
             <span className="font-medium text-foreground">{enabledCount} services</span>
             <span>~{totalDuration}s</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                    placeholder="Filter services..." 
                    className="pl-8 h-9 text-sm bg-muted/50 border-0" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onQueueChange(queue.map(q => ({ ...q, enabled: true })))}>
                  Enable All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onQueueChange(queue.map(q => ({ ...q, enabled: false })))}>
                  Disable All
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onQueueChange([])}
                >
                  Clear Queue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setIsAddDialogOpen(true)} size="sm" className="gap-2 h-9 px-4">
                <Plus className="h-3.5 w-3.5" />
                Add
            </Button>
        </div>
      </div>

      {/* Queue Summary */}
      {enabledCount > 0 && (
        <div className="mx-4 mt-3 p-3 rounded-lg border bg-muted/20 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-primary">{enabledCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Services</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {totalDuration < 60 ? `${totalDuration}s` : `${(totalDuration / 60).toFixed(1)}m`}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Time</div>
          </div>
          <div>
            <div className="text-lg font-bold">
              {new Set(queue.filter(q => q.enabled).map(q => definitionMap.get(q.serviceId)?.category).filter(Boolean)).size}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Categories</div>
          </div>
        </div>
      )}

      {/* Queue List */}
      <ScrollArea className="flex-1 min-h-0 px-4 py-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={enabledQueue.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6 pb-4">
              {/* Enabled Services */}
              <div>
                  {enabledQueue.length > 0 && (
                     <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                         Enabled Services
                     </h3>
                  )}
                  <div className="space-y-3">
                    {enabledQueue.map((item) => {
                        const def = definitionMap.get(item.serviceId);
                        if (!def) return null;
                        return (
                        <SortableQueueItem
                            key={item.id}
                            item={item}
                            definition={def}
                            onToggle={handleToggle}
                            onOptionsChange={handleOptionsChange}
                            onDuplicate={handleDuplicate}
                            onRemove={handleRemove}
                            conflictWith={conflictMap.get(item.id)}
                        />
                        );
                    })}
                  </div>
              </div>

              {/* Disabled Services (Collapsible) */}
              {disabledQueue.length > 0 && (
                  <Collapsible open={disabledOpen} onOpenChange={setDisabledOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 w-full px-1 py-1 hover:bg-muted/50 rounded-md transition-colors">
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${disabledOpen ? 'rotate-90' : ''}`} />
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Disabled Services ({disabledQueue.length})
                        </h3>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3 opacity-60 mt-2">
                        {disabledQueue.map((item) => {
                            const def = definitionMap.get(item.serviceId);
                            if (!def) return null;
                            return (
                            <SortableQueueItem
                                key={item.id}
                                item={item}
                                definition={def}
                                onToggle={handleToggle}
                                onOptionsChange={handleOptionsChange}
                                onDuplicate={handleDuplicate}
                                onRemove={handleRemove}
                            />
                            );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
              )}
              
              {filteredQueue.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                      <p>No services match your filter.</p>
                      <Button variant="link" onClick={() => setSearchQuery('')}>Clear filter</Button>
                  </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </ScrollArea>

      {/* Undo Bar */}
      {recentlyRemoved && (() => {
        const def = definitionMap.get(recentlyRemoved.item.serviceId);
        return (
          <div className="mx-4 mb-2 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border bg-muted/50 text-sm animate-in slide-in-from-bottom-2">
            <span className="text-muted-foreground">
              Removed <strong>{def?.name ?? 'service'}</strong>
            </span>
            <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={handleUndo}>
              Undo
            </Button>
          </div>
        );
      })()}

      {/* Run Error Alert */}
      {runError && (
        <Alert variant="destructive" className="mx-4 mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      {/* Footer */}
      <div className="p-6 pt-4 border-t bg-muted/30">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSavePresetDialog(true)}
            disabled={enabledCount === 0}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save Preset
          </Button>

          {/* Parallel Mode Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-background">
                  <FlaskConical className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="parallel-toggle" className="text-sm font-medium cursor-pointer select-none">
                    Parallel
                  </Label>
                  <Switch
                    id="parallel-toggle"
                    checked={parallelMode}
                    onCheckedChange={setParallelMode}
                    className="scale-90"
                  />
                  {parallelMode && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400">
                      Experimental
                    </Badge>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-medium">Parallel Execution (Experimental)</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Run non-conflicting services simultaneously. Services that share resources
                  (e.g., network tests, stress tests) still run sequentially to ensure accurate results.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex-1">
                  <Button
                    onClick={() => onStart(parallelMode)}
                    disabled={enabledCount === 0}
                    className="w-full gap-2 h-12 text-base font-semibold"
                    size="lg"
                  >
                    <Play className="h-5 w-5" />
                    Start Service ({enabledCount} {enabledCount === 1 ? 'task' : 'tasks'})
                  </Button>
                </span>
              </TooltipTrigger>
              {enabledCount === 0 && (
                <TooltipContent>
                  <p>Enable at least one service in the queue to start</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Add Service Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Service to Queue</DialogTitle>
            <DialogDescription>
              Choose a service to add to your current execution queue.
            </DialogDescription>
          </DialogHeader>
          
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Search available services..." 
                className="pl-9" 
                value={addSearchQuery}
                onChange={(e) => setAddSearchQuery(e.target.value)}
                autoFocus
            />
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-2">
                  {Object.entries(groupedServices).map(([category, services]) => (
                    <div key={category}>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
                        {category}
                      </h4>
                      <div className="space-y-2">
                        {services.map((def) => {
                          const Icon = getIcon(def.icon);
                          return (
                            <div
                              key={def.id}
                              className="flex items-start gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => handleAddNewService(def.id)}
                            >
                              <div className="p-2 rounded-lg bg-primary/10 text-primary mt-1">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm">{def.name}</h4>
                                <p className="text-xs text-muted-foreground line-clamp-2">{def.description}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    ~{def.estimatedDurationSecs}s
                                  </span>
                                </div>
                              </div>
                              <Button size="sm" variant="ghost" className="self-center">
                                Add
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {availableServices.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No services found</p>
                      <p className="text-sm mt-1">
                        {addSearchQuery
                          ? `No services match "${addSearchQuery}". Try a different search term.`
                          : 'No services are available.'}
                      </p>
                      {addSearchQuery && (
                        <Button variant="link" size="sm" onClick={() => setAddSearchQuery('')} className="mt-2">
                          Clear search
                        </Button>
                      )}
                    </div>
                  )}
              </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Save Preset Dialog */}
      <Dialog open={showSavePresetDialog} onOpenChange={setShowSavePresetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Preset</DialogTitle>
            <DialogDescription>
              Save the current enabled services ({enabledCount}) as a reusable preset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Name</Label>
              <Input
                id="preset-name"
                placeholder="My Custom Preset"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preset-desc">Description (optional)</Label>
              <Input
                id="preset-desc"
                placeholder="What this preset is for..."
                value={savePresetDescription}
                onChange={(e) => setSavePresetDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSavePresetDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePreset} disabled={!savePresetName.trim() || savingPreset}>
              {savingPreset && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  queue: ServiceQueueItem[];
  cancelError?: string | null;
}

/** Format milliseconds into a human-readable duration string */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function RunnerView({ report, definitions, logs, onCancel, onBack, queue, cancelError }: RunnerViewProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taskStartMs, setTaskStartMs] = useState(0);
  const [taskElapsedMs, setTaskElapsedMs] = useState(0);
  const startTimeRef = useRef(Date.now());
  const taskStartRef = useRef(Date.now());
  // Per-task elapsed timers for parallel mode (keyed by queue index)
  const [parallelTaskTimers, setParallelTaskTimers] = useState<Map<number, number>>(new Map());
  const parallelTaskStartRef = useRef<Map<number, number>>(new Map());

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

  // Calculate estimated total time (sum of estimatedDurationSecs for enabled services)
  const totalEstimatedMs = enabledServices.reduce((acc, q) => {
    const def = definitionMap.get(q.serviceId);
    return acc + (def?.estimatedDurationSecs ?? 30) * 1000;
  }, 0);

  // Calculate estimated remaining time
  // In parallel mode, use a rough heuristic: remaining sum / max(1, active count)
  const activeCount = isParallel ? Math.max(1, currentIndices.length) : 1;
  const estimatedRemainingMs = Math.max(0, (totalEstimatedMs - elapsedMs) / (isParallel ? Math.max(activeCount, 1.5) : 1));

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
      setTaskStartMs(Date.now());
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
  const completedServiceIds = new Set(report?.results?.map(r => r.serviceId) ?? []);
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
    return {
      item,
      def,
      result,
      status,
      index,
    };
  });

  // Get active services for the header display
  const activeServices = serviceStatuses.filter(s => s.status === 'running');

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
            // Sequential mode: show single active task card
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

                  {/* Latest log line */}
                  {logs.length > 0 && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-background/80 rounded-lg border text-xs font-mono text-muted-foreground">
                      <span className="text-primary/60 shrink-0">❯</span>
                      <span className="truncate">{logs[logs.length - 1]}</span>
                    </div>
                  )}
                </div>
              </Card>
            )
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
              const taskElapsed = isParallel ? (parallelTaskTimers.get(index) ?? 0) : taskElapsedMs;

              return (
                <div
                  key={item.serviceId + '-' + index}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary/10 border border-primary/20'
                      : status === 'completed'
                      ? 'bg-muted/30'
                      : status === 'failed'
                      ? 'bg-destructive/5'
                      : 'bg-transparent opacity-50'
                  }`}
                >
                  {/* Status Indicator */}
                  <div className="shrink-0">
                    {status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : status === 'failed' ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>

                  {/* Service Icon */}
                  <div className={`p-1.5 rounded-lg ${
                    isActive ? 'bg-primary/20 text-primary' :
                    status === 'completed' ? 'bg-green-500/10 text-green-500' :
                    status === 'failed' ? 'bg-destructive/10 text-destructive' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${
                      status === 'pending' ? 'text-muted-foreground' : ''
                    }`}>
                      {def.name}
                    </span>
                  </div>

                  {/* Duration / Status */}
                  <div className="text-xs text-muted-foreground text-right shrink-0">
                    {status === 'completed' && result ? (
                      <span className="text-green-600 dark:text-green-500">
                        {formatDuration(result.durationMs)}
                      </span>
                    ) : status === 'failed' && result ? (
                      <span className="text-destructive">Failed</span>
                    ) : status === 'running' ? (
                      <span className="text-primary">{formatDuration(taskElapsed)}</span>
                    ) : (
                      <span>~{def.estimatedDurationSecs}s</span>
                    )}
                  </div>
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
                    <span className="text-primary/60 select-none shrink-0">❯</span>
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

  // Error states
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Business mode dialog state
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');

  // Load initial data and check for running service
  const loadData = useCallback(async () => {
    try {
      const [presetsResult, defsResult, stateResult] = await Promise.allSettled([
        invoke<ServicePreset[]>('get_service_presets'),
        invoke<ServiceDefinition[]>('get_service_definitions'),
        invoke<ServiceRunState>('get_service_run_state'),
      ]);

      const errors: string[] = [];

      if (presetsResult.status === 'fulfilled') {
        setPresets(presetsResult.value);
      } else {
        errors.push('Failed to load presets');
        console.error('Presets load error:', presetsResult.reason);
      }

      if (defsResult.status === 'fulfilled') {
        setDefinitions(defsResult.value);
      } else {
        errors.push('Failed to load service definitions');
        console.error('Definitions load error:', defsResult.reason);
      }

      if (stateResult.status === 'fulfilled') {
        const stateData = stateResult.value;
        // Restore state if service was running
        if (stateData.isRunning && stateData.currentReport) {
          setReport(stateData.currentReport);
          setQueue(stateData.currentReport.queue.map((q, i) => ({ ...q, id: q.id || `${q.serviceId}-${i}` })));
          setPhase('running');
        } else if (stateData.currentReport && stateData.currentReport.status !== 'running') {
          setReport(stateData.currentReport);
          setQueue(stateData.currentReport.queue.map((q, i) => ({ ...q, id: q.id || `${q.serviceId}-${i}` })));
          setPhase('results');
        }
      } else {
        errors.push('Failed to load service state');
        console.error('State load error:', stateResult.reason);
      }

      if (errors.length > 0) {
        setLoadError(errors.join('. '));
      }
    } catch (error) {
      console.error('Failed to load service data:', error);
      setLoadError('Failed to load service data. Try reloading.');
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
          setReport((prev) => {
            if (prev) {
              return { ...prev, currentServiceIndex: event.payload.currentIndex };
            }
            return prev;
          });
        }
      );
      unsubscribers.push(unsubProgress);

      // Completion event
      const unsubComplete = await listen<ServiceReport>('service-completed', (event) => {
        setReport(event.payload);
        setPhase('results');
      });
      unsubscribers.push(unsubComplete);

      // State change events — update the report during AND after running
      const unsubState = await listen<ServiceRunState>('service-state-changed', (event) => {
        if (event.payload.currentReport) {
          setReport(event.payload.currentReport);
        }
        if (!event.payload.isRunning && event.payload.currentReport) {
          if (event.payload.currentReport.status !== 'running') {
            setPhase('results');
          }
        }
      });
      unsubscribers.push(unsubState);
    };

    setupListeners().catch((err) => {
      console.error('Failed to set up service event listeners:', err);
      setListenerError('Service event listeners failed to initialize. Try reloading the page.');
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // Handlers
  const handleSelectPreset = (preset: ServicePreset) => {
    // 1. Create a map of preset configurations for quick lookup
    const presetConfigMap = new Map(preset.services.map(s => [s.serviceId, s]));

    // 2. Build the full queue from ALL definitions
    // We want preset items to appear at the top in their specific order, followed by the rest
    const orderedServices = [
        ...preset.services.map(s => definitions.find(d => d.id === s.serviceId)).filter((d): d is ServiceDefinition => !!d),
        ...definitions.filter(d => !presetConfigMap.has(d.id))
    ];

    const queueItems: ServiceQueueItem[] = orderedServices.map((def, index) => {
        const presetConfig = presetConfigMap.get(def.id);
        
        // If in preset, use preset config. If not, use defaults/disabled.
        if (presetConfig) {
            return {
                id: crypto.randomUUID(),
                serviceId: def.id,
                enabled: presetConfig.enabled,
                order: index,
                options: presetConfig.options as Record<string, unknown>,
            };
        } else {
             return {
                id: crypto.randomUUID(),
                serviceId: def.id,
                enabled: false,
                order: index,
                options: def.options.reduce((acc, opt) => {
                    acc[opt.id] = opt.defaultValue;
                    return acc;
                }, {} as Record<string, unknown>),
            };
        }
    });

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

  // Parallel mode state (passed from QueueView toggle)
  const [parallelMode, setParallelMode] = useState(false);

  const handleStart = async (parallel: boolean) => {
    setParallelMode(parallel);
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
    }

    // If business mode is enabled, show dialog first
    if (settings.business?.enabled) {
      setShowStartDialog(true);
      return;
    }
    // Otherwise start directly
    await startServiceRun(undefined, undefined, parallel);
  };

  const startServiceRun = async (technicianName?: string, custName?: string, parallel?: boolean) => {
    const useParallel = parallel ?? parallelMode;
    try {
      setShowStartDialog(false);
      setLogs([]);
      setRunError(null);
      setCancelError(null);
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
        parallel: useParallel,
      });
      setReport(result);
      setPhase('results');
    } catch (error) {
      console.error('Service run failed:', error);
      setRunError(`Service run failed: ${error instanceof Error ? error.message : String(error)}`);
      setPhase('queue');
    }
  };

  const handleStartWithBusinessInfo = async () => {
    await startServiceRun(selectedTechnician || undefined, customerName || undefined, parallelMode);
    // Reset dialog state
    setSelectedTechnician('');
    setCustomerName('');
  };

  const handleCancel = async () => {
    try {
      setCancelError(null);
      await invoke('cancel_service_run');
      setPhase('queue');
    } catch (error) {
      console.error('Failed to cancel:', error);
      setCancelError('Failed to cancel the service run. It may still be running.');
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
      {/* Error Banners */}
      {(listenerError || loadError) && (
        <Alert variant="destructive" className="mx-4 mt-4 shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{listenerError || loadError}</AlertDescription>
        </Alert>
      )}

      {phase === 'presets' && (
        <PresetsView presets={presets} definitions={definitions} onSelectPreset={handleSelectPreset} />
      )}
      {phase === 'queue' && (
        <QueueView
          queue={queue}
          definitions={definitions}
          presetName={selectedPresetName}
          runError={runError}
          onBack={handleBack}
          onStart={handleStart}
          onQueueChange={setQueue}
          onPresetSaved={() => invoke<ServicePreset[]>('get_service_presets').then(setPresets).catch(() => {})}
        />
      )}
      {phase === 'running' && (
        <RunnerView
          report={report}
          definitions={definitions}
          logs={logs}
          onCancel={handleCancel}
          onBack={handleBack}
          queue={queue}
          cancelError={cancelError}
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
