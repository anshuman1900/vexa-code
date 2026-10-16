/**
 * OpenAI-compatible chat/completions client (SPEC §3.2, §3.3).
 * SSE streaming, 90s idle watchdog (45s warn), 600s request timeout,
 * 10× retry w/ 500ms·2^n cap 32s + ≤25% jitter, retry-after override,
 * 3-strike overloaded policy (A4), non-streaming fallback after 2
 * connection-level stream failures (A14), malformed-chunk skip (P25).
 */
import { createAccumulator, type ChatResult } from './stream.js';
import type { WireMessage, WireTool } from './wire.js';
import {
  ProviderError,
  classify,
  classifyNetworkError,
  computeBackoffMs,
  shouldRetryKind,
  sleep,
  MAX_RETRIES,
  MAX_OVERLOADED_CONSECUTIVE,
  STREAM_IDLE_TIMEOUT_MS,
  STREAM_IDLE_WARN_MS,
  REQUEST_TIMEOUT_MS,
} from './retry.js';

export interface ChatRequestParams {
  baseUrl: string;
  apiKey: string; // '' = noAuth (local servers)
  model: string;
  headers?: Record<string, string>;
  messages: WireMessage[];
  tools?: WireTool[];
  maxTokens: number;
  maxTokensParam?: string;
  temperature?: number;
  supports?: { tools?: boolean; streamOptions?: boolean; vision?: boolean };
  dropFields?: string[];
  signal?: AbortSignal;
  label?: string; // human name for error messages (never the key)
}

export interface StreamCallbacks {
  onTextDelta?(delta: string): void;
  onReasoningDelta?(delta: string): void;
  onIdleWarn?(): void;
  onRetry?(attempt: number, kind: string, delayMs: number): void;
  onFallbackNonStream?(): void;
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function buildBody(req: ChatRequestParams, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    [req.maxTokensParam ?? 'max_tokens']: req.maxTokens,
    stream,
  };
  if (req.temperature !== undefined) body['temperature'] = req.temperature;
  if (stream && req.supports?.streamOptions !== false) {
    body['stream_options'] = { include_usage: true }; // A11
  }
  if (req.tools !== undefined && req.tools.length > 0 && req.supports?.tools !== false) {
    body['tools'] = req.tools;
    body['tool_choice'] = 'auto';
  }
  for (const field of req.dropFields ?? []) delete body[field];
  return body;
}

function buildHeaders(req: ChatRequestParams, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (stream) headers['Accept'] = 'text/event-stream';
  if (req.apiKey !== '') headers['Authorization'] = `Bearer ${req.apiKey}`;
  for (const [k, v] of Object.entries(req.headers ?? {})) headers[k] = v;
  return headers;
}

function wrapHttpError(res: Response, bodyText: string): ProviderError {
  const kind = classify(res.status, bodyText);
  const retryAfter = res.headers.get('retry-after');
  const retryAfterMs = retryAfter !== null && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : undefined;
  return new ProviderError(
    kind,
    `HTTP ${res.status} ${res.statusText} from ${res.url}${bodyText !== '' ? ` — ${bodyText.slice(0, 300)}` : ''}`,
    res.status,
    bodyText,
    retryAfterMs,
  );
}

