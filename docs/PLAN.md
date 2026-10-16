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
- [x] P0.1 GitHub harvest — ✅ DONE (3 repos, 2 prompt generations, 16 tool schemas, 1,884-file deobfuscated source)
- [x] P0.2 source study — ✅ DONE (4 docs: agent loop/provider, tools/permissions/hooks, context/MCP/extensibility + P0.1 harvest; all cited to source)
- [x] P0.3 Spec doc — ✅ DONE (docs/SPEC.md: 640 lines, architecture + P1–P26 specs + OpenAI adaptation table + data structures + prompt plan + open decisions)
- [x] P0.4 Eval corpus — ✅ DONE (46 items, 12 categories, ★ hard gates; docs/research/P0.4-eval-corpus.md)
