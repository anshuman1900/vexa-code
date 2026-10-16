# Vexa Code v1.0.0 🚀

A free, open Claude Code–style coding agent — for your terminal AND your desktop. Any model. Any provider.

## Highlights

**CLI** — full agent loop with 12+ tools (Read/Write/Edit w/ diffs, Glob/Grep/LS, Bash, WebFetch/WebSearch, TodoWrite, plan mode, Task subagents), permission rules + modes, MCP client, auto-memory, skills + custom slash commands, hooks, file checkpoints with /rewind, JSONL sessions w/ crash recovery, auto-compaction, headless mode (`vexa -p`), behavioral eval suite.

**Desktop (Windows)** — Tauri v2 app: streaming markdown, collapsible tool cards with edit diffs, permission prompts, bundled Node sidecar. 26.6 MB installer, ~25 MB RAM at runtime.

**Any provider** — OpenRouter, NVIDIA NIM, Groq, DeepSeek, Together, Ollama, LM Studio, vLLM, Gemini compat, custom endpoints. Keys never touch config.json.

## Install

- **Desktop**: download `Vexa Code_1.0.0_x64-setup.exe` below and run it.
- **CLI**: `git clone` + `npm install && npm run build`, then `node dist/cli.js`.

## Verify

- 98 automated tests across 13 suites
- Behavioral evals live-verified (3/3) against NVIDIA NIM
- Headless mode + bundled-sidecar desktop app live-verified end to end

Full docs in the repo: docs/SPEC.md (architecture), docs/PLAN.md (P0–P26 board).
