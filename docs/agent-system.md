# Agent System Documentation

The Agent tab provides an agentic AI assistant with human-in-the-loop command execution, persistent memory, and web search capabilities. Inspired by Agent Zero, it features smart memory management, auto-solution saving, context compression, and behavior learning.

**Designed for Computer Repair Technicians**: The memory system is portable-first, distinguishing between knowledge that travels with you (solutions, preferences) and information specific to the current client's machine (system state, diagnostics).

## Overview

The Agent is a conversational AI that can:
- Execute shell commands (with approval)
- Search the web for solutions
- Remember information across sessions using vector embeddings
- **Portable memory** - Solutions and knowledge travel with your USB drive
- **Machine-specific context** - System state stays tied to each client's computer
- Access CLI tools in the programs folder
- Read and write files
- Automatically save successful solutions
- Extract and remember facts from conversations
- Adjust its own behavior based on feedback
- Compress conversation context for long discussions
- Query knowledge base documents

**Architecture**: Frontend (React + Vercel AI SDK) ↔ Tauri Commands (Rust) ↔ System

## Key Files

| File | Purpose |
|------|---------|
| `src/pages/AgentPage.tsx` | Main chat interface and state management |
| `src/components/agent/ChatMessage.tsx` | Message rendering with tool call display |
| `src/components/agent/CommandApproval.tsx` | Pending command approval UI |
| `src/components/agent/MemoryBrowser.tsx` | Memory dashboard with edit, bulk delete, stats |
| `src/components/agent/KnowledgeBase.tsx` | Document upload for RAG |
| `src/components/agent/BehaviorSettings.tsx` | Behavior rules management |
| `src/lib/agent-tools.ts` | Vercel AI SDK tool definitions |
| `src/lib/agent-memory.ts` | Memory utilities and context injection |
| `src/types/agent.ts` | TypeScript type definitions |
| `src-tauri/src/commands/agent.rs` | Rust backend commands |
| `src-tauri/src/types/agent.rs` | Rust type definitions |

---

## Memory System (Agent Zero-Inspired)

### Portable Memory Design

Since RustService is designed for computer repair technicians who run the tool on multiple client machines, the memory system distinguishes between:

| Scope | Description | Use Case |
|-------|-------------|----------|
| **Global** | Travels with you on USB | Solutions, knowledge, technician preferences, behaviors |
| **Machine** | Stays with current computer | System state, diagnostics, local conversation context |

When you plug your USB into a new client's computer:
- ✅ Your learned solutions, knowledge base, and preferences are available
- ✅ You can recall fixes that worked on other machines
- ❌ You won't see system info from other clients (privacy + relevance)
- ❌ Old conversation context stays with the machine it was about

### Memory Types

