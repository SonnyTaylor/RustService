/**
 * MCP Client Manager
 *
 * Manages connections to external MCP servers, providing tool discovery
 * and lifecycle management. Uses @ai-sdk/mcp for protocol support.
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { ToolSet } from 'ai';
import type { MCPServerConfig } from '@/types/agent';

// =============================================================================
// Types
// =============================================================================

interface ConnectedServer {
  config: MCPServerConfig;
  client: MCPClient;
  tools: ToolSet;
  error?: string;
}

export interface MCPManagerState {
  /** Currently connected servers */
  servers: ConnectedServer[];
  /** Total tool count across all connected servers */
  toolCount: number;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Errors from failed connections */
  errors: Array<{ serverId: string; serverName: string; error: string }>;
}

// =============================================================================
// MCP Manager
// =============================================================================

/**
 * Active MCP client connections - module-level singleton
 */
let activeConnections: ConnectedServer[] = [];
let connectionErrors: Array<{ serverId: string; serverName: string; error: string }> = [];

/**
 * Connect to all enabled MCP servers and retrieve their tools.
 * Disconnects any previously connected servers first.
 */
export async function connectMCPServers(
  configs: MCPServerConfig[]
): Promise<{ tools: ToolSet; state: MCPManagerState }> {
  // Disconnect existing connections first
  await disconnectAll();

  const enabledConfigs = configs.filter(c => c.enabled && c.url);
  if (enabledConfigs.length === 0) {
    return {
      tools: {},
      state: {
        servers: [],
        toolCount: 0,
        isConnecting: false,
        errors: [],
      },
    };
  }

  const connections: ConnectedServer[] = [];
  const errors: Array<{ serverId: string; serverName: string; error: string }> = [];
  let mergedTools: ToolSet = {};

  // Connect to each server individually (don't let one failure break all)
  for (const config of enabledConfigs) {
    try {
      console.log(`[MCP] Connecting to "${config.name}" at ${config.url}...`);

      // Build headers
      const headers: Record<string, string> = {};
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }
      if (config.headers) {
        Object.assign(headers, config.headers);
      }

      const client = await createMCPClient({
        transport: {
          type: config.transportType,
          url: config.url,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        },
      });

      const tools = await client.tools();
      const toolCount = Object.keys(tools).length;
      console.log(`[MCP] Connected to "${config.name}" - ${toolCount} tools available`);

      connections.push({ config, client, tools: tools as unknown as ToolSet });

      // Prefix tool names with server ID to avoid collisions
      for (const [toolName, toolDef] of Object.entries(tools)) {
        const prefixedName = `mcp_${config.id}_${toolName}`;
        mergedTools[prefixedName] = toolDef as any;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[MCP] Failed to connect to "${config.name}":`, errorMsg);
      errors.push({
        serverId: config.id,
        serverName: config.name,
        error: errorMsg,
      });
    }
  }

  activeConnections = connections;
  connectionErrors = errors;

  const state: MCPManagerState = {
    servers: connections,
    toolCount: Object.keys(mergedTools).length,
    isConnecting: false,
    errors,
  };

  return { tools: mergedTools, state };
}

/**
 * Disconnect all active MCP server connections
 */
export async function disconnectAll(): Promise<void> {
  const closePromises = activeConnections.map(async (conn) => {
    try {
      await conn.client.close();
      console.log(`[MCP] Disconnected from "${conn.config.name}"`);
    } catch (error) {
      console.warn(`[MCP] Error disconnecting from "${conn.config.name}":`, error);
    }
  });

  await Promise.all(closePromises);
  activeConnections = [];
  connectionErrors = [];
}

/**
 * Get the current MCP manager state
 */
export function getMCPState(): MCPManagerState {
  return {
    servers: activeConnections,
    toolCount: activeConnections.reduce((sum, c) => sum + Object.keys(c.tools).length, 0),
    isConnecting: false,
    errors: connectionErrors,
  };
}

/**
 * Get tools from all currently connected MCP servers
 */
export function getMCPTools(): ToolSet {
  const mergedTools: ToolSet = {};
  for (const conn of activeConnections) {
    for (const [toolName, toolDef] of Object.entries(conn.tools)) {
      const prefixedName = `mcp_${conn.config.id}_${toolName}`;
      mergedTools[prefixedName] = toolDef;
    }
  }
  return mergedTools;
}

/**
 * Check if any MCP servers are connected
 */
export function hasActiveConnections(): boolean {
  return activeConnections.length > 0;
}

/**
 * Get connected server info (for display)
 */
export function getConnectedServerInfo(): Array<{
  id: string;
  name: string;
  url: string;
  toolCount: number;
  toolNames: string[];
}> {
  return activeConnections.map(conn => ({
    id: conn.config.id,
    name: conn.config.name,
    url: conn.config.url,
    toolCount: Object.keys(conn.tools).length,
    toolNames: Object.keys(conn.tools),
  }));
}
