/**
 * useCommandApproval Hook
 *
 * Manages Human-in-the-Loop (HITL) command approval flow.
 * Tracks pending tool calls across messages, accumulates results
 * for multi-HITL scenarios, and resumes the agent loop when all
 * pending calls are resolved.
 */

import { useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CoreMessage, ToolCallPart } from 'ai';
import { isHITLTool } from '@/lib/agent-tools';
import { validateToolCall } from '@/lib/agent-activity-utils';
import type { AgentActivity, ActivityStatus } from '@/types/agent-activity';
import type { FileAttachment } from '@/types/file-attachment';
import type { ServiceReport, ServiceRunState as ServiceRunStateType } from '@/types/service';
import type { ActiveServiceRun } from '@/hooks/useServiceSupervision';

type UpdateActivityFn = (
  msgId: string | null,
  activityId: string,
  updates: Partial<AgentActivity>,
) => void;

type FindMessageIdFn = (activityId: string) => string | null;

type SetActiveServiceRunFn = (run: ActiveServiceRun | null) => void;

interface UseCommandApprovalParams {
  agentHistoryRef: React.MutableRefObject<CoreMessage[]>;
  updateActivityInParts: UpdateActivityFn;
  findMessageIdForActivity: FindMessageIdFn;
  setActiveServiceRun: SetActiveServiceRunFn;
}

/**
 * Execute a single HITL tool call and return the CoreMessage result.
 * Shared by YOLO auto-execute and manual approval paths.
 */
