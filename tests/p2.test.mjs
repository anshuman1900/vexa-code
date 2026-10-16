/**
 * P2 acceptance tests (SPEC §6 P2) — mock SSE server + assertions.
 * Run: npm test   (node tests/p2.test.mjs)
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { streamChat } from '../dist/provider/client.js';
import { toWireMessages, toWireTool } from '../dist/provider/wire.js';

let hits = [];
let scenario = 'ok';
let capturedBodies = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    capturedBodies.push(JSON.parse(body || '{}'));
    hits.push(Date.now());
    const n = hits.length;

    if (scenario === 'ok') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunks = [
        { choices: [{ delta: { role: 'assistant', content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: { content: '!' } }] },
        // three simultaneous tool calls, arguments fragmented across chunks (A9)
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'Read', arguments: '{"file_' } }] } }] },
        { choices: [{ delta: { tool_calls: [
          { index: 0, function: { arguments: 'path":"a.ts"}' } },
          { index: 1, id: 'call_2', function: { name: 'Bash', arguments: '{"command":"ls"}' } },
        ] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 2, id: 'call_3', function: { name: 'Grep', arguments: '{"pattern":"fo' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 2, function: { arguments: 'o"}' } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, prompt_tokens_details: { cached_tokens: 20 } } },
        'DONE-marker-not-json',
      ];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= chunks.length) {
          clearInterval(timer);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
        const c = chunks[i++];
        if (typeof c === 'string') {
          res.write(`data: ${c}\n\n`); // malformed line → must be skipped (P25)
          return;
        }
        res.write(`data: ${JSON.stringify(c)}\n\n`);
      }, 5);
      return;
    }

    if (scenario === 'retry500') {
      if (n <= 2) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'internal' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'recovered' }, finish_reason: 'stop' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    if (scenario === 'overloaded') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'overloaded_error', message: 'capacity' } }));
      return;
    }

    if (scenario === 'conn_drop') {
      if (body.includes('"stream":true')) {
        res.destroy(); // connection-level failure
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { content: 'non-stream reply' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }));
      return;
    }

    res.writeHead(500);
    res.end('unknown scenario');
  });
});

const results = [];
function check(name, fn) {
  results.push({ name, fn });
}

const base = () => 'http://127.0.0.1:0'; // replaced after listen
let PORT = 0;

const req = (over = {}) => ({
  baseUrl: `http://127.0.0.1:${PORT}`,
  apiKey: 'test-key-never-logged',
  model: 'test-model',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 1000,
  temperature: 1,
  ...over,
});

check('A: streamed text + fragmented tool calls + usage', async () => {
  scenario = 'ok';
  hits = []; capturedBodies = [];
  const textDeltas = [];
  const r = await streamChat(req(), { onTextDelta: (d) => textDeltas.push(d) });
  assert.equal(r.text, 'Hello world!');
  assert.equal(r.finishReason, 'tool_calls');
  assert.equal(r.toolCalls.length, 3);
  assert.deepEqual(r.toolCalls[0], { id: 'call_1', name: 'Read', arguments: '{"file_path":"a.ts"}' });
  assert.deepEqual(r.toolCalls[1], { id: 'call_2', name: 'Bash', arguments: '{"command":"ls"}' });
  assert.deepEqual(r.toolCalls[2], { id: 'call_3', name: 'Grep', arguments: '{"pattern":"foo"}' });
  assert.equal(r.usage.inputTokens, 100);
  assert.equal(r.usage.outputTokens, 50);
  assert.equal(r.usage.cacheReadTokens, 20);
  assert.equal(r.usage.estimated, false);
  assert.equal(textDeltas.join(''), 'Hello world!');
  // wire shape: tools present, tool_choice auto, stream_options on, max_tokens
  const b = capturedBodies[0];
  assert.equal(b.stream, true);
  assert.deepEqual(b.stream_options, { include_usage: true });
  assert.equal(b.max_tokens, 1000);
  assert.equal(b.temperature, 1);
});

check('B: dropFields + maxTokensParam rename', async () => {
  scenario = 'ok';
  hits = []; capturedBodies = [];
  await streamChat(req({ dropFields: ['temperature', 'tool_choice'], maxTokensParam: 'max_completion_tokens' }));
  const b = capturedBodies[0];
  assert.equal('temperature' in b, false);
  assert.equal('tool_choice' in b, false);
  assert.equal(b.max_completion_tokens, 1000);
  assert.equal('max_tokens' in b, false);
});

check('C: retry on 500 with exponential timing (500ms then ~1000ms between hits)', async () => {
  scenario = 'retry500';
  hits = []; capturedBodies = [];
  const r = await streamChat(req());
  assert.equal(r.text, 'recovered');
  assert.equal(hits.length, 3);
  const d1 = hits[1] - hits[0]; // backoff 1: 500 + jitter(0..125) + per-request overhead
  const d2 = hits[2] - hits[1]; // backoff 2: 1000 + jitter(0..250) + same overhead
  assert.ok(d1 >= 450, `first gap ${d1}ms too fast`);
  assert.ok(d2 >= 900, `second gap ${d2}ms too fast`);
  const ratio = d2 / d1;
  assert.ok(ratio >= 1.25 && ratio <= 3.6, `exponential shape violated: d1=${d1} d2=${d2} ratio=${ratio.toFixed(2)}`);
});

check('D: 3-strike overloaded → error after exactly 3 attempts', async () => {
  scenario = 'overloaded';
  hits = [];
  await assert.rejects(
    () => streamChat(req()),
    (e) => e.kind === 'overloaded' && /overloaded/i.test(e.message),
  );
  assert.equal(hits.length, 3);
});

check('E: connection drops on stream → non-streaming fallback (A14)', async () => {
  scenario = 'conn_drop';
  hits = []; capturedBodies = [];
  let fellBack = false;
  const r = await streamChat(req(), { onFallbackNonStream: () => (fellBack = true) });
  assert.equal(r.text, 'non-stream reply');
  assert.equal(r.usage.totalTokens, 15);
  assert.equal(fellBack, true);
  assert.equal(capturedBodies.filter((b) => b.stream === false).length, 1);
});

check('F: wire translation (tool_use/tool_result → assistant.tool_calls + role:tool)', async () => {
  const msgs = [
    { uuid: '1', parentUuid: null, timestamp: '', type: 'system', content: [{ type: 'text', text: 'sys' }] },
    { uuid: '2', parentUuid: '1', timestamp: '', type: 'user', content: [{ type: 'text', text: 'q' }] },
    {
      uuid: '3', parentUuid: '2', timestamp: '', type: 'assistant',
      content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'x' } },
        { type: 'reasoning', text: 'SECRET-REASONING' },
      ],
    },
    {
      uuid: '4', parentUuid: '3', timestamp: '', type: 'user',
      content: [{ type: 'tool_result', toolUseId: 't1', content: 'file body', isError: false }],
    },
  ];
  const wire = toWireMessages(msgs, { supportsVision: false });
  assert.equal(wire[0].role, 'system');
  assert.equal(wire[1].content, 'q');
  assert.equal(wire[2].role, 'assistant');
  assert.equal(wire[2].content, 'thinking');
  assert.deepEqual(wire[2].tool_calls, [{ id: 't1', type: 'function', function: { name: 'Read', arguments: '{"file_path":"x"}' } }]);
  assert.equal(wire[3].role, 'tool');
  assert.equal(wire[3].tool_call_id, 't1');
  const flat = JSON.stringify(wire);
  assert.ok(!flat.includes('SECRET-REASONING'), 'reasoning must NEVER reach the wire (A6)');
  const t = toWireTool('Read', 'reads files', { type: 'object' });
  assert.equal(t.type, 'function');
});

check('G: error tool results get "Error: " prefix (A7)', async () => {
  const msgs = [
    { uuid: 'a', parentUuid: null, timestamp: '', type: 'user', content: [{ type: 'text', text: 'x' }] },
    { uuid: 'b', parentUuid: 'a', timestamp: '', type: 'user', content: [{ type: 'tool_result', toolUseId: 'k', content: 'boom', isError: true }] },
  ];
  const wire = toWireMessages(msgs, { supportsVision: false });
  assert.equal(wire[1].role, 'tool');
  assert.equal(wire[1].tool_call_id, 'k');
  assert.equal(wire[1].content, 'Error: boom');
});

// run sequentially
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
PORT = server.address().port;

let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${e.message}`);
  }
}
server.close();
console.log(failed === 0 ? `\nALL ${results.length} P2 TESTS PASSED` : `\n${failed}/${results.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
