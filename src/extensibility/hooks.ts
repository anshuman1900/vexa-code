/**
 * Hooks (SPEC §6 P15 / [TP §6]): config shape
 *   hooks: { <Event>: [{ matcher?, hooks: [{ type:'command', command, timeout? }] }] }
 * Events v1: PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, Stop.
 * Contract: command receives JSON on stdin (session_id, event, tool_name,
 * tool_input, cwd); exit code 2 = block; JSON output may set
 * { decision:'block'|'approve', reason, systemMessage }.
 */
import { spawn } from 'node:child_process';
import type { Settings } from '../config/settings.js';

export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'SessionStart' | 'Stop';

export interface HookOutcome {
  blocking: boolean;
  decision?: 'approve' | 'block';
  reason?: string;
  systemMessage?: string;
}

interface HookMatcher {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
}

export function hookConfigsFor(settings: Settings, event: HookEvent): HookMatcher[] {
  const hooks = (settings as unknown as { hooks?: Record<string, HookMatcher[]> }).hooks ?? {};
  return hooks[event] ?? [];
}

function matcherApplies(matcher: string | undefined, toolName: string | undefined): boolean {
  if (matcher === undefined || matcher === '') return true;
  if (toolName === undefined) return true;
  try {
    return new RegExp(matcher).test(toolName);
  } catch {
    return false;
  }
}

async function runOne(command: string, payload: unknown, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string; failed: boolean }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ code: -1, stdout, stderr: 'timeout', failed: true });
      }
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: 'spawn failed', failed: true });
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr, failed: false });
      }
    });
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}

export async function runHooks(
  settings: Settings,
  event: HookEvent,
  payload: { sessionId: string; toolName?: string; toolInput?: unknown; cwd: string },
): Promise<HookOutcome> {
  const matchers = hookConfigsFor(settings, event);
  const result: HookOutcome = { blocking: false };
  for (const m of matchers) {
    if (!matcherApplies(m.matcher, payload.toolName)) continue;
    for (const h of m.hooks) {
      if (h.type !== 'command') continue;
      const r = await runOne(
        h.command,
        { event, session_id: payload.sessionId, tool_name: payload.toolName, tool_input: payload.toolInput, cwd: payload.cwd },
        h.timeout ?? 30_000,
      );
      if (r.failed) continue;
      if (r.code === 2) {
        return { blocking: true, decision: 'block', reason: r.stderr.trim() !== '' ? r.stderr.trim() : `blocked by ${event} hook (exit 2)` };
      }
      const parsed = parseJsonSafe(r.stdout);
      if (parsed !== null && typeof parsed === 'object') {
        const o = parsed as { decision?: string; reason?: string; systemMessage?: string };
        if (o.decision === 'block') return { blocking: true, decision: 'block', reason: o.reason ?? 'blocked by hook', systemMessage: o.systemMessage };
        if (o.systemMessage !== undefined) result.systemMessage = o.systemMessage;
      }
    }
  }
  return result;
}

function parseJsonSafe(s: string): unknown {
  try {
    return JSON.parse(s.trim().split('\n')[0] ?? '');
  } catch {
    return null;
  }
}
