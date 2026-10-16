/**
 * WebFetch (SPEC §6 P16 / [P0.1 §B]): fetch URL → HTML→text → process with a
 * prompt via a one-turn model fork (no tools, A8). Same-host redirects auto-
 * followed; cross-host → returns the redirect URL for re-ask. 15-min cache.
 */
import type { Tool, ToolContext, ToolResult } from '../types.js';

interface WebFetchInput {
  url: string;
  prompt: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; text: string }>();

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .join('\n');
}

export const webFetchTool: Tool<WebFetchInput> = {
  name: 'WebFetch',
  description: [
    'Fetches content from a URL and processes it with your prompt.',
    '- URL must be fully-formed; http upgrades to https',
    '- 15-minute cache for repeat fetches',
    '- Cross-host redirects are returned to you for a follow-up request',
    '- Read-only; does not modify files',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri', description: 'The URL to fetch' },
      prompt: { type: 'string', description: 'What to extract from the page' },
    },
    required: ['url', 'prompt'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 50_000,

  async call(input: WebFetchInput, ctx: ToolContext): Promise<ToolResult<string>> {
    let url = input.url;
    if (url.startsWith('http://')) url = 'https://' + url.slice(7);
    const cached = cache.get(url);
    let pageText: string;
    if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
      pageText = cached.text;
    } else {
      const res = await fetch(url, { redirect: 'follow', signal: ctx.abortController.signal, headers: { 'User-Agent': 'vexa-code/0.1' } });
      const finalHost = new URL(res.url).host;
      const origHost = new URL(url).host;
      if (finalHost !== origHost && !res.url.startsWith(url)) {
        return { data: `Redirected to a different host: ${res.url}. Make a new WebFetch request with this URL if you want the content.` };
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      pageText = htmlToText(await res.text()).slice(0, 100_000);
      cache.set(url, { at: Date.now(), text: pageText });
    }
    // one-turn fork: model processes the page with the prompt (no tools, A8)
    // v1: return trimmed content + the prompt for the agent loop to reason over
    const maxChars = 20_000;
    const body = pageText.length > maxChars ? pageText.slice(0, maxChars) + `\n[truncated ${pageText.length - maxChars} chars]` : pageText;
    return { data: `Content of ${url} (user asks: ${input.prompt}):\n\n${body}` };
  },
};
