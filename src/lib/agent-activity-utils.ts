/**
 * Agent Activity Utilities
 *
 * Pure functions for mapping tool calls to activity types, extracting
 * display details, and validating tool arguments. These are used by
 * AgentPage.tsx and conversation loading.
 */

import type { ActivityType } from '@/types/agent-activity';

// =============================================================================
// Tool Call Validation
// =============================================================================

export function validateToolCall(
  toolName: string,
  args: Record<string, unknown>,
): { valid: boolean; error?: string } {
  switch (toolName) {
    case 'execute_command':
      if (!args.command || typeof args.command !== 'string' || !args.command.trim()) {
        return { valid: false, error: 'Missing or empty command argument' };
      }
      return { valid: true };
    case 'write_file':
      if (!args.path || typeof args.path !== 'string' || !args.path.trim()) {
        return { valid: false, error: 'Missing or invalid path argument' };
      }
      // Validate Windows absolute path (e.g., C:\ or \\server\share)
      if (!/^[a-zA-Z]:\\|^\\\\/.test(args.path.trim())) {
        return { valid: false, error: 'Path must be an absolute Windows path (e.g., C:\\path\\to\\file.txt)' };
      }
      if (args.content === undefined || args.content === null) {
        return { valid: false, error: 'Missing content argument' };
      }
      return { valid: true };
    case 'edit_file':
      if (!args.path || typeof args.path !== 'string' || !args.path.trim()) {
        return { valid: false, error: 'Missing or invalid path argument' };
      }
      if (!/^[a-zA-Z]:\\|^\\\\/.test(args.path.trim())) {
        return { valid: false, error: 'Path must be an absolute Windows path (e.g., C:\\path\\to\\file.txt)' };
      }
      if (!args.oldString || typeof args.oldString !== 'string') {
        return { valid: false, error: 'Missing or invalid oldString argument' };
      }
      if (!args.newString || typeof args.newString !== 'string') {
        return { valid: false, error: 'Missing or invalid newString argument' };
      }
      return { valid: true };
    case 'generate_file':
      if (!args.filename || typeof args.filename !== 'string') {
        return { valid: false, error: 'Missing or invalid filename argument' };
      }
      if (args.content === undefined || args.content === null) {
        return { valid: false, error: 'Missing content argument' };
      }
      if (!args.description || typeof args.description !== 'string') {
        return { valid: false, error: 'Missing or invalid description argument' };
      }
      return { valid: true };
    case 'read_file':
      if (!args.path || typeof args.path !== 'string') {
        return { valid: false, error: 'Missing or invalid path argument' };
      }
      return { valid: true };
    case 'move_file':
    case 'copy_file':
      if (!args.src || typeof args.src !== 'string') {
        return { valid: false, error: 'Missing source path' };
      }
      if (!args.dest || typeof args.dest !== 'string') {
        return { valid: false, error: 'Missing destination path' };
      }
      return { valid: true };
    default:
      return { valid: true };
  }
}

// =============================================================================
// Tool → Activity Type Mapping
// =============================================================================

export function mapToolToActivityType(toolName: string): ActivityType {
  if (toolName.startsWith('mcp_')) return 'mcp_tool';
  switch (toolName) {
    case 'execute_command': return 'ran_command';
    case 'write_file': return 'write_file';
    case 'edit_file': return 'edit_file';
    case 'read_file': return 'read_file';
    case 'move_file': return 'move_file';
    case 'copy_file': return 'copy_file';
    case 'list_dir': return 'list_dir';
    case 'list_programs': return 'list_dir';
    case 'list_instruments': return 'list_dir';
    case 'run_instrument': return 'ran_command';
    case 'generate_file': return 'generate_file';
    case 'grep': return 'searched';
    case 'glob': return 'searched';
    case 'search_web': return 'web_search';
    case 'get_system_info': return 'get_system_info';
    // Service tools
    case 'run_service_queue': return 'service_queue_started';
    case 'pause_service': return 'service_paused';
    case 'resume_service': return 'service_resumed';
    case 'cancel_service': return 'service_cancelled';
    case 'list_services': return 'service_query';
    case 'list_service_presets': return 'service_query';
    case 'check_service_requirements': return 'service_query';
    case 'get_service_status': return 'service_query';
    case 'get_service_report': return 'service_report';
    case 'get_report_statistics': return 'service_report';
    case 'edit_finding': return 'service_edit';
    case 'add_finding': return 'service_edit';
    case 'remove_finding': return 'service_edit';
    case 'set_report_summary': return 'service_edit';
    case 'set_service_analysis': return 'service_edit';
    case 'set_health_score': return 'service_edit';
    case 'generate_report_pdf': return 'service_pdf';
    default: return 'ran_command';
  }
}

