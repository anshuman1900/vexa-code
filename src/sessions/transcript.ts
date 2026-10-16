/**
 * Session transcripts (SPEC §4.2): one JSON object per line in
 * ~/.vexa/projects/<sanitized-cwd>/<sessionId>.jsonl.
 * Write discipline [AL §1.2.5]: user messages fsync'd BEFORE the first API
 * call; assistant writes serialized through an order-preserving queue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectsDir } from '../config/paths.js';
import type { VexaMessage } from '../types.js';

export interface TranscriptEntry {
  type: 'user' | 'assistant' | 'system' | 'summary' | 'attachment' | 'sessionMeta';
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  cwd: string;
  version: string;
  timestamp: string;
  message: VexaMessage;
  compactMetadata?: { trigger: 'auto' | 'manual'; preCompactTokenCount: number };
}

export interface SessionInfo {
  id: string;
  path: string;
  mtimeMs: number;
  sizeBytes: number;
}

export function newSessionId(): string {
  return globalThis.crypto.randomUUID();
}

export function transcriptPathFor(cwd: string, sessionId: string): string {
  return path.join(projectsDir(cwd), `${sessionId}.jsonl`);
}

export class Transcript {
  private fd: number | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly sessionId: string,
    private readonly version: string,
  ) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  private openIfNeeded(): number {
    if (this.fd === null) {
      this.fd = fs.openSync(this.filePath, 'a');
    }
    return this.fd;
  }

  /** Raw line append; fsync=true blocks until the bytes hit disk (user messages). */
  append(message: VexaMessage, opts: { fsync?: boolean; compactMetadata?: TranscriptEntry['compactMetadata'] } = {}): Promise<void> {
    const entry: TranscriptEntry = {
      type: message.type === 'progress' || message.type === 'attachment' ? 'attachment' : message.type,
      uuid: message.uuid,
      parentUuid: message.parentUuid,
      sessionId: this.sessionId,
      cwd: process.cwd(),
      version: this.version,
      timestamp: message.timestamp,
      message,
      ...(opts.compactMetadata !== undefined ? { compactMetadata: opts.compactMetadata } : {}),
    };
    const line = JSON.stringify(entry) + '\n';
    const job = this.queue.then(async () => {
      const fd = this.openIfNeeded();
      // sync writes: tiny lines, guaranteed ordering; fsync only where needed
      fs.writeSync(fd, line);
      if (opts.fsync === true) fs.fsyncSync(fd);
    });
    this.queue = job.catch(() => {}); // order preserved; write errors surfaced on next job
    return job;
  }

  close(): void {
    void this.queue.then(() => {
      if (this.fd !== null) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
    });
  }
}

/**
 * Parse a transcript back into messages. Tolerates a torn final line
 * (crash mid-write): partial line skipped with a warning.
 */
export function readTranscript(filePath: string): { messages: VexaMessage[]; warnings: string[]; sessionId?: string } {
  const warnings: string[] = [];
  const messages: VexaMessage[] = [];
  let sessionId: string | undefined;
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { messages, warnings: [`cannot read ${filePath}`] };
  }
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line === '') continue;
    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(line) as TranscriptEntry;
    } catch {
      if (i === lines.length - 1) {
        warnings.push('torn final line skipped (crash recovery)');
      } else {
        warnings.push(`line ${i + 1} corrupted, skipped`);
      }
      continue;
    }
    sessionId = entry.sessionId;
    if (entry.type === 'sessionMeta') continue;
    messages.push(entry.message);
  }
  return { messages, warnings, sessionId };
}

/** Sessions for this cwd, newest first (for /resume picker + /continue). */
export function listSessions(cwd: string): SessionInfo[] {
  const dir = projectsDir(cwd);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      return { id: f.replace(/\.jsonl$/, ''), path: p, mtimeMs: st.mtimeMs, sizeBytes: st.size };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export interface SessionSummary extends SessionInfo {
  msgCount: number;
  firstPrompt: string;
}

/** P18: enriched listing for the /sessions picker (most recent first). */
export function sessionSummaries(cwd: string, limit = 20): SessionSummary[] {
  return listSessions(cwd).slice(0, limit).map((s) => {
    let msgCount = 0;
    let firstPrompt = '';
    try {
      const lines = fs.readFileSync(s.path, 'utf8').split('\n').filter((l) => l.trim() !== '');
      msgCount = lines.length;
      for (const l of lines) {
        try {
          const o = JSON.parse(l) as { type?: string; content?: unknown };
          if (o.type === 'user' && Array.isArray(o.content)) {
            const tb = o.content.find((b) => (b as { type?: string }).type === 'text') as { text?: string } | undefined;
            if (tb?.text !== undefined && tb.text !== '') {
              firstPrompt = tb.text.replace(/\s+/g, ' ').slice(0, 80);
              break;
            }
          }
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // unreadable transcript
    }
    return { ...s, msgCount, firstPrompt };
  });
}
