/**
 * Task tool factory (SPEC §6 P13 / [CX §6]): spawns an in-process subagent —
 * own message list, own readFileState, scoped toolset, distinct prompt.
 * Results return as the tool result text. Sub-agent transcripts: P18.
 */
import { runAgentTurn } from '../engine/queryLoop.js';
import { getAgentType } from '../agents/registry.js';
import type { Tool, ToolContext, ToolResult } from './types.js';
import type { AgentType } from '../agents/registry.js';
type AgentType2 = AgentType;

export interface TaskDeps {
  baseUrl: string;
  apiKey: string;
  model: string;
  label?: string;
  headers?: Record<string, string>;
  maxTokens: number;
  maxTokensParam?: string;
  temperature?: number;
  supports?: { tools?: boolean; streamOptions?: boolean; vision?: boolean };
  dropFields?: string[];
  /** parent tool pool (subagent gets the intersection with its type's allowlist) */
  parentTools: Tool[];
  parentPermissionAsk: (tool: Tool, input: unknown) => Promise<boolean>;
  cwd: string;
  maxTurns?: number;
  signal?: AbortSignal;
}

const SUB_MAX_TURNS = 30;

export function createTaskTool(deps: TaskDeps): Tool {
  interface TaskInput {
    description: string;
    prompt: string;
    subagent_type?: string;
  }
  return {
    name: 'Task',
    description: [
      'Launch a new agent to handle complex, multi-step tasks autonomously.',
      'Available agent types: general-purpose (research + multi-step, all tools), Explore (read-only search specialist).',
      'When NOT to use: reading a specific file (use Read), searching a known class (use Glob), 2-3 file tasks.',
      'Usage notes:',
      '1. Launch multiple agents concurrently when independent (single message, multiple Task calls).',
      '2. Each invocation is stateless — put ALL needed context in prompt.',
      '3. The result is not visible to the user — summarize it afterwards.',
      '4. Use proactively when the task matches an agent description.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'A short (3-5 word) description of the task' },
        prompt: { type: 'string', description: 'The detailed task for the agent to perform' },
        subagent_type: { type: 'string', description: 'The type of agent to use (general-purpose | Explore)' },
      },
      required: ['description', 'prompt', 'subagent_type'],
      additionalProperties: false,
    },
    isEnabled: () => true,
    isReadOnly: false,
    isConcurrencySafe: true, // subagents run in parallel (isolated state)
    checkPermissions: () => 'allow',
    maxResultSizeChars: 50_000,

    async call(input: TaskInput, ctx: ToolContext): Promise<ToolResult<string>> {
      const type: AgentType2 = getAgentType(input.subagent_type ?? 'general-purpose');
      const subTools = deps.parentTools.filter(type.allow);
      if (subTools.length === 0) throw new Error(`Agent type "${type.name}" has no tools available`);

      const subMessages = [
        {
          uuid: globalThis.crypto.randomUUID(),
          parentUuid: null,
          timestamp: new Date().toISOString(),
          type: 'user' as const,
          content: [{ type: 'text' as const, text: input.prompt }],
        },
      ];
      const subCtx: ToolContext = {
        abortController: deps.signal !== undefined ? new AbortController() : ctx.abortController,
        readFileState: new Map(), // isolated ledger [CX §6]
        cwd: ctx.cwd,
        agentId: `${ctx.agentId ?? 'main'}-sub-${input.description.replace(/\s+/g, '-').toLowerCase().slice(0, 20)}`,
      };

      const result = await runAgentTurn({
        baseUrl: deps.baseUrl,
        apiKey: deps.apiKey,
        model: deps.model,
        label: `${deps.label ?? 'vexa'}:sub:${type.name}`,
        headers: deps.headers,
        system: type.systemPrompt,
        messages: subMessages,
        tools: subTools,
        maxTokens: deps.maxTokens,
        maxTokensParam: deps.maxTokensParam,
        temperature: deps.temperature,
        supports: deps.supports,
        dropFields: deps.dropFields,
        maxTurns: deps.maxTurns ?? SUB_MAX_TURNS,
        toolContext: subCtx,
        permissionAsk: deps.parentPermissionAsk,
        signal: deps.signal,
      });

      const report =
        result.finalText !== ''
          ? result.finalText
          : `[${type.name} agent finished with ${result.toolCallCount} tool calls, no final text]`;
      return { data: report };
    },
  };
}
