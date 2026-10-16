/**
 * P15 acceptance tests (SPEC §6 P15): memory, skills, custom commands, hooks.
 * Run: node tests/p15.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { ensureMemoryDir, loadMemory, memoryIndexPath } from '../dist/context/memory.js';
import { discoverSkills, discoverCommands, expandCommand, loadSkillBody, skillsPromptSection } from '../dist/extensibility/skills.js';
import { runHooks } from '../dist/extensibility/hooks.js';

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

// isolated VEXA home so we don't touch the real ~/.vexa
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p15-home-'));
process.env['VEXA_CONFIG_DIR'] = tmpHome;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p15-repo-'));
try { execSync('git init', { cwd: repo, stdio: 'ignore' }); } catch { /* git optional for these tests */ }

await check('memory: dir pre-created + index write/read + warning on bloat', () => {
  const dir = ensureMemoryDir(repo);
  assert.ok(fs.existsSync(dir), 'memory dir exists');
  assert.ok(dir.includes('memory'), 'keyed under projects/<root>/memory');
  const idx = memoryIndexPath(repo);
  fs.writeFileSync(idx, '- user prefers teal\n- deploy = pnpm deploy');
  const { content } = loadMemory(repo);
  assert.match(content, /teal/);
  // bloat warning
  fs.writeFileSync(idx, 'x'.repeat(26_000));
  const r2 = loadMemory(repo);
  assert.ok(r2.warnings.some((w) => w.includes('bytes')), 'bloat warning fired');
  fs.writeFileSync(idx, '- user prefers teal');
});

await check('skills: discovery from user dir, frontmatter parse, two-level body load', () => {
  const skillDir = path.join(tmpHome, 'skills', 'deploy');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: deploy',
    'description: Deploy the app',
    'when-to-use: user asks to deploy',
    'argument-hint: [env]',
    '---',
    '',
    'Run `pnpm deploy $ARGUMENTS` and watch the logs.',
  ].join('\n'));
  const skills = discoverSkills(repo);
  const s = skills.find((x) => x.name === 'deploy');
  assert.ok(s !== undefined, 'skill discovered');
  assert.equal(s?.description, 'Deploy the app');
  assert.equal(s?.disableModelInvocation, false);
  const body = loadSkillBody(s);
  assert.match(body, /pnpm deploy/);
  const section = skillsPromptSection(skills);
  assert.match(section ?? '', /deploy/);
  assert.match(section ?? '', /SKILL\.md/, 'body path included for two-level loading');
});

await check('custom commands: .vexa/commands/*.md + $ARGUMENTS expansion', () => {
  fs.mkdirSync(path.join(repo, '.vexa', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.vexa', 'commands', 'greet.md'), 'Say hello to $ARGUMENTS warmly.');
  const cmds = discoverCommands(repo);
  const g = cmds.find((c) => c.name === 'greet');
  assert.ok(g !== undefined);
  assert.equal(expandCommand(g, 'Anshu'), 'Say hello to Anshu warmly.');
});

// hooks against real shell commands
const settings = () => ({
  model: 'default', providerProfiles: {}, aliases: {},
  permissions: { allow: [], ask: [], deny: [], defaultMode: 'default', additionalDirectories: [] },
  env: {}, autoCompactEnabled: true,
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node -e "const d=JSON.parse(require(\'fs\').readFileSync(0,\'utf8\')); if(d.tool_input && d.tool_input.command && d.tool_input.command.includes(\'rm\')){ console.error(\'no rm allowed\'); process.exit(2);} process.exit(0);"', timeout: 5000 }] }],
  },
});

await check('hooks: PreToolUse exit-2 blocks the tool with reason', async () => {
  const s = settings();
  const blocked = await runHooks(s, 'PreToolUse', { sessionId: 's', toolName: 'Bash', toolInput: { command: 'rm -rf /' }, cwd: repo });
  assert.equal(blocked.blocking, true);
  assert.equal(blocked.decision, 'block');
  assert.match(blocked.reason ?? '', /no rm allowed/);
  const allowed = await runHooks(s, 'PreToolUse', { sessionId: 's', toolName: 'Bash', toolInput: { command: 'echo hi' }, cwd: repo });
  assert.equal(allowed.blocking, false);
});

await check('hooks: matcher scopes events to tool names', async () => {
  const s = settings();
  const r = await runHooks(s, 'PreToolUse', { sessionId: 's', toolName: 'Read', toolInput: { file_path: 'x' }, cwd: repo });
  assert.equal(r.blocking, false, 'matcher Bash did not apply to Read');
});

await check('hooks: JSON decision block', async () => {
  const s = baseSettingsWithHook('node -e "console.log(JSON.stringify({decision:\'block\',reason:\'nope\'}))"');
  const r = await runHooks(s, 'PreToolUse', { sessionId: 's', toolName: 'Bash', toolInput: { command: 'x' }, cwd: repo });
  assert.equal(r.blocking, true);
  assert.equal(r.reason, 'nope');
});
function baseSettingsWithHook(cmd) {
  const s = settings();
  delete s.hooks;
  s.hooks = { PreToolUse: [{ hooks: [{ type: 'command', command: cmd, timeout: 5000 }] }] };
  return s;
}

fs.rmSync(tmpHome, { recursive: true, force: true });
fs.rmSync(repo, { recursive: true, force: true });
console.log(failed === 0 ? '\nALL P15 TESTS PASSED' : `\n${failed} P15 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
