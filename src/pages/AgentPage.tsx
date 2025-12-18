/**
 * Agent Page
 * 
 * Main interface for the agentic AI system with chat, memory browser,
 * and command history views.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { streamChat, convertToCoreMessages } from '@/lib/agent-chat';
import { getEnabledTools, isHITLTool } from '@/lib/agent-tools';
import {
  Bot,
  Send,
  Brain,
  History,
  Settings,
  Loader2,
  Sparkles,
  Terminal,
  RefreshCw,
  MessageSquare,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldOff,
  Play,
  Ban,
  Square,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettings } from '@/components/settings-context';
import { useAnimation, motion } from '@/components/animation-context';
import { ChatMessage } from '@/components/agent/ChatMessage';
import { PendingApprovalBadge } from '@/components/agent/CommandApproval';
import { InlineCommandApproval } from '@/components/agent/InlineCommandApproval';
import { MemoryBrowser } from '@/components/agent/MemoryBrowser';
import type { PendingCommand, AgentSettings, ApprovalMode, ProviderApiKeys } from '@/types/agent';

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
      description: 'All commands require approval',
      className: 'text-green-500 bg-green-500/10 border-green-500/30',
    },
    whitelist: {
      icon: ShieldAlert,
      label: 'Whitelist Mode',
      description: 'Only safe commands auto-execute',
      className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
    },
    yolo: {
      icon: ShieldOff,
      label: 'YOLO Mode',
      description: 'Commands execute without approval',
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
 * Command history panel
 */
