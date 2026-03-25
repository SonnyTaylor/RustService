/**
 * Agent Tools for Vercel AI SDK
 *
 * Defines the tools available to the AI agent for system operations,
 * file management, and web search.
 *
 * Tools without an execute function are "client-side" HITL tools -
 * they will be rendered on the frontend for user interaction/approval.
 */

import { tool, type CoreTool, type ToolSet } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import type { SearchResult, FileEntry, Instrument } from '@/types/agent';
import type {
  ServiceDefinition,
  ServicePreset,
  ServiceReport,
  ReportStatistics,
  ServiceRunState,
} from '@/types/service';

// =============================================================================
// Factory Helper
// =============================================================================

/**
 * Create a server-side tool with standardized error handling.
 * Wraps the execute function in a try-catch that returns { status: 'error' }.
 */
function createServerTool<TParams extends z.ZodType, TResult>(config: {
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>) => Promise<TResult>;
}): CoreTool {
  return tool({
    description: config.description,
    inputSchema: config.parameters,
    execute: async (args: z.infer<TParams>) => {
      try {
        return await config.execute(args);
      } catch (error) {
        return { status: 'error', error: String(error) };
      }
    },
  });
}

// =============================================================================
// Common Schemas
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

const statusResultSchema = z.object({
  status: z.enum(['success', 'error']),
  output: z.string().optional(),
  error: z.string().optional(),
});

const statusMessageSchema = z.object({
  status: z.enum(['success', 'error']),
  message: z.string().optional(),
  error: z.string().optional(),
});

const srcDestSchema = z.object({
  src: z.string().describe('Source path'),
  dest: z.string().describe('Destination path'),
});

const reportIdSchema = z.object({
  report_id: z.string().describe('The report ID'),
});

const reasonSchema = z.object({
  reason: z.string().describe('Brief explanation'),
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
  inputSchema: srcDestSchema,
  outputSchema: statusResultSchema,
});

export const copyFileTool = tool({
  description: 'Copy a file or directory. The user will approve this action.',
  inputSchema: srcDestSchema,
  outputSchema: statusResultSchema,
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

// =============================================================================
// Server-Side Tools — Filesystem
// =============================================================================

export const readFileTool = createServerTool({
  description: 'Read the contents of a text file with optional line numbers and pagination. Use for examining logs, configs, scripts, or any text file.',
  parameters: z.object({
    path: z.string().describe('Full absolute path to the file'),
    offset: z.number().optional().describe('Line number to start from (0-indexed)'),
    limit: z.number().optional().describe('Maximum number of lines to read'),
    lineNumbers: z.boolean().optional().describe('Include line numbers in output (default: true)'),
  }),
  execute: async ({ path, offset, limit, lineNumbers }) => {
    const result = await invoke<{ content: string; totalLines: number; hasMore: boolean }>('agent_read_file', {
      path, offset, limit, line_numbers: lineNumbers ?? true,
    });
    return { status: 'success', content: result.content, totalLines: result.totalLines, hasMore: result.hasMore };
  },
});

export const grepTool = createServerTool({
  description: `Search for a regex pattern across files in a directory. Returns matching lines with file paths and line numbers.
Use this to find code patterns, error messages, or specific content across multiple files.`,
  parameters: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory path to search (default: current working directory)'),
    filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts", "*.rs")'),
    maxResults: z.number().optional().describe('Maximum number of results (default: 50)'),
  }),
  execute: async ({ pattern, path, filePattern, maxResults }) => {
    const results = await invoke<Array<{ file: string; line: number; content: string }>>('agent_grep', {
      pattern, path, file_pattern: filePattern, max_results: maxResults ?? 50,
    });
    return { status: 'success', results, count: results.length };
  },
});

