/**
 * P16-lite acceptance: WebFetch — fetch, HTML→text, cache, redirect protocol.
 * Uses example.com (stable, tiny). Run: node tests/webfetch.test.mjs
 */
import assert from 'node:assert/strict';
import { webFetchTool } from '../dist/tools/web/webFetch.js';

const ctx = { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

await check('WebFetch: fetch + HTML→text + prompt echo', async () => {
  const r = await webFetchTool.call({ url: 'https://example.com', prompt: 'what is this page' }, ctx);
  assert.match(r.data, /Content of https:\/\/example\.com/);
  assert.match(r.data, /Example Domain/i);
  assert.ok(!/<html/i.test(r.data), 'HTML tags stripped');
});

await check('WebFetch: cache hit (second call, no refetch needed)', async () => {
  const r = await webFetchTool.call({ url: 'https://example.com', prompt: 'again' }, ctx);
  assert.match(r.data, /Example Domain/i);
});

await check('WebFetch: 404 surfaces clearly', async () => {
  await assert.rejects(
    () => webFetchTool.call({ url: 'https://example.com/nonexistent-page-xyz', prompt: 'x' }, ctx),
    /HTTP 404/,
  );
});

console.log(failed === 0 ? '\nALL WEBFETCH TESTS PASSED' : `\n${failed} WEBFETCH TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
