import { InstrumentList } from '@/components/agent/InstrumentList';
import { FileCode, Info, Plug, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSettings } from '@/components/settings-context';
import type { AgentSettings } from '@/types/agent';
import type { MCPManagerState } from '@/lib/mcp-manager';

interface AgentRightSidebarProps {
  className?: string;
  onRunInstrument: (name: string) => void;
  mcpState?: MCPManagerState;
  toolSummary?: Array<{ id: string; name: string; desc: string; enabled: boolean; requiresApproval?: boolean }>;
}

/**
 * Quick info panel showing agent capabilities
 */
function AgentInfoPanel({
  mcpState,
  toolSummary,
}: {
  mcpState?: MCPManagerState;
  toolSummary?: Array<{ id: string; name: string; desc: string; enabled: boolean; requiresApproval?: boolean }>;
}) {
  const { settings } = useSettings();
  const agentSettings = settings.agent as AgentSettings | undefined;

  const tools = toolSummary || [
    { id: 'execute_command', name: 'Commands', desc: 'Execute PowerShell', enabled: true },
    { id: 'files', name: 'Files', desc: 'Read, write, copy, move', enabled: true },
    { id: 'get_system_info', name: 'System Info', desc: 'Hardware & OS details', enabled: true },
    { id: 'search_web', name: 'Web Search', desc: 'Search the internet', enabled: agentSettings?.searchProvider !== 'none' },
    { id: 'list_programs', name: 'Programs', desc: 'List portable tools', enabled: true },
  ];

  const mcpServerCount = mcpState?.servers?.length || 0;
  const mcpToolCount = mcpState?.toolCount || 0;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Capabilities</h3>
        <div className="space-y-1.5">
          {tools.map(t => (
            <div key={t.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/40">
              <div>
                <span className="text-xs font-medium text-foreground">{t.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">{t.desc}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {t.requiresApproval && (
                  <Badge variant="outline" className="text-[10px] h-5 text-yellow-500 border-yellow-500/30">
                    HITL
                  </Badge>
                )}
                <Badge variant="outline" className={cn(
                  'text-[10px] h-5',
                  t.enabled ? 'text-green-500 border-green-500/30' : 'text-muted-foreground border-muted'
                )}>
                  {t.enabled ? 'On' : 'Off'}
                </Badge>
              </div>
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
export function AgentRightSidebar({ className, onRunInstrument, mcpState, toolSummary }: AgentRightSidebarProps) {
  return (
    <div className={cn("flex flex-col h-full bg-background overflow-hidden", className)}>
      {/* Instruments Section */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-medium">Instruments</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Custom scripts for the agent</p>
      </div>

      <div className="h-[42%] min-h-[220px] border-b px-4 py-3 shrink-0">
        <InstrumentList onRunInstrument={onRunInstrument} hideHeader />
      </div>

      {/* Info Section */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Agent Info</h2>
          </div>
        </div>
        <ScrollArea className="h-full px-4 py-3">
          <AgentInfoPanel mcpState={mcpState} toolSummary={toolSummary} />
        </ScrollArea>
      </div>
    </div>
  );
}