export const globTool = createServerTool({
  description: `Find files matching a glob pattern, sorted by modification time (newest first).
Use this to discover files by pattern, e.g., "*.log", "src/**/*.ts", "config.*".`,
  parameters: z.object({
    pattern: z.string().describe('Glob pattern (e.g., "*.txt", "src/**/*.rs")'),
    path: z.string().optional().describe('Base directory path (default: current working directory)'),
    limit: z.number().optional().describe('Maximum number of results (default: 100)'),
  }),
  execute: async ({ pattern, path, limit }) => {
    const results = await invoke<Array<{ path: string; name: string; modified: string; size: number }>>('agent_glob', {
      pattern, path, limit: limit ?? 100,
    });
    return { status: 'success', files: results, count: results.length };
  },
});

export const listDirTool = createServerTool({
  description: 'List files and directories at a given path. Returns name, type, and size.',
  parameters: z.object({
    path: z.string().describe('Absolute path to list. Use C:\\Users\\<user> for home, C:\\ for root.'),
  }),
  execute: async ({ path }) => {
    const entries = await invoke<FileEntry[]>('agent_list_dir', { path });
    return {
      status: 'success',
      entries: entries.map(e => ({ name: e.name, path: e.path, type: e.is_dir ? 'dir' : 'file', size: e.size })),
    };
  },
});

// =============================================================================
// Server-Side Tools — Programs & Instruments
// =============================================================================

export const listProgramsTool = createServerTool({
  description: 'Get an overview of all portable programs installed in data/programs (executables scanned recursively). Use only when you need to see everything at once. For locating a specific tool, prefer find_exe.',
  parameters: z.object({}),
  execute: async () => {
    const programs = await invoke<Array<Record<string, string>>>('list_agent_programs');
    return { status: 'success', programs: programs.map(p => ({ name: p.name, path: p.path, executables: p.executables })) };
  },
});

export const findExeTool = createServerTool({
  description: `Preferred tool for locating a specific CLI executable. Searches data/programs recursively.
Use find_exe("smartctl") instead of list_programs when you know what tool you need.
Returns full absolute paths of matches. If empty, the program is not installed.
Set searchPath=true to also check system PATH via where.exe.`,
  parameters: z.object({
    query: z.string().describe('Executable name or keyword to search for (e.g. "smartctl", "ffmpeg", "rclone")'),
    searchPath: z.boolean().optional().describe('Also check system PATH via where.exe (default: false)'),
  }),
  execute: async ({ query, searchPath }) => {
    const matches = await invoke<string[]>('agent_find_exe', { query, search_path: searchPath ?? false });
    return { status: 'success' as const, matches, found: matches.length > 0 };
  },
});

export const listInstrumentsTool = createServerTool({
  description: 'List available custom instruments (scripts) that can be run with run_instrument.',
  parameters: z.object({}),
  execute: async () => {
    const instruments = await invoke<Instrument[]>('list_instruments');
    return { status: 'success', instruments: instruments.map(i => ({ name: i.name, description: i.description, extension: i.extension })) };
  },
});

export const runInstrumentTool = createServerTool({
  description: 'Run a custom instrument (script) by name.',
  parameters: z.object({
    name: z.string().describe('Name of the instrument to run'),
    args: z.string().optional().describe('Arguments to pass'),
  }),
  execute: async ({ name, args }) => {
    const instruments = await invoke<Instrument[]>('list_instruments');
    const instrument = instruments.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (!instrument) return { status: 'error', error: `Instrument '${name}' not found. Use list_instruments to see available.` };

    let command = '';
    if (instrument.extension === 'ps1') command = `powershell -ExecutionPolicy Bypass -File "${instrument.path}" ${args || ''}`;
    else if (['bat', 'cmd', 'exe'].includes(instrument.extension)) command = `"${instrument.path}" ${args || ''}`;
    else if (instrument.extension === 'py') command = `python "${instrument.path}" ${args || ''}`;
    else if (instrument.extension === 'js') command = `node "${instrument.path}" ${args || ''}`;

    const result = await invoke<{ id: string; status: string; output?: string }>('queue_agent_command', {
      command, reason: `Running instrument: ${name}`,
    });
    return result.status === 'executed'
      ? { status: 'success', output: result.output || 'Executed successfully' }
      : { status: 'pending', commandId: result.id, message: 'Waiting for approval' };
  },
});

