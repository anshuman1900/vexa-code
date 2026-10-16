import { parseArgs } from 'node:util';
import { ensureUserDirs, userConfigPath } from './config/paths.js';
import { ConfigError, loadSettings, type Settings } from './config/settings.js';
import { resolveModelRef, type ResolvedModel } from './config/profiles.js';
import { runProviders } from './entrypoints/providers.js';

import { VERSION } from './version.js';

const HELP_TEXT = `vexa — a coding agent for your terminal. Any model. Any provider.

USAGE
  vexa                        interactive REPL
  vexa "prompt"               run one prompt in the REPL
  vexa -p "prompt"            headless: print the answer and exit
  vexa providers ...          manage provider profiles
  vexa --gui                  desktop bridge (used by the Vexa Code app)

FLAGS
  -p, --print            headless one-shot (VEXA_OUTPUT_FORMAT=json for JSON)
      --gui              stdio line-JSON bridge for the desktop app
      --model <ref>      provider profile name or alias (default profile if omitted)
      --settings <file>  extra settings file (lowest priority wins per key)
      --add-dir <dir>    grant access to an extra working directory
      --max-turns <n>    agent turn budget
      --resume [id]      resume session (most recent if no id given)
  -h, --help             show this help
      --version          show version

EXAMPLES
  vexa                                   start coding
  vexa --model nvidia                    use the "nvidia" provider profile
  vexa -p "summarize TODOs"              one-shot answer
  VEXA_OUTPUT_FORMAT=json vexa -p "..."  machine-readable output
  vexa --resume                          continue your last session

Inside the REPL: /help for slash commands (/sessions /rewind /model /mcp …).
`;

interface CliFlags {
  model?: string;
  settings?: string;
  addDir?: string[];
  maxTurns?: number;
  print: boolean;
  gui?: boolean;
  resume?: string;
}

export interface CliContext {
  settings: Settings;
  resolved: ResolvedModel;
  flags: CliFlags;
  projectRoot: string | null;
  settingsSources: string[];
  version: string;
  /** undefined = fresh; '' = resume most recent; otherwise resume by id prefix */
  resumeTarget?: string;
}

function parseCliFlags(): { flags: CliFlags; positionals: string[] } {
  // allow bare `--resume` (= most recent): parseArgs would otherwise demand a value
  const argv = process.argv.slice(2).map((a) => (a === '--resume' ? '--resume=' : a));
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      model: { type: 'string' },
      settings: { type: 'string' },
      'add-dir': { type: 'string', multiple: true },
      'max-turns': { type: 'string' },
      gui: { type: 'boolean' },
      print: { type: 'boolean', short: 'p' },
      resume: { type: 'string' },
    },
  });
  if (values.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (values.version) {
    process.stdout.write(`vexa ${VERSION}\n`);
    process.exit(0);
  }
  let maxTurns: number | undefined;
  if (values['max-turns'] !== undefined) {
    maxTurns = Number(values['max-turns']);
    if (!Number.isInteger(maxTurns) || maxTurns <= 0) {
      fail(`--max-turns must be a positive integer, got "${String(values['max-turns'])}"`);
    }
  }
  return {
    flags: {
      model: values.model,
      settings: values.settings,
      addDir: values['add-dir'],
      maxTurns,
      print: values.print === true,
      gui: values.gui === true,
      resume: values.resume,
    },
    positionals,
  };
}

function fail(message: string): never {
  process.stderr.write(`vexa: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  if (raw[0] === 'providers') {
    await runProviders(raw.slice(1));
    return;
  }

  const { flags, positionals } = parseCliFlags();

  ensureUserDirs();
  const loaded = loadSettings(process.cwd(), flags.settings);
  for (const w of loaded.warnings) process.stderr.write(`vexa: warning: ${w}\n`);

  const resolved = resolveModelRef(loaded.settings, flags.model);

  const ctx: CliContext = {
    settings: loaded.settings,
    resolved,
    flags,
    projectRoot: loaded.projectRoot,
    settingsSources: loaded.sources,
    version: VERSION,
    ...(flags.resume !== undefined ? { resumeTarget: flags.resume } : {}),
  };

  if (flags.gui === true) {
    const { runGuiBridge } = await import('./entrypoints/guiBridge.js');
    runGuiBridge(ctx);
    return;
  }
  if (flags.print) {
    const { runHeadless } = await import('./entrypoints/headless.js'); // lazy: keeps --help fast (P20)
    await runHeadless(ctx, positionals);
    return;
  }
  const { startRepl } = await import('./entrypoints/repl.js'); // lazy (P20)
  await startRepl(ctx);
}

process.on('unhandledRejection', (reason: unknown) => {
  process.stderr.write(`vexa: unexpected async error: ${reason instanceof Error ? reason.message : String(reason)}\n`);
});
process.on('uncaughtException', (err: Error) => {
  process.stderr.write(`vexa: fatal: ${err.message}\n`);
  process.exit(1);
});

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    fail(`invalid settings\n${err.message}\n(fix the file and run again: ${userConfigPath()})`);
  }
  fail(err instanceof Error ? err.message : String(err));
});
