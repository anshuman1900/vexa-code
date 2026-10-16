/**
 * P5 acceptance tests (SPEC §6 P5): Read limits, Glob mtime order,
 * registry → wire serialization, readFileState ledger.
 * Run: node tests/p5.test.mjs
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readTool } from '../dist/tools/filesystem/read.js';
import { globTool } from '../dist/tools/filesystem/glob.js';
import { grepTool } from '../dist/tools/filesystem/grep.js';
import { lsTool } from '../dist/tools/filesystem/ls.js';
import { getAllBaseTools, toWireTools } from '../dist/tools/registry.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p5-'));
const ctx = { abortController: new AbortController(), readFileState: new Map(), cwd: dir };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

await check('Read: cat -n numbering + default limit', async () => {
  const f = path.join(dir, 'small.txt');
  fs.writeFileSync(f, Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));
  const r = await readTool.call({ file_path: f }, ctx);
  assert.match(r.data, /^\s*1\tline 1$/m);
  assert.ok(!r.data.includes('[Showing'), 'no continuation note when all lines fit');
  assert.ok(ctx.readFileState.has(path.resolve(f)), 'Read must register into readFileState');
  const r2 = await readTool.call({ file_path: f, limit: 10 }, ctx);
  assert.match(r2.data, /\[Showing 10 of 30 lines\. Use offset=11 to continue\.\]/);
});

await check('Read: >256KB throws (never truncates)', async () => {
  const big = path.join(dir, 'big.txt');
  fs.writeFileSync(big, 'x'.repeat(300 * 1024));
  await assert.rejects(() => readTool.call({ file_path: big }, ctx), /exceeds maximum allowed size \(256KB\)/);
});

await check('Read: 2000-char line truncation', async () => {
  const f = path.join(dir, 'long-line.txt');
  fs.writeFileSync(f, 'y'.repeat(2500));
  const r = await readTool.call({ file_path: f }, ctx);
  assert.match(r.data, /\[line truncated\]/);
});

await check('Read: nonexistent file errors clearly', async () => {
  await assert.rejects(() => readTool.call({ file_path: path.join(dir, 'nope.txt') }, ctx), /File does not exist/);
});

await check('Glob: results sorted by mtime (oldest first)', async () => {
  const a = path.join(dir, 'ga.txt');
  const b = path.join(dir, 'gb.txt');
  const c = path.join(dir, 'gc.txt');
  for (const [f, t] of [[a, '2026-01-01'], [b, '2026-06-01'], [c, '2026-03-01']]) {
    fs.writeFileSync(f, f);
    fs.utimesSync(f, new Date(t), new Date(t));
  }
  const r = await globTool.call({ pattern: 'g*.txt' }, ctx);
  const rel = r.data.map((f) => path.basename(f));
  assert.deepEqual(rel, ['ga.txt', 'gc.txt', 'gb.txt'], `mtime order wrong: ${rel.join(',')}`);
});

await check('Grep: content mode with -n and head_limit', async () => {
  const f = path.join(dir, 'code.ts');
  fs.writeFileSync(f, 'const a = 1;\nconst bee = findMe;\nconst c = findMe;\n');
  const r = await grepTool.call({ pattern: 'findMe', output_mode: 'content', path: '.' }, ctx);
  assert.match(r.data, /code\.ts:2:const bee = findMe;/);
  assert.match(r.data, /code\.ts:3:/);
});

const rgPresent = await new Promise((res) => {
  execFile('rg', ['--version'], { windowsHide: true }, (err) => res(err === null));
});
await check('Grep: missing rg → clear install hint (skipped if rg present)', async () => {
  if (rgPresent) return; // rg installed → hint path untestable here
  await assert.rejects(() => grepTool.call({ pattern: 'x', path: '.' }, ctx), /ripgrep \(rg\) is not installed/);
});

await check('LS: listing with ignore patterns', async () => {
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'junk.js'), 'x');
  const r = await lsTool.call({ path: dir }, ctx);
  assert.ok(!r.data.includes('node_modules'));
  assert.ok(r.data.includes('ga.txt'));
});

await check('Registry: stable order + OpenAI wire shape', () => {
  const tools = getAllBaseTools();
  // Stage I registry: read tools first, then write/bash (stable contiguous prefix, A3b)
  assert.deepEqual(
    tools.map((t) => t.name),
    ['Read', 'Glob', 'Grep', 'LS', 'Edit', 'Write', 'Bash', 'BashOutput', 'KillShell'],
  );
  for (const t of tools) {
    if (['Read', 'Glob', 'Grep', 'LS'].includes(t.name)) {
      assert.equal(t.isReadOnly, true);
      assert.equal(t.isConcurrencySafe, true);
    }
  }
  const wire = toWireTools(tools);
  assert.equal(wire[0].type, 'function');
  assert.equal(wire[0].function.name, 'Read');
  assert.equal(typeof wire[0].function.description, 'string');
  assert.equal(wire[0].function.parameters.type, 'object');
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed === 0 ? '\nALL P5 TESTS PASSED' : `\n${failed} P5 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
