/**
 * Sortable Queue Item Component
 *
 * Drag-and-drop sortable service queue item with option editing,
 * toggle, duplicate, and remove actions.
 *
 * Clicking anywhere on the row toggles the service enabled/disabled.
 * Drag handle, action buttons, and option inputs are excluded from toggle.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Loader2,
  Clock,
  AlertCircle,
  Copy,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { ServiceQueueItem, ServiceDefinition } from '@/types/service';
import { getIcon } from './utils';
import { useAnimation } from '@/components/animation-context';

// =============================================================================
// Types
// =============================================================================

export interface SortableQueueItemProps {
  item: ServiceQueueItem;
  definition: ServiceDefinition;
  onToggle: (itemId: string) => void;
  onOptionsChange: (itemId: string, options: Record<string, unknown>) => void;
  onDuplicate: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  conflictWith?: string[];
}

// =============================================================================
// Component
// =============================================================================

export function SortableQueueItem({
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

  const { animationsEnabled } = useAnimation();

  const [estimatedMs, setEstimatedMs] = useState<number | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [usbDrives, setUsbDrives] = useState<Array<{ mountPoint: string; name: string; totalSpaceGb: number; availableSpaceGb: number; fileSystem: string }>>([]);
  const [usbLoading, setUsbLoading] = useState(false);

  // Fetch USB drives when a usb_drive option is present
  const hasUsbOption = definition.options.some(o => o.optionType === 'usb_drive');
  useEffect(() => {
    if (!hasUsbOption || !item.enabled) return;
    const loadDrives = async () => {
      setUsbLoading(true);
      try {
        const drives = await invoke<Array<{ mountPoint: string; name: string; totalSpaceGb: number; availableSpaceGb: number; fileSystem: string }>>('list_usb_drives');
        setUsbDrives(drives);
      } catch (err) {
        console.error('Failed to list USB drives:', err);
        setUsbDrives([]);
      } finally {
        setUsbLoading(false);
      }
    };
    loadDrives();
  }, [hasUsbOption, item.enabled]);

  const refreshUsbDrives = async () => {
    setUsbLoading(true);
    try {
      const drives = await invoke<Array<{ mountPoint: string; name: string; totalSpaceGb: number; availableSpaceGb: number; fileSystem: string }>>('list_usb_drives');
      setUsbDrives(drives);
    } catch (err) {
      console.error('Failed to refresh USB drives:', err);
    } finally {
      setUsbLoading(false);
    }
  };

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

  // Click handler for the row — toggles enabled/disabled
  const handleRowClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on interactive elements inside the row
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-toggle]') || target.closest('input') || target.closest('button') || target.closest('[role="combobox"]')) {
      return;
    }
    onToggle(item.id);
  };

  const Wrapper = animationsEnabled ? motion.div : 'div' as unknown as typeof motion.div;
  const layoutProps = animationsEnabled ? { layout: true as const, transition: { layout: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } } } : {};

  return (
    <Wrapper
      ref={setNodeRef}
      style={style}
      {...layoutProps}
      className={`group relative flex flex-col rounded-lg border transition-colors duration-150 ${
        item.enabled
          ? 'border-border bg-card/60 hover:bg-card/90'
          : 'border-muted/40 bg-muted/20 hover:bg-muted/30'
      } ${isDragging ? 'shadow-2xl ring-2 ring-primary/50 opacity-50' : ''}`}
    >
      {/* Main row — clickable to toggle */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none transition-opacity duration-150 ${
          !item.enabled ? 'opacity-50' : ''
        }`}
        onClick={handleRowClick}
      >
        {/* Drag Handle */}
        {item.enabled ? (
          <button
            {...attributes}
            {...listeners}
            data-no-toggle
            className="cursor-grab active:cursor-grabbing p-1.5 rounded hover:bg-muted/80 transition-colors touch-none shrink-0"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : (
          <div className="p-1.5 w-7 shrink-0" />
        )}

        {/* Service Icon */}
        <div
          className={`p-2 rounded-lg shrink-0 transition-colors ${
            item.enabled
              ? 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Service Info */}
        <div className="flex-1 min-w-0 px-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold truncate">{definition.name}</h4>
            <div className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${
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
          <p className="text-xs text-muted-foreground truncate">{definition.description}</p>
          {conflictWith && conflictWith.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">Resource conflict with: {conflictWith.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Actions — excluded from toggle via data-no-toggle / button */}
        <div className="flex items-center gap-0.5 shrink-0" data-no-toggle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDuplicate(item.id)}
            title="Duplicate service"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onRemove(item.id)}
            title="Remove service"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Options — animated expand/collapse */}
      <AnimatePresence initial={false}>
        {item.enabled && definition.options.length > 0 && (
          <motion.div
            initial={animationsEnabled ? { height: 0, opacity: 0 } : undefined}
            animate={animationsEnabled ? { height: 'auto', opacity: 1 } : undefined}
            exit={animationsEnabled ? { height: 0, opacity: 0 } : undefined}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div
              className="mx-3 mb-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-muted/30 rounded-md px-3 py-2 border-t border-border/50"
              data-no-toggle
            >
              {definition.options.map((opt) => (
                <div key={opt.id} className={`flex items-center gap-2 ${opt.optionType === 'usb_drive' ? 'col-span-full' : ''}`}>
                  {opt.optionType === 'usb_drive' ? (
                    <div className="flex items-center gap-2 w-full">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">
                        {opt.label}:
                      </Label>
                      {usbDrives.length > 0 ? (
                        <Select
                          value={(item.options[opt.id] as string) || ''}
                          onValueChange={(val) =>
                            onOptionsChange(item.id, {
                              ...item.options,
                              [opt.id]: val === '__auto__' ? '' : val,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 min-w-[200px] max-w-[320px] text-xs">
                            <SelectValue placeholder="Auto-detect" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__auto__">Auto-detect first USB drive</SelectItem>
                            {usbDrives.map((d) => (
                              <SelectItem key={d.mountPoint} value={d.mountPoint}>
                                {d.mountPoint} — {d.name} ({d.availableSpaceGb.toFixed(1)} GB free, {d.fileSystem})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-yellow-500">
                          {usbLoading ? 'Scanning...' : 'No USB drives detected'}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={refreshUsbDrives}
                        disabled={usbLoading}
                        title="Refresh USB drives"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${usbLoading ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  ) : opt.optionType === 'boolean' ? (
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
          </motion.div>
        )}
      </AnimatePresence>
    </Wrapper>
  );
}
