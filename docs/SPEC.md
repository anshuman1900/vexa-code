# Vexa Code — Build Specification v1 (P0.3)

> Complete build spec for Vexa Code v1: a from-scratch, Claude-Code-grade coding agent CLI that speaks the **OpenAI-compatible protocol only** (chat/completions + tools). TypeScript + Node 26.7, plain readline + ANSI UI, binary `vexa`.
>
> An engineer should be able to implement from this document alone. Where a behavior is not pinned by the research docs it is marked **OPEN DECISION** with a recommended default.

**Citation keys** (all under `docs/research/` unless noted):
- **[P0.1]** `P0.1-github-harvest.md` — system prompts v1/v2.0, all 16 tool schemas, design patterns
- **[AL]** `p0.2-agent-loop.md` — agent loop, provider layer, retries/fallback, prompt assembly, model config
- **[TP]** `p0.2-tools-permissions.md` — tool contract, per-tool limits, Bash/Edit internals, permission engine, hooks
- **[CX]** `p0.2-context-mcp-extensibility.md` — compaction, VEXA.md/memory, MCP, skills/plugins, subagents, sessions
- **[PLAN]** `docs/PLAN.md` — phase plan P0–P26

**Status markers:** **ADAPTED** = Anthropic-specific mechanism replaced with an OpenAI-protocol equivalent (§3). **DROPPED** = omitted in v1. **OPEN DECISION** = not covered by research; recommended default given.

---

## 1. Architecture overview

### 1.1 Module layout (proposed `src/` tree)

```
vexa-code/
├── package.json              # "bin": { "vexa": "./dist/cli.js" }, "type": "module"
├── tsconfig.json             # NodeNext, strict
└── src/
    ├── cli.ts                # arg parsing, startup, REPL/bootstrap dispatch
    ├── entrypoints/
    │   ├── repl.ts           # interactive session (P3)
    │   └── headless.ts       # -p / piped stdin, JSON output (P17)
    ├── config/
    │   ├── settings.ts       # schema + merge hierarchy (§4.3)
    │   ├── profiles.ts       # provider profiles (§4.3.1)
    │   └── paths.ts          # ~/.vexa layout, project dir discovery (§2)
    ├── provider/             # OpenAI-compatible protocol layer (§3)
    │   ├── client.ts         # POST chat/completions, SSE read loop
    │   ├── stream.ts         # chunk accumulation → text deltas + tool_calls
    │   ├── wire.ts           # internal message/blocks ↔ OpenAI wire format
    │   ├── retry.ts          # backoff, overloaded policy, model fallback
    │   └── usage.ts          # token/cost accounting
    ├── engine/
    │   ├── queryEngine.ts    # per-conversation state, turn guards, budgets
    │   ├── queryLoop.ts      # the while(true) state machine (P8)
    │   ├── toolOrchestrator.ts # safe/unsafe partition, concurrency cap
    │   ├── recovery.ts       # withheld errors, output-token & overflow ladders
    │   └── contextTracker.ts # token estimation, warning states (P4)
    ├── tools/
    │   ├── types.ts          # Tool contract (§4.5)
    │   ├── registry.ts       # getAllBaseTools, MCP merge, deny filtering
    │   ├── filesystem/       # Read, Write, Edit, Glob, Grep, LS (P5–P6)
    │   ├── bash/             # Bash, BashOutput, KillShell (P7)
    │   ├── web/              # WebFetch, WebSearch (P16)
    │   ├── todo.ts           # TodoWrite (P12)
    │   ├── plan.ts           # ExitPlanMode (P12)
    │   ├── task/             # Task (subagents), TaskOutput, TaskStop (P13)
    │   └── mcpBridge.ts      # MCP tools as Tool objects (P11)
    ├── permissions/
    │   ├── engine.ts         # hasPermissionsToUseTool ordered pipeline (P10)
    │   ├── rules.ts          # rule strings parse/match (§4.4)
    │   └── modes.ts          # mode cycling, plan mode
    ├── context/
    │   ├── compaction.ts     # autocompact + /compact (P14)
    │   ├── compactPrompt.ts  # 9-section summarizer prompt
    │   ├── vexamd.ts         # VEXA.md hierarchical loader (P9)
    │   └── memory.ts         # auto-memory MEMORY.md + topic files (P15)
    ├── extensibility/
    │   ├── mcp/              # client, transports, .mcp.json (P11)
    │   ├── skills.ts         # SKILL.md loader (P15)
    │   ├── commands.ts       # custom slash commands (P15)
    │   └── hooks.ts          # hook runner + JSON contract (P15)
    ├── sessions/
    │   ├── store.ts          # mutable message store (§4.1)
    │   ├── transcript.ts     # JSONL append/read (§4.2)
    │   └── resume.ts         # /continue, --resume, crash recovery (P18)
    ├── ui/
    │   ├── repl.ts           # readline, prompt, keybindings (Shift+Tab)
    │   ├── render.ts         # streaming markdown, diffs, spinners (ANSI)
    │   └── permissionDialog.ts
    └── util/                 # fs helpers, token estimate, uuid, logger
```

Rules: `engine/` never imports `ui/`; `provider/` never imports `tools/` (engine passes a serialized request); every tool imports only `tools/types.ts` + `util/`. Feature gating is by explicit config flags, not dead-code elimination (Vexa is not minified).

### 1.2 Data flow — one user turn

```
user input
  → slash command? ── yes → local handling, may set shouldQuery=false, no model call [AL §1.2.4]
  → QueryEngine.submitMessage()
      1. persist user message to transcript BEFORE any API call        [AL §1.2.5]
      2. resolve profile+model (session /model > flag > env > settings > default) [AL §4]
      3. assemble system prompt: static prefix + dynamic sections      [§5, AL §3]
      4. queryLoop iteration:
         a. context pipeline: apply compact boundary → autocompact check [CX §1.1]
         b. provider.stream(messages, tools) — SSE chunks accumulate into
            text deltas + tool_calls; usage from final chunk           [§3]
         c. tool_calls present?
            yes → partition concurrency-safe batches                   [AL §1.3]
                  → permission engine per call (deny/ask/allow)        [P10]
                  → execute (≤10 parallel) → synthetic role:'tool' results
                    for every call (errors included)                   [AL §1.3]
                  → turn++ → loop
            no  → recovery ladder if withheld error (length / context overflow) [AL §1.5]
                  → stop hooks → result {reason:'completed'}           [AL §1.2.7]
```

### 1.3 Process model

One Node process. Background bash commands = detached child processes with output files (P7). Subagents = in-process `query()` instances with their own engine state (P13). Compaction/title summarizers = one-turn in-process forks sharing the parent's request prefix (P14, [CX §1.2]).

---

## 2. Naming & product constants

### 2.1 Names and paths

