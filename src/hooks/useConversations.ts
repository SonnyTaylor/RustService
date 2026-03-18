/**
 * useConversations Hook
 *
 * Manages conversation lifecycle: creating, loading, saving conversations
 * and their associated state (title, ID, first-message tracking).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CoreMessage, generateId } from 'ai';
import { type MessagePart } from '@/components/agent/ChatMessage';
import { mapToolToActivityType, extractActivityDetails } from '@/lib/agent-activity-utils';
import type { Conversation, ConversationMessage, ConversationWithMessages } from '@/types/agent';
import type { AgentActivity } from '@/types/agent-activity';

/** UI message shape used throughout AgentPage */
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  parts?: MessagePart[];
  attachments?: import('@/types/file-attachment').FileAttachment[];
}

interface UseConversationsParams {
  isConfigured: boolean;
  /** Setter to replace the UI messages array (must keep messagesRef in sync). */
  setMessages: (update: Message[] | ((prev: Message[]) => Message[])) => void;
  /** Ref to the CoreMessage history for the agent loop. */
  agentHistoryRef: React.MutableRefObject<CoreMessage[]>;
}

export function useConversations({
  isConfigured,
  setMessages,
  agentHistoryRef,
}: UseConversationsParams) {
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [, setConversationTitle] = useState<string>('New Chat');
  const isFirstMessageRef = useRef(true);

  // Save conversation to backend
  const saveConversation = useCallback(async (msgs: Message[], history: CoreMessage[]) => {
    if (!currentConversationId || msgs.length === 0) return;

    try {
      // Convert messages to ConversationMessage format
      const conversationMessages: ConversationMessage[] = history.map((msg, index) => ({
        id: generateId(),
        conversationId: currentConversationId,
        role: msg.role,
        content: JSON.stringify(msg.content),
        createdAt: msgs[Math.floor(index / 2)]?.createdAt || new Date().toISOString(),
      }));

      await invoke('save_conversation_messages', {
        conversationId: currentConversationId,
        messages: conversationMessages,
      });
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }, [currentConversationId]);

  // Load a conversation
  const loadConversation = useCallback(async (conversation: Conversation) => {
    try {
      const data = await invoke<ConversationWithMessages>('get_conversation', {
        conversationId: conversation.id,
      });

      // Convert stored messages back to CoreMessage format for history
      const history: CoreMessage[] = data.messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'tool',
        content: JSON.parse(msg.content),
      }));

      // Build a lookup of tool results by toolCallId for activity reconstruction
      const toolResults = new Map<string, { output: string; isError: boolean }>();
      for (const msg of data.messages) {
        if (msg.role === 'tool') {
          const content = JSON.parse(msg.content);
          const parts = Array.isArray(content) ? content : [content];
          for (const part of parts) {
            if (part.type === 'tool-result' && part.toolCallId) {
              const resultData = part.result;
              let output: string;
              let isError = !!part.isError;
              if (typeof resultData === 'string') {
                output = resultData;
              } else if (resultData && typeof resultData === 'object') {
                isError = isError || resultData.status === 'error';
                output = resultData.output || resultData.error || JSON.stringify(resultData);
              } else {
                output = JSON.stringify(resultData);
              }
              toolResults.set(part.toolCallId, { output, isError });
            }
          }
        }
      }

      // Convert to UI Message format - reconstruct interleaved parts from tool-call parts
      const uiMessages: Message[] = [];
      for (const msg of data.messages) {
        if (msg.role === 'user') {
          const content = JSON.parse(msg.content);
          uiMessages.push({
            id: msg.id,
            role: 'user',
            content: typeof content === 'string' ? content : '',
            createdAt: msg.createdAt,
          });
        } else if (msg.role === 'assistant') {
          const content = JSON.parse(msg.content);
          let textContent = '';
          const parts: MessagePart[] = [];

          if (typeof content === 'string') {
            textContent = content;
            if (content) parts.push({ type: 'text', content });
          } else if (Array.isArray(content)) {
            // Build interleaved parts preserving order
            for (const part of content) {
              if (part.type === 'text' && part.text) {
                textContent += part.text;
                parts.push({ type: 'text', content: part.text });
              } else if (part.type === 'tool-call') {
                const toolName = part.toolName || '';
                const args = part.args || part.input || {};
                const activityType = mapToolToActivityType(toolName);
                const activityDetails = extractActivityDetails(toolName, args);
                const result = toolResults.get(part.toolCallId);

                parts.push({
                  type: 'tool',
                  activity: {
                    id: part.toolCallId,
                    timestamp: msg.createdAt,
                    type: activityType,
                    status: result ? (result.isError ? 'error' : 'success') : 'success',
                    output: result?.output,
                    error: result?.isError ? result.output : undefined,
                    ...activityDetails,
                  } as AgentActivity,
                });
              }
            }
          }

          uiMessages.push({
            id: msg.id,
            role: 'assistant',
            content: textContent,
            createdAt: msg.createdAt,
            parts,
          });
        }
        // 'tool' messages are consumed via the toolResults lookup, not shown directly
      }

      setCurrentConversationId(conversation.id);
      setConversationTitle(conversation.title);
      setMessages(uiMessages);
      agentHistoryRef.current = history;
      isFirstMessageRef.current = uiMessages.length === 0;
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }, [setMessages, agentHistoryRef]);

  // Start a new conversation
  const startNewConversation = useCallback(async () => {
    try {
      const conversation = await invoke<Conversation>('create_conversation', { title: null });
      setCurrentConversationId(conversation.id);
      setConversationTitle('New Chat');
      setMessages([]);
      agentHistoryRef.current = [];
      isFirstMessageRef.current = true;
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  }, [setMessages, agentHistoryRef]);

  // Create initial conversation on mount if none exists
  useEffect(() => {
    if (!currentConversationId && isConfigured) {
      startNewConversation();
    }
  }, [currentConversationId, isConfigured, startNewConversation]);

  return {
    currentConversationId,
    setCurrentConversationId,
    conversationTitle: undefined as string | undefined, // kept for API compat
    setConversationTitle,
    saveConversation,
    loadConversation,
    startNewConversation,
    isFirstMessageRef,
  };
}
