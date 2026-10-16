/**
 * GUI bridge (SPEC §6 P21): `vexa --gui` — line-delimited JSON on stdio.
 * The Tauri app spawns this process and speaks the protocol:
 *   in:  {"type":"user_message","text":"..."}
 *        {"type":"permission_response","id":"...","allow":true}
 *        {"type":"interrupt"}
 *   out: {"type":"ready",...}
 *        {"type":"assistant_delta","text":"..."}   (raw stream deltas)
 *        {"type":"assistant_message","text":"..."} (complete)
 *        {"type":"tool_use","name":"...","input":{...}}
 *        {"type":"tool_result","name":"...","content":"...","isError":false}
 *        {"type":"permission_request","id":"...","tool":"...","input":{...}}
 *        {"type":"turn_end","usage":{...}}
 *        {"type":"error","message":"..."}
 */
import { resolveApiKey } from '../config/profiles.js';
import { loadVexamd, type VexamdResult } from '../context/vexamd.js';
import { ensureMemoryDir, loadMemory } from '../context/memory.js';
import { discoverSkills, skillsPromptSection } from '../extensibility/skills.js';
import { buildSystemPrompt } from '../engine/prompt.js';
import { runAgentTurn } from '../engine/queryLoop.js';
import { Transcript, newSessionId, transcriptPathFor } from '../sessions/transcript.js';
import { appState } from '../state.js';
import { getAllBaseTools } from '../tools/registry.js';
import { createTaskTool } from '../tools/task.js';
import type { CliContext } from '../cli.js';
import type { Tool, ToolContext } from '../tools/types.js';
import type { VexaMessage } from '../types.js';

export interface GuiEvent {
  type: string;
  [k: string]: unknown;
}

