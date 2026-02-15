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
  Cpu,
  BookOpen,
  FolderInput,
  Copy,
  Check,
  X,
  Loader2,
  AlertCircle,
  Play,
  Plug,
  FilePlus,
  Paperclip,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FileReference } from './FileReference';
import { TerminalOutputBlock } from './TerminalOutputBlock';
import type { AgentActivity, ActivityStatus } from '@/types/agent-activity';

interface AgentActivityItemProps {
  activity: AgentActivity;
  onApprove?: (activityId: string) => void;
  onReject?: (activityId: string) => void;
}

/**
 * Get the icon and label for an activity type
 */
function getActivityConfig(type: AgentActivity['type'], status: ActivityStatus) {
  const baseConfig = (() => {
    switch (type) {
      case 'analyzed_directory':
        return { Icon: Folder, label: 'Analyzed', color: 'text-amber-400' };
      case 'searched':
        return { Icon: Search, label: 'Searched', color: 'text-blue-400' };
      case 'analyzed_file':
        return { Icon: FileText, label: 'Analyzed', color: 'text-muted-foreground' };
      case 'ran_command':
        return { Icon: Terminal, label: 'Ran', color: 'text-green-400' };
      case 'read_file':
        return { Icon: BookOpen, label: 'Read', color: 'text-cyan-400' };
      case 'write_file':
        return { Icon: FileEdit, label: 'Write to', color: 'text-purple-400' };
      case 'move_file':
        return { Icon: FolderInput, label: 'Move', color: 'text-orange-400' };
      case 'copy_file':
        return { Icon: Copy, label: 'Copy', color: 'text-teal-400' };
      case 'list_dir':
        return { Icon: Folder, label: 'Listed', color: 'text-amber-400' };
      case 'web_search':
        return { Icon: Globe, label: 'Searched web', color: 'text-indigo-400' };
      case 'get_system_info':
        return { Icon: Cpu, label: 'System info', color: 'text-cyan-400' };
      case 'mcp_tool':
        return { Icon: Plug, label: 'MCP tool', color: 'text-blue-400' };
      case 'generate_file':
        return { Icon: FilePlus, label: 'Generated', color: 'text-purple-400' };
      case 'attach_files':
        return { Icon: Paperclip, label: 'Attached', color: 'text-teal-400' };
      default:
        return { Icon: FileText, label: 'Action', color: 'text-muted-foreground' };
    }
  })();

  // Override icon based on status
  if (status === 'running') {
    return { ...baseConfig, Icon: Loader2, iconClass: 'animate-spin' };
  }
  if (status === 'error') {
    return { ...baseConfig, Icon: X, color: 'text-red-400' };
  }
  if (status === 'success') {
    return { ...baseConfig, Icon: Check, color: 'text-green-400' };
  }

  return baseConfig;
}

/**
 * Status indicator component
 */
function StatusIndicator({ status, output, error }: { status: ActivityStatus; output?: string; error?: string }) {
  if (status === 'running') {
    return (
      <span className="text-blue-400 text-xs flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running...
      </span>
    );
  }
  if (status === 'pending_approval') {
    return (
      <span className="text-yellow-500 text-xs flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Approval Required
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-red-400 text-xs truncate max-w-[200px]" title={error || output}>
        {error || output || 'Failed'}
      </span>
    );
  }
  if (status === 'success' && output) {
    return (
      <span className="text-green-400 text-xs truncate max-w-[200px]" title={output}>
        {output}
      </span>
    );
  }
  return null;
}

/**
 * File operation approval block (for write_file, move_file, copy_file)
 */
