/**
 * ANSI rendering helpers (SPEC §6 P3) — plain strings, zero deps.
 * Claude-Code visual grammar: ⏺ tool bullets, ⎿ result branches, ✻ star,
 * dim meta lines. Respects NO_COLOR / TERM=dumb.
 */

const enabled = !(process.env['NO_COLOR'] !== undefined || process.env['TERM'] === 'dumb');

const wrap = (code: string, s: string): string => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  dim: (s: string): string => wrap('2', s),
  bold: (s: string): string => wrap('1', s),
  cyan: (s: string): string => wrap('36', s),
  green: (s: string): string => wrap('32', s),
  red: (s: string): string => wrap('31', s),
  yellow: (s: string): string => wrap('33', s),
  magenta: (s: string): string => wrap('35', s),
};

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
