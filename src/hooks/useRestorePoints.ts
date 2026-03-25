/**
 * useRestorePoints Hook
 *
 * Manages Windows System Restore points: fetching, creating, and dialog state.
 */

import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { RestorePointsResponse } from '@/components/system-info/types';

export interface UseRestorePointsReturn {
  restorePoints: RestorePointsResponse | null;
  isLoading: boolean;
  refresh: () => void;
  /** Whether a create operation is in progress */
  isCreating: boolean;
  /** Description text for the create dialog input */
  description: string;
  setDescription: (value: string) => void;
  /** Whether the create dialog is open */
  dialogOpen: boolean;
  setDialogOpen: (value: boolean) => void;
  /** Error from the last create attempt */
  createError: string | null;
  /** Success message from the last create */
  createSuccess: string | null;
  /** Create a restore point with the current description */
  createRestorePoint: () => Promise<void>;
}

export function useRestorePoints(): UseRestorePointsReturn {
  const [restorePoints, setRestorePoints] = useState<RestorePointsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const fetchRestorePoints = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await invoke<RestorePointsResponse>('get_restore_points');
      setRestorePoints(result);
    } catch (err) {
      setRestorePoints({ restorePoints: [], error: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchRestorePoints();
  }, [fetchRestorePoints]);

  const createRestorePoint = useCallback(async () => {
    if (!description.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const msg = await invoke<string>('create_restore_point', { description: description.trim() });
      setCreateSuccess(msg);
      setDescription('');
      setDialogOpen(false);
      // Refresh the list
      fetchRestorePoints();
    } catch (err) {
      setCreateError(String(err));
    } finally {
      setIsCreating(false);
    }
  }, [description, fetchRestorePoints]);

  return {
    restorePoints,
    isLoading,
    refresh: fetchRestorePoints,
    isCreating,
    description,
    setDescription,
    dialogOpen,
    setDialogOpen,
    createError,
    createSuccess,
    createRestorePoint,
  };
}
