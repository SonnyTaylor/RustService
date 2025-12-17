# Agent System Documentation

The Agent tab provides an agentic AI assistant with human-in-the-loop command execution, persistent memory, and web search capabilities. Inspired by Agent Zero, it enables the AI to help fix computer issues while maintaining user control.

## Overview

The Agent is a conversational AI that can:
- Execute shell commands (with approval)
- Search the web for solutions
- Remember information across sessions
- Access CLI tools in the programs folder
- Read and write files

**Architecture**: Frontend (React + Vercel AI SDK) ↔ Tauri Commands (Rust) ↔ System

## Key Files

| File | Purpose |
|------|---------|
| `src/pages/AgentPage.tsx` | Main chat interface and state management |
| `src/components/agent/ChatMessage.tsx` | Message rendering with tool call display |
| `src/components/agent/CommandApproval.tsx` | Pending command approval UI |
| `src/components/agent/MemoryBrowser.tsx` | Memory viewing and search |
| `src/lib/agent-tools.ts` | Vercel AI SDK tool definitions |
| `src/types/agent.ts` | TypeScript type definitions |
| `src-tauri/src/commands/agent.rs` | Rust backend commands |
| `src-tauri/src/types/agent.rs` | Rust type definitions |

## Tauri Command Reference

### Command Execution

| Command | Parameters | Description |
|---------|------------|-------------|
| `queue_agent_command` | `command`, `reason` | Queue a command for approval |
| `get_pending_commands` | - | Get all pending commands |
| `approve_command` | `command_id` | Approve and execute command |
| `reject_command` | `command_id` | Reject a pending command |
| `get_command_history` | `limit?` | Get executed command history |

### Memory System

| Command | Parameters | Description |
|---------|------------|-------------|
| `save_memory` | `memory_type`, `content`, `metadata?`, `embedding?` | Save to memory |
| `search_memories` | `query`, `memory_type?`, `limit?` | Search memories by content |
| `get_all_memories` | `memory_type?`, `limit?` | Get all memories |
| `delete_memory` | `memory_id` | Delete a memory |
| `clear_all_memories` | - | Clear all memories |

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
| `list_agent_programs` | - | List programs in data/programs/ |

### Settings

| Command | Parameters | Description |
|---------|------------|-------------|
| `get_agent_settings` | - | Get agent configuration |

---

## ⚠️ Critical: Tauri Parameter Naming Convention

**Tauri does NOT automatically convert between JavaScript camelCase and Rust snake_case for command parameters.**

When calling Tauri commands from TypeScript/JavaScript, you **MUST** use snake_case parameter names to match the Rust function signature.

### ❌ Wrong (will fail silently or with undefined values)

```typescript
// Frontend - INCORRECT
const result = await invoke('approve_command', {
  commandId: command.id,  // ❌ camelCase won't match Rust
});
```

### ✅ Correct

```typescript
// Frontend - CORRECT
const result = await invoke('approve_command', {
  command_id: command.id,  // ✅ snake_case matches Rust parameter
});
```

### Rust Function Signature Reference

```rust
// The parameter name IS the key you must use in invoke()
#[tauri::command]
pub fn approve_command(command_id: String) -> Result<PendingCommand, String>
                       ^^^^^^^^^^
                       // Use this exact name in frontend invoke calls
```

### All Agent Command Parameters

| Command | Frontend Parameter Names (snake_case) |
|---------|--------------------------------------|
| `queue_agent_command` | `command`, `reason` |
| `approve_command` | `command_id` |
| `reject_command` | `command_id` |
| `save_memory` | `memory_type`, `content`, `metadata`, `embedding` |
| `search_memories` | `query`, `memory_type`, `limit` |
| `get_all_memories` | `memory_type`, `limit` |
| `delete_memory` | `memory_id` |
| `search_tavily` | `query`, `api_key` |
| `search_searxng` | `query`, `instance_url` |
| `agent_read_file` | `path` |
| `agent_write_file` | `path`, `content` |
| `get_command_history` | `limit` |

---

## Command Approval System

### Approval Modes

| Mode | Behavior |
|------|----------|
| `always` | Every command requires manual approval (default, safest) |
| `whitelist` | Commands matching whitelist patterns auto-execute, others need approval |
| `yolo` | All commands auto-execute (⚠️ dangerous, use with caution) |

### Whitelist Patterns

Patterns are regex strings. Examples:
```typescript
whitelistedCommands: [
  '^ipconfig',        // Commands starting with "ipconfig"
  '^ping ',           // Commands starting with "ping "
  '^systeminfo$',     // Exact match "systeminfo"
  '^tasklist$',       // Exact match "tasklist"
]
```

### Flow

1. AI decides to run a command
2. `queue_agent_command` is called
3. Backend checks approval mode:
   - **YOLO mode**: Execute immediately
   - **Whitelist mode**: Check pattern match, execute if match, queue if not
   - **Always mode**: Queue for approval
4. If queued, command appears in `CommandApprovalPanel`
5. User approves or rejects
6. On approval, command executes and result returns

### Frontend Usage

