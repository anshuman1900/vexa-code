/**
 * SSE chunk accumulation (SPEC A9): never JSON-parse partial arguments.
 * delta.content → text concat; delta.tool_calls[i] keyed by `index`, first
 * fragment supplies id/name, `function.arguments` fragments concat.
 * reasoning_content / reasoning are captured for DISPLAY ONLY (A6) — never resent.
 */
import type { Usage } from '../types.js';
import { estimateTokens } from '../types.js';

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string, complete after finish
}

export interface ChatResult {
  text: string;
  reasoningText: string;
  toolCalls: AccumulatedToolCall[];
  finishReason: string; // 'tool_calls' | 'stop' | 'length' | ...
  usage: Usage;
}

interface ToolCallSlot {
  id: string;
  name: string;
  arguments: string;
}

export interface PushDeltas {
  textDelta: string;
  reasoningDelta: string;
}

export interface Accumulator {
  /** returns the deltas added by this chunk (for streaming display) */
  push(chunk: unknown): PushDeltas;
  result(): ChatResult;
}

interface OpenAIChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      reasoning?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string | null;
        function?: { name?: string | null; arguments?: string | null };
      }>;
    };
    message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
}

export function createAccumulator(modelIdForEstimate = ''): Accumulator {
  let text = '';
  let reasoningText = '';
  let finishReason: string | null = null;
  let usage: Usage | null = null;
  const slots = new Map<number, ToolCallSlot>();

  return {
    push(chunkUnknown: unknown): PushDeltas {
      const chunk = chunkUnknown as OpenAIChunk;
      let textDelta = '';
      let reasoningDelta = '';
      if (chunk.usage) {
        const u = chunk.usage;
        usage = {
          inputTokens: u.prompt_tokens ?? 0,
          outputTokens: u.completion_tokens ?? 0,
          cacheReadTokens: u.prompt_tokens_details?.cached_tokens,
          totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
          estimated: false,
        };
      }
      const choice = chunk.choices?.[0];
      if (choice === undefined) return { textDelta, reasoningDelta };
      if (choice.finish_reason != null) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (delta !== undefined) {
        if (typeof delta.content === 'string') {
          text += delta.content;
          textDelta = delta.content;
        }
        const r = delta.reasoning_content ?? delta.reasoning;
        if (typeof r === 'string') {
          reasoningText += r;
          reasoningDelta = r;
        }
        for (const tc of delta.tool_calls ?? []) {
          const slot = slots.get(tc.index) ?? { id: '', name: '', arguments: '' };
          if (tc.id) slot.id = tc.id; // first fragment supplies id (A9)
          if (tc.function?.name) slot.name = tc.function.name;
          if (typeof tc.function?.arguments === 'string') slot.arguments += tc.function.arguments;
          slots.set(tc.index, slot);
        }
      }
      // non-streaming fallback response shape (A14)
      const msg = choice.message;
      if (msg !== undefined) {
        if (typeof msg.content === 'string') {
          text += msg.content;
          textDelta = msg.content;
        }
        for (const tc of msg.tool_calls ?? []) {
          const idx = slots.size;
          slots.set(idx, { id: tc.id, name: tc.function.name, arguments: tc.function.arguments });
        }
      }
      return { textDelta, reasoningDelta };
    },

    result(): ChatResult {
      const ordered = [...slots.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
      return {
        text,
        reasoningText,
        toolCalls: ordered,
        finishReason:
          finishReason ?? (ordered.length > 0 ? 'tool_calls' : 'stop'), // OD11: treat-missing-as-stop only when no tool_calls
        usage:
          usage ?? {
            inputTokens: estimateTokens(text),
            outputTokens: estimateTokens(text),
            totalTokens: estimateTokens(text),
            estimated: true,
          },
      };
    },
  };
}
