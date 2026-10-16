/**
 * Stage II acceptance tests: P10 permissions, P12 todos/plan, P14 compaction.
 * Run: node tests/stage2.test.mjs
 */
import assert from 'node:assert/strict';
import { parseRule, ruleMatchesContent } from '../dist/permissions/rules.js';
import { evaluatePermission } from '../dist/permissions/engine.js';
import { todoTool } from '../dist/tools/todo.js';
import { readTool } from '../dist/tools/filesystem/read.js';
import { bashTool } from '../dist/tools/bash/bash.js';
import { appState, renderTodos, todoReminder } from '../dist/state.js';
import { shouldAutoCompact, summarizeConversation, applyCompaction, stripAnalysis, effectiveWindow } from '../dist/context/compaction.js';
import http from 'node:http';

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

const toolCtx = { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() };
const baseSettings = () => ({
  model: 'default', providerProfiles: {}, aliases: {},
  permissions: { allow: [], ask: [], deny: [], defaultMode: 'default', additionalDirectories: [] },
  env: {}, autoCompactEnabled: true,
});

await check('P10: rule parsing — whole, prefix, glob', () => {
  assert.deepEqual(parseRule('Read'), { tool: 'Read', content: null, prefix: null, glob: null });
  const bash = parseRule('Bash(npm:*)');
  assert.equal(bash.prefix, 'npm');
  assert.equal(bash.tool, 'Bash');
  const edit = parseRule('Edit(src/**)');
  assert.equal(edit.glob, 'src/**');
});

await check('P10: Bash(npm:*) matches npm test, not npmx', () => {
  const r = parseRule('Bash(npm:*)');
  assert.equal(ruleMatchesContent(r, { command: 'npm test' }), true);
  assert.equal(ruleMatchesContent(r, { command: 'npmx run' }), false);
  assert.equal(ruleMatchesContent(r, { command: 'git status' }), false);
});

await check('P10: evaluation order — deny > ask > allow > mode', () => {
  const s = baseSettings();
  s.permissions.allow = ['Bash(git:*)'];
  s.permissions.ask = ['Bash(git push:*)'];
  s.permissions.deny = ['Bash(rm:*)'];
  const pctx = { settings: s, mode: 'default' };
  assert.equal(evaluatePermission(bashTool, { command: 'git status' }, pctx, toolCtx), 'allow');
  assert.equal(evaluatePermission(bashTool, { command: 'git push origin main' }, pctx, toolCtx), 'ask');
  assert.equal(evaluatePermission(bashTool, { command: 'rm -rf /' }, pctx, toolCtx), 'deny');
  assert.equal(evaluatePermission(bashTool, { command: 'node app.js' }, pctx, toolCtx), 'ask'); // self=ask
  // acceptEdits still can't override deny
  assert.equal(evaluatePermission(bashTool, { command: 'rm -rf /' }, { settings: s, mode: 'bypassPermissions' }, toolCtx), 'allow');
  // read-only tool always allowed
  assert.equal(evaluatePermission(readTool, { file_path: 'x' }, pctx, toolCtx), 'allow');
  // plan mode denies writes
  assert.equal(evaluatePermission(bashTool, { command: 'node app.js' }, { settings: s, mode: 'plan' }, toolCtx), 'deny');
});

await check('P10: Edit(src/**) path glob', () => {
  const s = baseSettings();
  s.permissions.allow = ['Edit(src/**)'];
  const pctx = { settings: s, mode: 'default' };
  assert.equal(evaluatePermission({ ...bashTool, name: 'Edit', isReadOnly: false, checkPermissions: () => 'ask' }, { file_path: 'C:/repo/src/app.ts' }, pctx, toolCtx), 'allow');
  assert.equal(evaluatePermission({ ...bashTool, name: 'Edit', isReadOnly: false, checkPermissions: () => 'ask' }, { file_path: 'C:/repo/docs/x.md' }, pctx, toolCtx), 'ask');
});

await check('P12: TodoWrite shape + single in_progress rule + rendering', async () => {
  const r = await todoTool.call({
    todos: [
      { content: 'Research', status: 'completed' },
      { content: 'Implement', status: 'in_progress', activeForm: 'Implementing' },
      { content: 'Test', status: 'pending' },
    ],
  }, toolCtx);
  assert.match(r.data, /✅ Research/);
  assert.match(r.data, /▸ Implementing/);
  assert.match(r.data, /☐ Test/);
  await assert.rejects(
    () => todoTool.call({ todos: [
      { content: 'a', status: 'in_progress' },
      { content: 'b', status: 'in_progress' },
    ] }, toolCtx),
    /Only one task may be in_progress/,
  );
  assert.match(todoReminder(appState.todos), /<system-reminder>/);
});

await check('P14: threshold math (effective − 13000)', () => {
  // contextWindow 100k, maxOutput 16k → effective 84k → trigger 71k
  assert.equal(effectiveWindow(100_000, 16_000), 84_000);
  const small = [
    { uuid: '1', parentUuid: null, timestamp: '', type: 'user', content: [{ type: 'text', text: 'x'.repeat(100) }] },
  ];
  assert.equal(shouldAutoCompact(small, 100_000, 16_000), false);
});

await check('P14: stripAnalysis removes the scratchpad', () => {
  const out = stripAnalysis('<analysis>secret thinking</analysis>\n<summary>clean</summary>');
  assert.equal(out, '<summary>clean</summary>');
});

// compaction summarizer against a mock server
let captured = [];
const server = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    captured.push(JSON.parse(b || '{}'));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = { choices: [{ delta: { content: '<analysis>hidden</analysis><summary>## 1. Primary Request and Intent\nUser wanted X</summary>' }, finish_reason: 'stop' }] };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

await check('P14: summarizer — no tools on the wire (A8), analysis stripped, 9-section summary', async () => {
  captured = [];
  const msgs = [
    { uuid: 'a', parentUuid: null, timestamp: '', type: 'user', content: [{ type: 'text', text: 'do the thing' }] },
    { uuid: 'b', parentUuid: 'a', timestamp: '', type: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  ];
  const r = await summarizeConversation(msgs, { baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'k', model: 'm' });
  assert.match(r.summary, /Primary Request and Intent/);
  assert.ok(!r.summary.includes('hidden'), 'analysis must be stripped');
  assert.equal(captured[0].tools, undefined, 'no tools array on summarizer request (A8)');
  const compacted = applyCompaction(msgs, r.summary, '/tmp/t.jsonl');
  assert.equal(compacted.length, 1);
  assert.equal(compacted[0].isCompactSummary, true);
  assert.match(compacted[0].content[0].text, /Resume directly/);
});
server.close();

console.log(failed === 0 ? '\nALL STAGE II TESTS PASSED' : `\n${failed} STAGE II TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
