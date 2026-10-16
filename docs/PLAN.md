# Vexa Code — Project Plan

> A from-scratch, Claude-Code-grade coding agent. Clean & simple CLI first, desktop GUI later.
> Works with **any OpenAI-compatible provider + API key** (OpenRouter, Groq, DeepSeek, Ollama, Together, Gemini-compat…).

## Locked decisions
- **100% from scratch** (no forks)
- **CLI first**, Tauri desktop app later (Stages V)
- **OpenAI-compatible protocol only** for the provider layer
- **TypeScript + Node** (26.7), lightweight ANSI terminal UI (no heavy TUI frameworks — low-end PC)
- CLI binary: `vexa` — clean, simple, feature-rich
- Research sources: public leak repos (GitHub) + REA MCP dynamic analysis of real Claude Code for verification/gap-filling
- No wholesale copying of Anthropic proprietary code; learn architecture, build clean

## Stage 0 — Intelligence (research only)
- **P0.1 GitHub harvest** — pull `x1xhlol/system-prompts-and-models-of-ai-tools` (Claude Code system prompts + Tools.json + settings examples); scan GitHub for deobfuscated bundles, deep-dives, claude-code-router internals
- **P0.2 Verify + fill gaps with REA** — download current Claude Code CLI → static analysis of cli.js → confirm current prompts/schemas, extract what leaks miss; dynamic network capture for wire protocol
- **P0.3 Spec doc** — full feature matrix with exact behaviors (tools, permissions, MCP, subagents, todos, plan mode, memory, hooks, skills, headless)
- **P0.4 Eval corpus** — 30–50 test prompts to compare Vexa vs Claude behavior

## Stage I — Foundation (P1–P4)
- **P1 Skeleton** — TS + Node project, config system (`~/.vexa/config.json`), provider profiles, API key handling
- **P2 Provider layer** — OpenAI-compatible client: SSE streaming, tool-call parsing, retries/backoff, `/model` switching, token usage, local-model profiles (Ollama/LM Studio)
- **P3 Terminal UI** — streaming markdown, diffs, spinners; plain readline + ANSI; clean & simple
- **P4 Conversation engine** — history persistence, `/continue` resume, context-window tracker

## Stage II — Tools & Agent Core (P5–P9) → first usable agent
- **P5** Read tools: `read_file`, `glob`, `grep`, `ls`
- **P6** Write tools: `write_file`, fuzzy-replace `edit`, diff preview
- **P7** Bash tool: timeouts, output truncation, background procs, Windows/MSYS quirks handled
- **P8** Agent loop: parallel tool calls, max-iterations, error recovery
- **P9** System prompt v1 — assembled from verified P0 sources + `VEXA.md` project-context files (hierarchical)

## Stage III — Claude Parity (P10–P16)
- **P10** Permissions: approval prompts, allow/deny rules, 4 modes (normal / auto-accept / plan / bypass)
- **P11** MCP client (stdio + SSE), `.mcp.json`
- **P12** Todo tool + plan mode with exit-approval
- **P13** Subagents: Task tool, isolated contexts, parallel runs
- **P14** Auto-compaction near context limit, `/compact`
- **P15** Memory, skills, custom slash commands, pre/post-tool hooks
- **P16** Web search/fetch tool, checkpoint & rollback of file edits

## Stage IV — Power (P17–P20)
- **P17** Headless mode (`-p`, JSON output) for scripting/cron
- **P18** Multi-session picker + transcripts
- **P19** Evals — run P0.4 corpus, tune until behavior ≈ Claude
- **P20** Performance/low-power pass

## Stage V — Desktop GUI (P21–P24)
- **P21–24** Tauri app: chat UI → file explorer + diffs → settings/MCP manager → portable exe

## Stage VI — Release (P25–P26)
- **P25** Hardening (interrupts, malformed responses, provider failures)
- **P26** Docs + v1.0

