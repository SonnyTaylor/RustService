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

    // ==========================================================================
    // MCP Client Settings (connecting to external servers)
    // ==========================================================================
    /// External MCP servers the agent can connect to for additional tools
    #[serde(default)]
    pub mcp_servers: Vec<MCPServerConfig>,
}

/// Transport type for MCP server connections
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum MCPTransportType {
    #[default]
    Sse,
    Http,
}

/// Configuration for an external MCP server the agent connects to
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServerConfig {
    /// Unique identifier
    pub id: String,
    /// Display name
    pub name: String,
    /// Server URL
    pub url: String,
    /// Transport type (sse or http)
    #[serde(default)]
    pub transport_type: MCPTransportType,
    /// Whether this server is enabled
    #[serde(default)]
    pub enabled: bool,
    /// Optional API key for authentication
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Optional custom headers
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,
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
            // MCP Client Settings
            mcp_servers: Vec::new(),
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

// =============================================================================
// File Attachment Types
// =============================================================================

/// Categories of files for specialized handling
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileCategory {
    Text,
    Code,
    Document,
    Image,
    Media,
    Binary,
}

impl FileCategory {
    /// Get category from MIME type
    pub fn from_mime_type(mime_type: &str) -> Self {
        if mime_type.starts_with("text/") {
            return Self::Text;
        }
        if mime_type.starts_with("image/") {
            return Self::Image;
        }
        if mime_type.starts_with("audio/") || mime_type.starts_with("video/") {
            return Self::Media;
        }

        let code_types = [
            "application/javascript",
            "application/json",
            "application/xml",
            "application/x-python-code",
            "application/x-sh",
        ];
        if code_types.contains(&mime_type) || mime_type.contains("script") {
            return Self::Code;
        }

        let doc_types = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats",
        ];
        if doc_types.iter().any(|t| mime_type.contains(t)) {
            return Self::Document;
        }

        Self::Binary
    }

    /// Get category from file extension
    pub fn from_extension(filename: &str) -> Self {
        let ext = filename.split('.').last().unwrap_or("").to_lowercase();

        let code_exts = [
            "js", "ts", "jsx", "tsx", "py", "rs", "java", "cpp", "c", "h", "hpp", "go", "rb",
            "php", "swift", "kt", "scala", "r", "m", "mm", "cs", "vb", "fs", "hs", "lua", "pl",
            "sh", "bash", "zsh", "fish", "ps1", "cmd", "bat", "sql", "html", "css", "scss", "sass",
            "less", "xml", "yaml", "yml", "toml", "ini", "conf", "config", "json", "md",
            "markdown",
        ];
        if code_exts.contains(&ext.as_str()) {
            return Self::Code;
        }

        let image_exts = [
            "png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tiff", "raw",
        ];
        if image_exts.contains(&ext.as_str()) {
            return Self::Image;
        }

        let media_exts = [
            "mp3", "mp4", "wav", "avi", "mov", "mkv", "flv", "wmv", "webm", "ogg", "ogv",
        ];
        if media_exts.contains(&ext.as_str()) {
            return Self::Media;
        }

        let doc_exts = [
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt",
        ];
        if doc_exts.contains(&ext.as_str()) {
            return Self::Document;
        }

        Self::Binary
    }

    /// Check if this category should have content auto-extracted
    pub fn should_auto_extract(&self) -> bool {
        matches!(self, Self::Text | Self::Code)
    }
}

/// Source of a file attachment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileSource {
    Upload,
    Generated,
    Filesystem,
}

/// Unified file attachment metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAttachment {
    pub id: String,
    pub source: FileSource,
    pub original_name: String,
    pub stored_name: String,
    pub mime_type: String,
    pub category: FileCategory,
    pub size: u64,
    pub stored_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_count: Option<u32>,
    pub checksum: String,
    pub uploaded_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(flatten)]
    pub metadata: FileAttachmentMetadata,
}

/// Source-specific metadata for file attachments
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAttachmentMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_metadata: Option<UploadMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generation_metadata: Option<GenerationMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filesystem_metadata: Option<FilesystemMetadata>,
}

impl Default for FileAttachmentMetadata {
    fn default() -> Self {
        Self {
            upload_metadata: None,
            generation_metadata: None,
            filesystem_metadata: None,
        }
    }
}

/// Metadata for user-uploaded files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadMetadata {
    pub uploaded_by: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_path: Option<String>,
    pub auto_extracted: bool,
}

/// Metadata for agent-generated files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationMetadata {
    pub generated_by: String,
    pub description: String,
    pub tool_call_id: String,
    pub approved: bool,
}

/// Metadata for filesystem-referenced files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemMetadata {
    pub original_path: String,
    pub accessed_at: String,
    pub auto_read: bool,
}

/// File upload request from frontend
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileUploadRequest {
    pub file_name: String,
    pub mime_type: String,
    pub size: u64,
    pub content_base64: String,
}

/// File chunk upload request for large files
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChunkRequest {
    pub upload_id: String,
    pub chunk_index: u32,
    pub total_chunks: u32,
    pub content_base64: String,
}

/// Status of a chunked upload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkUploadStatus {
    pub upload_id: String,
    pub chunks_received: Vec<u32>,
    pub chunks_total: u32,
    pub bytes_received: u64,
    pub bytes_total: u64,
    pub complete: bool,
}

/// File generation request from agent
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileGenerationRequest {
    pub filename: String,
    pub content: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

/// Result of validating a filesystem path
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathValidationResult {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sanitized_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub within_sandbox: bool,
}

/// Request to read a file from the filesystem
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesystemReadRequest {
    pub path: String,
    #[serde(default)]
    pub auto_extract: bool,
    #[serde(default)]
    pub max_size: Option<u64>,
}

/// File size limits (in bytes)
pub const FILE_SIZE_SMALL: u64 = 10 * 1024 * 1024; // 10 MB
pub const FILE_SIZE_LARGE: u64 = 100 * 1024 * 1024; // 100 MB
pub const FILE_SIZE_HUGE: u64 = 1024 * 1024 * 1024; // 1 GB
pub const CHUNK_SIZE: usize = 1024 * 1024; // 1 MB
pub const MAX_CONTENT_EXTRACTION_SIZE: usize = 100 * 1024; // 100 KB

/// Helper to format file size for display
pub fn format_file_size(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".to_string();
    }
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let k = 1024_f64;
    let i = (bytes as f64).log(k).floor() as usize;
    let size = bytes as f64 / k.powi(i as i32);
    format!("{:.2} {}", size, UNITS[i.min(UNITS.len() - 1)])
}

/// Helper to compute SHA-256 checksum
pub fn compute_checksum(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}
