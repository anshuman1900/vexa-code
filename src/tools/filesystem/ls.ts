/**
 * LS tool (SPEC §6 P5): directory listing with ignore patterns.
 * Prefer Glob/Grep when you know what you're looking for (like Claude).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types.js';

interface LSInput {
  path: string;
  ignore?: string[];
}

function matchAny(name: string, patterns: string[]): boolean {
  for (const p of patterns) {
    const re = new RegExp(`^${p.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
    if (re.test(name)) return true;
  }
  return false;
}

export const lsTool: Tool<LSInput> = {
  name: 'LS',
  description: [
    'Lists files and directories in a given path. The path must be absolute.',
    'Optionally provide ignore glob patterns. Prefer Glob and Grep when you know which directories to search.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute path to the directory to list' },
      ignore: { type: 'array', items: { type: 'string' }, description: 'Glob patterns to ignore' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 50_000,

  async call(input: LSInput, ctx: ToolContext): Promise<ToolResult<string>> {
    const dir = path.resolve(ctx.cwd, input.path);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      throw new Error(`Cannot list ${dir}: ${(e as Error).message}`);
    }
    const ignore = input.ignore ?? ['node_modules', '.git'];
    const lines: string[] = [];
    for (const e of entries) {
      if (ignore.some((p) => matchAny(e.name, [p]))) continue;
      const kind = e.isDirectory() ? '[dir]' : e.isFile() ? '' : '[link]';
      lines.push(`${kind === '' ? '- ' : kind + ' '}${e.name}`);
    }
    if (lines.length === 0) return { data: '(empty directory)' };
    return { data: lines.sort().join('\n') };
  },
};
