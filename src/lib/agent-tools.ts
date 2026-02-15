/**
 * Agent Tools for Vercel AI SDK
 * 
 * Defines the tools available to the AI agent for system operations,
 * file management, and web search.
 * 
 * Tools without an execute function are "client-side" HITL tools -
 * they will be rendered on the frontend for user interaction/approval.
 */

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { SearchResult, FileEntry, Instrument } from '@/types/agent';

// =============================================================================
// Common Output Schemas
// =============================================================================

const commandResultSchema = z.object({
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
});

const fileResultSchema = z.object({
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
  path: z.string().optional(),
});

// =============================================================================
// HITL Tools (Client-Side - No Execute Function)
// =============================================================================

export const executeCommandTool = tool({
  description: `Execute a PowerShell command on the Windows system. The user will see and approve the command before it runs.

IMPORTANT POWERSHELL RULES:
- Use full cmdlet names: Get-ChildItem (not ls/dir), Get-Process (not ps), Select-Object (not select)
- Chain with semicolons (;) not && 
- Pipe to Format-Table -AutoSize or Select-Object for readable output
- Quote paths with spaces: "$env:USERPROFILE\\Downloads"
- Use -ErrorAction SilentlyContinue when checking things that may not exist
- Prefer structured output over raw strings`,
  inputSchema: z.object({
    command: z.string().describe('The PowerShell command to execute'),
    reason: z.string().describe('Brief explanation of what this command does and why'),
  }),
  outputSchema: commandResultSchema,
});

export const writeFileTool = tool({
  description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does. The user will approve this action.',
  inputSchema: z.object({
    path: z.string().describe('Full absolute path to the file'),
    content: z.string().describe('Content to write to the file'),
  }),
  outputSchema: fileResultSchema,
});

