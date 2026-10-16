/**
 * ANSI rendering helpers (SPEC §6 P3) — plain strings, zero deps.
 * Claude-Code visual grammar: ⏺ tool bullets, ⎿ result branches, ✻ star,
 * dim meta lines. Respects NO_COLOR / TERM=dumb.
 */

const enabled = !(process.env['NO_COLOR'] !== undefined || process.env['TERM'] === 'dumb');

const wrap = (code: string, s: string): string => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  dim: (s: string): string => wrap('2', s),
  italic: (s: string): string => wrap('3', s),
  bold: (s: string): string => wrap('1', s),
  cyan: (s: string): string => wrap('36', s),
  green: (s: string): string => wrap('32', s),
  red: (s: string): string => wrap('31', s),
  yellow: (s: string): string => wrap('33', s),
  magenta: (s: string): string => wrap('35', s),
};

/**
 * Streaming markdown renderer (P3.5 polish sprint): line-buffered,
 * 16ms-batched writes (low-end friendly), live styling — bold headings,
 * inline code, dim code fences, bullets. Raw-delta feel without the
 * syscall storm.
 */
export class StreamRenderer {
  private lineBuf = '';
  private inFence = false;
  private pending: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly write: (s: string) => void) {}

  push(delta: string): void {
    if (this.closed) {
      this.write(delta);
      return;
    }
    this.lineBuf += delta;
    let nl: number;
    while ((nl = this.lineBuf.indexOf('\n')) !== -1) {
      const line = this.lineBuf.slice(0, nl);
      this.lineBuf = this.lineBuf.slice(nl + 1);
      this.schedule(this.styleLine(line) + '\n');
    }
  }

  /** flush any partial line + pending styled output */
  flush(): void {
    if (this.lineBuf !== '') {
      const rest = this.lineBuf;
      this.lineBuf = '';
      this.schedule(this.styleLine(rest));
    }
    this.close();
  }

  /** write any pending styled output + partial line, but stay open for more deltas */
  flushSoft(): void {
    if (this.lineBuf !== '') {
      const rest = this.lineBuf;
      this.lineBuf = '';
      this.pending.push(this.styleLine(rest) + '\n');
    }
    if (this.pending.length > 0) {
      this.write(this.pending.join(''));
      this.pending = [];
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.length > 0) {
      this.write(this.pending.join(''));
      this.pending = [];
    }
  }

  private schedule(text: string): void {
    this.pending.push(text);
    if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.pending.length > 0) {
          this.write(this.pending.join(''));
          this.pending = [];
        }
      }, 16);
    }
  }

  private styleLine(line: string): string {
    // code fences toggle a fenced state; content renders dim-cyan, indented
    const fence = line.trimStart().startsWith('```');
    if (fence) {
      this.inFence = !this.inFence;
      return c.dim(line.trimStart() === '```' ? '  ─ ─ ─' : `  ─ ${line.trimStart().slice(3)} ─ ─`);
    }
    if (this.inFence) return c.cyan(`  ${line}`);
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) return c.bold(heading[2] ?? '');
    // inline code + bold
    let styled = line
      .replace(/`([^`]+)`/g, (_m, code: string) => c.cyan(code))
      .replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => c.bold(b));
    if (/^\s*[-*]\s+/.test(styled)) styled = styled.replace(/^(\s*)[-*]\s+/, `$1${c.dim('•')} `);
    return styled;
  }
}

export function clearLine(): string {
  return enabled ? '\r\x1b[K' : '\r';
}

/** `⏺ Read(src/foo.ts)` — tool-use line. */
export function toolUseLine(toolName: string, summary: string): string {
  return `${c.cyan('⏺')} ${c.bold(toolName)}${c.dim(`(${summary})`)}`;
}

/** `⎿ result…` — indented tool-result branch. */
export function toolResultLine(text: string, isError = false): string {
  const bullet = isError ? c.red('⎿') : c.dim('⎿');
  return `${bullet} ${c.dim(text)}`;
}

/** One-line summary of a tool input for the ⏺ line. */
export function summarizeToolInput(name: string, input: unknown): string {
  if (input === null || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  const firstString = (): string => {
    for (const v of Object.values(o)) if (typeof v === 'string') return v;
    return '';
  };
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return firstString();
    case 'Bash':
      return firstString().slice(0, 80);
    case 'Grep':
    case 'Glob':
      return typeof o['pattern'] === 'string' ? (o['pattern'] as string) : '';
    case 'Task':
      return typeof o['description'] === 'string' ? (o['description'] as string) : '';
    case 'WebFetch':
      return typeof o['url'] === 'string' ? (o['url'] as string) : '';
    default: {
      const s = firstString();
      return s.length > 60 ? s.slice(0, 60) + '…' : s;
    }
  }
}

/** Post-turn usage line: `  in=40 out=45 · ctx≈1%` (dim). */
export function usageLine(turnIn: number, turnOut: number, totalIn: number, totalOut: number, contextWindow: number): string {
  const used = totalIn + totalOut;
  const pct = contextWindow > 0 ? Math.min(100, Math.round((used / contextWindow) * 100)) : 0;
  return c.dim(`  in=${turnIn} out=${turnOut} · session in=${totalIn} out=${totalOut} · ctx≈${pct}%`);
}

export function errorLine(msg: string): string {
  return c.red(`✗ ${msg}`);
}

export function successLine(msg: string): string {
  return c.green(`✓ ${msg}`);
}
