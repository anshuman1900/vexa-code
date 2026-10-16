/**
 * P6 acceptance tests (SPEC §6 P6): Write/Edit golden behaviors.
 * Run: node tests/p6.test.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readTool } from '../dist/tools/filesystem/read.js';
import { writeTool } from '../dist/tools/filesystem/write.js';
import { editTool } from '../dist/tools/filesystem/edit.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p6-'));
const ctx = { abortController: new AbortController(), readFileState: new Map(), cwd: dir };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

await check('Write: new file + must-Read-first on existing', async () => {
  const f = path.join(dir, 'new.txt');
  await writeTool.call({ file_path: f, content: 'v1' }, ctx);
  assert.equal(fs.readFileSync(f, 'utf8'), 'v1');
  await assert.rejects(
    () => {
      const unread = path.join(dir, 'unread.txt');
      fs.writeFileSync(unread, 'old content'); // exists but never Read
      return writeTool.call({ file_path: unread, content: 'x' }, ctx);
    },
    /has not been read yet/,
  );
  // after Read, overwrite works
  await readTool.call({ file_path: f }, ctx);
  await writeTool.call({ file_path: f, content: 'v2' }, ctx);
  assert.equal(fs.readFileSync(f, 'utf8'), 'v2');
});

await check('Edit: happy path + must-Read-first + not-found + not-unique', async () => {
  const f = path.join(dir, 'code.ts');
  fs.writeFileSync(f, 'const a = 1;\nconst b = 2;\nconst b2 = 2;\n');
  await assert.rejects(() => editTool.call({ file_path: f, old_string: 'a', new_string: 'z' }, ctx), /has not been read yet/);
  await readTool.call({ file_path: f }, ctx);
  await assert.rejects(() => editTool.call({ file_path: f, old_string: 'NOT THERE', new_string: 'z' }, ctx), /String not found/);
  await assert.rejects(() => editTool.call({ file_path: f, old_string: '2;', new_string: '3;' }, ctx), /2 occurrences/);
  const r = await editTool.call({ file_path: f, old_string: 'const a = 1;', new_string: 'const a = 10;' }, ctx);
  assert.match(r.data, /^\+ const a = 10;/m); // structured patch
  assert.match(r.data, /^- const a = 1;$/m);
  assert.equal(fs.readFileSync(f, 'utf8'), 'const a = 10;\nconst b = 2;\nconst b2 = 2;\n');
});

await check('Edit: replace_all renames every occurrence', async () => {
  const f = path.join(dir, 'multi.txt');
  fs.writeFileSync(f, 'foo bar foo\nfoo');
  await readTool.call({ file_path: f }, ctx);
  await editTool.call({ file_path: f, old_string: 'foo', new_string: 'baz', replace_all: true }, ctx);
  assert.equal(fs.readFileSync(f, 'utf8'), 'baz bar baz\nbaz');
});

await check('Edit: no-op rejected', async () => {
  const f = path.join(dir, 'noop.txt');
  fs.writeFileSync(f, 'same');
  await readTool.call({ file_path: f }, ctx);
  await assert.rejects(() => editTool.call({ file_path: f, old_string: 'same', new_string: 'same' }, ctx), /exactly the same/);
});

await check('Edit: self-substring rejected', async () => {
  const f = path.join(dir, 'self.txt');
  fs.writeFileSync(f, 'abc');
  await readTool.call({ file_path: f }, ctx);
  await assert.rejects(
    () => editTool.call({ file_path: f, old_string: 'ab', new_string: 'abXYZ' }, ctx),
    /substring of new_string/,
  );
});

await check('Edit: curly-quote normalization preserves file style', async () => {
  const f = path.join(dir, 'curly.txt');
  fs.writeFileSync(f, 'say \u201Chello\u201D now'); // file uses curly quotes
  await readTool.call({ file_path: f }, ctx);
  // model sends straight quotes — should still match, and file keeps curly style
  const r = await editTool.call({ file_path: f, old_string: 'say "hello" now', new_string: 'say "hi" now' }, ctx);
  assert.match(r.data, /\[quote-normalized\]/);
  assert.equal(fs.readFileSync(f, 'utf8'), 'say \u201Chi\u201D now');
});

await check('Edit: CRLF file keeps CRLF', async () => {
  const f = path.join(dir, 'crlf.txt');
  fs.writeFileSync(f, 'one\r\ntwo\r\nthree\r\n');
  await readTool.call({ file_path: f }, ctx);
  await editTool.call({ file_path: f, old_string: 'two', new_string: 'TWO' }, ctx);
  assert.equal(fs.readFileSync(f, 'utf8'), 'one\r\nTWO\r\nthree\r\n');
});

await check('Edit: write→edit tool chain isConcurrencySafe flags', () => {
  assert.equal(writeTool.isConcurrencySafe, false);
  assert.equal(editTool.isConcurrencySafe, false);
  assert.equal(writeTool.isReadOnly, false);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed === 0 ? '\nALL P6 TESTS PASSED' : `\n${failed} P6 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
