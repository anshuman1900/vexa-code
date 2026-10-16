/**
 * Bash tool internals (SPEC §6 P7): timeouts, output caps, background shells.
 * Constants preserved from [TP §3].
 */
import { spawn, type ChildProcess } from 'node:child_process';
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
}

export const shells = new Map<string, BackgroundShell>();

export function resolveShell(): { cmd: string; args: string[] } {
  // Windows: prefer bash (MSYS/git-bash), fall back to cmd; POSIX: bash
  if (process.platform === 'win32') {
    return { cmd: 'bash.exe', args: ['-c'] };
  }
  return { cmd: 'bash', args: ['-c'] };
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
