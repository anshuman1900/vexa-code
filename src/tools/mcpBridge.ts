/**
 * MCP tools as Vexa Tool objects (SPEC §6 P11): mcp__server__tool naming,
 * registry merge (built-ins win), content extraction.
 */
import type { Tool, ToolContext, ToolResult } from './types.js';
import { McpClient, type McpToolDef } from '../extensibility/mcp/client.js';

export function mcpToolsFromClient(client: McpClient, defs: McpToolDef[]): Tool[] {
  return defs.map((def) => ({
    name: `mcp__${client.serverName}__${def.name}`,
    description: def.description ?? `MCP tool "${def.name}" from server "${client.serverName}"`,
    inputSchema: (def.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    isEnabled: () => client.status === 'connected',
    isReadOnly: false, // fail-closed: unknown MCP tools may have side effects
    isConcurrencySafe: false,
    checkPermissions: () => 'ask' as const,
    maxResultSizeChars: 50_000,
    async call(input: unknown, _ctx: ToolContext): Promise<ToolResult<string>> {
      const r = await client.callTool(def.name, input);
      return { data: r.text };
    },
  }));
}
