/**
 * Grep tool (SPEC §6 P5): ripgrep wrapper — output modes content /
 * files_with_matches / count, -A/-B/-C, head_limit, multiline.
 * Falls back to error with install hint when rg is missing.
 */
import { execFile } from 'node:child_process';
import type { Tool, ToolContext, ToolResult } from '../types.js';

interface GrepInput {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  '-B'?: number;
  '-A'?: number;
  '-C'?: number;
  '-i'?: boolean;
  '-n'?: boolean;
  type?: string;
  head_limit?: number;
  multiline?: boolean;
}

function runRg(args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number } | 'missing'> {
  return new Promise((resolve) => {
    const child = execFile(
      'rg',
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err !== null && typeof (err as { code?: number }).code === 'number' ? ((err as { code?: number }).code as number) : err === null ? 0 : 1;
        if (err !== null && (err as { code?: string }).code === 'ENOENT') resolve('missing');
        else resolve({ stdout, stderr, code });
      },
    );
    void child;
  });
}

export const grepTool: Tool<GrepInput> = {
  name: 'Grep',
  description: [
    'A powerful search tool built on ripgrep.',
    '  - ALWAYS use Grep for search tasks. NEVER invoke grep or rg via Bash.',
    '  - Supports full regex syntax (ripgrep syntax, not grep)',
    '  - Output modes: "content" (matching lines), "files_with_matches" (paths, default), "count"',
    '  - Filter files with glob ("*.js") or type ("py", "ts", ...)',
    '  - Use -A/-B/-C for context lines, head_limit to cap output',
    '  - Multiline: set multiline=true for cross-line patterns',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'The regular expression to search for' },
      path: { type: 'string', description: 'File or directory to search (default cwd)' },
      glob: { type: 'string', description: 'Glob filter, e.g. "*.ts"' },
      output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'] },
      '-B': { type: 'number', description: 'Lines before each match' },
      '-A': { type: 'number', description: 'Lines after each match' },
      '-C': { type: 'number', description: 'Lines before and after' },
      '-i': { type: 'boolean', description: 'Case-insensitive' },
      '-n': { type: 'boolean', description: 'Show line numbers (content mode)' },
      type: { type: 'string', description: 'File type (rg --type)' },
      head_limit: { type: 'number', description: 'Limit output entries' },
      multiline: { type: 'boolean', description: 'Cross-line matching' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 50_000,

  async call(input: GrepInput, ctx: ToolContext): Promise<ToolResult<string>> {
    const mode = input.output_mode ?? 'files_with_matches';
    const args: string[] = [];
    if (mode === 'content') {
      args.push('-n');
      if (input['-B'] !== undefined) args.push('-B', String(input['-B']));
      if (input['-A'] !== undefined) args.push('-A', String(input['-A']));
      if (input['-C'] !== undefined) args.push('-C', String(input['-C']));
    }
    if (input['-i'] === true) args.push('-i');
    if (input.multiline === true) args.push('-U', '--multiline-dotall');
    if (input.glob !== undefined) args.push('--glob', input.glob);
    if (input.type !== undefined) args.push('--type', input.type);
    if (mode === 'files_with_matches') args.push('--files-with-matches');
    if (mode === 'count') args.push('--count');
    args.push('-e', input.pattern);
    args.push(input.path !== undefined ? String(input.path) : '.');

    const r = await runRg(args, ctx.cwd, 30_000);
    if (r === 'missing') {
      throw new Error('ripgrep (rg) is not installed. Install it (winget install BurntSushi.ripgrep.MSVC) or add it to PATH — Grep is built on it.');
    }
    if (r.code !== 0 && r.code !== 1) {
      // rg: 0=matches, 1=no matches, 2+=error
      throw new Error(`rg exited ${r.code}: ${r.stderr.slice(0, 300)}`);
    }
    let out = r.stdout;
    if (r.code === 1 || out.trim() === '') return { data: 'No matches found' };
    if (input.head_limit !== undefined) {
      const lines = out.split('\n');
      out = lines.slice(0, input.head_limit).join('\n') + (lines.length > input.head_limit ? `\n… (${lines.length - input.head_limit} more)` : '');
    }
    return { data: out.trimEnd() };
  },
};
