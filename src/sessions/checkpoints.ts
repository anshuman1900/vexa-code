/**
 * File checkpoints (SPEC §6 P16, shadow-copy approach [OD7]): before every
 * Edit/Write, prior content is copied to ~/.vexa/checkpoints/<sessionId>/;
 * /rewind restores. Manifest is JSONL for crash tolerance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { userConfigDir } from '../config/paths.js';

export interface CheckpointEntry {
  n: number;
  filePath: string;
  backupFile: string;
  timestamp: string;
}

export interface Checkpointer {
  save(filePath: string, priorContent: string): CheckpointEntry;
  list(): CheckpointEntry[];
  restore(n?: number): { entry: CheckpointEntry; restoredBytes: number } | null;
  dir: string;
}

export function createCheckpointer(sessionId: string, cwd: string): Checkpointer {
  const dir = path.join(userConfigDir(), 'checkpoints', sessionId.replace(/[^a-zA-Z0-9_-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  const manifest = path.join(dir, 'manifest.jsonl');
  let counter = 0;
  try {
    counter = fs.readFileSync(manifest, 'utf8').split('\n').filter((l) => l.trim() !== '').length;
  } catch {
    // fresh session
  }

  const readManifest = (): CheckpointEntry[] =>
    fs
      .readFileSync(manifest, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => JSON.parse(l) as CheckpointEntry);

  return {
    dir,
    save(filePath: string, priorContent: string): CheckpointEntry {
      counter++;
      const hash = Math.abs([...filePath].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
      const backupFile = path.join(dir, `${counter}-${hash}.txt`);
      fs.writeFileSync(backupFile, priorContent);
      const entry: CheckpointEntry = { n: counter, filePath, backupFile, timestamp: new Date().toISOString() };
      fs.appendFileSync(manifest, JSON.stringify(entry) + '\n');
      return entry;
    },
    list(): CheckpointEntry[] {
      if (!fs.existsSync(manifest)) return [];
      return readManifest();
    },
    restore(n?: number) {
      const all = this.list();
      if (all.length === 0) return null;
      const entry = n === undefined ? all[all.length - 1] : all.find((e) => e.n === n);
      if (entry === undefined) return null;
      const prior = fs.readFileSync(entry.backupFile, 'utf8');
      fs.writeFileSync(entry.filePath, prior);
      return { entry, restoredBytes: prior.length };
    },
  };
}