export const moveFileTool = tool({
  description: 'Move or rename a file or directory. The user will approve this action.',
  inputSchema: z.object({
    src: z.string().describe('Source path'),
    dest: z.string().describe('Destination path'),
  }),
  outputSchema: z.object({
    status: z.enum(['success', 'error']),
    output: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const copyFileTool = tool({
  description: 'Copy a file or directory. The user will approve this action.',
  inputSchema: z.object({
    src: z.string().describe('Source path'),
    dest: z.string().describe('Destination path'),
  }),
  outputSchema: z.object({
    status: z.enum(['success', 'error']),
    output: z.string().optional(),
    error: z.string().optional(),
  }),
});

// =============================================================================
// Server-Side Tools (Auto-Execute)
// =============================================================================

export const searchWebTool = tool({
  description: 'Search the web for information, documentation, error solutions, or guides.',
  inputSchema: z.object({
    query: z.string().describe('The search query - be specific, include error codes when applicable'),
    provider: z.enum(['tavily', 'searxng']).optional().describe('Search provider'),
  }),
  execute: async ({ query, provider = 'tavily' }) => {
    try {
      const settings = await invoke<{ agent: { tavilyApiKey?: string; searxngUrl?: string } }>('get_settings');
      let results: SearchResult[];
      
      if (provider === 'tavily' && settings.agent.tavilyApiKey) {
        results = await invoke<SearchResult[]>('search_tavily', { query, api_key: settings.agent.tavilyApiKey });
      } else if (provider === 'searxng' && settings.agent.searxngUrl) {
        results = await invoke<SearchResult[]>('search_searxng', { query, instance_url: settings.agent.searxngUrl });
      } else {
        return { status: 'error', error: 'No search provider configured. Set up Tavily or SearXNG in Settings → AI Agent → Web Search.' };
      }
      
      return { status: 'success', results: results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })) };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const readFileTool = tool({
  description: 'Read the contents of a text file. Use for examining logs, configs, scripts, or any text file.',
  inputSchema: z.object({
    path: z.string().describe('Full absolute path to the file'),
  }),
  execute: async ({ path }) => {
    try {
      const content = await invoke<string>('agent_read_file', { path });
      return { status: 'success', content };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const listDirTool = tool({
  description: 'List files and directories at a given path. Returns name, type, and size.',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to list. Use C:\\Users\\<user> for home, C:\\ for root.'),
  }),
  execute: async ({ path }) => {
    try {
      const entries = await invoke<FileEntry[]>('agent_list_dir', { path });
      return {
        status: 'success',
        entries: entries.map(e => ({ name: e.name, path: e.path, type: e.is_dir ? 'dir' : 'file', size: e.size })),
      };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const listProgramsTool = tool({
  description: 'List all portable programs and CLI tools available in the data/programs folder.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const programs = await invoke<Array<Record<string, string>>>('list_agent_programs');
      return { status: 'success', programs: programs.map(p => ({ name: p.name, path: p.path, executables: p.executables })) };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const listInstrumentsTool = tool({
  description: 'List available custom instruments (scripts) that can be run with run_instrument.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const instruments = await invoke<Instrument[]>('list_instruments');
      return { status: 'success', instruments: instruments.map(i => ({ name: i.name, description: i.description, extension: i.extension })) };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const runInstrumentTool = tool({
  description: 'Run a custom instrument (script) by name.',
  inputSchema: z.object({
    name: z.string().describe('Name of the instrument to run'),
    args: z.string().optional().describe('Arguments to pass'),
  }),
  execute: async ({ name, args }) => {
    try {
      const instruments = await invoke<Instrument[]>('list_instruments');
      const instrument = instruments.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (!instrument) return { status: 'error', error: `Instrument '${name}' not found. Use list_instruments to see available.` };

      let command = '';
      if (instrument.extension === 'ps1') command = `powershell -ExecutionPolicy Bypass -File "${instrument.path}" ${args || ''}`;
      else if (['bat', 'cmd', 'exe'].includes(instrument.extension)) command = `"${instrument.path}" ${args || ''}`;
      else if (instrument.extension === 'py') command = `python "${instrument.path}" ${args || ''}`;
      else if (instrument.extension === 'js') command = `node "${instrument.path}" ${args || ''}`;

      const result = await invoke<{ id: string; status: string; output?: string }>('queue_agent_command', { command, reason: `Running instrument: ${name}` });
      return result.status === 'executed'
        ? { status: 'success', output: result.output || 'Executed successfully' }
        : { status: 'pending', commandId: result.id, message: 'Waiting for approval' };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const getSystemInfoTool = tool({
  description: 'Get detailed system information including OS, CPU, RAM, disks, GPU, network. Use this to understand the machine.',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const info = await invoke<Record<string, unknown>>('get_system_info');
      return { status: 'success', info };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

// =============================================================================
// File Generation Tool (HITL)
// =============================================================================

export const generateFileTool = tool({
  description: `Generate a file with content and save it to the agent workspace. 
Use this when you need to create reports, logs, scripts, configuration files, or any output file.
The file will be saved and the user will be able to download it from the chat.
Examples: creating diagnostic reports, exporting logs, generating scripts, saving analysis results.`,
  inputSchema: z.object({
    filename: z.string().describe('Name for the file including extension (e.g., "report.txt", "script.ps1", "data.json")'),
    content: z.string().describe('Full content to write to the file'),
    description: z.string().describe('Brief description of what this file contains and why it was generated'),
    mime_type: z.string().optional().describe('MIME type (optional, auto-detected from extension if not provided)'),
  }),
  outputSchema: z.object({
    status: z.enum(['success', 'error', 'pending']),
    file_id: z.string().optional(),
    path: z.string().optional(),
    size: z.number().optional(),
    error: z.string().optional(),
  }),
});

// =============================================================================
// Tool Collection & Helpers
// =============================================================================

export const agentTools = {
  execute_command: executeCommandTool,
  search_web: searchWebTool,
  read_file: readFileTool,
  write_file: writeFileTool,
  generate_file: generateFileTool,
  list_dir: listDirTool,
  move_file: moveFileTool,
  copy_file: copyFileTool,
  list_programs: listProgramsTool,
  list_instruments: listInstrumentsTool,
  run_instrument: runInstrumentTool,
  get_system_info: getSystemInfoTool,
} satisfies ToolSet;

export const HITL_TOOLS = ['execute_command', 'write_file', 'generate_file', 'move_file', 'copy_file'] as const;

export function isHITLTool(toolName: string): boolean {
  return HITL_TOOLS.includes(toolName as typeof HITL_TOOLS[number]);
}

export function shouldRequireApproval(toolName: string, approvalMode: string): boolean {
  if (!isHITLTool(toolName)) return false;
  if (approvalMode === 'yolo') return false;
  return true;
}

export function getEnabledTools(settings: { searchProvider: string }): ToolSet {
  const tools: ToolSet = {
    execute_command: executeCommandTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    generate_file: generateFileTool,
    list_dir: listDirTool,
    move_file: moveFileTool,
    copy_file: copyFileTool,
    list_programs: listProgramsTool,
    list_instruments: listInstrumentsTool,
    run_instrument: runInstrumentTool,
    get_system_info: getSystemInfoTool,
  };

  if (settings.searchProvider !== 'none') {
    tools.search_web = searchWebTool;
  }

  return tools;
}
