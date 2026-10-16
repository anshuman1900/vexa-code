// P24 packaging prep: rebuild the single-file CLI bundle + stage node.exe.
// Run before `npx tauri build`:  node scripts/sync-resources.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const guiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resDir = path.join(guiDir, 'src-tauri', 'resources');
fs.mkdirSync(resDir, { recursive: true });

// 1. bundle dist/cli.js (built by `npm run build` in the repo root) → single CJS
execSync(
  `npx esbuild ${JSON.stringify(path.join(guiDir, '..', 'dist', 'cli.js'))} --bundle --platform=node --format=cjs --outfile=${JSON.stringify(path.join(resDir, 'vexa-cli.cjs'))}`,
  { stdio: 'inherit', cwd: guiDir },
);

// 2. stage node.exe: VEXA_NODE_EXE env, or a sibling checkout, or the Hermes tools copy
const candidates = [
  process.env['VEXA_NODE_EXE'],
  'C:/Users/Administrator/AppData/Local/hermes/tools/node-26.7.0-win32-x64/node.exe',
];
const src = candidates.find((c) => c !== undefined && fs.existsSync(c));
if (src === undefined) {
  console.error('node.exe not found — set VEXA_NODE_EXE to a node binary to bundle');
  process.exit(1);
}
fs.copyFileSync(src, path.join(resDir, 'node.exe'));
console.log('resources synced:', fs.readdirSync(resDir).join(', '));
