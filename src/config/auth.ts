import fs from 'node:fs';
import path from 'node:path';
import { userConfigDir } from './paths.js';

/**
 * API key storage (SPEC §4.3 / OD12): keys NEVER live in config.json.
 * Resolution order: env var (profile.apiKeyEnv) → ~/.vexa/auth.json (0600).
 */

export function authJsonPath(): string {
  return path.join(userConfigDir(), 'auth.json');
}

interface AuthFile {
  profiles: Record<string, string>;
}

function readAuthFile(): AuthFile {
  try {
    const raw = fs.readFileSync(authJsonPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AuthFile>;
    return { profiles: parsed.profiles ?? {} };
  } catch {
    return { profiles: {} };
  }
}

export function readStoredKey(profileName: string): string | undefined {
  return readAuthFile().profiles[profileName];
}

export function saveApiKey(profileName: string, key: string): string {
  const file = readAuthFile();
  file.profiles[profileName] = key;
  const p = authJsonPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = JSON.stringify(file, null, 2) + '\n';
  // write-then-chmod: keeps 0600 even when the file already exists
  fs.writeFileSync(p, body, { mode: 0o600 });
  fs.chmodSync(p, 0o600);
  return p;
}

export function removeApiKey(profileName: string): boolean {
  const file = readAuthFile();
  if (!(profileName in file.profiles)) return false;
  delete file.profiles[profileName];
  fs.writeFileSync(authJsonPath(), JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(authJsonPath(), 0o600);
  return true;
}

/** Count of stored keys — for `providers list`; never exposes values. */
export function storedKeyNames(): string[] {
  return Object.keys(readAuthFile().profiles);
}
