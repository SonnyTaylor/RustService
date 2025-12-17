/**
 * Agent Page
 * 
 * Main interface for the agentic AI system with chat, memory browser,
 * and command history views.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useChat } from '@ai-sdk/react';
import {
  Bot,
  Send,
  Brain,
  History,
  Settings,
  AlertTriangle,
  Loader2,
  Sparkles,
  Terminal,
  RefreshCw,
  MessageSquare,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useSettings } from '@/components/settings-context';
import { useAnimation, motion, AnimatedList, AnimatedItem } from '@/components/animation-context';
import { ChatMessage } from '@/components/agent/ChatMessage';
import { CommandApprovalPanel, PendingApprovalBadge } from '@/components/agent/CommandApproval';
import { MemoryBrowser } from '@/components/agent/MemoryBrowser';
import type { PendingCommand, AgentSettings, ApprovalMode, ProviderApiKeys } from '@/types/agent';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant specialized in diagnosing and fixing Windows computer issues. You have access to tools that can:

1. Execute PowerShell commands to diagnose and fix issues
2. Search the web for solutions and documentation
3. Save and recall information from memory
4. Read and write files
5. List available CLI programs

When helping users:
- Ask clarifying questions if needed
- Explain what you're doing and why
- Use appropriate tools to gather information before suggesting fixes
- Save successful solutions to memory for future reference
- Be cautious with system-modifying commands

Commands may require user approval before execution. Always explain what a command does before requesting to run it.`;

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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // For now, add a placeholder assistant message
      // In a full implementation, this would call the Vercel AI SDK streaming endpoint
      const assistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: `I received your message: "${userMessage.content}"\n\nTo fully enable AI responses, please ensure your API key is configured in Settings → Agent. The chat functionality requires a backend API route to stream responses from the AI provider.\n\nIn the meantime, I can still execute commands if you ask me to run specific diagnostics.`,
        createdAt: new Date().toISOString(),
      };
      
      // Simulate a delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${String(err)}`,
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const clearChat = () => {
    setMessages([]);
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
          <PendingApprovalBadge count={pendingCommands.length} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="px-4 pt-2 border-b">
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

            <TabsContent value="chat" className="flex-1 flex flex-col m-0 min-h-0">
              {/* Pending Approvals */}
              {pendingCommands.length > 0 && (
                <div className="p-4 border-b">
                  <CommandApprovalPanel
                    pendingCommands={pendingCommands}
                    onCommandApproved={handleCommandApproved}
                    onCommandRejected={handleCommandRejected}
                  />
                </div>
              )}

              {/* Messages */}
              <ScrollArea ref={scrollRef} className="flex-1 p-4">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
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
                  <div className="space-y-2 max-w-3xl mx-auto">
                    {messages.map((msg) => (
                      <ChatMessage
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.createdAt}
                        isStreaming={false}
                      />
                    ))}
                    {isLoading && (
                      <ChatMessage
                        role="assistant"
                        content=""
                        isStreaming={true}
                      />
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t">
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

            <TabsContent value="memory" className="flex-1 m-0 p-4 min-h-0">
              <MemoryBrowser />
            </TabsContent>

            <TabsContent value="history" className="flex-1 m-0 p-4 min-h-0">
              <CommandHistory />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </motion.div>
  );
}

export default AgentPage;

