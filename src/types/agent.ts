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
export type AgentProvider =
  | "openai"
  | "anthropic"
  | "xai"
  | "google"
  | "mistral"
  | "deepseek"
  | "groq"
  | "openrouter"
  | "ollama"
  | "custom";

/**
 * Provider configuration
 */
export interface ProviderConfig {
  id: AgentProvider;
  name: string;
  /** Placeholder text for model input */
  modelPlaceholder: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  /** Default base URL for providers that need one */
  defaultBaseUrl?: string;
  /** Help text or documentation link */
  helpText?: string;
}

/**
 * Per-provider API key storage
 */
export interface ProviderApiKeys {
  openai?: string;
  anthropic?: string;
  xai?: string;
  google?: string;
  mistral?: string;
  deepseek?: string;
  groq?: string;
  openrouter?: string;
  custom?: string;
}

/**
 * Available providers with their configurations
 */
export const AGENT_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    modelPlaceholder: "gpt-4o, gpt-4o-mini, o1, o3-mini...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from platform.openai.com",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    modelPlaceholder: "claude-sonnet-4-0, claude-opus-4-0, claude-3-5-haiku...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from console.anthropic.com",
  },
  {
    id: "xai",
    name: "xAI Grok",
    modelPlaceholder: "grok-4, grok-3, grok-3-mini-fast...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from console.x.ai",
  },
  {
    id: "google",
    name: "Google Gemini",
    modelPlaceholder: "gemini-2.0-flash, gemini-1.5-pro...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from aistudio.google.com",
  },
  {
    id: "mistral",
    name: "Mistral",
    modelPlaceholder: "mistral-large-latest, pixtral-large...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from console.mistral.ai",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    modelPlaceholder: "deepseek-chat, deepseek-reasoner...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from platform.deepseek.com",
  },
  {
    id: "groq",
    name: "Groq",
    modelPlaceholder: "llama-3.3-70b-versatile, mixtral-8x7b...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Get your API key from console.groq.com",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    modelPlaceholder: "anthropic/claude-3.5-sonnet, openai/gpt-4o...",
    requiresApiKey: true,
    requiresBaseUrl: false,
    helpText: "Meta-provider for 100+ models. Get key from openrouter.ai",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    modelPlaceholder: "llama3.2, mistral, deepseek-coder...",
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: "http://localhost:11434",
    helpText: "Run models locally. Install from ollama.com",
  },
  {
    id: "custom",
    name: "Custom OpenAI-Compatible",
    modelPlaceholder: "Enter model name...",
    requiresApiKey: true,
    requiresBaseUrl: true,
    helpText: "Works with any OpenAI-compatible API endpoint",
  },
];

// =============================================================================
// Embedding Provider Types
// =============================================================================

/**
 * Supported embedding providers
 */
export type EmbeddingProvider = 'openai' | 'google' | 'mistral' | 'cohere' | 'ollama';

/**
 * Embedding model configuration
 */
export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  provider: EmbeddingProvider;
}

/**
 * Embedding provider configuration
 */
export interface EmbeddingProviderConfig {
  id: EmbeddingProvider;
  name: string;
  requiresApiKey: boolean;
  /** Uses the same API key as the chat provider */
  usesSharedApiKey: boolean;
}

/**
 * Available embedding providers
 */
export const EMBEDDING_PROVIDERS: EmbeddingProviderConfig[] = [
  { id: 'openai', name: 'OpenAI', requiresApiKey: true, usesSharedApiKey: true },
  { id: 'google', name: 'Google', requiresApiKey: true, usesSharedApiKey: true },
  { id: 'mistral', name: 'Mistral', requiresApiKey: true, usesSharedApiKey: true },
  { id: 'cohere', name: 'Cohere', requiresApiKey: true, usesSharedApiKey: false },
  { id: 'ollama', name: 'Ollama (Local)', requiresApiKey: false, usesSharedApiKey: false },
];

/**
 * Available embedding models by provider
 */
export const EMBEDDING_MODELS: EmbeddingModel[] = [
  // OpenAI
  { id: 'text-embedding-3-large', name: 'text-embedding-3-large', dimensions: 3072, provider: 'openai' },
  { id: 'text-embedding-3-small', name: 'text-embedding-3-small', dimensions: 1536, provider: 'openai' },
  { id: 'text-embedding-ada-002', name: 'text-embedding-ada-002', dimensions: 1536, provider: 'openai' },
  // Google
  { id: 'gemini-embedding-001', name: 'gemini-embedding-001', dimensions: 3072, provider: 'google' },
  { id: 'text-embedding-004', name: 'text-embedding-004', dimensions: 768, provider: 'google' },
  // Mistral
  { id: 'mistral-embed', name: 'mistral-embed', dimensions: 1024, provider: 'mistral' },
  // Cohere
  { id: 'embed-english-v3.0', name: 'embed-english-v3.0', dimensions: 1024, provider: 'cohere' },
  { id: 'embed-multilingual-v3.0', name: 'embed-multilingual-v3.0', dimensions: 1024, provider: 'cohere' },
  { id: 'embed-english-light-v3.0', name: 'embed-english-light-v3.0', dimensions: 384, provider: 'cohere' },
];