| Item | Vexa value | Maps to Claude | Source |
|---|---|---|---|
| CLI binary | `vexa` | `claude` | [PLAN] |
| User config dir | `~/.vexa/` | `~/.claude/` | [PLAN] |
| Context file | `VEXA.md` (+ `VEXA.local.md`) | `CLAUDE.md` | [PLAN] |
| Rules dirs | `~/.vexa/rules/*.md`, `.vexa/rules/**/*.md` | `~/.claude/rules/`, `.claude/rules/` | [CX §2] |
| User settings | `~/.vexa/config.json` | `~/.claude/settings.json` | [PLAN] |
| Project settings | `.vexa/settings.json` + `.vexa/settings.local.json` | `.claude/settings.json` / `.local.json` | [TP §5.5] |
| MCP config | `.mcp.json` (project root, Claude-compatible) | `.mcp.json` | **ADAPTED keep name** — MCP is a cross-tool standard |
| Skills dirs | `~/.vexa/skills/`, `.vexa/skills/`, legacy `.vexa/commands/*.md` | `~/.claude/skills/`, `.claude/skills/`, `commands/` | [CX §5.1] |
| Transcripts | `~/.vexa/projects/<sanitized-cwd>/<sessionId>.jsonl` | `~/.claude/projects/...` | [CX §7] |
| Auto-memory | `~/.vexa/projects/<sanitized-canonical-git-root>/memory/` | same shape under `~/.claude` | [CX §3] |
| Plans | `.vexa/plans/<agentId>.md` (main = `main.md`) | per-agent plan file | [CX §6] |
| Checkpoints | `~/.vexa/checkpoints/<sessionId>/` | (internal) | P16, **OPEN DECISION** |
| Env prefix | `VEXA_*` | `CLAUDE_CODE_*` | all docs |
| Sanitization | cwd path → replace `[:\\/. ]` with `-` (deterministic, reversible-enough for resume) | Claude's scheme | [CX §7] **OPEN DECISION** on exact charset |

Managed/enterprise scope (`/etc/claude-code/`, managed settings): **DROPPED v1** (no enterprise story; add later without format changes). Windows note: `~` = `%USERPROFILE%`; honor `USERPROFILE` over `HOME`.

### 2.2 Tool names

Keep Claude Code's public tool names verbatim for behavioral parity and eval comparability [P0.1 §B]: `Read, Write, Edit, Glob, Grep, LS, Bash, BashOutput, KillShell, Task, TodoWrite, WebFetch, WebSearch, ExitPlanMode, AskUserQuestion, Skill`. MCP tools stay `mcp__<server>__<tool>` [CX §4.4].
- `MultiEdit`, `NotebookEdit`: **DROPPED v1** (`Edit` takes `replace_all`; notebook support post-v1) — **OPEN DECISION**, default drop.
- `Task` (not "Agent") chosen deliberately: it is the legacy-but-universal alias [TP §2] and matches P0.1's v1 toolset.

### 2.3 Slash commands — v1 set

| Command | Phase | Behavior |
|---|---|---|
| `/help` | P3 | command list |
| `/clear` | P4 | new session, keep config |
| `/compact [instructions]` | P14 | manual compaction with optional custom instructions [CX §1.5] |
| `/continue` | P4 | resume most recent session (alias of `/resume` with no arg) |
| `/resume [id]` | P18 | session picker / resume by id |
| `/model [name\|alias]` | P2 | switch model/profile mid-session [AL §4] |
| `/cost` | P2 | cumulative usage + duration [AL §2.2] |
| `/status` | P3 | model, profile, context usage %, permissions mode, MCP state |
| `/permissions` | P10 | view/edit allow/deny/ask rules + default mode |
| `/add-dir <path>` | P10 | additional working directory [TP §5.5] |
| `/memory` | P15 | open VEXA.md files (user/project) |
| `/init` | P9 | generate a starter `VEXA.md` for the repo |
| `/mcp` | P11 | MCP server status, auth, tool counts |
| `/agents` | P13 | list built-in + custom subagents |
| `/hooks` | P15 | inspect configured hooks |
| `/config` | P1 | open/edit settings |
| `/plan` | P12 | enter plan mode (also Shift+Tab cycle) |
| `/tasks` | P7/P13 | background shells + subagents status |
| `/quit` | P3 | exit |
| custom | P15 | `.vexa/commands/*.md` markdown commands with `$ARGUMENTS` [CX §5.2] |

---

## 3. OpenAI-protocol adaptation layer (CRITICAL)

Vexa speaks **only** `POST {baseUrl}/chat/completions` with `tools`, `tool_choice`, and SSE streaming. Every Anthropic-specific mechanism from the research maps as follows. This section is normative for the whole spec.

### 3.1 Adaptation table

