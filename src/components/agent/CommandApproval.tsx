/**
 * Command Approval Component
 * 
 * Modal and list for approving/rejecting pending commands
 * from the AI agent.
 */

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PendingCommand } from '@/types/agent';

interface CommandApprovalProps {
  pendingCommands: PendingCommand[];
  onCommandApproved: (result: PendingCommand) => void;
  onCommandRejected: (result: PendingCommand) => void;
}

interface CommandItemProps {
  command: PendingCommand;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}

/**
 * Single command approval item
 */
function CommandItem({ command, onApprove, onReject, isProcessing }: CommandItemProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="border-yellow-500/50 bg-yellow-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setExpanded(!expanded)}
              className="hover:bg-muted rounded p-1 -ml-1"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            <Terminal className="h-4 w-4 text-yellow-500" />
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">
              <Clock className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(command.createdAt).toLocaleTimeString()}
          </span>
        </div>
        <CardTitle className="text-sm font-mono mt-2 break-all">
          {command.command}
        </CardTitle>
        {command.reason && (
          <CardDescription className="text-xs mt-1">
            {command.reason}
          </CardDescription>
        )}
      </CardHeader>
      
      {expanded && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-green-500/50 text-green-500 hover:bg-green-500/10"
              onClick={onApprove}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10"
              onClick={onReject}
              disabled={isProcessing}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Command approval list/panel
 */
export function CommandApprovalPanel({
  pendingCommands,
  onCommandApproved,
  onCommandRejected,
}: CommandApprovalProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<PendingCommand | null>(null);

  const handleApprove = async (command: PendingCommand) => {
    setProcessingId(command.id);
    try {
      const result = await invoke<PendingCommand>('approve_command', {
        command_id: command.id,
      });
      onCommandApproved(result);
    } catch (error) {
      console.error('Failed to approve command:', error);
      alert(`Failed to approve command: ${error}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (command: PendingCommand) => {
    setProcessingId(command.id);
    try {
      const result = await invoke<PendingCommand>('reject_command', {
        command_id: command.id,
      });
      onCommandRejected(result);
    } catch (error) {
      console.error('Failed to reject command:', error);
      alert(`Failed to reject command: ${error}`);
    } finally {
      setProcessingId(null);
      setConfirmReject(null);
    }
  };

  if (pendingCommands.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="border-yellow-500/30">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-base">
              Pending Approvals ({pendingCommands.length})
            </CardTitle>
          </div>
          <CardDescription>
            The agent wants to execute the following commands. Review and approve or reject.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-3">
              {pendingCommands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  onApprove={() => handleApprove(cmd)}
                  onReject={() => setConfirmReject(cmd)}
                  isProcessing={processingId === cmd.id}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Confirm reject dialog */}
      <AlertDialog open={!!confirmReject} onOpenChange={() => setConfirmReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Command?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this command? The agent will be notified 
              and may try a different approach.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 p-3 bg-muted rounded-lg">
            <code className="text-sm font-mono break-all">
              {confirmReject?.command}
            </code>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => confirmReject && handleReject(confirmReject)}
            >
              Reject Command
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Compact approval badge for inline display
 */
export function PendingApprovalBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 animate-pulse">
      <AlertTriangle className="h-3 w-3 mr-1" />
      {count} pending
    </Badge>
  );
}

export default CommandApprovalPanel;

