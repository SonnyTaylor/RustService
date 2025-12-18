/**
 * Terminal Output Block Component
 *
 * Collapsible terminal output display matching Claude/Cursor style.
 * Shows working directory, command, output, and exit code.
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
      isPending && "border-yellow-500/50 bg-yellow-950/20",
      isRunning && "border-blue-500/50 bg-blue-950/20",
      isError && "border-red-500/30 bg-zinc-950",
      isSuccess && "border-green-500/30 bg-zinc-950",
      !isPending && !isRunning && !isError && !isSuccess && "border-border/50 bg-zinc-950"
    )}>
      {/* Working Directory Header */}
      {workingDirectory && (
        <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-border/30 flex items-center gap-1">
          <span className="text-green-500">⊞</span>
          <span>Working directory:</span>
          <span className="text-zinc-400">{workingDirectory}</span>
        </div>
      )}

      {/* Command + Output */}
      <div className="relative group">
        {/* Expand/Collapse Toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="absolute left-0 top-0 bottom-0 w-8 flex items-start justify-center pt-2 text-zinc-500 hover:text-zinc-300 transition-colors"
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
          className="absolute right-2 top-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-300"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>

        {/* Command Line */}
        <div className="pl-8 pr-10 py-2">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 shrink-0">
              …\{workingDirectory?.split('\\').slice(-1)[0] || 'shell'} &gt;
            </span>
            <span className="text-zinc-200 break-all">{command}</span>
          </div>
        </div>

        {/* Output (Collapsible) */}
        {expanded && displayOutput && (
          <div className="pl-8 pr-4 pb-2 max-h-[250px] overflow-y-auto">
            <pre className={cn(
              "whitespace-pre-wrap break-words text-xs leading-relaxed",
              isError ? "text-red-400" : "text-zinc-400"
            )}>
              {displayOutput}
            </pre>
          </div>
        )}

        {/* Scrollbar track visible indicator */}
        {expanded && displayOutput && displayOutput.length > 500 && (
          <div className="absolute right-0 top-10 bottom-0 w-1.5 bg-zinc-800/50" />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border/30 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-zinc-500">
          <Terminal className="h-3 w-3" />
          <span>Terminal command</span>
        </div>
        
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1.5 text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running...
            </span>
          )}
          
          {isPending && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-yellow-500 font-medium">
                <AlertCircle className="h-3 w-3" />
                Approval Required
              </span>
              {onApprove && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 px-3 bg-green-600 hover:bg-green-700 text-white gap-1"
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
                  className="h-7 px-3 border-red-500/50 text-red-400 hover:bg-red-500/10 gap-1"
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
              isError ? 'text-red-400' : 'text-green-400'
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
