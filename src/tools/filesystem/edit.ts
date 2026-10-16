/**
 * Edit tool (SPEC §6 P6 / [TP §4]):
 * - exact string replace; must-Read-first; unique unless replace_all
 * - matching chain: exact → curly/straight quote normalization (same length,
 *   so index mapping preserves the original file's quote style)
 * - rejects: no-op (no change), old_string self-substring of new_string
 * - returns a structured patch (4 context lines) for diff display
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types.js';

interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

const CURLY: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D\u201F]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
];

function normalize(s: string): string {
  let out = s;
  for (const [re, rep] of CURLY) out = out.replace(re, rep);
  return out;
}

/** straight → curly, pairing " and ' as open/close runs (spec preserveQuoteStyle). */
function toCurly(s: string): string {
  let dqOpen = false;
  let sqOpen = false;
  let out = '';
  for (const ch of s) {
    if (ch === '"') {
      out += dqOpen ? '\u201D' : '\u201C';
      dqOpen = !dqOpen;
    } else if (ch === "'") {
      out += sqOpen ? '\u2019' : '\u2018';
      sqOpen = !sqOpen;
    } else out += ch;
  }
  return out;
}

function makePatch(oldContent: string, newContent: string, contextLines = 4): string {
  const a = oldContent.split('\n');
  const b = newContent.split('\n');
  // find first + last differing line
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const ctx0 = Math.max(0, start - contextLines);
  const ctx1 = Math.min(a.length, endA + 1 + contextLines);
  const lines: string[] = [];
  for (let i = ctx0; i < start; i++) lines.push(`  ${a[i] ?? ''}`);
  for (let i = start; i <= endA; i++) lines.push(`- ${a[i] ?? ''}`);
  for (let i = start; i <= endB; i++) lines.push(`+ ${b[i] ?? ''}`);
  for (let i = endA + 1; i < ctx1; i++) lines.push(`  ${a[i] ?? ''}`);
  return lines.join('\n');
}

export const editTool: Tool<EditInput> = {
  name: 'Edit',
  description: [
    'Performs exact string replacements in files.',
    '- You MUST Read the file before editing (this tool errors otherwise).',
    '- The edit FAILS if old_string is not unique in the file — either include more surrounding context to make it unique, or use replace_all.',
    '- replace_all replaces every occurrence (useful for renaming).',
    '- NEVER write new files; prefer editing existing ones.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file to modify' },
      old_string: { type: 'string', description: 'The text to replace' },
      new_string: { type: 'string', description: 'The text to replace it with (must differ)' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
    },
    required: ['file_path', 'old_string', 'new_string'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: false,
  checkPermissions: () => 'ask',
  maxResultSizeChars: 8000,

  async call(input: EditInput, ctx: ToolContext): Promise<ToolResult<string>> {
    const filePath = path.resolve(ctx.cwd, input.file_path);
    if (input.old_string === input.new_string) {
      throw new Error('No changes to make: old_string and new_string are exactly the same.');
    }
    if (!ctx.readFileState.has(filePath)) {
      throw new Error(`File has not been read yet. Read it first before editing (${filePath}).`);
    }
    const original = fs.readFileSync(filePath, 'utf8');

    if (input.old_string !== '' && input.new_string.includes(input.old_string)) {
      throw new Error('old_string is a substring of new_string — this would grow the match on every edit. Include more surrounding context instead.');
    }

    let searchContent = original;
    let oldStr = input.old_string;
    let newStr = input.new_string;
    let normalized = false;
    if (oldStr !== '' && !original.includes(oldStr)) {
      const normContent = normalize(original);
      const normOld = normalize(oldStr);
      if (normContent.includes(normOld)) {
        // same-length normalization ⇒ index mapping preserves original quotes
        searchContent = normContent;
        oldStr = normOld;
        newStr = normalize(newStr);
        normalized = true;
      }
    }

    const count = oldStr === '' ? 0 : searchContent.split(oldStr).length - 1;
    if (count === 0) {
      throw new Error(`String not found in file: ${JSON.stringify(oldStr.slice(0, 120))}${normalized ? ' (after quote normalization)' : ''}`);
    }
    if (count > 1 && input.replace_all !== true) {
      throw new Error(`Found ${count} occurrences of old_string — provide more surrounding context to make it unique, or set replace_all=true.`);
    }

    let newContent: string;
    if (normalized) {
      // preserveQuoteStyle [TP §4]: if the original file used curly quotes,
      // re-apply that style to the replacement text
      const hadCurly = /[\u2018\u2019\u201C\u201D]/.test(original);
      const applied = hadCurly ? toCurly(newStr) : newStr;
      // map occurrences back onto the original content by index
      newContent = original;
      const positions: number[] = [];
      let idx = searchContent.indexOf(oldStr);
      while (idx !== -1) {
        positions.push(idx);
        idx = searchContent.indexOf(oldStr, idx + oldStr.length);
      }
      const targets = (input.replace_all === true ? positions : positions.slice(0, 1)).filter(
        (t): t is number => t !== undefined,
      );
      targets.sort((x, y) => (y as number) - (x as number)); // replace from the end to keep indices valid
      for (const pos of targets) {
        newContent = newContent.slice(0, pos) + applied + newContent.slice(pos + oldStr.length);
      }
    } else {
      newContent =
        input.replace_all === true
          ? oldStr === ''
            ? original
            : original.split(oldStr).join(newStr)
          : original.replace(oldStr, () => newStr);
    }

    if (newContent === original) {
      throw new Error('No changes to make: replacement produced identical content.');
    }

    const patch = makePatch(original, newContent);
    ctx.checkpoint?.(filePath, original);
    fs.writeFileSync(filePath, newContent);
    ctx.readFileState.set(filePath, { mtimeMs: fs.statSync(filePath).mtimeMs });
    return { data: `${normalized ? '[quote-normalized] ' : ''}Edited ${filePath}:\n${patch}` };
  },
};
