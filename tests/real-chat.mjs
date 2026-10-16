/**
 * Real-provider smoke test (P2 acceptance: "one real provider").
 * Usage: node tests/real-chat.mjs <profile> <model> [prompt]
 * Key is read from the user's own auth.json — never printed, never logged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { streamChat } from '../dist/provider/client.js';
import { toWireMessages } from '../dist/provider/wire.js';

const [profileName, model, ...promptParts] = process.argv.slice(2);
if (profileName === undefined || model === undefined) {
  console.error('usage: node tests/real-chat.mjs <profile> <model> [prompt]');
  process.exit(2);
}
const prompt = promptParts.join(' ') || 'Reply with exactly: VEXA ONLINE';

const authFile = JSON.parse(
  fs.readFileSync(path.join(process.env['USERPROFILE'], '.vexa', 'auth.json'), 'utf8'),
);
const apiKey = authFile.profiles?.[profileName];
if (apiKey === undefined) {
  console.error(`no key stored for profile "${profileName}"`);
  process.exit(1);
}

const config = JSON.parse(
  fs.readFileSync(path.join(process.env['USERPROFILE'], '.vexa', 'config.json'), 'utf8'),
);
const profile = config.providerProfiles[profileName];
if (profile === undefined) {
  console.error(`no profile "${profileName}" in config.json`);
  process.exit(1);
}

// minimal VexaMessage shape for the wire layer
const messages = [
  {
    uuid: 'r1', parentUuid: null, timestamp: new Date().toISOString(), type: 'system',
    content: [{ type: 'text', text: 'You are Vexa Code, a coding agent CLI. Be concise.' }],
  },
  {
    uuid: 'r2', parentUuid: 'r1', timestamp: new Date().toISOString(), type: 'user',
    content: [{ type: 'text', text: prompt }],
  },
];

const t0 = Date.now();
let firstTokenMs = 0;
const r = await streamChat(
  {
    baseUrl: profile.baseUrl,
    apiKey,
    model,
    messages: toWireMessages(messages, { supportsVision: false }),
    maxTokens: profile.maxTokens ?? 4096,
    maxTokensParam: profile.maxTokensParam,
    temperature: profile.temperature,
    supports: { tools: true, streamOptions: true, vision: false },
    label: profileName,
  },
  {
    onTextDelta: (d) => {
      if (firstTokenMs === 0) firstTokenMs = Date.now() - t0;
      process.stdout.write(d);
    },
    onReasoningDelta: (d) => {
      // reasoning models think before speaking — show it dimly so the stream isn't silent
      if (firstTokenMs === 0) firstTokenMs = Date.now() - t0;
      process.stdout.write(`\x1b[2m${d}\x1b[0m`);
    },
    onIdleWarn: () => process.stderr.write('\n[warn: no chunks for 45s…]\n'),
    onRetry: (attempt, kind, delay) => process.stderr.write(`\n[retry ${attempt} after ${kind}, waiting ${Math.round(delay)}ms]\n`),
    onFallbackNonStream: () => process.stderr.write('\n[fallback: non-streaming request]\n'),
  },
);

const dt = Date.now() - t0;
console.log(
  `\n---\nstreamed text in ${firstTokenMs}ms (first token), total ${dt}ms · ` +
    `finish=${r.finishReason} · usage: in=${r.usage.inputTokens} out=${r.usage.outputTokens}` +
    `${r.usage.cacheReadTokens !== undefined ? ` cached=${r.usage.cacheReadTokens}` : ''}` +
    ` est=${r.usage.estimated}`,
);
