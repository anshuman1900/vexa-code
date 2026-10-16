#!/usr/bin/env node
/**
 * Eval runner CLI (P19): node evals/run.mjs [--model nvidia] [--filter substr]
 * Cases live in evals/cases/*.json. Results: evals/results.json + table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const dist = (p) => pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', p)).href;

const { loadSettings } = await import(dist('config/settings.js'));
const { resolveModelRef, resolveApiKey } = await import(dist('config/profiles.js'));
const { runEvalCase } = await import(dist('evals/runner.js'));

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const modelRef = flag('--model', 'default');
const filter = flag('--filter', '');

const settings = loadSettings(process.cwd());
const settingsObj = settings.settings ?? settings; // LoadedSettings wrapper or raw
const resolved = resolveModelRef(settingsObj, modelRef === 'default' ? undefined : modelRef);
const key = resolveApiKey(resolved.profile, resolved.profileName);

const casesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cases');
const cases = fs
  .readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(casesDir, f), 'utf8')))
  .filter((c) => filter === '' || c.name.includes(filter));

if (cases.length === 0) {
  console.error('no eval cases matched');
  process.exit(2);
}

console.log(`running ${cases.length} eval(s) on ${resolved.profileName}:${resolved.modelId}\n`);
const results = [];
for (const c of cases) {
  process.stdout.write(`  ${c.name} ... `);
  const r = await runEvalCase(c, resolved, key, 'eval');
  results.push(r);
  console.log(r.pass ? 'PASS' : 'FAIL', `(${(r.durationMs / 1000).toFixed(1)}s, in=${r.tokensIn} out=${r.tokensOut})`);
  for (const f of r.failures) console.log(`      - ${f}`);
}

const out = { timestamp: new Date().toISOString(), model: `${resolved.profileName}:${resolved.modelId}`, results };
fs.writeFileSync(path.join(casesDir, '..', 'results.json'), JSON.stringify(out, null, 2) + '\n');
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} evals passed`);
process.exit(passed === results.length ? 0 : 1);
