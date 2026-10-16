/**
 * BashOutput (SPEC §6 P7): new output from a background shell since last
 * read, plus status. KillShell: terminate by id. First-class pair [P0.1 §C7].
 */
import fs from 'node:fs';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { shells, killTree } from './internals.js';
import { truncateMiddle } from './internals.js';

interface BashOutputInput {
  bash_id: string;
  filter?: string;
}

/** read cursors live here, keyed by shell id (not on the shell record) */
const cursors = new Map<string, number>();

export const bashOutputTool: Tool<BashOutputInput> = {
  name: 'BashOutput',
  description:
    'Retrieves new output from a background shell (only output since the last check), plus its status. Optional regex filter for matching lines.',
  inputSchema: {
    type: 'object',
    properties: {
      bash_id: { type: 'string', description: 'The shell id returned by Bash run_in_background' },
      filter: { type: 'string', description: 'Regex — only matching lines are returned' },
    },
    required: ['bash_id'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 50_000,

  async call(input: BashOutputInput): Promise<ToolResult<string>> {
    const shell = shells.get(input.bash_id);
    if (shell === undefined) {
      throw new Error(`Unknown shell id: ${input.bash_id} (it may have been started in another session)`);
    }
    let all = '';
    try {
      all = fs.readFileSync(shell.filePath, 'utf8');
    } catch {
      all = '';
    }
    const cursor = cursors.get(input.bash_id) ?? 0;
    const fresh = all.slice(cursor);
    cursors.set(input.bash_id, all.length);
    let out = fresh === '' ? '(no new output)' : truncateMiddle(fresh);
    if (input.filter !== undefined && fresh !== '') {
      try {
        const re = new RegExp(input.filter);
        out = fresh.split('\n').filter((l) => re.test(l)).join('\n') || '(no lines matched filter)';
      } catch {
        throw new Error(`Invalid filter regex: ${input.filter}`);
      }
    }
    const status = shell.killed
      ? 'killed'
      : shell.done
        ? `exited (code ${String(shell.exitCode)})`
        : 'running';
    return { data: `[status: ${status}]\n${out}` };
  },
};

interface KillShellInput {
  shell_id: string;
}

export const killShellTool: Tool<KillShellInput> = {
  name: 'KillShell',
  description: 'Kills a running background bash shell by its ID.',
  inputSchema: {
    type: 'object',
    properties: { shell_id: { type: 'string', description: 'The shell id to kill' } },
    required: ['shell_id'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: true,
  checkPermissions: () => 'ask',
  maxResultSizeChars: 1000,

  async call(input: KillShellInput): Promise<ToolResult<string>> {
    const shell = shells.get(input.shell_id);
    if (shell === undefined) throw new Error(`Unknown shell id: ${input.shell_id}`);
    if (!shell.done && !shell.killed) {
      killTree(shell.child);
      shell.killed = true;
      return { data: `Killed shell ${input.shell_id}` };
    }
    return { data: `Shell ${input.shell_id} already stopped (${shell.killed ? 'killed' : `exited ${String(shell.exitCode)}`})` };
  },
};

export { truncateMiddle };

export function noopCtx(): ToolContext {
  return { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() };
}