| Type | Default Scope | Purpose |
|------|---------------|---------|
| `fact` | **Global** | User-provided information (names, API keys, technician preferences) |
| `solution` | **Global** | Successful solutions from past interactions (portable!) |
| `knowledge` | **Global** | Knowledge base documents (RAG) |
| `behavior` | **Global** | Agent behavior adjustments and personality rules |
| `instruction` | **Global** | Behavioral rules and user instructions |
| `conversation` | Machine | Context fragments from chats (about current computer) |
| `summary` | Machine | Conversation summaries for context compression |
| `system` | Machine | System state snapshots (this computer's info) |

### Memory Metadata

Each memory can include:
- `importance` (0-100): Priority score for retrieval
- `accessCount`: How often the memory has been used
- `lastAccessed`: Timestamp of last access
- `sourceConversationId`: Link to originating conversation
- `tags`: Array of categorization tags
- `scope`: "global" or "machine" (portability)
- `machineId`: Computer name (for machine-scoped memories)

### Smart Memory Features

#### Auto-Solution Memorization
When enabled, the agent automatically saves successful fixes:
1. Agent runs a command to fix an issue
2. If the command succeeds (exit code 0)
3. The problem + solution is saved as a `solution` memory
4. Future similar issues can recall this solution

#### Auto-Fact Extraction
Extract key facts from conversations:
- User preferences and requirements
- System information mentioned
- Important context for future reference

#### System State Learning
When the agent runs system info commands:
- Results are saved as `system` memories
- Future queries can recall without re-running commands
- Reduces need for repeated diagnostic commands

### Storage

- **Location**: `data/agent/memory.db` (SQLite database)
- **Schema**: Enhanced with importance, access tracking, embeddings, scope
- **Vector Search**: Cosine similarity for semantic search
- **Portability**: Single file, copies with USB drive
- **Machine ID**: Uses computer name (COMPUTERNAME env var) to identify machines
- **Scope Filtering**: Queries automatically filter machine-scoped memories to current computer

---

## Tauri Command Reference

### Command Execution

| Command | Parameters | Description |
|---------|------------|-------------|
| `queue_agent_command` | `command`, `reason` | Queue a command for approval |
| `execute_agent_command` | `command`, `reason` | Execute directly (bypasses approval) |
| `get_pending_commands` | - | Get all pending commands |
| `approve_command` | `command_id` | Approve and execute command |
| `reject_command` | `command_id` | Reject a pending command |
| `get_command_history` | `limit?` | Get executed command history |

### Memory Operations

| Command | Parameters | Description |
|---------|------------|-------------|
| `save_memory` | `memory_type`, `content`, `metadata?`, `embedding?`, `importance?`, `source_conversation_id?`, `scope?` | Save to memory (scope: "global" or "machine") |
| `search_memories` | `query`, `memory_type?`, `limit?` | Search memories by content (auto-filters by scope) |
| `search_memories_vector` | `embedding`, `memory_type?`, `limit?` | Semantic search by vector (auto-filters by scope) |
| `get_all_memories` | `memory_type?`, `limit?` | Get all memories (auto-filters by scope) |
| `update_memory` | `memory_id`, `content?`, `metadata?`, `importance?` | Update existing memory |
| `delete_memory` | `memory_id` | Delete a memory |
| `bulk_delete_memories` | `memory_ids` | Delete multiple memories |
| `clear_all_memories` | - | Clear all memories |
| `get_memory_stats` | - | Get memory statistics |
| `increment_memory_access` | `memory_id` | Track memory usage |
| `get_recent_memories` | `limit?` | Get recently accessed memories (auto-filters by scope) |
| `get_machine_id` | - | Get current computer's identifier |

### Search

| Command | Parameters | Description |
|---------|------------|-------------|
| `search_tavily` | `query`, `api_key` | Search via Tavily API |
| `search_searxng` | `query`, `instance_url` | Search via SearXNG instance |

### Files & Programs

| Command | Parameters | Description |
|---------|------------|-------------|
| `agent_read_file` | `path` | Read file contents |
| `agent_write_file` | `path`, `content` | Write file contents |
| `agent_list_dir` | `path` | List directory contents |
| `agent_move_file` | `src`, `dest` | Move/rename file |
| `agent_copy_file` | `src`, `dest` | Copy file |
| `list_agent_programs` | - | List programs in data/programs/ |
| `list_instruments` | - | List custom scripts in data/instruments/ |

### Conversations

| Command | Parameters | Description |
|---------|------------|-------------|
| `create_conversation` | `title?` | Create new conversation |
| `list_conversations` | `limit?` | List all conversations |
| `get_conversation` | `conversation_id` | Get conversation with messages |
| `save_conversation_messages` | `conversation_id`, `messages` | Save messages to conversation |
| `update_conversation_title` | `conversation_id`, `title` | Update conversation title |
| `delete_conversation` | `conversation_id` | Delete conversation |

---

## AI SDK Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `execute_command` | Queue shell command (HITL) |
| `search_web` | Search web via Tavily/SearXNG |
| `read_file` | Read file contents |
| `write_file` | Write to file (HITL) |
| `list_dir` | List directory contents |
| `move_file` | Move/rename file (HITL) |
| `copy_file` | Copy file (HITL) |
| `list_programs` | List available CLI tools |
| `list_instruments` | List custom scripts |
| `run_instrument` | Run a custom instrument |

### Memory Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `save_to_memory` | Configurable | Save information to memory (can specify scope) |
| `recall_memory` | Auto-filtered | Search through saved memories |
| `save_solution` | **Global** | Save a successful solution (portable!) |
| `query_knowledge` | **Global** | Search knowledge base |
| `get_system_context` | **Machine** | Get stored system info (this computer only) |
| `save_system_state` | **Machine** | Save system information (this computer) |
| `extract_facts` | **Global** | Extract and save facts from conversation |
| `save_conversation_context` | **Machine** | Save conversation fragment |
| `summarize_conversation` | **Machine** | Save conversation summary |
| `get_context` | Auto-filtered | Get relevant context for current topic |

### Behavior Tools

| Tool | Description |
|------|-------------|
| `adjust_behavior` | Modify agent behavior rules |
| `get_behaviors` | Get active behavior rules |

---

## Settings

### Agent Settings

```json
{
  "agent": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKeys": { "openai": "sk-..." },
    "approvalMode": "always",
    "whitelistedCommands": ["^ipconfig", "^ping "],
    "searchProvider": "tavily",
    "tavilyApiKey": "tvly-...",
    "memoryEnabled": true,
    "embeddingProvider": "openai",
    "embeddingModel": "text-embedding-3-small",
    "autoMemorySolutions": true,
    "autoExtractFacts": false,
    "contextCompressionEnabled": false,
    "contextCompressionThreshold": 20,
    "autoRagEnabled": true,
    "memoryRetentionDays": 0,
    "maxContextMemories": 5
  }
}
```

### Smart Memory Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `autoMemorySolutions` | `true` | Auto-save successful fixes |
| `autoExtractFacts` | `false` | Extract facts from conversations |
| `contextCompressionEnabled` | `false` | Enable conversation summarization |
| `contextCompressionThreshold` | `20` | Messages before compressing |
| `autoRagEnabled` | `true` | Auto-inject knowledge on messages |
| `memoryRetentionDays` | `0` | Days to keep memories (0 = forever) |
| `maxContextMemories` | `5` | Max memories to inject per response |

---

## Command Approval System

### Approval Modes

| Mode | Behavior |
|------|----------|
| `always` | Every command requires manual approval (default, safest) |
| `whitelist` | Commands matching whitelist patterns auto-execute |
| `yolo` | All commands auto-execute (⚠️ dangerous) |

### Whitelist Patterns

Patterns are regex strings. Examples:
```typescript
whitelistedCommands: [
  '^ipconfig',        // Commands starting with "ipconfig"
  '^ping ',           // Commands starting with "ping "
  '^systeminfo$',     // Exact match "systeminfo"
]
```

---

## Knowledge Base (RAG)

### Uploading Documents

1. Navigate to Agent → Knowledge tab
2. Drag and drop files or click to upload
3. Supported formats: `.txt`, `.md`, `.json`, `.csv`, `.xml`, `.log`, `.yaml`, `.html`
4. Documents are chunked and embedded for semantic search

### Chunking Strategy

- Smart paragraph-aware chunking
- Respects semantic boundaries (sentences, paragraphs)
- Configurable chunk size with overlap
- Prevents context loss at chunk boundaries

### Auto-RAG Injection

When enabled (`autoRagEnabled: true`):
1. On each user message, knowledge base is searched
2. Relevant chunks are injected into context
3. Agent uses this information in responses

---

## Behavior System

### Managing Behaviors

- Access via Agent → Behavior tab
- Add rules to guide agent personality and responses
- Rules are stored as `behavior` type memories
- High importance rules take priority

### Agent Self-Adjustment

The agent can adjust its own behavior using `adjust_behavior` tool:
- Learns from user feedback
- Remembers preferences
- Corrects repeated mistakes

### Behavior Injection

Active behaviors are automatically:
- Injected into system prompt
- Prioritized by importance score
- Applied to all responses

---

## Database Schema

### memories table

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  metadata TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  importance INTEGER DEFAULT 50,
  access_count INTEGER DEFAULT 0,
  last_accessed TEXT,
  source_conversation_id TEXT,
  scope TEXT DEFAULT 'global',    -- 'global' or 'machine'
  machine_id TEXT                  -- Computer name for machine-scoped memories
)
```

### command_history table

```sql
CREATE TABLE command_history (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  output TEXT,
  error TEXT,
  created_at TEXT NOT NULL
)
```

### conversations table

```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

