import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { ensureUserDirs, userConfigPath } from './config/paths.js';
import { ConfigError, loadSettings, type Settings } from './config/settings.js';
import { resolveModelRef, type ResolvedModel } from './config/profiles.js';
import { runProviders } from './entrypoints/providers.js';

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
  API keys        env vars referenced by providerProfiles.<name>.apiKeyEnv,
                  or ~/.vexa/auth.json via: echo <key> | vexa providers set-key <profile>

PROVIDERS
  vexa providers list            presets (OpenRouter, Groq, Gemini, Mistral,
                                 Cerebras, GitHub Models, NVIDIA, HF, Z.AI,
                                 DeepSeek, Together, Ollama, LM Studio, vLLM)
                                 + your profiles
  vexa providers add groq        one-command setup from a preset
  vexa providers add myapi --base-url https://host/v1 --model m --api-key-env MY_KEY
  vexa providers set-key <name>  store a key in ~/.vexa/auth.json (0600)
  vexa providers test <name>     GET /models with the resolved key
  vexa providers remove <name>

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
      print: { type: 'boolean', short: 'p' },
      resume: { type: 'string' },
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
    version: pkg.version,
    ...(flags.resume !== undefined ? { resumeTarget: flags.resume } : {}),
  };

  if (flags.print) {
    const { runHeadless } = await import('./entrypoints/headless.js'); // lazy: keeps --help fast (P20)
    await runHeadless(ctx, positionals);
    return;
  }
  const { startRepl } = await import('./entrypoints/repl.js'); // lazy (P20)
  await startRepl(ctx);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    fail(`invalid settings\n${err.message}\n(fix the file and run again: ${userConfigPath()})`);
  }
  fail(err instanceof Error ? err.message : String(err));
});
