import type { Settings, ProviderProfile } from './settings.js';
import { readStoredKey } from './auth.js';

export interface ResolvedModel {
  profileName: string;
  profile: ProviderProfile & Required<
    Pick<ProviderProfile, 'maxTokens' | 'contextWindow' | 'maxTokensParam' | 'temperature'>
  >;
  modelId: string;
  /** true when the ref was an alias from settings.aliases */
  viaAlias: boolean;
}

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileError';
  }
}

/** Apply spec defaults (SPEC §4.3.1) to a raw profile. */
function withDefaults(name: string, raw: ProviderProfile): ResolvedModel['profile'] {
  return {
    ...raw,
    maxTokens: raw.maxTokens ?? 16000,
    contextWindow: raw.contextWindow ?? 200000,
    maxTokensParam: raw.maxTokensParam ?? 'max_tokens',
    temperature: raw.temperature ?? 1,
    supports: { tools: true, streamOptions: true, vision: false, reasoning: false, ...raw.supports },
    headers: raw.headers ?? {},
    dropFields: raw.dropFields ?? [],
    label: raw.label ?? raw.model,
  };
}

/**
 * Resolve a model reference (SPEC §4.3.1):
 *   undefined        → settings.model
 *   alias            → settings.aliases[alias] (chained, max depth 10)
 *   "profile:model"  → that profile + model
 *   bare "model"     → the "default" profile
 */
export function resolveModelRef(settings: Settings, ref?: string): ResolvedModel {
  let current = ref ?? settings.model ?? 'default';
  let viaAlias = false;

  for (let depth = 0; depth < 10; depth++) {
    const aliasTarget = settings.aliases[current];
    if (aliasTarget !== undefined) {
      current = aliasTarget;
      viaAlias = true;
      continue;
    }

    const colon = current.indexOf(':');
    let profileName = 'default';
    let modelId = current;
    if (colon > 0) {
      profileName = current.slice(0, colon);
      modelId = current.slice(colon + 1);
    }

    const raw = settings.providerProfiles[profileName];
    if (raw === undefined) {
      throw new ProfileError(
        profileName === 'default'
          ? `no "default" provider profile found — add one under "providerProfiles" in ~/.vexa/config.json (see vexa --help)`
          : `unknown provider profile "${profileName}" (known: ${Object.keys(settings.providerProfiles).join(', ') || 'none'})`,
      );
    }
    if (modelId === '' || modelId === 'default') {
      // 'default' is the sentinel meaning "this profile's own model" (SPEC §4.3).
      modelId = raw.model;
    }
    return { profileName, profile: withDefaults(profileName, raw), modelId, viaAlias };
  }
  throw new ProfileError(`alias chain for "${String(ref)}" exceeds 10 hops (circular?)`);
}

/**
 * Resolve the API key for a profile from its `apiKeyEnv` env var.
 * Never logs or returns the key value in an error.
 */
export function resolveApiKey(profile: ResolvedModel['profile'], profileName: string): string {
  if (profile.noAuth === true) return '';
  const envName = profile.apiKeyEnv;
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const stored = readStoredKey(profileName);
  if (stored !== undefined && stored !== '') return stored;
  throw new ProfileError(
    `API key not set: provider profile "${profileName}" needs a key.\n` +
      `  Either set the environment variable ${envName}, or run:\n` +
      `    echo <your-key> | vexa providers set-key ${profileName}\n` +
      `  (keys are never stored in config.json or printed)`,
  );
}
