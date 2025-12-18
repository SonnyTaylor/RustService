import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { PendingCommand } from '@/types/agent';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CommandHistory() {
  const [history, setHistory] = useState<PendingCommand[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await invoke<PendingCommand[]>('get_command_history', { limit: 50 });
      setHistory(data);
    } catch (err) {
      console.error('Failed to load command history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed':
        return 'text-green-500 bg-green-500/10 border-green-500/30';
      case 'failed':
        return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'rejected':
        return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center p-8">
          <Terminal className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No command history</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-3">
      <div className="flex items-center justify-between shrink-0 px-2 pt-2">
        <h3 className="text-sm font-medium">History</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadHistory} title="Refresh">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-2 pr-2 pb-4">
          {history.map((cmd) => (
            <div key={cmd.id} className="text-sm bg-muted/30 border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', getStatusColor(cmd.status))}>
                  {cmd.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(cmd.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <code className="text-[10px] font-mono block bg-background border p-1.5 rounded break-all mb-1">
                {cmd.command}
              </code>
              {cmd.output && (
                <div className="text-[10px] text-muted-foreground truncate opacity-80">
                  {'>'} {cmd.output.slice(0, 100).replace(/\n/g, ' ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
