/**
 * Bash tool (SPEC §6 P7 / [TP §3]):
 * - persistent semantics per command (fresh env, cwd preserved by caller)
 * - default timeout 120s, max 600s (env-tunable, max floored at default)
 * - 30k-char output cap, middle-truncated
 * - run_in_background → shell id; monitor with BashOutput, kill with KillShell
 * - foreground commands >15s auto-move to background with notification
 * - foreground `sleep` refused with advice (as Claude does)
 * - shell resolution: bash.exe (MSYS) → cmd on Windows
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  BLOCKING_LIMIT_MS,
  shells,
  resolveShell,
  shellOutputDir,
  truncateMiddle,
  nextShellId,
  killTree,
  type BackgroundShell,
} from './internals.js';

interface BashInput {
  command: string;
  timeout?: number;
  run_in_background?: boolean;
  description?: string;
}

function startShell(command: string, cwd: string): BackgroundShell {
  const { cmd, args } = resolveShell();
  const id = nextShellId();
  const filePath = path.join(shellOutputDir(), `${id}.log`);
  const fd = fs.openSync(filePath, 'w');
  const child = spawn(cmd, [...args, command], {
    cwd,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  fs.closeSync(fd); // child owns its dup'd handles
  const shell: BackgroundShell = {
    id,
    child,
    filePath,
    startedAt: Date.now(),
    killed: false,
    done: false,
    exitCode: null,
  };
  child.on('exit', (code) => {
    shell.done = true;
    shell.exitCode = code ?? null;
  });
  // CRITICAL: handle spawn errors (ENOENT, bad cwd) — an unhandled 'error'
  // event crashes the whole process (user-reported from PowerShell)
  child.on('error', (err) => {
    shell.spawnError = err.message;
    shell.done = true;
  });
  shells.set(id, shell);
  return shell;
}

function drainOutput(shell: BackgroundShell): string {
  try {
    return fs.readFileSync(shell.filePath, 'utf8');
  } catch {
    return '';
  }
}

export const bashTool: Tool<BashInput> = {
  name: 'Bash',
  description: [
    'Executes a given bash command in a shell with optional timeout.',
    'Before executing:',
    '1. If the command will create new directories or files, first use LS/Read to verify the location.',
    '2. Always quote file paths that contain spaces with double quotes.',
    'Usage notes:',
    '  - The command argument is required. Optional timeout in ms (max 600000); default 120000.',
    '  - If output exceeds 30000 characters it will be middle-truncated.',
    '  - Use run_in_background for long-running commands; monitor via BashOutput. NEVER use it for sleep.',
    '  - VERY IMPORTANT: avoid find/grep/cat/head/tail — use Grep, Glob, Read instead.',
    '  - Verify paths before rm/Move-type operations. NEVER delete without explicit user request.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' },
      timeout: { type: 'number', description: 'Optional timeout in ms (max 600000)' },
      run_in_background: { type: 'boolean', description: 'Run in background; read output later with BashOutput' },
      description: { type: 'string', description: 'Clear, concise description in 5-10 words' },
    },
    required: ['command'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: false,
  checkPermissions: () => 'ask',
  maxResultSizeChars: 50_000,

  async call(input: BashInput, ctx: ToolContext): Promise<ToolResult<string>> {
    if (input.run_in_background !== true && /^\s*sleep(\s|$)/.test(input.command)) {
      throw new Error('Foreground sleep refused — it blocks the session. Use run_in_background: true if you must wait, or just proceed; tools re-check state automatically.');
    }

    const timeout = Math.min(Math.max(1000, Math.floor(input.timeout ?? DEFAULT_TIMEOUT_MS)), MAX_TIMEOUT_MS);

    // ---- background path
    if (input.run_in_background === true) {
      const shell = startShell(input.command, ctx.cwd);
      return { data: `Background shell started: ${shell.id}\nOutput file: ${shell.filePath}\nUse BashOutput with this id to read new output; KillShell to terminate.` };
    }

    // ---- foreground path
    const shell = startShell(input.command, ctx.cwd);
    const movedAt = setTimeout(() => {
      // auto-background: 15s blocking budget [TP §3]
      if (!shell.done && !shell.killed) {
        shell.autoBackgrounded = true;
      }
    }, BLOCKING_LIMIT_MS);

    const code = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        killTree(shell.child);
        shell.killed = true;
        resolve(shell.exitCode ?? -999);
      }, timeout);
      shell.child.once('exit', (c) => {
        clearTimeout(timer);
        clearTimeout(movedAt);
        resolve(c ?? 0);
      });
      shell.child.once('error', () => {
        clearTimeout(timer);
        clearTimeout(movedAt);
        resolve(-1);
      });
    });

    if (shell.spawnError !== undefined) {
      clearTimeout(movedAt);
      return {
        data: `[spawn failed: ${shell.spawnError}]\nSet VEXA_SHELL_CMD to a shell on your PATH (e.g. powershell.exe) if the auto-detected one is missing.`,
      };
    }

    if (shell.autoBackgrounded === true) {
      clearTimeout(movedAt);
      return {
        data: `[moved to background after ${Math.round(BLOCKING_LIMIT_MS / 1000)}s] Command still running: ${shell.id}\nContinue working and use BashOutput(shell_id="${shell.id}") to check output later.`,
      };
    }

    const output = truncateMiddle(drainOutput(shell));
    const suffix = shell.killed
      ? `\n[command timed out after ${timeout}ms and was terminated]`
      : code !== 0
        ? `\n[exit code: ${String(code)}]`
        : '';
    return { data: (output === '' ? '(no output)' : output) + suffix };
  },
};
