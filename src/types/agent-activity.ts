/**
 * Agent Activity Types
 * 
 * Type definitions for tracking agent actions in the chat UI.
 */

/**
 * Types of activities the agent can perform
 */
export type ActivityType =
  | 'analyzed_directory'
  | 'searched'
  | 'analyzed_file'
  | 'ran_command'
  | 'read_file'
  | 'edit_file'
  | 'write_file'
  | 'move_file'
  | 'copy_file'
  | 'list_dir'
  | 'list_programs'
  | 'find_exe'
  | 'web_search'
  | 'get_system_info'
  | 'mcp_tool'
  | 'generate_file'
  | 'attach_files'
  | 'service_queue_started'
  | 'service_paused'
  | 'service_resumed'
  | 'service_cancelled'
  | 'service_query'
  | 'service_report'
  | 'service_edit'
  | 'service_pdf';

/**
 * Status of an activity
 */
export type ActivityStatus = 'pending_approval' | 'running' | 'success' | 'error';

/**
 * Base activity interface - all activities have these fields
 */
export interface BaseActivity {
  id: string;
  type: ActivityType;
  timestamp: string;
  /** Current status of this activity */
  status: ActivityStatus;
  /** Output/result of the activity (populated after completion) */
  output?: string;
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Directory analysis activity
 */
export interface AnalyzedDirectoryActivity extends BaseActivity {
  type: 'analyzed_directory';
  path: string;
}

/**
 * Search/grep activity
 */
export interface SearchedActivity extends BaseActivity {
  type: 'searched';
  query: string;
  resultCount?: number;
}

/**
 * File analysis activity
 */
export interface AnalyzedFileActivity extends BaseActivity {
  type: 'analyzed_file';
  path: string;
  filename: string;
  lineRange?: string;
}

/**
 * Terminal command activity
 */
export interface RanCommandActivity extends BaseActivity {
  type: 'ran_command';
  command: string;
  workingDirectory?: string;
  exitCode?: number;
}

/**
 * File read activity
 */
export interface ReadFileActivity extends BaseActivity {
  type: 'read_file';
  path: string;
  filename: string;
  lineRange?: string;
}

/**
 * File edit activity (HITL - requires approval)
 */
export interface EditFileActivity extends BaseActivity {
  type: 'edit_file';
  path: string;
  filename: string;
  oldString?: string;
  newString?: string;
  all?: boolean;
}

/**
 * File write activity (HITL - requires approval)
 */
export interface WriteFileActivity extends BaseActivity {
  type: 'write_file';
  path: string;
  filename: string;
  content?: string;
}

/**
 * File move activity (HITL - requires approval)
 */
export interface MoveFileActivity extends BaseActivity {
  type: 'move_file';
  src: string;
  dest: string;
}

/**
 * File copy activity (HITL - requires approval)
 */
export interface CopyFileActivity extends BaseActivity {
  type: 'copy_file';
  src: string;
  dest: string;
}

/**
 * List directory activity
 */
export interface ListDirActivity extends BaseActivity {
  type: 'list_dir';
  path: string;
  entryCount?: number;
}

/**
 * Web search activity
 */
export interface WebSearchActivity extends BaseActivity {
  type: 'web_search';
  query: string;
  resultCount?: number;
}

/**
 * List programs activity
 */
export interface ListProgramsActivity extends BaseActivity {
  type: 'list_programs';
  programCount?: number;
}

/**
 * Find executable activity
 */
export interface FindExeActivity extends BaseActivity {
  type: 'find_exe';
  query: string;
  matchCount?: number;
}

/**
 * System info activity
 */
export interface GetSystemInfoActivity extends BaseActivity {
  type: 'get_system_info';
}

/**
 * MCP tool activity
 */
export interface McpToolActivity extends BaseActivity {
  type: 'mcp_tool';
  toolName: string;
  arguments?: string;
}

/**
 * File generation activity (agent creates a file)
 */
export interface GenerateFileActivity extends BaseActivity {
  type: 'generate_file';
  filename: string;
  description: string;
  mimeType?: string;
  size?: number;
  path?: string;
}

/**
 * File attachment activity (user attaches files)
 */
export interface AttachFilesActivity extends BaseActivity {
  type: 'attach_files';
  fileCount: number;
  files: Array<{
    name: string;
    size: number;
    mimeType: string;
  }>;
}

/**
 * Service queue started activity (run_service_queue)
 */
export interface ServiceQueueStartedActivity extends BaseActivity {
  type: 'service_queue_started';
  serviceCount: number;
  reportId?: string;
  reason?: string;
}

/**
 * Service paused activity (pause_service)
 */
export interface ServicePausedActivity extends BaseActivity {
  type: 'service_paused';
  reason?: string;
}

/**
 * Service resumed activity (resume_service)
 */
export interface ServiceResumedActivity extends BaseActivity {
  type: 'service_resumed';
  reason?: string;
}

/**
 * Service cancelled activity (cancel_service)
 */
export interface ServiceCancelledActivity extends BaseActivity {
  type: 'service_cancelled';
  reason?: string;
}

/**
 * Service query activity (list_services, list_service_presets, check_service_requirements, get_service_status)
 */
export interface ServiceQueryActivity extends BaseActivity {
  type: 'service_query';
  queryType: string;
  detail?: string;
}

/**
 * Service report activity (get_service_report, get_report_statistics)
 */
export interface ServiceReportActivity extends BaseActivity {
  type: 'service_report';
  reportAction: string;
  reportId?: string;
}

/**
 * Service edit activity (edit_finding, add_finding, remove_finding, set_report_summary, set_service_analysis, set_health_score)
 */
export interface ServiceEditActivity extends BaseActivity {
  type: 'service_edit';
  editAction: string;
  detail?: string;
}

/**
 * Service PDF generation activity (generate_report_pdf)
 */
export interface ServicePdfActivity extends BaseActivity {
  type: 'service_pdf';
  reportId?: string;
  filename?: string;
  path?: string;
  size?: number;
}

/**
 * Union type of all activities
 */
export type AgentActivity =
  | AnalyzedDirectoryActivity
  | SearchedActivity
  | AnalyzedFileActivity
  | RanCommandActivity
  | ReadFileActivity
  | EditFileActivity
  | WriteFileActivity
  | MoveFileActivity
  | CopyFileActivity
  | ListDirActivity
  | ListProgramsActivity
  | FindExeActivity
  | WebSearchActivity
  | GetSystemInfoActivity
  | McpToolActivity
  | GenerateFileActivity
  | AttachFilesActivity
  | ServiceQueueStartedActivity
  | ServicePausedActivity
  | ServiceResumedActivity
  | ServiceCancelledActivity
  | ServiceQueryActivity
  | ServiceReportActivity
  | ServiceEditActivity
  | ServicePdfActivity;

/**
 * Helper to check if an activity requires approval
 */
export function isHITLActivity(activity: AgentActivity): boolean {
  return [
    'ran_command', 'edit_file', 'write_file', 'generate_file', 'move_file', 'copy_file',
    'service_queue_started', 'service_paused', 'service_resumed', 'service_cancelled',
    'service_pdf',
  ].includes(activity.type);
}

/**
 * Helper to check if an activity is pending approval
 */
export function isPendingApproval(activity: AgentActivity): boolean {
  return activity.status === 'pending_approval';
}