```tsx
import { CommandApprovalPanel } from '@/components/agent/CommandApproval';

<CommandApprovalPanel
  pendingCommands={pendingCommands}
  onCommandApproved={(result) => {
    // Handle approved command result
    console.log('Output:', result.output);
  }}
  onCommandRejected={(result) => {
    // Handle rejection
  }}
/>
```

---

## Memory System

### Memory Types

| Type | Purpose |
|------|---------|
| `fact` | User-provided information (names, API keys, preferences) |
| `solution` | Successful solutions from past interactions |
| `conversation` | Context fragments from chats |
| `instruction` | Behavioral rules and user instructions |

### Storage

- **Location**: `data/agent.db` (SQLite database)
- **Schema**: `memories` table with id, type, content, metadata, timestamps
- **Portability**: Single file, copies with USB drive

### Frontend Usage

```tsx
import { invoke } from '@tauri-apps/api/core';

// Save a memory
await invoke('save_memory', {
  memory_type: 'solution',
  content: 'To fix DNS issues, run: ipconfig /flushdns',
  metadata: { tags: ['networking', 'dns'] },
});

// Search memories
const memories = await invoke('search_memories', {
  query: 'dns issues',
  memory_type: 'solution',  // optional filter
  limit: 10,
});

// Get all memories of a type
const facts = await invoke('get_all_memories', {
  memory_type: 'fact',
  limit: 100,
});
```

---

## Vercel AI SDK Tools

The agent uses Vercel AI SDK tools defined in `src/lib/agent-tools.ts`:

### Available Tools

| Tool | Description |
|------|-------------|
| `executeCommandTool` | Queue shell command for execution |
| `searchWebTool` | Search web via Tavily/SearXNG |
| `saveToMemoryTool` | Save information to memory |
| `recallMemoryTool` | Search through saved memories |
| `listProgramsTool` | List available CLI tools |
| `readFileTool` | Read file contents |
| `writeFileTool` | Write content to file |

### Tool Definition Pattern

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';

export const myTool = tool({
  description: 'Description for the AI',
  parameters: z.object({
    param1: z.string().describe('What this parameter is for'),
    param2: z.number().optional(),
  }),
  execute: async ({ param1, param2 }) => {
    try {
      const result = await invoke('my_tauri_command', {
        param_1: param1,  // Remember: snake_case for Tauri!
        param_2: param2,
      });
      return { status: 'success', data: result };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});
```

---

## Settings

Settings are stored in `data/settings.json` under the `agent` key:

```json
{
  "agent": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "sk-...",
    "approvalMode": "always",
    "whitelistedCommands": ["^ipconfig", "^ping "],
    "searchProvider": "tavily",
    "tavilyApiKey": "tvly-...",
    "memoryEnabled": true,
    "embeddingModel": "text-embedding-3-small"
  }
}
```

### Provider Options

| Provider | Requirements |
|----------|--------------|
| `openai` | API key |
| `anthropic` | API key |
| `ollama` | Base URL (local) |
| `custom` | API key + Base URL (OpenAI-compatible) |

### Settings UI Location

**Settings → Agent** panel contains all configuration options.

---

## Adding New Agent Tools

1. **Define Rust Command** in `src-tauri/src/commands/agent.rs`:
   ```rust
   #[tauri::command]
   pub fn my_new_tool(some_param: String) -> Result<MyResult, String> {
       // Implementation
   }
   ```

2. **Register in** `src-tauri/src/lib.rs`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       // ... existing commands
       commands::my_new_tool,
   ])
   ```

3. **Add TypeScript Type** if needed in `src/types/agent.ts`

4. **Create AI SDK Tool** in `src/lib/agent-tools.ts`:
   ```typescript
   export const myNewTool = tool({
     description: 'Tool description for the AI',
     parameters: z.object({ /* ... */ }),
     execute: async (args) => {
       // Call Tauri command with snake_case params
     },
   });
   ```

5. **Register Tool** in `AgentPage.tsx` tools array

---

## Database Schema

The agent uses SQLite (`data/agent.db`) with these tables:

### memories

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 'fact', 'solution', 'conversation', 'instruction'
  content TEXT NOT NULL,
  metadata TEXT,             -- JSON
  embedding BLOB,            -- Vector embedding (optional)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

### command_history

```sql
CREATE TABLE command_history (
  id TEXT PRIMARY KEY,
  command TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,      -- 'pending', 'approved', 'rejected', 'executed', 'failed'
  output TEXT,
  error TEXT,
  created_at TEXT NOT NULL
)
```

---

## Troubleshooting

### Commands fail silently

Check that frontend invoke calls use **snake_case** parameter names.

### Commands always pending

Check approval mode in Settings → Agent. If set to `always`, all commands queue.

### Search not working

Configure search provider in Settings → Agent:
- **Tavily**: Set API key from [tavily.com](https://tavily.com)
- **SearXNG**: Set instance URL of your SearXNG deployment

### Memory not persisting

1. Check that `data/agent.db` exists
2. Check `memoryEnabled` is true in settings
3. Check file permissions on data folder

---

## Security Considerations

1. **Never use YOLO mode** on untrusted systems
2. **Review commands** before approving - the AI can make mistakes
3. **Whitelist carefully** - regex patterns can match more than expected
4. **API keys** are stored in plaintext in settings.json
5. **Commands run as the app user** - they have your permissions

