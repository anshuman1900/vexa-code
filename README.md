# Vexa Code

**A free, open Claude Code–style coding agent for your terminal and desktop. Any model. Any provider. Zero runtime dependencies.**

Vexa Code is built from scratch in TypeScript (CLI) + Rust/Tauri (desktop) — the architecture, tools, and workflows are modeled on the publicly documented behavior of Claude Code, re-implemented on the OpenAI-compatible chat-completions protocol so it works with **OpenRouter, Groq, DeepSeek, Together, NVIDIA NIM, Ollama, LM Studio, vLLM, Gemini's compat endpoint, and any other provider** that speaks it.

```
✻ Welcome to Vexa Code!
   a coding agent for your terminal — any model, any provider
```

## Install

### Desktop app (Windows)
Download `Vexa Code_1.0.0_x64-setup.exe` from [Releases](https://github.com/anshuman1900/vexa-code/releases) and run it. Node.js is bundled — nothing else to install.

### CLI (from source)
```bash
git clone https://github.com/anshuman1900/vexa-code
cd vexa-code && npm install && npm run build
node dist/cli.js --help
```

## Quick start (CLI)

```bash
# configure a provider once (keys are never stored in config.json)
vexa providers list
vexa providers add nvidia --base-url https://integrate.api.nvidia.com/v1 --model nvidia/nemotron-3-super-120b-a12b
echo <key> | vexa providers set-key nvidia     # or set the env var you named

vexa --model nvidia                            # interactive REPL
vexa -p "summarize the TODOs"                  # headless one-shot
VEXA_OUTPUT_FORMAT=json vexa -p "..."          # machine-readable
```

Inside the REPL: `/help` — highlights: `/sessions`, `/rewind`, `/model`, `/mcp`, `/compact`, plan mode (Shift+Tab).

## What's inside

- **Agent loop** — multi-turn tool use, parallel tool batching, retry/backoff with overload fallback, length-escalation recovery
- **12+ tools** — Read/Write/Edit (must-Read-first, atomic, quote-normalizing), Glob/Grep/LS, Bash (timeouts + background shells), WebFetch/WebSearch, TodoWrite, plan mode, Task subagents
- **Permissions** — deny/ask/allow rules (`Bash(npm:*)`, `Edit(src/**)`), modes (default / acceptEdits / plan / bypass)
- **MCP client** — stdio servers via `.mcp.json`, approval-gated
- **Memory & skills** — auto-memory (`MEMORY.md` always in context), SKILL.md two-level loading, custom slash commands
- **Hooks** — PreToolUse/PostToolUse/UserPromptSubmit/SessionStart/Stop (exit-2 block + JSON contract)
- **Checkpoints** — every Edit/Write shadow-copies prior content; `/rewind` restores
- **Sessions** — JSONL transcripts, fsync-before-API, kill-proof recovery, `/resume`, `/sessions` picker
- **Compaction** — auto + manual, 9-section summarizer
- **Evals** — `node evals/run.mjs --model <profile>` behavioral regression suite
- **Desktop** — Tauri v2 app: streaming markdown, tool cards with diffs, permission prompts, bundled Node sidecar (26MB installer)

## GUI development

```bash
cd gui
node scripts/sync-resources.mjs   # bundle CLI + stage node.exe
npx tauri build                   # release + NSIS installer
# dev: npm run build (frontend) then cargo build in src-tauri
```

Sidecar env: `VEXA_GUI_NODE`, `VEXA_GUI_ENTRY`, `VEXA_GUI_MODEL`, `VEXA_GUI_CWD`.

## Security model

- API keys live in `~/.vexa/auth.json` (0600) or env vars — never in `config.json`, never printed
- Tool permissions default to ask; write tools require approval in default mode
- The system prompt assists with defensive security tasks only

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — full architecture + phase specs
- [`docs/PLAN.md`](docs/PLAN.md) — build board (P0–P26)
- [`docs/research/`](docs/research/) — reverse-engineering notes (cited to source)

## Status

**v1.0.0** — 98 automated tests across 13 suites, live-verified against NVIDIA NIM.

## License

MIT — see [LICENSE](LICENSE).