// =============================================================================
// Server-Side Tools — System & Search
// =============================================================================

export const getSystemInfoTool = createServerTool({
  description: `Get system information (OS, CPU, RAM, disks, GPU, network). Specify sections to avoid loading unnecessary data and save tokens.
Examples: sections=["disk"] for disk space, sections=["memory"] for RAM, sections=["os","cpu"] for hardware overview.
Omit sections to get everything.`,
  parameters: z.object({
    sections: z.array(z.enum(['os', 'cpu', 'memory', 'disk', 'network'])).optional()
      .describe('Specific sections to retrieve. Omit for all.'),
  }),
  execute: async ({ sections }) => {
    const info = await invoke<Record<string, unknown>>('get_system_info');
    if (!sections || sections.length === 0) {
      return { status: 'success' as const, info };
    }
    const keyMap: Record<string, string> = {
      os: 'os', cpu: 'cpu', memory: 'memory', disk: 'disks', network: 'networks',
    };
    const filtered: Record<string, unknown> = {};
    for (const s of sections) {
      const key = keyMap[s];
      if (key && info[key] !== undefined) filtered[key] = info[key];
    }
    return { status: 'success' as const, info: filtered };
  },
});

export const searchWebTool = createServerTool({
  description: 'Search the web for information, documentation, error solutions, or guides.',
  parameters: z.object({
    query: z.string().describe('The search query - be specific, include error codes when applicable'),
    provider: z.enum(['tavily', 'searxng']).optional().describe('Search provider'),
  }),
  execute: async ({ query, provider = 'tavily' }) => {
    const settings = await invoke<{ agent: { tavilyApiKey?: string; searxngUrl?: string } }>('get_settings');
    let results: SearchResult[] = [];

    if (provider === 'tavily' && settings.agent.tavilyApiKey) {
      results = await invoke<SearchResult[]>('search_tavily', { query, api_key: settings.agent.tavilyApiKey });
    } else if (provider === 'searxng' && settings.agent.searxngUrl) {
      results = await invoke<SearchResult[]>('search_searxng', { query, instance_url: settings.agent.searxngUrl });
    } else {
      return { status: 'error', error: 'No search provider configured. Set up Tavily or SearXNG in Settings -> AI Agent -> Web Search.' };
    }

    return { status: 'success', results: results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet })) };
  },
});

// =============================================================================
// Server-Side Tools — Service Query (Auto-Execute)
// =============================================================================

export const listServicesTool = createServerTool({
  description: 'List all available diagnostic and maintenance services. Returns service ID, name, description, category, estimated duration, and required programs.',
  parameters: z.object({}),
  execute: async () => {
    const definitions = await invoke<ServiceDefinition[]>('get_service_definitions');
    return {
      status: 'success' as const,
      services: definitions.map(d => ({
        id: d.id, name: d.name, description: d.description, category: d.category,
        estimatedDurationSecs: d.estimatedDurationSecs, requiredPrograms: d.requiredPrograms,
        options: d.options.map(o => ({ id: o.id, label: o.label, type: o.optionType, default: o.defaultValue })),
      })),
    };
  },
});

export const listServicePresetsTool = createServerTool({
  description: 'List all service presets (Diagnostics, General, Complete, Custom, and user-created). Each preset contains a pre-configured list of services.',
  parameters: z.object({}),
  execute: async () => {
    const presets = await invoke<ServicePreset[]>('get_service_presets');
    return {
      status: 'success' as const,
      presets: presets.map(p => ({
        id: p.id, name: p.name, description: p.description,
        serviceCount: p.services.filter(s => s.enabled).length,
        services: p.services.map(s => ({ serviceId: s.serviceId, enabled: s.enabled })),
      })),
    };
  },
});

