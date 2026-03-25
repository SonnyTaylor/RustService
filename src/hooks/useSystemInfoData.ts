/**
 * useSystemInfoData Hook
 *
 * Manages system information fetching with race condition prevention,
 * auto-refresh interval, and loading/error states.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SystemInfo } from '@/types';

export interface UseSystemInfoDataReturn {
  systemInfo: SystemInfo | null;
  isLoading: boolean;
  error: string | null;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  autoRefresh: boolean;
  setAutoRefresh: (value: boolean) => void;
  refresh: () => void;
  fetchSystemInfo: (isRefresh?: boolean) => Promise<void>;
}

export function useSystemInfoData(): UseSystemInfoDataReturn {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);

  const fetchSystemInfo = useCallback(async (isRefresh = false) => {
    try {
      // Prevent overlapping requests (auto-refresh + manual refresh)
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const requestId = ++requestIdRef.current;

      if (isRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      setError(null);
      const info = await invoke<SystemInfo>('get_system_info');

      // Avoid out-of-order updates
      if (requestId === requestIdRef.current) {
        setSystemInfo(info);
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchSystemInfo();
  }, [fetchSystemInfo]);

  // Handle refresh shortcut
  const refresh = useCallback(() => {
    fetchSystemInfo(true);
  }, [fetchSystemInfo]);

  // Auto refresh interval
  useEffect(() => {
    if (!autoRefresh) return;

    const id = window.setInterval(() => {
      fetchSystemInfo(true);
    }, 2000);

    return () => window.clearInterval(id);
  }, [autoRefresh, fetchSystemInfo]);

  return {
    systemInfo,
    isLoading,
    error,
    isRefreshing,
    lastUpdated,
    autoRefresh,
    setAutoRefresh,
    refresh,
    fetchSystemInfo,
  };
}
