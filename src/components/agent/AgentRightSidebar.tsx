import { InstrumentList } from '@/components/agent/InstrumentList';
import { FileCode, Info, Wrench, Plug, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useSettings } from '@/components/settings-context';
import type { AgentSettings } from '@/types/agent';
import type { MCPManagerState } from '@/lib/mcp-manager';

interface AgentRightSidebarProps {
  className?: string;
  onRunInstrument: (name: string) => void;
  mcpState?: MCPManagerState;
}

/**
 * Quick info panel showing agent capabilities
 */
function AgentInfoPanel({ mcpState }: { mcpState?: MCPManagerState }) {
  const { settings } = useSettings();
  const agentSettings = settings.agent as AgentSettings | undefined;

  const tools = [
    { name: 'Commands', desc: 'Execute PowerShell', enabled: true },
    { name: 'Files', desc: 'Read, write, copy, move', enabled: true },
    { name: 'System Info', desc: 'Hardware & OS details', enabled: true },
    { name: 'Web Search', desc: 'Search the internet', enabled: agentSettings?.searchProvider !== 'none' },
    { name: 'Programs', desc: 'List portable tools', enabled: true },
  ];

  const mcpServerCount = mcpState?.servers?.length || 0;
  const mcpToolCount = mcpState?.toolCount || 0;

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
          {/* MCP Tools row */}
          <div className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40">
            <div>
              <span className="text-xs font-medium text-foreground">MCP Tools</span>
              <span className="text-[10px] text-muted-foreground ml-1.5">External servers</span>
            </div>
            <Badge variant="outline" className={cn(
              'text-[10px] h-5',
              mcpServerCount > 0 ? 'text-blue-500 border-blue-500/30' : 'text-muted-foreground border-muted'
            )}>
              {mcpServerCount > 0 ? `${mcpToolCount} tools` : 'Off'}
            </Badge>
          </div>
        </div>
      </div>

      {/* MCP Server Details */}
      {mcpServerCount > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Plug className="h-3.5 w-3.5 text-blue-500" />
            MCP Servers
          </h3>
          <div className="space-y-1.5">
            {mcpState?.servers.map(s => (
              <div key={s.config.id} className="py-1.5 px-2 rounded-md bg-muted/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{s.config.name}</span>
                  <Badge variant="outline" className="text-[10px] h-5 text-green-500 border-green-500/30">
                    {Object.keys(s.tools).length} tools
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.keys(s.tools).slice(0, 5).map(toolName => (
                    <span key={toolName} className="text-[10px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground">
                      {toolName}
                    </span>
                  ))}
                  {Object.keys(s.tools).length > 5 && (
                    <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                      +{Object.keys(s.tools).length - 5} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MCP Errors */}
      {mcpState?.errors && mcpState.errors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5 text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            Connection Errors
          </h3>
          <div className="space-y-1">
            {mcpState.errors.map(err => (
              <div key={err.serverId} className="text-[10px] text-red-400 px-2 py-1 rounded bg-red-500/10">
                <span className="font-medium">{err.serverName}:</span> {err.error}
              </div>
            ))}
          </div>
        </div>
      )}

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
 * Shows instruments, MCP servers, and agent info
 */
export function AgentRightSidebar({ className, onRunInstrument, mcpState }: AgentRightSidebarProps) {
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
        <AgentInfoPanel mcpState={mcpState} />
      </div>
    </div>
  );
}
