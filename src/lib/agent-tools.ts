/**
 * Agent Tools for Vercel AI SDK
 * 
 * Defines the tools available to the AI agent for system operations
 * and web search.
 * 
 * Tools without an execute function are "client-side" HITL tools -
 * they will be rendered on the frontend for user interaction/approval.
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { SearchResult, FileEntry, Instrument, Memory } from '@/types/agent';

// =============================================================================
// Common Output Schemas
// =============================================================================

/** Command execution result schema */
const commandResultSchema = z.object({
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
});

/** File operation result schema */
const fileResultSchema = z.object({
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
  path: z.string().optional(),
});

// =============================================================================
// HITL Tool Schemas (Client-Side Tools - No Execute Function)
// =============================================================================

/**
 * Execute a shell command
 * This is a client-side HITL (Human-in-the-Loop) tool.
 * The frontend will render approval UI and handle execution.
 * No execute function = tool call is forwarded to client.
 */
export const executeCommandTool = tool({
  description: 'Execute a PowerShell or Command Prompt command on the system. Use this tool when the user asks you to run commands, diagnose issues, or gather system information. The user will need to approve the command before it runs.',
  inputSchema: z.object({
    command: z.string().describe('The PowerShell command to execute'),
    reason: z.string().describe('Brief explanation of why this command is needed'),
  }),
  outputSchema: commandResultSchema,
  // No execute function - this is a client-side HITL tool
  // The frontend renders approval UI and calls the backend when approved
});

/**
 * Write to a file
 * This is a client-side HITL tool - requires user approval.
 */
export const writeFileTool = tool({
  description: 'Write content to a file. Use this to create or modify configuration files, scripts, etc. The user will need to approve this action.',
  inputSchema: z.object({
    path: z.string().describe('Full path to the file'),
    content: z.string().describe('Content to write'),
  }),
  outputSchema: fileResultSchema,
  // No execute function - this is a client-side HITL tool
});

// =============================================================================
// Server-Side Tools (With Execute Functions)
// =============================================================================

/**
 * Search the web for information
 */
