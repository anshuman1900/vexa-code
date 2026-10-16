import { runRepl } from '../ui/repl.js';
import type { CliContext } from '../cli.js';

/** Interactive entrypoint (P3) — the loop itself lives in ui/repl.ts. */
export async function startRepl(ctx: CliContext): Promise<void> {
  await runRepl(ctx);
}
