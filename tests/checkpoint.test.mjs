/**
 * P16b acceptance: checkpoints — save/list/restore round-trip (real flow:
 * checkpoint(filePath, PRIOR content) is called BEFORE each write).
 * Run: node tests/checkpoint.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCheckpointer } from '../dist/sessions/checkpoints.js';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-cp-'));
const cp = createCheckpointer('test-session_1', repo);

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

const f = path.join(repo, 'app.txt');
fs.writeFileSync(f, 'v1');

await check('save creates shadow copy + manifest entry', async () => {
  const e = cp.save(f, fs.readFileSync(f, 'utf8')); // prior = v1
  fs.writeFileSync(f, 'v2');
  assert.equal(fs.readFileSync(e.backupFile, 'utf8'), 'v1');
  assert.equal(e.n, 1);
});

await check('multiple saves list in order', async () => {
  cp.save(f, fs.readFileSync(f, 'utf8')); // prior = v2
  fs.writeFileSync(f, 'v3');
  cp.save(f, fs.readFileSync(f, 'utf8')); // prior = v3
  fs.writeFileSync(f, 'v4');
  const all = cp.list();
  assert.equal(all.length, 3);
  assert.equal(all[2].n, 3);
});

await check('restore latest → v3 (pre-v4 state); restore by n → v1 byte-exact', async () => {
  const r = cp.restore(); // latest backup = content before v4 write = v3
  assert.ok(r !== null && r.entry.n === 3);
  assert.equal(fs.readFileSync(f, 'utf8'), 'v3');
  const r1 = cp.restore(1);
  assert.ok(r1 !== null);
  assert.equal(fs.readFileSync(f, 'utf8'), 'v1');
  assert.equal(r1?.restoredBytes, 2);
});

console.log(failed === 0 ? '\nALL CHECKPOINT TESTS PASSED' : `\n${failed} CHECKPOINT TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
