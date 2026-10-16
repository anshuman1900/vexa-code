/**
 * Tool registry (SPEC §4.5 / [TP §2]): single source of truth.
 * - getAllBaseTools(): built-ins as a contiguous stable prefix (A3b ordering)
 * - toWireTools(): serialize to OpenAI `tools` format (cacheable byte-stable)
 */
import type { Tool } from './types.js';
import { toWireTool, type WireTool } from '../provider/wire.js';
import { readTool } from './filesystem/read.js';
import { writeTool } from './filesystem/write.js';
import { editTool } from './filesystem/edit.js';
import { globTool } from './filesystem/glob.js';
import { grepTool } from './filesystem/grep.js';
import { lsTool } from './filesystem/ls.js';
import { bashTool } from './bash/bash.js';
import { bashOutputTool, killShellTool } from './bash/bashOutput.js';
import { todoTool } from './todo.js';
import { exitPlanModeTool } from './plan.js';
import { webFetchTool } from './web/webFetch.js';

/** Order matters: stable prefix for provider prefix caching (SPEC A3b). */
export function getAllBaseTools(): Tool[] {
  return [
    readTool,
    globTool,
    grepTool,
    lsTool,
    editTool,
    writeTool,
    bashTool,
    todoTool,
    exitPlanModeTool,
    webFetchTool,
    bashOutputTool,
    killShellTool,
  ];
}

export function getTool(name: string): Tool | undefined {
  return getAllBaseTools().find((t) => t.name === name);
}

export function toWireTools(tools: Tool[]): WireTool[] {
  return tools.map((t) => toWireTool(t.name, t.description, t.inputSchema));
}
