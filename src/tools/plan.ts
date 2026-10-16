/**
 * ExitPlanMode (SPEC §6 P12 / [P0.1 §B]): in plan mode, presents the plan for
 * approval; on approval the session exits plan mode. Only enabled in plan
 * mode; approval runs through the REPL-provided hook.
 */
import type { Tool, ToolContext, ToolResult } from './types.js';
import { appState } from '../state.js';

interface ExitPlanModeInput {
  plan: string;
}

export const exitPlanModeTool: Tool<ExitPlanModeInput> = {
  name: 'ExitPlanMode',
  description: [
    'Use this tool when you are in plan mode and have finished presenting your plan and are ready to code.',
    'It prompts the user to approve the plan and exits plan mode on approval.',
    'IMPORTANT: Only use this for tasks that require writing code. For pure research/information tasks, do NOT use this tool.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'The plan you came up with, to run by the user. Markdown. Pretty concise.' },
    },
    required: ['plan'],
    additionalProperties: false,
  },
  isEnabled: () => appState.mode === 'plan',
  isReadOnly: true,
  isConcurrencySafe: false,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 1000,

  async call(input: ExitPlanModeInput): Promise<ToolResult<string>> {
    if (appState.mode !== 'plan') {
      throw new Error('Not in plan mode.');
    }
    const approve = appState.planApproval;
    if (approve === undefined) {
      throw new Error('No approval handler available in this context.');
    }
    const ok = await approve(input.plan);
    if (!ok) {
      return { data: 'Plan rejected — stay in plan mode. Refine the plan or gather more information.' };
    }
    appState.mode = 'default';
    return { data: 'Plan approved — exited plan mode. You may now implement.' };
  },
};
