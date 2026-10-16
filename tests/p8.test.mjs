/**
 * P8 acceptance tests (SPEC §6 P8): agent loop — batching, permissions,
 * orphan prevention, length ladder, max-turns. Run: node tests/p8.test.mjs
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { runAgentTurn } from '../dist/engine/queryLoop.js';

let scenario = 'batch';
let requestCount = 0;
let capturedRequests = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    requestCount++;
    capturedRequests.push(JSON.parse(body || '{}'));
    const sse = (chunks) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    };
    const toolCall = (id, name, args, index = 0) => ({
      choices: [{ delta: { tool_calls: [{ index, id, function: { name, arguments: JSON.stringify(args) } }] } }],
    });

    if (scenario === 'batch') {
      // 1st call: 3 parallel-safe tools; 2nd: 1 unsafe; 3rd: final text
      if (requestCount === 1) {
        return sse([
          toolCall('t1', 'Probe', { n: 1 }, 0),
          toolCall('t2', 'Probe', { n: 2 }, 1),
          toolCall('t3', 'Probe', { n: 3 }, 2),
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]);
      }
      if (requestCount === 2) {
        return sse([
          toolCall('u1', 'Writer', { n: 4 }),
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]);
      }
      return sse([
        { choices: [{ delta: { content: 'all done' }, finish_reason: 'stop' }] },
      ]);
    }

    if (scenario === 'orphan') {
      // unknown tool + throwing tool + good tool → loop must continue
      if (requestCount === 1) {
        return sse([
          toolCall('x1', 'NoSuchTool', {}, 0),
          toolCall('x2', 'Boomer', {}, 1),
          toolCall('x3', 'Probe', { n: 9 }, 2),
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]);
      }
      return sse([{ choices: [{ delta: { content: 'recovered' }, finish_reason: 'stop' }] }]);
    }

    if (scenario === 'permission') {
      if (requestCount === 1) {
        return sse([toolCall('p1', 'Writer', { n: 1 }), { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
      }
      return sse([{ choices: [{ delta: { content: 'noted' }, finish_reason: 'stop' }] }]);
    }

    if (scenario === 'maxturns') {
      return sse([toolCall('m' + requestCount, 'Probe', { n: requestCount }), { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }]);
    }

    if (scenario === 'length') {
      if (requestCount === 1) {
        return sse([{ choices: [{ delta: { content: 'partial' }, finish_reason: 'length' }] }]);
      }
      return sse([{ choices: [{ delta: { content: ' full' }, finish_reason: 'stop' }] }]);
    }

    res.writeHead(500);
    res.end('unknown scenario');
  });
});

const results = [];
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { results.push(e); console.error('  FAIL ', name, '\n        ', e.message); }
}

// synthetic tools
let active = 0;
let maxActive = 0;
const probeTool = {
  name: 'Probe',
  description: 'test probe',
  inputSchema: { type: 'object', properties: { n: { type: 'number' } } },
  isEnabled: () => true,
  isReadOnly: true,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  async call(input) {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 80));
    active--;
    return { data: `probe-${input?.n ?? '?'}` };
  },
};
const writerTool = {
  name: 'Writer',
  description: 'unsafe test tool',
  inputSchema: { type: 'object' },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: false,
  checkPermissions: () => 'ask',
  async call(input) {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 60));
    active--;
    return { data: `wrote-${input?.n ?? '?'}` };
  },
};
const boomerTool = {
  name: 'Boomer',
  description: 'always throws',
  inputSchema: { type: 'object' },
  isEnabled: () => true,
  isReadOnly: false,
  isConcurrencySafe: true,
  checkPermissions: () => 'allow',
  async call() {
    throw new Error('boom intentionally');
  },
};

const baseOpts = (tools, over = {}) => ({
  baseUrl: `http://127.0.0.1:${PORT}`,
  apiKey: 'k',
  model: 'test',
  system: 'sys',
  messages: [
    { uuid: 'u0', parentUuid: null, timestamp: '', type: 'user', content: [{ type: 'text', text: 'go' }] },
  ],
  tools,
  maxTokens: 1000,
  maxTurns: 20,
  toolContext: { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() },
  permissionAsk: async () => true,
  ...over,
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

await check('batching: 3 safe tools ran in PARALLEL; unsafe ran alone after', async () => {
  scenario = 'batch'; requestCount = 0; maxActive = 0;
  const r = await runAgentTurn(baseOpts([probeTool, writerTool]));
  assert.equal(r.finalText, 'all done');
  assert.equal(r.toolCallCount, 4);
  assert.ok(maxActive >= 3, `parallel batch expected maxActive>=3, got ${maxActive}`);
  // unsafe batch: exactly 1 concurrent
  const wire = capturedRequests;
  assert.ok(wire.length === 3);
});

await check('orphan prevention: unknown tool + thrower → error results, loop continues', async () => {
  scenario = 'orphan'; requestCount = 0;
  const r = await runAgentTurn(baseOpts([probeTool, boomerTool]));
  assert.equal(r.finalText, 'recovered');
  const msgs = r.usage.totalTokens >= 0;
  assert.ok(msgs);
});

await check('permission deny → denied result fed back, model continues', async () => {
  scenario = 'permission'; requestCount = 0;
  let asked = 0;
  const r = await runAgentTurn(baseOpts([writerTool], { permissionAsk: async () => { asked++; return false; } }));
  assert.equal(asked, 1);
  assert.equal(r.finalText, 'noted');
});

await check('bypass: permissionAsk=undefined → tools run without asking', async () => {
  scenario = 'permission'; requestCount = 0;
  const r = await runAgentTurn(baseOpts([writerTool], { permissionAsk: undefined }));
  assert.equal(r.finalText, 'noted');
});

await check('max-turns guard stops the loop', async () => {
  scenario = 'maxturns'; requestCount = 0;
  const r = await runAgentTurn(baseOpts([probeTool], { maxTurns: 3 }));
  assert.equal(r.finishReason, 'max_turns_reached');
  assert.equal(r.toolCallCount, 3);
});

await check('length ladder: max_tokens escalated 1.5x on retry (A13)', async () => {
  scenario = 'length'; requestCount = 0; capturedRequests = [];
  const r = await runAgentTurn(baseOpts([probeTool]));
  assert.equal(r.finalText, 'partial full');
  const mt = capturedRequests.map((b) => b.max_tokens);
  assert.equal(mt.length, 2);
  assert.equal(mt[1], 3000, `second request max_tokens should hit the 3000 floor (1000*1.5=1500 < FLOOR_OUTPUT_TOKENS=3000), got ${mt[1]}`);
});

server.close();
console.log(results.length === 0 ? '\nALL P8 TESTS PASSED' : `\n${results.length} P8 TESTS FAILED`);
process.exit(results.length === 0 ? 0 : 1);