// =============================================================================
// Command Approval Types
// =============================================================================

/**
 * Command approval mode
 */
export type ApprovalMode = "always" | "whitelist" | "yolo";

/**
 * Status of a pending command
 */
export type CommandStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

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
export type SearchProvider = "tavily" | "searxng" | "none";

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
 * Memory scope determines portability across machines
 * - global: Portable across all machines (solutions, knowledge, behaviors, technician preferences)
 * - machine: Specific to the current machine (system state, local context)
 * 
 * This is critical for computer repair technicians who use the tool on multiple client machines.
 * Global memories travel with the USB drive, while machine memories are only relevant locally.
 */
export type MemoryScope = "global" | "machine";

/**
 * Get the default scope for a memory type
 * - System memories are machine-specific
 * - Solutions, knowledge, behaviors, instructions, facts are global/portable
 * - Conversations and summaries default to machine (can be overridden)
 */
export function getDefaultScopeForType(type: MemoryType): MemoryScope {
  switch (type) {
    case "system":
    case "conversation":
    case "summary":
      return "machine";
    // Solutions, knowledge, behaviors, instructions, facts are portable
    default:
      return "global";
  }
}

/**
 * Human-readable labels for memory scopes
 */
export const MEMORY_SCOPE_LABELS: Record<MemoryScope, string> = {
  global: "Global (Portable)",
  machine: "This Machine Only",
};

/**
 * Descriptions for memory scopes
 */
export const MEMORY_SCOPE_DESCRIPTIONS: Record<MemoryScope, string> = {
  global: "Travels with you to other machines - solutions, knowledge, and preferences",
  machine: "Specific to this computer - system info and local context",
};

/**
 * Types of memories the agent can store
 * - fact: User-provided facts and information
 * - solution: Successful problem solutions
 * - conversation: Conversation fragments and context
 * - instruction: Behavioral instructions for the agent
 * - behavior: Agent behavior adjustments
 * - knowledge: Knowledge base documents (RAG)
 * - summary: Conversation summaries for context compression
 * - system: System state snapshots (computer info the agent learns)
 */
export type MemoryType = 
  | "fact" 
  | "solution" 
  | "conversation" 
  | "instruction" 
  | "behavior"
  | "knowledge"
  | "summary"
  | "system";

/**
 * Human-readable labels for memory types
 */
export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  fact: "Fact",
  solution: "Solution",
  conversation: "Conversation",
  instruction: "Instruction",
  behavior: "Behavior",
  knowledge: "Knowledge",
  summary: "Summary",
  system: "System",
};

/**
 * Descriptions for memory types
 */
export const MEMORY_TYPE_DESCRIPTIONS: Record<MemoryType, string> = {
  fact: "User-provided facts and information",
  solution: "Successful problem solutions",
  conversation: "Conversation fragments and context",
  instruction: "Behavioral instructions for the agent",
  behavior: "Agent behavior adjustments",
  knowledge: "Knowledge base documents (RAG)",
  summary: "Conversation summaries for context compression",
  system: "System state snapshots",
};

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
  /** Importance score (0-100) for memory prioritization */
  importance: number;
  /** Number of times this memory has been accessed */
  accessCount: number;
  /** Last time this memory was accessed */
  lastAccessed?: string;
  /** Source conversation ID for linking memories to conversations */
  sourceConversationId?: string;
  /** Memory scope: global (portable) or machine (local) */
  scope: MemoryScope;
  /** Machine identifier for machine-scoped memories */
  machineId?: string;
}

/**
 * Metadata attached to a memory entry
 */
export interface MemoryMetadata {
  tags?: string[];
  source?: string;
  relevanceScore?: number;
  /** Whether this memory is from the knowledge base */
  isKnowledgeBase?: boolean;
  /** Chunk index for knowledge base entries */
  chunkIndex?: number;
  /** Total chunks for knowledge base entries */
  totalChunks?: number;
  /** Problem description for solution memories */
  problem?: string;
  /** Command that solved the problem */
  solutionCommand?: string;
  /** Conversation ID this summary is for */
  summarizedConversationId?: string;
  /** Message range this summary covers */
  messageRange?: { start: number; end: number };
  [key: string]: unknown;
}