export const searchWebTool = tool({
  description: 'Search the web for information about errors, solutions, or technical documentation. Use this to find fixes for problems.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    provider: z.enum(['tavily', 'searxng']).optional().describe('Search provider to use'),
  }),
  execute: async ({ query, provider = 'tavily' }) => {
    try {
      // Get settings to get API keys
      const settings = await invoke<{ agent: { tavilyApiKey?: string; searxngUrl?: string } }>('get_settings');
      
      let results: SearchResult[];
      
      if (provider === 'tavily' && settings.agent.tavilyApiKey) {
        results = await invoke<SearchResult[]>('search_tavily', {
          query,
          api_key: settings.agent.tavilyApiKey,
        });
      } else if (provider === 'searxng' && settings.agent.searxngUrl) {
        results = await invoke<SearchResult[]>('search_searxng', {
          query,
          instance_url: settings.agent.searxngUrl,
        });
      } else {
        return {
          status: 'error',
          error: 'No search provider configured. Please set up Tavily or SearXNG in settings.',
        };
      }
      
      return {
        status: 'success',
        results: results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
      };
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * List available CLI programs
 */
export const listProgramsTool = tool({
  description: 'List all available CLI tools and programs in the programs folder. Use this to see what tools are available.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const programs = await invoke<Array<Record<string, string>>>('list_agent_programs');
      
      return {
        status: 'success',
        programs: programs.map(p => ({
          name: p.name,
          path: p.path,
          executables: p.executables,
        })),
      };
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Read a file's contents
 */
export const readFileTool = tool({
  description: 'Read the contents of a file. Use this to examine configuration files, logs, or other text files.',
  inputSchema: z.object({
    path: z.string().describe('Full path to the file'),
  }),
  execute: async ({ path }) => {
    try {
      const content = await invoke<string>('agent_read_file', { path });
      
      return {
        status: 'success',
        content,
      };
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * List files in a directory
 */
export const listDirTool = tool({
  description: 'List files and directories in a specific path. Use this to explore the file system.',
  inputSchema: z.object({
    path: z.string().describe('Path to list content for'),
  }),
  execute: async ({ path }) => {
    try {
      const entries = await invoke<FileEntry[]>('agent_list_dir', { path });
      return {
        status: 'success',
        entries: entries.map(e => ({
          name: e.name,
          path: e.path,
          type: e.is_dir ? 'dir' : 'file',
          size: e.size
        }))
      };
    } catch (error) {
        return { status: 'error', error: String(error) };
    }
  }
});

/**
 * Move a file
 * Client-side HITL tool
 */
export const moveFileTool = tool({
  description: 'Move or rename a file. Requires user approval.',
  inputSchema: z.object({
    src: z.string().describe('Source path'),
    dest: z.string().describe('Destination path'),
  }),
  outputSchema: z.object({
    status: z.enum(['success', 'error']),
    output: z.string().optional(),
    error: z.string().optional(),
    src: z.string().optional(),
    dest: z.string().optional(),
  }),
  // No execute function - HITL tool
});

/**
 * Copy a file
 * Client-side HITL tool
 */
export const copyFileTool = tool({
  description: 'Copy a file. Requires user approval.',
  inputSchema: z.object({
    src: z.string().describe('Source path'),
    dest: z.string().describe('Destination path'),
  }),
  outputSchema: z.object({
    status: z.enum(['success', 'error']),
    output: z.string().optional(),
    error: z.string().optional(),
    src: z.string().optional(),
    dest: z.string().optional(),
  }),
  // No execute function - HITL tool
});

/**
 * List available instruments (custom scripts)
 */
export const listInstrumentsTool = tool({
  description: 'List available custom instruments (scripts) that can be run.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const instruments = await invoke<Instrument[]>('list_instruments');
      return {
        status: 'success',
        instruments: instruments.map(i => ({
            name: i.name,
            description: i.description,
            extension: i.extension
        }))
      };
    } catch (error) {
        return { status: 'error', error: String(error) };
    }
  }
});

/**
 * Run an instrument
 */
export const runInstrumentTool = tool({
  description: 'Run a specific instrument by name. This looks up the path and executes it.',
  inputSchema: z.object({
    name: z.string().describe('Name of the instrument to run'),
    args: z.string().optional().describe('Arguments to pass to the instrument'),
  }),
  execute: async ({ name, args }) => {
    try {
        // First find the instrument
        const instruments = await invoke<Instrument[]>('list_instruments');
        const instrument = instruments.find(i => i.name.toLowerCase() === name.toLowerCase());
        
        if (!instrument) {
            return { status: 'error', error: `Instrument '${name}' not found.` };
        }

        // Construct command based on extension
        let command = '';
        if (instrument.extension === 'ps1') {
            command = `powershell -ExecutionPolicy Bypass -File "${instrument.path}" ${args || ''}`;
        } else if (['bat', 'cmd', 'exe'].includes(instrument.extension)) {
            command = `"${instrument.path}" ${args || ''}`;
        } else if (instrument.extension === 'py') {
            command = `python "${instrument.path}" ${args || ''}`;
        } else if (instrument.extension === 'js') {
            command = `node "${instrument.path}" ${args || ''}`;
        }

        const result = await invoke<{id: string, status: string, output?: string}>('queue_agent_command', {
            command,
            reason: `Running instrument: ${name}`
        });

        if (result.status === 'executed') {
            return { status: 'success', output: result.output || 'Executed successfully' };
        } else {
            return { status: 'pending', commandId: result.id, message: 'Waiting for approval' };
        }

    } catch (error) {
        return { status: 'error', error: String(error) };
    }
  }
});

// =============================================================================
// Memory Tools (Server-Side)
// =============================================================================

/**
 * Save information to memory for future recall
 */
export const saveToMemoryTool = tool({
  description: 'Save important information to memory for future recall. Use this to remember facts about the user, solutions to problems, system states, or behavioral rules. Memory persists across conversations.',
  inputSchema: z.object({
    content: z.string().describe('The information to save'),
    memory_type: z.enum(['fact', 'solution', 'system', 'instruction', 'knowledge']).describe(
      'Type of memory: fact (user info), solution (fix for a problem), system (system state info), instruction (behavioral rule), knowledge (general knowledge)'
    ),
    importance: z.number().min(0).max(100).default(70).describe('How important this memory is (0-100)'),
  }),
  execute: async ({ content, memory_type, importance }) => {
    try {
      const memory = await invoke<Memory>('save_memory', {
        memory_type,
        content,
        metadata: { source: 'agent-tool' },
        importance,
      });
      return { status: 'success', memoryId: memory.id, message: `Saved ${memory_type} memory` };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }
});

/**
 * Recall information from memory using semantic search
 */
export const recallMemoryTool = tool({
  description: 'Search your memory for relevant information. Use this when you need to recall previously saved facts, solutions, instructions, or system info. Useful before running commands to check if you already know the answer.',
  inputSchema: z.object({
    query: z.string().describe('What to search for in memory'),
    memory_type: z.enum(['fact', 'solution', 'system', 'instruction', 'knowledge', 'behavior', 'all']).optional().describe(
      'Filter by memory type, or "all" to search everything'
    ),
    limit: z.number().min(1).max(20).default(5).describe('Maximum number of results'),
  }),
  execute: async ({ query, memory_type, limit }) => {
    try {
      const typeFilter = memory_type === 'all' ? undefined : memory_type;
      const memories = await invoke<Memory[]>('search_memories', {
        query,
        memory_type: typeFilter,
        limit: limit || 5,
      });
      
      if (memories.length === 0) {
        return { status: 'success', results: [], message: 'No matching memories found' };
      }

      return {
        status: 'success',
        results: memories.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          importance: m.importance,
          createdAt: m.createdAt,
        })),
        message: `Found ${memories.length} matching memories`,
      };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  }
});

// =============================================================================
// Tool Collection
// =============================================================================

/**
 * All available agent tools
 */
export const agentTools = {
  execute_command: executeCommandTool,
  search_web: searchWebTool,
  list_programs: listProgramsTool,
  list_instruments: listInstrumentsTool,
  run_instrument: runInstrumentTool,
  read_file: readFileTool,
  write_file: writeFileTool,
  list_dir: listDirTool,
  move_file: moveFileTool,
  copy_file: copyFileTool,
  save_to_memory: saveToMemoryTool,
  recall_memory: recallMemoryTool,
} satisfies ToolSet;

/**
 * Names of tools that require human-in-the-loop approval (no execute function)
 */
export const HITL_TOOLS = ['execute_command', 'write_file', 'move_file', 'copy_file'] as const;

/**
 * Check if a tool name is a HITL tool (has no server-side execute function)
 */
export function isHITLTool(toolName: string): boolean {
  return HITL_TOOLS.includes(toolName as typeof HITL_TOOLS[number]);
}

/**
 * Check if a tool actually requires user approval based on tool type and approval mode.
 * - YOLO mode: never require approval (execute immediately)
 * - Whitelist mode: require approval only if command doesn't match whitelist (handled backend)
 * - Always mode: always require approval for HITL tools
 */
export function shouldRequireApproval(toolName: string, approvalMode: string): boolean {
  // Not a HITL tool - no approval needed
  if (!isHITLTool(toolName)) {
    return false;
  }
  
  // YOLO mode - never require frontend approval
  if (approvalMode === 'yolo') {
    return false;
  }
  
  // For 'always' and 'whitelist' modes, the frontend shows approval UI
  // (In whitelist mode, the backend will auto-execute if whitelisted)
  return true;
}

/**
 * Get tools based on what's enabled in settings
 */
export function getEnabledTools(settings: {
  searchProvider: string;
  memoryEnabled?: boolean;
}): ToolSet {
  const tools: ToolSet = {
    execute_command: executeCommandTool,
    list_programs: listProgramsTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    list_dir: listDirTool,
    move_file: moveFileTool,
    copy_file: copyFileTool,
    list_instruments: listInstrumentsTool,
    run_instrument: runInstrumentTool,
    save_to_memory: saveToMemoryTool,
    recall_memory: recallMemoryTool,
  };

  // Add search if configured
  if (settings.searchProvider !== 'none') {
    tools.search_web = searchWebTool;
  }

  return tools;
}
