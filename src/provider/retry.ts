/**
 * Retry / fallback policy (SPEC §3.3) — constants preserved from [AL §2.3].
 */
export type ProviderErrorKind =
  | 'overloaded'
  | 'rate_limit'
  | 'auth'
  | 'notfound'
  | 'bad_request'
  | 'context_overflow'
  | 'server'
  | 'timeout'
  | 'connection'
  | 'protocol';

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
    public readonly body?: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export const MAX_RETRIES = Number(process.env['VEXA_MAX_RETRIES'] ?? 10);
export const BASE_DELAY_MS = 500;
export const MAX_DELAY_MS = 32_000;
export const MAX_OVERLOADED_CONSECUTIVE = 3;
export const STREAM_IDLE_TIMEOUT_MS = Number(process.env['VEXA_STREAM_IDLE_TIMEOUT_MS'] ?? 90_000);
export const STREAM_IDLE_WARN_MS = 45_000;
export const REQUEST_TIMEOUT_MS = 600_000;

const CONTEXT_OVERFLOW_RE =
  /context_length_exceeded|maximum context length|prompt too long|too many tokens|reduce the length/i;
const OVERLOADED_RE = /overloaded|capacity|overloaded_error/i;

export function classify(status: number, bodyText: string): ProviderErrorKind {
  if (status === 529 || status === 503) return 'overloaded';
  if (status === 429 && OVERLOADED_RE.test(bodyText)) return 'overloaded';
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notfound';
  if ((status === 400 || status === 413) && CONTEXT_OVERFLOW_RE.test(bodyText)) return 'context_overflow';
  if (status === 400 || status === 413) return 'bad_request';
  if (status >= 500) return 'server';
  return 'protocol';
}

export function classifyNetworkError(err: unknown): ProviderErrorKind {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/abort|timeout/i.test(msg)) return 'timeout';
  return 'connection';
}

export function shouldRetryKind(kind: ProviderErrorKind): boolean {
  switch (kind) {
    case 'auth':
    case 'notfound':
    case 'bad_request':
    case 'context_overflow':
      return false;
    case 'overloaded':
    case 'rate_limit':
    case 'server':
    case 'timeout':
    case 'connection':
      return true;
    default:
      return false;
  }
}

/** retry-after (integer seconds) overrides backoff entirely; else 500·2^(n−1) cap 32s, jitter ≤25%. */
export function computeBackoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader !== null && retryAfterHeader !== '') {
    const s = Number(retryAfterHeader);
    if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, 300_000);
  }
  const base = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), MAX_DELAY_MS);
  const jitter = Math.random() * BASE_DELAY_MS * 0.25;
  return base + jitter;
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
