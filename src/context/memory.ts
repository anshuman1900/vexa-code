/**
 * Auto-memory (SPEC §6 P15 / [CX §3]): memory dir keyed by canonical git root,
 * MEMORY.md index always loaded, per-topic files. The MODEL writes memory via
 * the Write tool; the harness pre-creates the dir and loads MEMORY.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { userConfigDir } from '../config/paths.js';

export const MEMORY_INDEX_MAX_LINES = 200;
export const MEMORY_INDEX_MAX_BYTES = 25_000;

/** canonical git root (falls back to cwd when not a repo) */
export function memoryKeyDir(cwd: string): string {
  let root = cwd;
  try {
    root = execSync('git rev-parse --show-toplevel', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    root = path.resolve(cwd);
  }
  const safe = root.replace(/[:\\/. ]/g, '-');
  return path.join(userConfigDir(), 'projects', safe, 'memory');
}

export function ensureMemoryDir(cwd: string): string {
  const dir = memoryKeyDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function memoryIndexPath(cwd: string): string {
  return path.join(memoryKeyDir(cwd), 'MEMORY.md');
}

/** MEMORY.md content (always in-context when non-empty) + warnings */
export function loadMemory(cwd: string): { content: string; warnings: string[] } {
  const warnings: string[] = [];
  const p = memoryIndexPath(cwd);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const lines = raw.split('\n');
    if (lines.length > MEMORY_INDEX_MAX_LINES) {
      warnings.push(`MEMORY.md exceeds ${MEMORY_INDEX_MAX_LINES} lines (${lines.length}) — prune it`);
    }
    if (raw.length > MEMORY_INDEX_MAX_BYTES) {
      warnings.push(`MEMORY.md exceeds ${MEMORY_INDEX_MAX_BYTES.toLocaleString()} bytes — prune it`);
    }
    return { content: raw.trim(), warnings };
  } catch {
    return { content: '', warnings };
  }
}
