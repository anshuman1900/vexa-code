/**
 * Skills + custom slash commands (SPEC §6 P15 / [CX §5]):
 * - skills: <dir>/<name>/SKILL.md with frontmatter (name, description,
 *   when-to-use, allowed-tools, disable-model-invocation, argument-hint)
 *   — frontmatter loaded at startup (two-level), body on invoke
 * - custom commands: <dir>/commands/*.md — markdown with $ARGUMENTS
 * - dirs: ~/.vexa/skills + .vexa/skills (+ legacy .vexa/commands)
 */
import fs from 'node:fs';
import path from 'node:path';
import { userConfigDir } from '../config/paths.js';

export interface Skill {
  name: string;
  description: string;
  whenToUse?: string;
  allowedTools?: string[];
  disableModelInvocation: boolean;
  argumentHint?: string;
  bodyPath: string;
  source: 'user' | 'project';
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (m === null) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  const fm = m[1] ?? '';
  for (const line of fm.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key !== '') meta[key] = val;
  }
  return { meta, body: raw.slice(m[0].length) };
}

function scanSkillDirs(dirs: Array<{ dir: string; source: 'user' | 'project' }>): Skill[] {
  const skills = new Map<string, Skill>();
  for (const { dir, source } of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMd)) continue;
      try {
        const { meta, body } = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'));
        const name = meta['name'] ?? entry.name;
        if (skills.has(name)) continue; // first wins: user > project
        skills.set(name, {
          name,
          description: meta['description'] ?? '',
          whenToUse: meta['when-to-use'],
          allowedTools: meta['allowed-tools'] !== undefined ? meta['allowed-tools'].split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          disableModelInvocation: meta['disable-model-invocation'] === 'true',
          argumentHint: meta['argument-hint'],
          bodyPath: skillMd,
          source,
        });
      } catch {
        // unreadable skill — skip
      }
    }
  }
  return [...skills.values()];
}

export function discoverSkills(cwd: string): Skill[] {
  const userSkills = path.join(userConfigDir(), 'skills');
  const projectSkills = path.join(cwd, '.vexa', 'skills');
  return scanSkillDirs([
    { dir: userSkills, source: 'user' },
    { dir: projectSkills, source: 'project' },
  ]);
}

export function loadSkillBody(skill: Skill): string {
  return fs.readFileSync(skill.bodyPath, 'utf8');
}

// ---- custom slash commands (.vexa/commands/*.md, legacy location) ----

export interface CustomCommand {
  name: string;
  body: string; // raw markdown with $ARGUMENTS placeholder
  sourceFile: string;
}

export function discoverCommands(cwd: string): CustomCommand[] {
  const dirs = [path.join(userConfigDir(), 'commands'), path.join(cwd, '.vexa', 'commands')];
  const cmds = new Map<string, CustomCommand>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const name = f.replace(/\.md$/, '');
      if (cmds.has(name)) continue;
      try {
        cmds.set(name, { name, body: fs.readFileSync(path.join(dir, f), 'utf8'), sourceFile: path.join(dir, f) });
      } catch {
        // skip unreadable
      }
    }
  }
  return [...cmds.values()];
}

export function expandCommand(cmd: CustomCommand, args: string): string {
  return cmd.body.replace(/\$ARGUMENTS/g, args);
}

/** model-facing listing (SPEC §5.1 #13) — frontmatter only, two-level loading */
export function skillsPromptSection(skills: Skill[]): string | null {
  const invocable = skills.filter((s) => !s.disableModelInvocation);
  if (invocable.length === 0) return null;
  const lines = invocable.map((s) => `- ${s.name}: ${s.description}${s.whenToUse !== undefined ? ` (use when: ${s.whenToUse})` : ''}`);
  return [
    '# Skills',
    'The following skills are available. When a task matches one, read its body with Read (path given) and follow it:',
    ...lines.map((l, i) => `${l} [body: ${invocable[i]?.bodyPath}]`),
  ].join('\n');
}
