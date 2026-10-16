/**
 * P19 acceptance: eval harness — scoreEval pure logic + case loading.
 * Run: node tests/p19.test.mjs   (live run: node evals/run.mjs --model nvidia)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scoreEval } from '../dist/evals/runner.js';

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

await check('scoreEval: pass on all expectations met', () => {
  const f = scoreEval(
    { name: 'x', prompt: '', expect: { toolUsed: 'Read', outputContains: ['PINEAPPLE'] } },
    'PINEAPPLE', ['Read'], 3,
  );
  assert.deepEqual(f, []);
});

await check('scoreEval: missing tool, missing substring, regex miss, turn cap', () => {
  const f = scoreEval(
    { name: 'x', prompt: '', expect: { toolUsed: 'Read', toolNotUsed: 'Bash', outputContains: ['A'], outputMatches: '\\d+', maxTurns: 2 } },
    'nope', ['Bash'], 5,
  );
  assert.equal(f.length, 5, `got: ${JSON.stringify(f)}`);
  assert.ok(f.some((x) => x.includes('Read')));
  assert.ok(f.some((x) => x.includes('Bash must not')));
  assert.ok(f.some((x) => x.includes('missing "A"')));
  assert.ok(f.some((x) => x.includes('turns 5 > cap 2')));
});

await check('case files are valid EvalCases with expect block', () => {
  const dir = path.join(os.tmpdir(), 'vexa-p19-cases-does-not-exist');
  void dir;
  const casesDir = path.join(process.cwd(), 'evals', 'cases');
  const files = fs.readdirSync(casesDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3, 'at least 3 cases');
  for (const f of files) {
    const c = JSON.parse(fs.readFileSync(path.join(casesDir, f), 'utf8'));
    assert.ok(c.name !== undefined && c.prompt !== undefined && c.expect !== undefined, `${f} shape`);
  }
});

console.log(failed === 0 ? '\nALL P19 TESTS PASSED' : `\n${failed} P19 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
