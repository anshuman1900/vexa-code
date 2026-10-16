/**
 * Shared app state (P12): todos + permission mode live here so tools and the
 * REPL share one source of truth (Claude's AppState analog [TP §1]).
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface Todo {
  content: string;
  status: TodoStatus;
  activeForm?: string;
}

export interface AppState {
  todos: Todo[];
  mode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  /** set by the REPL — ExitPlanMode uses it to run the approval dialog */
  planApproval?: (plan: string) => Promise<boolean>;
  /** called by the REPL whenever todos change (to re-render) */
  onTodosChanged?: (todos: Todo[]) => void;
}

export const appState: AppState = { todos: [], mode: 'default' };

export function renderTodos(todos: Todo[]): string {
  if (todos.length === 0) return '(no todos)';
  return todos
    .map((t) => {
      const mark = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '▸' : '☐';
      const label = t.status === 'in_progress' ? (t.activeForm ?? t.content) : t.content;
      return `${mark} ${label}`;
    })
    .join('\n');
}

/** <system-reminder> attachment text injected before each model call [P0.1 §C2] */
export function todoReminder(todos: Todo[]): string | null {
  if (todos.length === 0) return null;
  const lines = todos.map((t) => `- [${t.status}] ${t.content}`);
  return `<system-reminder>\nYour current todo list (keep exactly one in_progress; mark completed immediately when done):\n${lines.join('\n')}\n</system-reminder>`;
}