export function runGuiBridge(ctx: CliContext): void {
  const send = (e: GuiEvent): void => {
    process.stdout.write(JSON.stringify(e) + '\n');
  };

  appState.webSearch = ctx.settings.webSearch;
  let key = '';
  try {
    key = resolveApiKey(ctx.resolved.profile, ctx.resolved.profileName);
  } catch (e) {
    send({ type: 'error', fatal: true, message: (e as Error).message });
    process.exit(1);
  }

  const sessionVexamd: VexamdResult = loadVexamd(process.cwd());
  const memoryDir = ensureMemoryDir(process.cwd());
  const memory = loadMemory(process.cwd());
  const skills = discoverSkills(process.cwd());

  const baseTools: Tool[] = getAllBaseTools().filter((t) => t.isEnabled());
  const tools: Tool[] = [
    ...baseTools,
    createTaskTool({
      baseUrl: ctx.resolved.profile.baseUrl,
      apiKey: key,
      model: ctx.resolved.modelId,
      label: ctx.resolved.profileName,
      headers: ctx.resolved.profile.headers,
      maxTokens: ctx.resolved.profile.maxTokens,
      maxTokensParam: ctx.resolved.profile.maxTokensParam,
      temperature: ctx.resolved.profile.temperature,
      supports: ctx.resolved.profile.supports,
      dropFields: ctx.resolved.profile.dropFields,
      parentTools: baseTools,
      parentPermissionAsk: async (tool, input) => {
        return new Promise<boolean>((resolve) => {
          pendingPermission = { resolve };
          send({ type: 'permission_request', id: crypto.randomUUID(), tool: tool.name, input });
        });
      },
      cwd: process.cwd(),
      maxTurns: 30,
    }),
  ];

  let sessionId = newSessionId();
  const newTranscript = (): Transcript => new Transcript(transcriptPathFor(process.cwd(), sessionId), sessionId, ctx.version);
  let transcript = newTranscript();
  let pendingPermission: { resolve: (allow: boolean) => void } | null = null;
  let interruptRequested = false;
  let currentAbort: AbortController | null = null;

  const abortFor = (): { abort: AbortController; toolCtx: ToolContext } => {
    const abort = new AbortController();
    return {
      abort,
      toolCtx: {
        abortController: abort,
        readFileState: new Map(),
        cwd: process.cwd(),
      },
    };
  };

  const built = buildSystemPrompt({
    modelId: ctx.resolved.modelId,
    modelLabel: ctx.resolved.profileName,
    cwd: process.cwd(),
    isGitRepo: ctx.projectRoot !== null,
    toolsEnabled: tools.map((t) => t.name),
    vexamd: sessionVexamd,
    memoryContent: memory.content,
    memoryDir,
    skillsSection: skillsPromptSection(skills) ?? undefined,
  });

  send({
    type: 'ready',
    session_id: sessionId,
    model: ctx.resolved.modelId,
    provider: ctx.resolved.profileName,
    cwd: process.cwd(),
    version: ctx.version,
    memoryWarnings: memory.warnings,
  });

  // stdin command loop
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line === '') continue;
      try {
        void handleCommand(JSON.parse(line) as GuiEvent);
      } catch (e) {
        send({ type: 'error', message: `bad command: ${(e as Error).message}` });
      }
    }
  });
  process.stdin.on('end', () => {
    // don't kill an in-flight turn (GUI may close stdin but expect the tail)
    if (activeTurns === 0) process.exit(0);
    stdinClosed = true;
  });

  let activeTurns = 0;
  let stdinClosed = false;

  async function handleCommand(cmd: GuiEvent): Promise<void> {
    if (cmd.type === 'permission_response') {
      if (pendingPermission !== null) {
        const p = pendingPermission;
        pendingPermission = null;
        p.resolve(cmd['allow'] === true);
      }
      return;
    }
    if (cmd.type === 'interrupt') {
      interruptRequested = true;
      currentAbort?.abort();
      return;
    }
    if (cmd.type === 'new_session') {
      sessionId = newSessionId();
      transcript = newTranscript();
      send({ type: 'ready', session_id: sessionId, model: ctx.resolved.modelId, provider: ctx.resolved.profileName, cwd: process.cwd(), version: ctx.version });
      return;
    }
    if (cmd.type !== 'user_message') return;
    const text = typeof cmd['text'] === 'string' ? cmd['text'].trim() : '';
    if (text === '') return;

    activeTurns++;
    const { abort, toolCtx } = abortFor();
    currentAbort = abort;
    const userMsg: VexaMessage = {
      uuid: crypto.randomUUID(),
      parentUuid: null,
      timestamp: new Date().toISOString(),
      type: 'user',
      content: [{ type: 'text', text }],
    };
    await transcript.append(userMsg, { fsync: true });
    const messages: VexaMessage[] = [userMsg];
    const mark = messages.length;
    let accText = '';
    interruptRequested = false;

    try {
      const r = await runAgentTurn({
        baseUrl: ctx.resolved.profile.baseUrl,
        apiKey: key,
        model: ctx.resolved.modelId,
        system: built.system,
        messages,
        tools,
        maxTokens: ctx.resolved.profile.maxTokens,
        maxTurns: ctx.flags.maxTurns ?? 100,
        toolContext: toolCtx,
        // interactive: ask via permission_request events; read-only tools allowed
        permissionAsk: async (tool, input) => {
          if (tool.isReadOnly === true) return true;
          return new Promise<boolean>((resolve) => {
            pendingPermission = { resolve };
            send({ type: 'permission_request', id: crypto.randomUUID(), tool: tool.name, input });
          });
        },
        onTextDelta: (delta: string) => {
          accText += delta;
          send({ type: 'assistant_delta', text: delta });
        },
        onToolResult: (name, content, isError) => {
          send({ type: 'tool_result', name, content: String(content).slice(0, 8000), isError: isError === true });
        },
        signal: abort.signal,
      });
      for (const m of messages.slice(mark)) await transcript.append(m);
      if (interruptRequested) abort.abort();
      send({ type: 'assistant_message', text: r.finalText });
      send({ type: 'turn_end', usage: r.usage, toolCalls: r.toolCallCount, finishReason: r.finishReason });
    } catch (e) {
      send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      send({ type: 'turn_end', usage: null, toolCalls: 0, finishReason: 'error' });
    }
    activeTurns--;
    if (stdinClosed && activeTurns === 0) process.exit(0);
  }
}
