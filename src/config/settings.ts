import fs from 'node:fs';
import path from 'node:path';
import { findProjectRoot, userConfigPath } from './paths.js';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface ProviderProfile {
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  fallbackModel?: string;
  maxTokens?: number;
  contextWindow?: number;
  maxTokensParam?: string;
  temperature?: number;
  reasoning?: { effort?: 'minimal' | 'low' | 'medium' | 'high'; exclude?: boolean } | null;
  supports?: { tools?: boolean; vision?: boolean; streamOptions?: boolean; reasoning?: boolean };
  headers?: Record<string, string>;
  dropFields?: string[];
  label?: string;
  /** local servers: no API key required (SPEC §3.4) */
  noAuth?: boolean;
  notes?: string;
}

export interface Permissions {
  allow: string[];
  ask: string[];
  deny: string[];
  defaultMode: PermissionMode;
  additionalDirectories: string[];
}

export interface Settings {
  model: string;
  providerProfiles: Record<string, ProviderProfile>;
  aliases: Record<string, string>;
  permissions: Permissions;
  env: Record<string, string>;
  autoCompactEnabled: boolean;
  summaryModel?: string;
  appendSystemPrompt?: string;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

const PERMISSION_MODES: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
];

export const DEFAULT_SETTINGS: Settings = {
  model: 'default',
  providerProfiles: {},
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
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'model',
  'providerProfiles',
  'aliases',
  'permissions',
  'hooks',
  'env',
  'autoCompactEnabled',
  'webSearch',
  'summaryModel',
  'appendSystemPrompt',
  'mcpServers',
]);

/**
 * Validate one settings file. Collects errors (fatal) and warnings (advisory)
 * with the file path attached so users always know which file is at fault.
 */
function validateFile(
  filePath: string,
  data: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): void {
  for (const key of Object.keys(data)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`${filePath}: unknown key "${key}" (typo or from a newer version?)`);
    }
  }
  if (data['model'] !== undefined && typeof data['model'] !== 'string') {
    errors.push(`${filePath}: "model" must be a string`);
  }
  if (data['aliases'] !== undefined) {
    if (!isPlainObject(data['aliases'])) {
      errors.push(`${filePath}: "aliases" must be an object`);
    } else {
      for (const [k, v] of Object.entries(data['aliases'])) {
        if (typeof v !== 'string') errors.push(`${filePath}: aliases."${k}" must be a string`);
      }
    }
  }
  if (data['env'] !== undefined && !isPlainObject(data['env'])) {
    errors.push(`${filePath}: "env" must be an object of strings`);
  }
  if (data['autoCompactEnabled'] !== undefined && typeof data['autoCompactEnabled'] !== 'boolean') {
    errors.push(`${filePath}: "autoCompactEnabled" must be a boolean`);
  }
  if (data['providerProfiles'] !== undefined) {
    if (!isPlainObject(data['providerProfiles'])) {
      errors.push(`${filePath}: "providerProfiles" must be an object`);
    } else {
      for (const [name, p] of Object.entries(data['providerProfiles'])) {
        if (!isPlainObject(p)) {
          errors.push(`${filePath}: providerProfiles."${name}" must be an object`);
          continue;
        }
        const prof = p as Record<string, unknown>;
        if (typeof prof['baseUrl'] !== 'string' || prof['baseUrl'] === '') {
          errors.push(`${filePath}: providerProfiles."${name}".baseUrl must be a non-empty string`);
        }
        if (typeof prof['apiKeyEnv'] !== 'string' || prof['apiKeyEnv'] === '') {
          errors.push(
            `${filePath}: providerProfiles."${name}".apiKeyEnv must be a non-empty string (name of the env var holding the API key)`,
          );
        }
        if (typeof prof['model'] !== 'string' || prof['model'] === '') {
          errors.push(`${filePath}: providerProfiles."${name}".model must be a non-empty string`);
        }
        if (prof['contextWindow'] !== undefined && typeof prof['contextWindow'] !== 'number') {
          errors.push(`${filePath}: providerProfiles."${name}".contextWindow must be a number`);
        }
      }
    }
  }
  if (data['permissions'] !== undefined) {
    if (!isPlainObject(data['permissions'])) {
      errors.push(`${filePath}: "permissions" must be an object`);
    } else {
      const perms = data['permissions'] as Record<string, unknown>;
      for (const listKey of ['allow', 'ask', 'deny'] as const) {
        if (perms[listKey] !== undefined) {
          const list = perms[listKey];
          if (
            !Array.isArray(list) ||
            list.some((r) => typeof r !== 'string')
          ) {
            errors.push(`${filePath}: permissions.${listKey} must be an array of rule strings`);
          }
        }
      }
      if (
        perms['defaultMode'] !== undefined &&
        !PERMISSION_MODES.includes(perms['defaultMode'] as PermissionMode)
      ) {
        errors.push(
          `${filePath}: permissions.defaultMode must be one of ${PERMISSION_MODES.join(' | ')}`,
        );
      }
    }
  }
}

