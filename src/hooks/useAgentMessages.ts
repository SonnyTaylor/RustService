/**
 * useAgentMessages Hook
 *
 * Manages message state and synchronization for the agent chat.
 * Keeps a ref in sync with React state to avoid stale reads
 * during recursive agent loop execution.
 */

import { useState, useRef, useCallback } from 'react';
import type { Message } from '@/hooks/useConversations';
import type { MessagePart } from '@/components/agent/ChatMessage';
import type { AgentActivity } from '@/types/agent-activity';

type MessageUpdater = Message[] | ((prev: Message[]) => Message[]);

export function useAgentMessages() {
  const messagesRef = useRef<Message[]>([]);
  const [messages, setMessagesRaw] = useState<Message[]>([]);

  // Wrapper that keeps messagesRef in sync synchronously to avoid stale reads
  // when the agent loop recurses before React re-renders.
  const setMessages = useCallback((update: MessageUpdater) => {
    setMessagesRaw(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Append a single message
  const appendMessage = useCallback((message: Message) => {
    setMessages(prev => [...prev, message]);
  }, [setMessages]);

  // Update a specific message by id
  const updateMessage = useCallback(
    (msgId: string, updater: (msg: Message) => Message) => {
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? updater(m) : m)),
      );
    },
    [setMessages],
  );

  // Remove a message by id
  const removeMessage = useCallback(
    (msgId: string) => {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    },
    [setMessages],
  );

  // Remove a message only if it has no parts
  const removeEmptyMessage = useCallback(
    (msgId: string) => {
      setMessages(prev =>
        prev.filter(msg => msg.id !== msgId || (msg.parts && msg.parts.length > 0)),
      );
    },
    [setMessages],
  );

  // Clear all messages
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  // Find which message contains a given activity id
  const findMessageIdForActivity = useCallback(
    (activityId: string): string | null => {
      for (const msg of messagesRef.current) {
        if (!msg.parts) continue;
        const hasActivity = msg.parts.some(
          part => part.type === 'tool' && part.activity?.id === activityId,
        );
        if (hasActivity) return msg.id;
      }
      return null;
    },
    [],
  );

  return {
    messages,
    messagesRef,
    setMessages,
    appendMessage,
    updateMessage,
    removeMessage,
    removeEmptyMessage,
    clearMessages,
    findMessageIdForActivity,
  };
}

/**
 * useActivityUpdater Hook
 *
 * Manages updating activities within message parts.
 * Buffers updates for activities that haven't been attached to a message yet.
 */
export function useActivityUpdater(
  setMessages: (update: MessageUpdater) => void,
) {
  const pendingActivityUpdatesRef = useRef(
    new Map<string, Partial<AgentActivity>>(),
  );

  // Update an activity within a message's parts array.
  // If the activity is not yet attached to a message, buffer the update.
  const updateActivityInParts = useCallback(
    (
      msgId: string | null,
      activityId: string,
      updates: Partial<AgentActivity>,
    ) => {
      let found = false;
      setMessages(prev =>
        prev.map(msg => {
          if (msgId && msg.id !== msgId) return msg;
          if (!msg.parts) return msg;
          const partIdx = msg.parts.findIndex(
            p => p.type === 'tool' && p.activity?.id === activityId,
          );
          if (partIdx === -1) return msg;
          found = true;
          const newParts: MessagePart[] = [...msg.parts];
          newParts[partIdx] = {
            ...newParts[partIdx],
            activity: {
              ...newParts[partIdx].activity!,
              ...updates,
            } as AgentActivity,
          };
          return { ...msg, parts: newParts };
        }),
      );

      if (!found) {
        const existing =
          pendingActivityUpdatesRef.current.get(activityId) || {};
        pendingActivityUpdatesRef.current.set(activityId, {
          ...existing,
          ...updates,
        });
      }
    },
    [setMessages],
  );

  // Retrieve and consume any buffered updates for an activity
  const consumePendingUpdates = useCallback(
    (activityId: string): Partial<AgentActivity> | undefined => {
      const updates = pendingActivityUpdatesRef.current.get(activityId);
      if (updates) {
        pendingActivityUpdatesRef.current.delete(activityId);
      }
      return updates;
    },
    [],
  );

  // Clear all pending updates (used on chat clear)
  const clearPendingUpdates = useCallback(() => {
    pendingActivityUpdatesRef.current.clear();
  }, []);

  return {
    updateActivityInParts,
    consumePendingUpdates,
    clearPendingUpdates,
  };
}
