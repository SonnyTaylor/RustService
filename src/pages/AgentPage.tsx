/**
 * Agent Page
 * 
 * Main interface for the ServiceAgent AI system with chat UI,
 * instrument sidebar, and command approval flow.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { streamChat } from '@/lib/agent-chat';
import { getEnabledTools, isHITLTool, shouldRequireApproval } from '@/lib/agent-tools';
import { CoreMessage, generateId, ToolCallPart } from 'ai';
import { ChatMessage } from '@/components/agent/ChatMessage';
import { AgentRightSidebar } from '@/components/agent/AgentRightSidebar';
import { ConversationSelector } from '@/components/agent/ConversationSelector';
import type { AgentSettings, ApprovalMode, ProviderApiKeys, Conversation, ConversationMessage, ConversationWithMessages } from '@/types/agent';
import type { AgentActivity, ActivityType, ActivityStatus } from '@/types/agent-activity';
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldOff,
  Square,
  Zap,
  Menu,
  PanelRightClose,
  PanelRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/components/settings-context';
import { useAnimation, motion } from '@/components/animation-context';

// =============================================================================
// Components
// =============================================================================

/**
 * Approval mode indicator
 */
function ApprovalModeIndicator({ mode }: { mode: ApprovalMode }) {
  const config = {
    always: {
      icon: Shield,
      label: 'Safe Mode',
      className: 'text-green-500 bg-green-500/10 border-green-500/30',
    },
    whitelist: {
      icon: ShieldAlert,
      label: 'Whitelist Mode',
      className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
    },
    yolo: {
      icon: ShieldOff,
      label: 'YOLO Mode',
      className: 'text-red-500 bg-red-500/10 border-red-500/30',
    },
  };

  const { icon: Icon, label, className } = config[mode];

  return (
    <Badge variant="outline" className={cn('gap-1', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/**
 * Setup prompt when no API key is configured
 */
function SetupPrompt() {
  const navigateToSettings = () => {
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'settings' }));
  };

  return (
    <Card className="max-w-md mx-auto mt-8">
      <CardHeader>
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-center">Configure Agent</CardTitle>
        <CardDescription className="text-center">
          Set up your AI provider and API key to start using the agent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={navigateToSettings}>
          Open Settings
        </Button>
      </CardContent>
    </Card>
  );
}

// Message type with activities for the new UI
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  activities?: AgentActivity[];
}

// =============================================================================
// Main Component
// =============================================================================

