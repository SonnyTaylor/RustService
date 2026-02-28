/**
 * Agent Page
 *
 * Main interface for the ServiceAgent AI system with chat UI,
 * instrument sidebar, and command approval flow.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { streamChat } from '@/lib/agent-chat';
import { getEnabledTools, isHITLTool, shouldRequireApproval } from '@/lib/agent-tools';
import { connectMCPServers, disconnectAll as disconnectMCPServers, getMCPTools, type MCPManagerState } from '@/lib/mcp-manager';
import { AgentLoopQueue, type LoopRequest } from '@/lib/agent-loop-queue';
import { AgentHeartbeat, type HeartbeatStatus } from '@/lib/agent-heartbeat';
import { CoreMessage, generateId, ToolCallPart } from 'ai';
import { ChatMessage, type MessagePart } from '@/components/agent/ChatMessage';
import { AgentRightSidebar } from '@/components/agent/AgentRightSidebar';
import { ConversationSelector } from '@/components/agent/ConversationSelector';
import { ServiceRunMonitor } from '@/components/agent/ServiceRunMonitor';
import type { ApprovalMode, ProviderApiKeys, Conversation, ConversationMessage, ConversationWithMessages } from '@/types/agent';
import type { AgentActivity, ActivityType, ActivityStatus } from '@/types/agent-activity';
import type { FileAttachment } from '@/types/file-attachment';
import type { ServiceReport, ServiceRunState as ServiceRunStateType, ServiceResult } from '@/types/service';
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
  PanelRight,
  Paperclip,
  X,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/components/settings-context';
import { useAnimation, motion, AnimatePresence } from '@/components/animation-context';

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

// Message type with interleaved parts for linear flow
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  parts?: MessagePart[];
  attachments?: FileAttachment[];
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
  const [, setConversationTitle] = useState<string>('New Chat');
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const mcpServersKeyRef = useRef<string>('');

  // Service supervision state
  const [activeServiceRun, setActiveServiceRun] = useState<{
    reportId: string;
    startedAt: string;
    lastResultCount: number;
    assistantMsgId: string | null;
  } | null>(null);
  const activeServiceRunRef = useRef(activeServiceRun);
  activeServiceRunRef.current = activeServiceRun;
  const [mcpState, setMcpState] = useState<MCPManagerState>({
    servers: [],
    toolCount: 0,
    isConnecting: false,
    errors: [],
  });

  const agentHistoryRef = useRef<CoreMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFirstMessageRef = useRef(true);
  const messagesRef = useRef<Message[]>([]);
  const pendingActivityUpdatesRef = useRef(new Map<string, Partial<AgentActivity>>());

  // Agent loop queue — ensures only one loop runs at a time
  const loopQueueRef = useRef<AgentLoopQueue>(null!);
  if (!loopQueueRef.current) {
    // Placeholder fn, updated below once runAgentLoop is defined
    loopQueueRef.current = new AgentLoopQueue(async () => {});
  }

  // Agent heartbeat — detects stalled loops
  const heartbeatRef = useRef<AgentHeartbeat>(null!);
  const [heartbeatStatus, setHeartbeatStatus] = useState<HeartbeatStatus>('idle');
  if (!heartbeatRef.current) {
    heartbeatRef.current = new AgentHeartbeat();
    heartbeatRef.current.onStatusChange(setHeartbeatStatus);
  }

  // Multi-HITL resolution tracking
  const pendingHITLCallsRef = useRef<Map<string, Set<string>>>(new Map());
  const hitlToolResultsRef = useRef<Map<string, CoreMessage[]>>(new Map());

  const agentSettings = settings.agent;
  const currentProvider = agentSettings?.provider || 'openai';
  const currentApiKey = agentSettings?.apiKeys?.[currentProvider as keyof ProviderApiKeys] || '';
  const isConfigured = currentApiKey.length > 0;

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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Connect to MCP servers when settings change (stabilized to prevent reconnection loop)
  useEffect(() => {
    const mcpServers = agentSettings?.mcpServers || [];
    const key = JSON.stringify(mcpServers.map(s => ({ id: s.id, url: s.url, enabled: s.enabled })));
    if (key === mcpServersKeyRef.current) return; // No actual change
    mcpServersKeyRef.current = key;

    const enabledServers = mcpServers.filter(s => s.enabled && s.url);

    if (enabledServers.length > 0) {
      setMcpState(prev => ({ ...prev, isConnecting: true }));
      connectMCPServers(mcpServers).then(({ state }) => {
        setMcpState(state);
      }).catch(err => {
        console.error('[MCP] Connection error:', err);
        setMcpState(prev => ({ ...prev, isConnecting: false }));
      });
    } else {
      disconnectMCPServers().then(() => {
        setMcpState({ servers: [], toolCount: 0, isConnecting: false, errors: [] });
      });
    }

    return () => {
      disconnectMCPServers();
    };
  }, [agentSettings?.mcpServers]);

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

  // Service supervision: listen for service events and inject updates via queue
  useEffect(() => {
    if (!activeServiceRun) return;

    const unlisteners: Promise<UnlistenFn>[] = [];

    // Listen for state changes (service completed, progress updates)
    unlisteners.push(
      listen<ServiceRunStateType>('service-state-changed', (event) => {
        const run = activeServiceRunRef.current;
        if (!run) return;

        const state = event.payload;
        const report = state.currentReport;
        if (!report) return;

        // Check if new results have appeared since last check
        const newResultCount = report.results.length;
        if (newResultCount > run.lastResultCount) {
          const newResults = report.results.slice(run.lastResultCount);
          setActiveServiceRun(prev => prev ? { ...prev, lastResultCount: newResultCount } : null);

          // Combine ALL new results into a single update message
          const combinedContent = newResults
            .map(r => `${r.serviceId} completed:\n${formatServiceResultForAgent(r)}`)
            .join('\n\n---\n\n');

          const updateMsg: CoreMessage = {
            role: 'user',
            content: `[SERVICE UPDATE — ${newResults.length} service(s) completed]\n\n${combinedContent}`,
          };
          const history = [...agentHistoryRef.current, updateMsg];
          agentHistoryRef.current = history;

          // Route through queue instead of calling runAgentLoop directly
          loopQueueRef.current.enqueue({
            history,
            options: {
              allowAutoContinue: true,
              reuseMessageId: run.assistantMsgId,
            },
            serviceUpdate: { content: combinedContent },
          });
        }
      })
    );

    // Listen for run completion
    unlisteners.push(
      listen<ServiceReport>('service-completed', (event) => {
        const run = activeServiceRunRef.current;
        if (!run) return;

        const report = event.payload;
        const summaryContent = `Report ID: ${report.id}\nStatus: ${report.status}\nServices run: ${report.results.length}\nDuration: ${report.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) + 's' : 'unknown'}\n\nAll services have finished. Please review the results using get_service_report and get_report_statistics, then write analysis and generate the PDF report.`;
        const summaryMsg: CoreMessage = {
          role: 'user',
          content: `[SERVICE RUN COMPLETE] ${summaryContent}`,
        };
        const history = [...agentHistoryRef.current, summaryMsg];
        agentHistoryRef.current = history;
        setActiveServiceRun(null);

        // Route through queue for post-run review
        loopQueueRef.current.enqueue({
          history,
          options: { allowAutoContinue: true },
        });
      })
    );

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServiceRun?.reportId]);

  /** Format a service result into a concise text summary for the agent */
  function formatServiceResultForAgent(result: ServiceResult): string {
    const lines: string[] = [];
    lines.push(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.error) lines.push(`Error: ${result.error}`);
    lines.push(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    lines.push(`Findings (${result.findings.length}):`);
    for (const f of result.findings.slice(0, 10)) {
      lines.push(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`);
      if (f.recommendation) lines.push(`    → ${f.recommendation}`);
    }
    if (result.findings.length > 10) {
      lines.push(`  ... and ${result.findings.length - 10} more findings`);
    }
    return lines.join('\n');
  }

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
        if (!args.path || typeof args.path !== 'string' || !args.path.trim()) {
          return { valid: false, error: 'Missing or invalid path argument' };
        }
        // Validate Windows absolute path (e.g., C:\ or \\server\share)
        const path = args.path.trim();
        if (!/^[a-zA-Z]:\\|^\\\\/.test(path)) {
          return { valid: false, error: 'Path must be an absolute Windows path (e.g., C:\\path\\to\\file.txt)' };
        }
        if (args.content === undefined || args.content === null) {
          return { valid: false, error: 'Missing content argument' };
        }
        return { valid: true };
      case 'edit_file':
        if (!args.path || typeof args.path !== 'string' || !args.path.trim()) {
          return { valid: false, error: 'Missing or invalid path argument' };
        }
        if (!/^[a-zA-Z]:\\|^\\\\/.test(args.path.trim())) {
          return { valid: false, error: 'Path must be an absolute Windows path (e.g., C:\\path\\to\\file.txt)' };
        }
        if (!args.oldString || typeof args.oldString !== 'string') {
          return { valid: false, error: 'Missing or invalid oldString argument' };
        }
        if (!args.newString || typeof args.newString !== 'string') {
          return { valid: false, error: 'Missing or invalid newString argument' };
        }
        return { valid: true };
      case 'generate_file':
        if (!args.filename || typeof args.filename !== 'string') {
          return { valid: false, error: 'Missing or invalid filename argument' };
        }
        if (args.content === undefined || args.content === null) {
          return { valid: false, error: 'Missing content argument' };
        }
        if (!args.description || typeof args.description !== 'string') {
          return { valid: false, error: 'Missing or invalid description argument' };
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
    if (toolName.startsWith('mcp_')) return 'mcp_tool';
    switch (toolName) {
      case 'execute_command': return 'ran_command';
      case 'write_file': return 'write_file';
      case 'edit_file': return 'edit_file';
      case 'read_file': return 'read_file';
      case 'move_file': return 'move_file';
      case 'copy_file': return 'copy_file';
      case 'list_dir': return 'list_dir';
      case 'list_programs': return 'list_dir';
      case 'list_instruments': return 'list_dir';
      case 'run_instrument': return 'ran_command';
      case 'generate_file': return 'generate_file';
      case 'grep': return 'searched';
      case 'glob': return 'searched';
      case 'search_web': return 'web_search';
      case 'get_system_info': return 'get_system_info';
      // Service tools — dedicated activity types
      case 'run_service_queue': return 'service_queue_started';
      case 'pause_service': return 'service_paused';
      case 'resume_service': return 'service_resumed';
      case 'cancel_service': return 'service_cancelled';
      case 'list_services': return 'service_query';
      case 'list_service_presets': return 'service_query';
      case 'check_service_requirements': return 'service_query';
      case 'get_service_status': return 'service_query';
      case 'get_service_report': return 'service_report';
      case 'get_report_statistics': return 'service_report';
      case 'edit_finding': return 'service_edit';
      case 'add_finding': return 'service_edit';
      case 'remove_finding': return 'service_edit';
      case 'set_report_summary': return 'service_edit';
      case 'set_service_analysis': return 'service_edit';
      case 'set_health_score': return 'service_edit';
      case 'generate_report_pdf': return 'service_pdf';
      default: return 'ran_command';
    }
  };

  const extractActivityDetails = (toolName: string, args: Record<string, unknown>) => {
    const getPath = (p: unknown) => typeof p === 'string' ? p : '';
    const getFilename = (p: unknown) => typeof p === 'string' ? p.split(/[/\\]/).pop() || '' : '';
    const truncate = (value?: string) => {
      if (!value) return '';
      const compact = value.replace(/\s+/g, ' ').trim();
      return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
    };
    const stringifyArgs = () => {
      try {
        return JSON.stringify(args);
      } catch {
        return '';
      }
    };

    switch (toolName) {
      case 'execute_command':
        return { command: typeof args.command === 'string' ? args.command : '' };
      case 'write_file':
        return {
          path: getPath(args.path),
          filename: getFilename(args.path),
          content: typeof args.content === 'string' ? args.content : undefined
        };
      case 'edit_file':
        return {
          path: getPath(args.path),
          filename: getFilename(args.path),
          oldString: typeof args.oldString === 'string' ? truncate(args.oldString) : undefined,
          newString: typeof args.newString === 'string' ? truncate(args.newString) : undefined,
          all: typeof args.all === 'boolean' ? args.all : undefined,
        };
      case 'read_file':
        return { path: getPath(args.path), filename: getFilename(args.path) };
      case 'move_file':
        return { src: getPath(args.src), dest: getPath(args.dest) };
      case 'copy_file':
        return { src: getPath(args.src), dest: getPath(args.dest) };
      case 'generate_file':
        return {
          filename: typeof args.filename === 'string' ? args.filename : 'generated-file',
          description: typeof args.description === 'string' ? args.description : '',
        };
      case 'list_dir':
        return { path: getPath(args.path) };
      case 'list_programs':
        return { path: 'data/programs' };
      case 'list_instruments':
        return { path: 'data/instruments' };
      case 'grep':
        return { query: typeof args.pattern === 'string' ? args.pattern : '' };
      case 'glob':
        return { query: typeof args.pattern === 'string' ? args.pattern : '' };
      case 'search_web':
        return { query: typeof args.query === 'string' ? args.query : '' };
      case 'get_system_info':
        return {};
      case 'run_instrument':
        return { command: `Running instrument: ${typeof args.name === 'string' ? args.name : 'unknown'}` };
      // Service tools
      case 'run_service_queue': {
        const queue = Array.isArray(args.queue) ? args.queue : [];
        return { serviceCount: queue.filter((q: any) => q.enabled !== false).length, reason: typeof args.reason === 'string' ? args.reason : undefined };
      }
      case 'pause_service':
        return { reason: typeof args.reason === 'string' ? args.reason : undefined };
      case 'resume_service':
        return { reason: typeof args.reason === 'string' ? args.reason : undefined };
      case 'cancel_service':
        return { reason: typeof args.reason === 'string' ? args.reason : undefined };
      case 'list_services':
        return { queryType: 'List services' };
      case 'list_service_presets':
        return { queryType: 'List presets' };
      case 'check_service_requirements':
        return { queryType: 'Check requirements', detail: typeof args.service_id === 'string' ? args.service_id : undefined };
      case 'get_service_status':
        return { queryType: 'Service status' };
      case 'get_service_report':
        return { reportAction: 'Get report', reportId: typeof args.report_id === 'string' ? args.report_id : undefined };
      case 'get_report_statistics':
        return { reportAction: 'Get statistics', reportId: typeof args.report_id === 'string' ? args.report_id : undefined };
      case 'edit_finding':
        return { editAction: 'Edit finding', detail: typeof args.title === 'string' ? args.title : undefined };
      case 'add_finding':
        return { editAction: 'Add finding', detail: typeof args.title === 'string' ? args.title : undefined };
      case 'remove_finding':
        return { editAction: 'Remove finding', detail: typeof args.title === 'string' ? args.title : undefined };
      case 'set_report_summary':
        return { editAction: 'Set summary' };
      case 'set_service_analysis':
        return { editAction: 'Set analysis', detail: typeof args.service_id === 'string' ? args.service_id : undefined };
      case 'set_health_score':
        return { editAction: 'Set health score', detail: typeof args.score === 'number' ? `Score: ${args.score}` : undefined };
      case 'generate_report_pdf':
        return { reportId: typeof args.report_id === 'string' ? args.report_id : undefined };
      default:
        if (toolName.startsWith('mcp_')) {
          return { toolName, arguments: stringifyArgs() };
        }
        console.warn('[Agent] Unknown tool for activity details:', toolName);
        return {};
    }
  };

  const findMessageIdForActivity = (activityId: string) => {
    for (const msg of messagesRef.current) {
      if (!msg.parts) continue;
      const hasActivity = msg.parts.some(part => part.type === 'tool' && part.activity?.id === activityId);
      if (hasActivity) return msg.id;
    }
    return null;
  };

  // Helper: update an activity within a message's parts array
  const updateActivityInParts = (msgId: string | null, activityId: string, updates: Partial<AgentActivity>) => {
    let found = false;
    setMessages(prev => prev.map(msg => {
      if (msgId && msg.id !== msgId) return msg;
      if (!msg.parts) return msg;
      const partIdx = msg.parts.findIndex(p => p.type === 'tool' && p.activity?.id === activityId);
      if (partIdx === -1) return msg;
      found = true;
      const newParts = [...msg.parts];
      newParts[partIdx] = { ...newParts[partIdx], activity: { ...newParts[partIdx].activity!, ...updates } as AgentActivity };
      return { ...msg, parts: newParts };
    }));

    if (!found) {
      const existing = pendingActivityUpdatesRef.current.get(activityId) || {};
      pendingActivityUpdatesRef.current.set(activityId, { ...existing, ...updates });
    }
  };

  // Auto-execute HITL tool in YOLO mode (bypasses approval UI)
  const autoExecuteHITLTool = async (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CoreMessage> => {
    // Update UI to show running state
    updateActivityInParts(null, toolCallId, { status: 'running' as ActivityStatus });

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
          case 'edit_file': {
            const res = await invoke<{ status: string; replacements: number; message?: string }>('agent_edit_file', {
              path: String(args.path || ''),
              old_string: String(args.oldString || ''),
              new_string: String(args.newString || ''),
              all: Boolean(args.all),
            });
            result = res.message || `Edited ${args.path} (${res.replacements} replacements)`;
            isError = res.status !== 'success';
            break;
          }
          case 'generate_file': {
            const attachment = await invoke<FileAttachment>('generate_agent_file', {
              filename: String(args.filename || 'generated.txt'),
              content: String(args.content || ''),
              description: String(args.description || ''),
              mime_type: typeof (args as any).mime_type === 'string' ? (args as any).mime_type : undefined,
              tool_call_id: toolCallId,
              approved: true,
            });
            result = `Generated ${attachment.originalName}`;
            updateActivityInParts(null, toolCallId, {
              filename: attachment.originalName,
              path: attachment.storedPath,
              size: attachment.size,
            });
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
          case 'run_service_queue': {
            const queue = (args.queue as Array<{ service_id: string; enabled: boolean; order: number; options?: Record<string, unknown> }>)?.map(q => ({
              serviceId: q.service_id,
              enabled: q.enabled,
              order: q.order,
              options: q.options || {},
            })) || [];
            // Fire-and-forget: start the run, don't await completion
            const reportPromise = invoke<ServiceReport>('run_services', {
              queue,
              technician_name: args.technician_name ? String(args.technician_name) : null,
              customer_name: args.customer_name ? String(args.customer_name) : null,
            });
            // Get the report ID from state immediately
            await new Promise(r => setTimeout(r, 500));
            const state = await invoke<ServiceRunStateType>('get_service_run_state');
            const reportId = state.currentReport?.id || 'unknown';
            setActiveServiceRun({
              reportId,
              startedAt: new Date().toISOString(),
              lastResultCount: 0,
              assistantMsgId: null,
            });
            // Don't await the full run — let events handle progress
            reportPromise.catch(err => console.error('[Agent] Service run error:', err));
            result = JSON.stringify({ status: 'started', report_id: reportId, message: `Service run started with ${queue.filter(q => q.enabled).length} services` });
            break;
          }
          case 'pause_service': {
            await invoke('pause_service_run');
            result = JSON.stringify({ status: 'success', message: 'Service run paused' });
            break;
          }
          case 'resume_service': {
            await invoke('resume_service_run');
            result = JSON.stringify({ status: 'success', message: 'Service run resumed' });
            break;
          }
          case 'cancel_service': {
            await invoke('cancel_service_run');
            setActiveServiceRun(null);
            result = JSON.stringify({ status: 'success', message: 'Service run cancelled' });
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

    // Update UI with result
    updateActivityInParts(null, toolCallId, {
      status: isError ? 'error' as ActivityStatus : 'success' as ActivityStatus,
      output: result,
      error: isError ? result : undefined,
    });

    // Add tool result to history and continue loop
    const toolResultMsg: CoreMessage = {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId,
        toolName,
        output: isError
          ? { type: 'error-text' as const, value: result }
          : { type: 'text' as const, value: result },
      }]
    };

    return toolResultMsg;
  };

  // Core agentic loop - streams response and handles tool calls recursively.
  // Creates ONE assistant message per turn with interleaved parts (text ↔ tool).
  const runAgentLoop = async (
    currentHistory: CoreMessage[],
    options?: { allowAutoContinue?: boolean; reuseMessageId?: string | null }
  ) => {
    setIsLoading(true);
    heartbeatRef.current.start();
    abortControllerRef.current = new AbortController();
    const allowAutoContinue = options?.allowAutoContinue ?? true;

    const reuseMessageId = options?.reuseMessageId ?? null;
    let assistantMsgId = reuseMessageId || generateId();
    let initialParts: MessagePart[] = [];
    let initialContent = '';

    if (reuseMessageId) {
      const existing = messagesRef.current.find(m => m.id === reuseMessageId);
      if (existing) {
        initialParts = existing.parts ? [...existing.parts] : [];
        initialContent = existing.content || '';
      } else {
        assistantMsgId = generateId();
      }
    }

    const createdNewMessage = !reuseMessageId || assistantMsgId !== reuseMessageId;
    if (createdNewMessage) {
      // Create a single assistant message for this turn
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        parts: [],
      }]);
    }

    try {
      const localTools = getEnabledTools({
        searchProvider: settings.agent?.searchProvider || 'none',
      });

      // Merge local tools with MCP tools from connected servers
      const mcpTools = getMCPTools();
      const tools = { ...localTools, ...mcpTools };

      const result = await streamChat({
        messages: currentHistory,
        settings: agentSettings!,
        tools,
        abortSignal: abortControllerRef.current.signal,
        maxSteps: activeServiceRunRef.current ? 30 : 10,
      });

      // Track accumulated state for this turn — all in ONE message
      const parts: MessagePart[] = [...initialParts];
      let fullContent = initialContent;
      let historyTextContent = '';
      let currentTextContent = '';
      let currentTextPartIdx = -1;
      let finalToolCalls: ToolCallPart[] = [];
      const toolResultMessages: CoreMessage[] = [];
      const toolCallValidation = new Map<string, { valid: boolean; error?: string }>();

      const updateMsg = () => {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: fullContent, parts: [...parts] } : m
        ));
      };

      // Process the stream
      for await (const part of result.fullStream) {
        heartbeatRef.current.ping();

        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        if (part.type === 'text-delta') {
          // If no current text part or last part was a tool, start new text part
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
        }
        else if (part.type === 'tool-call') {
          // Track tool call
          finalToolCalls.push(part);

          const args = ((part as any).args ?? (part as any).input ?? {}) as Record<string, unknown>;

          // Validate tool call args
          const validation = validateToolCall(part.toolName, args);
          if (!validation.valid) {
            console.warn('[Agent] Malformed tool call:', part.toolName, 'Args:', args, 'Error:', validation.error);
          }
          toolCallValidation.set(part.toolCallId, { valid: validation.valid, error: validation.error });

          const activityType = mapToolToActivityType(part.toolName);
          const activityDetails = extractActivityDetails(part.toolName, args);

          // Check if this tool requires approval based on approval mode
          const approvalMode = agentSettings?.approvalMode || 'always';
          const requiresApproval = shouldRequireApproval(part.toolName, approvalMode);

          const newActivity = {
            id: part.toolCallId,
            timestamp: new Date().toISOString(),
            type: activityType,
            status: validation.valid ? (requiresApproval ? 'pending_approval' : 'running') : 'error',
            error: validation.valid ? undefined : validation.error,
            ...activityDetails
          } as AgentActivity;

          const pendingUpdates = pendingActivityUpdatesRef.current.get(part.toolCallId);
          const resolvedActivity = pendingUpdates
            ? ({ ...newActivity, ...pendingUpdates } as AgentActivity)
            : newActivity;
          if (pendingUpdates) {
            pendingActivityUpdatesRef.current.delete(part.toolCallId);
          }

          // Add tool part and reset text tracking so next text starts a new part
          parts.push({ type: 'tool', activity: resolvedActivity });
          currentTextPartIdx = -1;
          updateMsg();
        }
        else if (part.type === 'tool-result') {
          // For server-side tools that auto-execute
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

          // Find and update the matching tool part
          const toolPartIdx = parts.findIndex(p => p.type === 'tool' && p.activity?.id === part.toolCallId);
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

          // Record tool result in history so the model can continue if needed
          const resultValue = typeof resultData === 'undefined' ? output : resultData;
          toolResultMessages.push({
            role: 'tool',
            content: [{
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: isError
                ? { type: 'error-text' as const, value: resultValue }
                : { type: 'text' as const, value: resultValue },
            }]
          });
        }
      }

      // Stream finished. Update history with the full assistant message.
      const assistantMessage: CoreMessage = {
        role: 'assistant',
        content: [
          ...(historyTextContent ? [{ type: 'text' as const, text: historyTextContent }] : []),
          ...finalToolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: (tc as any).args ?? (tc as any).input,
          }))
        ]
      };

      const baseHistory = [...currentHistory, assistantMessage, ...toolResultMessages];
      agentHistoryRef.current = baseHistory;

      // Check for HITL tool calls that need handling
      const hitlCalls = finalToolCalls.filter(tc => isHITLTool(tc.toolName));
      const approvalMode = agentSettings?.approvalMode || 'always';

      if (hitlCalls.length === 0) {
        if (allowAutoContinue && toolResultMessages.length > 0 && !historyTextContent.trim()) {
          await runAgentLoop(baseHistory, { allowAutoContinue: false, reuseMessageId: assistantMsgId });
        } else {
          heartbeatRef.current.stop();
          setIsLoading(false);
        }
      } else if (approvalMode === 'yolo') {
        // YOLO mode: execute HITL tools sequentially, then continue once
        const toolResults: CoreMessage[] = [];
        for (const tc of hitlCalls) {
          const validation = toolCallValidation.get(tc.toolCallId);
          if (validation && !validation.valid) {
            toolResults.push({
              role: 'tool',
              content: [{
                type: 'tool-result',
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                output: {
                  type: 'error-text' as const,
                  value: validation.error || 'Invalid tool call - missing required arguments',
                },
              }]
            });
            continue;
          }

          const args = (tc as any).args ?? (tc as any).input ?? {};
          const resultMsg = await autoExecuteHITLTool(tc.toolCallId, tc.toolName, args);
          toolResults.push(resultMsg);
        }

        const newHistory = [...baseHistory, ...toolResults];
        agentHistoryRef.current = newHistory;
        await runAgentLoop(newHistory, { reuseMessageId: assistantMsgId });
      } else {
        // Multi-HITL: track all pending HITL calls so we only resume after all are resolved
        const hitlCallIds = new Set(hitlCalls.map(tc => tc.toolCallId));
        pendingHITLCallsRef.current.set(assistantMsgId, hitlCallIds);
        hitlToolResultsRef.current.set(assistantMsgId, []);

        heartbeatRef.current.stop();
        setIsLoading(false); // Paused for manual HITL approval
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Remove the empty assistant message on abort
        if (createdNewMessage) {
          setMessages(prev => prev.filter(msg => msg.id !== assistantMsgId));
        }
        heartbeatRef.current.stop();
        setIsLoading(false);
        return;
      }

      // Handle AI_NoOutputGeneratedError gracefully (model returned empty)
      if (error instanceof Error && error.message?.includes('No output generated')) {
        console.warn('[Agent] No output generated by model — ending turn.');
        // Remove the empty assistant message
        if (createdNewMessage) {
          setMessages(prev => prev.filter(msg => msg.id !== assistantMsgId || (msg.parts && msg.parts.length > 0)));
        }
        heartbeatRef.current.stop();
        setIsLoading(false);
        return;
      }

      console.error('Agent loop error:', error);
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: m.content + `\n\n*[Error: ${error}]*`, parts: [...(m.parts || []), { type: 'text', content: `\n\n*[Error: ${error}]*` }] }
          : m
      ));
      heartbeatRef.current.stop();
      setIsLoading(false);
    }
  };

  // Stop the agentic loop
  const stopAgentLoop = useCallback(() => {
    abortControllerRef.current?.abort();
    heartbeatRef.current.stop();
    loopQueueRef.current.clear();
    setIsLoading(false);
  }, []);

  // Keep the queue's run function reference up to date
  loopQueueRef.current.setRunFn(runAgentLoop);

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

    // 2. Update UI to show running state
    updateActivityInParts(null, activityId, { status: 'running' as ActivityStatus });

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
          case 'edit_file': {
            const res = await invoke<{ status: string; replacements: number; message?: string }>('agent_edit_file', {
              path: String(args.path || ''),
              old_string: String(args.oldString || ''),
              new_string: String(args.newString || ''),
              all: Boolean(args.all),
            });
            result = res.message || `Edited ${args.path} (${res.replacements} replacements)`;
            isError = res.status !== 'success';
            break;
          }
          case 'generate_file': {
            const attachment = await invoke<FileAttachment>('generate_agent_file', {
              filename: String(args.filename || 'generated.txt'),
              content: String(args.content || ''),
              description: String(args.description || ''),
              mime_type: typeof (args as any).mime_type === 'string' ? (args as any).mime_type : undefined,
              tool_call_id: activityId,
              approved: true,
            });
            result = `Generated ${attachment.originalName}`;
            updateActivityInParts(null, activityId, {
              filename: attachment.originalName,
              path: attachment.storedPath,
              size: attachment.size,
            });
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
          case 'run_service_queue': {
            const queue = (args.queue as Array<{ service_id: string; enabled: boolean; order: number; options?: Record<string, unknown> }>)?.map(q => ({
              serviceId: q.service_id,
              enabled: q.enabled,
              order: q.order,
              options: q.options || {},
            })) || [];
            const reportPromise = invoke<ServiceReport>('run_services', {
              queue,
              technician_name: args.technician_name ? String(args.technician_name) : null,
              customer_name: args.customer_name ? String(args.customer_name) : null,
            });
            await new Promise(r => setTimeout(r, 500));
            const state = await invoke<ServiceRunStateType>('get_service_run_state');
            const reportId = state.currentReport?.id || 'unknown';
            setActiveServiceRun({
              reportId,
              startedAt: new Date().toISOString(),
              lastResultCount: 0,
              assistantMsgId: findMessageIdForActivity(activityId) || null,
            });
            reportPromise.catch(err => console.error('[Agent] Service run error:', err));
            result = JSON.stringify({ status: 'started', report_id: reportId, message: `Service run started with ${queue.filter(q => q.enabled).length} services` });
            break;
          }
          case 'pause_service': {
            await invoke('pause_service_run');
            result = JSON.stringify({ status: 'success', message: 'Service run paused' });
            break;
          }
          case 'resume_service': {
            await invoke('resume_service_run');
            result = JSON.stringify({ status: 'success', message: 'Service run resumed' });
            break;
          }
          case 'cancel_service': {
            await invoke('cancel_service_run');
            setActiveServiceRun(null);
            result = JSON.stringify({ status: 'success', message: 'Service run cancelled' });
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
    updateActivityInParts(null, activityId, {
      status: isError ? 'error' as ActivityStatus : 'success' as ActivityStatus,
      output: result,
      error: isError ? result : undefined,
    });

    // 5. Build tool result message
    const toolResultMsg: CoreMessage = {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: activityId,
        toolName: toolCall.toolName,
        output: isError
          ? { type: 'error-text' as const, value: result }
          : { type: 'text' as const, value: result },
      }]
    };

    // 6. Multi-HITL: accumulate result, only resume when all calls resolved
    const msgId = findMessageIdForActivity(activityId);
    const pendingSet = [...pendingHITLCallsRef.current.entries()].find(([, set]) => set.has(activityId));

    if (pendingSet) {
      const [pendingMsgId, callIds] = pendingSet;
      callIds.delete(activityId);
      const accumulated = hitlToolResultsRef.current.get(pendingMsgId) || [];
      accumulated.push(toolResultMsg);
      hitlToolResultsRef.current.set(pendingMsgId, accumulated);

      if (callIds.size === 0) {
        // All HITL calls resolved — resume with ALL accumulated results
        pendingHITLCallsRef.current.delete(pendingMsgId);
        const allResults = hitlToolResultsRef.current.get(pendingMsgId) || [];
        hitlToolResultsRef.current.delete(pendingMsgId);

        const newHistory = [...history, ...allResults];
        agentHistoryRef.current = newHistory;
        await runAgentLoop(newHistory, { reuseMessageId: msgId });
      }
      // else: still waiting for other HITL calls, don't resume yet
    } else {
      // No multi-HITL tracking (single call) — resume immediately
      const newHistory = [...history, toolResultMsg];
      agentHistoryRef.current = newHistory;
      await runAgentLoop(newHistory, { reuseMessageId: msgId });
    }
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

    const rejectionMessage = 'User denied this action.';

    // 2. Update UI
    updateActivityInParts(null, activityId, {
      status: 'error' as ActivityStatus,
      output: rejectionMessage,
      error: rejectionMessage,
    });

    // 3. Build rejection tool result
    const toolResultMsg: CoreMessage = {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: activityId,
        toolName: toolCall.toolName,
        output: { type: 'error-text' as const, value: rejectionMessage },
      }]
    };

    // 4. Multi-HITL: accumulate result, only resume when all calls resolved
    const msgId = findMessageIdForActivity(activityId);
    const pendingSet = [...pendingHITLCallsRef.current.entries()].find(([, set]) => set.has(activityId));

    if (pendingSet) {
      const [pendingMsgId, callIds] = pendingSet;
      callIds.delete(activityId);
      const accumulated = hitlToolResultsRef.current.get(pendingMsgId) || [];
      accumulated.push(toolResultMsg);
      hitlToolResultsRef.current.set(pendingMsgId, accumulated);

      if (callIds.size === 0) {
        // All HITL calls resolved — resume with ALL accumulated results
        pendingHITLCallsRef.current.delete(pendingMsgId);
        const allResults = hitlToolResultsRef.current.get(pendingMsgId) || [];
        hitlToolResultsRef.current.delete(pendingMsgId);

        const newHistory = [...history, ...allResults];
        agentHistoryRef.current = newHistory;
        setIsLoading(true);
        await runAgentLoop(newHistory, { reuseMessageId: msgId });
      }
      // else: still waiting for other HITL calls
    } else {
      // No multi-HITL tracking — resume immediately
      const newHistory = [...history, toolResultMsg];
      agentHistoryRef.current = newHistory;
      setIsLoading(true);
      await runAgentLoop(newHistory, { reuseMessageId: msgId });
    }
  };


  const executeMessage = async (text: string, attachments?: FileAttachment[]) => {
    if ((!text.trim() && !attachments?.length) || isLoading || !agentSettings) return;

    // Build content with file context
    let messageContent = text;
    if (attachments && attachments.length > 0) {
      const fileContext = attachments.map(att => {
        let context = `[File: ${att.originalName} (${att.category}, ${att.size} bytes)]`;
        if (att.content) {
          context += `\nContent:\n${att.content.substring(0, 2000)}${att.content.length > 2000 ? '\n... (truncated)' : ''}`;
        }
        return context;
      }).join('\n\n');
      messageContent = text + '\n\n' + fileContext;
    }

    // Add user message to UI
    const newMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      attachments: attachments,
    };
    setMessages(prev => [...prev, newMessage]);

    // Update history
    const userMsg: CoreMessage = { role: 'user', content: messageContent };
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
    if (!input.trim() && pendingAttachments.length === 0) return;
    const text = input.trim() || (pendingAttachments.length > 0 ? 'Please analyze these files:' : '');
    const attachments = [...pendingAttachments];
    setInput('');
    setPendingAttachments([]);
    await executeMessage(text, attachments);
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

  // File upload handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    const newAttachments: FileAttachment[] = [];

    for (const file of files) {
      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove data URL prefix
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Save to backend
        const attachment = await invoke<FileAttachment>('save_uploaded_file', {
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          size: file.size,
          content_base64: base64,
        });

        newAttachments.push(attachment);
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    }

    setPendingAttachments(prev => [...prev, ...newAttachments]);
    setIsUploading(false);

    // Reset input
    e.target.value = '';
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(att => att.id !== id));
  };

  const clearChat = async () => {
    abortControllerRef.current?.abort();
    heartbeatRef.current.stop();
    loopQueueRef.current.clear();
    pendingHITLCallsRef.current.clear();
    hitlToolResultsRef.current.clear();
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
          {heartbeatStatus === 'stalled' && (
            <Badge variant="outline" className="gap-1.5 text-destructive bg-destructive/10 border-destructive/30 h-6">
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
                // Force restart with current history
                const history = agentHistoryRef.current;
                if (history.length > 0) {
                  runAgentLoop(history, { allowAutoContinue: true });
                }
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Force Restart
            </Button>
          )}
          {isLoading && heartbeatStatus !== 'stalled' && (
            <Badge variant="outline" className="gap-1.5 text-primary bg-primary/10 border-primary/30 animate-pulse h-6">
              <Zap className="h-3 w-3" />
              Thinking...
            </Badge>
          )}
          {isLoading && (
            <Button variant="outline" size="sm" onClick={stopAgentLoop} className="h-7 text-destructive border-destructive/30 hover:bg-destructive/10">
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
                <AnimatePresence initial={false}>
                  {messages.map((msg, index) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <ChatMessage
                        id={msg.id}
                        role={msg.role}
                        content={msg.content}
                        timestamp={msg.createdAt}
                        parts={msg.parts}
                        attachments={msg.attachments}
                        isStreaming={isLoading && msg.role === 'assistant' && index === messages.length - 1}
                        onActivityApprove={handleActivityApprove}
                        onActivityReject={handleActivityReject}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
              {/* Service Run Monitor */}
              {activeServiceRun && (
                <ServiceRunMonitor
                  reportId={activeServiceRun.reportId}
                  onPause={async () => {
                    try { await invoke('pause_service_run'); } catch (e) { console.error(e); }
                  }}
                  onResume={async () => {
                    try { await invoke('resume_service_run'); } catch (e) { console.error(e); }
                  }}
                  onCancel={async () => {
                    try {
                      await invoke('cancel_service_run');
                      setActiveServiceRun(null);
                    } catch (e) { console.error(e); }
                  }}
                />
              )}
              {/* Invisible element to scroll to */}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 border-t bg-background/80 backdrop-blur-sm z-10">
            <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative flex gap-2">
              <div className="flex-1 relative">
                {/* Pending Attachments Preview */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {pendingAttachments.map(att => (
                      <div key={att.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs">
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{att.originalName}</span>
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(att.id)}
                          className="ml-1 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={pendingAttachments.length > 0 ? "Add a message about these files..." : "Ask ServiceAgent..."}
                    className="min-h-[44px] max-h-32 resize-none pr-12 bg-background flex-1"
                    rows={1}
                    disabled={isUploading}
                  />

                  {/* File Upload Button */}
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload-input"
                      disabled={isUploading || isLoading}
                    />
                    <label htmlFor="file-upload-input">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        disabled={isUploading || isLoading}
                        asChild
                      >
                        <span>
                          {isUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Paperclip className="h-4 w-4" />
                          )}
                        </span>
                      </Button>
                    </label>
                  </div>

                  {/* Send Button */}
                  {isLoading ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="h-10 w-10 shrink-0"
                      onClick={stopAgentLoop}
                      title="Stop generating"
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      disabled={(!input.trim() && pendingAttachments.length === 0) || isUploading}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
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
        <AnimatePresence initial={false}>
          {showRightSidebar && (
            <motion.div
              className="w-96 border-l bg-muted/10 shrink-0"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <AgentRightSidebar onRunInstrument={handleRunInstrument} mcpState={mcpState} toolSummary={toolSummary} />
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



