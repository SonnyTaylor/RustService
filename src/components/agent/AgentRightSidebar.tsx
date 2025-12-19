import { InstrumentList } from '@/components/agent/InstrumentList';
import { FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentRightSidebarProps {
  className?: string;
  onRunInstrument: (name: string) => void;
}

/**
 * Agent Right Sidebar
 * Displays custom instruments/scripts that can be run by the agent
 */
export function AgentRightSidebar({ className, onRunInstrument }: AgentRightSidebarProps) {
  return (
    <div className={cn("flex flex-col h-full bg-background border-l", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Instruments</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Custom scripts available to the agent
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <InstrumentList onRunInstrument={onRunInstrument} />
      </div>
    </div>
  );
}
