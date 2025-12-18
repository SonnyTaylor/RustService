/**
 * Inline Command Approval Component
 * 
 * Shows command approval UI inline in chat messages,
 * similar to agentic IDEs like Cursor/GitHub Copilot.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PendingCommand } from '@/types/agent';

interface InlineCommandApprovalProps {
  command: PendingCommand;
  onApproved: (result: PendingCommand) => void;
  onRejected: (result: PendingCommand) => void;
}

/**
 * Inline command approval card for chat messages
 */
export function InlineCommandApproval({
  command,
  onApproved,
  onRejected,
}: InlineCommandApprovalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = async () => {
    setIsProcessing(true);
    setAction('approve');
    try {
      const result = await invoke<PendingCommand>('approve_command', {
        command_id: command.id,
      });
      onApproved(result);
    } catch (error) {
      console.error('Failed to approve command:', error);
      setIsProcessing(false);
      setAction(null);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    setAction('reject');
    try {
      const result = await invoke<PendingCommand>('reject_command', {
        command_id: command.id,
      });
      onRejected(result);
    } catch (error) {
      console.error('Failed to reject command:', error);
      setIsProcessing(false);
      setAction(null);
    }
  };

  return (
    <div className="my-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
      {/* Command header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-yellow-500/20 bg-yellow-500/10">
        <Terminal className="h-4 w-4 text-yellow-500" />
        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
          Command requires approval
        </span>
      </div>

      {/* Command content */}
      <div className="p-3">
        <code className="block text-sm font-mono bg-muted/50 rounded p-2 break-all whitespace-pre-wrap">
          {command.command}
        </code>

        {command.reason && (
          <p className="text-xs text-muted-foreground mt-2">
            {command.reason}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="default"
            className={cn(
              "flex-1 gap-2",
              "bg-green-600 hover:bg-green-700 text-white"
            )}
            onClick={handleApprove}
            disabled={isProcessing}
          >
            {isProcessing && action === 'approve' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "flex-1 gap-2",
              "border-red-500/50 text-red-500 hover:bg-red-500/10"
            )}
            onClick={handleReject}
            disabled={isProcessing}
          >
            {isProcessing && action === 'reject' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Executed command result display
 */
export function CommandResultDisplay({
  command,
  status,
}: {
  command: PendingCommand;
  status: 'executed' | 'rejected';
}) {
  const isSuccess = status === 'executed';
  
  return (
    <div className={cn(
      "my-3 rounded-lg border overflow-hidden",
      isSuccess 
        ? "border-green-500/30 bg-green-500/5" 
        : "border-red-500/30 bg-red-500/5"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 border-b",
        isSuccess 
          ? "border-green-500/20 bg-green-500/10" 
          : "border-red-500/20 bg-red-500/10"
      )}>
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span className={cn(
          "text-xs font-medium",
          isSuccess ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        )}>
          {isSuccess ? 'Command executed' : 'Command rejected'}
        </span>
      </div>

      {/* Command */}
      <div className="p-3">
        <code className="block text-sm font-mono bg-muted/50 rounded p-2 break-all whitespace-pre-wrap">
          {command.command}
        </code>

        {/* Output */}
        {isSuccess && command.output && (
          <div className="mt-3">
            <p className="text-xs text-muted-foreground mb-1">Output:</p>
            <pre className="text-xs font-mono bg-muted/30 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
              {command.output}
            </pre>
          </div>
        )}

        {/* Error */}
        {command.error && (
          <div className="mt-3">
            <p className="text-xs text-red-500 mb-1">Error:</p>
            <pre className="text-xs font-mono bg-red-500/10 rounded p-2 max-h-40 overflow-auto text-red-500 whitespace-pre-wrap">
              {command.error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default InlineCommandApproval;
