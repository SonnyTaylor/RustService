/**
 * Agent Page
 *
 * Main interface for the ServiceAgent AI system. Orchestrates the agent loop,
 * hooks, and UI components. The heavy lifting is delegated to:
 * - useAgentMessages (message state)
 * - useAgentActivity (activity tracking)
 * - useCommandApproval (HITL approval flow)
 * - useConversations (conversation persistence)
 * - useServiceSupervision (service run events)
 * - AgentMessageList / AgentInputArea (UI)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { streamChat } from '@/lib/agent-chat';
import { getEnabledTools, isHITLTool, shouldRequireApproval } from '@/lib/agent-tools';
import { validateToolCall } from '@/lib/agent-activity-utils';
import {
  connectMCPServers,
  disconnectAll as disconnectMCPServers,
  getMCPTools,
  type MCPManagerState,
} from '@/lib/mcp-manager';
import { AgentLoopQueue, type LoopOptions } from '@/lib/agent-loop-queue';
import { AgentHeartbeat, type HeartbeatStatus } from '@/lib/agent-heartbeat';
import { useConversations, type Message } from '@/hooks/useConversations';
import { useServiceSupervision } from '@/hooks/useServiceSupervision';
import { useAgentMessages, useActivityUpdater } from '@/hooks/useAgentMessages';
import { createActivityFromToolCall, extractToolResultData } from '@/hooks/useAgentActivity';
import { useCommandApproval } from '@/hooks/useCommandApproval';
import { CoreMessage, generateId, ToolCallPart } from 'ai';
import type { MessagePart } from '@/components/agent/ChatMessage';
import { AgentRightSidebar } from '@/components/agent/AgentRightSidebar';
import { ConversationSelector } from '@/components/agent/ConversationSelector';
import { AgentMessageList } from '@/components/agent/AgentMessageList';
import { AgentInputArea } from '@/components/agent/AgentInputArea';
import type { ApprovalMode, ProviderApiKeys } from '@/types/agent';
import type { AgentActivity, ActivityStatus } from '@/types/agent-activity';
import type { FileAttachment } from '@/types/file-attachment';
import {
  Bot,
  Sparkles,
  Shield,
  ShieldAlert,
  ShieldOff,
  Square,
  Zap,
  Menu,
  PanelRightClose,
  PanelRight,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/components/settings-context';
import { useAnimation, motion, AnimatePresence } from '@/components/animation-context';

// =============================================================================
// Small Components
// =============================================================================

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

// =============================================================================
// Main Component
// =============================================================================

export function AgentPage() {
  const { settings } = useSettings();
  const { fadeInUp } = useAnimation();

  // --- Message state (extracted hook) ---
  const {
    messages,
    messagesRef,
    setMessages,
    findMessageIdForActivity,
    clearMessages,
  } = useAgentMessages();

  const {
    updateActivityInParts,
    consumePendingUpdates,
    clearPendingUpdates,
  } = useActivityUpdater(setMessages);

  // --- Local state ---
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const mcpServersKeyRef = useRef<string>('');

  const [mcpState, setMcpState] = useState<MCPManagerState>({
    servers: [],
    toolCount: 0,
    isConnecting: false,
    errors: [],
  });

  const agentHistoryRef = useRef<CoreMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Agent loop queue
  const loopQueueRef = useRef<AgentLoopQueue>(null!);
  if (!loopQueueRef.current) {
    loopQueueRef.current = new AgentLoopQueue(async () => {});
  }

  // Agent heartbeat
  const heartbeatRef = useRef<AgentHeartbeat>(null!);
  const [heartbeatStatus, setHeartbeatStatus] = useState<HeartbeatStatus>('idle');
  if (!heartbeatRef.current) {
    heartbeatRef.current = new AgentHeartbeat();
    heartbeatRef.current.onStatusChange(setHeartbeatStatus);
  }

  const agentSettings = settings.agent;
  const currentProvider = agentSettings?.provider || 'openai';
  const currentApiKey = agentSettings?.apiKeys?.[currentProvider as keyof ProviderApiKeys] || '';
  const isConfigured = currentApiKey.length > 0;

  // --- Conversation management ---
  const {
    currentConversationId,
    setConversationTitle,
    saveConversation,
    loadConversation,
    startNewConversation,
    isFirstMessageRef,
  } = useConversations({ isConfigured, setMessages, agentHistoryRef });

  // --- Service supervision ---
  const { activeServiceRun, setActiveServiceRun } = useServiceSupervision({
    agentHistoryRef,
    loopQueueRef,
  });

  // --- Command approval (extracted hook) ---
  const {
    executeHITLTool,
    handleActivityApprove: _handleApprove,
    handleActivityReject: _handleReject,
    processHITLCalls,
    clearHITLState,
  } = useCommandApproval({
    agentHistoryRef,
    updateActivityInParts,
    findMessageIdForActivity,
    setActiveServiceRun,
  });

  // --- Tool summary for sidebar ---
  const toolSummary = useMemo(() => {
    const enabledTools = getEnabledTools({
      searchProvider: settings.agent?.searchProvider || 'none',
    });
    const enabled = new Set(Object.keys(enabledTools));
    return [
      { id: 'execute_command', name: 'Commands', desc: 'Execute PowerShell', requiresApproval: true },
      { id: 'read_file', name: 'Read File', desc: 'Open file contents' },
      { id: 'edit_file', name: 'Edit File', desc: 'Replace text in files', requiresApproval: true },
      { id: 'write_file', name: 'Write File', desc: 'Create or overwrite files', requiresApproval: true },
      { id: 'generate_file', name: 'Generate File', desc: 'Create downloadable files', requiresApproval: true },
      { id: 'move_file', name: 'Move File', desc: 'Move or rename files', requiresApproval: true },
      { id: 'copy_file', name: 'Copy File', desc: 'Copy files', requiresApproval: true },
      { id: 'list_dir', name: 'List Directory', desc: 'List folder contents' },
      { id: 'grep', name: 'Grep', desc: 'Search text across files' },
      { id: 'glob', name: 'Glob', desc: 'Find files by pattern' },
      { id: 'list_programs', name: 'Programs', desc: 'List portable tools' },
      { id: 'list_instruments', name: 'Instruments', desc: 'List available scripts' },
      { id: 'run_instrument', name: 'Run Instrument', desc: 'Execute a script' },
      { id: 'search_web', name: 'Web Search', desc: 'Search the internet' },
      { id: 'get_system_info', name: 'System Info', desc: 'Hardware & OS details' },
    ].map(tool => ({ ...tool, enabled: enabled.has(tool.id) }));
  }, [settings.agent.searchProvider]);

  // --- MCP connection management ---
  useEffect(() => {
    const mcpServers = agentSettings?.mcpServers || [];
    const key = JSON.stringify(mcpServers.map(s => ({ id: s.id, url: s.url, enabled: s.enabled })));
    if (key === mcpServersKeyRef.current) return;
    mcpServersKeyRef.current = key;

    let cancelled = false;
    const enabledServers = mcpServers.filter(s => s.enabled && s.url);

    if (enabledServers.length > 0) {
      setMcpState(prev => ({ ...prev, isConnecting: true }));
      connectMCPServers(mcpServers)
        .then(({ state }) => {
          if (cancelled) return;
          setMcpState(state);
        })
        .catch(err => {
          if (cancelled) return;
          console.error('[MCP] Connection error:', err);
          setMcpState(prev => ({ ...prev, isConnecting: false }));
        });
    } else {
      disconnectMCPServers().then(() => {
        if (cancelled) return;
        setMcpState({ servers: [], toolCount: 0, isConnecting: false, errors: [] });
      });
    }

    return () => {
      cancelled = true;
      disconnectMCPServers();
    };
  }, [agentSettings?.mcpServers]);

  // ==========================================================================
  // Core Agent Loop
  // ==========================================================================

  const runAgentLoop = async (
    currentHistory: CoreMessage[],
    options?: LoopOptions,
  ) => {
    setIsLoading(true);
    heartbeatRef.current.start();
    abortControllerRef.current = new AbortController();
    const turnsRemaining = options?.turnsRemaining ?? 50;

    const reuseMessageId = options?.reuseMessageId ?? null;
    let assistantMsgId = reuseMessageId || generateId();
    let initialParts: MessagePart[] = [];
    let initialContent = '';

    if (reuseMessageId) {
      if (options?._currentParts) {
        initialParts = [...options._currentParts] as MessagePart[];
        initialContent = options._currentContent || '';
      } else {
        const existing = messagesRef.current.find(m => m.id === reuseMessageId);
        if (existing) {
          initialParts = existing.parts ? [...existing.parts] : [];
          initialContent = existing.content || '';
        } else {
          assistantMsgId = generateId();
        }
      }
    }

    const createdNewMessage = !reuseMessageId || assistantMsgId !== reuseMessageId;
    if (createdNewMessage) {
      setMessages(prev => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          parts: [],
        },
      ]);
    }

    // Declared outside try so the catch block can access them for error cleanup
    const parts: MessagePart[] = [...initialParts];
    let fullContent = initialContent;

    try {
      const localTools = getEnabledTools({
        searchProvider: settings.agent?.searchProvider || 'none',
      });
      const mcpTools = getMCPTools();
      const tools = { ...localTools, ...mcpTools };

      const result = await streamChat({
        messages: currentHistory,
        settings: agentSettings!,
        tools,
        abortSignal: abortControllerRef.current.signal,
        maxSteps: activeServiceRun ? 30 : 10,
      });
      let historyTextContent = '';
      let currentTextContent = '';
      let currentTextPartIdx = -1;
      let finalToolCalls: ToolCallPart[] = [];
      const toolResultMessages: CoreMessage[] = [];
      const toolCallValidation = new Map<string, { valid: boolean; error?: string }>();

      const updateMsg = () => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: fullContent, parts: [...parts] }
              : m,
          ),
        );
      };

      // Process the stream
      for await (const part of result.fullStream) {
        heartbeatRef.current.ping();
        if (abortControllerRef.current?.signal.aborted) break;

        if (part.type === 'text-delta') {
          if (currentTextPartIdx === -1 || parts[currentTextPartIdx]?.type !== 'text') {
            parts.push({ type: 'text', content: '' });
            currentTextPartIdx = parts.length - 1;
            currentTextContent = '';
          }
          currentTextContent += part.text;
          fullContent += part.text;
          historyTextContent += part.text;
          parts[currentTextPartIdx] = { type: 'text', content: currentTextContent };
          updateMsg();
        } else if (part.type === 'tool-call') {
          finalToolCalls.push(part);

          const args = ((part as Record<string, unknown>).args ??
            (part as Record<string, unknown>).input ?? {}) as Record<string, unknown>;

          const validation = validateToolCall(part.toolName, args);
          if (!validation.valid) {
            console.warn('[Agent] Malformed tool call:', part.toolName, 'Args:', args, 'Error:', validation.error);
          }
          toolCallValidation.set(part.toolCallId, { valid: validation.valid, error: validation.error });

          const approvalMode = agentSettings?.approvalMode || 'always';
          const pendingUpdates = consumePendingUpdates(part.toolCallId);
          const { activity } = createActivityFromToolCall(
            part.toolCallId,
            part.toolName,
            args,
            approvalMode,
            pendingUpdates,
          );

          parts.push({ type: 'tool', activity });
          currentTextPartIdx = -1;
          updateMsg();
        } else if (part.type === 'tool-result') {
          const resultData = (part as Record<string, unknown>).result ??
            (part as Record<string, unknown>).output;
          const { output, isError } = extractToolResultData(resultData);

          // Update matching tool part
          const toolPartIdx = parts.findIndex(
            p => p.type === 'tool' && p.activity?.id === part.toolCallId,
          );
          if (toolPartIdx !== -1) {
            parts[toolPartIdx] = {
              ...parts[toolPartIdx],
              activity: {
                ...parts[toolPartIdx].activity!,
                status: isError ? 'error' : 'success',
                output,
                error: isError ? output : undefined,
              } as AgentActivity,
            };
            updateMsg();
          }

          const resultValue = typeof resultData === 'undefined' ? output : resultData;
          toolResultMessages.push({
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: isError
                  ? { type: 'error-text' as const, value: resultValue }
                  : { type: 'text' as const, value: resultValue },
              },
            ],
          });
        }
      }

      // Build history
      const assistantMessage: CoreMessage = {
        role: 'assistant',
        content: [
          ...(historyTextContent
            ? [{ type: 'text' as const, text: historyTextContent }]
            : []),
          ...finalToolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: (tc as Record<string, unknown>).args ??
              (tc as Record<string, unknown>).input,
          })),
        ],
      };

      const baseHistory = [...currentHistory, assistantMessage, ...toolResultMessages];
      agentHistoryRef.current = baseHistory;

      // Handle HITL tool calls
      const hitlCalls = finalToolCalls.filter(tc => isHITLTool(tc.toolName));
      const approvalMode = agentSettings?.approvalMode || 'always';

      if (hitlCalls.length === 0) {
        if (turnsRemaining > 0 && toolResultMessages.length > 0 && !historyTextContent.trim()) {
          await runAgentLoop(baseHistory, {
            turnsRemaining: turnsRemaining - 1,
            reuseMessageId: assistantMsgId,
            _currentParts: parts,
            _currentContent: fullContent,
          });
        } else {
          heartbeatRef.current.stop();
          await saveConversation(messagesRef.current, agentHistoryRef.current);
          setIsLoading(false);
        }
      } else {
        const { needsManualApproval } = await processHITLCalls(
          hitlCalls,
          approvalMode,
          assistantMsgId,
          baseHistory,
          toolCallValidation,
          runAgentLoop,
          {
            reuseMessageId: assistantMsgId,
            turnsRemaining: turnsRemaining - 1,
            _currentParts: parts,
            _currentContent: fullContent,
          },
        );

        if (needsManualApproval) {
          heartbeatRef.current.stop();
          setIsLoading(false);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (createdNewMessage) {
          setMessages(prev => prev.filter(msg => msg.id !== assistantMsgId));
        }
        heartbeatRef.current.stop();
        setIsLoading(false);
        return;
      }

      if (error instanceof Error && error.message?.includes('No output generated')) {
        console.warn('[Agent] No output generated by model — ending turn.');
        if (createdNewMessage) {
          setMessages(prev =>
            prev.filter(
              msg => msg.id !== assistantMsgId || (msg.parts && msg.parts.length > 0),
            ),
          );
        }
        heartbeatRef.current.stop();
        setIsLoading(false);
        return;
      }

      console.error('Agent loop error:', error);

      // Mark in-progress tools as errored and append error text in one update
      const erroredParts: MessagePart[] = parts.map(p =>
        p.type === 'tool' && p.activity?.status === 'running'
          ? {
              ...p,
              activity: {
                ...p.activity!,
                status: 'error' as ActivityStatus,
                error: String(error),
              } as AgentActivity,
            }
          : p,
      );
      erroredParts.push({ type: 'text', content: `\n\n*[Error: ${error}]*` });

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: fullContent + `\n\n*[Error: ${error}]*`,
                parts: erroredParts,
              }
            : m,
        ),
      );
      heartbeatRef.current.stop();
      setIsLoading(false);
    }
  };

  // Keep the queue's run function reference up to date
  loopQueueRef.current.setRunFn(runAgentLoop);

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  const stopAgentLoop = useCallback(() => {
    abortControllerRef.current?.abort();
    heartbeatRef.current.stop();
    loopQueueRef.current.clear();
    setIsLoading(false);
  }, []);

  const handleActivityApprove = useCallback(
    async (activityId: string) => {
      await _handleApprove(activityId, runAgentLoop);
    },
    [_handleApprove],
  );

  const handleActivityReject = useCallback(
    async (activityId: string) => {
      await _handleReject(activityId, setIsLoading, runAgentLoop);
    },
    [_handleReject],
  );

  const executeMessage = useCallback(
    async (text: string, attachments?: FileAttachment[]) => {
      if ((!text.trim() && !attachments?.length) || isLoading || !agentSettings) return;

      let messageContent = text;
      if (attachments && attachments.length > 0) {
        const fileContext = attachments
          .map(att => {
            let context = `[File: ${att.originalName} (${att.category}, ${att.size} bytes)]`;
            if (att.content) {
              context += `\nContent:\n${att.content.substring(0, 2000)}${att.content.length > 2000 ? '\n... (truncated)' : ''}`;
            }
            return context;
          })
          .join('\n\n');
        messageContent = text + '\n\n' + fileContext;
      }

      const newMessage: Message = {
        id: generateId(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
        attachments,
      };
      setMessages(prev => [...prev, newMessage]);

      const userMsg: CoreMessage = { role: 'user', content: messageContent };
      const newHistory = [...agentHistoryRef.current, userMsg];
      agentHistoryRef.current = newHistory;

      if (isFirstMessageRef.current && currentConversationId) {
        isFirstMessageRef.current = false;
        const title = text.length > 50 ? text.substring(0, 50) + '...' : text;
        try {
          await invoke('update_conversation_title', {
            conversationId: currentConversationId,
            title,
          });
          setConversationTitle(title);
        } catch (err) {
          console.error('Failed to update title:', err);
        }
      }

      await runAgentLoop(newHistory);

      const updatedMessages = [...messages, newMessage];
      saveConversation(updatedMessages, agentHistoryRef.current);
    },
    [
      isLoading,
      agentSettings,
      setMessages,
      messages,
      currentConversationId,
      isFirstMessageRef,
      setConversationTitle,
      saveConversation,
    ],
  );

  const handleRunInstrument = useCallback(
    (name: string) => {
      executeMessage(`Please run the instrument: ${name}`);
    },
    [executeMessage],
  );

  const clearChat = useCallback(async () => {
    abortControllerRef.current?.abort();
    heartbeatRef.current.stop();
    loopQueueRef.current.clear();
    clearHITLState();
    clearPendingUpdates();
    setIsLoading(false);
    clearMessages();
    agentHistoryRef.current = [];
    isFirstMessageRef.current = true;
    try {
      await invoke('clear_pending_commands');
      await startNewConversation();
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  }, [clearHITLState, clearPendingUpdates, clearMessages, isFirstMessageRef, startNewConversation]);

  // ==========================================================================
  // Render
  // ==========================================================================

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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setShowRightSidebar(!showRightSidebar)}
          >
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
          {heartbeatStatus === 'stalled' && (
            <Badge
              variant="outline"
              className="gap-1.5 text-destructive bg-destructive/10 border-destructive/30 h-6"
            >
              <AlertTriangle className="h-3 w-3" />
              Stalled
            </Badge>
          )}
          {heartbeatStatus === 'stalled' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-chart-4 border-chart-4/30 hover:bg-chart-4/10"
              onClick={() => {
                stopAgentLoop();
                const history = agentHistoryRef.current;
                if (history.length > 0) {
                  runAgentLoop(history, { allowAutoContinue: true } as LoopOptions);
                }
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Force Restart
            </Button>
          )}
          {isLoading && heartbeatStatus !== 'stalled' && (
            <Badge
              variant="outline"
              className="gap-1.5 text-primary bg-primary/10 border-primary/30 animate-pulse h-6"
            >
              <Zap className="h-3 w-3" />
              Thinking...
            </Badge>
          )}
          {isLoading && (
            <Button
              variant="outline"
              size="sm"
              onClick={stopAgentLoop}
              className="h-7 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Square className="h-3 w-3 mr-1" /> Stop
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hidden lg:flex"
            onClick={() => setShowRightSidebar(!showRightSidebar)}
          >
            {showRightSidebar ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <AgentMessageList
            messages={messages}
            isLoading={isLoading}
            activeServiceRun={activeServiceRun}
            onActivityApprove={handleActivityApprove}
            onActivityReject={handleActivityReject}
            onSuggestionClick={setInput}
            onCancelServiceRun={() => setActiveServiceRun(null)}
          />

          <AgentInputArea
            input={input}
            onInputChange={setInput}
            isLoading={isLoading}
            hasMessages={messages.length > 0}
            onSend={executeMessage}
            onStop={stopAgentLoop}
            onClear={clearChat}
          />
        </div>

        {/* Right Sidebar */}
        <AnimatePresence initial={false}>
          {showRightSidebar && (
            <motion.div
              className="w-96 border-l bg-muted/10 shrink-0"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <AgentRightSidebar
                onRunInstrument={handleRunInstrument}
                mcpState={mcpState}
                toolSummary={toolSummary}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Drawer placeholder */}
      <div />
    </motion.div>
  );
}

export default AgentPage;
