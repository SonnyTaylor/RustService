import { InstrumentList } from '@/components/agent/InstrumentList';
import { FileCode, Info, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/components/settings-context';
import type { AgentSettings } from '@/types/agent';

interface AgentRightSidebarProps {
  className?: string;
  onRunInstrument: (name: string) => void;
}

/**
 * Quick info panel showing agent capabilities
 */
function AgentInfoPanel() {
  const { settings } = useSettings();
  const agentSettings = settings.agent as AgentSettings | undefined;

  const tools = [
    { name: 'Commands', desc: 'Execute PowerShell', enabled: true },
    { name: 'Files', desc: 'Read, write, copy, move', enabled: true },
    { name: 'System Info', desc: 'Hardware & OS details', enabled: true },
    { name: 'Web Search', desc: 'Search the internet', enabled: agentSettings?.searchProvider !== 'none' },
    { name: 'Programs', desc: 'List portable tools', enabled: true },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Capabilities</h3>
        <div className="space-y-1.5">
          {tools.map(t => (
            <div key={t.name} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40">
              <div>
                <span className="text-xs font-medium text-foreground">{t.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">{t.desc}</span>
              </div>
              <Badge variant="outline" className={cn(
                'text-[10px] h-5',
                t.enabled ? 'text-green-500 border-green-500/30' : 'text-muted-foreground border-muted'
              )}>
                {t.enabled ? 'On' : 'Off'}
              </Badge>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-1">Model</h3>
        <p className="text-xs text-muted-foreground font-mono bg-muted/40 px-2 py-1.5 rounded-md">
          {agentSettings?.model || 'Not configured'}
        </p>
      </div>
    </div>
  );
}

/**
 * Agent Right Sidebar
 * Shows instruments and agent info
 */
export function AgentRightSidebar({ className, onRunInstrument }: AgentRightSidebarProps) {
  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Instruments Section */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Instruments</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Custom scripts for the agent</p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <InstrumentList onRunInstrument={onRunInstrument} />
      </div>

      {/* Info Section */}
      <div className="px-4 py-3 border-t shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Agent Info</h2>
        </div>
        <AgentInfoPanel />
      </div>
    </div>
  );
}
