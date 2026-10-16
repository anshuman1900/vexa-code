/**
 * WebSearch (SPEC §6 P16 / A23): client-side via Tavily or Brave.
 * Disabled (isEnabled=false) until webSearch config + key exist.
 */
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { appState } from '../../state.js';

export interface WebSearchCfg {
  provider: 'tavily' | 'brave';
  apiKeyEnv: string;
}

interface WebSearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export function isWebSearchConfigured(): boolean {
  const cfg = appState.webSearch;
  return cfg !== undefined && process.env[cfg.apiKeyEnv] !== undefined && (process.env[cfg.apiKeyEnv] ?? '') !== '';
}

export const webSearchTool: Tool<WebSearchInput> = {
  name: 'WebSearch',
  description: [
    'Searches the web and returns result titles, URLs, and snippets.',
    '- Use for current information beyond your knowledge cutoff',
    '- Fetch page contents with WebFetch when a result looks relevant',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 2, description: 'The search query' },
      allowed_domains: { type: 'array', items: { type: 'string' }, description: 'Only results from these domains' },
      blocked_domains: { type: 'array', items: { type: 'string' }, description: 'Never results from these domains' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  isEnabled: () => isWebSearchConfigured(),
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 20_000,

  async call(input: WebSearchInput, _ctx: ToolContext): Promise<ToolResult<string>> {
    const cfg = appState.webSearch;
    if (cfg === undefined) throw new Error('WebSearch not configured — set "webSearch": { "provider": "tavily", "apiKeyEnv": "TAVILY_API_KEY" } in ~/.vexa/config.json');
    const key = process.env[cfg.apiKeyEnv] ?? '';
    let results: Array<{ title: string; url: string; snippet: string }> = [];

    if (cfg.provider === 'tavily') {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query: input.query, max_results: 8 }),
      });
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
      const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
      results = (data.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: (r.content ?? '').slice(0, 300) }));
    } else {
      const params = new URLSearchParams({ q: input.query, count: '8' });
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
      const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      results = (data.web?.results ?? []).map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: (r.description ?? '').slice(0, 300) }));
    }

    if (input.allowed_domains !== undefined && input.allowed_domains.length > 0) {
      results = results.filter((r) => input.allowed_domains?.some((d) => r.url.includes(d)));
    }
    if (input.blocked_domains !== undefined && input.blocked_domains.length > 0) {
      results = results.filter((r) => !input.blocked_domains?.some((d) => r.url.includes(d)));
    }
    if (results.length === 0) return { data: 'No results found.' };
    return {
      data: results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join('\n\n'),
    };
  },
};