### conversation_messages table

```sql
CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

---

## ⚠️ Critical: Tauri Parameter Naming

**Tauri does NOT auto-convert between camelCase and snake_case.**

When calling Tauri commands from TypeScript, use **snake_case** parameter names:

```typescript
// ❌ WRONG
await invoke('approve_command', { commandId: id });

// ✅ CORRECT
await invoke('approve_command', { command_id: id });
```

---

## Troubleshooting

### Commands fail silently
Check that frontend invoke calls use **snake_case** parameter names.

### Memory not persisting
1. Check that `data/agent/memory.db` exists
2. Check `memoryEnabled` is true in settings
3. Check file permissions on data folder

### Search not working
Configure search provider in Settings → Agent:
- **Tavily**: Set API key from [tavily.com](https://tavily.com)
- **SearXNG**: Set instance URL of your SearXNG deployment

### Auto-solution not saving
Check that `autoMemorySolutions` is enabled in Settings → Agent → Smart Memory.

### Knowledge base not being used
1. Check that documents are uploaded in Agent → Knowledge tab
2. Verify `autoRagEnabled` is true in settings
3. Ensure embeddings are configured correctly

### System info not recalled on different machine
This is expected! System memories are machine-scoped. They're only visible on the computer they were recorded on. This prevents confusion between different clients' computers.

### Solutions not showing on new machine
Check that solutions were saved with global scope. New solutions should automatically use global scope. If you have old solutions from before the scope system, they default to global and should still work.

---

## Security Considerations

1. **Never use YOLO mode** on untrusted systems
2. **Review commands** before approving - the AI can make mistakes
3. **Whitelist carefully** - regex patterns can match more than expected
4. **API keys** are stored in settings.json (consider encryption)
5. **Commands run as the app user** - they have your permissions
6. **Memory contains sensitive data** - protect the data folder
7. **Machine-scoped memories provide client privacy** - System info from one client won't leak to another
8. **The memory database travels with USB** - All memories (global and machine) are in the same file, but machine-scoped queries are filtered by computer name
