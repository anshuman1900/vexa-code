/**
 * Shared vocabulary (SPEC §4.1). Provider-neutral message/block model; the
 * wire layer (provider/wire.ts) translates to OpenAI format at request time.
 */

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'image'; mediaType: string; data: string } // base64
  | { type: 'reasoning'; text: string }; // display-only, NEVER serialized to wire (SPEC A6)

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  totalTokens: number;
  costUsd?: number;
  estimated: boolean;
}

export interface VexaMessage {
  uuid: string;
  parentUuid: string | null;
  timestamp: string; // ISO 8601
  type: 'user' | 'assistant' | 'system' | 'progress' | 'attachment';
  content: Block[];
  // assistant only:
  model?: string;
  provider?: string;
  usage?: Usage;
  finishReason?: string;
  // user only:
  isCompactSummary?: boolean;
  isMeta?: boolean; // synthetic (recovery nudges, hook context)
  toolUseResult?: unknown;
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimated: true,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens:
      a.cacheReadTokens !== undefined || b.cacheReadTokens !== undefined
        ? (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0)
        : undefined,
    totalTokens: a.totalTokens + b.totalTokens,
    costUsd: a.costUsd !== undefined || b.costUsd !== undefined ? (a.costUsd ?? 0) + (b.costUsd ?? 0) : undefined,
    estimated: a.estimated && b.estimated,
  };
}

/** BYTES_PER_TOKEN = 4 (SPEC A11 / [TP §1]) — the universal estimator. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
