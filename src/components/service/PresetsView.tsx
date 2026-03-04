/**
 * Presets View Component
 *
 * Displays service preset cards with estimated time, category breakdown,
 * and missing program warnings.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Wrench,
  ChevronRight,
  Clock,
  AlertTriangle,
} from 'lucide-react';

import { Card, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { ServicePreset, ServiceDefinition } from '@/types/service';
import { getIcon, PRESET_GRADIENTS } from './utils';

// =============================================================================
// Category Colors
// =============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  diagnostics: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  cleanup: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  security: 'bg-red-500/15 text-red-600 dark:text-red-400',
  maintenance: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'stress-test': 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
};

// =============================================================================
// Types
// =============================================================================

export interface PresetsViewProps {
  presets: ServicePreset[];
  definitions: ServiceDefinition[];
  onSelectPreset: (preset: ServicePreset) => void;
}

// =============================================================================
// Component
// =============================================================================

export function PresetsView({ presets, definitions, onSelectPreset }: PresetsViewProps) {
  const defMap = new Map(definitions.map((d) => [d.id, d]));

  // Check missing requirements per preset
  const [missingByPreset, setMissingByPreset] = useState<Record<string, number>>({});

  useEffect(() => {
    const checkRequirements = async () => {
      const results: Record<string, number> = {};
      for (const preset of presets) {
        const enabledIds = preset.services.filter(s => s.enabled).map(s => s.serviceId);
        if (enabledIds.length === 0) continue;
        try {
          const missing = await invoke<Record<string, string[]>>('validate_service_requirements', {
            serviceIds: enabledIds,
          });
          const count = Object.keys(missing).length;
          if (count > 0) results[preset.id] = count;
        } catch {
          // Ignore validation errors silently
        }
      }
      setMissingByPreset(results);
    };
    checkRequirements();
  }, [presets]);

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

              // Estimated total time
              const totalEstimatedSecs = enabledServices.reduce((acc, svc) => {
                const def = defMap.get(svc.serviceId);
                return acc + (def?.estimatedDurationSecs ?? 0);
              }, 0);

              // Category breakdown
              const categories: Record<string, number> = {};
              enabledServices.forEach(svc => {
                const cat = defMap.get(svc.serviceId)?.category ?? 'other';
                categories[cat] = (categories[cat] || 0) + 1;
              });

              const missingCount = missingByPreset[preset.id] ?? 0;

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

                    {/* Badges */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-background/60 backdrop-blur-sm ${gradient.accent}`}>
                        {badge}
                      </span>
                      {totalEstimatedSecs > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-background/60 backdrop-blur-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          ~{totalEstimatedSecs < 60 ? `${totalEstimatedSecs}s` : `${(totalEstimatedSecs / 60).toFixed(1)}m`}
                        </span>
                      )}
                      {missingCount > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3" />
                                {missingCount} missing
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{missingCount} service{missingCount > 1 ? 's' : ''} require programs that aren't configured yet</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>

                  {/* Category Breakdown + Task List */}
                  <div className="px-5 py-4 flex-1">
                    {/* Category badges */}
                    {Object.keys(categories).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {Object.entries(categories).map(([cat, count]) => (
                          <Badge
                            key={cat}
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 h-4 font-normal ${CATEGORY_COLORS[cat] ?? 'bg-muted text-muted-foreground'}`}
                          >
                            {count} {cat}
                          </Badge>
                        ))}
                      </div>
                    )}

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
