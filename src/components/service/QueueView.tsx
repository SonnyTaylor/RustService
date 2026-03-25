/**
 * Queue View Component
 *
 * Service queue builder with drag-and-drop reordering, search/filter,
 * parallel mode toggle, add/remove/duplicate services, and save preset.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Play,
  ArrowLeft,
  Loader2,
  Clock,
  ChevronRight,
  Search,
  Plus,
  AlertCircle,
  FlaskConical,
  Save,
  ChevronDown,
  Undo2,
} from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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

import type {
  ServicePreset,
  ServiceDefinition,
  ServiceQueueItem,
} from '@/types/service';
import { SortableQueueItem } from './SortableQueueItem';
import { getIcon } from './utils';
import { useAnimation } from '@/components/animation-context';

// =============================================================================
// Types
// =============================================================================

export interface QueueViewProps {
  queue: ServiceQueueItem[];
  definitions: ServiceDefinition[];
  presetName?: string;
  runError?: string | null;
  onBack: () => void;
  onStart: (parallel: boolean) => void;
  onQueueChange: (queue: ServiceQueueItem[]) => void;
  onPresetSaved?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function QueueView({ queue, definitions, presetName, runError, onBack, onStart, onQueueChange, onPresetSaved }: QueueViewProps) {
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

  // Clear the undo timeout on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      if (recentlyRemoved?.timeoutId) {
        clearTimeout(recentlyRemoved.timeoutId);
      }
    };
  }, [recentlyRemoved]);

  // Save preset state
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetDescription, setSavePresetDescription] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  const { animationsEnabled } = useAnimation();
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

  // Dependency info map — shows dependency names and violation status per queue item
  const dependencyMap = new Map<string, { names: string[]; violation: boolean }>();
  {
    const enabledItems = queue.filter(q => q.enabled);
    const enabledServiceIds = enabledItems.map(q => q.serviceId);
    for (let i = 0; i < enabledItems.length; i++) {
      const def = definitionMap.get(enabledItems[i].serviceId);
      if (!def || def.dependencies.length === 0) continue;
      // Only show deps that are in the queue
      const relevantDeps = def.dependencies.filter(d => enabledServiceIds.includes(d));
      if (relevantDeps.length === 0) continue;
      const depNames = relevantDeps.map(d => definitionMap.get(d)?.name ?? d);
      // Check if any dependency comes AFTER this service in the queue
      const violation = relevantDeps.some(depId => {
        const depIdx = enabledItems.findIndex(q => q.serviceId === depId);
        return depIdx > i;
      });
      dependencyMap.set(enabledItems[i].id, { names: depNames, violation });
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

  const formatTotalTime = (secs: number) => {
    if (secs < 60) return `~${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center gap-3 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-bold truncate">Service Queue</h2>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{enabledCount} services</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTotalTime(totalDuration)}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-2 border-b flex items-center gap-2 flex-shrink-0 bg-muted/20">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter services..."
            className="pl-8 h-8 text-sm bg-background/50 border-muted"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2">
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
        <Button onClick={() => setIsAddDialogOpen(true)} size="sm" className="gap-1.5 h-8">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Queue List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={enabledQueue.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {/* Enabled Services */}
                {enabledQueue.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                      Enabled Services ({enabledQueue.length})
                    </h3>
                    <div className="space-y-1.5">
                      <AnimatePresence initial={false}>
                        {enabledQueue.map((item) => {
                          const def = definitionMap.get(item.serviceId);
                          if (!def) return null;
                          return animationsEnabled ? (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                            >
                              <SortableQueueItem
                                item={item}
                                definition={def}
                                onToggle={handleToggle}
                                onOptionsChange={handleOptionsChange}
                                onDuplicate={handleDuplicate}
                                onRemove={handleRemove}
                                conflictWith={conflictMap.get(item.id)}
                                dependencyNames={dependencyMap.get(item.id)?.names}
                                dependencyViolation={dependencyMap.get(item.id)?.violation}
                              />
                            </motion.div>
                          ) : (
                            <SortableQueueItem
                              key={item.id}
                              item={item}
                              definition={def}
                              onToggle={handleToggle}
                              onOptionsChange={handleOptionsChange}
                              onDuplicate={handleDuplicate}
                              onRemove={handleRemove}
                              conflictWith={conflictMap.get(item.id)}
                              dependencyNames={dependencyMap.get(item.id)?.names}
                              dependencyViolation={dependencyMap.get(item.id)?.violation}
                            />
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                )}

                {/* Disabled Services (Collapsible) */}
                {disabledQueue.length > 0 && (
                  <Collapsible open={disabledOpen} onOpenChange={setDisabledOpen}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-2 w-full px-1 py-1.5 hover:bg-muted/50 rounded-md transition-colors">
                        <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${disabledOpen ? 'rotate-90' : ''}`} />
                        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Disabled Services ({disabledQueue.length})
                        </h3>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-1.5 mt-1.5">
                        <AnimatePresence initial={false}>
                          {disabledQueue.map((item) => {
                            const def = definitionMap.get(item.serviceId);
                            if (!def) return null;
                            return animationsEnabled ? (
                              <motion.div
                                key={item.id}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                              >
                                <SortableQueueItem
                                  item={item}
                                  definition={def}
                                  onToggle={handleToggle}
                                  onOptionsChange={handleOptionsChange}
                                  onDuplicate={handleDuplicate}
                                  onRemove={handleRemove}
                                />
                              </motion.div>
                            ) : (
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
                        </AnimatePresence>
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
        </div>
      </ScrollArea>

      {/* Undo Bar */}
      {recentlyRemoved && (() => {
        const def = definitionMap.get(recentlyRemoved.item.serviceId);
        return (
          <div className="mx-3 mb-2 flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-muted/50 text-sm animate-in slide-in-from-bottom-2">
            <span className="text-muted-foreground text-xs">
              Removed <strong className="text-foreground">{def?.name ?? 'service'}</strong>
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-xs" onClick={handleUndo}>
              <Undo2 className="h-3 w-3" />
              Undo
            </Button>
          </div>
        );
      })()}

      {/* Run Error Alert */}
      {runError && (
        <Alert variant="destructive" className="mx-3 mb-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      {/* Footer */}
      <div className="px-3 py-2.5 border-t bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5 h-9">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSavePresetDialog(true)}
            disabled={enabledCount === 0}
            className="gap-1.5 h-9"
          >
            <Save className="h-3.5 w-3.5" />
            Save Preset
          </Button>

          {/* Parallel Mode Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 px-2.5 h-9 rounded-md border bg-background">
                  <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="parallel-toggle" className="text-xs font-medium cursor-pointer select-none">
                    Parallel
                  </Label>
                  <Switch
                    id="parallel-toggle"
                    checked={parallelMode}
                    onCheckedChange={setParallelMode}
                    className="scale-75"
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
                    className="w-full gap-2 h-9 text-sm font-semibold"
                  >
                    <Play className="h-4 w-4" />
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
                      <div className="space-y-1.5">
                        {services.map((def) => {
                          const Icon = getIcon(def.icon);
                          return (
                            <div
                              key={def.id}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => handleAddNewService(def.id)}
                            >
                              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm">{def.name}</h4>
                                <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                              </div>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock className="h-3 w-3" />
                                ~{def.estimatedDurationSecs}s
                              </span>
                              <Button size="sm" variant="ghost" className="shrink-0 h-7 px-2 text-xs">
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
