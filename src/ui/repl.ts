/**
 * The interactive REPL (SPEC §6 P3 + P4 seed): Claude-Code-look session loop —
 * banner, ❯ prompt, slash commands, streaming turns with spinner + esc
 * interrupt, ⏺/⎿ tool-line grammar (wired when tools land in P5-P7),
 * per-turn usage line, Shift+Tab permission-mode cycle (display until P10).
 */
import readline from 'node:readline';
import { exec } from 'node:child_process';
import { streamChat } from '../provider/client.js';
import { toWireMessages } from '../provider/wire.js';
import { ProviderError } from '../provider/retry.js';
import { resolveApiKey } from '../config/profiles.js';
import type { VexaMessage, Usage } from '../types.js';
import { EMPTY_USAGE, addUsage } from '../types.js';
import { buildSystemPrompt } from '../engine/prompt.js';
import { runAgentTurn } from '../engine/queryLoop.js';
import { getAllBaseTools } from '../tools/registry.js';
import type { Tool, ToolContext } from '../tools/types.js';
import { computeContextState } from '../engine/contextTracker.js';
import {
  Transcript,
  listSessions,
  newSessionId,
  readTranscript,
  transcriptPathFor,
} from '../sessions/transcript.js';
import { c, usageLine, errorLine, successLine, clearLine, toolUseLine, toolResultLine, summarizeToolInput } from './render.js';
import { Spinner } from './spinner.js';
import type { CliContext } from '../cli.js';
import { resolveModelRef, type ResolvedModel } from '../config/profiles.js';

type PermMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

/** must-Read-first ledger, shared across the session (LRU cap arrives in P25) */
const readFileState = new Map<string, { mtimeMs: number }>();

function truncateResult(s: string): string {
  const one = s.replace(/\n/g, ' ⏎ ');
  return one.length > 220 ? one.slice(0, 220) + '…' : one;
}
const MODE_CYCLE: PermMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];
const MODE_LABEL: Record<PermMode, string> = {
  default: '',
  acceptEdits: '⏵⏵ accept edits on',
  plan: '⏸⏸ plan mode on',
  bypassPermissions: '⏵⏵⏵ bypass permissions on (unsafe)',
};

interface ReplState {
  messages: VexaMessage[];
  totalUsage: Usage;
  mode: PermMode;
  resolved: ResolvedModel;
  turns: number;
  interrupted: boolean;
  sessionId: string;
  transcript: Transcript;
}

const HELP_LINES = [
  'Vexa Code commands:',
  '  /help              show this help',
  '  /clear             start a fresh conversation',
  '  /model [ref]       show or switch model (alias, profile:model, or bare id)',
  '  /cost              session token usage',
  '  /status            model, provider, mode, context',
  '  /permissions       show permission mode (editor lands in P10)',
  '  /compact [note]    compact the conversation (lands in P14)',
  '  /resume [id]       resume a session (lands in P18)',
  '  /quit              exit',
  '',
  'Keyboard: Shift+Tab cycles permission mode · Esc interrupts · Ctrl+C twice exits',
];

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function isGitRepo(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec('git rev-parse --is-inside-work-tree 2>/dev/null', { cwd }, (err, stdout) =>
      resolve(err === null && stdout.trim() === 'true'),
    );
  });
}

function makeMsg(type: VexaMessage['type'], text: string, parent: string | null): VexaMessage {
  return {
    uuid: uuid(),
    parentUuid: parent,
    timestamp: new Date().toISOString(),
    type,
    content: [{ type: 'text', text }],
  };
}

