/**
 * Agent Activity Item Component
 *
 * Displays individual agent actions in the Claude/Cursor style.
 * Each activity type has its own icon and format.
 */

import { useState } from 'react';
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
  ChevronDown,
  ChevronRight,
  Package,
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
      case 'edit_file':
        return { Icon: FileEdit, label: 'Edit', color: 'text-purple-400' };
      case 'write_file':
        return { Icon: FileEdit, label: 'Write to', color: 'text-purple-400' };
      case 'move_file':
        return { Icon: FolderInput, label: 'Move', color: 'text-orange-400' };
      case 'copy_file':
        return { Icon: Copy, label: 'Copy', color: 'text-teal-400' };
      case 'list_dir':
        return { Icon: Folder, label: 'Listed', color: 'text-amber-400' };
      case 'list_programs':
        return { Icon: Package, label: 'Programs', color: 'text-amber-400' };
      case 'find_exe':
        return { Icon: Search, label: 'Found exe', color: 'text-cyan-400' };
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
 * Status indicator component with expandable text for long content
 */
function StatusIndicator({ status, output, error, expanded, onToggle }: {
  status: ActivityStatus;
  output?: string;
  error?: string;
  expanded?: boolean;
  onToggle?: () => void;
}) {
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
    const text = error || output || 'Failed';
    const isLong = text.length > 80;
    return (
      <span
        className={cn("text-red-400 text-xs", !expanded && "truncate max-w-[200px]", isLong && "cursor-pointer hover:text-red-300")}
        title={!expanded ? text : undefined}
        onClick={isLong ? onToggle : undefined}
      >
        {text}
      </span>
    );
  }
  if (status === 'success' && output) {
    const isLong = output.length > 80;
    return (
      <span
        className={cn("text-green-400 text-xs", !expanded && "truncate max-w-[200px]", isLong && "cursor-pointer hover:text-green-300")}
        title={!expanded ? output : undefined}
        onClick={isLong ? onToggle : undefined}
      >
        {output}
      </span>
    );
  }
  return null;
}

/**
 * Expandable diff preview for edit_file operations
 */
function EditFilePreview({ oldString, newString }: { oldString?: string; newString?: string }) {
  const [showChanges, setShowChanges] = useState(false);

  if (!oldString && !newString) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setShowChanges(!showChanges)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showChanges ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {showChanges ? 'Hide changes' : 'Show changes'}
      </button>
      {showChanges && (
        <div className="mt-2 space-y-2">
          {oldString && (
            <div>
              <div className="text-xs text-red-400 mb-1">- Remove:</div>
              <pre className="text-xs bg-red-500/10 border border-red-500/20 rounded p-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-red-300">
                {oldString}
              </pre>
            </div>
          )}
          {newString && (
            <div>
              <div className="text-xs text-green-400 mb-1">+ Add:</div>
              <pre className="text-xs bg-green-500/10 border border-green-500/20 rounded p-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-green-300">
                {newString}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
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

  const formatSnippet = (value?: string) => {
    if (!value) return '';
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean.length > 60 ? `${clean.slice(0, 57)}...` : clean;
  };

  let description = '';
  if (activity.type === 'write_file') {
    description = `Write to ${activity.path}`;
  } else if (activity.type === 'edit_file') {
    const oldSnippet = formatSnippet(activity.oldString);
    const newSnippet = formatSnippet(activity.newString);
    const change = oldSnippet || newSnippet ? `Replace "${oldSnippet}" → "${newSnippet}"` : 'Edit file contents';
    description = activity.path ? `${activity.path} · ${change}` : change;
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

      {/* Expandable diff preview for edit_file */}
      {activity.type === 'edit_file' && isPending && (
        <EditFilePreview oldString={activity.oldString} newString={activity.newString} />
      )}
    </div>
  );
}

export function AgentActivityItem({ activity, onApprove, onReject }: AgentActivityItemProps) {
  const config = getActivityConfig(activity.type, activity.status);
  const [expanded, setExpanded] = useState(false);
  const hasExpandableOutput = !!(activity.output || activity.error) && (activity.output?.length ?? 0) + (activity.error?.length ?? 0) > 80;

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
  if (['edit_file', 'write_file', 'generate_file', 'move_file', 'copy_file'].includes(activity.type)) {
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
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 text-sm text-muted-foreground",
          hasExpandableOutput && "cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
        )}
        onClick={hasExpandableOutput ? () => setExpanded(!expanded) : undefined}
      >
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

        {activity.type === 'list_programs' && (
          <>
            <span className="text-foreground/90">Portable programs</span>
            {activity.programCount !== undefined && (
              <span className="text-muted-foreground text-xs ml-auto shrink-0">{activity.programCount} found</span>
            )}
          </>
        )}

        {activity.type === 'find_exe' && (
          <>
            <span className="text-foreground/90 font-mono text-xs truncate">"{activity.query}"</span>
            {activity.matchCount !== undefined && (
              <span className="text-muted-foreground text-xs ml-auto shrink-0">
                {activity.matchCount} {activity.matchCount === 1 ? 'match' : 'matches'}
              </span>
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
              onClick={(e) => { e.stopPropagation(); activity.path && window.open(`file://${activity.path}`, '_blank'); }}
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
        <StatusIndicator
          status={activity.status}
          output={activity.output}
          error={activity.error}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
        />
      </div>

      {/* Expanded output panel */}
      {expanded && (activity.output || activity.error) && (
        <pre className={cn(
          "text-xs ml-6 mt-1 mb-2 p-2 rounded border max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words font-mono",
          activity.error
            ? "text-red-300 bg-red-500/10 border-red-500/20"
            : "text-muted-foreground bg-muted/60 border-border/50"
        )}>
          {activity.error || activity.output}
        </pre>
      )}
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
