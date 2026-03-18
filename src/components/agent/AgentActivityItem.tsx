/**
 * Agent Activity Item Component
 *
 * Displays individual agent actions in the Claude/Cursor style.
 * Each activity type has its own icon and format.
 * Uses CSS variable theme classes for consistent styling.
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
  Pause,
  RotateCcw,
  XCircle,
  ClipboardList,
  FileBarChart,
  PenLine,
  FileOutput,
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
        return { Icon: Folder, label: 'Analyzed', color: 'text-chart-4' };
      case 'searched':
        return { Icon: Search, label: 'Searched', color: 'text-chart-1' };
      case 'analyzed_file':
        return { Icon: FileText, label: 'Analyzed', color: 'text-muted-foreground' };
      case 'ran_command':
        return { Icon: Terminal, label: 'Ran', color: 'text-chart-2' };
      case 'read_file':
        return { Icon: BookOpen, label: 'Read', color: 'text-primary' };
      case 'edit_file':
        return { Icon: FileEdit, label: 'Edit', color: 'text-chart-5' };
      case 'write_file':
        return { Icon: FileEdit, label: 'Write to', color: 'text-chart-5' };
      case 'move_file':
        return { Icon: FolderInput, label: 'Move', color: 'text-chart-4' };
      case 'copy_file':
        return { Icon: Copy, label: 'Copy', color: 'text-primary' };
      case 'list_dir':
        return { Icon: Folder, label: 'Listed', color: 'text-chart-4' };
      case 'list_programs':
        return { Icon: Package, label: 'Programs', color: 'text-chart-4' };
      case 'find_exe':
        return { Icon: Search, label: 'Found exe', color: 'text-primary' };
      case 'web_search':
        return { Icon: Globe, label: 'Searched web', color: 'text-chart-5' };
      case 'get_system_info':
        return { Icon: Cpu, label: 'System info', color: 'text-primary' };
      case 'mcp_tool':
        return { Icon: Plug, label: 'MCP tool', color: 'text-chart-1' };
      case 'generate_file':
        return { Icon: FilePlus, label: 'Generated', color: 'text-chart-5' };
      case 'attach_files':
        return { Icon: Paperclip, label: 'Attached', color: 'text-primary' };
      // Service activity types
      case 'service_queue_started':
        return { Icon: Play, label: 'Service Queue', color: 'text-chart-2' };
      case 'service_paused':
        return { Icon: Pause, label: 'Paused', color: 'text-chart-4' };
      case 'service_resumed':
        return { Icon: RotateCcw, label: 'Resumed', color: 'text-chart-2' };
      case 'service_cancelled':
        return { Icon: XCircle, label: 'Cancelled', color: 'text-destructive' };
      case 'service_query':
        return { Icon: ClipboardList, label: 'Service Query', color: 'text-chart-1' };
      case 'service_report':
        return { Icon: FileBarChart, label: 'Report', color: 'text-chart-1' };
      case 'service_edit':
        return { Icon: PenLine, label: 'Edit Report', color: 'text-chart-5' };
      case 'service_pdf':
        return { Icon: FileOutput, label: 'PDF Report', color: 'text-chart-5' };
      default:
        return { Icon: FileText, label: 'Action', color: 'text-muted-foreground' };
    }
  })();

  // Override icon based on status
  if (status === 'running') {
    return { ...baseConfig, Icon: Loader2, iconClass: 'animate-spin' };
  }
  if (status === 'error') {
    return { ...baseConfig, Icon: X, color: 'text-destructive' };
  }
  if (status === 'success') {
    return { ...baseConfig, Icon: Check, color: 'text-chart-2' };
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
      <span className="text-chart-1 text-xs flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running...
      </span>
    );
  }
  if (status === 'pending_approval') {
    return (
      <span className="text-chart-4 text-xs flex items-center gap-1">
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
        className={cn("text-destructive text-xs", !expanded && "truncate max-w-[200px]", isLong && "cursor-pointer hover:opacity-80")}
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
        className={cn("text-chart-2 text-xs", !expanded && "truncate max-w-[200px]", isLong && "cursor-pointer hover:opacity-80")}
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
              <div className="text-xs text-destructive mb-1">- Remove:</div>
              <pre className="text-xs bg-destructive/10 border border-destructive/20 rounded p-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-destructive">
                {oldString}
              </pre>
            </div>
          )}
          {newString && (
            <div>
              <div className="text-xs text-chart-2 mb-1">+ Add:</div>
              <pre className="text-xs bg-chart-2/10 border border-chart-2/20 rounded p-2 max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-chart-2">
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
 * Service activity block (for service_queue_started, service_paused, service_resumed, service_cancelled)
 */
