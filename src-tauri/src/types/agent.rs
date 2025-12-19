//! Agent system types
//!
//! Types for the agentic AI system including settings, memory, and command execution.

use serde::{Deserialize, Serialize};

// =============================================================================
// Provider Types
// =============================================================================

/// Supported AI providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentProvider {
    OpenAI,
    Anthropic,
    #[serde(rename = "xai")]
    XAI,
    Google,
    Mistral,
    DeepSeek,
    Groq,
    OpenRouter,
    Ollama,
    Custom,
}

impl Default for AgentProvider {
    fn default() -> Self {
        Self::OpenAI
    }
}

/// Per-provider API key storage
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderApiKeys {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub openai: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anthropic: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xai: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub google: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mistral: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deepseek: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub groq: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub openrouter: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom: Option<String>,
}

// =============================================================================
// Command Approval Types
// =============================================================================

/// Command approval mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalMode {
    Always,
    Whitelist,
    Yolo,
}

impl Default for ApprovalMode {
    fn default() -> Self {
        Self::Always
    }
}

/// Status of a pending command
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CommandStatus {
    Pending,
    Approved,
    Rejected,
    Executed,
    Failed,
}

impl Default for CommandStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// A command awaiting user approval
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCommand {
    pub id: String,
    pub command: String,
    pub reason: String,
    pub created_at: String,
    pub status: CommandStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// =============================================================================
// Search Types
// =============================================================================

/// Search provider options
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SearchProvider {
    Tavily,
    Searxng,
    None,
}

impl Default for SearchProvider {
    fn default() -> Self {
        Self::None
    }
}

/// Search result from web search
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

// =============================================================================
// Memory Types
// =============================================================================

/// Memory scope determines portability across machines
/// - Global: Portable knowledge that works on any machine (solutions, knowledge, behaviors)
/// - Machine: Specific to the current machine (system state, local context)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MemoryScope {
    /// Portable across all machines - for solutions, knowledge, technician preferences
    #[default]
    Global,
    /// Specific to the current machine - for system state, local diagnostics
    Machine,
}

impl MemoryScope {
    /// Convert from string to MemoryScope
    pub fn from_str(s: &str) -> Self {
        match s {
            "machine" => MemoryScope::Machine,
            _ => MemoryScope::Global, // Default to global for portability
        }
    }

    /// Convert to string
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryScope::Global => "global",
            MemoryScope::Machine => "machine",
        }
    }

    /// Get the default scope for a memory type
    /// - System memories are machine-specific
    /// - Solutions, knowledge, behaviors, instructions, facts are global/portable
    /// - Conversations and summaries default to machine (can be overridden)
    pub fn default_for_type(memory_type: &MemoryType) -> Self {
        match memory_type {
            MemoryType::System => MemoryScope::Machine,
            MemoryType::Conversation => MemoryScope::Machine,
            MemoryType::Summary => MemoryScope::Machine,
            // Solutions, knowledge, behaviors, instructions, facts are portable
            _ => MemoryScope::Global,
        }
    }
}

/// Types of memories the agent can store
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    /// User-provided facts and information
    Fact,
    /// Successful problem solutions
    Solution,
    /// Conversation fragments and context
    Conversation,
    /// Behavioral instructions for the agent
    Instruction,
    /// Agent behavior adjustments
    Behavior,
    /// Knowledge base documents (RAG)
    Knowledge,
    /// Conversation summaries for context compression
    Summary,
    /// System state snapshots (computer info the agent learns)
    System,
}

impl Default for MemoryType {
    fn default() -> Self {
        Self::Fact
    }
}

impl MemoryType {
    /// Convert from string to MemoryType
    pub fn from_str(s: &str) -> Self {
        match s {
            "fact" => MemoryType::Fact,
            "solution" => MemoryType::Solution,
            "conversation" => MemoryType::Conversation,
            "instruction" => MemoryType::Instruction,
            "behavior" => MemoryType::Behavior,
            "knowledge" => MemoryType::Knowledge,
            "summary" => MemoryType::Summary,
            "system" => MemoryType::System,
            _ => MemoryType::Fact,
        }
    }

    /// Convert to string
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryType::Fact => "fact",
            MemoryType::Solution => "solution",
            MemoryType::Conversation => "conversation",
            MemoryType::Instruction => "instruction",
            MemoryType::Behavior => "behavior",
            MemoryType::Knowledge => "knowledge",
            MemoryType::Summary => "summary",
            MemoryType::System => "system",
        }
    }
}

/// A memory entry stored in the database
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    #[serde(rename = "type")]
    pub memory_type: MemoryType,
    pub content: String,
    pub metadata: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    /// Importance score (0-100) for memory prioritization
    #[serde(default)]
    pub importance: i32,
    /// Number of times this memory has been accessed
    #[serde(default)]
    pub access_count: i32,
    /// Last time this memory was accessed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_accessed: Option<String>,
    /// Source conversation ID for linking memories to conversations
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_conversation_id: Option<String>,
    /// Memory scope: global (portable) or machine (local)
    #[serde(default)]
    pub scope: MemoryScope,
    /// Machine identifier for machine-scoped memories
    /// Only set when scope is Machine, used for filtering
    #[serde(skip_serializing_if = "Option::is_none")]
    pub machine_id: Option<String>,
}

/// Memory search result with similarity score
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySearchResult {
    #[serde(flatten)]
    pub memory: Memory,
    pub similarity: f64,
}

