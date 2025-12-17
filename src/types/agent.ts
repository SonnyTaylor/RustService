/**
 * Agent system type definitions
 * Types for the agentic AI system including settings, memory, and command execution
 */

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported AI providers
 */
export type AgentProvider = 'openai' | 'anthropic' | 'ollama' | 'custom';

/**
 * Provider configuration with model options
 */
export interface ProviderConfig {
  id: AgentProvider;
  name: string;
  models: string[];
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
}

/**
 * Available providers with their configurations
 */
export const AGENT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    models: ['llama3.2', 'llama3.1', 'mistral', 'codellama', 'deepseek-coder'],
    requiresApiKey: false,
    requiresBaseUrl: true,
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    models: [],
    requiresApiKey: true,
    requiresBaseUrl: true,
  },
];

// =============================================================================
// Command Approval Types
// =============================================================================

/**
 * Command approval mode
 */
export type ApprovalMode = 'always' | 'whitelist' | 'yolo';

/**
 * Status of a pending command
 */
export type CommandStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

/**
 * A command awaiting user approval
 */
export interface PendingCommand {
  id: string;
  command: string;
  reason: string;
  createdAt: string;
  status: CommandStatus;
  output?: string;
  error?: string;
}

// =============================================================================
// Search Types
// =============================================================================

/**
 * Search provider options
 */
export type SearchProvider = 'tavily' | 'searxng' | 'none';

/**
 * Search result from web search
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

// =============================================================================
// Memory Types
// =============================================================================

/**
 * Types of memories the agent can store
 */
export type MemoryType = 'fact' | 'solution' | 'conversation' | 'instruction';

/**
 * A memory entry stored in the database
 */
export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  metadata: MemoryMetadata;
  createdAt: string;
  updatedAt: string;
}

/**
 * Metadata attached to a memory entry
 */
export interface MemoryMetadata {
  tags?: string[];
  source?: string;
  relevanceScore?: number;
  [key: string]: unknown;
}

/**
 * Memory search result with similarity score
 */
export interface MemorySearchResult extends Memory {
  similarity: number;
}

// =============================================================================
// Agent Settings
// =============================================================================

/**
 * Agent configuration settings
 */
export interface AgentSettings {
  // Provider configuration
  provider: AgentProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  
  // Execution control
  approvalMode: ApprovalMode;
  whitelistedCommands: string[];
  
  // Search configuration
  searchProvider: SearchProvider;
  tavilyApiKey?: string;
  searxngUrl?: string;
  
  // Memory configuration
  memoryEnabled: boolean;
  embeddingModel: string;
  
  // System prompt customization
  systemPrompt?: string;
}

/**
 * Default agent settings
 */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: '',
  baseUrl: undefined,
  approvalMode: 'always',
  whitelistedCommands: [
    '^ipconfig',
    '^ping ',
    '^systeminfo$',
    '^tasklist$',
    '^hostname$',
    '^whoami$',
  ],
  searchProvider: 'none',
  tavilyApiKey: undefined,
  searxngUrl: undefined,
  memoryEnabled: true,
  embeddingModel: 'text-embedding-3-small',
  systemPrompt: undefined,
};

// =============================================================================
// Chat Types
// =============================================================================

/**
 * Role of a message in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * A chat message in the conversation
 */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

/**
 * A tool call made by the agent
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

// =============================================================================
// Agent State
// =============================================================================

/**
 * Current state of the agent
 */
export type AgentState = 'idle' | 'thinking' | 'executing' | 'waiting_approval';

/**
 * Full agent runtime state
 */
export interface AgentRuntimeState {
  state: AgentState;
  messages: ChatMessage[];
  pendingCommands: PendingCommand[];
  currentToolCall?: ToolCall;
}

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Names of available agent tools
 */
export type AgentToolName = 
  | 'execute_command'
  | 'search_web'
  | 'save_to_memory'
  | 'recall_memory'
  | 'list_programs'
  | 'read_file'
  | 'write_file';

/**
 * Tool execution request from frontend
 */
export interface ToolExecutionRequest {
  tool: AgentToolName;
  args: Record<string, unknown>;
}

/**
 * Tool execution response from backend
 */
export interface ToolExecutionResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  requiresApproval?: boolean;
  pendingCommandId?: string;
}

