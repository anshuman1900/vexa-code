/**
 * Write tool (SPEC §6 P6): create/overwrite whole file.
 * - must-Read-first when the file exists (error otherwise) [TP §2]
 * - atomic: write tmp + rename
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Tool, ToolContext, ToolResult } from '../types.js';

interface WriteInput {
  file_path: string;
  content: string;
}

export const writeTool: Tool<WriteInput> = {
  name: 'Write',
  description: [
    'Writes a file to the local filesystem, overwriting if it exists.',
    '- If the file exists, you MUST Read it first (this tool errors otherwise).',
    '- Prefer Edit over Write for existing files; NEVER write new files unless required.',
    '- Do not create documentation files unless explicitly asked.',
  ].join('\n'),
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file to write' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['file_path', 'content'],
    additionalProperties: false,
  },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: false,
  checkPermissions: () => 'ask',
  maxResultSizeChars: 2000,

  async call(input: WriteInput, ctx: ToolContext): Promise<ToolResult<string>> {
    const filePath = path.resolve(ctx.cwd, input.file_path);
    const exists = fs.existsSync(filePath);
    if (exists && !ctx.readFileState.has(filePath)) {
      throw new Error(`File has not been read yet. Read it first before writing to it (${filePath}).`);
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.vexa-tmp-' + Date.now();
    fs.writeFileSync(tmp, input.content);
    fs.renameSync(tmp, filePath);
    ctx.readFileState.set(filePath, { mtimeMs: fs.statSync(filePath).mtimeMs });
    return { data: exists ? `Updated ${filePath} (${input.content.length} bytes)` : `Created ${filePath} (${input.content.length} bytes)` };
  },
};
