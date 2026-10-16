import type { CliContext } from '../cli.js';

/** P17 placeholder — real headless mode (JSON/stream-json output) arrives in P17. */
export async function runHeadless(ctx: CliContext, positionals: string[]): Promise<void> {
  const prompt = positionals.join(' ').trim();
  if (prompt === '') {
    process.stderr.write('vexa: -p/--print needs a prompt (arg or stdin)\n');
    process.exit(2);
  }
  process.stdout.write(
    `vexa: headless mode lands in P17 (prompt received: ${prompt.length} chars, model: ${ctx.resolved.modelId})\n`,
  );
}