export const checkServiceRequirementsTool = createServerTool({
  description: 'Check if required external programs are available for a list of services. Returns which services have missing requirements.',
  parameters: z.object({
    service_ids: z.array(z.string()).describe('Array of service IDs to check'),
  }),
  execute: async ({ service_ids }) => {
    const missing = await invoke<Record<string, string[]>>('validate_service_requirements', { service_ids });
    return { status: 'success' as const, allRequirementsMet: Object.keys(missing).length === 0, missingPrograms: missing };
  },
});

export const getServiceStatusTool = createServerTool({
  description: 'Get the current service run state. Returns whether a run is active, paused, and the current report with progress.',
  parameters: z.object({}),
  execute: async () => {
    const state = await invoke<ServiceRunState>('get_service_run_state');
    return {
      status: 'success' as const,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      currentServiceIndex: state.currentReport?.currentServiceIndex,
      totalServices: state.currentReport?.queue.filter(q => q.enabled).length,
      currentServiceId: state.currentReport?.currentServiceIndex != null
        ? state.currentReport?.queue.filter(q => q.enabled)[state.currentReport.currentServiceIndex]?.serviceId
        : undefined,
      completedResults: state.currentReport?.results.length ?? 0,
      reportStatus: state.currentReport?.status,
    };
  },
});

// =============================================================================
// Server-Side Tools — Service Report (Auto-Execute)
// =============================================================================

export const getServiceReportTool = createServerTool({
  description: 'Get a saved service report by its ID. Returns the full report with all findings, results, and metadata.',
  parameters: reportIdSchema,
  execute: async ({ report_id }) => {
    const report = await invoke<ServiceReport>('get_service_report', { report_id });
    return {
      status: 'success' as const,
      report: {
        id: report.id, startedAt: report.startedAt, completedAt: report.completedAt,
        status: report.status, totalDurationMs: report.totalDurationMs,
        agentSummary: report.agentSummary, healthScore: report.healthScore,
        results: report.results.map(r => ({
          serviceId: r.serviceId, success: r.success, error: r.error, durationMs: r.durationMs,
          findingsCount: r.findings.length,
          findings: r.findings.map(f => ({
            severity: f.severity, title: f.title, description: f.description, recommendation: f.recommendation,
          })),
          agentAnalysis: r.agentAnalysis,
        })),
      },
    };
  },
});

export const getReportStatisticsTool = createServerTool({
  description: 'Get computed statistics for a service report: pass/fail counts, severity breakdown, health score, duration metrics.',
  parameters: reportIdSchema,
  execute: async ({ report_id }) => {
    const stats = await invoke<ReportStatistics>('get_report_statistics', { report_id });
    return { status: 'success' as const, statistics: stats };
  },
});

// =============================================================================
// Server-Side Tools — Service Report Editing (Auto-Execute)
// =============================================================================

export const editFindingTool = createServerTool({
  description: 'Edit an existing finding in a saved report. Can update severity, title, description, or recommendation.',
  parameters: z.object({
    report_id: z.string().describe('Report ID'),
    service_id: z.string().describe('Service ID within the report'),
    finding_index: z.number().describe('Zero-based index of the finding to edit'),
    severity: z.enum(['info', 'success', 'warning', 'error', 'critical']).optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    recommendation: z.string().optional(),
  }),
  execute: async ({ report_id, service_id, finding_index, severity, title, description, recommendation }) => {
    await invoke('edit_report_finding', {
      report_id, service_id, finding_index,
      severity: severity ?? null, title: title ?? null,
      description: description ?? null, recommendation: recommendation ?? null,
    });
    return { status: 'success' as const, message: 'Finding updated' };
  },
});