| # | Anthropic mechanism | Ref | Vexa v1 treatment |
|---|---|---|---|
| A1 | Top-level `system` param as sectioned string array (each entry a cached section) | [AL §3.2] | **ADAPTED** — concatenate all sections into ONE `role:'system'` message at index 0 (many providers reject multiple system messages). Section *ordering* below preserves cacheability. |
| A2 | Beta headers (`claude-code-20250219`, context-1m, tool-search, prompt-caching-scope, …) | [AL §2.2] | **DROPPED** — no beta header system. Profile `headers: {}` covers any provider-specific header need. |
| A3 | Prompt caching via `cache_control` breakpoints + `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` | [AL §3.2] | **ADAPTED** — implicit prefix caching only: (a) stable static system prefix, (b) `tools` array byte-identical across requests with built-ins as a contiguous sorted prefix [TP §2], (c) append-only message history (never reorder/rewrite old messages), (d) volatile sections (MCP instructions) last. The boundary exists in code as an ordering assertion, not a wire marker. |
| A4 | 529 `overloaded_error` → 3× consecutive → `FallbackTriggeredError` → fallback model | [AL §2.3–2.4] | **ADAPTED** — "overloaded" = HTTP 529 **or** 503, or 429 whose body code/type/message matches `overloaded|capacity|overloaded_error`. 3 consecutive overloaded errors on the primary model → switch to profile `fallbackModel` for the rest of the session, emit warning `Switched to X due to high demand for Y`, convert any already-streamed `tool_calls` to synthetic error tool results, continue [AL §2.4]. Non-foreground query sources never retry overloaded (anti-amplification). |
| A5 | `thinkingConfig` ({type:'adaptive'\|'disabled'}, budgets) | [AL §1.2] | **ADAPTED** — profile field `reasoning?: { effort?: 'minimal'\|'low'\|'medium'\|'high', exclude?: boolean }` sent as OpenAI-style `reasoning_effort` when the provider declares support in the profile; otherwise omitted entirely. No adaptive logic. |
| A6 | Thinking signatures; `stripSignatureBlocks` on model fallback | [AL §2.4] | **ADAPTED** — equivalent rule: assistant messages replayed to the API carry only `content` (text) and `tool_calls`. Any provider reasoning stream field (`reasoning_content`, `reasoning`) is captured for display only, stored in a non-rewound field, **never resent**. |
| A7 | `tool_use` + user-role `tool_result` blocks; `yieldMissingToolResultBlocks` orphan prevention | [AL §1.3], [TP §1] | **ADAPTED** — assistant message carries `tool_calls: [{id, type:'function', function:{name, arguments}}]`; each result is a separate `role:'tool'` message `{tool_call_id, content}` immediately after. Error results: `content` = `"Error: <message>"` (plus optional profile-level `toolErrorPrefix`). The no-orphan invariant is identical: abort, fallback, throw, and max-turns paths all synthesize a `role:'tool'` message for every issued `tool_call_id`. |
| A8 | Tool denial during compact (canUseTool denies all) | [CX §1.2] | **ADAPTED** — summary requests simply omit `tools` and include "Do not call any tools." in the system text; `finish_reason:'tool_calls'` on a tool-less request is a hard protocol error. |
| A9 | Raw Anthropic stream (avoid O(n²) partial JSON parse); client-side tool-input accumulation | [AL §2.2] | **ADAPTED** — OpenAI chunk format: accumulate `choices[0].delta.content` (string concat) and `delta.tool_calls[i]` keyed by `index` — concat `function.arguments` fragments, first fragment supplies `id`/`function.name`. Never JSON-parse partial arguments. |
| A10 | `stop_reason`: `tool_use` / `max_tokens` / `end_turn` | [AL §1.2, §1.5] | **ADAPTED** — `finish_reason`: `'tool_calls'` → needsFollowUp; `'stop'` → completed; `'length'` → output-token recovery ladder (§3.3). Missing `finish_reason` (some local servers) → treat as `'stop'` (**OPEN DECISION**, recommended: treat-missing-as-stop only when no tool_calls accumulated). |
| A11 | Usage events: reset `message_start`, `message_delta`, fold on `message_stop` | [AL §2.2] | **ADAPTED** — send `stream_options: {include_usage: true}`; read `usage` from the final chunk (prompt_tokens, completion_tokens, total_tokens). Providers that omit usage (some Ollama setups): estimate `chars/4` [TP §1 `BYTES_PER_TOKEN=4`] and mark `estimated: true`. Cache-hit tokens (`prompt_tokens_details.cached_tokens`) recorded when present. |
| A12 | 413 prompt-too-long + `recoverFromOverflow` / reactive compact | [AL §1.5] | **ADAPTED** — detection (no standard code): HTTP 400/413 whose body matches `context_length_exceeded|maximum context length|prompt too long|too many tokens|reduce the length`. Recovery = one-shot reactive compact (P14) → retry once → surface error. Each recovery guarded one-shot. |
| A13 | `max_tokens` context-overflow 400 auto-adjust `max(3000, ctx−input−1000)` | [AL §2.3] | **ADAPTED** — same formula against `profile.contextWindow` with estimated input tokens; `FLOOR_OUTPUT_TOKENS = 3000`. |
| A14 | Non-streaming fallback after repeated unrecoverable streaming failures | [AL §2.2] | **ADAPTED keep** — after 2 failed stream attempts (connection-level), issue one non-streaming request (`stream:false`), timeout = profile timeout. |
| A15 | Fast-mode 429/529 handling, cooldowns | [AL §2.3] | **DROPPED** v1. |
| A16 | Subscriber OAuth, API key helpers, Bedrock/Vertex/Foundry swizzle | [AL §2.1] | **DROPPED/ADAPTED** — provider profiles replace the entire swizzle: `{baseUrl, apiKeyEnv | apiKey, model, headers}`. Auth = `Authorization: Bearer <key>`. |
| A17 | Persistent unattended retry (429/529 forever, 5-min backoff cap) | [AL §2.3] | **DROPPED** v1 (retry-after is honored within the 10-retry budget; revisit for headless cron in P17 — **OPEN DECISION**). |
| A18 | Structured outputs (`MAX_STRUCTURED_OUTPUT_RETRIES=5`) | [AL §1.2] | **DROPPED** v1 (no structured-output feature). |
| A19 | Multimodal `Read` (images, PDFs, notebooks) | [P0.1 §B], [TP §2] | **ADAPTED** — images → tool-result text + attachment that the wire layer emits as `content:[{type:'image_url', image_url:{url:'data:<mime>;base64,…'}}]` on the **next user message** if the provider declares vision support, else `[image: <path>]` placeholder. PDFs/notebooks: **DROPPED** v1 — Read returns text extraction only (notebook = raw JSON; PDF = **OPEN DECISION**, recommend refusing with a clear message in v1). |
| A20 | Model aliases (`sonnet|opus|haiku`), `[1m]` context suffix, per-plan defaults, legacy remap | [AL §4] | **ADAPTED** — user-defined aliases in config (`aliases: {fast: "groq/llama-3.3-70b", …}`); no `[1m]`, no knowledge-cutoff line, no built-in defaults. Unknown model string passes through verbatim (literal-preservation rule). |
| A21 | `<env>` knowledge-cutoff line, marketing model names | [AL §3.3] | **DROPPED** — model line kept: `You are powered by the model named <label>. The exact model ID is <id>.` where label = profile `label` or the model id. |
| A22 | `ANTHROPIC_*` env vars | all | **ADAPTED** — `VEXA_*` equivalents (§4.3). |
| A23 | WebSearch backed by Anthropic server-side search | [P0.1 §B] | **ADAPTED** — client-side implementation (P16): provider-agnostic search API (Brave/Tavily) behind `webSearch.provider` config; **OPEN DECISION** on default provider. WebFetch stays client-side fetch+cache (unchanged concept). |

### 3.2 Request shape (canonical)

```jsonc
POST {baseUrl}/chat/completions
{
  "model": "<profile.model or override>",
  "messages": [
    { "role": "system", "content": "<static prefix>\n\n<dynamic sections…>" },
    { "role": "user", "content": "<userContext-prepended>\n\n<user text>" },
    { "role": "assistant", "content": "...", "tool_calls": [ … ] },
    { "role": "tool", "tool_call_id": "…", "content": "…" }
  ],
  "tools": [ { "type": "function", "function": { "name", "description", "parameters" } } ],
  "tool_choice": "auto",                    // omitted on compact/summary requests
  "max_tokens": N,                          // profile.maxTokensParam overrides name
  "temperature": 1,                         // profile field; omit if unsupported
  "stream": true,
  "stream_options": { "include_usage": true }
}
```

`parameters` comes from Zod→JSON-Schema [TP §1]. Tool JSON is regenerated only when the tool set changes (A3b). A provider profile may set `dropFields` (e.g. some servers choke on `tool_choice`).

### 3.3 Retry / fallback policy (constants preserved from [AL §2.3])

- `maxRetries = 10` (env `VEXA_MAX_RETRIES`); `BASE_DELAY_MS = 500`; delay = `min(500·2^(attempt−1), 32_000)` + jitter ≤ 25%; `retry-after` header (integer seconds) overrides backoff entirely.
- Retry on: 408, 409, 429, any ≥500, connection errors (ECONNRESET/EPIPE → rebuild client). No retry: 400 (except A12 overflow → recovery path), 401/403 (surface config error immediately), 404.
- Overloaded (A4): counter per model; `MAX_OVERLOADED_RETRIES = 3` → fallback model if profile has one; else surface "provider is overloaded" error to the user.
- Stream idle watchdog: abort if no chunk for **90 s** (warn at 45 s) [AL §2.2]; request timeout default **600 s** [AL §2.1].
- Output-token recovery (`finish_reason:'length'`) [AL §1.5]: one-shot `max_tokens` escalation (+50% up to profile cap) then up to **3** recoveries injecting a user message: "Output token limit hit. Resume directly — no apology, no repetition. Break the remaining work into smaller pieces." Then surface the error.

### 3.4 Provider profile quirk notes (defaults; refine during P2 evals)