function readSettingsFile(
  label: string,
  filePath: string,
  errors: string[],
  warnings: string[],
): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    errors.push(`${filePath}: cannot read (${(e as Error).message})`);
    return {};
  }
  if (raw.trim() === '') {
    warnings.push(`${filePath}: file is empty, ignoring`);
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errors.push(`${filePath}: invalid JSON — ${(e as Error).message}`);
    return {};
  }
  if (!isPlainObject(parsed)) {
    errors.push(`${filePath}: top level must be a JSON object`);
    return {};
  }
  validateFile(filePath, parsed, errors, warnings);
  return parsed;
}

/** `${VAR}` expansion inside string values (SPEC §6 P1). Missing vars → '' + warning. */
function expandEnvStrings(value: unknown, warnings: string[]): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
      const v = process.env[name];
      if (v === undefined) {
        warnings.push(`env var "\${${name}}" is not set — expanded to empty string`);
        return '';
      }
      return v;
    });
  }
  if (Array.isArray(value)) return value.map((v) => expandEnvStrings(v, warnings));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = expandEnvStrings(v, warnings);
    return out;
  }
  return value;
}

/** deep merge; permissions allow/ask/deny lists union across tiers (SPEC §4.3). */
function mergeSettings(base: Record<string, unknown>, over: Record<string, unknown>): void {
  for (const [key, overVal] of Object.entries(over)) {
    const baseVal = base[key];
    if (key === 'permissions' && isPlainObject(baseVal) && isPlainObject(overVal)) {
      const merged = { ...(baseVal as Record<string, unknown>) };
      mergeSettings(merged, overVal);
      for (const listKey of ['allow', 'ask', 'deny'] as const) {
        const b = merged[listKey];
        const o = overVal[listKey];
        if (Array.isArray(b) && Array.isArray(o)) {
          merged[listKey] = [...new Set([...(b as string[]), ...(o as string[])])];
        }
      }
      base[key] = merged;
      continue;
    }
    if (isPlainObject(baseVal) && isPlainObject(overVal)) {
      const merged = { ...(baseVal as Record<string, unknown>) };
      mergeSettings(merged, overVal);
      base[key] = merged;
    } else {
      base[key] = overVal;
    }
  }
}

export interface LoadedSettings {
  settings: Settings;
  warnings: string[];
  /** file paths actually loaded, lowest → highest priority */
  sources: string[];
  projectRoot: string | null;
}

/**
 * Load + merge the settings hierarchy (SPEC §4.3):
 * ~/.vexa/config.json → <project>/.vexa/settings.json → .vexa/settings.local.json → --settings flag file.
 * Throws ConfigError when any file has fatal validation errors (message names file + key).
 */
export function loadSettings(cwd: string, settingsFlag?: string): LoadedSettings {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sources: string[] = [];

  const userPath = userConfigPath();
  const user = readSettingsFile('user', userPath, errors, warnings);
  if (Object.keys(user).length > 0) sources.push(userPath);

  const projectRoot = findProjectRoot(cwd);
  const projectFiles: Array<[string, string]> = [];
  if (projectRoot) {
    projectFiles.push(
      ['project', path.join(projectRoot, '.vexa', 'settings.json')],
      ['local', path.join(projectRoot, '.vexa', 'settings.local.json')],
    );
  }
  if (settingsFlag) projectFiles.push(['--settings', path.resolve(settingsFlag)]);

  const merged: Record<string, unknown> = structuredClone(
    DEFAULT_SETTINGS as unknown as Record<string, unknown>,
  );
  mergeSettings(merged, user);
  for (const [label, filePath] of projectFiles) {
    const data = readSettingsFile(label, filePath, errors, warnings);
    if (Object.keys(data).length > 0) {
      mergeSettings(merged, data);
      sources.push(filePath);
    }
  }

  if (errors.length > 0) throw new ConfigError(errors.join('\n'), userPath);

  const expanded = expandEnvStrings(merged, warnings) as unknown as Settings;

  // Fill non-validated structural defaults defensively.
  expanded.permissions = { ...DEFAULT_SETTINGS.permissions, ...expanded.permissions };
  expanded.providerProfiles = expanded.providerProfiles ?? {};
  expanded.aliases = expanded.aliases ?? {};
  expanded.env = expanded.env ?? {};

  return { settings: expanded, warnings, sources, projectRoot };
}
