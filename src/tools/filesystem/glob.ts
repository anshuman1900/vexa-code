/**
 * Glob tool (SPEC §6 P5): file pattern matching, results sorted by MTIME
 * (newest last, like Claude's mtime ordering [P0.1 §B]). Zero-dep walker.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types.js';

interface GlobInput {
  pattern: string;
  path?: string;
}

function globToRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === undefined) break;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // '**/' matches zero or more dirs; '**' matches anything
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/\\\\]*';
      }
    } else if (ch === '?') re += '[^/\\\\]';
    else if (ch === '{') re += '(?:';
    else if (ch === '}') re += ')';
    else if (ch === ',') re += '|';
    else re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

function walk(dir: string, out: string[], depth: number): void {
  if (depth > 12 || out.length > 2000) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, depth + 1);
    else if (e.isFile()) out.push(full);
  }
}

export const globTool: Tool<GlobInput> = {
  name: 'Glob',
  description: [
    'Fast file pattern matching tool that works with any codebase size.',
    '- Supports glob patterns like "**/*.js" or "src/**/*.ts"',
    '- Returns matching file paths sorted by modification time',
    '- Use this when you need to find files by name patterns',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The glob pattern to match files against' },
      path: { type: 'string', description: 'Directory to search in (default: cwd)' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 50_000,

  async call(input: GlobInput, ctx: ToolContext): Promise<ToolResult<string[]>> {
    const base = path.resolve(ctx.cwd, input.path ?? '.');
    if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
      throw new Error(`Not a directory: ${base}`);
    }
    const files: string[] = [];
    walk(base, files, 0);
    const re = globToRegExp(input.pattern);
    const matches = files.filter((f) => {
      const rel = path.relative(base, f).replace(/\\/g, '/');
      return re.test(rel) || re.test(path.basename(f));
    });
    // sort by mtime, oldest first (Claude order: stable mtime ordering)
    matches.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
    return { data: matches };
  },
};
