/**
 * Service Run Context
 *
 * Global React context that manages service execution state and Tauri event listeners.
 * Hoisted out of ServicePage so the floating status pill and other components
 * can access run state from anywhere in the app.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  ServicePreset,
  ServiceDefinition,
  ServiceReport,
  ServiceRunState,
} from '@/types/service';

// =============================================================================
// Context Shape
// =============================================================================

type ServiceRunPhase = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ServiceRunContextValue {
  /** Whether a service run is currently active */
  isRunning: boolean;
  /** Whether the run is paused */
  isPaused: boolean;
  /** Current phase of the service run lifecycle */
  phase: ServiceRunPhase;
  /** Current or most recent report */
  report: ServiceReport | null;
  /** Live log lines from the current run */
  logs: string[];
  /** Number of completed services */
  completedCount: number;
  /** Total services in the queue */
  totalCount: number;
  /** Name of the currently running service */
  currentServiceName: string | null;
  /** Overall progress percentage (0-100) */
  progress: number;
  /** Number of failed services */
  failedCount: number;
  /** Service presets loaded from backend */
  presets: ServicePreset[];
  /** Service definitions loaded from backend */
  definitions: ServiceDefinition[];
  /** Whether initial data is still loading */
  isLoading: boolean;
  /** Error from event listener setup */
  listenerError: string | null;
  /** Error from data loading */
  loadError: string | null;
  /** Reload presets from backend */
  reloadPresets: () => void;
}

const ServiceRunContext = createContext<ServiceRunContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface ServiceRunProviderProps {
  children: ReactNode;
}

export function ServiceRunProvider({ children }: ServiceRunProviderProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [phase, setPhase] = useState<ServiceRunPhase>('idle');
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [presets, setPresets] = useState<ServicePreset[]>([]);
  const [definitions, setDefinitions] = useState<ServiceDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listenerError, setListenerError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Derived state
  const enabledServices = (report?.queue ?? []).filter(q => q.enabled);
  const completedCount = report?.results?.length ?? 0;
  const totalCount = enabledServices.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const failedCount = report?.results?.filter(r => !r.success).length ?? 0;

  const defMap = new Map(definitions.map(d => [d.id, d]));
  const currentIndex = report?.currentServiceIndex ?? 0;
  const currentService = enabledServices[currentIndex];
  const currentServiceName = currentService ? (defMap.get(currentService.serviceId)?.name ?? currentService.serviceId) : null;

  // Load initial data
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
      }

      if (defsResult.status === 'fulfilled') {
        setDefinitions(defsResult.value);
      } else {
        errors.push('Failed to load service definitions');
      }

      if (stateResult.status === 'fulfilled') {
        const stateData = stateResult.value;
        if (stateData.isRunning && stateData.currentReport) {
          setReport(stateData.currentReport);
          setIsRunning(true);
          setIsPaused(stateData.isPaused);
          setPhase('running');
        } else if (stateData.currentReport && stateData.currentReport.status !== 'running') {
          setReport(stateData.currentReport);
          setIsRunning(false);
          setPhase(stateData.currentReport.status === 'completed' || stateData.currentReport.status === 'failed'
            ? (stateData.currentReport.status as ServiceRunPhase)
            : 'completed');
        }
      } else {
        errors.push('Failed to load service state');
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
      // Log events
      const unsubLog = await listen<{ serviceId: string; log: string }>('service-log', (event) => {
        setLogs((prev) => {
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
        setIsRunning(false);
        setIsPaused(false);
        const status = event.payload.status;
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          setPhase(status as ServiceRunPhase);
        } else {
          setPhase('completed');
        }
      });
      unsubscribers.push(unsubComplete);

      // State change events
      const unsubState = await listen<ServiceRunState>('service-state-changed', (event) => {
        const state = event.payload;
        setIsRunning(state.isRunning);
        setIsPaused(state.isPaused);

        if (state.currentReport) {
          setReport(state.currentReport);
        }

        if (state.isRunning) {
          setPhase('running');
          // Clear logs when a new run starts (report changes)
          if (state.currentReport && state.currentReport.results?.length === 0) {
            setLogs([]);
          }
        } else if (state.currentReport) {
          const status = state.currentReport.status;
          if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            setPhase(status as ServiceRunPhase);
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

  const reloadPresets = useCallback(() => {
    invoke<ServicePreset[]>('get_service_presets').then(setPresets).catch(() => {});
  }, []);

  const value: ServiceRunContextValue = {
    isRunning,
    isPaused,
    phase,
    report,
    logs,
    completedCount,
    totalCount,
    currentServiceName,
    progress,
    failedCount,
    presets,
    definitions,
    isLoading,
    listenerError,
    loadError,
    reloadPresets,
  };

  return (
    <ServiceRunContext.Provider value={value}>
      {children}
    </ServiceRunContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useServiceRun(): ServiceRunContextValue {
  const context = useContext(ServiceRunContext);
  if (!context) {
    throw new Error('useServiceRun must be used within a ServiceRunProvider');
  }
  return context;
}
