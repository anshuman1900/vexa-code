/**
 * P13 acceptance tests (SPEC §6 P13): Task tool — subagent isolation,
 * scoped toolsets, result reporting. Run: node tests/p13.test.mjs
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { runAgentTurn } from '../dist/engine/queryLoop.js';
import { createTaskTool } from '../dist/tools/task.js';
import { readTool } from '../dist/tools/filesystem/read.js';
import { getAgentType } from '../dist/agents/registry.js';

let scenario = 'happy';
let requestCount = 0;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    requestCount++;
    const sse = (chunks) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    };
    const toolCall = (id, name, args, index = 0) => ({
      choices: [{ delta: { tool_calls: [{ index, id, function: { name, arguments: JSON.stringify(args) } }] } }],
    });

    if (scenario === 'happy') {
      // r1: parent spawns Task(general-purpose); r2: sub uses Probe; r3: sub report; r4: parent final
      if (requestCount === 1) return sse([toolCall('t1', 'Task', { description: 'probe things', prompt: 'probe it', subagent_type: 'general-purpose' }), { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
      if (requestCount === 2) return sse([toolCall('s1', 'Probe', { n: 7 }), { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
      if (requestCount === 3) return sse([{ choices: [{ delta: { content: 'SUB-REPORT: probe-7 seen' }, finish_reason: 'stop' }] }]);
      return sse([{ choices: [{ delta: { content: 'parent done' }, finish_reason: 'stop' }] }]);
    }

    if (scenario === 'explore-restricted') {
      // r1: parent spawns Explore; r2: sub (Explore) tries Writer → unknown tool error; r3: sub reports failure; r4: parent final
      if (requestCount === 1) return sse([toolCall('t1', 'Task', { description: 'try write', prompt: 'write it', subagent_type: 'Explore' }), { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
      if (requestCount === 2) return sse([toolCall('s1', 'Writer', { n: 1 }), { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
      if (requestCount === 3) return sse([{ choices: [{ delta: { content: 'SUB-REPORT: write blocked' }, finish_reason: 'stop' }] }]);
      return sse([{ choices: [{ delta: { content: 'parent confirmed blocked' }, finish_reason: 'stop' }] }]);
    }
    res.writeHead(500);
    res.end();
  });
});

const probeExecutions = [];
const probeTool = {
  name: 'Probe',
  description: 'test probe',
  inputSchema: { type: 'object', properties: { n: { type: 'number' } } },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  async call(input) {
    probeExecutions.push(input?.n);
    return { data: `probe-${input?.n}` };
  },
};
const writerTool = {
  name: 'Writer',
  description: 'write tool',
  inputSchema: { type: 'object' },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: false,
  checkPermissions: () => 'allow',
  async call(input) {
    return { data: `wrote-${input?.n}` };
  },
};

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

const parentMessages = [
  { uuid: 'p0', parentUuid: null, timestamp: '', type: 'user', content: [{ type: 'text', text: 'go' }] },
];

await check('agent types: Explore allowlist is read-only; general-purpose is wide', () => {
  assert.deepEqual(getAgentType('Explore').allow(writerTool), false);
  assert.deepEqual(getAgentType('general-purpose').allow(writerTool), true);
  assert.equal(getAgentType('unknown-type').name, 'general-purpose', 'falls back to general-purpose');
});

await check('Task: subagent runs isolated, report returns to parent, parent context unpolluted', async () => {
  scenario = 'happy'; requestCount = 0;
  const baseCount = parentMessages.length;
  const taskTool = createTaskTool({
    baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'k', model: 'test', maxTokens: 1000,
    parentTools: [probeTool, writerTool],
    parentPermissionAsk: async () => true,
    cwd: process.cwd(),
  });
  let toolResultContent = '';
  const r = await runAgentTurn({
    baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'k', model: 'test', system: 'parent',
    messages: parentMessages, tools: [probeTool, taskTool], maxTokens: 1000, maxTurns: 10,
    toolContext: { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() },
    permissionAsk: async () => true,
    onToolResult: (_n, content) => { toolResultContent = content; },
  });
  assert.equal(r.finalText, 'parent done');
  assert.match(toolResultContent, /SUB-REPORT: probe-7 seen/, 'subagent report returned as tool result');
  assert.deepEqual(probeExecutions, [7], 'subagent executed Probe');
  // parent context only has parent-level messages (user, assistant w/ Task call, tool result, final assistant)
  assert.ok(parentMessages.length <= baseCount + 4, `parent polluted: ${parentMessages.length} messages`);
  const flat = JSON.stringify(parentMessages);
  assert.ok(!flat.includes('SUB-REPORT') || flat.indexOf('SUB-REPORT') === flat.lastIndexOf('SUB-REPORT'), 'no subagent internals leaked');
});

await check('Task: Explore subagent cannot use write tools (scoped toolset)', async () => {
  scenario = 'explore-restricted'; requestCount = 0;
  const taskTool = createTaskTool({
    baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'k', model: 'test', maxTokens: 1000,
    parentTools: [readTool, writerTool],
    parentPermissionAsk: async () => true,
    cwd: process.cwd(),
  });
  let toolResultContent = '';
  const r = await runAgentTurn({
    baseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'k', model: 'test', system: 'parent',
    messages: [{ uuid: 'p0', parentUuid: null, timestamp: '', type: 'user', content: [{ type: 'text', text: 'go' }] }],
    tools: [readTool, writerTool, taskTool], maxTokens: 1000, maxTurns: 10,
    toolContext: { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() },
    permissionAsk: async () => true,
    onToolResult: (_n, content) => { toolResultContent = content; },
  });
  assert.match(toolResultContent, /SUB-REPORT: write blocked/, 'sub reported the blocked write');
  assert.equal(r.finalText, 'parent confirmed blocked');
});

server.close();
console.log(failed === 0 ? '\nALL P13 TESTS PASSED' : `\n${failed} P13 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