function FileOperationBlock({ 
  activity, 
  onApprove, 
  onReject 
}: { 
  activity: AgentActivity; 
  onApprove?: () => void; 
  onReject?: () => void;
}) {
  const config = getActivityConfig(activity.type, activity.status);
  const isPending = activity.status === 'pending_approval';
  const isRunning = activity.status === 'running';
  const isError = activity.status === 'error';
  const isSuccess = activity.status === 'success';

  let description = '';
  if (activity.type === 'write_file') {
    description = `Write to ${activity.path}`;
  } else if (activity.type === 'generate_file') {
    description = `Generate file: ${activity.filename}`;
  } else if (activity.type === 'move_file') {
    description = `Move ${activity.src} → ${activity.dest}`;
  } else if (activity.type === 'copy_file') {
    description = `Copy ${activity.src} → ${activity.dest}`;
  }

  return (
    <div className={cn(
      "my-2 rounded-lg border p-3 text-sm",
      isPending && "border-yellow-500/40 bg-yellow-500/10",
      isRunning && "border-blue-500/40 bg-blue-500/10",
      isError && "border-red-500/30 bg-red-500/10",
      isSuccess && "border-green-500/30 bg-green-500/10",
      !isPending && !isRunning && !isError && !isSuccess && "border-border/50 bg-muted/60"
    )}>
      <div className="flex items-center gap-3">
        <config.Icon className={cn(
          'h-4 w-4 shrink-0',
          config.color,
          'iconClass' in config && config.iconClass
        )} />
        
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground truncate">{config.label}</div>
          <div className="text-xs text-muted-foreground truncate font-mono">{description}</div>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 shrink-0">
            {onApprove && (
              <Button
                size="sm"
                variant="default"
                className="h-7 px-3 bg-green-600 hover:bg-green-700 text-white gap-1"
                onClick={onApprove}
              >
                <Play className="h-3 w-3" />
                Run
              </Button>
            )}
            {onReject && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 border-red-500/50 text-red-400 hover:bg-red-500/10 gap-1"
                onClick={onReject}
              >
                <X className="h-3 w-3" />
                Deny
              </Button>
            )}
          </div>
        )}

        {isRunning && (
          <span className="text-blue-400 text-xs flex items-center gap-1 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running...
          </span>
        )}

        {isSuccess && (
          <span className="text-green-400 text-xs flex items-center gap-1 shrink-0">
            <Check className="h-3 w-3" />
            Done
          </span>
        )}

        {isError && (
          <span className="text-red-400 text-xs shrink-0">
            <X className="h-3 w-3 inline mr-1" />
            {activity.error || 'Failed'}
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentActivityItem({ activity, onApprove, onReject }: AgentActivityItemProps) {
  const config = getActivityConfig(activity.type, activity.status);

  // Terminal commands get special rendering
  if (activity.type === 'ran_command') {
    return (
      <TerminalOutputBlock
        command={activity.command}
        output={activity.output}
        error={activity.error}
        workingDirectory={activity.workingDirectory}
        exitCode={activity.exitCode}
        status={activity.status}
        onApprove={onApprove ? () => onApprove(activity.id) : undefined}
        onReject={onReject ? () => onReject(activity.id) : undefined}
      />
    );
  }

  // File operations that need approval get block rendering
  if (['write_file', 'generate_file', 'move_file', 'copy_file'].includes(activity.type)) {
    return (
      <FileOperationBlock
        activity={activity}
        onApprove={onApprove ? () => onApprove(activity.id) : undefined}
        onReject={onReject ? () => onReject(activity.id) : undefined}
      />
    );
  }

  // Standard inline rendering for other activities
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
      <config.Icon className={cn(
        'h-4 w-4 flex-shrink-0', 
        config.color,
        'iconClass' in config && config.iconClass
      )} />
      <span className="shrink-0">{config.label}</span>
      
      {/* Activity-specific content */}
      {activity.type === 'analyzed_directory' && (
        <span className="text-foreground/90 font-mono text-xs truncate">{activity.path}</span>
      )}
      
      {activity.type === 'searched' && (
        <>
          <span className="text-foreground/90 truncate">"{activity.query}"</span>
          {activity.resultCount !== undefined && (
            <span className="text-muted-foreground text-xs ml-auto shrink-0">{activity.resultCount} results</span>
          )}
        </>
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

      {activity.type === 'list_dir' && (
        <>
          <span className="text-foreground/90 font-mono text-xs truncate">{activity.path}</span>
          {activity.entryCount !== undefined && (
            <span className="text-muted-foreground text-xs ml-auto shrink-0">{activity.entryCount} items</span>
          )}
        </>
      )}
      
      {activity.type === 'web_search' && (
        <>
          <span className="text-foreground/90 truncate">{activity.query}</span>
          {activity.resultCount !== undefined && (
            <span className="text-muted-foreground text-xs ml-auto shrink-0">{activity.resultCount} results</span>
          )}
        </>
      )}
      
      {activity.type === 'get_system_info' && (
        <span className="text-foreground/90">Fetching hardware & OS details</span>
      )}

      {activity.type === 'mcp_tool' && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground/90 font-mono text-xs truncate">{activity.toolName}</span>
          {activity.arguments && (
            <span className="text-muted-foreground text-xs truncate">{activity.arguments}</span>
          )}
        </div>
      )}

      {activity.type === 'generate_file' && activity.status === 'success' && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground/90 font-mono text-xs truncate">{activity.filename}</span>
          {activity.size !== undefined && (
            <span className="text-muted-foreground text-xs">({formatFileSize(activity.size)})</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => activity.path && window.open(`file://${activity.path}`, '_blank')}
          >
            <Download className="h-3 w-3 mr-1" />
            Download
          </Button>
        </div>
      )}

      {activity.type === 'attach_files' && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground/90">{activity.fileCount} file(s)</span>
          <span className="text-muted-foreground text-xs truncate">
            {activity.files.map(f => f.name).join(', ')}
          </span>
        </div>
      )}

      {/* Status indicator for non-HITL activities */}
      <StatusIndicator status={activity.status} output={activity.output} error={activity.error} />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default AgentActivityItem;
