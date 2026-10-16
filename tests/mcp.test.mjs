/**
 * P11 acceptance tests (SPEC §6 P11): stdio MCP client — handshake,
 * discovery, tool call through the bridge, naming, config gating.
 * Run: node tests/mcp.test.mjs
 */
import assert from 'node:assert/strict';
import { McpClient } from '../dist/extensibility/mcp/client.js';
import { mcpToolsFromClient } from '../dist/tools/mcpBridge.js';
import { discoverMcpServers, loadApproved } from '../dist/extensibility/mcp/config.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverPath = path.resolve('tests/fixtures/mcp-echo-server.mjs');
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

const client = new McpClient('echo', { command: process.execPath, args: [serverPath] });

await check('handshake + tools/list discovery', async () => {
  await client.start();
  assert.equal(client.status, 'connected');
  assert.equal(client.serverInfo.name, 'echo-server');
  const tools = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'echo');
});

await check('bridge: mcp__echo__echo naming + call round-trip', async () => {
  const tools = mcpToolsFromClient(client, await client.listTools());
  assert.equal(tools[0].name, 'mcp__echo__echo');
  assert.equal(tools[0].isReadOnly, false, 'unknown MCP tools fail closed');
  assert.equal(tools[0].checkPermissions({}, tools[0] && { abortController: new AbortController(), readFileState: new Map(), cwd: '.' }), 'ask');
  const r = await tools[0].call({ text: 'hello-mcp' }, { abortController: new AbortController(), readFileState: new Map(), cwd: '.' });
  assert.equal(r.data, 'ECHO:hello-mcp');
});

await check('config: project .mcp.json gated by approval', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-mcp-'));
  fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { gate: { command: 'noop', args: [] } } }));
  // not approved → skipped
  const { entries, skipped } = discoverMcpServers(dir, undefined, async () => true);
  assert.equal(entries.length, 0);
  assert.deepEqual(skipped, ['gate']);
  // approved → included
  fs.writeFileSync(path.join(os.homedir(), '.vexa', 'mcp-approved.json'), '{"servers":["gate"]}');
  const r2 = discoverMcpServers(dir, undefined, async () => true);
  assert.equal(r2.entries.length, 1);
  assert.equal(r2.entries[0].source, 'project');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(path.join(os.homedir(), '.vexa', 'mcp-approved.json'), { force: true });
});

await check('user config servers are auto-approved', () => {
  const { entries } = discoverMcpServers(process.cwd(), { mine: { command: 'noop' } }, async () => true);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, 'user');
});

client.stop();
console.log(failed === 0 ? '\nALL MCP TESTS PASSED' : `\n${failed} MCP TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
