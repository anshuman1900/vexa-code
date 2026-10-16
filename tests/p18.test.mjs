/**
 * P18 acceptance: sessionSummaries — enriched listing for /sessions picker.
 * Run: node tests/p18.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sessionSummaries } from '../dist/sessions/transcript.js';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p18-home-'));
process.env['VEXA_CONFIG_DIR'] = tmpHome;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p18-repo-'));
const dir = path.join(tmpHome, 'projects', 'proj', '');
fs.mkdirSync(dir, { recursive: true });

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

const msg = (type, text, uuid) =>
  JSON.stringify({ uuid, parentUuid: null, timestamp: '2026-10-17T00:00:00Z', type, content: [{ type: 'text', text }] });

import { projectsDir } from '../dist/sessions/transcript.js';
const pdir = projectsDir(repo);
fs.mkdirSync(pdir, { recursive: true });
fs.writeFileSync(path.join(pdir, 'old-session.jsonl'), [msg('user', 'fix the login bug in auth flow', 'u1'), msg('assistant', 'ok', 'a1')].join('\n'));
fs.writeFileSync(path.join(pdir, 'new-session.jsonl'), [msg('user', 'x'.repeat(200), 'u2'), msg('user', 'second', 'u3'), msg('assistant', 'a', 'a2')].join('\n'));
fs.writeFileSync(path.join(pdir, 'empty.jsonl'), '');
fs.utimesSync(path.join(pdir, 'old-session.jsonl'), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));

await check('ordering + counts + preview truncation', () => {
  const sums = sessionSummaries(repo);
  assert.equal(sums[0]?.id, 'new-session.jsonl'.replace('.jsonl', ''), 'newest first');
  const nw = sums.find((s) => s.id === 'new-session');
  assert.equal(nw?.msgCount, 3);
  assert.equal(nw?.firstPrompt.length, 80, 'preview capped at 80 chars');
  const old = sums.find((s) => s.id === 'old-session');
  assert.equal(old?.firstPrompt, 'fix the login bug in auth flow');
  const empty = sums.find((s) => s.id === 'empty');
  assert.equal(empty?.msgCount, 0);
  assert.equal(empty?.firstPrompt, '');
});

await check('no sessions → empty array, no throw', () => {
  const blank = fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-p18-blank-'));
  assert.deepEqual(sessionSummaries(blank), []);
  fs.rmSync(blank, { recursive: true, force: true });
});

fs.rmSync(tmpHome, { recursive: true, force: true });
fs.rmSync(repo, { recursive: true, force: true });
console.log(failed === 0 ? '\nALL P18 TESTS PASSED' : `\n${failed} P18 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