/**
 * Memory search result with similarity score
 */
export interface MemorySearchResult extends Memory {
  similarity: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalCount: number;
  byType: Record<string, number>;
  totalSizeBytes: number;
}

// =============================================================================
// Conversation Types
// =============================================================================

/**
 * A saved agent conversation
 */
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A message within a conversation (serialized CoreMessage content)
 */
export interface ConversationMessage {
  id: string;
  conversationId: string;
  /** Role: "user", "assistant", or "tool" */
  role: string;
  /** JSON-serialized message content */
  content: string;
  createdAt: string;
}

/**
 * Conversation with its messages
 */
export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
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
  apiKeys: ProviderApiKeys;  // Per-provider API key storage
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
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  /** Cohere API key (if using Cohere for embeddings) */
  cohereApiKey?: string;

  // System prompt customization
  systemPrompt?: string;

  // Agent Zero-like Memory Features
  /** Auto-save successful solutions to memory */
  autoMemorySolutions: boolean;
  /** Automatically extract facts from conversations */
  autoExtractFacts: boolean;
  /** Enable conversation summarization for context compression */
  contextCompressionEnabled: boolean;
  /** Message count before compressing conversation context */
  contextCompressionThreshold: number;
  /** Automatically inject relevant knowledge base entries on each message */
  autoRagEnabled: boolean;
  /** Number of days to retain memories (0 = forever) */
  memoryRetentionDays: number;
  /** Maximum number of memories to inject into context */
  maxContextMemories: number;

  // MCP Server Settings
  /** Whether the MCP HTTP server is enabled */
  mcpServerEnabled: boolean;
  /** API key for MCP server authentication (auto-generated) */
  mcpApiKey?: string;
  /** Port for the MCP HTTP server */
  mcpPort: number;
}

/**
 * Default agent settings
 */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKeys: {},
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
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  cohereApiKey: undefined,
  systemPrompt: undefined,
  // Agent Zero-like Memory Features
  autoMemorySolutions: true,
  autoExtractFacts: false,
  contextCompressionEnabled: false,
  contextCompressionThreshold: 20,
  autoRagEnabled: true,
  memoryRetentionDays: 0,
  maxContextMemories: 5,
  // MCP Server Settings
  mcpServerEnabled: false,
  mcpApiKey: undefined,
  mcpPort: 8377,
};


// =============================================================================
// Chat Types
// =============================================================================

/**
 * Role of a message in conversation
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

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
// Parts-Based Message Types (AI SDK Compatible)
// =============================================================================

/**
 * Text content part
 */
export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * Tool call part - represents a tool invocation by the AI
 */
export interface ToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: AgentToolName;
  args: Record<string, unknown>;
  /** State of the tool call */
  state: 'pending' | 'running' | 'complete' | 'error';
}

/**
 * Tool result part - represents the result of a tool execution
 */
export interface ToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: AgentToolName;
  result: {
    status: 'success' | 'error';
    output?: string;
    error?: string;
  };
}

/**
 * Union of all message part types
 */
export type MessagePart = TextPart | ToolCallPart | ToolResultPart;

/**
 * Parts-based agent message (compatible with AI SDK UIMessage pattern)
 * This is the new recommended message format
 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Raw text content (for backward compatibility) */
  content: string;
  /** Structured parts of the message */
  parts: MessagePart[];
  /** Timestamp */
  createdAt: string;
  /** Activities for UI display (derived from tool parts) */
  activities?: import('./agent-activity').AgentActivity[];
}

/**
 * Helper to check if a message has pending HITL tool calls
 */
export function hasPendingToolCalls(message: AgentMessage): boolean {
  return message.parts.some(
    part => part.type === 'tool-call' && part.state === 'pending'
  );
}

/**
 * Helper to get all tool call parts from a message
 */
export function getToolCallParts(message: AgentMessage): ToolCallPart[] {
  return message.parts.filter(
    (part): part is ToolCallPart => part.type === 'tool-call'
  );
}

/**
 * Helper to get text content from a message
 */
export function getTextContent(message: AgentMessage): string {
  return message.parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('');
}

// =============================================================================
// Agent State
// =============================================================================

/**
 * Current state of the agent
 */
export type AgentState = "idle" | "thinking" | "executing" | "waiting_approval";

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
// File System Types
// =============================================================================

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface Instrument {
  name: string;
  description: string;
  path: string;
  extension: string;
}

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Names of available agent tools
 */
export type AgentToolName =
  | "execute_command"
  | "search_web"
  | "save_to_memory"
  | "recall_memory"
  | "list_programs"
  | "list_instruments"
  | "run_instrument"
  | "read_file"
  | "write_file"
  | "list_dir"
  | "move_file"
  | "copy_file";

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