| Provider | Notes |
|---|---|
| OpenRouter | may omit `usage` w/o `stream_options`; `:floor`/`:free` model ids pass through |
| Groq | fast, usage always present; strict tool schemas |
| DeepSeek | `reasoning_content` on reasoner models — display-only, never replay (A6); aggressive context-length 400s |
| Ollama / LM Studio | may omit `finish_reason`/`usage`; no `retry-after`; tool calls supported on recent models; `num_ctx` is caller-set — profile must declare honest `contextWindow` or autocompact math breaks |
| Together, Gemini-compat, vLLM | treat as vanilla OpenAI |

---

## 4. Data structures & files

### 4.1 Message store (in-memory, per conversation)

Provider-neutral block format; the wire layer (§3) translates to OpenAI format at request time. Shape follows the QueryEngine mutable store [AL §1.1] with a uuid/parentUuid chain [CX §7]:

```ts
type VexaMessage = {
  uuid: string;                 // uuid v4
  parentUuid: string | null;    // forms the conversation chain
  timestamp: string;            // ISO 8601
  type: 'user' | 'assistant' | 'system' | 'progress' | 'attachment';
  content: Block[];
  // assistant only:
  model?: string; provider?: string; usage?: Usage; finishReason?: string;
  stopReason?: string;
  // user only:
  isCompactSummary?: boolean;   // post-compact summary message [CX §1.2.7]
  isMeta?: boolean;             // synthetic (recovery nudges, hook context)
  toolUseResult?: unknown;      // structured result data for transcript consumers
};
type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'image'; mediaType: string; data: string }        // base64
  | { type: 'reasoning'; text: string };  // display-only, NEVER serialized to wire (A6)
```

Rules: `tool_result` blocks are internal-only — the wire layer pairs each with its `tool_use`'s `tool_call_id` (A7). `attachment` messages carry system-reminders, task notifications, hook context — serialized as plain user-role text wrapped in `<system-reminder>` tags [P0.1 §C2]. `usage = { inputTokens, outputTokens, cacheReadTokens?, totalTokens, costUsd?, estimated }`.

Engine state [AL §1.1]: `{ messages, turnCount, abortController, permissionContext, totalUsage, currentModel, profile, querySource, consecutiveOverloads }` — one explicit `State` record so every continue-site is testable [AL §Vexa implications].

### 4.2 Transcript (JSONL)

One JSON object per line in `~/.vexa/projects/<sanitized-cwd>/<sessionId>.jsonl` [CX §7]:

```jsonc
{ "type": "user" | "assistant" | "system" | "summary" | "attachment" | "sessionMeta",
  "uuid": "…", "parentUuid": "…" | null, "sessionId": "…",
  "cwd": "…", "version": "1.0.0", "gitBranch": "…",
  "timestamp": "ISO",
  "message": VexaMessage,              // full payload
  "toolUseResult": {},                 // optional structured data
  "compactMetadata": {                 // only on boundary entries [CX §1.2.6]
    "trigger": "auto" | "manual", "preCompactTokenCount": 12345,
    "preCompactDiscoveredTools": ["mcp__x__y"] }
}
```

Write discipline [AL §1.2.5, §Vexa implications]: user messages are **fsync'd before the first API call**; assistant writes are fire-and-forget through an order-preserving queue. Session metadata (title, tags) is appended as a `sessionMeta` entry and **re-appended after compaction** so the resume picker (which reads the last 16 KB of the file) always sees it [CX §1.2.8, §7]. `--continue`/`--resume` rebuilds the chain via `parentUuid`, relinking preserved-segment metadata after partial compaction [CX §1.5].

### 4.3 Settings schema

Merge order (lowest→highest): user `~/.vexa/config.json` → project `.vexa/settings.json` → local `.vexa/settings.local.json` (gitignored) → `--settings <file>` flag. Same key names at each level; arrays under `permissions` replace per-file but the loader unions across files per source tier [TP §5.5]. Model-selection priority: session `/model` > `--model` flag > `VEXA_MODEL` env > settings `model` > profile default [AL §4].

```jsonc
// ~/.vexa/config.json (user level — §4.3.1 adds providerProfiles)
{
  "model": "default",                       // alias or profile-scoped model id
  "providerProfiles": { … },                // §4.3.1
  "aliases": { "fast": "groq:llama-3.3-70b-versatile", "local": "ollama:qwen2.5-coder:14b" },
  "permissions": {
    "allow": ["Read", "Grep", "Glob", "LS"],
    "ask": ["Bash(git push:*)"],
    "deny": ["Read(.env)"],
    "defaultMode": "default",               // default | acceptEdits | plan | bypassPermissions
    "disableBypassPermissionsMode": "disable",   // optional
    "additionalDirectories": []
  },
  "hooks": { … },                           // §P15, Claude hook format [TP §6.2]
  "env": { "VEXA_MAX_OUTPUT_LENGTH": "60000" },
  "autoCompactEnabled": true,
  "webSearch": { "provider": "tavily", "apiKeyEnv": "TAVILY_API_KEY" },  // OPEN DECISION
  "summaryModel": "fast"                    // titles/summaries [AL §4 small-fast model]
}
```

```jsonc
// .vexa/settings.json (project, checked in) — same keys, typically:
{ "permissions": { "allow": ["Bash(npm:*)", "Bash(git status)", "Edit(src/**)"] },
  "hooks": { … } }
// .vexa/settings.local.json — personal overrides, gitignored by /init
```

API keys are **never stored in settings**: profiles reference env var names (`apiKeyEnv`); `/login`-style key entry writes to the OS keychain when available, else `~/.vexa/auth.json` with 0600 perms (**OPEN DECISION**, recommended keychain-first).

#### 4.3.1 Provider profiles (Vexa-specific; replaces the client swizzle [AL §2.1])

```jsonc
"providerProfiles": {
  "default": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "model": "anthropic/claude-sonnet-4.5",
    "fallbackModel": "openai/gpt-4.1",       // A4 target; optional
    "maxTokens": 16000,                        // request max_tokens
    "contextWindow": 200000,                   // drives autocompact math [CX §1.1]
    "maxTokensParam": "max_tokens",            // or "max_completion_tokens"
    "temperature": 1,
    "reasoning": null,                         // A5
    "supports": { "tools": true, "vision": true, "streamOptions": true, "reasoning": false },
    "headers": {},                             // A2 replacement
    "dropFields": [],                          // A10
    "label": "Claude Sonnet 4.5"
  }
}
```

Model reference format `profile:model` or bare alias; bare model id resolves against the default profile.

### 4.4 Permission rule format [TP §5.2]

