/**
 * Agent Activity Item Component
 *
 * Displays individual agent actions in the Claude/Cursor style.
 * Each activity type has its own icon and format.
 */

import { 
  Folder, 
  Search, 
  FileText, 
  Terminal, 
  FileEdit,
  Globe,
  Brain,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileReference } from './FileReference';
import { TerminalOutputBlock } from './TerminalOutputBlock';
import type { AgentActivity } from '@/types/agent-activity';

interface AgentActivityItemProps {
  activity: AgentActivity;
}

/**
 * Get the icon and label for an activity type
 */
function getActivityConfig(type: AgentActivity['type']) {
  switch (type) {
    case 'analyzed_directory':
      return { Icon: Folder, label: 'Analyzed', color: 'text-amber-400' };
    case 'searched':
      return { Icon: Search, label: 'Searched', color: 'text-blue-400' };
    case 'analyzed_file':
      return { Icon: FileText, label: 'Analyzed', color: 'text-zinc-400' };
    case 'ran_command':
      return { Icon: Terminal, label: 'Ran', color: 'text-green-400' };
    case 'read_file':
      return { Icon: BookOpen, label: 'Read', color: 'text-cyan-400' };
    case 'write_file':
      return { Icon: FileEdit, label: 'Wrote to', color: 'text-purple-400' };
    case 'web_search':
      return { Icon: Globe, label: 'Searched web', color: 'text-indigo-400' };
    case 'memory_save':
      return { Icon: Brain, label: 'Saved to memory', color: 'text-pink-400' };
    case 'memory_recall':
      return { Icon: Brain, label: 'Recalled from memory', color: 'text-pink-400' };
    default:
      return { Icon: FileText, label: 'Action', color: 'text-zinc-400' };
  }
}

export function AgentActivityItem({ activity }: AgentActivityItemProps) {
  const { Icon, label, color } = getActivityConfig(activity.type);

  // Terminal commands get special rendering
  if (activity.type === 'ran_command') {
    return (
      <TerminalOutputBlock
        command={activity.command}
        output={activity.output}
        workingDirectory={activity.workingDirectory}
        exitCode={activity.exitCode}
        status={activity.status}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 py-1 text-sm text-zinc-400">
      <Icon className={cn('h-4 w-4 flex-shrink-0', color)} />
      <span>{label}</span>
      
      {/* Activity-specific content */}
      {activity.type === 'analyzed_directory' && (
        <span className="text-zinc-300 font-mono text-xs">{activity.path}</span>
      )}
      
      {activity.type === 'searched' && (
        <span className="flex items-center gap-2">
          <span className="text-zinc-300">*{activity.query}*</span>
          {activity.resultCount !== undefined && (
            <span className="text-zinc-500 ml-auto">{activity.resultCount} results</span>
          )}
        </span>
      )}
      
      {activity.type === 'analyzed_file' && (
        <FileReference 
          path={activity.path}
          filename={activity.filename}
          lineRange={activity.lineRange}
        />
      )}
      
      {activity.type === 'read_file' && (
        <FileReference 
          path={activity.path}
          filename={activity.filename}
          lineRange={activity.lineRange}
        />
      )}
      
      {activity.type === 'write_file' && (
        <FileReference 
          path={activity.path}
          filename={activity.filename}
        />
      )}
      
      {activity.type === 'web_search' && (
        <span className="flex items-center gap-2">
          <span className="text-zinc-300">{activity.query}</span>
          {activity.resultCount !== undefined && (
            <span className="text-zinc-500 ml-auto">{activity.resultCount} results</span>
          )}
        </span>
      )}
      
      {activity.type === 'memory_save' && (
        <span className="text-zinc-300">{activity.memoryType}</span>
      )}
      
      {activity.type === 'memory_recall' && (
        <span className="flex items-center gap-2">
          <span className="text-zinc-300">{activity.query}</span>
          {activity.resultCount !== undefined && (
            <span className="text-zinc-500 ml-auto">{activity.resultCount} results</span>
          )}
        </span>
      )}
    </div>
  );
}

export default AgentActivityItem;
