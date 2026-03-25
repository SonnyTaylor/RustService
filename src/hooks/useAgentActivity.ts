/**
 * useAgentActivity Hook
 *
 * Tracks tool usage activities and maps stream events to activity
 * state within message parts. Provides helpers for creating activity
 * objects from tool calls and updating them from tool results.
 */

import { useCallback } from 'react';
import {
  validateToolCall,
  mapToolToActivityType,
  extractActivityDetails,
} from '@/lib/agent-activity-utils';
import { shouldRequireApproval } from '@/lib/agent-tools';
import type { AgentActivity, ActivityStatus } from '@/types/agent-activity';
import type { MessagePart } from '@/components/agent/ChatMessage';

/** Shape returned by createActivityFromToolCall */
export interface ActivityCreationResult {
  activity: AgentActivity;
  validation: { valid: boolean; error?: string };
}

/**
 * Create an AgentActivity from a tool call event.
 */
export function createActivityFromToolCall(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  approvalMode: string,
  pendingUpdates?: Partial<AgentActivity>,
): ActivityCreationResult {
  const validation = validateToolCall(toolName, args);
  const activityType = mapToolToActivityType(toolName);
  const activityDetails = extractActivityDetails(toolName, args);

  const requiresApproval = shouldRequireApproval(toolName, approvalMode);

  const baseActivity = {
    id: toolCallId,
    timestamp: new Date().toISOString(),
    type: activityType,
    status: validation.valid
      ? (requiresApproval ? 'pending_approval' : 'running')
      : 'error',
    error: validation.valid ? undefined : validation.error,
    ...activityDetails,
  } as AgentActivity;

  const activity = pendingUpdates
    ? ({ ...baseActivity, ...pendingUpdates } as AgentActivity)
    : baseActivity;

  return { activity, validation };
}

/**
 * Update an activity within a parts array (immutable).
 * Returns a new parts array with the specified activity updated,
 * or the original array if the activity was not found.
 */
export function updateActivityInPartsArray(
  parts: MessagePart[],
  toolCallId: string,
  updates: Partial<AgentActivity>,
): { parts: MessagePart[]; found: boolean } {
  const idx = parts.findIndex(
    p => p.type === 'tool' && p.activity?.id === toolCallId,
  );
  if (idx === -1) return { parts, found: false };

  const newParts = [...parts];
  newParts[idx] = {
    ...newParts[idx],
    activity: {
      ...newParts[idx].activity!,
      ...updates,
    } as AgentActivity,
  };
  return { parts: newParts, found: true };
}

/**
 * Extract result data from a tool-result stream event
 * into a standardized { output, isError } shape.
 */
export function extractToolResultData(resultData: unknown): {
  output: string;
  isError: boolean;
} {
  if (typeof resultData === 'string') {
    return { output: resultData, isError: false };
  }
  if (resultData && typeof resultData === 'object') {
    const obj = resultData as {
      status?: string;
      output?: string;
      error?: string;
    };
    const isError = obj.status === 'error';
    const output =
      obj.output || obj.error || JSON.stringify(resultData);
    return { output, isError };
  }
  return { output: JSON.stringify(resultData), isError: false };
}

/**
 * Hook providing memoized callbacks for activity operations.
 */
export function useAgentActivity() {
  const createActivity = useCallback(
    (
      toolCallId: string,
      toolName: string,
      args: Record<string, unknown>,
      approvalMode: string,
      pendingUpdates?: Partial<AgentActivity>,
    ) =>
      createActivityFromToolCall(
        toolCallId,
        toolName,
        args,
        approvalMode,
        pendingUpdates,
      ),
    [],
  );

  const extractResult = useCallback(
    (resultData: unknown) => extractToolResultData(resultData),
    [],
  );

  return {
    createActivity,
    extractResult,
    updatePartsArray: updateActivityInPartsArray,
  };
}