export function AgentPage() {
  const { settings } = useSettings();
  const { fadeInUp } = useAnimation();
  
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string>('New Chat');

  const agentHistoryRef = useRef<CoreMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFirstMessageRef = useRef(true);

  const agentSettings = settings.agent;
  const currentProvider = agentSettings?.provider || 'openai';
  const currentApiKey = agentSettings?.apiKeys?.[currentProvider as keyof ProviderApiKeys] || '';
  const isConfigured = currentApiKey.length > 0;

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

      // Convert to UI Message format - reconstruct activities from tool-call parts
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
          const activities: AgentActivity[] = [];

          if (typeof content === 'string') {
            textContent = content;
          } else if (Array.isArray(content)) {
            // Extract text and tool-call parts
            for (const part of content) {
              if (part.type === 'text') {
                textContent += part.text || '';
              } else if (part.type === 'tool-call') {
                const toolName = part.toolName || '';
                const args = part.args || part.input || {};
                const activityType = mapToolToActivityType(toolName);
                const activityDetails = extractActivityDetails(toolName, args);
                const result = toolResults.get(part.toolCallId);

                activities.push({
                  id: part.toolCallId,
                  timestamp: msg.createdAt,
                  type: activityType,
                  status: result ? (result.isError ? 'error' : 'success') : 'success',
                  output: result?.output,
                  error: result?.isError ? result.output : undefined,
                  ...activityDetails,
                } as AgentActivity);
              }
            }
          }

          // Merge into last assistant message if it exists (to handle multi-step grouping)
          const lastUiMsg = uiMessages[uiMessages.length - 1];
          if (lastUiMsg && lastUiMsg.role === 'assistant') {
            // Append content and activities to existing assistant message
            if (textContent) {
              lastUiMsg.content += (lastUiMsg.content ? '\n\n' : '') + textContent;
            }
            lastUiMsg.activities = [...(lastUiMsg.activities || []), ...activities];
          } else {
            uiMessages.push({
              id: msg.id,
              role: 'assistant',
              content: textContent,
              createdAt: msg.createdAt,
              activities,
            });
          }
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
  }, []);

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
  }, []);

  // Create initial conversation on mount if none exists
  useEffect(() => {
    if (!currentConversationId && isConfigured) {
      startNewConversation();
    }
  }, [currentConversationId, isConfigured, startNewConversation]);

  /**
   * Validate tool call arguments and return error if invalid
   */
  const validateToolCall = (toolName: string, args: Record<string, unknown>): { valid: boolean; error?: string } => {
    switch (toolName) {
      case 'execute_command':
        if (!args.command || typeof args.command !== 'string' || !args.command.trim()) {
          return { valid: false, error: 'Missing or empty command argument' };
        }
        return { valid: true };
      case 'write_file':
        if (!args.path || typeof args.path !== 'string') {
          return { valid: false, error: 'Missing or invalid path argument' };
        }
        return { valid: true };
      case 'read_file':
        if (!args.path || typeof args.path !== 'string') {
          return { valid: false, error: 'Missing or invalid path argument' };
        }
        return { valid: true };
      case 'move_file':
      case 'copy_file':
        if (!args.src || typeof args.src !== 'string') {
          return { valid: false, error: 'Missing source path' };
        }
        if (!args.dest || typeof args.dest !== 'string') {
          return { valid: false, error: 'Missing destination path' };
        }
        return { valid: true };
      default:
        return { valid: true };
    }
  };

  const mapToolToActivityType = (toolName: string): ActivityType => {
    switch(toolName) {
      case 'execute_command': return 'ran_command';
      case 'write_file': return 'write_file';
      case 'read_file': return 'read_file';
      case 'move_file': return 'move_file';
      case 'copy_file': return 'copy_file';
      case 'list_dir': return 'list_dir';
      case 'list_programs': return 'list_dir';
      case 'list_instruments': return 'list_dir';
      case 'run_instrument': return 'ran_command';
      case 'search_web': return 'web_search';
      case 'get_system_info': return 'get_system_info';
      default: return 'ran_command';
    }
  };

  const extractActivityDetails = (toolName: string, args: Record<string, unknown>) => {
    const getPath = (p: unknown) => typeof p === 'string' ? p : '';
    const getFilename = (p: unknown) => typeof p === 'string' ? p.split(/[/\\]/).pop() || '' : '';
    
    switch (toolName) {
      case 'execute_command':
        return { command: typeof args.command === 'string' ? args.command : '' };
      case 'write_file':
        return { 
          path: getPath(args.path), 
          filename: getFilename(args.path),
          content: typeof args.content === 'string' ? args.content : undefined
        };
      case 'read_file':
        return { path: getPath(args.path), filename: getFilename(args.path) };
      case 'move_file':
        return { src: getPath(args.src), dest: getPath(args.dest) };
      case 'copy_file':
        return { src: getPath(args.src), dest: getPath(args.dest) };
      case 'list_dir':
        return { path: getPath(args.path) };
      case 'search_web':
        return { query: typeof args.query === 'string' ? args.query : '' };
      case 'get_system_info':
        return {};
      case 'run_instrument':
        return { command: `Running instrument: ${typeof args.name === 'string' ? args.name : 'unknown'}` };
      default:
        console.warn('[Agent] Unknown tool for activity details:', toolName);
        return {};
    }
  };

  // Auto-execute HITL tool in YOLO mode (bypasses approval UI)
  const autoExecuteHITLTool = async (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    assistantMsgId: string,
    turnActivities: AgentActivity[]
  ) => {
    // Update UI to show running state
    const actIdx = turnActivities.findIndex(a => a.id === toolCallId);
    if (actIdx !== -1) {
      turnActivities[actIdx] = { ...turnActivities[actIdx], status: 'running' as ActivityStatus } as AgentActivity;
      setMessages(prev => prev.map(m => 
        m.id === assistantMsgId ? { ...m, activities: [...turnActivities] } : m
      ));
    }

    let result: string;
    let isError = false;
    
    try {
      switch (toolName) {
        case 'execute_command': {
          const command = String(args.command || '');
          console.log('[Agent YOLO] Auto-executing command:', command);
          const res = await invoke<{ output?: string; error?: string }>('execute_agent_command', { 
            command, 
            reason: String(args.reason || 'YOLO mode - auto-approved')
          });
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
        case 'move_file': {
          await invoke('agent_move_file', { 
            src: String(args.src || ''), 
            dest: String(args.dest || '') 
          });
          result = `Moved ${args.src} to ${args.dest}`;
          break;
        }
        case 'copy_file': {
          await invoke('agent_copy_file', { 
            src: String(args.src || ''), 
            dest: String(args.dest || '') 
          });
          result = `Copied ${args.src} to ${args.dest}`;
          break;
        }
        default:
          result = `Unknown HITL tool: ${toolName}`;
          isError = true;
      }
    } catch (error) {
      result = String(error);
      isError = true;
    }

    // Update UI with result
    if (actIdx !== -1) {
      turnActivities[actIdx] = {
        ...turnActivities[actIdx],
        status: isError ? 'error' : 'success',
        output: result,
        error: isError ? result : undefined,
      } as AgentActivity;
      setMessages(prev => prev.map(m => 
        m.id === assistantMsgId ? { ...m, activities: [...turnActivities] } : m
      ));
    }

    // Add tool result to history and continue loop
    const toolResultMsg: CoreMessage = {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId,
        toolName,
        result: result,
        isError: isError,
      }]
    };
    
    const newHistory = [...agentHistoryRef.current, toolResultMsg];
    agentHistoryRef.current = newHistory;

    // Continue the agent loop (pass existing msg id + activities for grouping)
    await runAgentLoop(newHistory, assistantMsgId, turnActivities);
  };

  // Core agentic loop - streams response and handles tool calls recursively
  // When resuming after tool approval, pass existingMsgId + existingActivities to
  // continue appending to the same assistant message instead of creating a new one.
  const runAgentLoop = async (
    currentHistory: CoreMessage[],
    existingMsgId?: string,
    existingActivities?: AgentActivity[]
  ) => {
    setIsLoading(true);
    abortControllerRef.current = new AbortController();
    
    // Reuse existing assistant message or create a new one
    const assistantMsgId = existingMsgId || generateId();
    if (!existingMsgId) {
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        activities: []
      }]);
    }

    try {
      const tools = getEnabledTools({
        searchProvider: settings.agent.searchProvider || 'none',
      });

      const result = await streamChat({
        messages: currentHistory,
        settings: agentSettings!,
        tools,
        abortSignal: abortControllerRef.current.signal
      });

      // Track accumulated state for this turn
      // If resuming, start with the existing content from the current message
      const existingContent = existingMsgId 
        ? (messages.find(m => m.id === assistantMsgId)?.content || '') 
        : '';
      let fullContent = existingContent;
      const turnActivities: AgentActivity[] = existingActivities ? [...existingActivities] : [];
      let finalToolCalls: ToolCallPart[] = [];

      // Process the stream
      for await (const part of result.fullStream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        if (part.type === 'text-delta') {
          fullContent += part.text;
          setMessages(prev => prev.map(m => 
            m.id === assistantMsgId ? { ...m, content: fullContent } : m
          ));
        } 
        else if (part.type === 'tool-call') {
          // Track tool call
          finalToolCalls.push(part);
          
          const args = ((part as any).args ?? (part as any).input ?? {}) as Record<string, unknown>;
          
          // Validate tool call args - detect malformed calls
          const validation = validateToolCall(part.toolName, args);
          if (!validation.valid) {
            console.warn('[Agent] Malformed tool call:', part.toolName, 'Args:', args, 'Error:', validation.error);
          }
          
          const activityType = mapToolToActivityType(part.toolName);
          const activityDetails = extractActivityDetails(part.toolName, args);
          
          // Check if this tool requires approval based on approval mode
          const approvalMode = agentSettings?.approvalMode || 'always';
          const requiresApproval = shouldRequireApproval(part.toolName, approvalMode);
          
          // If tool call is invalid, show error state immediately
          const newActivity = {
            id: part.toolCallId,
            timestamp: new Date().toISOString(),
            type: activityType,
            status: validation.valid ? (requiresApproval ? 'pending_approval' : 'running') : 'error',
            error: validation.valid ? undefined : validation.error,
            ...activityDetails
          } as AgentActivity;
          
          turnActivities.push(newActivity);
          
          setMessages(prev => prev.map(m => 
            m.id === assistantMsgId ? { ...m, activities: [...turnActivities] } : m
          ));
        }
        else if (part.type === 'tool-result') {
          // For server-side tools (like search/memory) that auto-execute
          const activityIndex = turnActivities.findIndex(a => a.id === part.toolCallId);
          if (activityIndex !== -1) {
             const resultData = (part as any).result ?? (part as any).output;
             let output: string;
             let isError = false;
             
             if (typeof resultData === 'string') {
               output = resultData;
             } else if (resultData && typeof resultData === 'object') {
               const resultObj = resultData as { status?: string; output?: string; error?: string };
               isError = resultObj.status === 'error';
               output = resultObj.output || resultObj.error || JSON.stringify(resultData);
             } else {
               output = JSON.stringify(resultData);
             }
             
             turnActivities[activityIndex] = {
               ...turnActivities[activityIndex],
               status: isError ? 'error' : 'success',
               output: output,
               error: isError ? output : undefined,
             } as AgentActivity;
             
             setMessages(prev => prev.map(m => 
                m.id === assistantMsgId ? { ...m, activities: [...turnActivities] } : m
             ));
          }
        }
      }

      // Stream finished. Update history with the full assistant message.
      // Explicitly map tool calls to ensure correct CoreMessage format (args, not input)
      const assistantMessage: CoreMessage = {
        role: 'assistant',
        content: [
          { type: 'text', text: fullContent },
          ...finalToolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: (tc as any).args ?? (tc as any).input,
          }))
        ]
      };
      
      agentHistoryRef.current = [...currentHistory, assistantMessage];
      
      // Check for HITL tool calls that need handling
      const hitlCalls = finalToolCalls.filter(tc => isHITLTool(tc.toolName));
      const approvalMode = agentSettings?.approvalMode || 'always';
      
      if (hitlCalls.length === 0) {
        setIsLoading(false);
      } else if (approvalMode === 'yolo') {
        // YOLO mode: auto-execute all HITL tools
        for (const tc of hitlCalls) {
          const args = (tc as any).args ?? (tc as any).input ?? {};
          await autoExecuteHITLTool(tc.toolCallId, tc.toolName, args, assistantMsgId, turnActivities);
        }
      } else {
        setIsLoading(false); // Paused for manual HITL approval
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages(prev => prev.filter(msg => msg.id !== assistantMsgId)); // Remove partial message
        setIsLoading(false);
        return;
      }

      console.error('Agent loop error:', error);
      setMessages(prev => prev.map(m => 
        m.id === assistantMsgId ? { ...m, content: m.content + `\n\n*[Error: ${error}]*` } : m
      ));
      setIsLoading(false);
    }
  };
  
  // Stop the agentic loop
  const stopAgentLoop = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const handleActivityApprove = async (activityId: string) => {
    // 1. Find the pending tool call in history
    const history = agentHistoryRef.current;
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    
    // Handle both array content and single content
    const contentArray = Array.isArray(lastMsg.content) ? lastMsg.content : [];
    const toolCall = contentArray.find(
      (c): c is ToolCallPart => c.type === 'tool-call' && c.toolCallId === activityId
    );
    
    if (!toolCall) {
      console.error('Tool call not found for activity:', activityId);
      return;
    }

    // Find the UI message containing this activity
    const ownerMsg = messages.find(m => m.activities?.some(a => a.id === activityId));
    const ownerMsgId = ownerMsg?.id;
    const ownerActivities = ownerMsg?.activities;

    // 2. Update UI to show running state
    setMessages(prev => prev.map(msg => {
      if (!msg.activities) return msg;
      const actIdx = msg.activities.findIndex(a => a.id === activityId);
      if (actIdx === -1) return msg;
      
      const newActivities = [...msg.activities];
      newActivities[actIdx] = {
        ...newActivities[actIdx],
        status: 'running' as ActivityStatus,
      } as AgentActivity;
      return { ...msg, activities: newActivities };
    }));

    // 3. Execute the tool
    setIsLoading(true);
    let result: string;
    let isError = false;
    const args = ((toolCall as any).args ?? (toolCall as any).input ?? {}) as Record<string, unknown>;
    
    // Validate args before execution
    const validation = validateToolCall(toolCall.toolName, args);
    if (!validation.valid) {
      console.error('[Agent] Cannot execute invalid tool call:', toolCall.toolName, 'Error:', validation.error);
      result = validation.error || 'Invalid tool call - missing required arguments';
      isError = true;
    } else {
      try {
        switch (toolCall.toolName) {
          case 'execute_command': {
            const command = String(args.command || '');
            console.log('[Agent] Executing command:', command);
            const res = await invoke<{ output?: string; error?: string }>('execute_agent_command', { 
              command, 
              reason: String(args.reason || 'User approved')
            });
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
          case 'move_file': {
            await invoke('agent_move_file', { 
              src: String(args.src || ''), 
              dest: String(args.dest || '') 
            });
            result = `Successfully moved ${args.src} to ${args.dest}`;
            break;
          }
          case 'copy_file': {
            await invoke('agent_copy_file', { 
              src: String(args.src || ''), 
              dest: String(args.dest || '') 
            });
            result = `Successfully copied ${args.src} to ${args.dest}`;
            break;
          }
          default: {
            result = `Unknown tool: ${toolCall.toolName}`;
            isError = true;
          }
        }
      } catch (err) {
        console.error('[Agent] Tool execution error:', err);
        result = err instanceof Error ? err.message : String(err);
        isError = true;
      }
    }

    // 4. Update UI Activity with result
    setMessages(prev => prev.map(msg => {
      if (!msg.activities) return msg;
      const actIdx = msg.activities.findIndex(a => a.id === activityId);
      if (actIdx === -1) return msg;
      
      const newActivities = [...msg.activities];
      newActivities[actIdx] = {
        ...newActivities[actIdx],
        status: isError ? 'error' : 'success',
        output: result,
        error: isError ? result : undefined,
      } as import('@/types/agent-activity').AgentActivity;
      return { ...msg, activities: newActivities };
    }));

    // 5. Update History with Tool Result
    const toolResultMsg: CoreMessage = {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: activityId,
        toolName: toolCall.toolName,
        result: result,
        isError: isError,
      }]
    };
    
    const newHistory = [...history, toolResultMsg];
    agentHistoryRef.current = newHistory;

    // 6. Resume Loop (continue same message)
    await runAgentLoop(newHistory, ownerMsgId, ownerActivities);
  };

  const handleActivityReject = async (activityId: string) => {
    // 1. Find tool call in history
    const history = agentHistoryRef.current;
    const lastMsg = history[history.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    
    const contentArray = Array.isArray(lastMsg.content) ? lastMsg.content : [];
    const toolCall = contentArray.find(
      (c): c is ToolCallPart => c.type === 'tool-call' && c.toolCallId === activityId
    );
    
    if (!toolCall) {
      console.error('Tool call not found for activity:', activityId);
      return;
    }

    // Find the UI message containing this activity
    const ownerMsg = messages.find(m => m.activities?.some(a => a.id === activityId));
    const ownerMsgId = ownerMsg?.id;
    const ownerActivities = ownerMsg?.activities;

    const rejectionMessage = 'User denied this action.';

    // 2. Update UI
    setMessages(prev => prev.map(msg => {
      if (!msg.activities) return msg;
      const actIdx = msg.activities.findIndex(a => a.id === activityId);
      if (actIdx === -1) return msg;
      
      const newActivities = [...msg.activities];
      newActivities[actIdx] = {
        ...newActivities[actIdx],
        status: 'error',
        output: rejectionMessage,
        error: rejectionMessage,
      } as import('@/types/agent-activity').AgentActivity;
      return { ...msg, activities: newActivities };
    }));

    // 3. Update History with rejection
    const toolResultMsg: CoreMessage = {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: activityId,
        toolName: toolCall.toolName,
        result: rejectionMessage,
        isError: true,
      }]
    };

    const newHistory = [...history, toolResultMsg];
    agentHistoryRef.current = newHistory;

    // 4. Resume Loop so AI can respond to the rejection (continue same message)
    setIsLoading(true);
    await runAgentLoop(newHistory, ownerMsgId, ownerActivities);
  };


  const executeMessage = async (text: string) => {
    if (!text.trim() || isLoading || !agentSettings) return;

    // Add user message to UI
    const newMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, newMessage]);

    // Update history
    const userMsg: CoreMessage = { role: 'user', content: text };
    const newHistory = [...agentHistoryRef.current, userMsg];
    agentHistoryRef.current = newHistory;

    // Update title on first message
    if (isFirstMessageRef.current && currentConversationId) {
      isFirstMessageRef.current = false;
      const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
      setConversationTitle(title);
      invoke('update_conversation_title', {
        conversationId: currentConversationId,
        title,
      }).catch(err => console.error('Failed to update title:', err));
    }

    // Start loop
    await runAgentLoop(newHistory);

    // Auto-save after loop completes
    const updatedMessages = [...messages, newMessage];
    saveConversation(updatedMessages, agentHistoryRef.current);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    await executeMessage(text);
  };

  const handleRunInstrument = (name: string) => {
    // We inject a user message to run it
    const text = `Please run the instrument: ${name}`;
    executeMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const clearChat = async () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setMessages([]);
    agentHistoryRef.current = [];
    isFirstMessageRef.current = true;
    try {
      await invoke('clear_pending_commands');
      // Start a fresh conversation
      await startNewConversation();
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  };

  if (!isConfigured) {
    return (
      <motion.div {...fadeInUp} className="h-full flex items-center justify-center p-4">
        <SetupPrompt />
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeInUp} className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b bg-background z-10">
        <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setShowRightSidebar(!showRightSidebar)}>
                <Menu className="h-4 w-4" />
            </Button>
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-sm flex items-center gap-2">
              ServiceAgent
              <Sparkles className="h-3 w-3 text-yellow-500" />
            </h1>
            <p className="text-[10px] text-muted-foreground leading-none">
              {agentSettings?.model || 'gpt-4o-mini'}
            </p>
          </div>
          <div className="hidden sm:block border-l pl-3 ml-1">
            <ConversationSelector
              currentConversationId={currentConversationId}
              onSelect={loadConversation}
              onNew={startNewConversation}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="hidden md:block">
             <ApprovalModeIndicator mode={agentSettings?.approvalMode || 'always'} />
            </div>
            {isLoading && (
              <Badge variant="outline" className="gap-1.5 text-blue-500 bg-blue-500/10 border-blue-500/30 animate-pulse h-6">
                <Zap className="h-3 w-3" />
                Thinking...
              </Badge>
            )}
            {isLoading && (
                <Button variant="outline" size="sm" onClick={stopAgentLoop} className="h-7 text-red-500 border-red-500/30 hover:bg-red-500/10">
                    <Square className="h-3 w-3 mr-1" /> Stop
                </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 hidden lg:flex" onClick={() => setShowRightSidebar(!showRightSidebar)}>
                {showRightSidebar ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
            </Button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-4 max-w-3xl mx-auto w-full space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="text-center space-y-6 max-w-lg">
                    <div className="relative mx-auto w-16 h-16">
                      <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-pulse" />
                      <div className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">What can I help with?</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        I can run commands, manage files, search the web, and help diagnose system issues.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { icon: '🔍', text: 'Run a quick system diagnostic' },
                        { icon: '📂', text: 'List files in the programs folder' },
                        { icon: '⚡', text: 'Check disk health with SMART data' },
                        { icon: '🧹', text: 'Help me clean up temp files' },
                      ].map((suggestion) => (
                        <button
                          key={suggestion.text}
                          onClick={() => {
                            setInput(suggestion.text);
                          }}
                          className="flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border transition-colors text-left text-sm group"
                        >
                          <span className="text-base">{suggestion.icon}</span>
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">{suggestion.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    id={msg.id}
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.createdAt}
                    activities={msg.activities}
                    isStreaming={isLoading && msg.role === 'assistant' && messages.indexOf(msg) === messages.length - 1 && !msg.content}
                    onActivityApprove={handleActivityApprove}
                    onActivityReject={handleActivityReject}
                  />
                ))
              )}
              {/* Invisible element to scroll to */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-background/80 backdrop-blur-sm z-10">
            <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative flex gap-2">
              <div className="flex-1 relative">
                <Textarea 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask ServiceAgent..."
                  className="min-h-[44px] max-h-32 resize-none pr-12 bg-background"
                  rows={1}
                />
                <div className="absolute right-1 top-1">
                  <Button type="submit" size="sm" className="h-8 w-8 p-0" disabled={!input.trim() || isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {messages.length > 0 && (
                <Button type="button" variant="ghost" size="icon" onClick={clearChat} title="Clear Chat">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </form>
          </div>
        </div>

        {/* Right Sidebar (Tools) - wider width */}
        {showRightSidebar && (
          <div className="w-96 border-l bg-muted/10 shrink-0">
            <AgentRightSidebar onRunInstrument={handleRunInstrument} />
          </div>
        )}
      </div>

      {/* Mobile Drawer placeholder */}
      <div />
    </motion.div>
  );
}

export default AgentPage;



