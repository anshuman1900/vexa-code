/**
 * `vexa providers` subcommands — add/list/remove/set-key/test.
 * Makes any preset a one-command setup; custom endpoints via
 * `vexa providers add --base-url ... --api-key-env ... --model ... <name>`.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { userConfigPath } from '../config/paths.js';
import { getPreset, PROVIDER_PRESETS, type ProviderPreset } from '../config/presets.js';
import { readStoredKey, removeApiKey, saveApiKey, storedKeyNames } from '../config/auth.js';

interface AddArgs {
  name?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  model?: string;
  as?: string;
  'context-window'?: string;
  'no-auth'?: boolean;
}

function readUserConfigRaw(): Record<string, unknown> {
  const p = userConfigPath();
  if (!fs.existsSync(p)) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${p}: top level must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function writeUserConfigRaw(cfg: Record<string, unknown>): void {
  fs.writeFileSync(userConfigPath(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(userConfigPath(), 0o600);
}

function fail(msg: string): never {
  process.stderr.write(`vexa providers: ${msg}\n`);
  process.exit(1);
}

function parseAddArgs(argv: string[]): AddArgs {
  const args: AddArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) break;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--base-url': args.baseUrl = next(); break;
      case '--api-key-env': args.apiKeyEnv = next(); break;
      case '--model': args.model = next(); break;
      case '--as': args.as = next(); break;
      case '--context-window': args['context-window'] = next(); break;
      case '--no-auth': args['no-auth'] = true; break;
      default:
        if (a.startsWith('-')) fail(`unknown flag ${a}`);
        else if (args.name === undefined) args.name = a;
        else fail(`unexpected argument "${a}" (profile name goes last)`);
    }
  }
  return args;
}

function cmdList(): void {
  const cfg = readUserConfigRaw();
  const profiles = (cfg['providerProfiles'] ?? {}) as Record<string, unknown>;
  const keys = new Set(storedKeyNames());
  const lines: string[] = ['PRESETS (vexa providers add <name>)', ''];
  for (const p of PROVIDER_PRESETS) {
    const configured = Object.values(profiles).some(
      (v) => typeof v === 'object' && v !== null && (v as Record<string, unknown>)['baseUrl'] === p.baseUrl,
    );
    const flag = p.free ? ' [free]' : '';
    const mark = configured ? '✓' : ' ';
    const key = p.noAuth ? '' : keys.has(p.name) ? ' key:set(auth.json)' : ` key: env ${p.apiKeyEnv}`;
    lines.push(` ${mark} ${p.name.padEnd(13)} ${p.label}${flag}${key}`);
  }
  lines.push('', 'YOUR PROFILES', '');
  const entries = Object.entries(profiles);
  if (entries.length === 0) lines.push(' (none yet — try: vexa providers add groq)');
  for (const [name, v] of entries) {
    const prof = (v ?? {}) as Record<string, unknown>;
    const envName = typeof prof['apiKeyEnv'] === 'string' ? prof['apiKeyEnv'] : '';
    const envSet = envName !== '' && (process.env[envName] ?? '') !== '';
    const hasKey = prof['noAuth'] === true || keys.has(name) || envSet;
    lines.push(
      ` • ${name.padEnd(13)} ${String(prof['baseUrl'] ?? '?')}  model=${String(prof['model'] ?? '?')}  ${hasKey ? 'key:configured' : 'key:MISSING'}`,
    );
  }
  lines.push('', 'usage: vexa providers add <preset|custom> · set-key <profile> · test <profile> · remove <profile>');
  process.stdout.write(lines.join('\n') + '\n');
}

function cmdAdd(argv: string[]): void {
  const a = parseAddArgs(argv);
  const preset: ProviderPreset | undefined = a.name ? getPreset(a.name) : undefined;

  const name = a.as ?? a.name;
  if (name === undefined || name === '') {
    fail('profile name required: vexa providers add <preset> [--as other-name] or vexa providers add <name> --base-url URL --model M');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) fail(`profile name "${name}" must be [a-zA-Z0-9_-]`);

  const baseUrl = a.baseUrl ?? preset?.baseUrl;
  const model = a.model ?? preset?.defaultModel;
  const noAuth = a['no-auth'] ?? preset?.noAuth ?? false;
  const apiKeyEnv = a.apiKeyEnv ?? preset?.apiKeyEnv ?? `${name.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  const contextWindow = a['context-window'] !== undefined ? Number(a['context-window']) : preset?.contextWindow;

  if (baseUrl === undefined || model === undefined) {
    fail('custom profiles need --base-url and --model (presets fill these automatically)');
  }
  if (Number.isNaN(contextWindow ?? 0) || (contextWindow ?? 0) <= 0) {
    fail('--context-window must be a positive integer');
  }

  const cfg = readUserConfigRaw();
  const profiles = { ...((cfg['providerProfiles'] ?? {}) as Record<string, unknown>) };
  profiles[name] = {
    baseUrl,
    apiKeyEnv: noAuth ? apiKeyEnv : apiKeyEnv,
    model,
    contextWindow,
    label: preset?.label ?? name,
    ...(preset?.noAuth || noAuth ? { noAuth: true } : {}),
    ...(preset?.notes ? { notes: preset.notes } : {}),
  };
  cfg['providerProfiles'] = profiles;
  writeUserConfigRaw(cfg);

  const keyHint = noAuth
    ? 'no API key needed (local server)'
    : `API key: set env ${apiKeyEnv}  OR  run: vexa providers set-key ${name}`;
  process.stdout.write(
    `✓ profile "${name}" written to ${userConfigPath()}\n  baseUrl : ${baseUrl}\n  model   : ${model}\n  ${keyHint}\n  use it  : vexa --model ${name === 'default' ? '' : `${name}:`}${model}\n`,
  );
}

function cmdRemove(argv: string[]): void {
  const name = argv[0];
  if (name === undefined) fail('usage: vexa providers remove <profile>');
  const cfg = readUserConfigRaw();
  const profiles = { ...((cfg['providerProfiles'] ?? {}) as Record<string, unknown>) };
  if (!(name in profiles)) fail(`no profile named "${name}"`);
  delete profiles[name];
  cfg['providerProfiles'] = profiles;
  writeUserConfigRaw(cfg);
  removeApiKey(name);
  process.stdout.write(`✓ removed profile "${name}" (and any stored key)\n`);
}

async function cmdSetKey(argv: string[]): Promise<void> {
  const name = argv[0];
  if (name === undefined) fail('usage: vexa providers set-key <profile>  (key on stdin: echo <key> | vexa providers set-key <profile>)');
  const cfg = readUserConfigRaw();
  const profiles = (cfg['providerProfiles'] ?? {}) as Record<string, unknown>;
  if (!(name in profiles)) fail(`no profile named "${name}" (vexa providers list)`);

  let key: string;
  if (process.stdin.isTTY) {
    process.stdout.write(`paste API key for "${name}" (visible in TTY — pipe it instead for privacy):\n> `);
    const rl = readline.createInterface({ input: process.stdin });
    const it = rl[Symbol.asyncIterator]();
    const first = await it.next();
    rl.close();
    if (first.done || (first.value ?? '').trim() === '') fail('empty key');
    key = String(first.value).trim();
  } else {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    key = Buffer.concat(chunks).toString('utf8').trim();
    if (key === '') fail('empty key on stdin');
  }
  const p = saveApiKey(name, key);
  process.stdout.write(`✓ key for "${name}" stored in ${p} (0600, never written to config.json)\n`);
}

async function cmdTest(argv: string[]): Promise<void> {
  const name = argv[0];
  if (name === undefined) fail('usage: vexa providers test <profile>');
  const cfg = readUserConfigRaw();
  const profiles = (cfg['providerProfiles'] ?? {}) as Record<string, unknown>;
  const prof = profiles[name] as Record<string, unknown> | undefined;
  if (prof === undefined) fail(`no profile named "${name}"`);
  const baseUrl = String(prof['baseUrl'] ?? '').replace(/\/+$/, '');
  const apiKeyEnv = String(prof['apiKeyEnv'] ?? '');
  const noAuth = prof['noAuth'] === true;
  const key = noAuth ? '' : (process.env[apiKeyEnv] ?? readStoredKey(name) ?? '');
  if (!noAuth && key === '') {
    fail(`no key for "${name}" — set env ${apiKeyEnv} or vexa providers set-key ${name}`);
  }

  process.stdout.write(`GET ${baseUrl}/models … `);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: noAuth ? {} : { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      process.stdout.write(`HTTP ${res.status} ${res.statusText}\n`);
      process.exit(1);
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (body.data ?? []).map((m) => m.id ?? '').filter(Boolean);
    process.stdout.write(`OK — ${ids.length} models\n`);
    if (ids.length > 0) {
      process.stdout.write(`  e.g. ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? `, … +${ids.length - 5} more` : ''}\n`);
    }
  } catch (e) {
    process.stdout.write(`FAILED — ${(e as Error).message}\n`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

export async function runProviders(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'list': cmdList(); return;
    case 'add': cmdAdd(rest); return;
    case 'remove': case 'rm': cmdRemove(rest); return;
    case 'set-key': await cmdSetKey(rest); return;
    case 'test': await cmdTest(rest); return;
    default:
      process.stdout.write(
        'usage: vexa providers <list | add <preset|name> [--as n] [--model m] [--base-url u] [--api-key-env v] [--context-window n] [--no-auth] | set-key <profile> | test <profile> | remove <profile>>\n',
      );
      if (cmd !== undefined) process.exit(2);
  }
}