function CommandHistory() {
  const [history, setHistory] = useState<PendingCommand[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await invoke<PendingCommand[]>('get_command_history', { limit: 50 });
      setHistory(data);
    } catch (err) {
      console.error('Failed to load command history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed':
        return 'text-green-500 bg-green-500/10 border-green-500/30';
      case 'failed':
        return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'rejected':
        return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Terminal className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <CardTitle className="text-base mb-2">No command history</CardTitle>
          <CardDescription>
            Commands executed by the agent will appear here.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Recent Commands</h3>
        <Button variant="ghost" size="sm" onClick={loadHistory}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-2 pr-4">
          {history.map((cmd) => (
            <Card key={cmd.id} className="text-sm">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge variant="outline" className={cn('text-xs', getStatusColor(cmd.status))}>
                    {cmd.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(cmd.createdAt).toLocaleString()}
                  </span>
                </div>
                <code className="text-xs font-mono block bg-muted p-2 rounded break-all">
                  {cmd.command}
                </code>
                {cmd.output && (
                  <pre className="text-xs mt-2 text-muted-foreground overflow-x-auto max-h-32 bg-muted/50 p-2 rounded">
                    {cmd.output.slice(0, 500)}
                    {cmd.output.length > 500 && '...'}
                  </pre>
                )}
                {cmd.error && (
                  <pre className="text-xs mt-2 text-red-500 overflow-x-auto max-h-32">
                    {cmd.error}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
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
          <Settings className="h-4 w-4 mr-2" />
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
  const [activeTab, setActiveTab] = useState('chat');
  const [pendingCommands, setPendingCommands] = useState<PendingCommand[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentSettings = settings.agent as AgentSettings | undefined;
  const currentProvider = agentSettings?.provider || 'openai';
  const currentApiKey = agentSettings?.apiKeys?.[currentProvider as keyof ProviderApiKeys] || '';
  const isConfigured = currentApiKey.length > 0;

  // Chat state (using local state since we're calling backend directly)
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // HITL tool calls awaiting approval (captured from stream, not polling)
  interface HITLToolCall {
    id: string;
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
    result?: { output?: string; error?: string };
  }
  const [pendingToolCalls, setPendingToolCalls] = useState<HITLToolCall[]>([]);
  
  // Agentic loop state - tracks autonomous multi-step execution
  interface AgentLoopState {
    isRunning: boolean;
    stepCount: number;
    maxSteps: number; // High limit - modern models handle this well
  }
  const [agentLoop, setAgentLoop] = useState<AgentLoopState>({
    isRunning: false,
    stepCount: 0,
    maxSteps: 100, // Effectively unlimited - can be stopped manually
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Poll for pending commands
  useEffect(() => {
    const pollPending = async () => {
      try {
        const pending = await invoke<PendingCommand[]>('get_pending_commands');
        setPendingCommands(pending);
      } catch (err) {
        console.error('Failed to get pending commands:', err);
      }
    };

    pollPending();
    const interval = setInterval(pollPending, 2000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      // Use scrollIntoView for better cross-browser support
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages, isLoading]);

  const handleCommandApproved = useCallback((result: PendingCommand) => {
    setPendingCommands(prev => prev.filter(c => c.id !== result.id));
    // Add result to chat
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `✅ Command executed:\n\`\`\`\n${result.command}\n\`\`\`\n\n${result.output || 'Command completed successfully.'}${result.error ? `\n\nErrors:\n${result.error}` : ''}`,
      createdAt: new Date().toISOString(),
    }]);
  }, []);

  const handleCommandRejected = useCallback((result: PendingCommand) => {
    setPendingCommands(prev => prev.filter(c => c.id !== result.id));
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `❌ Command rejected:\n\`\`\`\n${result.command}\n\`\`\`\n\nI'll try a different approach.`,
      createdAt: new Date().toISOString(),
    }]);
  }, []);

  // Core agentic loop - streams response and handles tool calls recursively
  // Returns true if there are pending HITL tools that need user approval
  const runAgentLoop = async (
    currentMessages: typeof messages,
    toolResultContext?: string
  ): Promise<{ pendingHITL: boolean }> => {
    if (!agentSettings) return { pendingHITL: false };
    
    // Check abort signal
    if (abortControllerRef.current?.signal.aborted) {
      setAgentLoop(prev => ({ ...prev, isRunning: false }));
      return { pendingHITL: false };
    }
    
    // Increment step count
    setAgentLoop(prev => {
      const newStep = prev.stepCount + 1;
      // Check max steps (shouldn't hit this with high limit, but safety net)
      if (newStep > prev.maxSteps) {
        console.log('Max agent steps reached');
        return { ...prev, isRunning: false };
      }
      return { ...prev, stepCount: newStep };
    });
    
    setIsLoading(true);
    const assistantId = crypto.randomUUID();
    
    // If we have tool result context, create messages for AI with it included
    // BUT don't update the visible messages - this is internal context only
    let messagesForAI = currentMessages;
    if (toolResultContext) {
      // Add as a hidden "user" message for AI context only - not shown in UI
      messagesForAI = [
        ...currentMessages,
        { 
          role: 'user' as const, 
          content: `[Tool executed. Result below - analyze and continue with the task]\n\n${toolResultContext}`, 
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString()
        }
      ];
    }
    
    // Add placeholder for AI response (only to visible messages, not messagesForAI)
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant' as const,
      content: '',
      createdAt: new Date().toISOString(),
    }]);
    
    try {
      const tools = getEnabledTools({
        searchProvider: agentSettings.searchProvider || 'none',
        memoryEnabled: agentSettings.memoryEnabled ?? true,
      });
      
      const coreMessages = convertToCoreMessages(
        messagesForAI.map(m => ({ role: m.role, content: m.content }))
      );
      
      const result = await streamChat({
        messages: coreMessages,
        settings: agentSettings,
        tools,
        abortSignal: abortControllerRef.current?.signal,
      });
      
      let fullText = '';
      let hitlToolCalls: HITLToolCall[] = [];
      let hasServerSideToolCalls = false;
      let yoloToolResults: string[] = []; // Collect YOLO mode tool results for loop continuation
      
      for await (const part of result.fullStream) {
        // Check abort between chunks
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }
        
        switch (part.type) {
          case 'text-delta': {
            fullText += part.text;
            setMessages(prev => prev.map(msg =>
              msg.id === assistantId
                ? { ...msg, content: fullText }
                : msg
            ));
            break;
          }
          case 'tool-call': {
            if (isHITLTool(part.toolName)) {
              // Check approval mode - in YOLO mode, auto-execute HITL tools
              if (agentSettings.approvalMode === 'yolo') {
                // Auto-execute the tool without waiting for approval
                try {
                  const toolInput = part.input as Record<string, unknown>;
                  let toolResult = '';
                  
                  if (part.toolName === 'execute_command') {
                    const cmdResult = await invoke<PendingCommand>('execute_agent_command', {
                      command: toolInput.command as string,
                      reason: toolInput.reason as string,
                    });
                    const outputText = cmdResult.output?.trim() || 'Command completed with no output.';
                    const errorText = cmdResult.error?.trim() ? `\nStderr: ${cmdResult.error}` : '';
                    toolResult = `Command executed: ${toolInput.command}\nOutput:\n${outputText}${errorText}`;
                  } else if (part.toolName === 'write_file') {
                    await invoke('agent_write_file', {
                      path: toolInput.path as string,
                      content: toolInput.content as string,
                    });
                    toolResult = `File successfully written to: ${toolInput.path}`;
                  }
                  
                  // Collect results for continuation
                  if (toolResult) {
                    yoloToolResults.push(toolResult);
                  }
                  hasServerSideToolCalls = true;
                } catch (error) {
                  console.error('YOLO mode tool execution failed:', error);
                  yoloToolResults.push(`Tool execution failed: ${error}`);
                }
              } else {
                // Normal mode - HITL tool needs user approval
                const toolCall: HITLToolCall = {
                  id: crypto.randomUUID(),
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  args: part.input as Record<string, unknown>,
                  status: 'pending',
                };
                hitlToolCalls.push(toolCall);
                setPendingToolCalls(prev => [...prev, toolCall]);
              }
            } else {
              // Server-side tool - will be auto-executed by streamText
              hasServerSideToolCalls = true;
            }
            break;
          }
          case 'tool-result': {
            // Server-side tools auto-executed - the AI continues after these
            // No action needed here as streamText handles continuation
            break;
          }
          case 'error': {
            console.error('Stream error:', part.error);
            break;
          }
        }
      }
      
      // Update message with final content
      if (fullText.trim()) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantId
            ? { ...msg, content: fullText }
            : msg
        ));
      } else if (hitlToolCalls.length === 0 && !hasServerSideToolCalls) {
        // No text, no tool calls - remove placeholder
        setMessages(prev => prev.filter(msg => msg.id !== assistantId));
      } else if (hitlToolCalls.length > 0) {
        // HITL tools pending - remove empty assistant placeholder
        setMessages(prev => prev.filter(msg => msg.id !== assistantId));
      } else if (yoloToolResults.length > 0 && !fullText.trim()) {
        // YOLO tools executed but no text yet - remove placeholder, we'll continue the loop
        setMessages(prev => prev.filter(msg => msg.id !== assistantId));
      }
      
      // If there are HITL tools pending, pause the loop and wait for approval
      if (hitlToolCalls.length > 0) {
        setIsLoading(false);
        return { pendingHITL: true };
      }
      
      // If YOLO mode executed tools, continue the loop with the results
      if (yoloToolResults.length > 0) {
        const combinedResults = yoloToolResults.join('\n\n---\n\n');
        // Update messages ref and continue loop
        const updatedMessages = messagesRef.current;
        setIsLoading(false);
        // Continue the agentic loop with tool results as context
        await runAgentLoop(updatedMessages, combinedResults);
        return { pendingHITL: false };
      }
      
      // If the model finished with text (no pending tool calls), task is complete
      if (fullText.trim() && !hasServerSideToolCalls) {
        setAgentLoop(prev => ({ ...prev, isRunning: false }));
        setIsLoading(false);
        return { pendingHITL: false };
      }
      
      // Server-side tools were executed and model continued - stream is done
      setIsLoading(false);
      return { pendingHITL: false };
      
    } catch (err) {
      // Check if this is an abort error
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.filter(msg => msg.id !== assistantId));
        setAgentLoop(prev => ({ ...prev, isRunning: false }));
        setIsLoading(false);
        return { pendingHITL: false };
      }
      
      console.error('Agent loop error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.map(msg =>
        msg.id === assistantId
          ? { ...msg, content: `Sorry, I encountered an error: ${errorMessage}` }
          : msg
      ));
      setAgentLoop(prev => ({ ...prev, isRunning: false }));
      setIsLoading(false);
      return { pendingHITL: false };
    }
  };
  
  // Stop the agentic loop
  const stopAgentLoop = useCallback(() => {
    abortControllerRef.current?.abort();
    setAgentLoop(prev => ({ ...prev, isRunning: false }));
    setIsLoading(false);
  }, []);

  // HITL tool call handlers (for tools captured from stream, not polling)
  // Use a ref to track current messages for continuation without race conditions
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleHITLToolApproved = useCallback(async (toolCall: typeof pendingToolCalls[0]) => {
    setPendingToolCalls(prev => prev.map(tc => 
      tc.id === toolCall.id ? { ...tc, status: 'approved' as const } : tc
    ));
    
    try {
      let toolResultContext = '';
      
      if (toolCall.toolName === 'execute_command') {
        // Call backend to execute the command directly
        const result = await invoke<PendingCommand>('execute_agent_command', {
          command: toolCall.args.command as string,
          reason: toolCall.args.reason as string,
        });
        
        // Clear this tool call from pending
        setPendingToolCalls(prev => prev.filter(tc => tc.id !== toolCall.id));
        
        // Format the result for AI context (not shown to user directly)
        const outputText = result.output?.trim() || 'Command completed with no output.';
        const errorText = result.error?.trim() ? `\nStderr: ${result.error}` : '';
        toolResultContext = `Command executed: ${toolCall.args.command}\nOutput:\n${outputText}${errorText}`;
        
      } else if (toolCall.toolName === 'write_file') {
        // Call backend to write file
        await invoke('agent_write_file', {
          path: toolCall.args.path as string,
          content: toolCall.args.content as string,
        });
        
        setPendingToolCalls(prev => prev.filter(tc => tc.id !== toolCall.id));
        toolResultContext = `File successfully written to: ${toolCall.args.path}`;
      }
      
      // Continue the agentic loop with the current messages
      // The AI will naturally describe what it found in its response
      await runAgentLoop(messagesRef.current, toolResultContext);
      
    } catch (error) {
      setPendingToolCalls(prev => prev.map(tc => 
        tc.id === toolCall.id ? { ...tc, status: 'failed' as const, result: { error: String(error) } } : tc
      ));
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `❌ Tool execution failed: ${String(error)}`,
        createdAt: new Date().toISOString(),
      }]);
      
      setAgentLoop(prev => ({ ...prev, isRunning: false }));
    }
  }, [agentSettings]);

  const handleHITLToolRejected = useCallback(async (toolCall: typeof pendingToolCalls[0]) => {
    setPendingToolCalls(prev => prev.filter(tc => tc.id !== toolCall.id));
    
    const rejectionContext = toolCall.toolName === 'execute_command' 
      ? `User rejected the command: ${toolCall.args.command}. Please try a different approach or ask what the user would prefer.`
      : `User rejected writing to file: ${toolCall.args.path}. Please try a different approach or ask what the user would prefer.`;
    
    // Continue the agentic loop - AI will respond to the rejection
    await runAgentLoop(messagesRef.current, rejectionContext);
  }, [agentSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !agentSettings) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    // Add user message
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    
    // Initialize agentic loop state
    abortControllerRef.current = new AbortController();
    setAgentLoop({
      isRunning: true,
      stepCount: 0,
      maxSteps: 100, // Effectively unlimited
    });
    
    // Start the agentic loop
    await runAgentLoop(newMessages);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const clearChat = async () => {
    // Abort any running agent loop
    abortControllerRef.current?.abort();
    setAgentLoop({ isRunning: false, stepCount: 0, maxSteps: 100 });
    setIsLoading(false);
    
    setMessages([]);
    setPendingCommands([]);
    setPendingToolCalls([]);
    
    // Also clear pending commands in the backend
    try {
      await invoke('clear_pending_commands');
    } catch (err) {
      console.error('Failed to clear pending commands:', err);
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
    <motion.div {...fadeInUp} className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold flex items-center gap-2">
              AI Agent
              <Sparkles className="h-4 w-4 text-yellow-500" />
            </h1>
            <p className="text-xs text-muted-foreground">
              {agentSettings?.model || 'gpt-4o-mini'} via {agentSettings?.provider || 'OpenAI'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {agentSettings && (
            <ApprovalModeIndicator mode={agentSettings.approvalMode} />
          )}
          
          {/* Agentic execution indicator */}
          {agentLoop.isRunning && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5 text-blue-500 bg-blue-500/10 border-blue-500/30 animate-pulse">
                <Zap className="h-3 w-3" />
                Step {agentLoop.stepCount}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={stopAgentLoop}
                className="gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10"
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
            </div>
          )}
          
          <PendingApprovalBadge count={pendingCommands.length} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Chat Area */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 pt-2 border-b shrink-0">
            <TabsList>
              <TabsTrigger value="chat" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="memory" className="gap-2">
                <Brain className="h-4 w-4" />
                Memory
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 flex flex-col m-0 min-h-0 overflow-hidden">
            {/* Messages - scrollable area */}
            <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
              <div className="p-4">
                {messages.length === 0 && pendingCommands.length === 0 ? (
                  <div className="flex items-center justify-center min-h-[300px]">
                    <Card className="max-w-md">
                      <CardContent className="p-6 text-center">
                        <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                        <h3 className="font-medium mb-2">How can I help?</h3>
                        <p className="text-sm text-muted-foreground">
                          I can diagnose issues, run commands, search for solutions, 
                          and help fix your Windows computer.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <div className="space-y-2 max-w-3xl mx-auto pb-4">
                    {messages.map((msg) => (
                      <ChatMessage
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.createdAt}
                        isStreaming={isLoading && msg.role === 'assistant' && messages.indexOf(msg) === messages.length - 1 && !msg.content}
                      />
                    ))}
                    
                    {/* Inline Command Approvals from polling (legacy, for auto-execute modes) */}
                    {pendingCommands.map((cmd) => (
                      <InlineCommandApproval
                        key={cmd.id}
                        command={cmd}
                        onApproved={handleCommandApproved}
                        onRejected={handleCommandRejected}
                      />
                    ))}
                    
                    {/* HITL Tool Approvals (captured from stream - immediate, no polling) */}
                    {pendingToolCalls.filter(tc => tc.status === 'pending').map((toolCall) => (
                      <div key={toolCall.id} className="my-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-yellow-500/20 bg-yellow-500/10">
                          <Terminal className="h-4 w-4 text-yellow-500" />
                          <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
                            {toolCall.toolName === 'execute_command' ? 'Command requires approval' : 'File write requires approval'}
                          </span>
                        </div>
                        <div className="p-3">
                          {toolCall.toolName === 'execute_command' ? (
                            <>
                              <code className="block text-sm font-mono bg-muted/50 rounded p-2 break-all whitespace-pre-wrap">
                                {toolCall.args.command as string}
                              </code>
                              {toolCall.args.reason && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  {toolCall.args.reason as string}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-muted-foreground mb-2">Write to: <code className="font-mono">{toolCall.args.path as string}</code></p>
                              <pre className="text-xs font-mono bg-muted/50 rounded p-2 max-h-32 overflow-auto">
                                {(toolCall.args.content as string).slice(0, 500)}
                                {(toolCall.args.content as string).length > 500 && '...'}
                              </pre>
                            </>
                          )}
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleHITLToolApproved(toolCall)}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Run
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-2 border-red-500/50 text-red-500 hover:bg-red-500/10"
                              onClick={() => handleHITLToolRejected(toolCall)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Deny
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Input - fixed at bottom */}
            <div className="p-4 border-t shrink-0 bg-background">
              <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your issue or ask a question..."
                    className="min-h-[44px] max-h-32 resize-none pr-12"
                    rows={1}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button 
                    type="submit" 
                    size="icon"
                    disabled={!input.trim() || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                  {messages.length > 0 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={clearChat}
                      title="Clear chat"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </TabsContent>

          <TabsContent value="memory" className="flex-1 m-0 p-4 min-h-0 overflow-auto">
            <MemoryBrowser />
          </TabsContent>

          <TabsContent value="history" className="flex-1 m-0 p-4 min-h-0 overflow-auto">
            <CommandHistory />
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}

export default AgentPage;

