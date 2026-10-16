/**
 * OpenAI wire-format translation (SPEC §3, A1/A6/A7/A19).
 * Internal VexaMessage blocks ↔ chat/completions payloads.
 */
import type { Block, VexaMessage } from '../types.js';

export type WireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Array<Record<string, unknown>> }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface WireTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export function toWireTool(name: string, description: string, parameters: unknown): WireTool {
  return { type: 'function', function: { name, description, parameters } };
}

/**
 * Translate the conversation to OpenAI messages (SPEC A1/A7/A19):
 * - system → single role:'system' (caller guarantees exactly one, at index 0)
 * - assistant text → content; tool_use blocks → tool_calls; reasoning NEVER sent (A6)
 * - tool_result blocks → one role:'tool' message each; isError → "Error: " prefix (A7)
 * - images ride on the next user message as image_url parts when supported,
 *   else a text placeholder (A19)
 */
export function toWireMessages(messages: VexaMessage[], opts: { supportsVision: boolean }): WireMessage[] {
  const out: WireMessage[] = [];
  /** images waiting to attach to the next user-role text emission */
  let pendingImages: Array<{ mediaType: string; data: string }> = [];

  const flushImagesAsUser = (): void => {
    if (pendingImages.length === 0) return;
    const parts = pendingImages.map((img) =>
      opts.supportsVision
        ? { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } }
        : { type: 'text', text: '[image omitted: provider lacks vision support]' },
    );
    out.push({ role: 'user', content: parts });
    pendingImages = [];
  };

  for (const msg of messages) {
    if (msg.type === 'system') {
      out.push({ role: 'system', content: textOf(msg.content) });
      continue;
    }
    if (msg.type === 'assistant') {
      const text = textOf(msg.content);
      const toolCalls = msg.content
        .filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function' as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: 'assistant',
        content: text === '' && toolCalls.length > 0 ? null : text,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    if (msg.type === 'user') {
      const toolResults = msg.content.filter(
        (b): b is Extract<Block, { type: 'tool_result' }> => b.type === 'tool_result',
      );
      for (const tr of toolResults) {
        out.push({
          role: 'tool',
          tool_call_id: tr.toolUseId,
          content: tr.isError ? `Error: ${tr.content}` : tr.content,
        });
      }
      const texts = msg.content
        .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text);
      const images = msg.content.filter((b): b is Extract<Block, { type: 'image' }> => b.type === 'image');
      pendingImages.push(...images);
      const userText = texts.join('\n');
      if (userText !== '') {
        flushImagesAsUser();
        out.push({ role: 'user', content: userText });
      }
      continue;
    }
    // 'progress' / 'attachment' never go on the wire (they ride as <system-reminder>
    // text inside user messages when the engine injects them — P4+).
  }
  flushImagesAsUser();
  return out;
}

function textOf(blocks: Block[]): string {
  return blocks
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
