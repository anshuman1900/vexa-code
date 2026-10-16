/**
 * Context tracker (SPEC §6 P4 / [CX §1.1]): token estimate = last real usage
 * anchor + chars/4 for everything after it; warning states against the
 * effective window (contextWindow − min(maxOutput, 20 000)).
 */
import type { VexaMessage } from '../types.js';
import { estimateTokens } from '../types.js';

export interface ContextState {
  usedTokens: number;
  contextWindow: number;
  effectiveWindow: number;
  pct: number;
  /** yellow banner threshold: trigger − 20 000 (per [CX §1.1] warning budget) */
  shouldWarn: boolean;
  /** autocompact trigger point (P14 uses this) */
  triggerTokens: number;
}

export function computeContextState(
  messages: VexaMessage[],
  contextWindow: number,
  maxOutputTokens: number,
): ContextState {
  const effectiveWindow = contextWindow - Math.min(maxOutputTokens, 20_000);
  const triggerTokens = effectiveWindow - 13_000;
  const warnTokens = triggerTokens - 20_000;

  // anchor: the last message that carries real usage from the provider
  let anchorTokens = 0;
  let anchorIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const u = messages[i]?.usage;
    if (u !== undefined && u.estimated === false) {
      anchorTokens = u.inputTokens + u.outputTokens;
      anchorIdx = i;
      break;
    }
  }
  let tail = 0;
  for (let i = anchorIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m === undefined) continue;
    for (const b of m.content) {
      if (b.type === 'text') tail += estimateTokens(b.text);
      else if (b.type === 'tool_result') tail += estimateTokens(b.content);
      else tail += 8; // tool_use/image/reasoning blocks: coarse constant
    }
  }
  const usedTokens = anchorTokens + tail;
  const pct = contextWindow > 0 ? Math.min(100, Math.round((usedTokens / contextWindow) * 100)) : 0;
  return {
    usedTokens,
    contextWindow,
    effectiveWindow,
    pct,
    shouldWarn: usedTokens >= warnTokens,
    triggerTokens,
  };
}
