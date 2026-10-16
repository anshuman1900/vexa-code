import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PROFILE_MODEL = 'anthropic/claude-sonnet-4.5';

const DEFAULT_CONFIG_JSON = JSON.stringify(
  {
    model: 'default',
    providerProfiles: {
      default: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        model: DEFAULT_PROFILE_MODEL,
        maxTokens: 16000,
        contextWindow: 200000,
        label: 'Claude Sonnet 4.5 (via OpenRouter)',
      },
    },
    aliases: {},
    permissions: {
      allow: [],
      ask: [],
      deny: [],
      defaultMode: 'default',
      additionalDirectories: [],
    },
    env: {},
    autoCompactEnabled: true,
  },
  null,
  2,
) + '\n';

export function userConfigDir(): string {
  return process.env['VEXA_CONFIG_DIR'] || path.join(os.homedir(), '.vexa');
}

export function userConfigPath(): string {
  return path.join(userConfigDir(), 'config.json');
}

/** Create ~/.vexa layout on first run (SPEC §6 P1). Idempotent. */
export function ensureUserDirs(): { configPath: string; created: string[] } {
  const root = userConfigDir();
  const created: string[] = [];
  for (const dir of [root, path.join(root, 'projects'), path.join(root, 'skills')]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  const configPath = userConfigPath();
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG_JSON, { mode: 0o600 });
    created.push(configPath);
  }
  return { configPath, created };
}

/** Walk up from cwd to find the nearest directory containing `.vexa/`.
 *  The user config dir (~/.vexa) itself never counts as a project root. */
export function findProjectRoot(cwd: string): string | null {
  const userDir = userConfigDir();
  let dir = path.resolve(cwd);
  // Local drive roots on both posix and win32 terminate the walk.
  for (;;) {
    const vexaDir = path.join(dir, '.vexa');
    if (path.resolve(vexaDir) !== path.resolve(userDir) && fs.existsSync(vexaDir)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** cwd path → deterministic dir name under ~/.vexa/projects/ (SPEC §2.1). */
export function sanitizeCwd(cwd: string): string {
  return cwd.replace(/[:\\/. ]/g, '-');
}

export function projectsDir(cwd: string): string {
  return path.join(userConfigDir(), 'projects', sanitizeCwd(cwd));
}

export function transcriptPath(cwd: string, sessionId: string): string {
  return path.join(projectsDir(cwd), `${sessionId}.jsonl`);
}