## Status
- [x] Plan locked (2026-10-16)
- [x] Stage 0 complete (P0.1–P0.4)
- [x] P1 Skeleton & config — ✅ DONE (all acceptance criteria verified: help 161ms, clear config errors, alias/sentinel resolution)
- [x] P1.5 Providers UX — ✅ DONE (14 built-in presets incl. free tiers + local; `vexa providers list/add/set-key/test/remove`; keys in 0600 auth.json or env; custom endpoints one command)
- [x] P2 Provider layer — ✅ DONE (chat/completions client: SSE accumulation w/ fragmented tool-calls, wire A1/A6/A7/A19, retry 10×/500ms·2^n cap 32s, 3-strike overload, non-stream fallback A14, usage; 7/7 mock tests + REAL NVIDIA NIM streaming & tool-call verified)
- [x] P3 Terminal UI — ✅ DONE (Claude-Code-style REPL: banner, ⏺/⎿ grammar, spinner verbs, slash commands, Shift+Tab modes, Esc interrupt, sequential input queue; real streamed turn verified)
- [x] P4 Conversation engine — ✅ DONE (JSONL transcripts w/ fsync-before-API, kill -9 crash recovery PROVEN (BANANA42 test), /resume + --resume, context tracker + warning banner)
- [x] P5 Read tools — ✅ DONE (Read/Glob/Grep/LS + registry; 9/9 tests; Read limits verified: 256KB throw, 2k-char truncation, mtime Glob order)
- [x] P6 Write & Edit tools — ✅ DONE (must-Read-first, atomic tmp+rename, curly-quote normalization + preserveQuoteStyle, no-op/self-substring guards, replace_all, structured patches; 8/8 tests)
- [x] P7 Bash tool — ✅ DONE (120s/600s timeouts, 30k middle-truncation, background shells + BashOutput/KillShell, 15s auto-background, sleep refusal; 9/9 tests)
- [x] P8 Agent loop — ✅ DONE (while(true) state machine: parallel batching ≤10, permission engine hooks + y/n dialog + plan-mode read-only enforcement, orphan prevention A7, length ladder A13, max-turns; REAL end-to-end agent task verified on live model — Read tool → answer; 6/6 tests)
- [x] P9 System prompt + VEXA.md — ✅ DONE (15-section assembly w/ byte-stable static prefix, hierarchical VEXA.md loader w/ @include + rules + provenance, /init; Glob .gitignore-aware walk fix; 7/7 tests; **STAGE I COMPLETE — full suite 46/46**)
- [x] P10 Permissions engine — ✅ DONE (rules Tool/Tool(content)/Bash(npm:*)/Edit(src/**) — word-boundary prefixes, segment-anchored globstars; evaluation deny>ask>allow>mode [TP 5.3]; /permissions viewer; rules from config tiers)
- [x] P12 Todos + plan mode — ✅ DONE (TodoWrite single-in_progress rule + ✅/▸/☐ rendering + per-turn system-reminder injection [P0.1 C2]; ExitPlanMode w/ approval dialog, plan mode denies non-read-only)
- [x] P14 Compaction — ✅ DONE (REVERSE-ENGINEERED 9-section summarizer + constants [CX 1.1-1.3]: trigger effective−13000, circuit breaker 3, tool-less fork A8, analysis strip, isCompactSummary re-injection; /compact [instructions]; autocompact wired into agent loop)
- [x] P11 MCP client — ✅ DONE (stdio JSON-RPC client, initialize/tools/list/tools/call, mcp__server__tool bridge w/ fail-closed + ask-by-default, .mcp.json approval gating + user auto-approve, /mcp status; 4/4 tests; http/sse transport + OAuth deferred v1.1 [OD4])
- [x] P16-lite WebFetch — ✅ DONE (fetch + HTML→text + entity decode + 15min cache + cross-host redirect protocol; 3/3 live tests; WebSearch (Tavily/Brave) + checkpoints deferred)
- [x] P13 Subagents — ✅ DONE (Task tool: general-purpose + Explore types w/ distinct prompts + scoped allowlists, isolated messages/readFileState, parallel-safe, report-as-result; 3/3 tests; bg agents + custom agent files deferred v1.1 [OD9])
- [x] P15 Memory/skills/hooks — ✅ DONE (auto-memory dir keyed by git root + MEMORY.md always-loaded w/ caps; SKILL.md two-level loading + prompt section 13; custom slash commands .vexa/commands/*.md w/ $ARGUMENTS; hooks PreToolUse/PostToolUse/UserPromptSubmit/SessionStart/Stop — exit-2 block + JSON decision contract; 6/6 tests)
- [x] P16 WebSearch+checkpoints — ✅ DONE (WebSearch tool: Tavily POST + Brave GET, domain filters, disabled until config+key; checkpoints: shadow-copy checkpointer w/ JSONL manifest, Edit/Write call ctx.checkpoint(prior), /rewind [n|list], reset on /clear+/resume; 3/3 tests)
- [x] P17 Headless — ✅ DONE (`vexa -p "prompt"`: full toolset+Task, VEXA.md/memory/skills in prompt, transcript persisted, read-only auto-allow/writes denied, stdin prompt, VEXA_OUTPUT_FORMAT=json result envelope, exit codes 0/1/2; LIVE-VERIFIED: HEADLESS_OK roundtrip + Read(package.json)→"vexa-code")
- [x] P18 Sessions picker — ✅ DONE (/sessions: numbered listing id/time/msgs/first-prompt preview; /sessions <n> resumes in place; sessionSummaries() data layer; 3/3 tests)
- [x] P19 Evals — ✅ DONE (evals/ harness: sandbox cases + expect assertions, pure scoreEval, results.json; 3 seed cases LIVE-VERIFIED 3/3 on nemotron-3-super; `node evals/run.mjs --model <ref>`)
- [x] P20 Perf — ✅ DONE (lazy entrypoint imports: --help 330→223ms; baselines: REPL boot ~530ms, headless model-bound; 13/13 suites still green)
- [x] P21 Tauri shell — ✅ DONE (gui/: Vite+vanilla-TS frontend 4.8KB + Tauri v2 Rust shell; sidecar bridge spawns `node dist/cli.js --gui` w/ line-JSON over IPC Channel; streaming + permission bar; cargo build PASS, LIVE window running @26MB; commit 9d53acb)
- [~] Stage V remaining: P22 chat UI polish → P23 tool rendering → P24 packaging
- [ ] Stage VI: P25 hardening → P26 v1.0 release
- [x] P0.1 GitHub harvest — ✅ DONE (3 repos, 2 prompt generations, 16 tool schemas, 1,884-file deobfuscated source)
- [x] P0.2 source study — ✅ DONE (4 docs: agent loop/provider, tools/permissions/hooks, context/MCP/extensibility + P0.1 harvest; all cited to source)
- [x] P0.3 Spec doc — ✅ DONE (docs/SPEC.md: 640 lines, architecture + P1–P26 specs + OpenAI adaptation table + data structures + prompt plan + open decisions)
- [x] P0.4 Eval corpus — ✅ DONE (46 items, 12 categories, ★ hard gates; docs/research/P0.4-eval-corpus.md)
