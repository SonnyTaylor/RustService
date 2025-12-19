/**
 * Agent Tools for Vercel AI SDK
 * 
 * Defines the tools available to the AI agent for system operations,
 * memory management, and web search.
 * 
 * Tools without an execute function are "client-side" HITL tools -
 * they will be rendered on the frontend for user interaction/approval.
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { Memory, MemoryScope, SearchResult, FileEntry, Instrument } from '@/types/agent';
import { getDefaultScopeForType } from '@/types/agent';
import { 
  generateEmbedding, 
  saveSolution, 
  saveSystemState,
  getRelevantKnowledge,
  getRelevantContext,
  saveBehavior,
  getActiveBehaviors,
  saveExtractedFacts,
  saveConversationFragment,
  saveConversationSummary,
  getContextInjection,
  getCurrentMachineId,
  type ExtractedFact,
} from './agent-memory';

// =============================================================================
// Common Output Schemas
// =============================================================================

/** Standard result schema for tool outputs */
const toolResultSchema = z.object({
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
});

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
 * Save information to memory
 * 
 * Scope determines portability:
 * - global: Travels with technician across machines (solutions, knowledge, preferences)
 * - machine: Specific to current computer (system state, local context)
 */
export const saveToMemoryTool = tool({
  description: 'Save important information to memory for future reference. Use this to remember solutions, facts, or instructions. Specify scope: "global" for portable knowledge that works on any machine, "machine" for info specific to the current computer.',
  inputSchema: z.object({
    type: z.enum(['fact', 'solution', 'conversation', 'instruction']).describe('Type of memory'),
    content: z.string().describe('The content to remember'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    scope: z.enum(['global', 'machine']).optional().describe('Memory scope: "global" for portable knowledge (default for most types), "machine" for current computer only'),
  }),
  execute: async ({ type, content, tags, scope }) => {
    try {
      // Generate embedding for "Agent Zero" RAG
      const embedding = await generateEmbedding(content);

      // Use provided scope or default based on type
      const memoryScope = scope || getDefaultScopeForType(type as 'fact' | 'solution' | 'conversation' | 'instruction');

      const memory = await invoke<Memory>('save_memory', {
        memory_type: type,
        content,
        metadata: tags ? { tags } : undefined,
        embedding: embedding.length > 0 ? embedding : undefined,
        scope: memoryScope,
      });
      
      return {
        status: 'success',
        memoryId: memory.id,
        message: `Saved ${type} to memory (${memoryScope} scope)`,
        scope: memoryScope,
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
  inputSchema: z.object({
    query: z.string().describe('What to search for in memories'),
    type: z.enum(['fact', 'solution', 'conversation', 'instruction']).optional().describe('Filter by memory type'),
    limit: z.number().optional().describe('Maximum number of results'),
  }),
  execute: async ({ query, type, limit = 5 }) => {
    try {
      // Try semantic search if embedding generation works
      const embedding = await generateEmbedding(query);
      let memories: Memory[];

      if (embedding.length > 0) {
        memories = await invoke<Memory[]>('search_memories_vector', {
          embedding,
          limit,
        });
        // Client-side filter for type if needed (imperfect but functional)
        if (type) {
            memories = memories.filter(m => m.type === type);
        }
      } else {
        // Fallback to keyword search
        memories = await invoke<Memory[]>('search_memories', {
            query,
            memory_type: type,
            limit,
        });
      }
      
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
 * Wraps execute_command but validates against instrument list first? 
 * Actually, let's just use executeCommandTool for now but finding the path via listAlgorithms is better step.
 * But we can make a specific tool for it.
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

        // Queue it!
        // Wait, tools with execute functions run immediately server side usually, 
        // OR we can make this a HITL tool wrapper.
        // But `queue_agent_command` handles whitelist/approval logic in backend.
        // So we can just call `queue_agent_command` here and return the pending ID.
        
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
// Agent Zero-like Memory Tools
// =============================================================================

/**
 * Save a solution after successfully fixing a problem
 * This tool should be called when a command succeeds in fixing an issue
 * Solutions are saved with GLOBAL scope (portable across machines)
 */
export const saveSolutionTool = tool({
  description: 'Save a successful solution to memory for future reference. Call this after a command successfully fixes a problem. This helps remember what worked for similar issues. Solutions are saved with GLOBAL scope so they can be recalled on other machines too.',
  inputSchema: z.object({
    problem: z.string().describe('Description of the problem that was fixed'),
    solution: z.string().describe('The command or action that fixed the problem'),
    exitCode: z.number().describe('Exit code of the successful command (0 = success)'),
    output: z.string().optional().describe('Output from the successful command'),
    tags: z.array(z.string()).optional().describe('Tags for categorization (e.g., network, disk, performance)'),
  }),
  execute: async ({ problem, solution, exitCode, output, tags }) => {
    try {
      const memory = await saveSolution({
        problem,
        solution,
        exitCode,
        output,
        tags,
      });
      
      if (memory) {
        return {
          status: 'success',
          memoryId: memory.id,
          message: 'Solution saved to memory for future reference (global scope - portable across machines)',
          scope: 'global',
        };
      } else {
        return {
          status: 'skipped',
          message: 'Auto-solution memorization is disabled in settings',
        };
      }
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Query the knowledge base for relevant information
 * Uses semantic search to find related documents
 */
export const queryKnowledgeTool = tool({
  description: 'Search the knowledge base for relevant documentation and information. Use this to find solutions, procedures, or reference material.',
  inputSchema: z.object({
    query: z.string().describe('What to search for in the knowledge base'),
    limit: z.number().optional().describe('Maximum number of results (default 5)'),
  }),
  execute: async ({ query, limit = 5 }) => {
    try {
      const knowledge = await getRelevantKnowledge(query, limit);
      
      return {
        status: 'success',
        results: knowledge.map(k => ({
          id: k.id,
          content: k.content,
          source: k.metadata?.source,
          importance: k.importance,
        })),
        count: knowledge.length,
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
 * Get system context from stored memories
 * Retrieves previously learned system information for the CURRENT machine only
 */
export const getSystemContextTool = tool({
  description: 'Get stored system information for THIS COMPUTER from memory. Use this to recall previously learned system specs, network config, or other system state without running commands again. Note: This only returns info stored on the current machine, not from other computers.',
  inputSchema: z.object({
    query: z.string().describe('What system information to look for (e.g., "network config", "disk space", "installed software")'),
    limit: z.number().optional().describe('Maximum number of results'),
  }),
  execute: async ({ query, limit = 3 }) => {
    try {
      const machineId = await getCurrentMachineId();
      const context = await getRelevantContext(query, ['system'], limit);
      
      if (context.length === 0) {
        return {
          status: 'not_found',
          message: `No stored system information found for this machine (${machineId}). You may need to run commands to gather this information.`,
          machineId,
        };
      }
      
      return {
        status: 'success',
        machineId,
        results: context.map(c => ({
          id: c.id,
          content: c.content,
          lastUpdated: c.updatedAt,
          accessCount: c.accessCount,
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
 * Save system state information for future reference
 * System state is saved with MACHINE scope (only visible on this computer)
 */
export const saveSystemStateTool = tool({
  description: 'Save system information for THIS COMPUTER to memory. Use this after running diagnostic commands to remember system specs, network config, etc. This info is stored with machine scope and will only be retrieved when running on this same computer.',
  inputSchema: z.object({
    category: z.string().describe('Category of info (network, hardware, software, disk, memory, etc.)'),
    info: z.string().describe('The system information to save'),
    command: z.string().optional().describe('The command that was used to get this info'),
  }),
  execute: async ({ category, info, command }) => {
    try {
      const machineId = await getCurrentMachineId();
      const memory = await saveSystemState({
        category,
        info,
        command,
      });
      
      if (memory) {
        return {
          status: 'success',
          memoryId: memory.id,
          message: `Saved ${category} information to memory (machine: ${machineId})`,
          scope: 'machine',
          machineId,
        };
      } else {
        return {
          status: 'error',
          error: 'Failed to save system state',
        };
      }
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Adjust agent behavior based on feedback or learning
 */
export const adjustBehaviorTool = tool({
  description: 'Adjust your own behavior based on user feedback or learning. Use this to remember preferences, correct mistakes, or improve responses.',
  inputSchema: z.object({
    rule: z.string().describe('The behavioral rule to add (e.g., "Always ask before modifying system files")'),
    reason: z.string().describe('Why this rule should be followed'),
  }),
  execute: async ({ rule, reason }) => {
    try {
      const memory = await saveBehavior(rule, reason);
      
      if (memory) {
        return {
          status: 'success',
          memoryId: memory.id,
          message: 'Behavior rule saved. I will follow this in future interactions.',
        };
      } else {
        return {
          status: 'error',
          error: 'Failed to save behavior rule',
        };
      }
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Get active behavior rules
 */
export const getBehaviorsTool = tool({
  description: 'Get all active behavior rules that guide my responses. Use this to review current behavioral guidelines.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const behaviors = await getActiveBehaviors();
      
      return {
        status: 'success',
        behaviors: behaviors.map(b => ({
          id: b.id,
          content: b.content,
          importance: b.importance,
          createdAt: b.createdAt,
        })),
        count: behaviors.length,
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
 * Extract and save facts from conversation
 * Use this to remember important information the user has shared
 */
export const extractFactsTool = tool({
  description: 'Extract and save important facts from the conversation. Use this when the user shares information about their system, preferences, or requirements that should be remembered.',
  inputSchema: z.object({
    facts: z.array(z.object({
      fact: z.string().describe('The fact to remember'),
      category: z.string().describe('Category (e.g., "user-preference", "system-info", "requirement", "context")'),
      importance: z.number().min(0).max(100).describe('Importance score 0-100'),
    })).describe('Array of facts to save'),
  }),
  execute: async ({ facts }) => {
    try {
      const extractedFacts: ExtractedFact[] = facts.map(f => ({
        fact: f.fact,
        category: f.category,
        importance: f.importance,
      }));
      
      const savedMemories = await saveExtractedFacts(extractedFacts);
      
      return {
        status: 'success',
        savedCount: savedMemories.length,
        message: savedMemories.length > 0 
          ? `Saved ${savedMemories.length} new fact(s) to memory`
          : 'No new facts saved (duplicates or extraction disabled)',
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
 * Save a conversation fragment for context
 */
export const saveConversationContextTool = tool({
  description: 'Save an important part of the conversation for future context. Use this to remember key points from discussions.',
  inputSchema: z.object({
    content: z.string().describe('The conversation content to save'),
    importance: z.number().min(0).max(100).optional().describe('Importance score 0-100'),
  }),
  execute: async ({ content, importance = 50 }) => {
    try {
      const memory = await saveConversationFragment(content, '', importance);
      
      if (memory) {
        return {
          status: 'success',
          memoryId: memory.id,
          message: 'Conversation fragment saved',
        };
      } else {
        return {
          status: 'error',
          error: 'Failed to save conversation fragment',
        };
      }
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Save a conversation summary
 * Used for context compression when conversations get long
 */
export const summarizeConversationTool = tool({
  description: 'Save a summary of the conversation so far. Use this when the conversation is getting long to compress older context.',
  inputSchema: z.object({
    summary: z.string().describe('A comprehensive summary of the conversation so far'),
    messageRange: z.object({
      start: z.number().describe('Start message index that was summarized'),
      end: z.number().describe('End message index that was summarized'),
    }).describe('Range of messages this summary covers'),
  }),
  execute: async ({ summary, messageRange }) => {
    try {
      const memory = await saveConversationSummary(summary, '', messageRange);
      
      if (memory) {
        return {
          status: 'success',
          memoryId: memory.id,
          message: `Saved summary covering messages ${messageRange.start}-${messageRange.end}`,
        };
      } else {
        return {
          status: 'error',
          error: 'Failed to save conversation summary',
        };
      }
    } catch (error) {
      return {
        status: 'error',
        error: String(error),
      };
    }
  },
});

/**
 * Get context injection for current message
 * Returns relevant memories, behaviors, and summaries to help with response
 */
export const getContextTool = tool({
  description: 'Get relevant context for the current conversation. Returns memories, behaviors, and summaries that might be relevant.',
  inputSchema: z.object({
    query: z.string().describe('The current topic or question to find context for'),
  }),
  execute: async ({ query }) => {
    try {
      const context = await getContextInjection(query);
      
      return {
        status: 'success',
        context: context || 'No relevant context found',
        hasContext: context.length > 0,
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
  list_instruments: listInstrumentsTool,
  run_instrument: runInstrumentTool,
  read_file: readFileTool,
  write_file: writeFileTool,
  list_dir: listDirTool,
  move_file: moveFileTool,
  copy_file: copyFileTool,
  // Agent Zero-like Memory Tools
  save_solution: saveSolutionTool,
  query_knowledge: queryKnowledgeTool,
  get_system_context: getSystemContextTool,
  save_system_state: saveSystemStateTool,
  adjust_behavior: adjustBehaviorTool,
  get_behaviors: getBehaviorsTool,
  extract_facts: extractFactsTool,
  save_conversation_context: saveConversationContextTool,
  summarize_conversation: summarizeConversationTool,
  get_context: getContextTool,
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
  memoryEnabled: boolean;
  autoMemorySolutions?: boolean;
  autoRagEnabled?: boolean;
  autoExtractFacts?: boolean;
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
  };

  // Add search if configured
  if (settings.searchProvider !== 'none') {
    tools.search_web = searchWebTool;
  }

  // Add memory tools if enabled
  if (settings.memoryEnabled) {
    tools.save_to_memory = saveToMemoryTool;
    tools.recall_memory = recallMemoryTool;
    tools.adjust_behavior = adjustBehaviorTool;
    tools.get_behaviors = getBehaviorsTool;
    
    // Auto-solution tool (always available if memory is on, backend checks setting)
    tools.save_solution = saveSolutionTool;
    tools.save_system_state = saveSystemStateTool;
    tools.get_system_context = getSystemContextTool;
    
    // Fact extraction and conversation context
    tools.extract_facts = extractFactsTool;
    tools.save_conversation_context = saveConversationContextTool;
    
    // Context and summarization tools
    tools.summarize_conversation = summarizeConversationTool;
    tools.get_context = getContextTool;
    
    // Knowledge tools if auto-RAG is enabled
    if (settings.autoRagEnabled !== false) {
      tools.query_knowledge = queryKnowledgeTool;
    }
  }

  return tools;
}
