/**
 * MCP config discovery (SPEC §6 P11 / [CX §4.1]): user config `mcpServers`
 * (auto-approved) + project `.mcp.json` (one-time user approval, remembered
 * in ~/.vexa/mcp-approved.json). Merge: user < approved-project.
 */
import fs from 'node:fs';
import path from 'node:path';
import { userConfigDir } from '../../config/paths.js';
import type { McpServerConfig } from './client.js';

export interface McpServerEntry {
  name: string;
  cfg: McpServerConfig;
  source: 'user' | 'project';
}

export function approvedServersPath(): string {
  return path.join(userConfigDir(), 'mcp-approved.json');
}

export function loadApproved(): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(approvedServersPath(), 'utf8')) as { servers?: string[] };
    return raw.servers ?? [];
  } catch {
    return [];
  }
}

export function saveApproved(names: string[]): void {
  fs.writeFileSync(approvedServersPath(), JSON.stringify({ servers: names }, null, 2) + '\n');
}

interface RawServerCfg {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
}

/** discover + gate servers; returns entries that are approved to start */
export function discoverMcpServers(
  cwd: string,
  userServers: Record<string, RawServerCfg> | undefined,
  askApprove: (name: string, cfg: RawServerCfg) => Promise<boolean>,
): { entries: McpServerEntry[]; skipped: string[] } {
  const entries: McpServerEntry[] = [];
  const skipped: string[] = [];
  const approved = new Set(loadApproved());

  const toCfg = (raw: RawServerCfg): McpServerConfig | null => {
    if (typeof raw.command === 'string' && raw.command !== '') {
      return { command: raw.command, args: raw.args, env: raw.env };
    }
    return null; // http/sse transports arrive with the P16 power pass
  };

  for (const [name, raw] of Object.entries(userServers ?? {})) {
    const cfg = toCfg(raw);
    if (cfg !== null) entries.push({ name, cfg, source: 'user' });
  }

  const projectFile = path.join(cwd, '.mcp.json');
  if (fs.existsSync(projectFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as { mcpServers?: Record<string, RawServerCfg> };
      for (const [name, raw] of Object.entries(parsed.mcpServers ?? {})) {
        if (entries.some((e) => e.name === name)) continue; // user wins
        if (!approved.has(name)) {
          skipped.push(name); // caller decides (approval flow)
          continue;
        }
        const cfg = toCfg(raw);
        if (cfg !== null) entries.push({ name, cfg, source: 'project' });
      }
    } catch {
      // malformed .mcp.json — ignore (P25)
    }
  }
  void askApprove;
  return { entries, skipped };
}
