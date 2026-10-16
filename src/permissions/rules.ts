/**
 * Permission rule strings (SPEC §4.4 / [TP §5.2]):
 *   ToolName                whole tool
 *   ToolName(content)       content-specific: exact match or prefix glob
 *   Bash(npm:*)             command starts with "npm"
 *   Edit(src/**)            path glob (simplified: prefix or globstar)
 *   mcp__server__*          whole server (P11)
 */
export interface ParsedRule {
  tool: string;
  content: string | null; // null = whole tool
  prefix: string | null; // for Bash(cmd:*) — prefix before ':*'
  glob: string | null; // for Tool(pattern) — globstar/prefix pattern
}

export function parseRule(rule: string): ParsedRule {
  const open = rule.indexOf('(');
  if (open === -1) return { tool: rule, content: null, prefix: null, glob: null };
  const tool = rule.slice(0, open);
  const end = rule.endsWith(')') ? rule.length - 1 : rule.length;
  const inner: string = rule.slice(open + 1, end) ?? '';
  if (inner.endsWith(':*')) {
    return { tool, content: inner, prefix: inner.slice(0, -2), glob: null };
  }
  return { tool, content: inner, prefix: null, glob: inner };
}

function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === undefined) break;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 1;
      } else re += '[^/\\\\]*';
    } else if (ch === '?') re += '[^/\\\\]';
    else re += ch.replace(/[.+^$()|[\]{}]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

/** does a rule's content matcher accept this input? */
export function ruleMatchesContent(rule: ParsedRule, input: unknown): boolean {
  if (rule.content === null) return true; // whole-tool rule
  // extract the relevant string from input
  let subject = '';
  if (rule.prefix !== null) {
    // Bash(npm:*) → command prefix with word boundary (npmx ≠ npm)
    const cmd = (input as Record<string, unknown>)?.['command'];
    subject = typeof cmd === 'string' ? cmd : '';
    const trimmed = subject.trimStart();
    return trimmed === rule.prefix || trimmed.startsWith(rule.prefix + ' ');
  }
  if (rule.glob !== null) {
    const o = (input ?? {}) as Record<string, unknown>;
    const paths = [o['file_path'], o['path'], o['notebook_path']].filter((v): v is string => typeof v === 'string');
    subject = paths[0] ?? '';
    if (subject === '') return false;
    const re = globToRegExp(rule.glob);
    const norm = subject.replace(/\\/g, '/');
    if (re.test(norm)) return true;
    // relative globs like src/** anchor at any path-segment boundary
    const absLike = /^[~/]|[A-Za-z]:/.test(rule.glob);
    if (!absLike) {
      const body = re.source.replace(/^\^/, '').replace(/\$$/, '');
      return new RegExp(`(?:^|/)${body}$`, 'i').test(norm);
    }
    return false;
  }
  return false;
}
