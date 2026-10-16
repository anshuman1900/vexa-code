# Vexa Code

> Clean, simple, feature-rich coding agent for your terminal. **Any model. Any provider.**

A from-scratch, open-source coding agent in the spirit of Claude Code — built on the
OpenAI-compatible protocol, so it works with **OpenRouter, Groq, DeepSeek, Together,
Ollama, LM Studio, Gemini's compat endpoint, and any other provider** that speaks it.

## Status 🚧

Early development — research & architecture phase. See the full roadmap in
[docs/PLAN.md](docs/PLAN.md) (26 phases across 7 stages).

| Milestone | Target |
|---|---|
| First usable CLI agent (tools + agent loop) | End of Stage II (P9) |
| Claude-parity features (MCP, subagents, permissions…) | Stage III (P16) |
| Desktop GUI (Tauri) | Stage V |
| v1.0 | P26 |

## Design principles

- **Clean & simple CLI** — plain readline + ANSI, no heavy TUI frameworks
- **Any provider, any key** — one OpenAI-compatible client covers everything
- **Own your data** — everything runs locally; your API keys stay in `~/.vexa/`
- **Transparent** — approvals for risky actions, plan mode, diffs before edits

## Tech

TypeScript + Node.js. Desktop app later via Tauri.

## License

MIT — see [LICENSE](LICENSE).
