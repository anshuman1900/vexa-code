/**
 * Bash tool internals (SPEC §6 P7): timeouts, output caps, background shells.
 * Constants preserved from [TP §3].
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_TIMEOUT_MS = Number(process.env['VEXA_BASH_DEFAULT_TIMEOUT_MS'] ?? 120_000);
export const MAX_TIMEOUT_MS = Math.max(
  DEFAULT_TIMEOUT_MS,
  Number(process.env['VEXA_BASH_MAX_TIMEOUT_MS'] ?? 600_000),
);
export const MAX_OUTPUT_CHARS = Math.min(
  Number(process.env['VEXA_MAX_OUTPUT_LENGTH'] ?? 30_000),
  150_000,
);
/** foreground commands longer than this are auto-moved to background */
export const BLOCKING_LIMIT_MS = Number(process.env['VEXA_BASH_BLOCKING_MS'] ?? 15_000);

export interface BackgroundShell {
  id: string;
  child: ChildProcess;
  filePath: string;
  startedAt: number;
  killed: boolean;
  done: boolean;
  exitCode: number | null;
  autoBackgrounded?: boolean;
  spawnError?: string;
}

export const shells = new Map<string, BackgroundShell>();

interface ShellCmd {
  cmd: string;
  args: string[];
}

let cachedShell: ShellCmd | null = null;

/**
 * Shell resolution (SPEC §6 P7): bash.exe (MSYS/git-bash) → Git's absolute
 * path → cmd.exe. Probed once (execFileSync 'true'): ENOENT → next candidate;
 * any other result means the shell exists. Windows PowerShell sessions often
 * lack bash on PATH — the fallback keeps Vexa working there.
 */
export function resolveShell(): ShellCmd {
  if (cachedShell !== null) return cachedShell;
  const envCmd = process.env['VEXA_SHELL_CMD'];
  if (envCmd !== undefined && envCmd !== '') {
    cachedShell = { cmd: envCmd, args: (process.env['VEXA_SHELL_ARGS'] ?? '-c').split(' ') };
    return cachedShell;
  }
  const candidates: ShellCmd[] =
    process.platform === 'win32'
      ? [
          { cmd: 'bash.exe', args: ['-c'] },
          { cmd: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['-c'] },
          { cmd: `${process.env['ProgramFiles'] ?? 'C:\\Program Files'}\\Git\\usr\\bin\\bash.exe`, args: ['-c'] },
          { cmd: 'cmd.exe', args: ['/d', '/s', '/c'] },
        ]
      : [{ cmd: 'bash', args: ['-c'] }];
  for (const cand of candidates) {
    try {
      // 'true' succeeds in bash; cmd.exe exits 1 (unknown command) — either
      // outcome proves the EXECUTABLE exists (only ENOENT means missing)
      execFileSync(cand.cmd, [...cand.args, 'true'], {
        timeout: 5000,
        windowsHide: true,
        stdio: 'ignore',
      });
      cachedShell = cand;
      return cachedShell;
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') continue; // binary missing → next
      cachedShell = cand;
      return cachedShell;
    }
  }
  cachedShell = { cmd: 'cmd.exe', args: ['/d', '/s', '/c'] };
  return cachedShell;
}

export function shellOutputDir(): string {
  const dir = path.join(os.tmpdir(), 'vexa-bash');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Middle-truncation with notice (keeps head + tail, like [TP §3]). */
export function truncateMiddle(s: string, cap = MAX_OUTPUT_CHARS): string {
  if (s.length <= cap) return s;
  const removed = s.length - cap;
  const half = Math.floor(cap / 2);
  return `${s.slice(0, half)}\n\n[output truncated: ${removed.toLocaleString()} characters removed]\n\n${s.slice(s.length - half)}`;
}

let counter = 0;
export function nextShellId(): string {
  counter++;
  return `bash_${Date.now().toString(36)}_${counter}`;
}

export function killTree(child: ChildProcess): void {
  if (process.platform === 'win32') {
    if (child.pid !== undefined) spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}