function ServiceActivityBlock({
  activity,
  onApprove,
  onReject,
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
  let reason = '';

  if (activity.type === 'service_queue_started') {
    description = `Start service queue (${activity.serviceCount} services)`;
    reason = activity.reason || '';
  } else if (activity.type === 'service_paused') {
    description = 'Pause service run';
    reason = activity.reason || '';
  } else if (activity.type === 'service_resumed') {
    description = 'Resume service run';
    reason = activity.reason || '';
  } else if (activity.type === 'service_cancelled') {
    description = 'Cancel service run';
    reason = activity.reason || '';
  } else if (activity.type === 'service_pdf') {
    description = `Generate PDF report${activity.filename ? `: ${activity.filename}` : ''}`;
  }

  return (
    <div className={cn(
      "my-2 rounded-lg border p-3 text-sm",
      isPending && "border-primary/40 bg-primary/5",
      isRunning && "border-primary/40 bg-primary/5",
      isError && "border-destructive/30 bg-destructive/5",
      isSuccess && "border-chart-2/30 bg-chart-2/5",
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
          <div className="text-xs text-muted-foreground truncate">{description}</div>
          {reason && (
            <div className="text-xs text-muted-foreground/70 truncate mt-0.5 italic">{reason}</div>
          )}
        </div>

        {isPending && (
          <div className="flex items-center gap-2 shrink-0">
            {onApprove && (
              <Button
                size="sm"
                variant="default"
                className="h-7 px-3 gap-1"
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
                className="h-7 px-3 gap-1"
                onClick={onReject}
              >
                <X className="h-3 w-3" />
                Deny
              </Button>
            )}
          </div>
        )}

        {isRunning && (
          <span className="text-chart-1 text-xs flex items-center gap-1 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running...
          </span>
        )}

        {isSuccess && (
          <span className="text-chart-2 text-xs flex items-center gap-1 shrink-0">
            <Check className="h-3 w-3" />
            Done
          </span>
        )}

        {isError && (
          <span className="text-destructive text-xs shrink-0">
            <X className="h-3 w-3 inline mr-1" />
            {activity.error || 'Failed'}
          </span>
        )}
      </div>
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
    const change = oldSnippet || newSnippet ? `Replace "${oldSnippet}" \u2192 "${newSnippet}"` : 'Edit file contents';
    description = activity.path ? `${activity.path} \u00b7 ${change}` : change;
  } else if (activity.type === 'generate_file') {
    description = `Generate file: ${activity.filename}`;
  } else if (activity.type === 'move_file') {
    description = `Move ${activity.src} \u2192 ${activity.dest}`;
  } else if (activity.type === 'copy_file') {
    description = `Copy ${activity.src} \u2192 ${activity.dest}`;
  }

  return (
    <div className={cn(
      "my-2 rounded-lg border p-3 text-sm",
      isPending && "border-chart-4/40 bg-chart-4/10",
      isRunning && "border-primary/40 bg-primary/5",
      isError && "border-destructive/30 bg-destructive/5",
      isSuccess && "border-chart-2/30 bg-chart-2/5",
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
                className="h-7 px-3 gap-1"
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
                className="h-7 px-3 gap-1"
                onClick={onReject}
              >
                <X className="h-3 w-3" />
                Deny
              </Button>
            )}
          </div>
        )}

        {isRunning && (
          <span className="text-chart-1 text-xs flex items-center gap-1 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin" />
            Running...
          </span>
        )}

        {isSuccess && (
          <span className="text-chart-2 text-xs flex items-center gap-1 shrink-0">
            <Check className="h-3 w-3" />
            Done
          </span>
        )}

        {isError && (
          <span className="text-destructive text-xs shrink-0">
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

  // Service control activities get block rendering
  if (['service_queue_started', 'service_paused', 'service_resumed', 'service_cancelled', 'service_pdf'].includes(activity.type)) {
    return (
      <ServiceActivityBlock
        activity={activity}
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

        {/* Service query/report/edit inline display */}
        {activity.type === 'service_query' && (
          <span className="text-foreground/90 text-xs truncate">{activity.queryType}{activity.detail ? `: ${activity.detail}` : ''}</span>
        )}

        {activity.type === 'service_report' && (
          <span className="text-foreground/90 text-xs truncate">{activity.reportAction}{activity.reportId ? ` (${activity.reportId})` : ''}</span>
        )}

        {activity.type === 'service_edit' && (
          <span className="text-foreground/90 text-xs truncate">{activity.editAction}{activity.detail ? `: ${activity.detail}` : ''}</span>
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
            ? "text-destructive bg-destructive/10 border-destructive/20"
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
