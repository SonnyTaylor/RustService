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
  | 'write_file'
  | 'move_file'
  | 'copy_file'
  | 'list_dir'
  | 'web_search'
  | 'get_system_info'
  | 'mcp_tool';

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
 * Union type of all activities
 */
export type AgentActivity = 
  | AnalyzedDirectoryActivity
  | SearchedActivity
  | AnalyzedFileActivity
  | RanCommandActivity
  | ReadFileActivity
  | WriteFileActivity
  | MoveFileActivity
  | CopyFileActivity
  | ListDirActivity
  | WebSearchActivity
  | GetSystemInfoActivity
  | McpToolActivity;

/**
 * Helper to check if an activity requires approval
 */
export function isHITLActivity(activity: AgentActivity): boolean {
  return ['ran_command', 'write_file', 'move_file', 'copy_file'].includes(activity.type);
}

/**
 * Helper to check if an activity is pending approval
 */
export function isPendingApproval(activity: AgentActivity): boolean {
  return activity.status === 'pending_approval';
}
