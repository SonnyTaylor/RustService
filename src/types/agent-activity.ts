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
  | 'web_search'
  | 'memory_save'
  | 'memory_recall';

/**
 * Base activity interface
 */
export interface BaseActivity {
  id: string;
  type: ActivityType;
  timestamp: string;
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
  output?: string;
  exitCode?: number;
  status: 'running' | 'success' | 'error';
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
 * File write activity
 */
export interface WriteFileActivity extends BaseActivity {
  type: 'write_file';
  path: string;
  filename: string;
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
 * Memory operations
 */
export interface MemorySaveActivity extends BaseActivity {
  type: 'memory_save';
  memoryType: string;
}

export interface MemoryRecallActivity extends BaseActivity {
  type: 'memory_recall';
  query: string;
  resultCount?: number;
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
  | WebSearchActivity
  | MemorySaveActivity
  | MemoryRecallActivity;
