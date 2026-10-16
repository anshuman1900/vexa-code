/**
 * VEXA.md hierarchical loader (SPEC §5.2 / [CX §2]):
 * order (later = higher priority): user ~/.vexa/VEXA.md + ~/.vexa/rules/*.md →
 * project walk root→cwd (VEXA.md, .vexa/VEXA.md, .vexa/rules globstar md) →
 * VEXA.local.md per dir. @include depth ≤5, text-extension allowlist,
 * missing includes silently skipped, block HTML comments stripped,
 * per-file >40k chars → warning, provenance labels per file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { userConfigDir } from '../config/paths.js';

const MAX_FILE_CHARS = 40_000;
const MAX_INCLUDE_DEPTH = 5;
const TEXT_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.ts', '.tsx', '.js', '.mjs', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.sh', '.css', '.html']);

export interface VexamdFile {
  filePath: string;
  label: string;
  content: string;
}

export interface VexamdResult {
  files: VexamdFile[];
  warnings: string[];
}

function stripHtmlComments(md: string): string {
  // remove block comments only when NOT inside code fences
  const lines = md.split('\n');
  let inFence = false;
  const out: string[] = [];
  let inComment = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      let l = line;
      if (!inComment && l.includes('<!--')) {
        if (!l.includes('-->')) {
          inComment = true;
          l = l.slice(0, l.indexOf('<!--'));
        } else {
          l = l.replace(/<!--[\s\S]*?-->/g, '');
        }
      } else if (inComment) {
        if (l.includes('-->')) {
          inComment = false;
          l = l.slice(l.indexOf('-->') + 3);
        } else {
          continue;
        }
      }
      out.push(l);
    } else out.push(line);
  }
  return out.join('\n');
}

function resolveIncludes(content: string, baseDir: string, depth: number, warnings: string[], label: string): string {
  return content.replace(/^@(\S+)\s*$/gm, (_m, target: string) => {
    if (depth >= MAX_INCLUDE_DEPTH) {
      warnings.push(`${label}: @include depth limit (${MAX_INCLUDE_DEPTH}) reached, skipped: ${target}`);
      return '';
    }
    let incPath: string;
    if (target.startsWith('~/')) incPath = path.join(userConfigDir(), target.slice(2));
    else if (target.startsWith('@')) incPath = target.slice(1);
    else incPath = path.resolve(baseDir, target);
    try {
      if (!TEXT_EXTS.has(path.extname(incPath))) return '';
      const inc = fs.readFileSync(incPath, 'utf8');
      const resolved = resolveIncludes(inc, path.dirname(incPath), depth + 1, warnings, `${label}→${path.basename(incPath)}`);
      return `\n${resolved}\n`;
    } catch {
      return ''; // missing includes silently ignored [CX §2]
    }
  });
}

function loadFile(filePath: string, provenance: string, warnings: string[]): VexamdFile | null {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.length > MAX_FILE_CHARS) {
      warnings.push(`${filePath}: ${content.length.toLocaleString()} chars exceeds ${MAX_FILE_CHARS.toLocaleString()} — consider trimming (loaded anyway)`);
    }
    content = resolveIncludes(content, path.dirname(filePath), 0, warnings, path.basename(filePath));
    content = stripHtmlComments(content);
    return { filePath, label: provenance, content };
  } catch {
    return null;
  }
}

function listRules(dir: string): string[] {
  const rulesDir = path.join(dir, 'rules');
  if (!fs.existsSync(rulesDir)) return [];
  return fs
    .readdirSync(rulesDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(rulesDir, f))
    .sort();
}

export function loadVexamd(cwd: string): VexamdResult {
  const warnings: string[] = [];
  const files: VexamdFile[] = [];
  const seen = new Set<string>();
  const push = (f: VexamdFile | null): void => {
    if (f === null) return;
    const key = `${f.filePath}:${f.content.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(f);
  };

  // 1. user-global
  push(loadFile(path.join(userConfigDir(), 'VEXA.md'), "user's private global instructions", warnings));
  for (const r of listRules(userConfigDir())) {
    push(loadFile(r, "user's private global instructions (rules)", warnings));
  }

  // 2. project walk: root → cwd
  const abs = path.resolve(cwd);
  const dirs: string[] = [];
  let d = abs;
  for (;;) {
    dirs.unshift(d);
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  const userDir = path.resolve(userConfigDir());
  for (const dir of dirs) {
    if (path.resolve(dir) === userDir) continue;
    const vexaDir = path.join(dir, '.vexa');
    const isProjectRoot = fs.existsSync(vexaDir);
    for (const cand of [path.join(dir, 'VEXA.md'), path.join(vexaDir, 'VEXA.md')]) {
      if (fs.existsSync(cand)) {
        push(loadFile(cand, 'project instructions, checked into the codebase', warnings));
      }
    }
    for (const r of listRules(vexaDir)) {
      push(loadFile(r, 'project rules (checked into the codebase)', warnings));
    }
    if (isProjectRoot) {
      const local = path.join(vexaDir, 'VEXA.local.md');
      if (fs.existsSync(local)) push(loadFile(local, "user's private project instructions", warnings));
    }
  }

  return { files, warnings };
}

export function formatVexamd(files: VexamdFile[]): string {
  if (files.length === 0) return '';
  const parts = files.map(
    (f) => `Contents of ${f.filePath} (${f.label}):\n\n${f.content.trim()}`,
  );
  return [
    'The following files provide project instructions. They OVERRIDE any default behavior when they conflict with it:',
    '',
    ...parts,
  ].join('\n\n');
}
