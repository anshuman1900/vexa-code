/**
 * Agent loop (SPEC §6 P8 / [AL §1.3, §1.5]): the while(true) state machine.
 * - turn = model call → tool_calls? → partition (safe batches ≤10, unsafe
 *   serial) → permission gate → execute → synthetic tool_results for EVERY
 *   call id (orphan prevention, A7) → loop
 * - recovery: finish_reason 'length' → one-shot max_tokens escalation (A13)
 * - max-turns guard synthesizes error results before exiting
 */
import { streamChat } from '../provider/client.js';
import { toWireMessages, toWireTool, type WireMessage, type WireTool } from '../provider/wire.js';
import { ProviderError } from '../provider/retry.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';
import type { VexaMessage, Usage } from '../types.js';
import { addUsage, EMPTY_USAGE } from '../types.js';

export interface AgentTurnOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  label?: string;
  headers?: Record<string, string>;
  system: string;
  /** conversation so far (mutated: new messages appended) */
  messages: VexaMessage[];
  tools: Tool[];
  maxTokens: number;
  maxTokensParam?: string;
  temperature?: number;
  supports?: { tools?: boolean; streamOptions?: boolean; vision?: boolean };
  dropFields?: string[];
  maxTurns: number;
  toolContext: ToolContext;
  /** return true to allow the call; false = denied (fed back to the model) */
  permissionAsk: (tool: Tool, input: unknown) => Promise<boolean>;
  onTextDelta?: (d: string) => void;
  onReasoningDelta?: (d: string) => void;
  onToolStart?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, summary: string, isError: boolean) => void;
  signal?: AbortSignal;
  sleepFn?: (ms: number) => Promise<void>;
}

export interface AgentTurnResult {
  finalText: string;
  finishReason: string;
  usage: Usage;
  toolCallCount: number;
  aborted: boolean;
}

const MAX_CONCURRENCY = Number(process.env['VEXA_MAX_TOOL_USE_CONCURRENCY'] ?? 10);
const MAX_OUTPUT_FLOOR = 3000;

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + `… [+${s.length - n} chars]` : s;
}

