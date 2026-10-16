import type { CliContext } from '../cli.js';

/**
 * P3 placeholder — the real readline/ANSI REPL replaces this body.
 * P1 contract: prove config + profile resolution end to end, then stop.
 */
export async function startRepl(ctx: CliContext): Promise<void> {
  const { resolved, settings, projectRoot, settingsSources } = ctx;
  const base = resolved.profile.baseUrl.replace(/\/+$/, '');
  process.stdout.write(
    [
      `Vexa v0.1.0 — config OK`,
      `  profile : ${resolved.profileName} → ${base}`,
      `  model   : ${resolved.modelId}${resolved.viaAlias ? ' (via alias)' : ''}`,
      `  context : ${resolved.profile.contextWindow.toLocaleString()} tokens, max out ${resolved.profile.maxTokens.toLocaleString()}`,
      `  config  : ${settingsSources.join(' → ') || '~/.vexa/config.json (defaults)'}`,
      `  project : ${projectRoot ?? 'none (no .vexa/ found)'}`,
      ``,
      `Provider layer (P2) and interactive REPL (P3) land next — see docs/PLAN.md.`,
      ``,
    ].join('\n'),
  );
  void settings;
}