export async function runRepl(ctx: CliContext): Promise<void> {
  const out = process.stdout;
  const git = await isGitRepo(ctx.settings.permissions.additionalDirectories.length >= 0 ? process.cwd() : process.cwd());

  out.write(
    [
      '',
      c.magenta('✻ ') + c.bold('Welcome to Vexa Code!'),
      c.dim('   a coding agent for your terminal — any model, any provider'),
      '',
      `  ${c.dim('model:')}  ${ctx.resolved.modelId} ${c.dim(`(${ctx.resolved.profileName})`)}`,
      `  ${c.dim('cwd:')}    ${process.cwd()}${git ? c.dim('  ·  git repo') : ''}`,
      `  ${c.dim('mode:')}   ${ctx.settings.permissions.defaultMode}`,
      '',
      c.dim(`  type a task, or /help for commands · shift+tab cycles modes`),
      '',
    ].join('\n'),
  );

  const state: ReplState = {
    messages: [],
    totalUsage: { ...EMPTY_USAGE },
    mode: ctx.settings.permissions.defaultMode,
    resolved: ctx.resolved,
    turns: 0,
    interrupted: false,
    sessionId: newSessionId(),
    transcript: new Transcript(transcriptPathFor(process.cwd(), newSessionId()), '', ctx.version),
  };

  // --resume <id> | most-recent when flag present (P4 crash recovery)
  if (ctx.resumeTarget !== undefined) {
    const sessions = listSessions(process.cwd());
    const target =
      ctx.resumeTarget === ''
        ? sessions[0]
        : sessions.find((s) => s.id === ctx.resumeTarget || s.id.startsWith(ctx.resumeTarget ?? ''));
    if (target === undefined) {
      out.write(c.yellow(`no session found for "${ctx.resumeTarget}" — starting fresh\n`));
    } else {
      const { messages, warnings, sessionId } = readTranscript(target.path);
      state.messages = messages;
      state.sessionId = sessionId ?? target.id;
      for (const w of warnings) out.write(c.yellow(`  ⚠ ${w}\n`));
      for (const m of state.messages) {
        if (m.usage !== undefined && m.usage.estimated === false) {
          state.totalUsage = addUsage(state.totalUsage, m.usage);
        }
      }
      out.write(
        c.dim(`✓ resumed ${state.messages.length} messages from ${target.id.slice(0, 8)}… (${new Date(target.mtimeMs).toLocaleString()})\n`),
      );
    }
  }
  state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.cyan('❯ '),
    terminal: process.stdin.isTTY === true,
  });

  // Shift+Tab permission-mode cycle (functional at P10; display now, like Claude)
  readline.emitKeypressEvents(process.stdin, rl);
  const onKeypress = (_str: string, key: { name?: string; shift?: boolean; ctrl?: boolean } | undefined): void => {
    if (key === undefined) return;
    if (key.shift === true && key.name === 'tab' && !running) {
      state.mode = MODE_CYCLE[(MODE_CYCLE.indexOf(state.mode) + 1) % MODE_CYCLE.length] ?? 'default';
      const label = MODE_LABEL[state.mode];
      out.write(`${clearLine()}${label === '' ? c.dim('mode: default') : c.yellow(label)}\n`);
      rl.prompt(true);
    }
  };
  let running = false;
  process.stdin.on('keypress', onKeypress);

  const printPrompt = (): void => {
    const label = MODE_LABEL[state.mode];
    rl.setPrompt(label === '' ? c.cyan('❯ ') : `${c.yellow(label)}\n${c.cyan('❯ ')}`);
    rl.prompt(true);
  };

  const runTurn = async (input: string): Promise<void> => {
    running = true;
    const userMsg = makeMsg('user', input, state.messages.at(-1)?.uuid ?? null);
    state.messages.push(userMsg);
    // Write discipline [AL §1.2.5]: user message fsync'd BEFORE any API call,
    // so kill -9 mid-turn still leaves the question on disk (P4 acceptance).
    await state.transcript.append(userMsg, { fsync: true });

    const system = buildSystemPrompt({
      modelId: state.resolved.modelId,
      modelLabel: state.resolved.profile.label ?? state.resolved.modelId,
      cwd: process.cwd(),
      isGitRepo: git,
    });

    let key = '';
    try {
      key = resolveApiKey(state.resolved.profile, state.resolved.profileName);
    } catch (e) {
      out.write(errorLine((e as Error).message) + '\n');
      running = false;
      return;
    }

    const spinner = new Spinner(out);
    spinner.start();
    const abort = new AbortController();
    let interrupted = false;

    const toolCtx: ToolContext = {
      abortController: abort,
      readFileState,
      cwd: process.cwd(),
    };
    const tools: Tool[] = getAllBaseTools().filter((t) => t.isEnabled());

    const askPermission = async (tool: Tool, input: unknown): Promise<boolean> => {
      if (process.stdin.isTTY !== true) return false; // headless: auto-deny (P17 semantics)
      // plan mode: read-only tools only (early P12 enforcement)
      if (state.mode === 'plan' && !tool.isReadOnly) {
        out.write(c.yellow(`⏸ ${tool.name} blocked in plan mode (read-only only)\n`));
        return false;
      }
      if (state.mode === 'acceptEdits' && (tool.name === 'Edit' || tool.name === 'Write')) return true;
      rl.pause();
      out.write(
        `\n${c.yellow(`⚠ ${tool.name} requests permission`)} ${c.dim(JSON.stringify(input ?? {}).slice(0, 180))}\n`,
      );
      const answer: string = await new Promise((resolve) => {
        rl.question(c.cyan('  allow? (y/n) > '), (a) => resolve(a.trim().toLowerCase()));
      });
      rl.resume();
      return answer === 'y' || answer === 'yes';
    };

    // Esc interrupts the stream, like Claude Code (raw-mode keypress during turn)
    const wasRaw = process.stdin.isRaw === true;
    if (process.stdin.isTTY === true) {
      process.stdin.setRawMode(true);
      const onKey = (_s: string, k: { name?: string; ctrl?: boolean } | undefined): void => {
        if (k === undefined) return;
        if (k.name === 'escape') {
          interrupted = true;
          abort.abort();
        }
        if (k.ctrl === true && k.name === 'c') {
          interrupted = true;
          abort.abort();
        }
      };
      process.stdin.once('keypress', onKey);
      process.stdin.resume();
      var cleanupKeys = (): void => {
        process.stdin.removeListener('keypress', onKey);
        if (!wasRaw) process.stdin.setRawMode(false);
      };
    } else {
      var cleanupKeys = (): void => {};
    }

    const in0 = state.totalUsage.inputTokens;
    const out0 = state.totalUsage.outputTokens;
    let firstChunk = true;

    try {
      const result = await runAgentTurn({
        baseUrl: state.resolved.profile.baseUrl,
        apiKey: key,
        model: state.resolved.modelId,
        label: state.resolved.profileName,
        headers: state.resolved.profile.headers,
        system,
        messages: state.messages,
        tools,
        maxTokens: state.resolved.profile.maxTokens,
        maxTokensParam: state.resolved.profile.maxTokensParam,
        temperature: state.resolved.profile.temperature,
        supports: state.resolved.profile.supports,
        dropFields: state.resolved.profile.dropFields,
        maxTurns: ctx.flags.maxTurns ?? 200,
        toolContext: toolCtx,
        permissionAsk: askPermission,
        onTextDelta: (d) => {
          if (firstChunk) {
            firstChunk = false;
            spinner.stop();
          }
          process.stdout.write(d);
        },
        onReasoningDelta: (d) => {
          if (firstChunk) {
            firstChunk = false;
            spinner.stop();
          }
          process.stdout.write(c.dim(d));
        },
        onToolStart: (name, input) => {
          if (firstChunk) {
            firstChunk = false;
            spinner.stop();
          }
          out.write('\n' + toolUseLine(name, summarizeToolInput(name, input)));
        },
        onToolResult: (name, content, isError) => {
          out.write(toolResultLine(truncateResult(content), isError) + '\n');
          void name;
        },
        signal: abort.signal,
      });

      spinner.stop();
      if (result.finalText !== '') out.write('\n');

      state.totalUsage = addUsage(state.totalUsage, result.usage);
      state.messages.push({
        uuid: uuid(),
        parentUuid: state.messages.at(-1)?.uuid ?? null,
        timestamp: new Date().toISOString(),
        type: 'assistant',
        content: [{ type: 'text', text: result.finalText === '' ? (result.finishReason === 'max_turns_reached' ? '[max turns reached]' : '') : result.finalText }],
        model: state.resolved.modelId,
        provider: state.resolved.profileName,
        usage: result.usage,
        finishReason: result.finishReason,
      });
      void state.transcript.append(state.messages.at(-1) as VexaMessage);
      state.turns++;
      out.write(
        usageLine(
          result.usage.inputTokens,
          result.usage.outputTokens,
          state.totalUsage.inputTokens,
          state.totalUsage.outputTokens,
          state.resolved.profile.contextWindow,
        ) + '\n',
      );
      const cs = computeContextState(state.messages, state.resolved.profile.contextWindow, state.resolved.profile.maxTokens);
      if (cs.shouldWarn) {
        out.write(
          c.yellow(
            `⚠ context ${cs.usedTokens.toLocaleString()} tok (≈${cs.pct}%) — auto-compact triggers at ${cs.triggerTokens.toLocaleString()} (P14)`,
          ) + '\n',
        );
      }
      if (interrupted) out.write(c.yellow('⏹ interrupted\n'));
    } catch (err) {
      spinner.stop();
      out.write('\n');
      if (err instanceof ProviderError) {
        out.write(errorLine(`${err.kind}: ${err.message}`) + '\n');
        if (err.kind === 'auth') {
          out.write(c.dim(`  → check the key: vexa providers test ${state.resolved.profileName}`) + '\n');
        }
      } else {
        out.write(errorLine((err as Error).message) + '\n');
      }
      if (interrupted) out.write(c.yellow('⏹ interrupted\n'));
    } finally {
      cleanupKeys();
      running = false;
    }
  };

  const handleSlash = async (line: string): Promise<'handled' | 'quit'> => {
    const [cmdRaw, ...rest] = line.trim().split(/\s+/);
    const cmd = (cmdRaw ?? '').toLowerCase();
    const arg = rest.join(' ').trim();
    switch (cmd) {
      case '/help':
        out.write(HELP_LINES.map((l) => c.dim(l)).join('\n') + '\n');
        return 'handled';
      case '/clear':
        state.messages = [];
        state.turns = 0;
        state.totalUsage = { ...EMPTY_USAGE };
        state.sessionId = newSessionId();
        state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);
        out.write(c.dim('✓ conversation cleared (new session started)\n'));
        return 'handled';
      case '/resume': {
        const sessions = listSessions(process.cwd());
        if (sessions.length === 0) {
          out.write(c.dim('no sessions yet for this directory\n'));
          return 'handled';
        }
        const target =
          arg === ''
            ? sessions[0]
            : sessions.find((s) => s.id === arg || s.id.startsWith(arg));
        if (target === undefined) {
          out.write(errorLine(`no session matching "${arg}"`) + '\n');
          return 'handled';
        }
        const { messages, warnings, sessionId } = readTranscript(target.path);
        state.messages = messages;
        state.sessionId = sessionId ?? target.id;
        state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);
        state.totalUsage = { ...EMPTY_USAGE };
        for (const m of state.messages) {
          if (m.usage !== undefined && m.usage.estimated === false) state.totalUsage = addUsage(state.totalUsage, m.usage);
        }
        for (const w of warnings) out.write(c.yellow(`  ⚠ ${w}\n`));
        out.write(successLine(`resumed ${state.messages.length} messages (${new Date(target.mtimeMs).toLocaleString()})\n`));
        return 'handled';
      }
      case '/continue':
        out.write(c.dim('use /resume — same thing; /continue is an alias\n'));
        return 'handled';
      case '/model': {
        if (arg === '') {
          out.write(c.bold('current: ') + `${state.resolved.profileName}:${state.resolved.modelId}\n`);
          for (const [name, target] of Object.entries(ctx.settings.aliases)) {
            out.write(c.dim(`  alias ${name} → ${target}\n`));
          }
          for (const [name, p0] of Object.entries(ctx.settings.providerProfiles)) {
            const p = p0 as NonNullable<typeof p0>;
            out.write(c.dim(`  profile ${name} → ${p.model} (${p.baseUrl})\n`));
          }
          out.write(c.dim('  switch: /model <alias|profile:model|model-id>\n'));
          return 'handled';
        }
        try {
          state.resolved = resolveModelRef(ctx.settings, arg);
          out.write(successLine(`model → ${state.resolved.profileName}:${state.resolved.modelId}\n`));
        } catch (e) {
          out.write(errorLine((e as Error).message) + '\n');
        }
        return 'handled';
      }
      case '/cost':
        out.write(
          c.dim(
            `session: in=${state.totalUsage.inputTokens} out=${state.totalUsage.outputTokens}` +
              ` total=${state.totalUsage.totalTokens}${state.totalUsage.estimated ? ' (estimated)' : ''}` +
              ` · turns=${state.turns}`,
          ) + '\n',
        );
        return 'handled';
      case '/status':
        out.write(
          [
            `  model     ${state.resolved.profileName}:${state.resolved.modelId}`,
            `  provider  ${state.resolved.profile.baseUrl}`,
            `  mode      ${state.mode}`,
            `  context   ${state.resolved.profile.contextWindow.toLocaleString()} tok · messages ${state.messages.length}`,
            `  session   ${state.sessionId.slice(0, 8)}…`,
            `  transcript ${transcriptPathFor(process.cwd(), state.sessionId)}`,
            `  cwd       ${process.cwd()}`,
          ]
            .map((l) => c.dim(l))
            .join('\n') + '\n',
        );
        return 'handled';
      case '/permissions':
        out.write(c.dim(`permission mode: ${state.mode} (rule editor lands in P10)`) + '\n');
        return 'handled';
      case '/compact':
        out.write(c.dim('compaction lands in P14') + '\n');
        return 'handled';
      case '/quit':
      case '/exit':
        return 'quit';
      default:
        out.write(errorLine(`unknown command ${cmd} — /help for the list`) + '\n');
        return 'handled';
    }
  };

  printPrompt();
  // Sequential input queue: piped or pasted lines must never race an in-flight
  // turn (Claude Code behaves the same — one turn at a time).
  const queue: string[] = [];
  let draining = false;
  let quitRequested = false;
  let inputClosed = false;
  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    while (queue.length > 0 && !quitRequested) {
      const line = (queue.shift() ?? '').trim();
      if (line !== '' && line.startsWith('/')) {
        const r = await handleSlash(line);
        if (r === 'quit') quitRequested = true;
        else if (queue.length === 0) printPrompt();
        continue;
      }
      if (line === '') {
        if (queue.length === 0) printPrompt();
        continue;
      }
      await runTurn(line);
      if (queue.length === 0) printPrompt();
    }
    if (quitRequested || (inputClosed && queue.length === 0)) {
      rl.close();
      out.write(c.dim('\nvexa out. ✻\n'));
      process.exit(0);
    }
    draining = false;
  };
  rl.on('line', (line: string) => {
    queue.push(line);
    void drain();
  });
  // stdin EOF (pipe end / Ctrl+D): stop reading but let an in-flight turn finish
  rl.on('close', () => {
    inputClosed = true;
    void drain();
  });
}