- Rule string: `ToolName` or `ToolName(content)`; bare `Bash` / `Bash()` / `Bash(*)` = whole tool.
- Content matching: exact match, or prefix glob `Bash(npm:*)` (matches `npm …` commands), `Edit(src/**)` path glob, `Read(.env)` path rule. Parens/backslashes escaped with `\` (escape backslashes first) [TP §5.2].
- MCP: `mcp__server` or `mcp__server__*` = whole server; `mcp__server__tool` = specific [CX §4.4].
- Stored as `permissions.{allow,deny,ask}: string[]` (§4.3). Evaluated by the ordered engine in P10 (deny → ask → tool check → …) with precedence **deny > ask > allow > mode**, safety/interactive asks bypass-immune [TP §5.3].

### 4.5 Tool definition / registry interface [TP §1, mirrored 1:1]

```ts
interface ToolResult<T> { data: T; newMessages?: VexaMessage[]; }
interface ToolContext {
  abortController: AbortController;
  readFileState: FileStateCache;          // must-Read-first ledger, LRU 100 [TP §4]
  messages: VexaMessage[]; appId?: string; agentId?: string;
  getAppState(): AppState; setAppState(fn: (s: AppState) => AppState): void;
}
interface Tool<I = unknown> {
  name: string;
  description: string;                    // model-facing prompt text
  inputSchema: ZodType<I>;                // → JSON Schema for `tools` [TP §1]
  isEnabled(): boolean;
  isReadOnly: boolean;                    // default FALSE (fail-closed) [TP §1]
  isConcurrencySafe: boolean;             // default FALSE (fail-closed) [TP §1, AL §1.3]
  checkPermissions(input: I, ctx: ToolContext): 'allow' | 'ask' | { behavior: 'ask', message: string, suggestions?: string[] };
  validateInput?(input: I, ctx: ToolContext): { result: true } | { result: false, message: string };
  call(input: I, ctx: ToolContext, onProgress?: (p: string) => void): Promise<ToolResult<unknown>>;
  maxResultSizeChars?: number;            // default 50_000; Infinity for Read [TP §1]
  mapToolResultToWire?(result: ToolResult<unknown>): Block[];  // default: text
  renderToolUse?(input: I): string;       // one-line UI description [P0.1 §B]
}
```

Registry [TP §2]: single `getAllBaseTools()` source of truth → filter by deny rules **before** the model sees the list → merge MCP tools (built-ins win on name collision) → sort built-ins as a contiguous stable prefix (A3b) → serialize once, cache until the set changes.

### 4.6 Todo items [P0.1 §B]

```ts
type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string };
```

Exactly one `in_progress` at a time; completed items get ✅; `activeForm` is the present-continuous label shown in the spinner ("Running tests"). Persisted per-session under `~/.vexa/projects/<cwd>/<sessionId>-todos.json`; current state rides to the model as a `<system-reminder>` attachment each turn [P0.1 §C2].

---

## 5. System prompt plan

Assembled at first query per turn-cycle; **static prefix** and **dynamic sections** are kept in strict order for provider prefix caching (A3) [AL §3.2].

### 5.1 Section list (adapted from v1 + v2.0 prompts [P0.1 §A])

| # | Section | Static/Dynamic | Content |
|---|---|---|---|
| 1 | Identity & security | static | "You are Vexa Code, an agentic coding CLI…" (adapted, no Claude/Anthropic references), defensive-security clause: refuse malicious code (credential harvesting, destructive payloads), v2.0 professional-objectivity clause — accuracy over agreement, disagree when the user is wrong [P0.1 §A] |
| 2 | Tone & style | static | concise by default (<4 lines), no preamble/postamble, no emojis, no moralizing refusals, `file:line` references, few-shot verbosity calibration examples [P0.1 §A/C5] |
| 3 | Doing tasks | static | todo discipline (TodoWrite before non-trivial tasks, one in_progress, mark complete immediately), verify work before claiming done, don't re-do user-approved work |
| 4 | Following conventions & code style | static | match existing style, no comments unless asked, no unnecessary refactors, prefer edits over rewrites |
| 5 | Tool usage policy | dynamic (tool set) | batch independent calls in one message (parallel batching [P0.1 §C3]), use Task for broad search, prefer Grep/Glob over Bash find/cat, must Read before Edit/Write, never re-Read unchanged files |
| 6 | — dynamic boundary — | (code assertion) | everything below may change mid-session (A3) |
| 7 | Using-your-tools | dynamic | generated from the *enabled* tool name set each session [AL §3.2] |
| 8 | Env block | dynamic | `<env>` per turn: Working directory, Is git repo (+branch), Platform, OS version, Today's date, model line (A21), permission mode |
| 9 | VEXA.md contents | dynamic (session) | loaded files with provenance labels + "These instructions OVERRIDE any default behavior…" preamble [CX §2.94] — see §5.2 |
| 10 | Memory | dynamic | auto-memory mechanics: directory path (pre-created — "do not run mkdir"), MEMORY.md index + topic files, 4-type taxonomy (user/feedback/project/reference), do-not-save list [CX §3] |
| 11 | Language | dynamic | respond in the user's language |
| 12 | Output style | dynamic | only if user configured one |
| 13 | Skills listing | dynamic | name + one-line description + when-to-use, frontmatter-only (two-level loading) [CX §5.1] |
| 14 | MCP instructions | dynamic, LAST | per-server `instructions` under `# MCP Server Instructions` [CX §4.4, AL §3.2] — deliberately most-volatile |
| 15 | Append | dynamic | user `appendSystemPrompt` config, verbatim |

Not carried over from Claude: ant-only sections (numeric length anchors, KAIROS, undercover mode), scratchpad, FRC, token-budget section, proactive-mode prompt, CLAUDE_CODE_SIMPLE one-liner mode (keep `--bare` as a *thin* prompt later — **OPEN DECISION** v1: omit).

### 5.2 VEXA.md loading (full pipeline from [CX §2])

