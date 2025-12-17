/**
 * Agent Tools for Vercel AI SDK
 * 
 * Defines the tools available to the AI agent for system operations,
 * memory management, and web search.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { PendingCommand, Memory, SearchResult } from '@/types/agent';

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Execute a shell command
 * This tool queues commands for approval based on settings
 */
export const executeCommandTool = tool({
  description: 'Execute a PowerShell or Command Prompt command on the system. Use this to run diagnostics, fix issues, or gather system information. Commands may require user approval.',
  parameters: z.object({
    command: z.string().describe('The command to execute (PowerShell syntax)'),
    reason: z.string().describe('Brief explanation of why this command is needed'),
  }),
  execute: async ({ command, reason }) => {
    try {
      const result = await invoke<PendingCommand>('queue_agent_command', {
        command,
        reason,
      });
      
      if (result.status === 'pending') {
        return {
          status: 'pending_approval',
          message: `Command queued for approval: ${command}`,
          commandId: result.id,
        };
      } else if (result.status === 'executed') {
        return {
          status: 'success',
          output: result.output,
          error: result.error,
        };
      } else if (result.status === 'failed') {
        return {
          status: 'failed',
          output: result.output,
          error: result.error,
        };
      }
      
      return result;
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Search the web for information
 */
export const searchWebTool = tool({
  description: 'Search the web for information about errors, solutions, or technical documentation. Use this to find fixes for problems.',
  parameters: z.object({
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
 * Save information to memory
 */
export const saveToMemoryTool = tool({
  description: 'Save important information to memory for future reference. Use this to remember solutions, facts, or instructions.',
  parameters: z.object({
    type: z.enum(['fact', 'solution', 'conversation', 'instruction']).describe('Type of memory'),
    content: z.string().describe('The content to remember'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
  }),
  execute: async ({ type, content, tags }) => {
    try {
      const memory = await invoke<Memory>('save_memory', {
        memory_type: type,
        content,
        metadata: tags ? { tags } : undefined,
        embedding: undefined, // Embeddings generated on frontend if needed
      });
      
      return {
        status: 'success',
        memoryId: memory.id,
        message: `Saved ${type} to memory`,
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
 * Recall information from memory
 */
export const recallMemoryTool = tool({
  description: 'Search through saved memories to recall relevant information. Use this to find past solutions or facts.',
  parameters: z.object({
    query: z.string().describe('What to search for in memories'),
    type: z.enum(['fact', 'solution', 'conversation', 'instruction']).optional().describe('Filter by memory type'),
    limit: z.number().optional().describe('Maximum number of results'),
  }),
  execute: async ({ query, type, limit = 5 }) => {
    try {
      const memories = await invoke<Memory[]>('search_memories', {
        query,
        memory_type: type,
        limit,
      });
      
      return {
        status: 'success',
        memories: memories.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          createdAt: m.createdAt,
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
  parameters: z.object({}),
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
  parameters: z.object({
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
 * Write to a file
 */
export const writeFileTool = tool({
  description: 'Write content to a file. Use this to create or modify configuration files, scripts, etc. This may require approval.',
  parameters: z.object({
    path: z.string().describe('Full path to the file'),
    content: z.string().describe('Content to write'),
  }),
  execute: async ({ path, content }) => {
    try {
      await invoke('agent_write_file', { path, content });
      
      return {
        status: 'success',
        message: `Successfully wrote to ${path}`,
      };
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
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
  save_to_memory: saveToMemoryTool,
  recall_memory: recallMemoryTool,
  list_programs: listProgramsTool,
  read_file: readFileTool,
  write_file: writeFileTool,
};

/**
 * Get tools based on what's enabled in settings
 */
export function getEnabledTools(settings: {
  searchProvider: string;
  memoryEnabled: boolean;
}) {
  const tools: Record<string, typeof executeCommandTool> = {
    execute_command: executeCommandTool,
    list_programs: listProgramsTool,
    read_file: readFileTool,
    write_file: writeFileTool,
  };

  // Add search if configured
  if (settings.searchProvider !== 'none') {
    tools.search_web = searchWebTool;
  }

  // Add memory tools if enabled
  if (settings.memoryEnabled) {
    tools.save_to_memory = saveToMemoryTool;
    tools.recall_memory = recallMemoryTool;
  }

  return tools;
}

