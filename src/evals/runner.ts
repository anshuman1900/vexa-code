/**
 * Eval harness (SPEC §6 P19): runnable behavioral evals against any provider.
 * A case: { name, prompt, setup?: {path,content}[], expect: {...} }.
 * Runs runAgentTurn in a throwaway sandbox dir; scoring is pure + testable.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAgentTurn } from '../engine/queryLoop.js';
import { getAllBaseTools } from '../tools/registry.js';
import { createTaskTool } from '../tools/task.js';
import { loadVexamd } from '../context/vexamd.js';
import { buildSystemPrompt } from '../engine/prompt.js';
import type { Tool, ToolContext } from '../tools/types.js';
import type { VexaMessage } from '../types.js';
import type { ResolvedModel } from '../config/profiles.js';

export interface EvalCase {
  name: string;
  prompt: string;
  /** files created in the sandbox before the run */
  setup?: Array<{ path: string; content: string }>;
  expect: {
    toolUsed?: string;
    toolNotUsed?: string;
    outputContains?: string[];
    outputMatches?: string; // regex source
    maxTurns?: number;
  };
}

export interface EvalOutcome {
  name: string;
  pass: boolean;
  failures: string[];
  finalText: string;
  toolsUsed: string[];
  turns: number;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  error?: string;
}

export function scoreEval(c: EvalCase, finalText: string, toolsUsed: string[], turns: number): string[] {
  const failures: string[] = [];
  if (c.expect.toolUsed !== undefined && !toolsUsed.includes(c.expect.toolUsed)) {
    failures.push(`expected tool ${c.expect.toolUsed} to be used (used: ${toolsUsed.join(', ') || 'none'})`);
  }
  if (c.expect.toolNotUsed !== undefined && toolsUsed.includes(c.expect.toolNotUsed)) {
    failures.push(`tool ${c.expect.toolNotUsed} must not be used`);
  }
  for (const s of c.expect.outputContains ?? []) {
    if (!finalText.includes(s)) failures.push(`output missing "${s}"`);
  }
  if (c.expect.outputMatches !== undefined && new RegExp(c.expect.outputMatches).test(finalText) === false) {
    failures.push(`output !~ /${c.expect.outputMatches}/`);
  }
  const cap = c.expect.maxTurns ?? 25;
  if (turns > cap) failures.push(`turns ${turns} > cap ${cap}`);
  return failures;
}

export async function runEvalCase(
  c: EvalCase,
  resolved: ResolvedModel,
  apiKey: string,
  version: string,
): Promise<EvalOutcome> {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-eval-'));
  for (const f of c.setup ?? []) {
    const fp = path.join(sandbox, f.path);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, f.content);
  }
  const started = Date.now();
  const toolsUsed: string[] = [];
  const outcome: EvalOutcome = {
    name: c.name, pass: false, failures: [], finalText: '', toolsUsed: [],
    turns: 0, tokensIn: 0, tokensOut: 0, durationMs: 0,
  };
  try {
    const baseTools: Tool[] = getAllBaseTools().filter((t) => t.isEnabled());
    const tools: Tool[] = [
      ...baseTools,
      createTaskTool({
        baseUrl: resolved.profile.baseUrl, apiKey, model: resolved.modelId, label: resolved.profileName,
        headers: resolved.profile.headers, maxTokens: resolved.profile.maxTokens,
        maxTokensParam: resolved.profile.maxTokensParam, temperature: resolved.profile.temperature,
        supports: resolved.profile.supports, dropFields: resolved.profile.dropFields,
        parentTools: baseTools, parentPermissionAsk: async () => true,
        cwd: sandbox, maxTurns: 20,
      }),
    ];
    const abort = new AbortController();
    const toolCtx: ToolContext = { abortController: abort, readFileState: new Map(), cwd: sandbox };
    const built = buildSystemPrompt({
      modelId: resolved.modelId, modelLabel: resolved.profileName, cwd: sandbox, isGitRepo: false,
      toolsEnabled: tools.map((t) => t.name),
      vexamd: loadVexamd(sandbox),
    });
    const messages: VexaMessage[] = [{
      uuid: crypto.randomUUID(), parentUuid: null, timestamp: new Date().toISOString(),
      type: 'user', content: [{ type: 'text', text: c.prompt }],
    }];
    const r = await runAgentTurn({
      baseUrl: resolved.profile.baseUrl, apiKey, model: resolved.modelId,
      system: built.system, messages, tools,
      maxTokens: resolved.profile.maxTokens, maxTurns: c.expect.maxTurns ?? 25,
      toolContext: toolCtx,
      permissionAsk: async () => true, // sandbox: everything allowed
      onToolResult: (name) => {
        if (!toolsUsed.includes(name)) toolsUsed.push(name);
      },
      signal: abort.signal,
    });
    outcome.finalText = r.finalText;
    outcome.turns = r.toolCallCount;
    outcome.tokensIn = r.usage.inputTokens;
    outcome.tokensOut = r.usage.outputTokens;
    outcome.toolsUsed = toolsUsed;
    outcome.failures = scoreEval(c, r.finalText, toolsUsed, r.toolCallCount);
    outcome.pass = outcome.failures.length === 0;
  } catch (e) {
    outcome.error = e instanceof Error ? e.message : String(e);
    outcome.failures = [outcome.error ?? 'error'];
  }
  outcome.durationMs = Date.now() - started;
  fs.rmSync(sandbox, { recursive: true, force: true });
  void version;
  return outcome;
}
