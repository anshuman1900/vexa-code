/**
 * Read tool (SPEC §6 P5 / [P0.1 §B], [TP §2]):
 * - default 2000 lines, offset/limit; cat -n numbering
 * - file > 256 KB → THROW (not truncate); output > 25 000 tokens → throw
 * - maxResultSizeChars = Infinity (never disk-persisted)
 * - registers into readFileState (mtime ledger, must-Read-first for Edit)
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types.js';
import { estimateTokens } from '../../types.js';

const MAX_FILE_BYTES = 256 * 1024;
const MAX_OUTPUT_TOKENS = 25_000;
const DEFAULT_LIMIT = 2000;

interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export const readTool: Tool<ReadInput> = {
  name: 'Read',
  description: [
    'Reads a file from the local filesystem.',
    '- file_path must be an absolute path',
    '- reads up to 2000 lines by default; use offset/limit for long files',
    '- lines longer than 2000 chars are truncated',
    '- results use cat -n format (line numbers)',
    '- You can call multiple Reads in one message; batch independent reads.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file to read' },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed)' },
      limit: { type: 'number', description: 'Number of lines to read' },
    },
    required: ['file_path'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  maxResultSizeChars: Number.POSITIVE_INFINITY,

  async call(input: ReadInput, ctx: ToolContext): Promise<ToolResult<string>> {
    const filePath = path.resolve(ctx.cwd, input.file_path);
    let st: fs.Stats;
    try {
      st = fs.statSync(filePath);
    } catch {
      throw new Error(`File does not exist: ${filePath}`);
    }
    if (st.isDirectory()) throw new Error(`EISDIR: illegal operation on a directory, read: ${filePath}`);
    if (st.size > MAX_FILE_BYTES) {
      throw new Error(`File content (${(st.size / 1024).toFixed(0)}KB) exceeds maximum allowed size (256KB). Read a specific range with offset/limit on a smaller file, or use Grep to find the relevant section.`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const allLines = raw.split('\n');
    const total = allLines.length;
    const offset = Math.max(1, Math.floor(input.offset ?? 1));
    const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
    const slice = allLines.slice(offset - 1, offset - 1 + limit);

    const outLines: string[] = [];
    for (let i = 0; i < slice.length; i++) {
      const lineNo = offset + i;
      let line = slice[i] ?? '';
      if (line.length > 2000) line = line.slice(0, 2000) + '… [line truncated]';
      outLines.push(`${String(lineNo).padStart(6)}\t${line}`);
    }
    let content = outLines.join('\n');
    if (offset - 1 + limit < total) {
      content += `\n\n[Showing ${slice.length} of ${total} lines. Use offset=${offset + limit} to continue.]`;
    }

    if (estimateTokens(content) > MAX_OUTPUT_TOKENS) {
      throw new Error(`Read output exceeds ${MAX_OUTPUT_TOKENS} tokens — use offset/limit to read less.`);
    }

    // must-Read-first ledger (P6 Edit/Write consult this)
    ctx.readFileState.set(filePath, { mtimeMs: st.mtimeMs });

    return { data: content };
  },
};