export const addFindingTool = createServerTool({
  description: 'Add a new finding to a service result in a report.',
  parameters: z.object({
    report_id: z.string().describe('Report ID'),
    service_id: z.string().describe('Service ID to add the finding to'),
    severity: z.enum(['info', 'success', 'warning', 'error', 'critical']).describe('Finding severity'),
    title: z.string().describe('Short finding title'),
    description: z.string().describe('Detailed finding description'),
    recommendation: z.string().optional().describe('Recommended action'),
  }),
  execute: async ({ report_id, service_id, severity, title, description, recommendation }) => {
    await invoke('add_report_finding', {
      report_id, service_id, severity, title, description,
      recommendation: recommendation ?? null,
    });
    return { status: 'success' as const, message: 'Finding added' };
  },
});

export const removeFindingTool = createServerTool({
  description: 'Remove a finding from a service result in a report by index. Use sparingly.',
  parameters: z.object({
    report_id: z.string().describe('Report ID'),
    service_id: z.string().describe('Service ID'),
    finding_index: z.number().describe('Zero-based index of the finding to remove'),
  }),
  execute: async ({ report_id, service_id, finding_index }) => {
    await invoke('remove_report_finding', { report_id, service_id, finding_index });
    return { status: 'success' as const, message: 'Finding removed' };
  },
});

export const setReportSummaryTool = createServerTool({
  description: 'Set the executive summary on a report. Write a comprehensive, professional summary.',
  parameters: z.object({
    report_id: z.string().describe('Report ID'),
    summary: z.string().describe('Executive summary text (professional, comprehensive)'),
  }),
  execute: async ({ report_id, summary }) => {
    await invoke('set_report_summary', { report_id, summary });
    return { status: 'success' as const, message: 'Summary set' };
  },
});

export const setServiceAnalysisTool = createServerTool({
  description: 'Set agent analysis text for a specific service result.',
  parameters: z.object({
    report_id: z.string().describe('Report ID'),
    service_id: z.string().describe('Service ID to annotate'),
    analysis: z.string().describe('Analysis text explaining the results'),
  }),
  execute: async ({ report_id, service_id, analysis }) => {
    await invoke('set_service_analysis', { report_id, service_id, analysis });
    return { status: 'success' as const, message: 'Analysis set' };
  },
});

export const setHealthScoreTool = createServerTool({
  description: 'Set the overall health score (0-100) on a report. 90-100 excellent, 70-89 good, 50-69 fair, 30-49 poor, 0-29 critical.',
  parameters: z.object({
    report_id: z.string().describe('Report ID'),
    score: z.number().min(0).max(100).describe('Health score 0-100'),
  }),
  execute: async ({ report_id, score }) => {
    await invoke('set_report_health_score', { report_id, score });
    return { status: 'success' as const, message: `Health score set to ${score}` };
  },
});

export const generateReportPdfTool = createServerTool({
  description: 'Generate a PDF report file from a completed service report. Returns the file path.',
  parameters: z.object({
    report_id: z.string().describe('Report ID to generate PDF from'),
    output_path: z.string().optional().describe('Custom output path (optional, defaults to data/reports/)'),
  }),
  execute: async ({ report_id, output_path }) => {
    const path = await invoke<string>('generate_report_pdf', {
      report_id, output_path: output_path ?? null,
    });
    return { status: 'success' as const, path, message: `Report PDF generated at ${path}` };
  },
});

// =============================================================================
// Service Tools — HITL (Require Approval)
// =============================================================================