/** consecutive safe tools batch together; any unsafe tool = serial batch [AL §1.3] */
function partition(calls: Array<{ id: string; name: string; input: unknown }>, byName: Map<string, Tool>): Array<Array<{ id: string; name: string; input: unknown }>> {
  const batches: Array<Array<{ id: string; name: string; input: unknown }>> = [];
  let current: Array<{ id: string; name: string; input: unknown }> = [];
  for (const call of calls) {
    const tool = byName.get(call.name);
    const safe = tool?.isConcurrencySafe === true;
    if (safe) {
      current.push(call);
    } else {
      if (current.length > 0) batches.push(current);
      current = [];
      batches.push([call]);
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function runOne(
  call: { id: string; name: string; input: unknown },
  tool: Tool | undefined,
  opts: AgentTurnOptions,
  allowWithoutAsk: boolean,
): Promise<{ toolUseId: string; content: string; isError: boolean }> {
  const fail = (content: string): { toolUseId: string; content: string; isError: boolean } => ({
    toolUseId: call.id,
    content,
    isError: true,
  });
  if (tool === undefined) return fail(`Unknown tool: ${call.name}`);
  let parsed: unknown = call.input;
  if (typeof call.input === 'string' && call.input.trim() !== '') {
    try {
      parsed = JSON.parse(call.input);
    } catch {
      return fail(`Malformed tool arguments (invalid JSON): ${truncate(String(call.input), 200)}`);
    }
  }
  if (tool.checkPermissions(parsed, opts.toolContext) === 'ask' && !allowWithoutAsk) {
    let allowed = false;
    try {
      allowed = await opts.permissionAsk(tool, parsed);
    } catch {
      allowed = false;
    }
    if (!allowed) return fail('User denied permission for this tool call.');
  }
  try {
    const r: ToolResult = await tool.call(parsed, opts.toolContext);
    const data = r.data;
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return { toolUseId: call.id, content: truncate(text, tool.maxResultSizeChars ?? 50_000), isError: false };
  } catch (e) {
    return { toolUseId: call.id, content: truncate((e as Error).message, 2000), isError: true };
  }
}

export async function runAgentTurn(opts: AgentTurnOptions): Promise<AgentTurnResult> {
  const byName = new Map<string, Tool>(opts.tools.map((t) => [t.name, t]));
  const wireTools: WireTool[] = opts.tools.map((t) => toWireTool(t.name, t.description, t.inputSchema));
  let usage: Usage = { ...EMPTY_USAGE };
  let toolCallCount = 0;
  let aborted = false;
  let escalated = false;
  let maxTokens = opts.maxTokens;
  let accText = '';
  let prevFinish = '';

  for (let turn = 0; turn < opts.maxTurns; turn++) {
    const wire: WireMessage[] = [
      { role: 'system', content: opts.system },
      ...toWireMessages(opts.messages, { supportsVision: opts.supports?.vision === true }),
    ];

    let result;
    try {
      result = await streamChat(
        {
          baseUrl: opts.baseUrl,
          apiKey: opts.apiKey,
          model: opts.model,
          label: opts.label,
          headers: opts.headers,
          messages: wire,
          tools: wireTools,
          maxTokens,
          maxTokensParam: opts.maxTokensParam,
          temperature: opts.temperature,
          supports: opts.supports,
          dropFields: opts.dropFields,
          signal: opts.signal,
        },
        { onTextDelta: opts.onTextDelta, onReasoningDelta: opts.onReasoningDelta },
        { sleepFn: opts.sleepFn },
      );
    } catch (err) {
      // A7: synthesize results for any pending calls is n/a here (no pending);
      // surface provider errors, marking abort on signal-abort
      aborted = opts.signal?.aborted === true;
      throw err;
    }

    usage = addUsage(usage, result.usage);
    const assistantMsg: VexaMessage = {
      uuid: uuid(),
      parentUuid: opts.messages.at(-1)?.uuid ?? null,
      timestamp: new Date().toISOString(),
      type: 'assistant',
      content: [
        ...(result.text !== '' ? ([{ type: 'text', text: result.text }] as VexaMessage['content']) : []),
        ...result.toolCalls.map((tc) => ({ type: 'tool_use' as const, id: tc.id, name: tc.name, input: safeParse(tc.arguments) })),
      ],
      model: opts.model,
      provider: opts.label,
      usage: result.usage,
      finishReason: result.finishReason,
    };

    if (result.toolCalls.length === 0) {
      opts.messages.push(assistantMsg);
      // continuation after a length-hit joins text; otherwise last round wins
      if (result.text !== '') {
        accText = prevFinish === 'length' ? accText + result.text : result.text;
      }
      prevFinish = result.finishReason;
      // A13/length ladder: one-shot escalation, then surface
      if (result.finishReason === 'length' && !escalated) {
        escalated = true;
        maxTokens = Math.min(Math.max(Math.floor(maxTokens * 1.5), MAX_OUTPUT_FLOOR), Math.max(opts.supports?.tools === false ? 4096 : 200_000, maxTokens));
        opts.messages.push({
          uuid: uuid(),
          parentUuid: assistantMsg.uuid,
          timestamp: new Date().toISOString(),
          type: 'user',
          isMeta: true,
          content: [{ type: 'text', text: 'Output token limit hit. Resume directly — no apology, no repetition. Break the remaining work into smaller pieces.' }],
        });
        turn--; // this recovery doesn't consume a turn
        continue;
      }
      return { finalText: accText, finishReason: result.finishReason, usage, toolCallCount, aborted };
    }

    opts.messages.push(assistantMsg);
    prevFinish = result.finishReason;
    const calls = result.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, input: safeParse(tc.arguments) }));
    toolCallCount += calls.length;

    const results: Array<{ toolUseId: string; content: string; isError: boolean }> = [];
    const batches = partition(calls, byName);
    for (const batch of batches) {
      const safeTools = batch.every((c) => byName.get(c.name)?.isConcurrencySafe === true);
      if (safeTools && batch.length > 1) {
        // parallel, capped at MAX_CONCURRENCY
        for (let i = 0; i < batch.length; i += MAX_CONCURRENCY) {
          const slice = batch.slice(i, i + MAX_CONCURRENCY);
          const settled = await Promise.all(
            slice.map(async (c) => {
              opts.onToolStart?.(c.name, c.input);
              const r = await runOne(c, byName.get(c.name), opts, opts.permissionAsk === undefined);
              opts.onToolResult?.(c.name, r.content, r.isError);
              return r;
            }),
          );
          results.push(...settled);
        }
      } else {
        for (const c of batch) {
          if (opts.signal?.aborted === true) {
            results.push({ toolUseId: c.id, content: 'Aborted before execution.', isError: true });
            continue;
          }
          opts.onToolStart?.(c.name, c.input);
          const r = await runOne(c, byName.get(c.name), opts, opts.permissionAsk === undefined);
          opts.onToolResult?.(c.name, r.content, r.isError);
          results.push(r);
        }
      }
    }

    // orphan prevention (A7): every call id gets exactly one result message
    opts.messages.push({
      uuid: uuid(),
      parentUuid: assistantMsg.uuid,
      timestamp: new Date().toISOString(),
      type: 'user',
      content: calls.map((c) => {
        const r = results.find((x) => x.toolUseId === c.id);
        return {
          type: 'tool_result' as const,
          toolUseId: c.id,
          content: r?.content ?? 'Tool call was dropped — no result recorded.',
          isError: r?.isError ?? true,
        };
      }),
    });

    if (opts.signal?.aborted === true) {
      aborted = true;
      return {
        finalText: result.text,
        finishReason: 'aborted',
        usage,
        toolCallCount,
        aborted,
      };
    }
  }

  // max-turns exhausted
  return {
    finalText: '',
    finishReason: 'max_turns_reached',
    usage,
    toolCallCount,
    aborted,
  };
}

function safeParse(args: string): unknown {
  if (args.trim() === '') return {};
  try {
    return JSON.parse(args);
  } catch {
    return args; // malformed — runOne surfaces the error via its own parse
  }
}

export { ProviderError };
