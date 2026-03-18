/**
 * Service Page Component
 *
 * Service automation tab - Queue and run maintenance tasks
 * Multi-step flow: Presets → Queue → Runner → Results
 * Services persist when navigating away from the tab.
 *
 * Sub-components are in src/components/service/
 */

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useSettings } from '@/components/settings-context';
import { useServiceRun } from '@/components/service-run-context';

import type {
  ServicePreset,
  ServiceDefinition,
  ServiceQueueItem,
  ServicePhase,
} from '@/types/service';
import { PresetsView } from '@/components/service/PresetsView';
import { QueueView } from '@/components/service/QueueView';
import { RunnerView } from '@/components/service/RunnerView';
import { ResultsView } from '@/components/service/ResultsView';

// =============================================================================
// Main Service Page Component
// =============================================================================

export function ServicePage() {
  const { settings } = useSettings();
  const {
    report,
    logs,
    isRunning,
    phase: runPhase,
    presets,
    definitions,
    isLoading,
    loadError,
    listenerError,
    reloadPresets,
  } = useServiceRun();

  const [phase, setPhase] = useState<ServicePhase>('presets');
  const [queue, setQueue] = useState<ServiceQueueItem[]>([]);
  const [selectedPresetName, setSelectedPresetName] = useState<string>();

  const [missingRequirements, setMissingRequirements] = useState<Record<string, string[]> | null>(null);
  const [showMissingDialog, setShowMissingDialog] = useState(false);

  // Error states
  const [runError, setRunError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Business mode dialog state
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');

  // Parallel mode state (passed from QueueView toggle)
  const [parallelMode, setParallelMode] = useState(false);

  // Restore running/results state from context on initial render
  const initialPhaseSet = useState(() => {
    if (isRunning) return 'running';
    if (report && runPhase === 'completed') return 'results';
    return null;
  })[0];

  // Determine effective phase: if services are running/completed in context, override local phase
  const effectivePhase = (() => {
    if (isRunning && phase !== 'running') {
      // Services started running (possibly from restore) - sync phase
      if (phase === 'presets' || phase === 'queue') return 'running' as ServicePhase;
    }
    if (!isRunning && runPhase === 'completed' && phase === 'running') {
      return 'results' as ServicePhase;
    }
    return phase;
  })();

  // Sync phase with context when run completes
  if (effectivePhase !== phase) {
    // Use queue from report if available
    if (effectivePhase === 'running' && report?.queue) {
      setQueue(report.queue.map((q, i) => ({ ...q, id: q.id || `${q.serviceId}-${i}` })));
    }
    setPhase(effectivePhase);
  }

  // Handlers
  const handleSelectPreset = (preset: ServicePreset) => {
    // Build the full queue from ALL definitions
    const presetConfigMap = new Map(preset.services.map(s => [s.serviceId, s]));
    const orderedServices = [
      ...preset.services.map(s => definitions.find(d => d.id === s.serviceId)).filter((d): d is ServiceDefinition => !!d),
      ...definitions.filter(d => !presetConfigMap.has(d.id))
    ];

    const queueItems: ServiceQueueItem[] = orderedServices.map((def, index) => {
      const presetConfig = presetConfigMap.get(def.id);
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
    } else if (phase === 'results') {
      setPhase('presets');
    }
    // Don't go back during running
  };

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

      await invoke('run_services', {
        queue,
        technicianName: technicianName || null,
        customerName: custName || null,
        parallel: useParallel,
      });
      // Report will be updated via context events, phase transitions handled by effectivePhase
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
          onPresetSaved={reloadPresets}
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
          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  setShowStartDialog(false);
                  setSelectedTechnician('');
                  setCustomerName('');
                  await startServiceRun(undefined, undefined, parallelMode);
                }}
              >
                Skip
              </Button>
              <Button onClick={handleStartWithBusinessInfo}>
                Start Service
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
