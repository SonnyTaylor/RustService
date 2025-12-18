/**
 * Terminal Output Block Component
 *
 * Collapsible terminal output display matching Claude/Cursor style.
 * Shows working directory, command, output, and exit code.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface TerminalOutputBlockProps {
  command: string;
  output?: string;
  workingDirectory?: string;
  exitCode?: number;
  status?: 'running' | 'success' | 'error';
  defaultExpanded?: boolean;
}

export function TerminalOutputBlock({
  command,
  output,
  workingDirectory,
  exitCode,
  status = 'success',
  defaultExpanded = false,
}: TerminalOutputBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textToCopy = output || command;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isRunning = status === 'running';
  const isError = status === 'error' || (exitCode !== undefined && exitCode !== 0);

  return (
    <div className="my-2 rounded-lg border border-border/50 bg-zinc-950 overflow-hidden font-mono text-sm">
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
            <span className="text-zinc-500">…\{workingDirectory?.split('\\').slice(-1)[0] || 'shell'} &gt;</span>
            <span className="text-zinc-200">{command}</span>
          </div>
        </div>

        {/* Output (Collapsible) */}
        {expanded && output && (
          <div className="pl-8 pr-4 pb-2 max-h-[250px] overflow-y-auto">
            <pre className="text-zinc-400 whitespace-pre-wrap break-words text-xs leading-relaxed">
              {output}
            </pre>
          </div>
        )}

        {/* Scrollbar track visible indicator */}
        {expanded && output && output.length > 500 && (
          <div className="absolute right-0 top-10 bottom-0 w-1.5 bg-zinc-800/50" />
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border/30 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-zinc-500">
          <Terminal className="h-3 w-3" />
          <span>Ran terminal command</span>
          <button className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors">
            Open Terminal <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {isRunning ? (
            <span className="text-yellow-500 animate-pulse">Running...</span>
          ) : (
            <span className={cn(
              isError ? 'text-red-400' : 'text-green-400'
            )}>
              Exit code {exitCode ?? 0}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TerminalOutputBlock;
