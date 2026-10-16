import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { ensureUserDirs, userConfigPath } from './config/paths.js';
import { ConfigError, loadSettings, type Settings } from './config/settings.js';
import { resolveModelRef, type ResolvedModel } from './config/profiles.js';
import { startRepl } from './entrypoints/repl.js';
import { runHeadless } from './entrypoints/headless.js';

const require = createRequire(import.meta.url);
const pkg: { version: string } = require('../package.json');

const HELP_TEXT = `vexa — a coding agent for your terminal. Any model. Any provider.

USAGE
  vexa [flags] [prompt...]

FLAGS
  -p, --print          Headless mode: answer the prompt and exit (lands in P17)
      --model <ref>    Model override: alias, "profile:model", or bare model id
      --settings <f>   Extra settings file, merged at highest priority
      --add-dir <dir>  Additional working directory (repeatable)
      --max-turns <n>  Agent loop turn budget (default: 200)
  -h, --help           Show this help
      --version        Show version

CONFIG
  User settings   ~/.vexa/config.json
  Project         .vexa/settings.json (checked in) + .vexa/settings.local.json
  API keys        env vars referenced by providerProfiles.<name>.apiKeyEnv

EXAMPLES
  vexa                        start an interactive session
  vexa --model fast           start with the "fast" alias model
  vexa -p "summarize TODOs"   one-shot headless run (P17)
`;

interface CliFlags {
  model?: string;
  settings?: string;
  addDir?: string[];
  maxTurns?: number;
  print: boolean;
}

export interface CliContext {
  settings: Settings;
  resolved: ResolvedModel;
  flags: CliFlags;
  projectRoot: string | null;
  settingsSources: string[];
}

function parseCliFlags(): { flags: CliFlags; positionals: string[] } {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      model: { type: 'string' },
      settings: { type: 'string' },
      'add-dir': { type: 'string', multiple: true },
      'max-turns': { type: 'string' },
      print: { type: 'boolean', short: 'p' },
    },
  });
  if (values.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (values.version) {
    process.stdout.write(`vexa ${pkg.version}\n`);
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
    },
    positionals,
  };
}

function fail(message: string): never {
  process.stderr.write(`vexa: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
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
  };

  if (flags.print) {
    await runHeadless(ctx, positionals);
    return;
  }
  await startRepl(ctx);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    fail(`invalid settings\n${err.message}\n(fix the file and run again: ${userConfigPath()})`);
  }
  fail(err instanceof Error ? err.message : String(err));
});
