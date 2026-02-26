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
  description: 'Read the contents of a text file with optional line numbers and pagination. Use for examining logs, configs, scripts, or any text file.',
  inputSchema: z.object({
    path: z.string().describe('Full absolute path to the file'),
    offset: z.number().optional().describe('Line number to start from (0-indexed)'),
    limit: z.number().optional().describe('Maximum number of lines to read'),
    lineNumbers: z.boolean().optional().describe('Include line numbers in output (default: true)'),
  }),
  execute: async ({ path, offset, limit, lineNumbers }) => {
    try {
      const result = await invoke<{ content: string; totalLines: number; hasMore: boolean }>('agent_read_file', { 
        path, 
        offset, 
        limit,
        line_numbers: lineNumbers ?? true 
      });
      return { 
        status: 'success', 
        content: result.content,
        totalLines: result.totalLines,
        hasMore: result.hasMore,
      };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const editFileTool = tool({
  description: `Replace old_string with new_string in a file. The old_string must be unique in the file unless all=true is specified.
Use this for targeted edits instead of rewriting entire files. Always read the file first to get the exact string to replace.`,
  inputSchema: z.object({
    path: z.string().describe('Full absolute path to the file'),
    oldString: z.string().describe('The exact string to replace (must be unique in file unless all=true)'),
    newString: z.string().describe('The replacement string'),
    all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
  }),
  outputSchema: z.object({
    status: z.enum(['success', 'error']),
    replacements: z.number().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const grepTool = tool({
  description: `Search for a regex pattern across files in a directory. Returns matching lines with file paths and line numbers.
Use this to find code patterns, error messages, or specific content across multiple files.`,
  inputSchema: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory path to search (default: current working directory)'),
    filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts", "*.rs")'),
    maxResults: z.number().optional().describe('Maximum number of results (default: 50)'),
  }),
  execute: async ({ pattern, path, filePattern, maxResults }) => {
    try {
      const results = await invoke<Array<{ file: string; line: number; content: string }>>('agent_grep', { 
        pattern, 
        path, 
        file_pattern: filePattern,
        max_results: maxResults ?? 50 
      });
      return { 
        status: 'success', 
        results,
        count: results.length,
      };
    } catch (error) {
      return { status: 'error', error: String(error) };
    }
  },
});

export const globTool = tool({
  description: `Find files matching a glob pattern, sorted by modification time (newest first).
Use this to discover files by pattern, e.g., "*.log", "src/**/*.ts", "config.*".`,
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "*.txt", "src/**/*.rs")'),
    path: z.string().optional().describe('Base directory path (default: current working directory)'),
    limit: z.number().optional().describe('Maximum number of results (default: 100)'),
  }),
  execute: async ({ pattern, path, limit }) => {
    try {
      const results = await invoke<Array<{ path: string; name: string; modified: string; size: number }>>('agent_glob', { 
        pattern, 
        path,
        limit: limit ?? 100 
      });
      return { 
        status: 'success', 
        files: results,
        count: results.length,
      };
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
  description: 'Get an overview of all portable programs installed in data/programs (executables scanned recursively). Use only when you need to see everything at once. For locating a specific tool, prefer find_exe.',
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

export const findExeTool = tool({
  description: `Preferred tool for locating a specific CLI executable. Searches data/programs recursively.
Use find_exe("smartctl") instead of list_programs when you know what tool you need.
Returns full absolute paths of matches. If empty, the program is not installed.
Set searchPath=true to also check system PATH via where.exe.`,
  inputSchema: z.object({
    query: z.string().describe('Executable name or keyword to search for (e.g. "smartctl", "ffmpeg", "rclone")'),
    searchPath: z.boolean().optional().describe('Also check system PATH via where.exe (default: false)'),
  }),
  execute: async ({ query, searchPath }) => {
    try {
      const matches = await invoke<string[]>('agent_find_exe', { query, search_path: searchPath ?? false });
      return { status: 'success' as const, matches, found: matches.length > 0 };
    } catch (error) {
      return { status: 'error' as const, error: String(error) };
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
  description: `Get system information (OS, CPU, RAM, disks, GPU, network). Specify sections to avoid loading unnecessary data and save tokens.
Examples: sections=["disk"] for disk space, sections=["memory"] for RAM, sections=["os","cpu"] for hardware overview.
Omit sections to get everything.`,
  inputSchema: z.object({
    sections: z.array(z.enum(['os', 'cpu', 'memory', 'disk', 'network'])).optional()
      .describe('Specific sections to retrieve. Omit for all. Use ["disk"] for disk tasks, ["memory"] for RAM diagnostics, etc.'),
  }),
  execute: async ({ sections }) => {
    try {
      const info = await invoke<Record<string, unknown>>('get_system_info');
      if (!sections || sections.length === 0) {
        return { status: 'success' as const, info };
      }
      const keyMap: Record<string, string> = {
        os: 'os',
        cpu: 'cpu',
        memory: 'memory',
        disk: 'disks',
        network: 'networks',
      };
      const filtered: Record<string, unknown> = {};
      for (const s of sections) {
        const key = keyMap[s];
        if (key && info[key] !== undefined) filtered[key] = info[key];
      }
      return { status: 'success' as const, info: filtered };
    } catch (error) {
      return { status: 'error' as const, error: String(error) };
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
  edit_file: editFileTool,
  grep: grepTool,
  glob: globTool,
  write_file: writeFileTool,
  generate_file: generateFileTool,
  list_dir: listDirTool,
  move_file: moveFileTool,
  copy_file: copyFileTool,
  list_programs: listProgramsTool,
  find_exe: findExeTool,
  list_instruments: listInstrumentsTool,
  run_instrument: runInstrumentTool,
  get_system_info: getSystemInfoTool,
} satisfies ToolSet;

export const HITL_TOOLS = ['execute_command', 'write_file', 'generate_file', 'move_file', 'copy_file', 'edit_file'] as const;

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
    edit_file: editFileTool,
    grep: grepTool,
    glob: globTool,
    write_file: writeFileTool,
    generate_file: generateFileTool,
    list_dir: listDirTool,
    move_file: moveFileTool,
    copy_file: copyFileTool,
    list_programs: listProgramsTool,
    find_exe: findExeTool,
    list_instruments: listInstrumentsTool,
    run_instrument: runInstrumentTool,
    get_system_info: getSystemInfoTool,
  };

  if (settings.searchProvider !== 'none') {
    tools.search_web = searchWebTool;
  }

  return tools;
}