async function executeHITLToolCall(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  reason: string,
  updateActivity: UpdateActivityFn,
  findMessageId: FindMessageIdFn,
  setActiveServiceRun: SetActiveServiceRunFn,
): Promise<CoreMessage> {
  updateActivity(null, toolCallId, { status: 'running' as ActivityStatus });

  let result: string;
  let isError = false;

  try {
    const validation = validateToolCall(toolName, args);
    if (!validation.valid) {
      result = validation.error || 'Invalid tool call - missing required arguments';
      isError = true;
    } else {
      switch (toolName) {
        case 'execute_command': {
          const command = String(args.command || '');
          const res = await invoke<{ output?: string; error?: string }>(
            'execute_agent_command',
            { command, reason: String(args.reason || reason || 'Agent approved') },
          );
          result = res.output || res.error || 'Command executed successfully.';
          isError = !!res.error;
          break;
        }
        case 'write_file': {
          await invoke('agent_write_file', {
            path: String(args.path || ''),
            content: String(args.content || ''),
          });
          result = `Successfully wrote to ${args.path}`;
          break;
        }
        case 'edit_file': {
          const res = await invoke<{
            status: string;
            replacements: number;
            message?: string;
          }>('agent_edit_file', {
            path: String(args.path || ''),
            old_string: String(args.oldString || ''),
            new_string: String(args.newString || ''),
            all: Boolean(args.all),
          });
          result =
            res.message || `Edited ${args.path} (${res.replacements} replacements)`;
          isError = res.status !== 'success';
          break;
        }
        case 'generate_file': {
          const mimeTypeArg = args.mime_type;
          const attachment = await invoke<FileAttachment>(
            'generate_agent_file',
            {
              filename: String(args.filename || 'generated.txt'),
              content: String(args.content || ''),
              description: String(args.description || ''),
              mime_type:
                typeof mimeTypeArg === 'string' ? mimeTypeArg : undefined,
              tool_call_id: toolCallId,
              approved: true,
            },
          );
          result = `Generated ${attachment.originalName}`;
          updateActivity(null, toolCallId, {
            filename: attachment.originalName,
            path: attachment.storedPath,
            size: attachment.size,
          });
          break;
        }
        case 'move_file': {
          await invoke('agent_move_file', {
            src: String(args.src || ''),
            dest: String(args.dest || ''),
          });
          result = `Moved ${args.src} to ${args.dest}`;
          break;
        }
        case 'copy_file': {
          await invoke('agent_copy_file', {
            src: String(args.src || ''),
            dest: String(args.dest || ''),
          });
          result = `Copied ${args.src} to ${args.dest}`;
          break;
        }
        case 'run_service_queue': {
          const queue =
            (
              args.queue as Array<{
                service_id: string;
                enabled: boolean;
                order: number;
                options?: Record<string, unknown>;
              }>
            )?.map(q => ({
              serviceId: q.service_id,
              enabled: q.enabled,
              order: q.order,
              options: q.options || {},
            })) || [];
          try {
            await invoke<ServiceReport>('run_services', {
              queue,
              technician_name: args.technician_name
                ? String(args.technician_name)
                : null,
              customer_name: args.customer_name
                ? String(args.customer_name)
                : null,
            });
          } catch (err) {
            console.error('[Agent] Service run error:', err);
          }
          const state = await invoke<ServiceRunStateType>(
            'get_service_run_state',
          );
          const reportId = state.currentReport?.id || 'unknown';
          setActiveServiceRun({
            reportId,
            startedAt: new Date().toISOString(),
            lastResultCount: 0,
            assistantMsgId: findMessageId(toolCallId) || null,
          });
          result = JSON.stringify({
            status: 'started',
            report_id: reportId,
            message: `Service run started with ${queue.filter(q => q.enabled).length} services`,
          });
          break;
        }
        case 'pause_service': {
          await invoke('pause_service_run');
          result = JSON.stringify({
            status: 'success',
            message: 'Service run paused',
          });
          break;
        }
        case 'resume_service': {
          await invoke('resume_service_run');
          result = JSON.stringify({
            status: 'success',
            message: 'Service run resumed',
          });
          break;
        }
        case 'cancel_service': {
          await invoke('cancel_service_run');
          setActiveServiceRun(null);
          result = JSON.stringify({
            status: 'success',
            message: 'Service run cancelled',
          });
          break;
        }
        default:
          result = `Unknown HITL tool: ${toolName}`;
          isError = true;
      }
    }
  } catch (error) {
    result = String(error);
    isError = true;
  }

  updateActivity(null, toolCallId, {
    status: isError
      ? ('error' as ActivityStatus)
      : ('success' as ActivityStatus),
    output: result,
    error: isError ? result : undefined,
  });

  return {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId,
        toolName,
        output: isError
          ? { type: 'error-text' as const, value: result }
          : { type: 'text' as const, value: result },
      },
    ],
  };
}

