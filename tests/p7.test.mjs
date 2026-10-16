/**
 * P7 acceptance tests (SPEC §6 P7). Run: node tests/p7.test.mjs
 * (the auto-background scenario runs in a child process with its own
 * VEXA_BASH_BLOCKING_MS so it doesn't clash with the timeout test)
 */
const { bashTool } = await import('../dist/tools/bash/bash.js');
const { bashOutputTool, killShellTool } = await import('../dist/tools/bash/bashOutput.js');
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const ctx = { abortController: new AbortController(), readFileState: new Map(), cwd: os.tmpdir() };
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('  PASS ', name); }
  catch (e) { failed++; console.error('  FAIL ', name, '\n        ', e.message); }
}

await check('Bash: basic command + stdout', async () => {
  const r = await bashTool.call({ command: 'echo vexa-bash-ok' }, ctx);
  assert.match(r.data, /vexa-bash-ok/);
});

await check('Bash: timeout enforced (ping 5s, timeout 1200)', async () => {
  const t0 = Date.now();
  const r = await bashTool.call({ command: 'ping -n 5 127.0.0.1 > /dev/null', timeout: 1200 }, ctx);
  const dt = Date.now() - t0;
  assert.match(r.data, /timed out after 1200ms/);
  assert.ok(dt < 3000, `timeout kill took ${dt}ms`);
});

await check('Bash: foreground sleep refused with advice', async () => {
  await assert.rejects(() => bashTool.call({ command: 'sleep 30' }, ctx), /Foreground sleep refused/);
});

await check('Bash: exit code surfaced', async () => {
  const r = await bashTool.call({ command: 'exit 3' }, ctx);
  assert.match(r.data, /exit code: 3/);
});

await check('Bash: 30k output cap middle-truncates', async () => {
  const r = await bashTool.call({ command: 'yes vexa-fill | head -n 20000' }, ctx);
  assert.match(r.data, /output truncated/);
  assert.ok(r.data.length < 60000);
});

await check('Bash: background start + BashOutput + KillShell', async () => {
  const start = await bashTool.call({ command: 'ping -n 2 127.0.0.1 > /dev/null && echo bg-marker-done', run_in_background: true }, ctx);
  const id = (start.data.match(/shell started: (\S+)/) ?? [])[1];
  assert.ok(id, 'shell id returned');
  const o0 = await bashOutputTool.call({ bash_id: id }, ctx);
  assert.match(o0.data, /\[status: running\]/);
  await new Promise((r2) => setTimeout(r2, 2600));
  const o1 = await bashOutputTool.call({ bash_id: id }, ctx);
  assert.match(o1.data, /bg-marker-done/);
  assert.match(o1.data, /exited \(code 0\)/);
  const k = await killShellTool.call({ shell_id: id }, ctx);
  assert.match(k.data, /already stopped/);
});

await check('Bash: KillShell terminates long-running background shell', async () => {
  const start = await bashTool.call({ command: 'ping -n 60 127.0.0.1 > /dev/null', run_in_background: true }, ctx);
  const id = (start.data.match(/shell started: (\S+)/) ?? [])[1];
  const k = await killShellTool.call({ shell_id: id }, ctx);
  assert.match(k.data, /Killed shell/);
  const o = await bashOutputTool.call({ bash_id: id }, ctx);
  assert.match(o.data, /\[status: killed\]/);
});

await check('Bash: foreground command auto-moves to background (own process, 400ms budget)', async () => {
  const distUrl = new URL('../dist/tools/bash/bash.js', import.meta.url).href.replace(/\\/g, '/');
  const script = `
    const { bashTool } = await import(${JSON.stringify(distUrl)});
    const r = await bashTool.call(
      { command: 'ping -n 3 127.0.0.1 > /dev/null && echo slow-done' },
      { abortController: new AbortController(), readFileState: new Map(), cwd: process.cwd() },
    );
    if (!/moved to background/.test(r.data)) throw new Error('no auto-bg: ' + r.data);
    if (!/BashOutput/.test(r.data)) throw new Error('no BashOutput hint');
    console.log('OK');
  `;
  await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--input-type=module', '-e', script],
      { env: { ...process.env, VEXA_BASH_BLOCKING_MS: '400' }, timeout: 15000, windowsHide: true },
      (err) => (err !== null ? reject(err) : resolve()),
    );
  });
});

await check('BashOutput: unknown id errors clearly', async () => {
  await assert.rejects(() => bashOutputTool.call({ bash_id: 'nope' }, ctx), /Unknown shell id/);
});

console.log(failed === 0 ? '\nALL P7 TESTS PASSED' : `\n${failed} P7 TESTS FAILED`);
process.exit(failed === 0 ? 0 : 1);