export const runServiceQueueTool = tool({
  description: `Start a service run with the specified queue. This is a significant operation that runs diagnostic/maintenance services on the system. The user must approve before execution begins. Provide a queue of service IDs with options, or use a preset.

Build the queue by:
1. First call list_services to see available services
2. Call check_service_requirements to verify programs are installed
3. Build the queue array with service IDs, enabled flags, and options
4. Optionally set technician and customer names for business mode

The run will execute sequentially. You will receive updates as each service completes.`,
  inputSchema: z.object({
    queue: z.array(z.object({
      service_id: z.string(),
      enabled: z.boolean(),
      order: z.number(),
      options: z.record(z.string(), z.unknown()).default({}),
    })).describe('Service queue items'),
    technician_name: z.string().optional().describe('Technician name (business mode)'),
    customer_name: z.string().optional().describe('Customer name (business mode)'),
    reason: z.string().describe('Brief explanation of why these services are being run'),
  }),
  outputSchema: z.object({
    status: z.enum(['started', 'error']),
    report_id: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
});

export const pauseServiceTool = tool({
  description: 'Pause the currently running service queue. Takes effect between services.',
  inputSchema: reasonSchema.extend({
    reason: z.string().describe('Why you are pausing the run'),
  }),
  outputSchema: statusMessageSchema,
});

export const resumeServiceTool = tool({
  description: 'Resume a paused service run.',
  inputSchema: reasonSchema.extend({
    reason: z.string().describe('Why it is safe to resume'),
  }),
  outputSchema: statusMessageSchema,
});

export const cancelServiceTool = tool({
  description: 'Cancel the currently running service queue.',
  inputSchema: reasonSchema.extend({
    reason: z.string().describe('Why you are cancelling the run'),
  }),
  outputSchema: statusMessageSchema,
});

// =============================================================================
// File Generation Tool (HITL)
// =============================================================================

export const generateFileTool = tool({
  description: `Generate a file with content and save it to the agent workspace.
Use this when you need to create reports, logs, scripts, configuration files, or any output file.
The file will be saved and the user will be able to download it from the chat.`,
  inputSchema: z.object({
    filename: z.string().describe('Name for the file including extension'),
    content: z.string().describe('Full content to write to the file'),
    description: z.string().describe('Brief description of what this file contains'),
    mime_type: z.string().optional().describe('MIME type (optional, auto-detected from extension)'),
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
  // Service tools
  list_services: listServicesTool,
  list_service_presets: listServicePresetsTool,
  check_service_requirements: checkServiceRequirementsTool,
  get_service_status: getServiceStatusTool,
  get_service_report: getServiceReportTool,
  get_report_statistics: getReportStatisticsTool,
  edit_finding: editFindingTool,
  add_finding: addFindingTool,
  remove_finding: removeFindingTool,
  set_report_summary: setReportSummaryTool,
  set_service_analysis: setServiceAnalysisTool,
  set_health_score: setHealthScoreTool,
  generate_report_pdf: generateReportPdfTool,
  run_service_queue: runServiceQueueTool,
  pause_service: pauseServiceTool,
  resume_service: resumeServiceTool,
  cancel_service: cancelServiceTool,
} satisfies ToolSet;

export const HITL_TOOLS = [
  'execute_command', 'write_file', 'generate_file', 'move_file', 'copy_file', 'edit_file',
  'run_service_queue', 'pause_service', 'resume_service', 'cancel_service',
] as const;

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
    // Service tools
    list_services: listServicesTool,
    list_service_presets: listServicePresetsTool,
    check_service_requirements: checkServiceRequirementsTool,
    get_service_status: getServiceStatusTool,
    get_service_report: getServiceReportTool,
    get_report_statistics: getReportStatisticsTool,
    edit_finding: editFindingTool,
    add_finding: addFindingTool,
    remove_finding: removeFindingTool,
    set_report_summary: setReportSummaryTool,
    set_service_analysis: setServiceAnalysisTool,
    set_health_score: setHealthScoreTool,
    generate_report_pdf: generateReportPdfTool,
    run_service_queue: runServiceQueueTool,
    pause_service: pauseServiceTool,
    resume_service: resumeServiceTool,
    cancel_service: cancelServiceTool,
  };

  if (settings.searchProvider !== 'none') {
    tools.search_web = searchWebTool;
  }

  return tools;
}