async function attemptStream(req: ChatRequestParams, cb: StreamCallbacks): Promise<ChatResult> {
  const acc = createAccumulator();
  const ctrl = new AbortController();
  const onExternalAbort = (): void => ctrl.abort();
  req.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const overall = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let lastChunkAt = Date.now();
  let idleWarned = false;

  const idleTick = setInterval(() => {
    const idleFor = Date.now() - lastChunkAt;
    if (!idleWarned && idleFor >= STREAM_IDLE_WARN_MS) {
      idleWarned = true;
      cb.onIdleWarn?.();
    }
    if (idleFor >= STREAM_IDLE_TIMEOUT_MS) {
      ctrl.abort();
    }
  }, 1000);

  try {
    const res = await fetch(endpoint(req.baseUrl), {
      method: 'POST',
      headers: buildHeaders(req, true),
      body: JSON.stringify(buildBody(req, true)),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw wrapHttpError(res, bodyText);
    }
    if (res.body === null) throw new ProviderError('protocol', 'empty response body');

    const decoder = new TextDecoder();
    let buf = '';
    const processLine = (rawLine: string): void => {
      const line = rawLine.replace(/\r$/, '');
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (data === '' || data === '[DONE]') return;
      try {
        const { textDelta, reasoningDelta } = acc.push(JSON.parse(data));
        if (textDelta !== '') cb.onTextDelta?.(textDelta);
        if (reasoningDelta !== '') cb.onReasoningDelta?.(reasoningDelta);
      } catch {
        // malformed chunk: skip + warn, never crash (P25)
        console.error('vexa: skipping malformed SSE chunk');
      }
    };

    for await (const chunk of res.body) {
      lastChunkAt = Date.now();
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        processLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    buf += decoder.decode();
    for (const line of buf.split('\n')) processLine(line);
    return acc.result();
  } catch (err) {
    throw asProviderError(err);
  } finally {
    clearInterval(idleTick);
    clearTimeout(overall);
    req.signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function attemptNonStream(req: ChatRequestParams, cb: StreamCallbacks): Promise<ChatResult> {
  const acc = createAccumulator();
  const ctrl = new AbortController();
  const onExternalAbort = (): void => ctrl.abort();
  req.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const overall = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint(req.baseUrl), {
      method: 'POST',
      headers: buildHeaders(req, false),
      body: JSON.stringify(buildBody(req, false)),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw wrapHttpError(res, bodyText);
    }
    const json: unknown = await res.json();
    const { textDelta } = acc.push(json);
    if (textDelta !== '') cb.onTextDelta?.(textDelta);
    return acc.result();
  } catch (err) {
    throw asProviderError(err);
  } finally {
    clearTimeout(overall);
    req.signal?.removeEventListener('abort', onExternalAbort);
  }
}

function asProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const kind = classifyNetworkError(err);
  const msg = err instanceof Error ? err.message : String(err);
  return new ProviderError(kind, `${kind === 'timeout' ? 'request timed out' : 'connection error'}: ${msg}`);
}

/**
 * One request with the full §3.3 policy applied. Throws ProviderError when
 * exhausted. Cross-request overload counting (A4, 3 consecutive on a model →
 * engine switches to fallbackModel) is the engine's job (P8); per-call, 3
 * consecutive overloaded responses surface as an overloaded error here.
 */
export async function streamChat(req: ChatRequestParams, cb: StreamCallbacks = {}): Promise<ChatResult> {
  let consecutiveOverloaded = 0;
  let connectionFailures = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const useNonStream = connectionFailures >= 2; // A14
    if (useNonStream && attempt === connectionFailures + 1) cb.onFallbackNonStream?.();
    try {
      return useNonStream
        ? await attemptNonStream(req, cb)
        : await attemptStream(req, cb);
    } catch (err) {
      const perr = err instanceof ProviderError ? err : asProviderError(err);
      if (perr.kind === 'connection') connectionFailures++;
      if (perr.kind === 'overloaded') {
        consecutiveOverloaded++;
        if (consecutiveOverloaded >= MAX_OVERLOADED_CONSECUTIVE) {
          throw new ProviderError(
            'overloaded',
            `provider overloaded on ${MAX_OVERLOADED_CONSECUTIVE} consecutive attempts` +
              `${req.label !== undefined ? ` (${req.label})` : ''} — set profile "fallbackModel" or switch with /model`,
            perr.status,
            perr.body,
          );
        }
      }
      if (!shouldRetryKind(perr.kind) || attempt === MAX_RETRIES) throw perr;
      const delay = computeBackoffMs(attempt, perr.retryAfterMs !== undefined ? String(perr.retryAfterMs / 1000) : null);
      cb.onRetry?.(attempt, perr.kind, delay);
      await sleep(delay);
    }
  }
  throw new ProviderError('protocol', 'unreachable: retry loop exhausted'); // keeps TS happy
}

export { MAX_RETRIES, MAX_OVERLOADED_CONSECUTIVE } from './retry.js';
export type { ChatResult, AccumulatedToolCall } from './stream.js';
export type { WireMessage, WireTool } from './wire.js';
