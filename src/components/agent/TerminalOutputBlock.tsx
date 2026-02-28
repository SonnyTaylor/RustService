/**
 * Terminal Output Block Component
 *
 * Collapsible terminal output display matching Claude/Cursor style.
 * Shows working directory, command, output, and exit code.
 * Uses CSS variable theme classes for consistent styling.
 */

import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  X,
  ExternalLink,
  Terminal,
  Loader2,
  Play,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ActivityStatus } from '@/types/agent-activity';

interface TerminalOutputBlockProps {
  command: string;
  output?: string;
  error?: string;
  workingDirectory?: string;
  exitCode?: number;
  status?: ActivityStatus;
  defaultExpanded?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}

export function TerminalOutputBlock({
  command,
  output,
  error,
  workingDirectory,
  exitCode,
  status = 'success',
  defaultExpanded = false,
  onApprove,
  onReject,
}: TerminalOutputBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  // Auto-expand when we get output or on error
  useEffect(() => {
    if (output || error || status === 'error') {
      setExpanded(true);
    }
  }, [output, error, status]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = output || error || command;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRunning = status === 'running';
  const isPending = status === 'pending_approval';
  const isError = status === 'error' || (exitCode !== undefined && exitCode !== 0);
  const isSuccess = status === 'success' && !isError;
  const displayOutput = output || error || '';

  return (
    <div className={cn(
      "my-2 rounded-lg border overflow-hidden font-mono text-sm",
      isPending && "border-chart-4/40 bg-chart-4/10",
      isRunning && "border-primary/40 bg-primary/5",
      isError && "border-destructive/30 bg-destructive/5",
      isSuccess && "border-chart-2/30 bg-chart-2/5",
      !isPending && !isRunning && !isError && !isSuccess && "border-border/50 bg-muted/60"
    )}>
      {/* Working Directory Header */}
      {workingDirectory && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/30 flex items-center gap-1">
          <span className="text-chart-2">{'\u229E'}</span>
          <span>Working directory:</span>
          <span className="text-foreground/80">{workingDirectory}</span>
        </div>
      )}

      {/* Command + Output */}
      <div className="relative group">
        {/* Expand/Collapse Toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute left-0 top-0 bottom-0 w-8 flex items-start justify-center pt-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Copy Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>

        {/* Command Line */}
        <div className="pl-8 pr-10 py-2">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">
              {'\u2026'}\\{workingDirectory?.split('\\').slice(-1)[0] || 'shell'} &gt;
            </span>
            {command ? (
              <span className="text-foreground/90 break-all">{command}</span>
            ) : (
              <span className="text-destructive italic text-xs">
                (no command - malformed tool call)
              </span>
            )}
          </div>
        </div>

        {/* Output (Collapsible) */}
        {expanded && displayOutput && (
          <div className="pl-8 pr-4 pb-2 max-h-[250px] overflow-y-auto">
            <pre className={cn(
              "whitespace-pre-wrap break-words text-xs leading-relaxed",
              isError ? "text-destructive" : "text-muted-foreground"
            )}>
              {displayOutput}
            </pre>
          </div>
        )}

        {/* Scrollbar track visible indicator */}
        {expanded && displayOutput && displayOutput.length > 500 && (
          <div className="absolute right-0 top-10 bottom-0 w-1.5 bg-muted/60" />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-3 w-3" />
          <span>Terminal command</span>
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running...
            </span>
          )}

          {isPending && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-chart-4 font-medium">
                <AlertCircle className="h-3 w-3" />
                Approval Required
              </span>
              {onApprove && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-3 gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove();
                  }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject();
                  }}
                >
                  <X className="h-3 w-3" />
                  Deny
                </Button>
              )}
            </div>
          )}

          {!isRunning && !isPending && (
            <span className={cn(
              "flex items-center gap-1",
              isError ? 'text-destructive' : 'text-chart-2'
            )}>
              {isError ? (
                <X className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              {exitCode !== undefined ? `Exit code ${exitCode}` : (isError ? 'Failed' : 'Success')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TerminalOutputBlock;
