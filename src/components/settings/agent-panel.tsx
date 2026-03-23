/**
 * Agent Panel Component
 *
 * AI provider configuration, command execution settings, web search,
 * MCP server settings, and MCP client connections.
 */

import { useState } from 'react';
import {
  Check,
  Plus,
  Pencil,
  X,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Globe,
  AlertTriangle,
  Sparkles,
  Terminal,
  Trash2,
  Layers,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/components/settings-context';
import { AGENT_PROVIDERS, type ProviderApiKeys, type MCPServerConfig } from '@/types/agent';

// =============================================================================
// MCP Connections Card
// =============================================================================

/**
 * MCP Connections Card - Configure external MCP servers the agent connects to
 */
function MCPConnectionsCard({ agentSettings, updateSetting, isLoading }: {
  agentSettings: any;
  updateSetting: (key: string, value: any) => Promise<void>;
  isLoading: boolean;
}) {
  const [editingServer, setEditingServer] = useState<MCPServerConfig | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const mcpServers: MCPServerConfig[] = agentSettings?.mcpServers || [];

  const handleAddServer = async () => {
    const newServer: MCPServerConfig = {
      id: crypto.randomUUID().replace(/-/g, '').substring(0, 12),
      name: editingServer?.name || 'New Server',
      url: editingServer?.url || '',
      transportType: editingServer?.transportType || 'sse',
      enabled: true,
      apiKey: editingServer?.apiKey || undefined,
    };
    const newServers = [...mcpServers, newServer];
    await updateSetting('agent', { ...agentSettings, mcpServers: newServers });
    setEditingServer(null);
    setIsAdding(false);
  };

  const handleUpdateServer = async (id: string, updates: Partial<MCPServerConfig>) => {
    const newServers = mcpServers.map(s => s.id === id ? { ...s, ...updates } : s);
    await updateSetting('agent', { ...agentSettings, mcpServers: newServers });
  };

  const handleRemoveServer = async (id: string) => {
    const newServers = mcpServers.filter(s => s.id !== id);
    await updateSetting('agent', { ...agentSettings, mcpServers: newServers });
  };

  const handleSaveEdit = async () => {
    if (!editingServer) return;
    const existing = mcpServers.find(s => s.id === editingServer.id);
    if (existing) {
      await handleUpdateServer(editingServer.id, editingServer);
    } else {
      const newServers = [...mcpServers, editingServer];
      await updateSetting('agent', { ...agentSettings, mcpServers: newServers });
    }
    setEditingServer(null);
    setIsAdding(false);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Layers className="h-5 w-5 text-blue-500" />
          MCP Connections
          {mcpServers.filter(s => s.enabled).length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {mcpServers.filter(s => s.enabled).length} active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Connect to external MCP servers to extend the agent with additional tools
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server List */}
        {mcpServers.length > 0 && (
          <div className="space-y-2">
            {mcpServers.map(server => (
              <div key={server.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/50">
                <Switch
                  checked={server.enabled}
                  onCheckedChange={(checked) => handleUpdateServer(server.id, { enabled: checked })}
                  disabled={isLoading}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{server.name}</span>
                    <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                      {server.transportType.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingServer({ ...server });
                      setIsAdding(false);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => handleRemoveServer(server.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Form */}
        {(isAdding || editingServer) && (
          <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={editingServer?.name || ''}
                  onChange={(e) => setEditingServer(prev => prev ? { ...prev, name: e.target.value } : {
                    id: crypto.randomUUID().replace(/-/g, '').substring(0, 12),
                    name: e.target.value,
                    url: '',
                    transportType: 'sse' as const,
                    enabled: true,
                  })}
                  placeholder="My MCP Server"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Transport</Label>
                <Select
                  value={editingServer?.transportType || 'sse'}
                  onValueChange={(value) => setEditingServer(prev => prev ? { ...prev, transportType: value as 'sse' | 'http' } : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                    <SelectItem value="http">HTTP (Streamable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">URL</Label>
              <Input
                value={editingServer?.url || ''}
                onChange={(e) => setEditingServer(prev => prev ? { ...prev, url: e.target.value } : null)}
                placeholder="http://localhost:3000/mcp"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Key (optional)</Label>
              <Input
                type="password"
                value={editingServer?.apiKey || ''}
                onChange={(e) => setEditingServer(prev => prev ? { ...prev, apiKey: e.target.value || undefined } : null)}
                placeholder="Bearer token for authentication"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSaveEdit} disabled={!editingServer?.name || !editingServer?.url}>
                <Check className="h-3.5 w-3.5 mr-1" />
                {mcpServers.find(s => s.id === editingServer?.id) ? 'Update' : 'Add'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditingServer(null); setIsAdding(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Add Button */}
        {!isAdding && !editingServer && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setIsAdding(true);
              setEditingServer({
                id: crypto.randomUUID().replace(/-/g, '').substring(0, 12),
                name: '',
                url: '',
                transportType: 'sse',
                enabled: true,
              });
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add MCP Server
          </Button>
        )}

        {mcpServers.length === 0 && !isAdding && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No MCP servers configured. Add one to extend the agent with external tools.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Agent Panel
// =============================================================================

export function AgentPanel() {
  const { settings, updateSetting, isLoading } = useSettings();
  const agentSettings = settings.agent;

  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [whitelistInput, setWhitelistInput] = useState('');

  // Get provider config from AGENT_PROVIDERS
  const currentProvider = agentSettings?.provider || 'openai';
  const providerConfig = AGENT_PROVIDERS.find(p => p.id === currentProvider);
  const needsApiKey = providerConfig?.requiresApiKey ?? true;
  const needsBaseUrl = providerConfig?.requiresBaseUrl ?? false;
  const modelPlaceholder = providerConfig?.modelPlaceholder ?? 'Enter model name...';
  const helpText = providerConfig?.helpText;
  const defaultBaseUrl = providerConfig?.defaultBaseUrl;

  // Get current API key for the selected provider
  const currentApiKey = agentSettings?.apiKeys?.[currentProvider as keyof ProviderApiKeys] || '';

  const handleProviderChange = async (value: string) => {
    // When switching providers, keep the model if the same model works, otherwise prompt for new one
    const newSettings = {
      ...agentSettings,
      provider: value,
      // Keep model if user typed something, otherwise clear for new provider
      model: agentSettings?.model || '',
    };
    await updateSetting('agent', newSettings);
  };

  const handleModelChange = async (value: string) => {
    const newSettings = { ...agentSettings, model: value };
    await updateSetting('agent', newSettings);
  };

  const handleApprovalModeChange = async (value: string) => {
    const newSettings = { ...agentSettings, approvalMode: value };
    await updateSetting('agent', newSettings);
  };

  const handleSearchProviderChange = async (value: string) => {
    const newSettings = { ...agentSettings, searchProvider: value };
    await updateSetting('agent', newSettings);
  };



  const handleApiKeyChange = async (value: string) => {
    // Update the API key for the current provider
    const newApiKeys = {
      ...(agentSettings?.apiKeys || {}),
      [currentProvider]: value || undefined,
    };
    const newSettings = { ...agentSettings, apiKeys: newApiKeys };
    await updateSetting('agent', newSettings);
  };

  const handleBaseUrlChange = async (value: string) => {
    const newSettings = { ...agentSettings, baseUrl: value || undefined };
    await updateSetting('agent', newSettings);
  };

  const handleTavilyKeyChange = async (value: string) => {
    const newSettings = { ...agentSettings, tavilyApiKey: value || undefined };
    await updateSetting('agent', newSettings);
  };

  const handleSearxngUrlChange = async (value: string) => {
    const newSettings = { ...agentSettings, searxngUrl: value || undefined };
    await updateSetting('agent', newSettings);
  };

  const addWhitelistPattern = async () => {
    if (!whitelistInput.trim()) return;
    const newPatterns = [...(agentSettings?.whitelistedCommands || []), whitelistInput.trim()];
    const newSettings = { ...agentSettings, whitelistedCommands: newPatterns };
    await updateSetting('agent', newSettings);
    setWhitelistInput('');
  };

  const removeWhitelistPattern = async (index: number) => {
    const newPatterns = [...(agentSettings?.whitelistedCommands || [])];
    newPatterns.splice(index, 1);
    const newSettings = { ...agentSettings, whitelistedCommands: newPatterns };
    await updateSetting('agent', newSettings);
  };

  // Count configured providers (those with API keys)
  const configuredProviderCount = Object.values(agentSettings?.apiKeys || {}).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">AI Agent</h3>
        <p className="text-muted-foreground">
          Configure the AI provider and execution settings
        </p>
      </div>

      {/* Provider Settings */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Provider
            {configuredProviderCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {configuredProviderCount} configured
              </Badge>
            )}
          </CardTitle>
          <CardDescription>AI model provider and authentication</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={currentProvider} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                      {agentSettings?.apiKeys?.[provider.id as keyof ProviderApiKeys] ? ' \u2713' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={agentSettings?.model || ''}
                onChange={(e) => handleModelChange(e.target.value)}
                placeholder={modelPlaceholder}
              />
            </div>
          </div>

          {needsApiKey && (
            <div className="space-y-2">
              <Label>API Key for {providerConfig?.name}</Label>
              <div className="flex gap-2">
                <Input
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={currentApiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="Enter API key..."
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setApiKeyVisible(!apiKeyVisible)}
                >
                  {apiKeyVisible ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
              </div>
              {helpText && (
                <p className="text-xs text-muted-foreground">{helpText}</p>
              )}
            </div>
          )}

          {needsBaseUrl && (
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={agentSettings?.baseUrl || ''}
                onChange={(e) => handleBaseUrlChange(e.target.value)}
                placeholder={defaultBaseUrl || 'https://api.example.com'}
              />
            </div>
          )}
        </CardContent>
      </Card>


      {/* Execution Settings */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="h-5 w-5 text-cyan-500" />
            Command Execution
          </CardTitle>
          <CardDescription>Control how the agent executes commands</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Approval Mode</Label>
            <Select value={agentSettings?.approvalMode || 'always'} onValueChange={handleApprovalModeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span>Safe Mode - All commands require approval</span>
                  </div>
                </SelectItem>
                <SelectItem value="whitelist">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span>Whitelist Mode - Only whitelisted commands auto-execute</span>
                  </div>
                </SelectItem>
                <SelectItem value="yolo">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span>YOLO Mode - Execute all commands without approval</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {agentSettings?.approvalMode === 'yolo' && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-500">Warning: YOLO Mode Enabled</p>
                <p className="text-xs text-muted-foreground">
                  The agent will execute commands without asking for approval.
                  This could potentially harm your system.
                </p>
              </div>
            </div>
          )}

          {agentSettings?.approvalMode === 'whitelist' && (
            <div className="space-y-3">
              <Label>Whitelisted Command Patterns (Regex)</Label>
              <div className="flex gap-2">
                <Input
                  value={whitelistInput}
                  onChange={(e) => setWhitelistInput(e.target.value)}
                  placeholder="^ping "
                  onKeyDown={(e) => e.key === 'Enter' && addWhitelistPattern()}
                />
                <Button onClick={addWhitelistPattern} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(agentSettings?.whitelistedCommands || []).map((pattern: string, i: number) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    <code className="text-xs">{pattern}</code>
                    <button
                      onClick={() => removeWhitelistPattern(i)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Settings */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-500" />
            Web Search
          </CardTitle>
          <CardDescription>Configure web search for finding solutions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Search Provider</Label>
            <Select value={agentSettings?.searchProvider || 'none'} onValueChange={handleSearchProviderChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Disabled</SelectItem>
                <SelectItem value="tavily">Tavily API</SelectItem>
                <SelectItem value="searxng">SearXNG (Self-hosted)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {agentSettings?.searchProvider === 'tavily' && (
            <div className="space-y-2">
              <Label>Tavily API Key</Label>
              <Input
                type="password"
                value={agentSettings?.tavilyApiKey || ''}
                onChange={(e) => handleTavilyKeyChange(e.target.value)}
                placeholder="tvly-..."
              />
              <p className="text-xs text-muted-foreground">
                Get your API key from <a href="https://tavily.com" target="_blank" rel="noopener" className="text-primary hover:underline">tavily.com</a>
              </p>
            </div>
          )}

          {agentSettings?.searchProvider === 'searxng' && (
            <div className="space-y-2">
              <Label>SearXNG Instance URL</Label>
              <Input
                value={agentSettings?.searxngUrl || ''}
                onChange={(e) => handleSearxngUrlChange(e.target.value)}
                placeholder="https://your-searxng-instance.com"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* MCP Server Settings */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-emerald-500" />
            MCP Server
            {agentSettings?.mcpServerEnabled && (
              <Badge variant="default" className="ml-2 bg-emerald-500">
                Active
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Enable remote control via Model Context Protocol (MCP)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="mcp-enabled" className="text-sm font-medium">Enable MCP Server</Label>
              <p className="text-xs text-muted-foreground">
                Allow external LLMs like Agent Zero or Claude Desktop to control this machine
              </p>
            </div>
            <Switch
              id="mcp-enabled"
              checked={agentSettings?.mcpServerEnabled || false}
              onCheckedChange={async (checked) => {
                // Auto-generate API key if enabling and none exists
                let newSettings = { ...agentSettings, mcpServerEnabled: checked };
                if (checked && !agentSettings?.mcpApiKey) {
                  const apiKey = crypto.randomUUID().replace(/-/g, '');
                  newSettings = { ...newSettings, mcpApiKey: apiKey };
                }
                await updateSetting('agent', newSettings);
              }}
              disabled={isLoading}
            />
          </div>

          {agentSettings?.mcpServerEnabled && (
            <>
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={agentSettings?.mcpApiKey || ''}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(agentSettings?.mcpApiKey || '');
                    }}
                    title="Copy to clipboard"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      const newKey = crypto.randomUUID().replace(/-/g, '');
                      const newSettings = { ...agentSettings, mcpApiKey: newKey };
                      await updateSetting('agent', newSettings);
                    }}
                    title="Generate new key"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this key in the Authorization header: Bearer {'<API_KEY>'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={agentSettings?.mcpPort || 8377}
                  onChange={async (e) => {
                    const port = parseInt(e.target.value) || 8377;
                    const newSettings = { ...agentSettings, mcpPort: port };
                    await updateSetting('agent', newSettings);
                  }}
                  min={1024}
                  max={65535}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Server URL: http://localhost:{agentSettings?.mcpPort || 8377}/mcp
                </p>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      Security Note
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requires app restart to apply changes. For remote access, use HTTPS via a reverse proxy.
                      Commands execute based on your approval mode settings.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* MCP Connections (Client) */}
      <MCPConnectionsCard agentSettings={agentSettings} updateSetting={updateSetting} isLoading={isLoading} />
    </div>
  );
}
