import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { InstrumentList } from '@/components/agent/InstrumentList';
import { BehaviorSettings } from '@/components/agent/BehaviorSettings';
import { FileCode, Brain, BookOpen, Database } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface MemoryStats {
  total: number;
  by_type: Record<string, number>;
}

interface AgentRightSidebarProps {
  className?: string;
  onRunInstrument: (name: string) => void;
}

/**
 * Quick memory stats panel
 */
function MemoryStatsPanel() {
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await invoke<MemoryStats>('get_memory_stats');
        setStats(data);
      } catch (err) {
        console.error('Failed to load memory stats:', err);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>;
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Database className="h-8 w-8 mx-auto text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No memories stored yet</p>
        <p className="text-xs text-muted-foreground/70">
          The agent will remember facts, solutions, and context as you interact.
        </p>
      </div>
    );
  }

  const typeLabels: Record<string, { label: string; color: string }> = {
    fact: { label: 'Facts', color: 'text-blue-500 bg-blue-500/10' },
    solution: { label: 'Solutions', color: 'text-green-500 bg-green-500/10' },
    conversation: { label: 'Conversations', color: 'text-purple-500 bg-purple-500/10' },
    instruction: { label: 'Instructions', color: 'text-orange-500 bg-orange-500/10' },
    system_state: { label: 'System State', color: 'text-cyan-500 bg-cyan-500/10' },
    knowledge: { label: 'Knowledge', color: 'text-yellow-500 bg-yellow-500/10' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Memory Store</h3>
        <span className="text-xs text-muted-foreground">{stats.total} total</span>
      </div>
      <div className="space-y-1.5">
        {Object.entries(stats.by_type).map(([type, count]) => {
          const config = typeLabels[type] || { label: type, color: 'text-muted-foreground bg-muted' };
          return (
            <div key={type} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40">
              <span className={cn('text-xs font-medium', config.color.split(' ')[0])}>{config.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Agent Right Sidebar
 * Tabbed sidebar with Instruments, Behaviors, and Memory panels
 */
export function AgentRightSidebar({ className, onRunInstrument }: AgentRightSidebarProps) {
  return (
    <div className={cn("flex flex-col h-full bg-background border-l", className)}>
      <Tabs defaultValue="instruments" className="flex flex-col h-full">
        <div className="px-3 pt-2 border-b shrink-0">
          <TabsList className="w-full h-9 bg-muted/50">
            <TabsTrigger value="instruments" className="flex-1 gap-1.5 text-xs">
              <FileCode className="h-3 w-3" />
              <span className="hidden xl:inline">Instruments</span>
            </TabsTrigger>
            <TabsTrigger value="behaviors" className="flex-1 gap-1.5 text-xs">
              <BookOpen className="h-3 w-3" />
              <span className="hidden xl:inline">Behaviors</span>
            </TabsTrigger>
            <TabsTrigger value="memory" className="flex-1 gap-1.5 text-xs">
              <Brain className="h-3 w-3" />
              <span className="hidden xl:inline">Memory</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="instruments" className="flex-1 min-h-0 overflow-auto p-4 mt-0">
          <InstrumentList onRunInstrument={onRunInstrument} />
        </TabsContent>

        <TabsContent value="behaviors" className="flex-1 min-h-0 overflow-auto p-4 mt-0">
          <BehaviorSettings />
        </TabsContent>

        <TabsContent value="memory" className="flex-1 min-h-0 overflow-auto p-4 mt-0">
          <MemoryStatsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