// =============================================================================
// Extract Display Details from Tool Args
// =============================================================================

export function extractActivityDetails(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const getPath = (p: unknown) => (typeof p === 'string' ? p : '');
  const getFilename = (p: unknown) =>
    typeof p === 'string' ? p.split(/[/\\]/).pop() || '' : '';
  const truncate = (value?: string) => {
    if (!value) return '';
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
  };
  const stringifyArgs = () => {
    try {
      return JSON.stringify(args);
    } catch {
      return '';
    }
  };

  switch (toolName) {
    case 'execute_command':
      return { command: typeof args.command === 'string' ? args.command : '' };
    case 'write_file':
      return {
        path: getPath(args.path),
        filename: getFilename(args.path),
        content: typeof args.content === 'string' ? args.content : undefined,
      };
    case 'edit_file':
      return {
        path: getPath(args.path),
        filename: getFilename(args.path),
        oldString: typeof args.oldString === 'string' ? truncate(args.oldString) : undefined,
        newString: typeof args.newString === 'string' ? truncate(args.newString) : undefined,
        all: typeof args.all === 'boolean' ? args.all : undefined,
      };
    case 'read_file':
      return { path: getPath(args.path), filename: getFilename(args.path) };
    case 'move_file':
      return { src: getPath(args.src), dest: getPath(args.dest) };
    case 'copy_file':
      return { src: getPath(args.src), dest: getPath(args.dest) };
    case 'generate_file':
      return {
        filename: typeof args.filename === 'string' ? args.filename : 'generated-file',
        description: typeof args.description === 'string' ? args.description : '',
      };
    case 'list_dir':
      return { path: getPath(args.path) };
    case 'list_programs':
      return { path: 'data/programs' };
    case 'list_instruments':
      return { path: 'data/instruments' };
    case 'grep':
      return { query: typeof args.pattern === 'string' ? args.pattern : '' };
    case 'glob':
      return { query: typeof args.pattern === 'string' ? args.pattern : '' };
    case 'search_web':
      return { query: typeof args.query === 'string' ? args.query : '' };
    case 'get_system_info':
      return {};
    case 'run_instrument':
      return { command: `Running instrument: ${typeof args.name === 'string' ? args.name : 'unknown'}` };
    // Service tools
    case 'run_service_queue': {
      const queue = Array.isArray(args.queue) ? args.queue : [];
      return {
        serviceCount: queue.filter((q: any) => q.enabled !== false).length,
        reason: typeof args.reason === 'string' ? args.reason : undefined,
      };
    }
    case 'pause_service':
      return { reason: typeof args.reason === 'string' ? args.reason : undefined };
    case 'resume_service':
      return { reason: typeof args.reason === 'string' ? args.reason : undefined };
    case 'cancel_service':
      return { reason: typeof args.reason === 'string' ? args.reason : undefined };
    case 'list_services':
      return { queryType: 'List services' };
    case 'list_service_presets':
      return { queryType: 'List presets' };
    case 'check_service_requirements':
      return {
        queryType: 'Check requirements',
        detail: typeof args.service_id === 'string' ? args.service_id : undefined,
      };
    case 'get_service_status':
      return { queryType: 'Service status' };
    case 'get_service_report':
      return {
        reportAction: 'Get report',
        reportId: typeof args.report_id === 'string' ? args.report_id : undefined,
      };
    case 'get_report_statistics':
      return {
        reportAction: 'Get statistics',
        reportId: typeof args.report_id === 'string' ? args.report_id : undefined,
      };
    case 'edit_finding':
      return { editAction: 'Edit finding', detail: typeof args.title === 'string' ? args.title : undefined };
    case 'add_finding':
      return { editAction: 'Add finding', detail: typeof args.title === 'string' ? args.title : undefined };
    case 'remove_finding':
      return { editAction: 'Remove finding', detail: typeof args.title === 'string' ? args.title : undefined };
    case 'set_report_summary':
      return { editAction: 'Set summary' };
    case 'set_service_analysis':
      return {
        editAction: 'Set analysis',
        detail: typeof args.service_id === 'string' ? args.service_id : undefined,
      };
    case 'set_health_score':
      return {
        editAction: 'Set health score',
        detail: typeof args.score === 'number' ? `Score: ${args.score}` : undefined,
      };
    case 'generate_report_pdf':
      return { reportId: typeof args.report_id === 'string' ? args.report_id : undefined };
    default:
      if (toolName.startsWith('mcp_')) {
        return { toolName, arguments: stringifyArgs() };
      }
      console.warn('[Agent] Unknown tool for activity details:', toolName);
      return {};
  }
}
