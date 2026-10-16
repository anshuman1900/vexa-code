/**
 * TodoWrite (SPEC §4.6 / [P0.1 §B]): structured task list with exactly one
 * in_progress at a time; state injected to the model as a system-reminder
 * each turn and rendered in the REPL on every update.
 */
import type { Tool, ToolContext, ToolResult } from './types.js';
import { appState, renderTodos, type Todo, type TodoStatus } from '../state.js';

interface TodoWriteInput {
  todos: Array<{ content: string; status: TodoStatus; activeForm?: string }>;
}

export const todoTool: Tool<TodoWriteInput> = {
  name: 'TodoWrite',
  description: [
    'Use this tool to create and manage a structured task list for the current session.',
    'Use proactively for complex multi-step tasks (3+ steps); mark tasks completed IMMEDIATELY after finishing them; keep exactly one task in_progress.',
    'Skip it for single trivial tasks.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', minLength: 1, description: 'The task (imperative form)' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            activeForm: { type: 'string', description: 'Present-continuous label shown while working (e.g. "Running tests")' },
          },
          required: ['content', 'status'],
          additionalProperties: false,
        },
        description: 'The updated todo list',
      },
    },
    required: ['todos'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: false,
  checkPermissions: () => 'allow',
  maxResultSizeChars: 2000,

  async call(input: TodoWriteInput): Promise<ToolResult<string>> {
    const todos: Todo[] = (input.todos ?? []).map((t) => ({
      content: String(t.content),
      status: t.status,
      ...(t.activeForm !== undefined ? { activeForm: t.activeForm } : {}),
    }));
    const inProgress = todos.filter((t) => t.status === 'in_progress').length;
    if (inProgress > 1) {
      throw new Error(`Only one task may be in_progress at a time (found ${inProgress}).`);
    }
    appState.todos = todos;
    appState.onTodosChanged?.(todos);
    return { data: `Todos updated:\n${renderTodos(todos)}` };
  },
};