export function useCommandApproval({
  agentHistoryRef,
  updateActivityInParts,
  findMessageIdForActivity,
  setActiveServiceRun,
}: UseCommandApprovalParams) {
  const approvalInProgressRef = useRef(false);

  // Multi-HITL resolution tracking
  const pendingHITLCallsRef = useRef<Map<string, Set<string>>>(new Map());
  const hitlToolResultsRef = useRef<Map<string, CoreMessage[]>>(new Map());

  /** Execute a HITL tool call (exposed for YOLO mode and stream processing). */
  const executeHITLTool = useCallback(
    async (
      toolCallId: string,
      toolName: string,
      args: Record<string, unknown>,
      reason?: string,
    ): Promise<CoreMessage> =>
      executeHITLToolCall(
        toolCallId,
        toolName,
        args,
        reason || 'Agent approved',
        updateActivityInParts,
        findMessageIdForActivity,
        setActiveServiceRun,
      ),
    [updateActivityInParts, findMessageIdForActivity, setActiveServiceRun],
  );

  /**
   * Register a set of pending HITL calls for a given message.
   * Call this when the stream finishes with unresolved HITL tools.
   */
  const registerPendingHITL = useCallback(
    (assistantMsgId: string, toolCallIds: Set<string>) => {
      pendingHITLCallsRef.current.set(assistantMsgId, toolCallIds);
      hitlToolResultsRef.current.set(assistantMsgId, []);
    },
    [],
  );

  /**
   * Handle approval of a single HITL activity.
   * Returns { allResolved, accumulatedResults, msgId } when the
   * last pending call for a message is resolved.
   */
  const handleActivityApprove = useCallback(
    async (
      activityId: string,
      runAgentLoop: (
        history: CoreMessage[],
        options?: { reuseMessageId?: string | null },
      ) => Promise<void>,
    ) => {
      if (approvalInProgressRef.current) return;
      approvalInProgressRef.current = true;

      try {
        const history = agentHistoryRef.current;
        const lastAssistantMsg = [...history]
          .reverse()
          .find(m => m.role === 'assistant');
        if (!lastAssistantMsg) return;

        const contentArray = Array.isArray(lastAssistantMsg.content)
          ? lastAssistantMsg.content
          : [];
        const toolCall = contentArray.find(
          (c): c is ToolCallPart =>
            c.type === 'tool-call' && c.toolCallId === activityId,
        );

        if (!toolCall) {
          console.error('Tool call not found for activity:', activityId);
          return;
        }

        const args = ((toolCall as Record<string, unknown>).args ??
          (toolCall as Record<string, unknown>).input ??
          {}) as Record<string, unknown>;
        const toolResultMsg = await executeHITLTool(
          activityId,
          toolCall.toolName,
          args,
          'User approved',
        );

        const msgId = findMessageIdForActivity(activityId);
        const pendingSet = [...pendingHITLCallsRef.current.entries()].find(
          ([, set]) => set.has(activityId),
        );

        if (pendingSet) {
          const [pendingMsgId, callIds] = pendingSet;
          callIds.delete(activityId);
          const accumulated =
            hitlToolResultsRef.current.get(pendingMsgId) || [];
          accumulated.push(toolResultMsg);
          hitlToolResultsRef.current.set(pendingMsgId, accumulated);

          if (callIds.size === 0) {
            pendingHITLCallsRef.current.delete(pendingMsgId);
            const allResults =
              hitlToolResultsRef.current.get(pendingMsgId) || [];
            hitlToolResultsRef.current.delete(pendingMsgId);

            const newHistory = [...history, ...allResults];
            agentHistoryRef.current = newHistory;
            await runAgentLoop(newHistory, { reuseMessageId: msgId });
          }
        } else {
          const newHistory = [...history, toolResultMsg];
          agentHistoryRef.current = newHistory;
          await runAgentLoop(newHistory, { reuseMessageId: msgId });
        }
      } finally {
        approvalInProgressRef.current = false;
      }
    },
    [
      agentHistoryRef,
      executeHITLTool,
      findMessageIdForActivity,
    ],
  );

  /**
   * Handle rejection of a single HITL activity.
   */
  const handleActivityReject = useCallback(
    async (
      activityId: string,
      setIsLoading: (v: boolean) => void,
      runAgentLoop: (
        history: CoreMessage[],
        options?: { reuseMessageId?: string | null },
      ) => Promise<void>,
    ) => {
      const history = agentHistoryRef.current;
      const lastAssistantMsg = [...history]
        .reverse()
        .find(m => m.role === 'assistant');
      if (!lastAssistantMsg) return;

      const contentArray = Array.isArray(lastAssistantMsg.content)
        ? lastAssistantMsg.content
        : [];
      const toolCall = contentArray.find(
        (c): c is ToolCallPart =>
          c.type === 'tool-call' && c.toolCallId === activityId,
      );

      if (!toolCall) {
        console.error('Tool call not found for activity:', activityId);
        return;
      }

      const rejectionMessage = 'User denied this action.';

      updateActivityInParts(null, activityId, {
        status: 'error' as ActivityStatus,
        output: rejectionMessage,
        error: rejectionMessage,
      });

      const toolResultMsg: CoreMessage = {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: activityId,
            toolName: toolCall.toolName,
            output: {
              type: 'error-text' as const,
              value: rejectionMessage,
            },
          },
        ],
      };

      const msgId = findMessageIdForActivity(activityId);
      const pendingSet = [...pendingHITLCallsRef.current.entries()].find(
        ([, set]) => set.has(activityId),
      );

      if (pendingSet) {
        const [pendingMsgId, callIds] = pendingSet;
        callIds.delete(activityId);
        const accumulated =
          hitlToolResultsRef.current.get(pendingMsgId) || [];
        accumulated.push(toolResultMsg);
        hitlToolResultsRef.current.set(pendingMsgId, accumulated);

        if (callIds.size === 0) {
          pendingHITLCallsRef.current.delete(pendingMsgId);
          const allResults =
            hitlToolResultsRef.current.get(pendingMsgId) || [];
          hitlToolResultsRef.current.delete(pendingMsgId);

          const newHistory = [...history, ...allResults];
          agentHistoryRef.current = newHistory;
          setIsLoading(true);
          await runAgentLoop(newHistory, { reuseMessageId: msgId });
        }
      } else {
        const newHistory = [...history, toolResultMsg];
        agentHistoryRef.current = newHistory;
        setIsLoading(true);
        await runAgentLoop(newHistory, { reuseMessageId: msgId });
      }
    },
    [
      agentHistoryRef,
      updateActivityInParts,
      findMessageIdForActivity,
    ],
  );

  /** Clear all tracked HITL state (used on chat clear). */
  const clearHITLState = useCallback(() => {
    pendingHITLCallsRef.current.clear();
    hitlToolResultsRef.current.clear();
  }, []);

  /**
   * Process HITL calls after a stream finishes.
   * Handles YOLO auto-execute and multi-HITL registration.
   */
  const processHITLCalls = useCallback(
    async (
      hitlCalls: ToolCallPart[],
      approvalMode: string,
      assistantMsgId: string,
      baseHistory: CoreMessage[],
      toolCallValidation: Map<string, { valid: boolean; error?: string }>,
      runAgentLoop: (
        history: CoreMessage[],
        options?: Record<string, unknown>,
      ) => Promise<void>,
      loopOptions: Record<string, unknown>,
    ): Promise<{ needsManualApproval: boolean }> => {
      if (hitlCalls.length === 0) {
        return { needsManualApproval: false };
      }

      if (approvalMode === 'yolo') {
        const toolResults: CoreMessage[] = [];
        for (const tc of hitlCalls) {
          const validation = toolCallValidation.get(tc.toolCallId);
          if (validation && !validation.valid) {
            toolResults.push({
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: tc.toolCallId,
                  toolName: tc.toolName,
                  output: {
                    type: 'error-text' as const,
                    value:
                      validation.error ||
                      'Invalid tool call - missing required arguments',
                  },
                },
              ],
            });
            continue;
          }

          const args = ((tc as Record<string, unknown>).args ??
            (tc as Record<string, unknown>).input ??
            {}) as Record<string, unknown>;
          const resultMsg = await executeHITLTool(
            tc.toolCallId,
            tc.toolName,
            args,
            'YOLO mode - auto-approved',
          );
          toolResults.push(resultMsg);
        }

        const newHistory = [...baseHistory, ...toolResults];
        agentHistoryRef.current = newHistory;
        await runAgentLoop(newHistory, loopOptions);
        return { needsManualApproval: false };
      }

      // Non-YOLO: register pending HITL calls for manual approval
      const hitlCallIds = new Set(hitlCalls.map(tc => tc.toolCallId));
      registerPendingHITL(assistantMsgId, hitlCallIds);
      return { needsManualApproval: true };
    },
    [agentHistoryRef, executeHITLTool, registerPendingHITL],
  );

  return {
    executeHITLTool,
    handleActivityApprove,
    handleActivityReject,
    registerPendingHITL,
    processHITLCalls,
    clearHITLState,
    isHITLTool,
  };
}