/// Memory statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStats {
    pub total_count: i64,
    pub by_type: std::collections::HashMap<String, i64>,
    pub total_size_bytes: i64,
}

// =============================================================================
// Conversation Types
// =============================================================================

/// A saved agent conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

/// A message within a conversation (serialized CoreMessage content)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub id: String,
    pub conversation_id: String,
    /// Role: "user", "assistant", or "tool"
    pub role: String,
    /// JSON-serialized message content
    pub content: String,
    pub created_at: String,
}

/// Conversation with its messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationWithMessages {
    #[serde(flatten)]
    pub conversation: Conversation,
    pub messages: Vec<ConversationMessage>,
}

// =============================================================================
// Agent Settings
// =============================================================================

/// Supported embedding providers
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum EmbeddingProvider {
    #[default]
    OpenAI,
    Google,
    Mistral,
    Cohere,
    Ollama,
}

/// Agent configuration settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    /// AI provider to use
    #[serde(default)]
    pub provider: AgentProvider,

    /// Model name/identifier
    #[serde(default = "default_model")]
    pub model: String,

    /// Per-provider API key storage
    #[serde(default)]
    pub api_keys: ProviderApiKeys,

    /// Base URL for custom/Ollama providers
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,

    /// Command approval mode
    #[serde(default)]
    pub approval_mode: ApprovalMode,

    /// Whitelisted command patterns (regex)
    #[serde(default = "default_whitelist")]
    pub whitelisted_commands: Vec<String>,

    /// Search provider to use
    #[serde(default)]
    pub search_provider: SearchProvider,

    /// Tavily API key
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tavily_api_key: Option<String>,

    /// SearXNG instance URL
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub searxng_url: Option<String>,

    /// Whether memory is enabled
    #[serde(default = "default_memory_enabled")]
    pub memory_enabled: bool,

    /// Embedding provider to use
    #[serde(default)]
    pub embedding_provider: EmbeddingProvider,

    /// Embedding model to use
    #[serde(default = "default_embedding_model")]
    pub embedding_model: String,

    /// Cohere API key (if using Cohere for embeddings)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cohere_api_key: Option<String>,

    /// Custom system prompt
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,

    // ==========================================================================
    // Agent Zero-like Memory Features
    // ==========================================================================
    /// Auto-save successful solutions to memory
    #[serde(default = "default_true")]
    pub auto_memory_solutions: bool,

    /// Automatically extract facts from conversations
    #[serde(default)]
    pub auto_extract_facts: bool,

    /// Enable conversation summarization for context compression
    #[serde(default)]
    pub context_compression_enabled: bool,

    /// Message count before compressing conversation context
    #[serde(default = "default_compression_threshold")]
    pub context_compression_threshold: i32,

    /// Automatically inject relevant knowledge base entries on each message
    #[serde(default = "default_true")]
    pub auto_rag_enabled: bool,

    /// Number of days to retain memories (0 = forever)
    #[serde(default)]
    pub memory_retention_days: i32,

    /// Maximum number of memories to inject into context
    #[serde(default = "default_max_context_memories")]
    pub max_context_memories: i32,

    // ==========================================================================
    // MCP Server Settings
    // ==========================================================================
    /// Whether the MCP HTTP server is enabled
    #[serde(default)]
    pub mcp_server_enabled: bool,

    /// API key for MCP server authentication (auto-generated)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_api_key: Option<String>,

    /// Port for the MCP HTTP server
    #[serde(default = "default_mcp_port")]
    pub mcp_port: u16,
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_whitelist() -> Vec<String> {
    vec![
        "^ipconfig".to_string(),
        "^ping ".to_string(),
        "^systeminfo$".to_string(),
        "^tasklist$".to_string(),
        "^hostname$".to_string(),
        "^whoami$".to_string(),
    ]
}

fn default_memory_enabled() -> bool {
    true
}

fn default_embedding_model() -> String {
    "text-embedding-3-small".to_string()
}

fn default_true() -> bool {
    true
}

fn default_compression_threshold() -> i32 {
    20
}

fn default_max_context_memories() -> i32 {
    5
}

fn default_mcp_port() -> u16 {
    8377
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider: AgentProvider::default(),
            model: default_model(),
            api_keys: ProviderApiKeys::default(),
            base_url: None,
            approval_mode: ApprovalMode::default(),
            whitelisted_commands: default_whitelist(),
            search_provider: SearchProvider::default(),
            tavily_api_key: None,
            searxng_url: None,
            memory_enabled: default_memory_enabled(),
            embedding_provider: EmbeddingProvider::default(),
            embedding_model: default_embedding_model(),
            cohere_api_key: None,
            system_prompt: None,
            // Agent Zero-like Memory Features
            auto_memory_solutions: true,
            auto_extract_facts: false,
            context_compression_enabled: false,
            context_compression_threshold: default_compression_threshold(),
            auto_rag_enabled: true,
            memory_retention_days: 0,
            max_context_memories: default_max_context_memories(),
            // MCP Server Settings
            mcp_server_enabled: false,
            mcp_api_key: None,
            mcp_port: default_mcp_port(),
        }
    }
}

// =============================================================================
// Tool Execution Types
// =============================================================================

/// Tool execution response from backend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecutionResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub requires_approval: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_command_id: Option<String>,
}

/// Command execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandExecutionResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Represents a custom instrument script
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instrument {
    pub name: String,
    pub description: String,
    pub path: String,
    pub extension: String,
}
