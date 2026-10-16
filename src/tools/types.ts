/**
 * Tool contract (SPEC §4.5, mirrored 1:1 from [TP §1]).
 * Zod arrives with P5's schemas? No — zero-dep mandate: inputSchema is a plain
 * JSON-Schema object; validation is hand-rolled per tool (P25 hardens).
 */
export interface ToolContext {
  abortController: AbortController;
  readFileState: Map<string, { mtimeMs: number }>; // must-Read-first ledger (LRU 100, P6)
  cwd: string;
  appId?: string;
  agentId?: string;
  /** shadow-copy prior content before a destructive write (P16 checkpoints) */
  checkpoint?: (filePath: string, priorContent: string) => void;
}

export interface ToolResult<T = unknown> {
  data: T;
  newMessages?: VexaMessage[];
}

export interface Tool<I = unknown> {
  name: string;
  description: string; // model-facing prompt text
  inputSchema: Record<string, unknown>; // JSON Schema for `tools` array
  isEnabled(): boolean;
  isReadOnly: boolean; // default FALSE (fail-closed) [TP §1]
  isConcurrencySafe: boolean; // default FALSE (fail-closed)
  checkPermissions(input: I, ctx: ToolContext): 'allow' | 'ask';
  call(input: I, ctx: ToolContext, onProgress?: (p: string) => void): Promise<ToolResult>;
  maxResultSizeChars?: number; // default 50_000; Infinity for Read [TP §1]
}

import type { VexaMessage } from '../types.js';
