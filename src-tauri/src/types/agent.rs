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

/// Types of memories the agent can store
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    Fact,
    Solution,
    Conversation,
    Instruction,
}

impl Default for MemoryType {
    fn default() -> Self {
        Self::Fact
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
}

/// Memory search result with similarity score
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySearchResult {
    #[serde(flatten)]
    pub memory: Memory,
    pub similarity: f64,
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