1. Order (later = higher priority): user `~/.vexa/VEXA.md` + `~/.vexa/rules/*.md` → project walk root→cwd collecting `VEXA.md`, `.vexa/VEXA.md`, `.vexa/rules/**/*.md` → `VEXA.local.md` per dir. (Managed scope dropped, §2.1.)
2. `@include` directive: `@path`/`@./rel`/`@~/abs`; depth ≤ 5; only from leaf text nodes (never inside code fences); text-extension allowlist (md/txt/json/yaml/ts/js/py/go/rs/java/c/cpp/sh/…); included files emitted after the including file; missing includes silently ignored; external-to-cwd includes require one-time user approval.
3. Strip block-level HTML comments (preserve code fences/spans).
4. `.vexa/rules/*.md` frontmatter `paths:` globs → conditional rules loaded lazily when a touched file matches.
5. Per-file > 40 000 chars → warn (`MAX_MEMORY_CHARACTER_COUNT`) [CX §2].
6. Injection format (§5.1 #9): per file, `Contents of <path> (project instructions, checked into the codebase | user's private project instructions | user's private global instructions):` + content.
7. Cache invalidation: memoized per session; `/memory` edits + compaction clear the cache and re-fire the InstructionsLoaded hook.

### 5.3 Compaction summarizer prompt (P14) [CX §1.3]

Preamble/trailer: explicit "Tool calls will be REJECTED and will waste your only turn" (A8). Body asks for an `<analysis>` scratchpad then `<summary>` with the **9 fixed sections**: 1 Primary Request and Intent · 2 Key Technical Concepts · 3 Files and Code Sections (with snippets) · 4 Errors and fixes (with user feedback) · 5 Problem Solving · 6 All user messages (critical) · 7 Pending Tasks · 8 Current Work · 9 Optional Next Step (verbatim quotes). Strip `<analysis>` before injection; custom `/compact <args>` appended as "Additional Instructions:". Re-injected as a `isCompactSummary` user message: continuation preamble + summary + "read the full transcript at: <path>" + "Resume directly — do not acknowledge the summary."

### 5.4 Other sub-prompts

- **Session title** (P18): one-turn fork, `summaryModel`, "Write a 3–6 word title for this conversation. Output only the title." 
- **VEXA.md bootstrap** (`/init`): ask the model to interview the repo (build cmds, structure, conventions) and write a concise VEXA.md [P0.1 §B Piebald CLAUDE.md-creation pattern].
- **Subagent prompts** (P13): general-purpose + Explore, each a distinct prompt file, not the main prompt [P0.1 §C6].
- **Permission ask message** (P10): explain *why* (rule source / tool reason / subcommand list) [TP §5.6].

---

## 6. Phase specs P1–P26

Each phase lists: behaviors to implement, verified constants (cited), and acceptance criteria. Phase order and grouping follow [PLAN].

### Stage I — Foundation

#### P1 — Skeleton & config
- Package `vexa-code`, bin `vexa`, ESM TS, strict mode; `src/` per §1.1.
- `~/.vexa/` created on first run: `config.json`, `projects/`, `skills/`, `auth.json` (opt). Project: `.vexa/`, `.mcp.json` discovery.
- Settings loader: schema-validated, merge order §4.3, env expansion in string values (`${VAR}`) [CX §4.1 envExpansion analog].
- Provider profiles §4.3.1; key resolution: `apiKeyEnv` env var → error with setup instructions if missing. No key ever logged.
- CLI flags: `--model`, `--settings`, `--add-dir`, `--max-turns`, `--version`, `--help`, `-p` (stub until P17).
- **Accept:** `vexa --help` < 500 ms; invalid config → clear error naming file+path.

#### P2 — Provider layer
- `chat/completions` client per §3: SSE streaming, chunk accumulation (A9), wire translation (A1/A7), usage (A11).
- Retry/fallback per §3.3: 10 retries, 500 ms·2^n cap 32 s, jitter ≤25%, `retry-after` override, idle watchdog 90 s, request timeout 600 s, non-streaming fallback after 2 stream failures (A14).
- Overloaded detection + 3-strike fallback to `fallbackModel` (A4) with tombstoned tool calls.
- `/model` switching mid-session (§4.3 priority), `/cost` output, usage folded per request.
- max_tokens context-overflow auto-adjust: `max(3000, contextWindow − estInput − 1000)` (A13).
- **Accept:** against a mock SSE server + one real provider: streamed text, multi-tool-call accumulation (3 simultaneous calls with fragmented `arguments`), usage accounting, retry-on-500 with exponential timing verified.

#### P3 — Terminal UI
- readline + ANSI only (no Ink/TUI framework — low-end PC mandate [PLAN]).
- Streaming markdown (headings/bold/code fences), syntax-dimmed diffs, spinner with `activeForm` label, tool-use line rendering via `renderToolUse`.
- Permission dialog (P10 shape): options, rule suggestions ("Always allow Bash(npm:*)") as one-click persists [TP §5.6].
- Shift+Tab mode cycle: default → acceptEdits → plan → bypassPermissions → default [TP §5.4].
- **Accept:** renders 60-col and 120-col terminals without wrap artifacts; Esc cancels current stream.

#### P4 — Conversation engine
- Message store §4.1, transcript JSONL §4.2 (user msgs fsync'd pre-API-call).
- Context tracker: token estimate = last real usage + `chars/4` for newer messages [CX §1.1 tokenCountWithEstimation analog]; warning states: `percentLeft` vs trigger; warning banner at `trigger − 20 000` [CX §1.1].
- `/clear`, `/continue`, `--resume <id>`; crash recovery = transcript tail scan on startup.
- **Accept:** kill -9 mid-turn → resume shows full history incl. the un-answered user message.

### Stage II — Tools & agent core

#### P5 — Read tools
- **Read** [P0.1 §B, TP §2]: params `file_path, offset, limit, pages(dropped)`. Defaults: 2000 lines; line-numbered `cat -n` format; file > 256 KB → throw (not truncate) [TP §2]; output > 25 000 tokens → throw [TP §2]; images → image block (A19). `maxResultSizeChars = Infinity` (never persisted-to-disk) [TP §1]. Registers into `readFileState` (LRU 100, mtime-floored) [TP §4].
- **Glob**: pattern + optional path; results **sorted by mtime** [P0.1 §B].
- **Grep**: ripgrep wrapper — output modes `content|files_with_matches|count`, `-A/-B/-C`, `head_limit`, `multiline` [P0.1 §B]. rg missing → bundled fallback or error with install hint.
- **LS**: directory listing, ignore-File-aware.
- All four: `isReadOnly=true, isConcurrencySafe=true`.
- **Accept:** Read on 300 KB file throws with size message; Edit-after-Read pipeline works; Glob mtime order unit-tested.

#### P6 — Write & Edit tools
- **Write**: create/overwrite whole file; **must-Read-first if file exists** (error otherwise) [TP §2]; writes via tmp+rename (atomic; P25 hardening).
- **Edit**: `file_path, old_string, new_string, replace_all`. Matching chain [TP §4]: exact `includes` → retry with curly→straight quote normalization → de-sanitization table; `preserveQuoteStyle` re-applies file's quote style to `new_string`; trailing-newline rule for deletions; function-replacement (no `$` semantics).
- Multi-edit guard (even single calls): throw `String not found in file` if no change; throw if `old_string` is a substring of any applied `new_string` [TP §4].
- Diff preview (display-only, `structuredPatch`) with 4 context lines [TP §4]; user approves per permission engine.
- `isConcurrencySafe=false` (serial, contextModifier = readFileState update).
- **Accept:** golden tests for curly-quote fallback, self-substring rejection, no-op rejection, CRLF files.

#### P7 — Bash tool (+ Windows)
- Params: `command, timeout(ms), run_in_background` [TP §3].
- Timeouts: **default 120 000 ms, max 600 000 ms**; env `VEXA_BASH_DEFAULT_TIMEOUT_MS` / `VEXA_BASH_MAX_TIMEOUT_MS`; max floored at default [TP §3].
- Output cap: **30 000 chars** default, env `VEXA_MAX_OUTPUT_LENGTH` bounded to **150 000** [TP §3]; cap middle-truncates with notice.
- `run_in_background: true` → detached process, output file, returns shell id; retrieval via **BashOutput**, kill via **KillShell** (first-class pair [P0.1 §C7]).
- Blocking budget: foreground commands exceeding **15 000 ms** are auto-moved to background with notification; foreground `sleep` refused with advice [TP §3].
- Windows/MSYS (this repo's host): shell resolution order = bash.exe (Git/MSYS) → pwsh → cmd; MSYS-path arguments translated for native tools; document quirks in tool prompt. Shell snapshot (env/aliases restore): **DROPPED v1** — fresh env per command from a login-shell probe (**OPEN DECISION**).
- Permission side: per-command rule matching against parsed command list; injection-prone constructs (command substitution, redirections to sensitive paths) force `ask` [TP §3].
- **Accept:** 120 s default enforced; bg task survives 2 min then BashOutput returns output; `npm:*` rule matches `npm test` but not `npmx`.

#### P8 — Agent loop
- `while(true)` queryLoop with explicit State record [AL §Vexa implications]; turn = model-call → tools cycle; `--max-turns` default **OPEN DECISION** (recommend 200 interactive, 50 headless; Claude uses maxTurns config [AL §1.4]).
- Partition [AL §1.3]: consecutive `isConcurrencySafe` tools batch → `all(…, maxConcurrency = env VEXA_MAX_TOOL_USE_CONCURRENCY || 10)`; any non-safe tool = serial single batch; context modifiers applied in block order after parallel batches.
- Orphan prevention (A7): synthetic error `role:'tool'` for every incomplete call on abort/fallback/throw/max-turns — centralized helper.
- Recovery ladder [AL §1.5]: withhold recoverable errors from caller until decided — `length` → §3.3 ladder; context-overflow → one-shot reactive compact (P14) → surface; stop hooks skipped on API-error messages (no death spirals).
- Abort: Esc aborts stream/tools, synthesizes tool results, loop exits `aborted`.
- **Accept:** unit tests: 10-safe-batch concurrency cap; orphan synthesis on injected abort; length-ladder fires ≤3 nudges then errors.

#### P9 — System prompt v1 + VEXA.md
- Assembler §5.1 (15 sections, boundary assertion), env block per turn, `appendSystemPrompt`.
- VEXA.md loader §5.2 (order, @include depth 5, HTML-comment strip, 40 k warn, conditional rules, provenance labels).
- `/init` bootstrap sub-prompt (§5.4).
- **Accept:** snapshot test of assembled prompt for a fixture repo (VEXA.md + rules + include); prompt-cache order assertion (static prefix byte-stable across two turns).

### Stage III — Claude parity

#### P10 — Permissions
- Modes: `default | acceptEdits | plan | bypassPermissions` (auto/dontAsk deferred to P17 headless semantics). acceptEdits auto-accepts Edit/Write inside working dirs (implemented in tool `checkPermissions`) [TP §5.4].
- Evaluation pipeline **in order** [TP §5.3]: 1a whole-tool deny → 1b whole-tool ask → 1c tool.checkPermissions → 1d tool deny → 1e requiresUserInteraction ask → 1f content-specific ask (bypass-immune) → 1g safetyCheck ask (`.git/`, `.vexa/`, shell configs; bypass-immune) → 2a bypass/plan mode → 2b whole-tool allow → 3 passthrough→ask. Precedence: **deny > ask > allow > mode**.
- Rule strings §4.4; sources: user/project/local/flag/cliArg, `syncPermissionRulesFromDisk` full-replace semantics [TP §5.5]; `/permissions` editor; `--add-dir` additional directories.
- Ask dialog carries suggestions; accepting persists `PermissionUpdate` (addRules) to the source file it came from [TP §5.6].
- Denial tracking per turn (feeds P17 headless).
- **Accept:** pipeline table-driven tests covering all 10 steps; bypass mode still asks for `.git/` writes.

#### P11 — MCP client
- Transports: **stdio** + **http (streamable)** + sse (legacy) [CX §4.2–4.3]. Config: `.mcp.json` (project, requires one-time user approval per server [CX §4.1]) + user config `mcpServers` + `--mcp-config` (dynamic). Merge: user < approved-project < local; enterprise scope dropped.
- Naming `mcp__<server>__<tool>`; permission rules match FQ name + server wildcard [CX §4.4].
- Tools merged into registry (built-ins win); server `instructions` → system section (§5.1 #14); re-announced after compaction [CX §1.4].
- Connection states: connected/failed/pending/disabled; `needs-auth` state + 15-min cache so startup isn't re-prompted [CX §4.3]. OAuth/PKCE: **DROPPED v1** (env/header auth only) — **OPEN DECISION** to add v1.1.
- Late connection: refresh tool list mid-session (loop step [AL §1.2.6]).
- **Accept:** stdio echo-server test: discover → call → tool result; unapproved project server never starts.

#### P12 — Todo tool + plan mode
- TodoWrite §4.6; state re-injected as system-reminder attachment each turn [P0.1 §C2].
- Plan mode: read-only restriction (Read/Glob/Grep/LS/Task read-only set + plan tools), plan file `.vexa/plans/main.md`; **ExitPlanMode** tool presents plan → user approval → mode exits to default (or retains bypass if available) [TP §5.4]; plan file re-attached post-compaction [CX §1.4].
- **Accept:** plan mode blocks Edit; exiting without approval impossible.

#### P13 — Subagents (Task tool)
- `Task(description, prompt, subagent_type, run_in_background?)`; built-ins v1: `general-purpose`, `Explore` [CX §6]. Custom agents from `.vexa/agents/*.md` (frontmatter: tools allowlist, model) — **OPEN DECISION** format, mirror skills.
- Isolation [CX §6]: own agentId, message list, readFileState, permission context, invoked-skills set; tool set = parent minus Task/AskUserQuestion/background-mgmt [TP §2 ALL_AGENT_DISALLOWED_TOOLS analog].
- Parallel spawns; `run_in_background` → task record `{type:'local_agent', status, description, retrieved}` [CX §6]; completion injects `task-notification` attachment; results retrieved explicitly; compaction re-announces unfinished/unretrieved agents as `task_status` to prevent duplicate spawns.
- Subagent transcripts: `<sessionId>-sub-<agentId>.jsonl`; distinct subagent prompts (§5.4).
- **Accept:** two parallel Tasks complete without interleaved state leakage; bg agent survives parent compaction.

#### P14 — Compaction
- Autocompact [CX §1.1]: effectiveWindow = `contextWindow − min(maxOutputTokens, 20 000)`; **trigger = effective − 13 000**; warning = trigger − 20 000; manual-/compact blocking limit = effective − 3 000; env `VEXA_AUTOCOMPACT_WINDOW` clamp, `VEXA_AUTOCOMPACT_PCT_OVERRIDE` (test), `VEXA_DISABLE_AUTO_COMPACT`, `VEXA_DISABLE_COMPACT`; config `autoCompactEnabled`. Never auto-compact for querySource `compact`/`session_memory`. Circuit breaker: **3 consecutive failures** → stop trying that session [CX §1.1].
- Pipeline [CX §1.2]: PreCompact hooks (trigger auto|manual, merge instructions) → summarizer request (A8 tool-less; forked one-turn agent sharing parent prefix for provider cache reuse; fallback bare summarizer with images stripped) → PTL retry ≤ 3 dropping oldest API-round groups (fallback 20%) → success: snapshot+**clear readFileState**, keep sent-skill list → boundary message with `compactMetadata.preCompactDiscoveredTools` → summary as `isCompactSummary` user message (§5.3) → SessionStart hooks (source 'compact') → PostCompact hooks → re-append sessionMeta.
- Post-compact restore budgets [CX §1.4]: **5** most-recent read files (dedup vs preserved tail), **50 000** token total, **5 000**/file; invoked skills re-injected head-truncated **5 000** each, **25 000** total; plan + plan-mode instructions re-attached; bg agents re-announced; VEXA.md-family **not** re-restored (reloaded fresh instead).
- `/compact [instructions]` manual path with same budget guards [CX §1.5].
- **Accept:** integration test: 200 k-token synthetic history → trigger fires at threshold ±2 %; post-compact context contains 9-section summary + ≤5 restored files; second failure count reaches circuit-breaker.

#### P15 — Memory, skills, custom commands, hooks
- **Auto-memory** [CX §3]: dir `~/.vexa/projects/<sanitized-canonical-git-root>/memory/` (harness pre-creates); `MEMORY.md` index ≤ **200 lines / 25 000 bytes** (always loaded, warn naming cap) + per-topic files (frontmatter name/description/type); closed taxonomy user/feedback/project/reference; exclude derivable-from-repo content.
- **Skills** [CX §5.1]: dirs `~/.vexa/skills`, `.vexa/skills` (+legacy `.vexa/commands`); format `<name>/SKILL.md`, frontmatter `name, description, allowed-tools, argument-hint, arguments, when-to-use, model, disable-model-invocation, user-invocable, hooks, paths`; two-level loading (frontmatter at startup ≈ token estimate; body on invoke); realpath dedup; gitignore respected.
- **Custom slash commands**: markdown files with `$ARGUMENTS` substitution; `allowed-tools` restricts tool set for that command's turns [CX §5.2].
- **Hooks** [TP §6]: v1 event subset — `PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, UserPromptSubmit, SessionStart, Stop, SubagentStart, SubagentStop` (full 27-event set deferred — **OPEN DECISION**). Config shape per Claude: `hooks: { <Event>: [{matcher, hooks:[{type:'command', command, timeout?}]}] }`; matcher = tool-name regex for tool events. JSON output contract [TP §6.3]: `continue, decision:'approve'|'block', reason, systemMessage, hookSpecificOutput.{permissionDecision, updatedInput, additionalContext}`; exit code 2 = block; `{async:true, asyncTimeout}` first-response protocol. Blocking PreToolUse → hook error fed back to model as attachment; additionalContext merged next turn. Hook input gets `session_id, transcript_path, cwd, permission_mode`.
- **Accept:** PreToolUse deny blocks tool + model sees reason; PostToolUse additionalContext lands in next request; skill invocation injects body then survives compaction re-injection.

#### P16 — Web tools + checkpoints
- **WebFetch(url, prompt)** [P0.1 §B]: fetch (redirect: same-host auto-follow, cross-host → return redirect URL for re-ask), 15-min cache keyed by URL, HTML→text, model processes with prompt (one-turn fork, no tools).
- **WebSearch(query, allowed_domains?/blocked_domains?)**: client-side via `webSearch.provider` (A23) — **OPEN DECISION** default (recommend Tavily; Brave fallback); results formatted with URLs+snippets; `fetch` of results left to model via WebFetch.
- **Checkpoints/rollback** (Claude "rewind" analog): before every Edit/Write, copy prior content into `~/.vexa/checkpoints/<sessionId>/<n>-<pathhash>`; `/rewind` lists and restores; transcript records checkpoint ids. **OPEN DECISION** (Claude's exact impl unverified in research) — recommended shadow-copy approach.
- **Accept:** WebFetch caches repeat call; rewind restores an edited file byte-exact.

### Stage IV — Power

#### P17 — Headless mode
- `vexa -p "prompt" [--output-format text|json|stream-json] [--max-turns N]`, stdin pipe support; no UI, no prompts.
- Headless permission semantics [TP §5.3 outer wrapper]: PermissionRequest hooks run first; none decide → **auto-deny** with clear message to the model; `dontAsk` mode: ask→deny. Denial limits: 3 consecutive / 20 total → abort with error (**guardrails before non-interactive ships** [TP §Vexa implications]).
- Output: `json` = final result + usage + cost; `stream-json` = SDK-style event per line (system init, assistant, tool results, result). Exit codes: 0 success, 1 error, 2 usage error (**OPEN DECISION**).
- `VEXA_UNATTENDED_RETRY` (A17) deferred — **OPEN DECISION**.
- **Accept:** cron-style run of "summarize TODOs" against mock provider returns valid JSON; denied tool auto-deny visible in transcript.

#### P18 — Sessions & transcripts
- `/resume` picker (list: id, title, mtime, message count — from last-16 KB metadata tail [CX §7]); `--continue` = most recent; session titles via `summaryModel` fork (§5.4); `/status` shows transcript path.
- Transcript consumer API (searchable JSONL; powers memory recall grep [CX §3] and P0.4 evals).
- **Accept:** kill and `--continue` across 5-turn session with compaction in the middle restores correct chain (preservedSegment relink).

#### P19 — Evals
- Harness runs P0.4 corpus (30–50 prompts) headlessly against configured provider; rubric scoring per prompt (file-state assertions, behavior checks); report compares Vexa vs recorded Claude behavior [PLAN P0.4].
- Tune system prompt wording, tool descriptions, retry/UX until behavior ≈ Claude on corpus.
- **Accept:** one-command eval run producing scored report; corpus committed.

#### P20 — Performance / low-power pass
- Startup: lazy `require` of heavy deps (ripgrep spawn, MCP, skills) — target cold start < 500 ms to prompt.
- No polling loops (event-driven child output); CPU idle ≈ 0 while awaiting model; memory cap on store (drop `progress` payloads > N).
- **Accept:** `time vexa --help` < 500 ms; idle CPU 0 %.

### Stage V — Desktop GUI (P21–P24)
- **Out of v1 scope** (spec'd later). Requirements seeded now: engine/provider/UI layering must allow a Tauri front-end to consume the SDK-style event stream (P17 stream-json) and permission requests over IPC; no `ui/` imports in engine. P21 chat UI → P22 file explorer + diffs → P23 settings/MCP manager → P24 portable build.

### Stage VI — Release

#### P25 — Hardening
- Malformed SSE/JSON chunks (skip+warn, never crash); missing/duplicate `tool_call_id`s (synthesize error results); provider garbage (schema-validate tool args, on fail → error tool result not crash).
- Interrupts mid-Write/Edit → atomic tmp+rename everywhere; kill-resume verified; disk-full and read-only-repo errors surfaced cleanly.
- Fuzz: 1 000 random truncated streams through the accumulator.
- **Accept:** suite of chaos tests passes.

#### P26 — Docs + v1.0
- README (quickstart, providers table), docs/ (config, permissions, hooks, MCP, skills), `vexa --help` completeness, version tag v1.0.0, MIT.

---

## 7. Open decisions register

| ID | Decision | Recommended default |
|---|---|---|
| OD1 | `--max-turns` default | 200 interactive / 50 headless |
| OD2 | Read 2000-line default vs token cap interplay | Claude behavior: both caps, throw on exceed |
| OD3 | Bash shell snapshot | Dropped v1 (fresh login-shell env probe) |
| OD4 | MCP OAuth (PKCE, needs-auth flow) | Dropped v1, add v1.1 |
| OD5 | PDF Read | Refuse with clear message v1 |
| OD6 | WebSearch provider | Tavily, Brave fallback |
| OD7 | Checkpoint format | Shadow-copy before write ops |
| OD8 | Hook events beyond the 9-subset | Defer to v1.1 |
| OD9 | Custom agent file format | Mirror SKILL.md frontmatter |
| OD10 | Headless exit codes | 0/1/2 |
| OD11 | Missing finish_reason / usage handling | estimate chars/4, treat-missing-as-stop |
| OD12 | API key storage | OS keychain, else ~/.vexa/auth.json 0600 |
| OD13 | Managed/enterprise settings scope | Dropped v1 |
| OD14 | `--bare` thin prompt | Dropped v1 |
| OD15 | Vexa env override for autocompact window | `VEXA_AUTOCOMPACT_WINDOW` (clamp) |

---

*End of specification. Phase order: P1→P9 deliver the first usable agent [PLAN Stage II]; P10–P16 Claude parity; P17–P20 power; P21–P24 desktop; P25–P26 release.*


