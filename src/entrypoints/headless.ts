/**
 * Headless mode (SPEC SS6 P17 / A16): `vexa -p "prompt"` with text or JSON
 * output (VEXA_OUTPUT_FORMAT=json). One agent turn, non-interactive:
 * read-only tools auto-allowed, writes denied; transcript persisted like
 * the REPL; exit code 0 on success / 1 on API failure / 2 on usage error.
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
import { createCheckpointer } from '../sessions/checkpoints.js';
import type { CliContext } from '../cli.js';
import type { Tool, ToolContext } from '../tools/types.js';
import type { VexaMessage } from '../types.js';

export async function runHeadless(ctx: CliContext, positionals: string[]): Promise<void> {
  let prompt = positionals.join(' ').trim();
  const fmt = (process.env['VEXA_OUTPUT_FORMAT'] ?? 'text').toLowerCase();
  if (prompt === '' && !process.stdin.isTTY) {
    prompt = (await readStdin()).trim();
  }
  if (prompt === '') {
    process.stderr.write('vexa: -p/--print needs a prompt (arg or stdin)\n');
    process.exit(2);
  }

  appState.webSearch = ctx.settings.webSearch;
  const sessionVexamd: VexamdResult = loadVexamd(process.cwd());
  const memoryDir = ensureMemoryDir(process.cwd());
  const memory = loadMemory(process.cwd());
  const skills = discoverSkills(process.cwd());

  let key = '';
  try {
    key = resolveApiKey(ctx.resolved.profile, ctx.resolved.profileName);
  } catch (e) {
    process.stderr.write(`vexa: ${(e as Error).message}\n`);
    process.exit(1);
  }

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
      parentPermissionAsk: async () => false, // headless subagents: no dialog
      cwd: process.cwd(),
      maxTurns: 30,
    }),
  ];

  const sessionId = newSessionId();
  const transcript = new Transcript(transcriptPathFor(process.cwd(), sessionId), sessionId, ctx.version);
  const abort = new AbortController();
  const readFileState = new Map<string, { mtimeMs: number }>();
  const checkpointer = createCheckpointer(sessionId, process.cwd());
  const toolCtx: ToolContext = {
    abortController: abort,
    readFileState,
    cwd: process.cwd(),
    checkpoint: (fp, prior) => checkpointer.save(fp, prior),
  };

  const built = buildSystemPrompt({
    modelId: ctx.resolved.modelId,
    modelLabel: ctx.resolved.profileName,
    cwd: process.cwd(),
    isGitRepo: ctx.projectRoot !== null,
    toolsEnabled: tools.map((t) => t.name),
    permissionMode: 'default',
    vexamd: sessionVexamd,
    memoryContent: memory.content,
    memoryDir,
    skillsSection: skillsPromptSection(skills) ?? undefined,
  });

  const userMsg: VexaMessage = {
    uuid: crypto.randomUUID(),
    parentUuid: null,
    timestamp: new Date().toISOString(),
    type: 'user',
    content: [{ type: 'text', text: prompt }],
  };
  await transcript.append(userMsg, { fsync: true });

  const messages: VexaMessage[] = [userMsg];
  const toolUses: Array<{ name: string; isError: boolean }> = [];
  const mark = messages.length;
  try {
    const r = await runAgentTurn({
      baseUrl: ctx.resolved.profile.baseUrl,
      apiKey: key,
      model: ctx.resolved.modelId,
      system: built.system,
      messages,
      tools,
      maxTokens: ctx.resolved.profile.maxTokens,
      maxTurns: ctx.flags.maxTurns ?? 50,
      toolContext: toolCtx,
      // headless permission flow: no dialog — read-only tools auto-allowed, writes denied
      permissionAsk: async (tool) => tool.isReadOnly === true,
      onToolResult: (name, _content, isError) => {
        toolUses.push({ name, isError });
      },
      signal: abort.signal,
    });
    for (const m of messages.slice(mark)) await transcript.append(m);
    if (fmt === 'json') {
      process.stdout.write(
        JSON.stringify(
          {
            type: 'result',
            subtype: 'success',
            session_id: sessionId,
            result: r.finalText,
            toolUses: toolUses.length,
            usage: r.usage,
            finishReason: r.finishReason,
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      process.stdout.write(r.finalText + '\n');
    }
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (fmt === 'json') {
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error', session_id: sessionId, error: msg }, null, 2) + '\n');
    } else {
      process.stderr.write(`vexa error: ${msg}\n`);
    }
    process.exit(1);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}
