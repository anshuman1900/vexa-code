/**
 * Spinner (SPEC §6 P3) — Claude-Code-style: star frames + a gerund verb +
 * "(esc to interrupt)" hint. Single-line rewrite via \r, low-end friendly
 * (one 120ms interval, no full-screen redraws).
 */
import { clearLine, c } from './render.js';

const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽'];
const VERBS = [
  'Vexing',
  'Thinking',
  'Pondering',
  'Brewing',
  'Musing',
  'Percolating',
  'Conjuring',
  'Distilling',
  'Weaving',
  'Forging',
];

export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private readonly verb: string;
  private readonly startedAt = Date.now();

  constructor(
    private readonly out: NodeJS.WriteStream,
    verb?: string,
  ) {
    this.verb = verb ?? VERBS[Math.floor(Math.random() * VERBS.length)] ?? 'Vexing';
  }

  start(hint = '(esc to interrupt)'): void {
    this.stop();
    this.timer = setInterval(() => {
      const f = FRAMES[this.frame % FRAMES.length] ?? '·';
      this.frame++;
      const secs = Math.floor((Date.now() - this.startedAt) / 1000);
      const elapsed = secs > 0 ? c.dim(` ${secs}s ·`) : '';
      this.out.write(`${clearLine()}${c.magenta(f)} ${this.verb}… ${elapsed} ${c.dim(hint)}`);
    }, 120);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      this.out.write(clearLine());
    }
  }
}
