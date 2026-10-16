/**
 * Permission engine (SPEC §6 P10, simplified v1 of [TP §5.3]):
 * evaluation order: deny > ask > allow > mode. Read-only tools pass in every
 * mode; bypassPermissions allows everything; acceptEdits auto-allows
 * Edit/Write; plan mode denies all non-read-only (read-only enforcement).
 */
import type { Tool, ToolContext } from '../tools/types.js';
import type { PermissionMode, Settings } from '../config/settings.js';
import { parseRule, ruleMatchesContent, type ParsedRule } from './rules.js';

export type Decision = 'allow' | 'ask' | 'deny';

export interface PermissionContext {
  settings: Settings;
  mode: PermissionMode;
  additionalDirs?: string[];
}

function matchList(rules: ParsedRule[], tool: Tool, input: unknown): boolean {
  return rules.some((r) => r.tool === tool.name && ruleMatchesContent(r, input));
}

export function evaluatePermission(
  tool: Tool,
  input: unknown,
  pctx: PermissionContext,
  toolCtx: ToolContext,
): Decision {
  // hard gates first (read-only always safe; plan mode locks writes)
  if (tool.isReadOnly && tool.checkPermissions(input, toolCtx) !== 'ask') return 'allow';
  if (pctx.mode === 'bypassPermissions') return 'allow';
  if (pctx.mode === 'plan' && !tool.isReadOnly) return 'deny';

  const perms = pctx.settings.permissions;
  const denyRules = perms.deny.map(parseRule);
  const askRules = perms.ask.map(parseRule);
  const allowRules = perms.allow.map(parseRule);

  // 1. deny (whole-tool then content) — deny wins over everything
  if (denyRules.some((r) => r.content === null && r.tool === tool.name)) return 'deny';
  if (matchList(denyRules, tool, input)) return 'deny';

  // 2. explicit ask rules (bypass-immune in real Claude; v1: honored in all modes)
  if (askRules.some((r) => r.content === null && r.tool === tool.name)) return 'ask';
  if (matchList(askRules, tool, input)) return 'ask';

  // 3. tool's own contract (Bash/Edit/Write declare 'ask' by default)
  const self = tool.checkPermissions(input, toolCtx);

  // 4. explicit allow rules
  if (allowRules.some((r) => r.content === null && r.tool === tool.name)) return 'allow';
  if (matchList(allowRules, tool, input)) return 'allow';

  // 5. mode-based defaults
  if (pctx.mode === 'acceptEdits' && (tool.name === 'Edit' || tool.name === 'Write')) return 'allow';
  if (self === 'allow') return 'allow';
  return 'ask';
}
