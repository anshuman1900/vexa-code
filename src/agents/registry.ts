/**
 * Built-in subagent types (SPEC §6 P13 / [CX §6]): general-purpose + Explore.
 * Each type: distinct system prompt (NOT the main prompt [P0.1 §C6]) + a
 * scoped tool allowlist.
 */
import type { Tool } from '../tools/types.js';

export interface AgentType {
  name: string;
  description: string;
  systemPrompt: string;
  /** predicate selecting the tools this agent may use from the parent set */
  allow: (t: Tool) => boolean;
}

const mainLoopNames = new Set(['Task', 'ExitPlanMode', 'BashOutput', 'KillShell', 'TodoWrite']);

export const AGENT_TYPES: AgentType[] = [
  {
    name: 'general-purpose',
    description: 'General-purpose agent for researching complex questions, searching code, and executing multi-step tasks. Use when searching a keyword may take multiple tries. (Tools: *)',
    systemPrompt: [
      'You are a general-purpose research and coding agent working inside Vexa Code.',
      'You are given a task by the coordinating agent. Investigate thoroughly using your tools, then report back.',
      'Your final message is the ONLY thing returned to the coordinator — make it a complete, self-contained report with file_path:line_number references.',
      'Be concise but complete. If you cannot finish, report exactly what you found and what remains.',
    ].join('\n'),
    allow: (t) => !mainLoopNames.has(t.name),
  },
  {
    name: 'Explore',
    description: 'Read-only file-search specialist. Fast multi-round search across the codebase; reports findings with file:line references. Cannot modify anything.',
    systemPrompt: [
      'You are a fast file-search specialist inside Vexa Code.',
      'Search the codebase (Glob, Grep, Read, LS) and report findings.',
      'You have NO write tools — read-only research only.',
      'Final message: a concise findings report with file_path:line_number references. No preamble.',
    ].join('\n'),
    allow: (t) => ['Read', 'Glob', 'Grep', 'LS'].includes(t.name),
  },
];

export function getAgentType(name: string): AgentType {
  const found = AGENT_TYPES.find((a) => a.name === name);
  return found !== undefined ? found : (AGENT_TYPES[0] as AgentType); // default general-purpose
}
