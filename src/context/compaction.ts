/**
 * Compaction (SPEC §6 P14, from [CX §1.1–1.3] — constants and the 9-section
 * summarizer prompt are reverse-engineered from Claude Code v2.1.76):
 * - effective window = contextWindow − min(maxOutput, 20 000)
 * - autocompact trigger = effective − 13 000; manual limit = effective − 3 000
 * - circuit breaker: 3 consecutive failures stop trying for the session
 * - summarizer runs WITHOUT tools (A8) and produces a 9-section <summary>
 *   (analysis scratchpad stripped); re-injected as an isCompactSummary user
 *   message with "Resume directly" preamble
 */
import { streamChat } from '../provider/client.js';
import type { VexaMessage } from '../types.js';
import { estimateTokens } from '../types.js';

export const AUTOCOMPACT_BUFFER = 13_000;
export const MANUAL_COMPACT_BUFFER = 3_000;
export const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_OUTPUT_FOR_SUMMARY = 20_000;

export function effectiveWindow(contextWindow: number, maxOutputTokens: number): number {
  return contextWindow - Math.min(maxOutputTokens, MAX_OUTPUT_FOR_SUMMARY);
}

export function shouldAutoCompact(messages: VexaMessage[], contextWindow: number, maxOutputTokens: number): boolean {
  const trigger = effectiveWindow(contextWindow, maxOutputTokens) - AUTOCOMPACT_BUFFER;
  return estimateContextTokens(messages) >= trigger;
}

/** anchor estimate: last real usage + chars/4 tail ([CX §1.1]) */
export function estimateContextTokens(messages: VexaMessage[]): number {
  let anchor = 0;
  let anchorIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const u = messages[i]?.usage;
    if (u !== undefined && u.estimated === false) {
      anchor = u.inputTokens + u.outputTokens;
      anchorIdx = i;
      break;
    }
  }
  let tail = 0;
  for (let i = anchorIdx + 1; i < messages.length; i++) {
    for (const b of messages[i]?.content ?? []) {
      if (b.type === 'text') tail += estimateTokens(b.text);
      else if (b.type === 'tool_result') tail += estimateTokens(b.content);
      else tail += 8;
    }
  }
  return anchor + tail;
}

/** serialize the conversation for the summarizer */
function transcriptText(messages: VexaMessage[]): string {
  return messages
    .map((m) => {
      const role = m.type.toUpperCase();
      const parts = m.content.map((b) => {
        if (b.type === 'text') return b.text;
        if (b.type === 'tool_use') return `[tool_use ${b.name}]`;
        if (b.type === 'tool_result') return `[tool_result] ${b.content.slice(0, 500)}`;
        return '';
      });
      return `${role}: ${parts.filter(Boolean).join(' ')}`;
    })
    .join('\n\n');
}

export const SUMMARIZER_PROMPT = [
  'You are summarizing a coding-agent conversation so work can continue seamlessly in a fresh context.',
  'IMPORTANT: Tool calls will be REJECTED and will waste your only turn. Respond with text only.',
  'First think inside <analysis> tags, then write the final summary inside <summary> tags with EXACTLY these 9 sections:',
  '1. Primary Request and Intent',
  '2. Key Technical Concepts',
  '3. Files and Code Sections (with short snippets)',
  '4. Errors and fixes (include user feedback)',
  '5. Problem Solving',
  '6. All user messages (critical — list them)',
  '7. Pending Tasks',
  '8. Current Work',
  '9. Optional Next Step (quote the user if relevant)',
].join('\n');

export interface CompactResult {
  summary: string;
  usageTokens: number;
}

/** one-turn summarizer fork (A8: no tools) */
export async function summarizeConversation(
  messages: VexaMessage[],
  opts: { baseUrl: string; apiKey: string; model: string; maxTokensParam?: string; maxTokens?: number; instructions?: string },
): Promise<CompactResult> {
  const result = await streamChat({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    messages: [
      { role: 'system', content: SUMMARIZER_PROMPT + (opts.instructions !== undefined && opts.instructions !== '' ? `\n\nAdditional Instructions: ${opts.instructions}` : '') },
      { role: 'user', content: `Summarize this conversation for continuation:\n\n${transcriptText(messages)}` },
    ],
    maxTokens: Math.min(opts.maxTokens ?? 8000, MAX_OUTPUT_FOR_SUMMARY),
    maxTokensParam: opts.maxTokensParam,
    supports: { tools: false, streamOptions: false, vision: false },
  });
  const text = result.text;
  const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(text);
  const raw = summaryMatch !== null ? (summaryMatch[1] ?? text) : text;
  const summary = raw.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  return { summary, usageTokens: result.usage.totalTokens };
}

/** build the post-compact message list: summary as isCompactSummary user message [CX §1.2.7] */
export function applyCompaction(messages: VexaMessage[], summary: string, transcriptPath: string): VexaMessage[] {
  const msg: VexaMessage = {
    uuid: globalThis.crypto.randomUUID(),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    type: 'user',
    isCompactSummary: true,
    content: [
      {
        type: 'text',
        text: `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier history. Full transcript: ${transcriptPath}\n\n${summary}\n\nResume directly — do not acknowledge the summary.`,
      },
    ],
  };
  return [msg];
}

export function stripAnalysis(text: string): string {
  return text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
}
