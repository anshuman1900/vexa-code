"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../dist/config/paths.js
function userConfigDir() {
  return process.env["VEXA_CONFIG_DIR"] || import_node_path.default.join(import_node_os.default.homedir(), ".vexa");
}
function userConfigPath() {
  return import_node_path.default.join(userConfigDir(), "config.json");
}
function ensureUserDirs() {
  const root = userConfigDir();
  const created = [];
  for (const dir of [root, import_node_path.default.join(root, "projects"), import_node_path.default.join(root, "skills")]) {
    if (!import_node_fs.default.existsSync(dir)) {
      import_node_fs.default.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  const configPath = userConfigPath();
  if (!import_node_fs.default.existsSync(configPath)) {
    import_node_fs.default.writeFileSync(configPath, DEFAULT_CONFIG_JSON, { mode: 384 });
    created.push(configPath);
  }
  return { configPath, created };
}
function findProjectRoot(cwd) {
  const userDir = userConfigDir();
  let dir = import_node_path.default.resolve(cwd);
  for (; ; ) {
    const vexaDir = import_node_path.default.join(dir, ".vexa");
    if (import_node_path.default.resolve(vexaDir) !== import_node_path.default.resolve(userDir) && import_node_fs.default.existsSync(vexaDir)) {
      return dir;
    }
    const parent = import_node_path.default.dirname(dir);
    if (parent === dir)
      return null;
    dir = parent;
  }
}
function sanitizeCwd(cwd) {
  return cwd.replace(/[:\\/. ]/g, "-");
}
function projectsDir(cwd) {
  return import_node_path.default.join(userConfigDir(), "projects", sanitizeCwd(cwd));
}
var import_node_fs, import_node_os, import_node_path, DEFAULT_PROFILE_MODEL, DEFAULT_CONFIG_JSON;
var init_paths = __esm({
  "../dist/config/paths.js"() {
    "use strict";
    import_node_fs = __toESM(require("node:fs"), 1);
    import_node_os = __toESM(require("node:os"), 1);
    import_node_path = __toESM(require("node:path"), 1);
    DEFAULT_PROFILE_MODEL = "anthropic/claude-sonnet-4.5";
    DEFAULT_CONFIG_JSON = JSON.stringify({
      model: "default",
      providerProfiles: {
        default: {
          baseUrl: "https://openrouter.ai/api/v1",
          apiKeyEnv: "OPENROUTER_API_KEY",
          model: DEFAULT_PROFILE_MODEL,
          maxTokens: 16e3,
          contextWindow: 2e5,
          label: "Claude Sonnet 4.5 (via OpenRouter)"
        }
      },
      aliases: {},
      permissions: {
        allow: [],
        ask: [],
        deny: [],
        defaultMode: "default",
        additionalDirectories: []
      },
      env: {},
      autoCompactEnabled: true
    }, null, 2) + "\n";
  }
});

// ../dist/config/auth.js
function authJsonPath() {
  return import_node_path3.default.join(userConfigDir(), "auth.json");
}
function readAuthFile() {
  try {
    const raw = import_node_fs3.default.readFileSync(authJsonPath(), "utf8");
    const parsed = JSON.parse(raw);
    return { profiles: parsed.profiles ?? {} };
  } catch {
    return { profiles: {} };
  }
}
function readStoredKey(profileName) {
  return readAuthFile().profiles[profileName];
}
function saveApiKey(profileName, key) {
  const file = readAuthFile();
  file.profiles[profileName] = key;
  const p = authJsonPath();
  import_node_fs3.default.mkdirSync(import_node_path3.default.dirname(p), { recursive: true });
  const body = JSON.stringify(file, null, 2) + "\n";
  import_node_fs3.default.writeFileSync(p, body, { mode: 384 });
  import_node_fs3.default.chmodSync(p, 384);
  return p;
}
function removeApiKey(profileName) {
  const file = readAuthFile();
  if (!(profileName in file.profiles))
    return false;
  delete file.profiles[profileName];
  import_node_fs3.default.writeFileSync(authJsonPath(), JSON.stringify(file, null, 2) + "\n", { mode: 384 });
  import_node_fs3.default.chmodSync(authJsonPath(), 384);
  return true;
}
function storedKeyNames() {
  return Object.keys(readAuthFile().profiles);
}
var import_node_fs3, import_node_path3;
var init_auth = __esm({
  "../dist/config/auth.js"() {
    "use strict";
    import_node_fs3 = __toESM(require("node:fs"), 1);
    import_node_path3 = __toESM(require("node:path"), 1);
    init_paths();
  }
});

// ../dist/config/profiles.js
function withDefaults(name, raw) {
  return {
    ...raw,
    maxTokens: raw.maxTokens ?? 16e3,
    contextWindow: raw.contextWindow ?? 2e5,
    maxTokensParam: raw.maxTokensParam ?? "max_tokens",
    temperature: raw.temperature ?? 1,
    supports: { tools: true, streamOptions: true, vision: false, reasoning: false, ...raw.supports },
    headers: raw.headers ?? {},
    dropFields: raw.dropFields ?? [],
    label: raw.label ?? raw.model
  };
}
function resolveModelRef(settings, ref) {
  let current = ref ?? settings.model ?? "default";
  let viaAlias = false;
  for (let depth = 0; depth < 10; depth++) {
    const aliasTarget = settings.aliases[current];
    if (aliasTarget !== void 0) {
      current = aliasTarget;
      viaAlias = true;
      continue;
    }
    if (!current.includes(":") && settings.providerProfiles[current] !== void 0) {
      const raw2 = settings.providerProfiles[current];
      if (raw2 !== void 0) {
        const modelId2 = raw2.model;
        return { profileName: current, profile: withDefaults(current, raw2), modelId: modelId2, viaAlias };
      }
    }
    const colon = current.indexOf(":");
    let profileName = "default";
    let modelId = current;
    if (colon > 0) {
      profileName = current.slice(0, colon);
      modelId = current.slice(colon + 1);
    }
    const raw = settings.providerProfiles[profileName];
    if (raw === void 0) {
      throw new ProfileError(profileName === "default" ? `no "default" provider profile found \u2014 add one under "providerProfiles" in ~/.vexa/config.json (see vexa --help)` : `unknown provider profile "${profileName}" (known: ${Object.keys(settings.providerProfiles).join(", ") || "none"})`);
    }
    if (modelId === "" || modelId === "default") {
      modelId = raw.model;
    }
    return { profileName, profile: withDefaults(profileName, raw), modelId, viaAlias };
  }
  throw new ProfileError(`alias chain for "${String(ref)}" exceeds 10 hops (circular?)`);
}
function resolveApiKey(profile, profileName) {
  if (profile.noAuth === true)
    return "";
  const envName = profile.apiKeyEnv;
  const fromEnv = process.env[envName];
  if (fromEnv !== void 0 && fromEnv !== "")
    return fromEnv;
  const stored = readStoredKey(profileName);
  if (stored !== void 0 && stored !== "")
    return stored;
  throw new ProfileError(`API key not set: provider profile "${profileName}" needs a key.
  Either set the environment variable ${envName}, or run:
    echo <your-key> | vexa providers set-key ${profileName}
  (keys are never stored in config.json or printed)`);
}
var ProfileError;
var init_profiles = __esm({
  "../dist/config/profiles.js"() {
    "use strict";
    init_auth();
    ProfileError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "ProfileError";
      }
    };
  }
});

// ../dist/context/vexamd.js
function stripHtmlComments(md) {
  const lines = md.split("\n");
  let inFence = false;
  const out = [];
  let inComment = false;
  for (const line of lines) {
    if (/^\s*```/.test(line))
      inFence = !inFence;
    if (!inFence) {
      let l = line;
      if (!inComment && l.includes("<!--")) {
        if (!l.includes("-->")) {
          inComment = true;
          l = l.slice(0, l.indexOf("<!--"));
        } else {
          l = l.replace(/<!--[\s\S]*?-->/g, "");
        }
      } else if (inComment) {
        if (l.includes("-->")) {
          inComment = false;
          l = l.slice(l.indexOf("-->") + 3);
        } else {
          continue;
        }
      }
      out.push(l);
    } else
      out.push(line);
  }
  return out.join("\n");
}
function resolveIncludes(content, baseDir, depth, warnings, label) {
  return content.replace(/^@(\S+)\s*$/gm, (_m, target) => {
    if (depth >= MAX_INCLUDE_DEPTH) {
      warnings.push(`${label}: @include depth limit (${MAX_INCLUDE_DEPTH}) reached, skipped: ${target}`);
      return "";
    }
    let incPath;
    if (target.startsWith("~/"))
      incPath = import_node_path4.default.join(userConfigDir(), target.slice(2));
    else if (target.startsWith("@"))
      incPath = target.slice(1);
    else
      incPath = import_node_path4.default.resolve(baseDir, target);
    try {
      if (!TEXT_EXTS.has(import_node_path4.default.extname(incPath)))
        return "";
      const inc = import_node_fs5.default.readFileSync(incPath, "utf8");
      const resolved = resolveIncludes(inc, import_node_path4.default.dirname(incPath), depth + 1, warnings, `${label}\u2192${import_node_path4.default.basename(incPath)}`);
      return `
${resolved}
`;
    } catch {
      return "";
    }
  });
}
function loadFile(filePath, provenance, warnings) {
  try {
    let content = import_node_fs5.default.readFileSync(filePath, "utf8");
    if (content.length > MAX_FILE_CHARS) {
      warnings.push(`${filePath}: ${content.length.toLocaleString()} chars exceeds ${MAX_FILE_CHARS.toLocaleString()} \u2014 consider trimming (loaded anyway)`);
    }
    content = resolveIncludes(content, import_node_path4.default.dirname(filePath), 0, warnings, import_node_path4.default.basename(filePath));
    content = stripHtmlComments(content);
    return { filePath, label: provenance, content };
  } catch {
    return null;
  }
}
function listRules(dir) {
  const rulesDir = import_node_path4.default.join(dir, "rules");
  if (!import_node_fs5.default.existsSync(rulesDir))
    return [];
  return import_node_fs5.default.readdirSync(rulesDir).filter((f) => f.endsWith(".md")).map((f) => import_node_path4.default.join(rulesDir, f)).sort();
}
function loadVexamd(cwd) {
  const warnings = [];
  const files = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (f) => {
    if (f === null)
      return;
    const key = `${f.filePath}:${f.content.length}`;
    if (seen.has(key))
      return;
    seen.add(key);
    files.push(f);
  };
  push(loadFile(import_node_path4.default.join(userConfigDir(), "VEXA.md"), "user's private global instructions", warnings));
  for (const r of listRules(userConfigDir())) {
    push(loadFile(r, "user's private global instructions (rules)", warnings));
  }
  const abs = import_node_path4.default.resolve(cwd);
  const dirs = [];
  let d = abs;
  for (; ; ) {
    dirs.unshift(d);
    const parent = import_node_path4.default.dirname(d);
    if (parent === d)
      break;
    d = parent;
  }
  const userDir = import_node_path4.default.resolve(userConfigDir());
  for (const dir of dirs) {
    if (import_node_path4.default.resolve(dir) === userDir)
      continue;
    const vexaDir = import_node_path4.default.join(dir, ".vexa");
    const isProjectRoot = import_node_fs5.default.existsSync(vexaDir);
    for (const cand of [import_node_path4.default.join(dir, "VEXA.md"), import_node_path4.default.join(vexaDir, "VEXA.md")]) {
      if (import_node_fs5.default.existsSync(cand)) {
        push(loadFile(cand, "project instructions, checked into the codebase", warnings));
      }
    }
    for (const r of listRules(vexaDir)) {
      push(loadFile(r, "project rules (checked into the codebase)", warnings));
    }
    if (isProjectRoot) {
      const local = import_node_path4.default.join(vexaDir, "VEXA.local.md");
      if (import_node_fs5.default.existsSync(local))
        push(loadFile(local, "user's private project instructions", warnings));
    }
  }
  return { files, warnings };
}
function formatVexamd(files) {
  if (files.length === 0)
    return "";
  const parts = files.map((f) => `Contents of ${f.filePath} (${f.label}):

${f.content.trim()}`);
  return [
    "The following files provide project instructions. They OVERRIDE any default behavior when they conflict with it:",
    "",
    ...parts
  ].join("\n\n");
}
var import_node_fs5, import_node_path4, MAX_FILE_CHARS, MAX_INCLUDE_DEPTH, TEXT_EXTS;
var init_vexamd = __esm({
  "../dist/context/vexamd.js"() {
    "use strict";
    import_node_fs5 = __toESM(require("node:fs"), 1);
    import_node_path4 = __toESM(require("node:path"), 1);
    init_paths();
    MAX_FILE_CHARS = 4e4;
    MAX_INCLUDE_DEPTH = 5;
    TEXT_EXTS = /* @__PURE__ */ new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ts", ".tsx", ".js", ".mjs", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".sh", ".css", ".html"]);
  }
});

// ../dist/context/memory.js
function memoryKeyDir(cwd) {
  let root = cwd;
  try {
    root = (0, import_node_child_process.execSync)("git rev-parse --show-toplevel", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    root = import_node_path5.default.resolve(cwd);
  }
  const safe = root.replace(/[:\\/. ]/g, "-");
  return import_node_path5.default.join(userConfigDir(), "projects", safe, "memory");
}
function ensureMemoryDir(cwd) {
  const dir = memoryKeyDir(cwd);
  import_node_fs6.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function memoryIndexPath(cwd) {
  return import_node_path5.default.join(memoryKeyDir(cwd), "MEMORY.md");
}
function loadMemory(cwd) {
  const warnings = [];
  const p = memoryIndexPath(cwd);
  try {
    const raw = import_node_fs6.default.readFileSync(p, "utf8");
    const lines = raw.split("\n");
    if (lines.length > MEMORY_INDEX_MAX_LINES) {
      warnings.push(`MEMORY.md exceeds ${MEMORY_INDEX_MAX_LINES} lines (${lines.length}) \u2014 prune it`);
    }
    if (raw.length > MEMORY_INDEX_MAX_BYTES) {
      warnings.push(`MEMORY.md exceeds ${MEMORY_INDEX_MAX_BYTES.toLocaleString()} bytes \u2014 prune it`);
    }
    return { content: raw.trim(), warnings };
  } catch {
    return { content: "", warnings };
  }
}
var import_node_fs6, import_node_path5, import_node_child_process, MEMORY_INDEX_MAX_LINES, MEMORY_INDEX_MAX_BYTES;
var init_memory = __esm({
  "../dist/context/memory.js"() {
    "use strict";
    import_node_fs6 = __toESM(require("node:fs"), 1);
    import_node_path5 = __toESM(require("node:path"), 1);
    import_node_child_process = require("node:child_process");
    init_paths();
    MEMORY_INDEX_MAX_LINES = 200;
    MEMORY_INDEX_MAX_BYTES = 25e3;
  }
});

// ../dist/extensibility/skills.js
function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (m === null)
    return { meta: {}, body: raw };
  const meta = {};
  const fm = m[1] ?? "";
  for (const line of fm.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1)
      continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key !== "")
      meta[key] = val;
  }
  return { meta, body: raw.slice(m[0].length) };
}
function scanSkillDirs(dirs) {
  const skills = /* @__PURE__ */ new Map();
  for (const { dir, source } of dirs) {
    if (!import_node_fs7.default.existsSync(dir))
      continue;
    for (const entry of import_node_fs7.default.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory())
        continue;
      const skillMd = import_node_path6.default.join(dir, entry.name, "SKILL.md");
      if (!import_node_fs7.default.existsSync(skillMd))
        continue;
      try {
        const { meta, body } = parseFrontmatter(import_node_fs7.default.readFileSync(skillMd, "utf8"));
        const name = meta["name"] ?? entry.name;
        if (skills.has(name))
          continue;
        skills.set(name, {
          name,
          description: meta["description"] ?? "",
          whenToUse: meta["when-to-use"],
          allowedTools: meta["allowed-tools"] !== void 0 ? meta["allowed-tools"].split(",").map((s) => s.trim()).filter(Boolean) : void 0,
          disableModelInvocation: meta["disable-model-invocation"] === "true",
          argumentHint: meta["argument-hint"],
          bodyPath: skillMd,
          source
        });
      } catch {
      }
    }
  }
  return [...skills.values()];
}
function discoverSkills(cwd) {
  const userSkills = import_node_path6.default.join(userConfigDir(), "skills");
  const projectSkills = import_node_path6.default.join(cwd, ".vexa", "skills");
  return scanSkillDirs([
    { dir: userSkills, source: "user" },
    { dir: projectSkills, source: "project" }
  ]);
}
function discoverCommands(cwd) {
  const dirs = [import_node_path6.default.join(userConfigDir(), "commands"), import_node_path6.default.join(cwd, ".vexa", "commands")];
  const cmds = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    if (!import_node_fs7.default.existsSync(dir))
      continue;
    for (const f of import_node_fs7.default.readdirSync(dir)) {
      if (!f.endsWith(".md"))
        continue;
      const name = f.replace(/\.md$/, "");
      if (cmds.has(name))
        continue;
      try {
        cmds.set(name, { name, body: import_node_fs7.default.readFileSync(import_node_path6.default.join(dir, f), "utf8"), sourceFile: import_node_path6.default.join(dir, f) });
      } catch {
      }
    }
  }
  return [...cmds.values()];
}
function expandCommand(cmd, args) {
  return cmd.body.replace(/\$ARGUMENTS/g, args);
}
function skillsPromptSection(skills) {
  const invocable = skills.filter((s) => !s.disableModelInvocation);
  if (invocable.length === 0)
    return null;
  const lines = invocable.map((s) => `- ${s.name}: ${s.description}${s.whenToUse !== void 0 ? ` (use when: ${s.whenToUse})` : ""}`);
  return [
    "# Skills",
    "The following skills are available. When a task matches one, read its body with Read (path given) and follow it:",
    ...lines.map((l, i) => `${l} [body: ${invocable[i]?.bodyPath}]`)
  ].join("\n");
}
var import_node_fs7, import_node_path6;
var init_skills = __esm({
  "../dist/extensibility/skills.js"() {
    "use strict";
    import_node_fs7 = __toESM(require("node:fs"), 1);
    import_node_path6 = __toESM(require("node:path"), 1);
    init_paths();
  }
});

// ../dist/engine/prompt.js
function staticPrefix() {
  return [
    "You are Vexa Code, an interactive CLI coding agent that helps users with software engineering tasks.",
    "",
    "IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously. Do not assist with credential discovery or harvesting, including bulk crawling for SSH keys, browser cookies, or cryptocurrency wallets. Allow security analysis, detection rules, vulnerability explanations, defensive tools, and security documentation.",
    "IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident they are for helping with programming. You may use URLs provided by the user in their messages or local files.",
    "",
    "# Tone and style",
    "Be concise, direct, and to the point, while providing complete information and matching the level of detail to the complexity of the query or work. A concise response is generally fewer than 4 lines, not including tool calls or generated code.",
    "IMPORTANT: Minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy. Only address the specific query or task at hand.",
    'IMPORTANT: Do NOT answer with unnecessary preamble or postamble (no "The answer is <answer>.", no "Here is what I will do next\u2026", no summaries of your actions unless asked).',
    "After working on a file, briefly confirm completion rather than explaining what you did.",
    "Answer directly \u2014 one-word or one-line answers are often best. Avoid introductions, conclusions, and explanations.",
    "When you run a non-trivial bash command, briefly explain what it does and why (especially for system-changing commands).",
    "Your output renders in a monospace terminal using GitHub-flavored markdown (CommonMark).",
    "Only use emojis if the user explicitly requests them. Avoid emojis entirely unless asked.",
    "If you cannot or will not help with something, do not say why at length \u2014 it comes across as preachy. Keep it to 1-2 sentences and offer a helpful alternative if possible.",
    "When referencing specific functions or code, include the pattern `file_path:line_number` so the user can navigate there.",
    "",
    "# Professional objectivity",
    "Prioritize technical accuracy and truthfulness over validating the user's beliefs. Provide direct, objective technical info without unnecessary superlatives, praise, or emotional validation. Disagree when necessary, even if it is not what the user wants to hear. When uncertain, investigate to find the truth rather than instinctively confirming the user's beliefs.",
    "",
    "# Doing tasks",
    "The user will primarily request software engineering tasks: fixing bugs, adding functionality, refactoring, explaining code.",
    "- Use the available search tools extensively (in parallel and sequentially) to understand the codebase and the query.",
    "- Implement the solution with all tools available.",
    "- Verify the solution if possible with tests. NEVER assume a specific test framework \u2014 check the README or the codebase.",
    "- VERY IMPORTANT: when you complete a task, run the lint and typecheck commands if they exist (e.g. npm run lint, tsc --noEmit) to ensure correctness.",
    "NEVER commit changes unless the user explicitly asks you to.",
    "Tool results and user messages may include <system-reminder> tags containing useful context. They are NOT part of the user's input.",
    "",
    "# Following conventions",
    "When making changes, first understand the file's conventions. Mimic code style, use existing libraries and utilities, follow existing patterns.",
    "- NEVER assume a library is available, even a famous one \u2014 check package.json/imports first.",
    "- When creating a component, look at existing components first (framework, naming, typing).",
    "- Follow security best practices: never expose or log secrets; never commit keys.",
    "",
    "# Code style",
    "- IMPORTANT: DO NOT ADD ***ANY*** COMMENTS unless asked.",
    "",
    "# Tool usage policy",
    "- When doing file search, prefer Glob/Grep to reduce context usage; use the Task tool for broad multi-step search (when available).",
    "- You can invoke multiple tools in a single response: batch independent tool calls together (e.g. git status + git diff in one message).",
    "- Prefer Grep/Glob/Read over Bash equivalents (find, grep, cat, head, tail).",
    "- You MUST Read a file before editing or overwriting it.",
    "- If a WebFetch result mentions a redirect to a different host, make a new request with the redirect URL."
  ].join("\n");
}
function buildSystemPrompt(ctx) {
  const vexamd = ctx.vexamd ?? loadVexamd(ctx.cwd);
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const branch = ctx.gitBranch !== void 0 ? `
Git branch: ${ctx.gitBranch}` : "";
  const toolList = ctx.toolsEnabled.length > 0 ? ctx.toolsEnabled.join(", ") : "(none)";
  const dynamic = [
    "# Environment",
    "<env>",
    `Working directory: ${ctx.cwd}`,
    `Is directory a git repo: ${ctx.isGitRepo ? "Yes" : "No"}${branch}`,
    `Platform: ${process.platform}`,
    `OS: ${import_node_os2.default.version?.() ?? import_node_os2.default.type()}`,
    `Today's date: ${date}`,
    `Permission mode: ${ctx.permissionMode ?? "default"}`,
    `You are powered by the model named ${ctx.modelLabel}. The exact model ID is ${ctx.modelId}.`,
    "</env>",
    "",
    "# Tools available in this session",
    toolList
  ];
  const vexamdText = formatVexamd(vexamd.files);
  if (vexamdText !== "") {
    dynamic.push("", vexamdText);
  }
  dynamic.push("", "# Memory", ctx.memoryDir !== void 0 && ctx.memoryDir !== "" ? `Auto-memory directory: ${ctx.memoryDir} (it already exists \u2014 do NOT run mkdir). Save durable facts about the user/project with the Write tool as MEMORY.md (index) or topic files, then reference them here.` : "Auto-memory is not available in this session; rely on VEXA.md files for durable context.");
  if (ctx.memoryContent !== void 0 && ctx.memoryContent !== "") {
    dynamic.push("", "Contents of MEMORY.md (user memory index):", "", ctx.memoryContent);
  }
  if (ctx.skillsSection !== void 0 && ctx.skillsSection !== "") {
    dynamic.push("", ctx.skillsSection);
  }
  return {
    system: `${staticPrefix()}

${dynamic.join("\n")}`,
    warnings: vexamd.warnings
  };
}
var import_node_os2;
var init_prompt = __esm({
  "../dist/engine/prompt.js"() {
    "use strict";
    import_node_os2 = __toESM(require("node:os"), 1);
    init_vexamd();
  }
});

// ../dist/types.js
function addUsage(a, b) {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens !== void 0 || b.cacheReadTokens !== void 0 ? (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0) : void 0,
    totalTokens: a.totalTokens + b.totalTokens,
    costUsd: a.costUsd !== void 0 || b.costUsd !== void 0 ? (a.costUsd ?? 0) + (b.costUsd ?? 0) : void 0,
    estimated: a.estimated && b.estimated
  };
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
var EMPTY_USAGE;
var init_types = __esm({
  "../dist/types.js"() {
    "use strict";
    EMPTY_USAGE = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimated: true
    };
  }
});

// ../dist/provider/stream.js
function createAccumulator(modelIdForEstimate = "") {
  let text = "";
  let reasoningText = "";
  let finishReason = null;
  let usage = null;
  const slots = /* @__PURE__ */ new Map();
  return {
    push(chunkUnknown) {
      const chunk = chunkUnknown;
      let textDelta = "";
      let reasoningDelta = "";
      if (chunk.usage) {
        const u = chunk.usage;
        usage = {
          inputTokens: u.prompt_tokens ?? 0,
          outputTokens: u.completion_tokens ?? 0,
          cacheReadTokens: u.prompt_tokens_details?.cached_tokens,
          totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
          estimated: false
        };
      }
      const choice = chunk.choices?.[0];
      if (choice === void 0)
        return { textDelta, reasoningDelta };
      if (choice.finish_reason != null)
        finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (delta !== void 0) {
        if (typeof delta.content === "string") {
          text += delta.content;
          textDelta = delta.content;
        }
        const r = delta.reasoning_content ?? delta.reasoning;
        if (typeof r === "string") {
          reasoningText += r;
          reasoningDelta = r;
        }
        for (const tc of delta.tool_calls ?? []) {
          const slot = slots.get(tc.index) ?? { id: "", name: "", arguments: "" };
          if (tc.id)
            slot.id = tc.id;
          if (tc.function?.name)
            slot.name = tc.function.name;
          if (typeof tc.function?.arguments === "string")
            slot.arguments += tc.function.arguments;
          slots.set(tc.index, slot);
        }
      }
      const msg = choice.message;
      if (msg !== void 0) {
        if (typeof msg.content === "string") {
          text += msg.content;
          textDelta = msg.content;
        }
        for (const tc of msg.tool_calls ?? []) {
          const idx = slots.size;
          slots.set(idx, { id: tc.id, name: tc.function.name, arguments: tc.function.arguments });
        }
      }
      return { textDelta, reasoningDelta };
    },
    result() {
      const ordered = [...slots.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
      return {
        text,
        reasoningText,
        toolCalls: ordered,
        finishReason: finishReason ?? (ordered.length > 0 ? "tool_calls" : "stop"),
        // OD11: treat-missing-as-stop only when no tool_calls
        usage: usage ?? {
          inputTokens: estimateTokens(text),
          outputTokens: estimateTokens(text),
          totalTokens: estimateTokens(text),
          estimated: true
        }
      };
    }
  };
}
var init_stream = __esm({
  "../dist/provider/stream.js"() {
    "use strict";
    init_types();
  }
});

// ../dist/provider/retry.js
function classify(status, bodyText) {
  if (status === 529 || status === 503)
    return "overloaded";
  if (status === 429 && OVERLOADED_RE.test(bodyText))
    return "overloaded";
  if (status === 429)
    return "rate_limit";
  if (status === 401 || status === 403)
    return "auth";
  if (status === 404)
    return "notfound";
  if ((status === 400 || status === 413) && CONTEXT_OVERFLOW_RE.test(bodyText))
    return "context_overflow";
  if (status === 400 || status === 413)
    return "bad_request";
  if (status >= 500)
    return "server";
  return "protocol";
}
function classifyNetworkError(err) {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/abort|timeout/i.test(msg))
    return "timeout";
  return "connection";
}
function shouldRetryKind(kind) {
  switch (kind) {
    case "auth":
    case "notfound":
    case "bad_request":
    case "context_overflow":
      return false;
    case "overloaded":
    case "rate_limit":
    case "server":
    case "timeout":
    case "connection":
      return true;
    default:
      return false;
  }
}
function computeBackoffMs(attempt, retryAfterHeader) {
  if (retryAfterHeader !== null && retryAfterHeader !== "") {
    const s = Number(retryAfterHeader);
    if (Number.isFinite(s) && s >= 0)
      return Math.min(s * 1e3, 3e5);
  }
  const base = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), MAX_DELAY_MS);
  const jitter = Math.random() * BASE_DELAY_MS * 0.25;
  return base + jitter;
}
var ProviderError, MAX_RETRIES, BASE_DELAY_MS, MAX_DELAY_MS, MAX_OVERLOADED_CONSECUTIVE, STREAM_IDLE_TIMEOUT_MS, STREAM_IDLE_WARN_MS, REQUEST_TIMEOUT_MS, CONTEXT_OVERFLOW_RE, OVERLOADED_RE, sleep;
var init_retry = __esm({
  "../dist/provider/retry.js"() {
    "use strict";
    ProviderError = class extends Error {
      kind;
      status;
      body;
      retryAfterMs;
      constructor(kind, message, status, body, retryAfterMs) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.body = body;
        this.retryAfterMs = retryAfterMs;
        this.name = "ProviderError";
      }
    };
    MAX_RETRIES = Number(process.env["VEXA_MAX_RETRIES"] ?? 10);
    BASE_DELAY_MS = 500;
    MAX_DELAY_MS = 32e3;
    MAX_OVERLOADED_CONSECUTIVE = 3;
    STREAM_IDLE_TIMEOUT_MS = Number(process.env["VEXA_STREAM_IDLE_TIMEOUT_MS"] ?? 9e4);
    STREAM_IDLE_WARN_MS = 45e3;
    REQUEST_TIMEOUT_MS = 6e5;
    CONTEXT_OVERFLOW_RE = /context_length_exceeded|maximum context length|prompt too long|too many tokens|reduce the length/i;
    OVERLOADED_RE = /overloaded|capacity|overloaded_error/i;
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  }
});

// ../dist/provider/client.js
function endpoint(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}
function buildBody(req, stream) {
  const body = {
    model: req.model,
    messages: req.messages,
    [req.maxTokensParam ?? "max_tokens"]: req.maxTokens,
    stream
  };
  if (req.temperature !== void 0)
    body["temperature"] = req.temperature;
  if (stream && req.supports?.streamOptions !== false) {
    body["stream_options"] = { include_usage: true };
  }
  if (req.tools !== void 0 && req.tools.length > 0 && req.supports?.tools !== false) {
    body["tools"] = req.tools;
    body["tool_choice"] = "auto";
  }
  for (const field of req.dropFields ?? [])
    delete body[field];
  return body;
}
function buildHeaders(req, stream) {
  const headers = { "Content-Type": "application/json" };
  if (stream)
    headers["Accept"] = "text/event-stream";
  if (req.apiKey !== "")
    headers["Authorization"] = `Bearer ${req.apiKey}`;
  for (const [k, v] of Object.entries(req.headers ?? {}))
    headers[k] = v;
  return headers;
}
function wrapHttpError(res, bodyText) {
  const kind = classify(res.status, bodyText);
  const retryAfter = res.headers.get("retry-after");
  const retryAfterMs = retryAfter !== null && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1e3 : void 0;
  return new ProviderError(kind, `HTTP ${res.status} ${res.statusText} from ${res.url}${bodyText !== "" ? ` \u2014 ${bodyText.slice(0, 300)}` : ""}`, res.status, bodyText, retryAfterMs);
}
async function attemptStream(req, cb) {
  const acc = createAccumulator();
  const ctrl = new AbortController();
  const onExternalAbort = () => ctrl.abort();
  req.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const overall = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let lastChunkAt = Date.now();
  let idleWarned = false;
  const idleTick = setInterval(() => {
    const idleFor = Date.now() - lastChunkAt;
    if (!idleWarned && idleFor >= STREAM_IDLE_WARN_MS) {
      idleWarned = true;
      cb.onIdleWarn?.();
    }
    if (idleFor >= STREAM_IDLE_TIMEOUT_MS) {
      ctrl.abort();
    }
  }, 1e3);
  try {
    const res = await fetch(endpoint(req.baseUrl), {
      method: "POST",
      headers: buildHeaders(req, true),
      body: JSON.stringify(buildBody(req, true)),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw wrapHttpError(res, bodyText);
    }
    if (res.body === null)
      throw new ProviderError("protocol", "empty response body");
    const decoder = new TextDecoder();
    let buf = "";
    const processLine = (rawLine) => {
      const line = rawLine.replace(/\r$/, "");
      if (!line.startsWith("data:"))
        return;
      const data = line.slice(5).trim();
      if (data === "" || data === "[DONE]")
        return;
      try {
        const { textDelta, reasoningDelta } = acc.push(JSON.parse(data));
        if (textDelta !== "")
          cb.onTextDelta?.(textDelta);
        if (reasoningDelta !== "")
          cb.onReasoningDelta?.(reasoningDelta);
      } catch {
        console.error("vexa: skipping malformed SSE chunk");
      }
    };
    for await (const chunk of res.body) {
      lastChunkAt = Date.now();
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        processLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    buf += decoder.decode();
    for (const line of buf.split("\n"))
      processLine(line);
    return acc.result();
  } catch (err) {
    throw asProviderError(err);
  } finally {
    clearInterval(idleTick);
    clearTimeout(overall);
    req.signal?.removeEventListener("abort", onExternalAbort);
  }
}
async function attemptNonStream(req, cb) {
  const acc = createAccumulator();
  const ctrl = new AbortController();
  const onExternalAbort = () => ctrl.abort();
  req.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const overall = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint(req.baseUrl), {
      method: "POST",
      headers: buildHeaders(req, false),
      body: JSON.stringify(buildBody(req, false)),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw wrapHttpError(res, bodyText);
    }
    const json = await res.json();
    const { textDelta } = acc.push(json);
    if (textDelta !== "")
      cb.onTextDelta?.(textDelta);
    return acc.result();
  } catch (err) {
    throw asProviderError(err);
  } finally {
    clearTimeout(overall);
    req.signal?.removeEventListener("abort", onExternalAbort);
  }
}
function asProviderError(err) {
  if (err instanceof ProviderError)
    return err;
  const kind = classifyNetworkError(err);
  const msg = err instanceof Error ? err.message : String(err);
  return new ProviderError(kind, `${kind === "timeout" ? "request timed out" : "connection error"}: ${msg}`);
}
async function streamChat(req, cb = {}, deps = {}) {
  const doSleep = deps.sleepFn ?? sleep;
  let consecutiveOverloaded = 0;
  let connectionFailures = 0;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const useNonStream = connectionFailures >= 2;
    if (useNonStream && attempt === connectionFailures + 1)
      cb.onFallbackNonStream?.();
    try {
      return useNonStream ? await attemptNonStream(req, cb) : await attemptStream(req, cb);
    } catch (err) {
      const perr = err instanceof ProviderError ? err : asProviderError(err);
      if (perr.kind === "connection")
        connectionFailures++;
      if (perr.kind === "overloaded") {
        consecutiveOverloaded++;
        if (consecutiveOverloaded >= MAX_OVERLOADED_CONSECUTIVE) {
          throw new ProviderError("overloaded", `provider overloaded on ${MAX_OVERLOADED_CONSECUTIVE} consecutive attempts${req.label !== void 0 ? ` (${req.label})` : ""} \u2014 set profile "fallbackModel" or switch with /model`, perr.status, perr.body);
        }
      }
      if (!shouldRetryKind(perr.kind) || attempt === MAX_RETRIES)
        throw perr;
      const delay = computeBackoffMs(attempt, perr.retryAfterMs !== void 0 ? String(perr.retryAfterMs / 1e3) : null);
      cb.onRetry?.(attempt, perr.kind, delay);
      await doSleep(delay);
    }
  }
  throw new ProviderError("protocol", "unreachable: retry loop exhausted");
}
var init_client = __esm({
  "../dist/provider/client.js"() {
    "use strict";
    init_stream();
    init_retry();
    init_retry();
  }
});

// ../dist/provider/wire.js
function toWireTool(name, description, parameters) {
  return { type: "function", function: { name, description, parameters } };
}
function toWireMessages(messages, opts) {
  const out = [];
  let pendingImages = [];
  const flushImagesAsUser = () => {
    if (pendingImages.length === 0)
      return;
    const parts = pendingImages.map((img) => opts.supportsVision ? { type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } } : { type: "text", text: "[image omitted: provider lacks vision support]" });
    out.push({ role: "user", content: parts });
    pendingImages = [];
  };
  for (const msg of messages) {
    if (msg.type === "system") {
      out.push({ role: "system", content: textOf(msg.content) });
      continue;
    }
    if (msg.type === "assistant") {
      const text = textOf(msg.content);
      const toolCalls = msg.content.filter((b) => b.type === "tool_use").map((b) => ({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) }
      }));
      out.push({
        role: "assistant",
        content: text === "" && toolCalls.length > 0 ? null : text,
        ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {}
      });
      continue;
    }
    if (msg.type === "user") {
      const toolResults = msg.content.filter((b) => b.type === "tool_result");
      for (const tr of toolResults) {
        out.push({
          role: "tool",
          tool_call_id: tr.toolUseId,
          content: tr.isError ? `Error: ${tr.content}` : tr.content
        });
      }
      const texts = msg.content.filter((b) => b.type === "text").map((b) => b.text);
      const images = msg.content.filter((b) => b.type === "image");
      pendingImages.push(...images);
      const userText = texts.join("\n");
      if (userText !== "") {
        flushImagesAsUser();
        out.push({ role: "user", content: userText });
      }
      continue;
    }
  }
  flushImagesAsUser();
  return out;
}
function textOf(blocks) {
  return blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
}
var init_wire = __esm({
  "../dist/provider/wire.js"() {
    "use strict";
  }
});

// ../dist/engine/queryLoop.js
function uuid() {
  return globalThis.crypto.randomUUID();
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + `\u2026 [+${s.length - n} chars]` : s;
}
function partition(calls, byName) {
  const batches = [];
  let current = [];
  for (const call of calls) {
    const tool = byName.get(call.name);
    const safe = tool?.isConcurrencySafe === true;
    if (safe) {
      current.push(call);
    } else {
      if (current.length > 0)
        batches.push(current);
      current = [];
      batches.push([call]);
    }
  }
  if (current.length > 0)
    batches.push(current);
  return batches;
}
async function runOne(call, tool, opts, allowWithoutAsk) {
  const fail3 = (content) => ({
    toolUseId: call.id,
    content,
    isError: true
  });
  if (tool === void 0)
    return fail3(`Unknown tool: ${call.name}`);
  let parsed = call.input;
  if (typeof call.input === "string" && call.input.trim() !== "") {
    try {
      parsed = JSON.parse(call.input);
    } catch {
      return fail3(`Malformed tool arguments (invalid JSON): ${truncate(String(call.input), 200)}`);
    }
  }
  if (tool.checkPermissions(parsed, opts.toolContext) === "ask" && !allowWithoutAsk) {
    let allowed = false;
    try {
      allowed = await opts.permissionAsk(tool, parsed);
    } catch {
      allowed = false;
    }
    if (!allowed)
      return fail3("User denied permission for this tool call.");
  }
  try {
    const r = await tool.call(parsed, opts.toolContext);
    const data = r.data;
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { toolUseId: call.id, content: truncate(text, tool.maxResultSizeChars ?? 5e4), isError: false };
  } catch (e) {
    return { toolUseId: call.id, content: truncate(e.message, 2e3), isError: true };
  }
}
async function runAgentTurn(opts) {
  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const wireTools = opts.tools.map((t) => toWireTool(t.name, t.description, t.inputSchema));
  let usage = { ...EMPTY_USAGE };
  let toolCallCount = 0;
  let aborted = false;
  let escalated = false;
  let maxTokens = opts.maxTokens;
  let accText = "";
  let prevFinish = "";
  for (let turn = 0; turn < opts.maxTurns; turn++) {
    if (opts.autoCompact !== void 0) {
      try {
        await opts.autoCompact();
      } catch {
      }
    }
    if (opts.getAttachments !== void 0) {
      const keep = opts.messages.filter((m) => !m.isMeta || m.content[0]?.type !== "text" || !m.content[0].text.includes("<system-reminder>"));
      const atts = opts.getAttachments();
      opts.messages.length = 0;
      opts.messages.push(...keep, ...atts);
    }
    const wire = [
      { role: "system", content: opts.system },
      ...toWireMessages(opts.messages, { supportsVision: opts.supports?.vision === true })
    ];
    let result;
    try {
      result = await streamChat({
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        model: opts.model,
        label: opts.label,
        headers: opts.headers,
        messages: wire,
        tools: wireTools,
        maxTokens,
        maxTokensParam: opts.maxTokensParam,
        temperature: opts.temperature,
        supports: opts.supports,
        dropFields: opts.dropFields,
        signal: opts.signal
      }, { onTextDelta: opts.onTextDelta, onReasoningDelta: opts.onReasoningDelta }, { sleepFn: opts.sleepFn });
    } catch (err) {
      aborted = opts.signal?.aborted === true;
      throw err;
    }
    usage = addUsage(usage, result.usage);
    const assistantMsg = {
      uuid: uuid(),
      parentUuid: opts.messages.at(-1)?.uuid ?? null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "assistant",
      content: [
        ...result.text !== "" ? [{ type: "text", text: result.text }] : [],
        ...result.toolCalls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.name, input: safeParse(tc.arguments) }))
      ],
      model: opts.model,
      provider: opts.label,
      usage: result.usage,
      finishReason: result.finishReason
    };
    if (result.toolCalls.length === 0) {
      opts.messages.push(assistantMsg);
      if (result.text !== "") {
        accText = prevFinish === "length" ? accText + result.text : result.text;
      }
      prevFinish = result.finishReason;
      if (result.finishReason === "length" && !escalated) {
        escalated = true;
        maxTokens = Math.min(Math.max(Math.floor(maxTokens * 1.5), MAX_OUTPUT_FLOOR), Math.max(opts.supports?.tools === false ? 4096 : 2e5, maxTokens));
        opts.messages.push({
          uuid: uuid(),
          parentUuid: assistantMsg.uuid,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          type: "user",
          isMeta: true,
          content: [{ type: "text", text: "Output token limit hit. Resume directly \u2014 no apology, no repetition. Break the remaining work into smaller pieces." }]
        });
        turn--;
        continue;
      }
      return { finalText: accText, finishReason: result.finishReason, usage, toolCallCount, aborted };
    }
    opts.messages.push(assistantMsg);
    prevFinish = result.finishReason;
    const calls = result.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, input: safeParse(tc.arguments) }));
    toolCallCount += calls.length;
    const results = [];
    const batches = partition(calls, byName);
    for (const batch of batches) {
      const safeTools = batch.every((c2) => byName.get(c2.name)?.isConcurrencySafe === true);
      if (safeTools && batch.length > 1) {
        for (let i = 0; i < batch.length; i += MAX_CONCURRENCY) {
          const slice = batch.slice(i, i + MAX_CONCURRENCY);
          const settled = await Promise.all(slice.map(async (c2) => {
            opts.onToolStart?.(c2.name, c2.input);
            const r = await runOne(c2, byName.get(c2.name), opts, opts.permissionAsk === void 0);
            opts.onToolResult?.(c2.name, r.content, r.isError);
            return r;
          }));
          results.push(...settled);
        }
      } else {
        for (const c2 of batch) {
          if (opts.signal?.aborted === true) {
            results.push({ toolUseId: c2.id, content: "Aborted before execution.", isError: true });
            continue;
          }
          opts.onToolStart?.(c2.name, c2.input);
          const r = await runOne(c2, byName.get(c2.name), opts, opts.permissionAsk === void 0);
          opts.onToolResult?.(c2.name, r.content, r.isError);
          results.push(r);
        }
      }
    }
    opts.messages.push({
      uuid: uuid(),
      parentUuid: assistantMsg.uuid,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "user",
      content: calls.map((c2) => {
        const r = results.find((x) => x.toolUseId === c2.id);
        return {
          type: "tool_result",
          toolUseId: c2.id,
          content: r?.content ?? "Tool call was dropped \u2014 no result recorded.",
          isError: r?.isError ?? true
        };
      })
    });
    if (opts.signal?.aborted === true) {
      aborted = true;
      return {
        finalText: result.text,
        finishReason: "aborted",
        usage,
        toolCallCount,
        aborted
      };
    }
  }
  return {
    finalText: "",
    finishReason: "max_turns_reached",
    usage,
    toolCallCount,
    aborted
  };
}
function safeParse(args) {
  if (args.trim() === "")
    return {};
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}
var MAX_CONCURRENCY, MAX_OUTPUT_FLOOR;
var init_queryLoop = __esm({
  "../dist/engine/queryLoop.js"() {
    "use strict";
    init_client();
    init_wire();
    init_retry();
    init_types();
    MAX_CONCURRENCY = Number(process.env["VEXA_MAX_TOOL_USE_CONCURRENCY"] ?? 10);
    MAX_OUTPUT_FLOOR = 3e3;
  }
});

// ../dist/sessions/transcript.js
function newSessionId() {
  return globalThis.crypto.randomUUID();
}
function transcriptPathFor(cwd, sessionId) {
  return import_node_path7.default.join(projectsDir(cwd), `${sessionId}.jsonl`);
}
function readTranscript(filePath) {
  const warnings = [];
  const messages = [];
  let sessionId;
  let raw;
  try {
    raw = import_node_fs8.default.readFileSync(filePath, "utf8");
  } catch {
    return { messages, warnings: [`cannot read ${filePath}`] };
  }
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (line === "")
      continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      if (i === lines.length - 1) {
        warnings.push("torn final line skipped (crash recovery)");
      } else {
        warnings.push(`line ${i + 1} corrupted, skipped`);
      }
      continue;
    }
    sessionId = entry.sessionId;
    if (entry.type === "sessionMeta")
      continue;
    messages.push(entry.message);
  }
  return { messages, warnings, sessionId };
}
function listSessions(cwd) {
  const dir = projectsDir(cwd);
  if (!import_node_fs8.default.existsSync(dir))
    return [];
  return import_node_fs8.default.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => {
    const p = import_node_path7.default.join(dir, f);
    const st = import_node_fs8.default.statSync(p);
    return { id: f.replace(/\.jsonl$/, ""), path: p, mtimeMs: st.mtimeMs, sizeBytes: st.size };
  }).sort((a, b) => b.mtimeMs - a.mtimeMs);
}
function sessionSummaries(cwd, limit = 20) {
  return listSessions(cwd).slice(0, limit).map((s) => {
    let msgCount = 0;
    let firstPrompt = "";
    try {
      const lines = import_node_fs8.default.readFileSync(s.path, "utf8").split("\n").filter((l) => l.trim() !== "");
      msgCount = lines.length;
      for (const l of lines) {
        try {
          const o = JSON.parse(l);
          if (o.type === "user" && Array.isArray(o.content)) {
            const tb = o.content.find((b) => b.type === "text");
            if (tb?.text !== void 0 && tb.text !== "") {
              firstPrompt = tb.text.replace(/\s+/g, " ").slice(0, 80);
              break;
            }
          }
        } catch {
        }
      }
    } catch {
    }
    return { ...s, msgCount, firstPrompt };
  });
}
var import_node_fs8, import_node_path7, Transcript;
var init_transcript = __esm({
  "../dist/sessions/transcript.js"() {
    "use strict";
    import_node_fs8 = __toESM(require("node:fs"), 1);
    import_node_path7 = __toESM(require("node:path"), 1);
    init_paths();
    Transcript = class {
      filePath;
      sessionId;
      version;
      fd = null;
      queue = Promise.resolve();
      constructor(filePath, sessionId, version) {
        this.filePath = filePath;
        this.sessionId = sessionId;
        this.version = version;
        import_node_fs8.default.mkdirSync(import_node_path7.default.dirname(filePath), { recursive: true });
      }
      openIfNeeded() {
        if (this.fd === null) {
          this.fd = import_node_fs8.default.openSync(this.filePath, "a");
        }
        return this.fd;
      }
      /** Raw line append; fsync=true blocks until the bytes hit disk (user messages). */
      append(message, opts = {}) {
        const entry = {
          type: message.type === "progress" || message.type === "attachment" ? "attachment" : message.type,
          uuid: message.uuid,
          parentUuid: message.parentUuid,
          sessionId: this.sessionId,
          cwd: process.cwd(),
          version: this.version,
          timestamp: message.timestamp,
          message,
          ...opts.compactMetadata !== void 0 ? { compactMetadata: opts.compactMetadata } : {}
        };
        const line = JSON.stringify(entry) + "\n";
        const job = this.queue.then(async () => {
          const fd = this.openIfNeeded();
          import_node_fs8.default.writeSync(fd, line);
          if (opts.fsync === true)
            import_node_fs8.default.fsyncSync(fd);
        });
        this.queue = job.catch(() => {
        });
        return job;
      }
      close() {
        void this.queue.then(() => {
          if (this.fd !== null) {
            import_node_fs8.default.closeSync(this.fd);
            this.fd = null;
          }
        });
      }
    };
  }
});

// ../dist/state.js
function renderTodos(todos) {
  if (todos.length === 0)
    return "(no todos)";
  return todos.map((t) => {
    const mark = t.status === "completed" ? "\u2705" : t.status === "in_progress" ? "\u25B8" : "\u2610";
    const label = t.status === "in_progress" ? t.activeForm ?? t.content : t.content;
    return `${mark} ${label}`;
  }).join("\n");
}
function todoReminder(todos) {
  if (todos.length === 0)
    return null;
  const lines = todos.map((t) => `- [${t.status}] ${t.content}`);
  return `<system-reminder>
Your current todo list (keep exactly one in_progress; mark completed immediately when done):
${lines.join("\n")}
</system-reminder>`;
}
var appState;
var init_state = __esm({
  "../dist/state.js"() {
    "use strict";
    appState = { todos: [], mode: "default" };
  }
});

// ../dist/tools/filesystem/read.js
var import_node_fs9, import_node_path8, MAX_FILE_BYTES, MAX_OUTPUT_TOKENS, DEFAULT_LIMIT, readTool;
var init_read = __esm({
  "../dist/tools/filesystem/read.js"() {
    "use strict";
    import_node_fs9 = __toESM(require("node:fs"), 1);
    import_node_path8 = __toESM(require("node:path"), 1);
    init_types();
    MAX_FILE_BYTES = 256 * 1024;
    MAX_OUTPUT_TOKENS = 25e3;
    DEFAULT_LIMIT = 2e3;
    readTool = {
      name: "Read",
      description: [
        "Reads a file from the local filesystem.",
        "- file_path must be an absolute path",
        "- reads up to 2000 lines by default; use offset/limit for long files",
        "- lines longer than 2000 chars are truncated",
        "- results use cat -n format (line numbers)",
        "- You can call multiple Reads in one message; batch independent reads."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to read" },
          offset: { type: "number", description: "Line number to start reading from (1-indexed)" },
          limit: { type: "number", description: "Number of lines to read" }
        },
        required: ["file_path"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: Number.POSITIVE_INFINITY,
      async call(input, ctx) {
        const filePath = import_node_path8.default.resolve(ctx.cwd, input.file_path);
        let st;
        try {
          st = import_node_fs9.default.statSync(filePath);
        } catch {
          throw new Error(`File does not exist: ${filePath}`);
        }
        if (st.isDirectory())
          throw new Error(`EISDIR: illegal operation on a directory, read: ${filePath}`);
        if (st.size > MAX_FILE_BYTES) {
          throw new Error(`File content (${(st.size / 1024).toFixed(0)}KB) exceeds maximum allowed size (256KB). Read a specific range with offset/limit on a smaller file, or use Grep to find the relevant section.`);
        }
        const raw = import_node_fs9.default.readFileSync(filePath, "utf8");
        const allLines = raw.split("\n");
        const total = allLines.length;
        const offset = Math.max(1, Math.floor(input.offset ?? 1));
        const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
        const slice = allLines.slice(offset - 1, offset - 1 + limit);
        const outLines = [];
        for (let i = 0; i < slice.length; i++) {
          const lineNo = offset + i;
          let line = slice[i] ?? "";
          if (line.length > 2e3)
            line = line.slice(0, 2e3) + "\u2026 [line truncated]";
          outLines.push(`${String(lineNo).padStart(6)}	${line}`);
        }
        let content = outLines.join("\n");
        if (offset - 1 + limit < total) {
          content += `

[Showing ${slice.length} of ${total} lines. Use offset=${offset + limit} to continue.]`;
        }
        if (estimateTokens(content) > MAX_OUTPUT_TOKENS) {
          throw new Error(`Read output exceeds ${MAX_OUTPUT_TOKENS} tokens \u2014 use offset/limit to read less.`);
        }
        ctx.readFileState.set(filePath, { mtimeMs: st.mtimeMs });
        return { data: content };
      }
    };
  }
});

// ../dist/tools/filesystem/write.js
var import_node_fs10, import_node_path9, writeTool;
var init_write = __esm({
  "../dist/tools/filesystem/write.js"() {
    "use strict";
    import_node_fs10 = __toESM(require("node:fs"), 1);
    import_node_path9 = __toESM(require("node:path"), 1);
    writeTool = {
      name: "Write",
      description: [
        "Writes a file to the local filesystem, overwriting if it exists.",
        "- If the file exists, you MUST Read it first (this tool errors otherwise).",
        "- Prefer Edit over Write for existing files; NEVER write new files unless required.",
        "- Do not create documentation files unless explicitly asked."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to write" },
          content: { type: "string", description: "The content to write" }
        },
        required: ["file_path", "content"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: false,
      isConcurrencySafe: false,
      checkPermissions: () => "ask",
      maxResultSizeChars: 2e3,
      async call(input, ctx) {
        const filePath = import_node_path9.default.resolve(ctx.cwd, input.file_path);
        const exists = import_node_fs10.default.existsSync(filePath);
        if (exists && !ctx.readFileState.has(filePath)) {
          throw new Error(`File has not been read yet. Read it first before writing to it (${filePath}).`);
        }
        import_node_fs10.default.mkdirSync(import_node_path9.default.dirname(filePath), { recursive: true });
        if (exists)
          ctx.checkpoint?.(filePath, import_node_fs10.default.readFileSync(filePath, "utf8"));
        const tmp = filePath + ".vexa-tmp-" + Date.now();
        import_node_fs10.default.writeFileSync(tmp, input.content);
        import_node_fs10.default.renameSync(tmp, filePath);
        ctx.readFileState.set(filePath, { mtimeMs: import_node_fs10.default.statSync(filePath).mtimeMs });
        return { data: exists ? `Updated ${filePath} (${input.content.length} bytes)` : `Created ${filePath} (${input.content.length} bytes)` };
      }
    };
  }
});

// ../dist/tools/filesystem/edit.js
function normalize(s) {
  let out = s;
  for (const [re, rep] of CURLY)
    out = out.replace(re, rep);
  return out;
}
function toCurly(s) {
  let dqOpen = false;
  let sqOpen = false;
  let out = "";
  for (const ch of s) {
    if (ch === '"') {
      out += dqOpen ? "\u201D" : "\u201C";
      dqOpen = !dqOpen;
    } else if (ch === "'") {
      out += sqOpen ? "\u2019" : "\u2018";
      sqOpen = !sqOpen;
    } else
      out += ch;
  }
  return out;
}
function makePatch(oldContent, newContent, contextLines = 4) {
  const a = oldContent.split("\n");
  const b = newContent.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start])
    start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const ctx0 = Math.max(0, start - contextLines);
  const ctx1 = Math.min(a.length, endA + 1 + contextLines);
  const lines = [];
  for (let i = ctx0; i < start; i++)
    lines.push(`  ${a[i] ?? ""}`);
  for (let i = start; i <= endA; i++)
    lines.push(`- ${a[i] ?? ""}`);
  for (let i = start; i <= endB; i++)
    lines.push(`+ ${b[i] ?? ""}`);
  for (let i = endA + 1; i < ctx1; i++)
    lines.push(`  ${a[i] ?? ""}`);
  return lines.join("\n");
}
var import_node_fs11, import_node_path10, CURLY, editTool;
var init_edit = __esm({
  "../dist/tools/filesystem/edit.js"() {
    "use strict";
    import_node_fs11 = __toESM(require("node:fs"), 1);
    import_node_path10 = __toESM(require("node:path"), 1);
    CURLY = [
      [/[\u2018\u2019\u201B]/g, "'"],
      [/[\u201C\u201D\u201F]/g, '"'],
      [/[\u2013\u2014]/g, "-"]
    ];
    editTool = {
      name: "Edit",
      description: [
        "Performs exact string replacements in files.",
        "- You MUST Read the file before editing (this tool errors otherwise).",
        "- The edit FAILS if old_string is not unique in the file \u2014 either include more surrounding context to make it unique, or use replace_all.",
        "- replace_all replaces every occurrence (useful for renaming).",
        "- NEVER write new files; prefer editing existing ones."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file to modify" },
          old_string: { type: "string", description: "The text to replace" },
          new_string: { type: "string", description: "The text to replace it with (must differ)" },
          replace_all: { type: "boolean", description: "Replace all occurrences (default false)" }
        },
        required: ["file_path", "old_string", "new_string"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: false,
      isConcurrencySafe: false,
      checkPermissions: () => "ask",
      maxResultSizeChars: 8e3,
      async call(input, ctx) {
        const filePath = import_node_path10.default.resolve(ctx.cwd, input.file_path);
        if (input.old_string === input.new_string) {
          throw new Error("No changes to make: old_string and new_string are exactly the same.");
        }
        if (!ctx.readFileState.has(filePath)) {
          throw new Error(`File has not been read yet. Read it first before editing (${filePath}).`);
        }
        const original = import_node_fs11.default.readFileSync(filePath, "utf8");
        if (input.old_string !== "" && input.new_string.includes(input.old_string)) {
          throw new Error("old_string is a substring of new_string \u2014 this would grow the match on every edit. Include more surrounding context instead.");
        }
        let searchContent = original;
        let oldStr = input.old_string;
        let newStr = input.new_string;
        let normalized = false;
        if (oldStr !== "" && !original.includes(oldStr)) {
          const normContent = normalize(original);
          const normOld = normalize(oldStr);
          if (normContent.includes(normOld)) {
            searchContent = normContent;
            oldStr = normOld;
            newStr = normalize(newStr);
            normalized = true;
          }
        }
        const count = oldStr === "" ? 0 : searchContent.split(oldStr).length - 1;
        if (count === 0) {
          throw new Error(`String not found in file: ${JSON.stringify(oldStr.slice(0, 120))}${normalized ? " (after quote normalization)" : ""}`);
        }
        if (count > 1 && input.replace_all !== true) {
          throw new Error(`Found ${count} occurrences of old_string \u2014 provide more surrounding context to make it unique, or set replace_all=true.`);
        }
        let newContent;
        if (normalized) {
          const hadCurly = /[\u2018\u2019\u201C\u201D]/.test(original);
          const applied = hadCurly ? toCurly(newStr) : newStr;
          newContent = original;
          const positions = [];
          let idx = searchContent.indexOf(oldStr);
          while (idx !== -1) {
            positions.push(idx);
            idx = searchContent.indexOf(oldStr, idx + oldStr.length);
          }
          const targets = (input.replace_all === true ? positions : positions.slice(0, 1)).filter((t) => t !== void 0);
          targets.sort((x, y) => y - x);
          for (const pos of targets) {
            newContent = newContent.slice(0, pos) + applied + newContent.slice(pos + oldStr.length);
          }
        } else {
          newContent = input.replace_all === true ? oldStr === "" ? original : original.split(oldStr).join(newStr) : original.replace(oldStr, () => newStr);
        }
        if (newContent === original) {
          throw new Error("No changes to make: replacement produced identical content.");
        }
        const patch = makePatch(original, newContent);
        ctx.checkpoint?.(filePath, original);
        import_node_fs11.default.writeFileSync(filePath, newContent);
        ctx.readFileState.set(filePath, { mtimeMs: import_node_fs11.default.statSync(filePath).mtimeMs });
        return { data: `${normalized ? "[quote-normalized] " : ""}Edited ${filePath}:
${patch}` };
      }
    };
  }
});

// ../dist/tools/filesystem/glob.js
function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === void 0)
      break;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/\\\\]*";
      }
    } else if (ch === "?")
      re += "[^/\\\\]";
    else if (ch === "{")
      re += "(?:";
    else if (ch === "}")
      re += ")";
    else if (ch === ",")
      re += "|";
    else
      re += ch.replace(/[.+^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}
function walk(dir, out, depth, ignores) {
  if (depth > 12 || out.length > 2e4)
    return;
  let entries;
  try {
    entries = import_node_fs12.default.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git")
      continue;
    if (ignores.some((re) => re.test(e.name)))
      continue;
    const full = import_node_path11.default.join(dir, e.name);
    if (e.isDirectory())
      walk(full, out, depth + 1, ignores);
    else if (e.isFile())
      out.push(full);
  }
}
function gitignorePatterns(base) {
  const res = [];
  try {
    const raw = import_node_fs12.default.readFileSync(import_node_path11.default.join(base, ".gitignore"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (t === "" || t.startsWith("#") || t.startsWith("!"))
        continue;
      const name = t.replace(/\/+$/, "").split("/").pop() ?? "";
      if (name === "" || name === "*")
        continue;
      res.push(new RegExp(`^${name.replace(/[.+^$()|[\]{}?*]/g, (m) => m === "*" ? ".*" : `\\${m}`)}$`, "i"));
    }
  } catch {
  }
  return res;
}
var import_node_fs12, import_node_path11, globTool;
var init_glob = __esm({
  "../dist/tools/filesystem/glob.js"() {
    "use strict";
    import_node_fs12 = __toESM(require("node:fs"), 1);
    import_node_path11 = __toESM(require("node:path"), 1);
    globTool = {
      name: "Glob",
      description: [
        "Fast file pattern matching tool that works with any codebase size.",
        '- Supports glob patterns like "**/*.js" or "src/**/*.ts"',
        "- Returns matching file paths sorted by modification time",
        "- Use this when you need to find files by name patterns"
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The glob pattern to match files against" },
          path: { type: "string", description: "Directory to search in (default: cwd)" }
        },
        required: ["pattern"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: 5e4,
      async call(input, ctx) {
        const base = import_node_path11.default.resolve(ctx.cwd, input.path ?? ".");
        if (!import_node_fs12.default.existsSync(base) || !import_node_fs12.default.statSync(base).isDirectory()) {
          throw new Error(`Not a directory: ${base}`);
        }
        const files = [];
        walk(base, files, 0, gitignorePatterns(base));
        const re = globToRegExp(input.pattern);
        const matches = files.filter((f) => {
          const rel = import_node_path11.default.relative(base, f).replace(/\\/g, "/");
          return re.test(rel) || re.test(import_node_path11.default.basename(f));
        });
        matches.sort((a, b) => import_node_fs12.default.statSync(a).mtimeMs - import_node_fs12.default.statSync(b).mtimeMs);
        return { data: matches };
      }
    };
  }
});

// ../dist/tools/filesystem/grep.js
function runRg(args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = (0, import_node_child_process2.execFile)("rg", args, { cwd, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const code = err !== null && typeof err.code === "number" ? err.code : err === null ? 0 : 1;
      if (err !== null && err.code === "ENOENT")
        resolve("missing");
      else
        resolve({ stdout, stderr, code });
    });
    void child;
  });
}
var import_node_child_process2, grepTool;
var init_grep = __esm({
  "../dist/tools/filesystem/grep.js"() {
    "use strict";
    import_node_child_process2 = require("node:child_process");
    grepTool = {
      name: "Grep",
      description: [
        "A powerful search tool built on ripgrep.",
        "  - ALWAYS use Grep for search tasks. NEVER invoke grep or rg via Bash.",
        "  - Supports full regex syntax (ripgrep syntax, not grep)",
        '  - Output modes: "content" (matching lines), "files_with_matches" (paths, default), "count"',
        '  - Filter files with glob ("*.js") or type ("py", "ts", ...)',
        "  - Use -A/-B/-C for context lines, head_limit to cap output",
        "  - Multiline: set multiline=true for cross-line patterns"
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "The regular expression to search for" },
          path: { type: "string", description: "File or directory to search (default cwd)" },
          glob: { type: "string", description: 'Glob filter, e.g. "*.ts"' },
          output_mode: { type: "string", enum: ["content", "files_with_matches", "count"] },
          "-B": { type: "number", description: "Lines before each match" },
          "-A": { type: "number", description: "Lines after each match" },
          "-C": { type: "number", description: "Lines before and after" },
          "-i": { type: "boolean", description: "Case-insensitive" },
          "-n": { type: "boolean", description: "Show line numbers (content mode)" },
          type: { type: "string", description: "File type (rg --type)" },
          head_limit: { type: "number", description: "Limit output entries" },
          multiline: { type: "boolean", description: "Cross-line matching" }
        },
        required: ["pattern"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: 5e4,
      async call(input, ctx) {
        const mode = input.output_mode ?? "files_with_matches";
        const args = [];
        if (mode === "content") {
          args.push("-n");
          if (input["-B"] !== void 0)
            args.push("-B", String(input["-B"]));
          if (input["-A"] !== void 0)
            args.push("-A", String(input["-A"]));
          if (input["-C"] !== void 0)
            args.push("-C", String(input["-C"]));
        }
        if (input["-i"] === true)
          args.push("-i");
        if (input.multiline === true)
          args.push("-U", "--multiline-dotall");
        if (input.glob !== void 0)
          args.push("--glob", input.glob);
        if (input.type !== void 0)
          args.push("--type", input.type);
        if (mode === "files_with_matches")
          args.push("--files-with-matches");
        if (mode === "count")
          args.push("--count");
        args.push("-e", input.pattern);
        args.push(input.path !== void 0 ? String(input.path) : ".");
        const r = await runRg(args, ctx.cwd, 3e4);
        if (r === "missing") {
          throw new Error("ripgrep (rg) is not installed. Install it (winget install BurntSushi.ripgrep.MSVC) or add it to PATH \u2014 Grep is built on it.");
        }
        if (r.code !== 0 && r.code !== 1) {
          throw new Error(`rg exited ${r.code}: ${r.stderr.slice(0, 300)}`);
        }
        let out = r.stdout;
        if (r.code === 1 || out.trim() === "")
          return { data: "No matches found" };
        if (input.head_limit !== void 0) {
          const lines = out.split("\n");
          out = lines.slice(0, input.head_limit).join("\n") + (lines.length > input.head_limit ? `
\u2026 (${lines.length - input.head_limit} more)` : "");
        }
        return { data: out.trimEnd() };
      }
    };
  }
});

// ../dist/tools/filesystem/ls.js
function matchAny(name, patterns) {
  for (const p of patterns) {
    const re = new RegExp(`^${p.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
    if (re.test(name))
      return true;
  }
  return false;
}
var import_node_fs13, import_node_path12, lsTool;
var init_ls = __esm({
  "../dist/tools/filesystem/ls.js"() {
    "use strict";
    import_node_fs13 = __toESM(require("node:fs"), 1);
    import_node_path12 = __toESM(require("node:path"), 1);
    lsTool = {
      name: "LS",
      description: [
        "Lists files and directories in a given path. The path must be absolute.",
        "Optionally provide ignore glob patterns. Prefer Glob and Grep when you know which directories to search."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the directory to list" },
          ignore: { type: "array", items: { type: "string" }, description: "Glob patterns to ignore" }
        },
        required: ["path"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: 5e4,
      async call(input, ctx) {
        const dir = import_node_path12.default.resolve(ctx.cwd, input.path);
        let entries;
        try {
          entries = import_node_fs13.default.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
          throw new Error(`Cannot list ${dir}: ${e.message}`);
        }
        const ignore = input.ignore ?? ["node_modules", ".git"];
        const lines = [];
        for (const e of entries) {
          if (ignore.some((p) => matchAny(e.name, [p])))
            continue;
          const kind = e.isDirectory() ? "[dir]" : e.isFile() ? "" : "[link]";
          lines.push(`${kind === "" ? "- " : kind + " "}${e.name}`);
        }
        if (lines.length === 0)
          return { data: "(empty directory)" };
        return { data: lines.sort().join("\n") };
      }
    };
  }
});

// ../dist/tools/bash/internals.js
function resolveShell() {
  if (cachedShell !== null)
    return cachedShell;
  const envCmd = process.env["VEXA_SHELL_CMD"];
  if (envCmd !== void 0 && envCmd !== "") {
    cachedShell = { cmd: envCmd, args: (process.env["VEXA_SHELL_ARGS"] ?? "-c").split(" ") };
    return cachedShell;
  }
  const candidates = process.platform === "win32" ? [
    { cmd: "bash.exe", args: ["-c"] },
    { cmd: "C:\\Program Files\\Git\\bin\\bash.exe", args: ["-c"] },
    { cmd: `${process.env["ProgramFiles"] ?? "C:\\Program Files"}\\Git\\usr\\bin\\bash.exe`, args: ["-c"] },
    { cmd: "cmd.exe", args: ["/d", "/s", "/c"] }
  ] : [{ cmd: "bash", args: ["-c"] }];
  for (const cand of candidates) {
    try {
      (0, import_node_child_process3.execFileSync)(cand.cmd, [...cand.args, "true"], {
        timeout: 5e3,
        windowsHide: true,
        stdio: "ignore"
      });
      cachedShell = cand;
      return cachedShell;
    } catch (err) {
      if (err.code === "ENOENT")
        continue;
      cachedShell = cand;
      return cachedShell;
    }
  }
  cachedShell = { cmd: "cmd.exe", args: ["/d", "/s", "/c"] };
  return cachedShell;
}
function shellOutputDir() {
  const dir = import_node_path13.default.join(import_node_os3.default.tmpdir(), "vexa-bash");
  import_node_fs14.default.mkdirSync(dir, { recursive: true });
  return dir;
}
function truncateMiddle(s, cap = MAX_OUTPUT_CHARS) {
  if (s.length <= cap)
    return s;
  const removed = s.length - cap;
  const half = Math.floor(cap / 2);
  return `${s.slice(0, half)}

[output truncated: ${removed.toLocaleString()} characters removed]

${s.slice(s.length - half)}`;
}
function nextShellId() {
  counter++;
  return `bash_${Date.now().toString(36)}_${counter}`;
}
function killTree(child) {
  if (process.platform === "win32") {
    if (child.pid !== void 0)
      (0, import_node_child_process3.spawn)("taskkill", ["/F", "/T", "/PID", String(child.pid)], { windowsHide: true });
  } else {
    child.kill("SIGKILL");
  }
}
var import_node_child_process3, import_node_fs14, import_node_os3, import_node_path13, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MAX_OUTPUT_CHARS, BLOCKING_LIMIT_MS, shells, cachedShell, counter;
var init_internals = __esm({
  "../dist/tools/bash/internals.js"() {
    "use strict";
    import_node_child_process3 = require("node:child_process");
    import_node_fs14 = __toESM(require("node:fs"), 1);
    import_node_os3 = __toESM(require("node:os"), 1);
    import_node_path13 = __toESM(require("node:path"), 1);
    DEFAULT_TIMEOUT_MS = Number(process.env["VEXA_BASH_DEFAULT_TIMEOUT_MS"] ?? 12e4);
    MAX_TIMEOUT_MS = Math.max(DEFAULT_TIMEOUT_MS, Number(process.env["VEXA_BASH_MAX_TIMEOUT_MS"] ?? 6e5));
    MAX_OUTPUT_CHARS = Math.min(Number(process.env["VEXA_MAX_OUTPUT_LENGTH"] ?? 3e4), 15e4);
    BLOCKING_LIMIT_MS = Number(process.env["VEXA_BASH_BLOCKING_MS"] ?? 15e3);
    shells = /* @__PURE__ */ new Map();
    cachedShell = null;
    counter = 0;
  }
});

// ../dist/tools/bash/bash.js
function startShell(command, cwd) {
  const { cmd, args } = resolveShell();
  const id = nextShellId();
  const filePath = import_node_path14.default.join(shellOutputDir(), `${id}.log`);
  const fd = import_node_fs15.default.openSync(filePath, "w");
  const child = (0, import_node_child_process4.spawn)(cmd, [...args, command], {
    cwd,
    stdio: ["ignore", fd, fd],
    windowsHide: true
  });
  import_node_fs15.default.closeSync(fd);
  const shell = {
    id,
    child,
    filePath,
    startedAt: Date.now(),
    killed: false,
    done: false,
    exitCode: null
  };
  child.on("exit", (code) => {
    shell.done = true;
    shell.exitCode = code ?? null;
  });
  child.on("error", (err) => {
    shell.spawnError = err.message;
    shell.done = true;
  });
  shells.set(id, shell);
  return shell;
}
function drainOutput(shell) {
  try {
    return import_node_fs15.default.readFileSync(shell.filePath, "utf8");
  } catch {
    return "";
  }
}
var import_node_child_process4, import_node_fs15, import_node_path14, bashTool;
var init_bash = __esm({
  "../dist/tools/bash/bash.js"() {
    "use strict";
    import_node_child_process4 = require("node:child_process");
    import_node_fs15 = __toESM(require("node:fs"), 1);
    import_node_path14 = __toESM(require("node:path"), 1);
    init_internals();
    bashTool = {
      name: "Bash",
      description: [
        "Executes a given bash command in a shell with optional timeout.",
        "Before executing:",
        "1. If the command will create new directories or files, first use LS/Read to verify the location.",
        "2. Always quote file paths that contain spaces with double quotes.",
        "Usage notes:",
        "  - The command argument is required. Optional timeout in ms (max 600000); default 120000.",
        "  - If output exceeds 30000 characters it will be middle-truncated.",
        "  - Use run_in_background for long-running commands; monitor via BashOutput. NEVER use it for sleep.",
        "  - VERY IMPORTANT: avoid find/grep/cat/head/tail \u2014 use Grep, Glob, Read instead.",
        "  - Verify paths before rm/Move-type operations. NEVER delete without explicit user request."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to execute" },
          timeout: { type: "number", description: "Optional timeout in ms (max 600000)" },
          run_in_background: { type: "boolean", description: "Run in background; read output later with BashOutput" },
          description: { type: "string", description: "Clear, concise description in 5-10 words" }
        },
        required: ["command"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: false,
      isConcurrencySafe: false,
      checkPermissions: () => "ask",
      maxResultSizeChars: 5e4,
      async call(input, ctx) {
        if (input.run_in_background !== true && /^\s*sleep(\s|$)/.test(input.command)) {
          throw new Error("Foreground sleep refused \u2014 it blocks the session. Use run_in_background: true if you must wait, or just proceed; tools re-check state automatically.");
        }
        const timeout = Math.min(Math.max(1e3, Math.floor(input.timeout ?? DEFAULT_TIMEOUT_MS)), MAX_TIMEOUT_MS);
        if (input.run_in_background === true) {
          const shell2 = startShell(input.command, ctx.cwd);
          return { data: `Background shell started: ${shell2.id}
Output file: ${shell2.filePath}
Use BashOutput with this id to read new output; KillShell to terminate.` };
        }
        const shell = startShell(input.command, ctx.cwd);
        const movedAt = setTimeout(() => {
          if (!shell.done && !shell.killed) {
            shell.autoBackgrounded = true;
          }
        }, BLOCKING_LIMIT_MS);
        const code = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            killTree(shell.child);
            shell.killed = true;
            resolve(shell.exitCode ?? -999);
          }, timeout);
          shell.child.once("exit", (c2) => {
            clearTimeout(timer);
            clearTimeout(movedAt);
            resolve(c2 ?? 0);
          });
          shell.child.once("error", () => {
            clearTimeout(timer);
            clearTimeout(movedAt);
            resolve(-1);
          });
        });
        if (shell.spawnError !== void 0) {
          clearTimeout(movedAt);
          return {
            data: `[spawn failed: ${shell.spawnError}]
Set VEXA_SHELL_CMD to a shell on your PATH (e.g. powershell.exe) if the auto-detected one is missing.`
          };
        }
        if (shell.autoBackgrounded === true) {
          clearTimeout(movedAt);
          return {
            data: `[moved to background after ${Math.round(BLOCKING_LIMIT_MS / 1e3)}s] Command still running: ${shell.id}
Continue working and use BashOutput(shell_id="${shell.id}") to check output later.`
          };
        }
        const output = truncateMiddle(drainOutput(shell));
        const suffix = shell.killed ? `
[command timed out after ${timeout}ms and was terminated]` : code !== 0 ? `
[exit code: ${String(code)}]` : "";
        return { data: (output === "" ? "(no output)" : output) + suffix };
      }
    };
  }
});

// ../dist/tools/bash/bashOutput.js
var import_node_fs16, cursors, bashOutputTool, killShellTool;
var init_bashOutput = __esm({
  "../dist/tools/bash/bashOutput.js"() {
    "use strict";
    import_node_fs16 = __toESM(require("node:fs"), 1);
    init_internals();
    init_internals();
    cursors = /* @__PURE__ */ new Map();
    bashOutputTool = {
      name: "BashOutput",
      description: "Retrieves new output from a background shell (only output since the last check), plus its status. Optional regex filter for matching lines.",
      inputSchema: {
        type: "object",
        properties: {
          bash_id: { type: "string", description: "The shell id returned by Bash run_in_background" },
          filter: { type: "string", description: "Regex \u2014 only matching lines are returned" }
        },
        required: ["bash_id"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: 5e4,
      async call(input) {
        const shell = shells.get(input.bash_id);
        if (shell === void 0) {
          throw new Error(`Unknown shell id: ${input.bash_id} (it may have been started in another session)`);
        }
        let all = "";
        try {
          all = import_node_fs16.default.readFileSync(shell.filePath, "utf8");
        } catch {
          all = "";
        }
        const cursor = cursors.get(input.bash_id) ?? 0;
        const fresh = all.slice(cursor);
        cursors.set(input.bash_id, all.length);
        let out = fresh === "" ? "(no new output)" : truncateMiddle(fresh);
        if (input.filter !== void 0 && fresh !== "") {
          try {
            const re = new RegExp(input.filter);
            out = fresh.split("\n").filter((l) => re.test(l)).join("\n") || "(no lines matched filter)";
          } catch {
            throw new Error(`Invalid filter regex: ${input.filter}`);
          }
        }
        const status = shell.killed ? "killed" : shell.done ? `exited (code ${String(shell.exitCode)})` : "running";
        return { data: `[status: ${status}]
${out}` };
      }
    };
    killShellTool = {
      name: "KillShell",
      description: "Kills a running background bash shell by its ID.",
      inputSchema: {
        type: "object",
        properties: { shell_id: { type: "string", description: "The shell id to kill" } },
        required: ["shell_id"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: false,
      isConcurrencySafe: true,
      checkPermissions: () => "ask",
      maxResultSizeChars: 1e3,
      async call(input) {
        const shell = shells.get(input.shell_id);
        if (shell === void 0)
          throw new Error(`Unknown shell id: ${input.shell_id}`);
        if (!shell.done && !shell.killed) {
          killTree(shell.child);
          shell.killed = true;
          return { data: `Killed shell ${input.shell_id}` };
        }
        return { data: `Shell ${input.shell_id} already stopped (${shell.killed ? "killed" : `exited ${String(shell.exitCode)}`})` };
      }
    };
  }
});

// ../dist/tools/todo.js
var todoTool;
var init_todo = __esm({
  "../dist/tools/todo.js"() {
    "use strict";
    init_state();
    todoTool = {
      name: "TodoWrite",
      description: [
        "Use this tool to create and manage a structured task list for the current session.",
        "Use proactively for complex multi-step tasks (3+ steps); mark tasks completed IMMEDIATELY after finishing them; keep exactly one task in_progress.",
        "Skip it for single trivial tasks."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string", minLength: 1, description: "The task (imperative form)" },
                status: { type: "string", enum: ["pending", "in_progress", "completed"] },
                activeForm: { type: "string", description: 'Present-continuous label shown while working (e.g. "Running tests")' }
              },
              required: ["content", "status"],
              additionalProperties: false
            },
            description: "The updated todo list"
          }
        },
        required: ["todos"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: false,
      checkPermissions: () => "allow",
      maxResultSizeChars: 2e3,
      async call(input) {
        const todos = (input.todos ?? []).map((t) => ({
          content: String(t.content),
          status: t.status,
          ...t.activeForm !== void 0 ? { activeForm: t.activeForm } : {}
        }));
        const inProgress = todos.filter((t) => t.status === "in_progress").length;
        if (inProgress > 1) {
          throw new Error(`Only one task may be in_progress at a time (found ${inProgress}).`);
        }
        appState.todos = todos;
        appState.onTodosChanged?.(todos);
        return { data: `Todos updated:
${renderTodos(todos)}` };
      }
    };
  }
});

// ../dist/tools/plan.js
var exitPlanModeTool;
var init_plan = __esm({
  "../dist/tools/plan.js"() {
    "use strict";
    init_state();
    exitPlanModeTool = {
      name: "ExitPlanMode",
      description: [
        "Use this tool when you are in plan mode and have finished presenting your plan and are ready to code.",
        "It prompts the user to approve the plan and exits plan mode on approval.",
        "IMPORTANT: Only use this for tasks that require writing code. For pure research/information tasks, do NOT use this tool."
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          plan: { type: "string", description: "The plan you came up with, to run by the user. Markdown. Pretty concise." }
        },
        required: ["plan"],
        additionalProperties: false
      },
      isEnabled: () => appState.mode === "plan",
      isReadOnly: true,
      isConcurrencySafe: false,
      checkPermissions: () => "allow",
      maxResultSizeChars: 1e3,
      async call(input) {
        if (appState.mode !== "plan") {
          throw new Error("Not in plan mode.");
        }
        const approve = appState.planApproval;
        if (approve === void 0) {
          throw new Error("No approval handler available in this context.");
        }
        const ok = await approve(input.plan);
        if (!ok) {
          return { data: "Plan rejected \u2014 stay in plan mode. Refine the plan or gather more information." };
        }
        appState.mode = "default";
        return { data: "Plan approved \u2014 exited plan mode. You may now implement." };
      }
    };
  }
});

// ../dist/tools/web/webFetch.js
function htmlToText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"').replace(/&#39;/g, "'").split("\n").map((l) => l.trim()).filter((l) => l !== "").join("\n");
}
var CACHE_TTL_MS, cache, webFetchTool;
var init_webFetch = __esm({
  "../dist/tools/web/webFetch.js"() {
    "use strict";
    CACHE_TTL_MS = 15 * 60 * 1e3;
    cache = /* @__PURE__ */ new Map();
    webFetchTool = {
      name: "WebFetch",
      description: [
        "Fetches content from a URL and processes it with your prompt.",
        "- URL must be fully-formed; http upgrades to https",
        "- 15-minute cache for repeat fetches",
        "- Cross-host redirects are returned to you for a follow-up request",
        "- Read-only; does not modify files"
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", format: "uri", description: "The URL to fetch" },
          prompt: { type: "string", description: "What to extract from the page" }
        },
        required: ["url", "prompt"],
        additionalProperties: false
      },
      isEnabled: () => true,
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: 5e4,
      async call(input, ctx) {
        let url = input.url;
        if (url.startsWith("http://"))
          url = "https://" + url.slice(7);
        const cached = cache.get(url);
        let pageText;
        if (cached !== void 0 && Date.now() - cached.at < CACHE_TTL_MS) {
          pageText = cached.text;
        } else {
          const res = await fetch(url, { redirect: "follow", signal: ctx.abortController.signal, headers: { "User-Agent": "vexa-code/0.1" } });
          const finalHost = new URL(res.url).host;
          const origHost = new URL(url).host;
          if (finalHost !== origHost && !res.url.startsWith(url)) {
            return { data: `Redirected to a different host: ${res.url}. Make a new WebFetch request with this URL if you want the content.` };
          }
          if (!res.ok)
            throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
          pageText = htmlToText(await res.text()).slice(0, 1e5);
          cache.set(url, { at: Date.now(), text: pageText });
        }
        const maxChars = 2e4;
        const body = pageText.length > maxChars ? pageText.slice(0, maxChars) + `
[truncated ${pageText.length - maxChars} chars]` : pageText;
        return { data: `Content of ${url} (user asks: ${input.prompt}):

${body}` };
      }
    };
  }
});

// ../dist/tools/web/webSearch.js
function isWebSearchConfigured() {
  const cfg = appState.webSearch;
  return cfg !== void 0 && process.env[cfg.apiKeyEnv] !== void 0 && (process.env[cfg.apiKeyEnv] ?? "") !== "";
}
var webSearchTool;
var init_webSearch = __esm({
  "../dist/tools/web/webSearch.js"() {
    "use strict";
    init_state();
    webSearchTool = {
      name: "WebSearch",
      description: [
        "Searches the web and returns result titles, URLs, and snippets.",
        "- Use for current information beyond your knowledge cutoff",
        "- Fetch page contents with WebFetch when a result looks relevant"
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 2, description: "The search query" },
          allowed_domains: { type: "array", items: { type: "string" }, description: "Only results from these domains" },
          blocked_domains: { type: "array", items: { type: "string" }, description: "Never results from these domains" }
        },
        required: ["query"],
        additionalProperties: false
      },
      isEnabled: () => isWebSearchConfigured(),
      isReadOnly: true,
      isConcurrencySafe: true,
      checkPermissions: () => "allow",
      maxResultSizeChars: 2e4,
      async call(input, _ctx) {
        const cfg = appState.webSearch;
        if (cfg === void 0)
          throw new Error('WebSearch not configured \u2014 set "webSearch": { "provider": "tavily", "apiKeyEnv": "TAVILY_API_KEY" } in ~/.vexa/config.json');
        const key = process.env[cfg.apiKeyEnv] ?? "";
        let results = [];
        if (cfg.provider === "tavily") {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: key, query: input.query, max_results: 8 })
          });
          if (!res.ok)
            throw new Error(`Tavily HTTP ${res.status}`);
          const data = await res.json();
          results = (data.results ?? []).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: (r.content ?? "").slice(0, 300) }));
        } else {
          const params = new URLSearchParams({ q: input.query, count: "8" });
          const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
            headers: { "X-Subscription-Token": key, Accept: "application/json" }
          });
          if (!res.ok)
            throw new Error(`Brave HTTP ${res.status}`);
          const data = await res.json();
          results = (data.web?.results ?? []).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: (r.description ?? "").slice(0, 300) }));
        }
        if (input.allowed_domains !== void 0 && input.allowed_domains.length > 0) {
          results = results.filter((r) => input.allowed_domains?.some((d) => r.url.includes(d)));
        }
        if (input.blocked_domains !== void 0 && input.blocked_domains.length > 0) {
          results = results.filter((r) => !input.blocked_domains?.some((d) => r.url.includes(d)));
        }
        if (results.length === 0)
          return { data: "No results found." };
        return {
          data: results.map((r, i) => `${i + 1}. ${r.title}
   ${r.url}
   ${r.snippet}`).join("\n\n")
        };
      }
    };
  }
});

// ../dist/agents/registry.js
function getAgentType(name) {
  const found = AGENT_TYPES.find((a) => a.name === name);
  return found !== void 0 ? found : AGENT_TYPES[0];
}
var mainLoopNames, AGENT_TYPES;
var init_registry = __esm({
  "../dist/agents/registry.js"() {
    "use strict";
    mainLoopNames = /* @__PURE__ */ new Set(["Task", "ExitPlanMode", "BashOutput", "KillShell", "TodoWrite"]);
    AGENT_TYPES = [
      {
        name: "general-purpose",
        description: "General-purpose agent for researching complex questions, searching code, and executing multi-step tasks. Use when searching a keyword may take multiple tries. (Tools: *)",
        systemPrompt: [
          "You are a general-purpose research and coding agent working inside Vexa Code.",
          "You are given a task by the coordinating agent. Investigate thoroughly using your tools, then report back.",
          "Your final message is the ONLY thing returned to the coordinator \u2014 make it a complete, self-contained report with file_path:line_number references.",
          "Be concise but complete. If you cannot finish, report exactly what you found and what remains."
        ].join("\n"),
        allow: (t) => !mainLoopNames.has(t.name)
      },
      {
        name: "Explore",
        description: "Read-only file-search specialist. Fast multi-round search across the codebase; reports findings with file:line references. Cannot modify anything.",
        systemPrompt: [
          "You are a fast file-search specialist inside Vexa Code.",
          "Search the codebase (Glob, Grep, Read, LS) and report findings.",
          "You have NO write tools \u2014 read-only research only.",
          "Final message: a concise findings report with file_path:line_number references. No preamble."
        ].join("\n"),
        allow: (t) => ["Read", "Glob", "Grep", "LS"].includes(t.name)
      }
    ];
  }
});

// ../dist/tools/task.js
function createTaskTool(deps) {
  return {
    name: "Task",
    description: [
      "Launch a new agent to handle complex, multi-step tasks autonomously.",
      "Available agent types: general-purpose (research + multi-step, all tools), Explore (read-only search specialist).",
      "When NOT to use: reading a specific file (use Read), searching a known class (use Glob), 2-3 file tasks.",
      "Usage notes:",
      "1. Launch multiple agents concurrently when independent (single message, multiple Task calls).",
      "2. Each invocation is stateless \u2014 put ALL needed context in prompt.",
      "3. The result is not visible to the user \u2014 summarize it afterwards.",
      "4. Use proactively when the task matches an agent description."
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "A short (3-5 word) description of the task" },
        prompt: { type: "string", description: "The detailed task for the agent to perform" },
        subagent_type: { type: "string", description: "The type of agent to use (general-purpose | Explore)" }
      },
      required: ["description", "prompt", "subagent_type"],
      additionalProperties: false
    },
    isEnabled: () => true,
    isReadOnly: false,
    isConcurrencySafe: true,
    // subagents run in parallel (isolated state)
    checkPermissions: () => "allow",
    maxResultSizeChars: 5e4,
    async call(input, ctx) {
      const type = getAgentType(input.subagent_type ?? "general-purpose");
      const subTools = deps.parentTools.filter(type.allow);
      if (subTools.length === 0)
        throw new Error(`Agent type "${type.name}" has no tools available`);
      const subMessages = [
        {
          uuid: globalThis.crypto.randomUUID(),
          parentUuid: null,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          type: "user",
          content: [{ type: "text", text: input.prompt }]
        }
      ];
      const subCtx = {
        abortController: deps.signal !== void 0 ? new AbortController() : ctx.abortController,
        readFileState: /* @__PURE__ */ new Map(),
        // isolated ledger [CX §6]
        cwd: ctx.cwd,
        agentId: `${ctx.agentId ?? "main"}-sub-${input.description.replace(/\s+/g, "-").toLowerCase().slice(0, 20)}`
      };
      const result = await runAgentTurn({
        baseUrl: deps.baseUrl,
        apiKey: deps.apiKey,
        model: deps.model,
        label: `${deps.label ?? "vexa"}:sub:${type.name}`,
        headers: deps.headers,
        system: type.systemPrompt,
        messages: subMessages,
        tools: subTools,
        maxTokens: deps.maxTokens,
        maxTokensParam: deps.maxTokensParam,
        temperature: deps.temperature,
        supports: deps.supports,
        dropFields: deps.dropFields,
        maxTurns: deps.maxTurns ?? SUB_MAX_TURNS,
        toolContext: subCtx,
        permissionAsk: deps.parentPermissionAsk,
        signal: deps.signal
      });
      const report = result.finalText !== "" ? result.finalText : `[${type.name} agent finished with ${result.toolCallCount} tool calls, no final text]`;
      return { data: report };
    }
  };
}
var SUB_MAX_TURNS;
var init_task = __esm({
  "../dist/tools/task.js"() {
    "use strict";
    init_queryLoop();
    init_registry();
    SUB_MAX_TURNS = 30;
  }
});

// ../dist/tools/registry.js
function getAllBaseTools() {
  return [
    readTool,
    globTool,
    grepTool,
    lsTool,
    editTool,
    writeTool,
    bashTool,
    todoTool,
    exitPlanModeTool,
    webFetchTool,
    webSearchTool,
    bashOutputTool,
    killShellTool
  ];
}
var init_registry2 = __esm({
  "../dist/tools/registry.js"() {
    "use strict";
    init_wire();
    init_read();
    init_write();
    init_edit();
    init_glob();
    init_grep();
    init_ls();
    init_bash();
    init_bashOutput();
    init_todo();
    init_plan();
    init_webFetch();
    init_webSearch();
    init_task();
  }
});

// ../dist/entrypoints/guiBridge.js
var guiBridge_exports = {};
__export(guiBridge_exports, {
  runGuiBridge: () => runGuiBridge
});
function runGuiBridge(ctx) {
  const send = (e) => {
    process.stdout.write(JSON.stringify(e) + "\n");
  };
  appState.webSearch = ctx.settings.webSearch;
  let key = "";
  try {
    key = resolveApiKey(ctx.resolved.profile, ctx.resolved.profileName);
  } catch (e) {
    send({ type: "error", fatal: true, message: e.message });
    process.exit(1);
  }
  const sessionVexamd = loadVexamd(process.cwd());
  const memoryDir = ensureMemoryDir(process.cwd());
  const memory = loadMemory(process.cwd());
  const skills = discoverSkills(process.cwd());
  const baseTools = getAllBaseTools().filter((t) => t.isEnabled());
  const tools = [
    ...baseTools,
    createTaskTool({
      baseUrl: ctx.resolved.profile.baseUrl,
      apiKey: key,
      model: ctx.resolved.modelId,
      label: ctx.resolved.profileName,
      headers: ctx.resolved.profile.headers,
      maxTokens: ctx.resolved.profile.maxTokens,
      maxTokensParam: ctx.resolved.profile.maxTokensParam,
      temperature: ctx.resolved.profile.temperature,
      supports: ctx.resolved.profile.supports,
      dropFields: ctx.resolved.profile.dropFields,
      parentTools: baseTools,
      parentPermissionAsk: async (tool, input) => {
        return new Promise((resolve) => {
          pendingPermission = { resolve };
          send({ type: "permission_request", id: crypto.randomUUID(), tool: tool.name, input });
        });
      },
      cwd: process.cwd(),
      maxTurns: 30
    })
  ];
  let sessionId = newSessionId();
  const newTranscript = () => new Transcript(transcriptPathFor(process.cwd(), sessionId), sessionId, ctx.version);
  let transcript = newTranscript();
  let pendingPermission = null;
  let interruptRequested = false;
  let currentAbort = null;
  const abortFor = () => {
    const abort = new AbortController();
    return {
      abort,
      toolCtx: {
        abortController: abort,
        readFileState: /* @__PURE__ */ new Map(),
        cwd: process.cwd()
      }
    };
  };
  const built = buildSystemPrompt({
    modelId: ctx.resolved.modelId,
    modelLabel: ctx.resolved.profileName,
    cwd: process.cwd(),
    isGitRepo: ctx.projectRoot !== null,
    toolsEnabled: tools.map((t) => t.name),
    vexamd: sessionVexamd,
    memoryContent: memory.content,
    memoryDir,
    skillsSection: skillsPromptSection(skills) ?? void 0
  });
  send({
    type: "ready",
    session_id: sessionId,
    model: ctx.resolved.modelId,
    provider: ctx.resolved.profileName,
    cwd: process.cwd(),
    version: ctx.version,
    memoryWarnings: memory.warnings
  });
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line === "")
        continue;
      try {
        void handleCommand(JSON.parse(line));
      } catch (e) {
        send({ type: "error", message: `bad command: ${e.message}` });
      }
    }
  });
  process.stdin.on("end", () => {
    if (activeTurns === 0)
      process.exit(0);
    stdinClosed = true;
  });
  let activeTurns = 0;
  let stdinClosed = false;
  async function handleCommand(cmd) {
    if (cmd.type === "permission_response") {
      if (pendingPermission !== null) {
        const p = pendingPermission;
        pendingPermission = null;
        p.resolve(cmd["allow"] === true);
      }
      return;
    }
    if (cmd.type === "interrupt") {
      interruptRequested = true;
      currentAbort?.abort();
      return;
    }
    if (cmd.type === "new_session") {
      sessionId = newSessionId();
      transcript = newTranscript();
      send({ type: "ready", session_id: sessionId, model: ctx.resolved.modelId, provider: ctx.resolved.profileName, cwd: process.cwd(), version: ctx.version });
      return;
    }
    if (cmd.type !== "user_message")
      return;
    const text = typeof cmd["text"] === "string" ? cmd["text"].trim() : "";
    if (text === "")
      return;
    activeTurns++;
    const { abort, toolCtx } = abortFor();
    currentAbort = abort;
    const userMsg = {
      uuid: crypto.randomUUID(),
      parentUuid: null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "user",
      content: [{ type: "text", text }]
    };
    await transcript.append(userMsg, { fsync: true });
    const messages = [userMsg];
    const mark = messages.length;
    let accText = "";
    interruptRequested = false;
    try {
      const r = await runAgentTurn({
        baseUrl: ctx.resolved.profile.baseUrl,
        apiKey: key,
        model: ctx.resolved.modelId,
        system: built.system,
        messages,
        tools,
        maxTokens: ctx.resolved.profile.maxTokens,
        maxTurns: ctx.flags.maxTurns ?? 100,
        toolContext: toolCtx,
        // interactive: ask via permission_request events; read-only tools allowed
        permissionAsk: async (tool, input) => {
          if (tool.isReadOnly === true)
            return true;
          return new Promise((resolve) => {
            pendingPermission = { resolve };
            send({ type: "permission_request", id: crypto.randomUUID(), tool: tool.name, input });
          });
        },
        onTextDelta: (delta) => {
          accText += delta;
          send({ type: "assistant_delta", text: delta });
        },
        onToolStart: (name, input) => {
          send({ type: "tool_use", name, input });
        },
        onToolResult: (name, content, isError) => {
          send({ type: "tool_result", name, content: String(content).slice(0, 8e3), isError: isError === true });
        },
        signal: abort.signal
      });
      for (const m of messages.slice(mark))
        await transcript.append(m);
      if (interruptRequested)
        abort.abort();
      send({ type: "assistant_message", text: r.finalText });
      send({ type: "turn_end", usage: r.usage, toolCalls: r.toolCallCount, finishReason: r.finishReason });
    } catch (e) {
      send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      send({ type: "turn_end", usage: null, toolCalls: 0, finishReason: "error" });
    }
    activeTurns--;
    if (stdinClosed && activeTurns === 0)
      process.exit(0);
  }
}
var init_guiBridge = __esm({
  "../dist/entrypoints/guiBridge.js"() {
    "use strict";
    init_profiles();
    init_vexamd();
    init_memory();
    init_skills();
    init_prompt();
    init_queryLoop();
    init_transcript();
    init_state();
    init_registry2();
    init_task();
  }
});

// ../dist/sessions/checkpoints.js
function createCheckpointer(sessionId, cwd) {
  const dir = import_node_path15.default.join(userConfigDir(), "checkpoints", sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"));
  import_node_fs17.default.mkdirSync(dir, { recursive: true });
  const manifest = import_node_path15.default.join(dir, "manifest.jsonl");
  let counter2 = 0;
  try {
    counter2 = import_node_fs17.default.readFileSync(manifest, "utf8").split("\n").filter((l) => l.trim() !== "").length;
  } catch {
  }
  const readManifest = () => import_node_fs17.default.readFileSync(manifest, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
  return {
    dir,
    save(filePath, priorContent) {
      counter2++;
      const hash = Math.abs([...filePath].reduce((a, c2) => a * 31 + c2.charCodeAt(0) | 0, 7)).toString(36);
      const backupFile = import_node_path15.default.join(dir, `${counter2}-${hash}.txt`);
      import_node_fs17.default.writeFileSync(backupFile, priorContent);
      const entry = { n: counter2, filePath, backupFile, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
      import_node_fs17.default.appendFileSync(manifest, JSON.stringify(entry) + "\n");
      return entry;
    },
    list() {
      if (!import_node_fs17.default.existsSync(manifest))
        return [];
      return readManifest();
    },
    restore(n) {
      const all = this.list();
      if (all.length === 0)
        return null;
      const entry = n === void 0 ? all[all.length - 1] : all.find((e) => e.n === n);
      if (entry === void 0)
        return null;
      const prior = import_node_fs17.default.readFileSync(entry.backupFile, "utf8");
      import_node_fs17.default.writeFileSync(entry.filePath, prior);
      return { entry, restoredBytes: prior.length };
    }
  };
}
var import_node_fs17, import_node_path15;
var init_checkpoints = __esm({
  "../dist/sessions/checkpoints.js"() {
    "use strict";
    import_node_fs17 = __toESM(require("node:fs"), 1);
    import_node_path15 = __toESM(require("node:path"), 1);
    init_paths();
  }
});

// ../dist/entrypoints/headless.js
var headless_exports = {};
__export(headless_exports, {
  runHeadless: () => runHeadless
});
async function runHeadless(ctx, positionals) {
  let prompt = positionals.join(" ").trim();
  const fmt = (process.env["VEXA_OUTPUT_FORMAT"] ?? "text").toLowerCase();
  if (prompt === "" && !process.stdin.isTTY) {
    prompt = (await readStdin()).trim();
  }
  if (prompt === "") {
    process.stderr.write("vexa: -p/--print needs a prompt (arg or stdin)\n");
    process.exit(2);
  }
  appState.webSearch = ctx.settings.webSearch;
  const sessionVexamd = loadVexamd(process.cwd());
  const memoryDir = ensureMemoryDir(process.cwd());
  const memory = loadMemory(process.cwd());
  const skills = discoverSkills(process.cwd());
  let key = "";
  try {
    key = resolveApiKey(ctx.resolved.profile, ctx.resolved.profileName);
  } catch (e) {
    process.stderr.write(`vexa: ${e.message}
`);
    process.exit(1);
  }
  const baseTools = getAllBaseTools().filter((t) => t.isEnabled());
  const tools = [
    ...baseTools,
    createTaskTool({
      baseUrl: ctx.resolved.profile.baseUrl,
      apiKey: key,
      model: ctx.resolved.modelId,
      label: ctx.resolved.profileName,
      headers: ctx.resolved.profile.headers,
      maxTokens: ctx.resolved.profile.maxTokens,
      maxTokensParam: ctx.resolved.profile.maxTokensParam,
      temperature: ctx.resolved.profile.temperature,
      supports: ctx.resolved.profile.supports,
      dropFields: ctx.resolved.profile.dropFields,
      parentTools: baseTools,
      parentPermissionAsk: async () => false,
      // headless subagents: no dialog
      cwd: process.cwd(),
      maxTurns: 30
    })
  ];
  const sessionId = newSessionId();
  const transcript = new Transcript(transcriptPathFor(process.cwd(), sessionId), sessionId, ctx.version);
  const abort = new AbortController();
  const readFileState2 = /* @__PURE__ */ new Map();
  const checkpointer = createCheckpointer(sessionId, process.cwd());
  const toolCtx = {
    abortController: abort,
    readFileState: readFileState2,
    cwd: process.cwd(),
    checkpoint: (fp, prior) => checkpointer.save(fp, prior)
  };
  const built = buildSystemPrompt({
    modelId: ctx.resolved.modelId,
    modelLabel: ctx.resolved.profileName,
    cwd: process.cwd(),
    isGitRepo: ctx.projectRoot !== null,
    toolsEnabled: tools.map((t) => t.name),
    permissionMode: "default",
    vexamd: sessionVexamd,
    memoryContent: memory.content,
    memoryDir,
    skillsSection: skillsPromptSection(skills) ?? void 0
  });
  const userMsg = {
    uuid: crypto.randomUUID(),
    parentUuid: null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "user",
    content: [{ type: "text", text: prompt }]
  };
  await transcript.append(userMsg, { fsync: true });
  const messages = [userMsg];
  const toolUses = [];
  const mark = messages.length;
  try {
    const r = await runAgentTurn({
      baseUrl: ctx.resolved.profile.baseUrl,
      apiKey: key,
      model: ctx.resolved.modelId,
      system: built.system,
      messages,
      tools,
      maxTokens: ctx.resolved.profile.maxTokens,
      maxTurns: ctx.flags.maxTurns ?? 50,
      toolContext: toolCtx,
      // headless permission flow: no dialog — read-only tools auto-allowed, writes denied
      permissionAsk: async (tool) => tool.isReadOnly === true,
      onToolResult: (name, _content, isError) => {
        toolUses.push({ name, isError });
      },
      signal: abort.signal
    });
    for (const m of messages.slice(mark))
      await transcript.append(m);
    if (fmt === "json") {
      process.stdout.write(JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: sessionId,
        result: r.finalText,
        toolUses: toolUses.length,
        usage: r.usage,
        finishReason: r.finishReason
      }, null, 2) + "\n");
    } else {
      process.stdout.write(r.finalText + "\n");
    }
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (fmt === "json") {
      process.stdout.write(JSON.stringify({ type: "result", subtype: "error", session_id: sessionId, error: msg }, null, 2) + "\n");
    } else {
      process.stderr.write(`vexa error: ${msg}
`);
    }
    process.exit(1);
  }
}
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
var init_headless = __esm({
  "../dist/entrypoints/headless.js"() {
    "use strict";
    init_profiles();
    init_vexamd();
    init_memory();
    init_skills();
    init_prompt();
    init_queryLoop();
    init_transcript();
    init_state();
    init_registry2();
    init_task();
    init_checkpoints();
  }
});

// ../dist/permissions/rules.js
function parseRule(rule) {
  const open = rule.indexOf("(");
  if (open === -1)
    return { tool: rule, content: null, prefix: null, glob: null };
  const tool = rule.slice(0, open);
  const end = rule.endsWith(")") ? rule.length - 1 : rule.length;
  const inner = rule.slice(open + 1, end) ?? "";
  if (inner.endsWith(":*")) {
    return { tool, content: inner, prefix: inner.slice(0, -2), glob: null };
  }
  return { tool, content: inner, prefix: null, glob: inner };
}
function globToRegExp2(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === void 0)
      break;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 1;
      } else
        re += "[^/\\\\]*";
    } else if (ch === "?")
      re += "[^/\\\\]";
    else
      re += ch.replace(/[.+^$()|[\]{}]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}
function ruleMatchesContent(rule, input) {
  if (rule.content === null)
    return true;
  let subject = "";
  if (rule.prefix !== null) {
    const cmd = input?.["command"];
    subject = typeof cmd === "string" ? cmd : "";
    const trimmed = subject.trimStart();
    return trimmed === rule.prefix || trimmed.startsWith(rule.prefix + " ");
  }
  if (rule.glob !== null) {
    const o = input ?? {};
    const paths = [o["file_path"], o["path"], o["notebook_path"]].filter((v) => typeof v === "string");
    subject = paths[0] ?? "";
    if (subject === "")
      return false;
    const re = globToRegExp2(rule.glob);
    const norm = subject.replace(/\\/g, "/");
    if (re.test(norm))
      return true;
    const absLike = /^[~/]|[A-Za-z]:/.test(rule.glob);
    if (!absLike) {
      const body = re.source.replace(/^\^/, "").replace(/\$$/, "");
      return new RegExp(`(?:^|/)${body}$`, "i").test(norm);
    }
    return false;
  }
  return false;
}
var init_rules = __esm({
  "../dist/permissions/rules.js"() {
    "use strict";
  }
});

// ../dist/permissions/engine.js
function matchList(rules, tool, input) {
  return rules.some((r) => r.tool === tool.name && ruleMatchesContent(r, input));
}
function evaluatePermission(tool, input, pctx, toolCtx) {
  if (tool.isReadOnly && tool.checkPermissions(input, toolCtx) !== "ask")
    return "allow";
  if (pctx.mode === "bypassPermissions")
    return "allow";
  if (pctx.mode === "plan" && !tool.isReadOnly)
    return "deny";
  const perms = pctx.settings.permissions;
  const denyRules = perms.deny.map(parseRule);
  const askRules = perms.ask.map(parseRule);
  const allowRules = perms.allow.map(parseRule);
  if (denyRules.some((r) => r.content === null && r.tool === tool.name))
    return "deny";
  if (matchList(denyRules, tool, input))
    return "deny";
  if (askRules.some((r) => r.content === null && r.tool === tool.name))
    return "ask";
  if (matchList(askRules, tool, input))
    return "ask";
  const self = tool.checkPermissions(input, toolCtx);
  if (allowRules.some((r) => r.content === null && r.tool === tool.name))
    return "allow";
  if (matchList(allowRules, tool, input))
    return "allow";
  if (pctx.mode === "acceptEdits" && (tool.name === "Edit" || tool.name === "Write"))
    return "allow";
  if (self === "allow")
    return "allow";
  return "ask";
}
var init_engine = __esm({
  "../dist/permissions/engine.js"() {
    "use strict";
    init_rules();
  }
});

// ../dist/context/compaction.js
function effectiveWindow(contextWindow, maxOutputTokens) {
  return contextWindow - Math.min(maxOutputTokens, MAX_OUTPUT_FOR_SUMMARY);
}
function shouldAutoCompact(messages, contextWindow, maxOutputTokens) {
  const trigger = effectiveWindow(contextWindow, maxOutputTokens) - AUTOCOMPACT_BUFFER;
  return estimateContextTokens(messages) >= trigger;
}
function estimateContextTokens(messages) {
  let anchor = 0;
  let anchorIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const u = messages[i]?.usage;
    if (u !== void 0 && u.estimated === false) {
      anchor = u.inputTokens + u.outputTokens;
      anchorIdx = i;
      break;
    }
  }
  let tail = 0;
  for (let i = anchorIdx + 1; i < messages.length; i++) {
    for (const b of messages[i]?.content ?? []) {
      if (b.type === "text")
        tail += estimateTokens(b.text);
      else if (b.type === "tool_result")
        tail += estimateTokens(b.content);
      else
        tail += 8;
    }
  }
  return anchor + tail;
}
function transcriptText(messages) {
  return messages.map((m) => {
    const role = m.type.toUpperCase();
    const parts = m.content.map((b) => {
      if (b.type === "text")
        return b.text;
      if (b.type === "tool_use")
        return `[tool_use ${b.name}]`;
      if (b.type === "tool_result")
        return `[tool_result] ${b.content.slice(0, 500)}`;
      return "";
    });
    return `${role}: ${parts.filter(Boolean).join(" ")}`;
  }).join("\n\n");
}
async function summarizeConversation(messages, opts) {
  const result = await streamChat({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    messages: [
      { role: "system", content: SUMMARIZER_PROMPT + (opts.instructions !== void 0 && opts.instructions !== "" ? `

Additional Instructions: ${opts.instructions}` : "") },
      { role: "user", content: `Summarize this conversation for continuation:

${transcriptText(messages)}` }
    ],
    maxTokens: Math.min(opts.maxTokens ?? 8e3, MAX_OUTPUT_FOR_SUMMARY),
    maxTokensParam: opts.maxTokensParam,
    supports: { tools: false, streamOptions: false, vision: false }
  });
  const text = result.text;
  const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(text);
  const raw = summaryMatch !== null ? summaryMatch[1] ?? text : text;
  const summary = raw.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "").trim();
  return { summary, usageTokens: result.usage.totalTokens };
}
function applyCompaction(messages, summary, transcriptPath) {
  const msg = {
    uuid: globalThis.crypto.randomUUID(),
    parentUuid: null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type: "user",
    isCompactSummary: true,
    content: [
      {
        type: "text",
        text: `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier history. Full transcript: ${transcriptPath}

${summary}

Resume directly \u2014 do not acknowledge the summary.`
      }
    ]
  };
  return [msg];
}
var AUTOCOMPACT_BUFFER, MAX_CONSECUTIVE_FAILURES, MAX_OUTPUT_FOR_SUMMARY, SUMMARIZER_PROMPT;
var init_compaction = __esm({
  "../dist/context/compaction.js"() {
    "use strict";
    init_client();
    init_types();
    AUTOCOMPACT_BUFFER = 13e3;
    MAX_CONSECUTIVE_FAILURES = 3;
    MAX_OUTPUT_FOR_SUMMARY = 2e4;
    SUMMARIZER_PROMPT = [
      "You are summarizing a coding-agent conversation so work can continue seamlessly in a fresh context.",
      "IMPORTANT: Tool calls will be REJECTED and will waste your only turn. Respond with text only.",
      "First think inside <analysis> tags, then write the final summary inside <summary> tags with EXACTLY these 9 sections:",
      "1. Primary Request and Intent",
      "2. Key Technical Concepts",
      "3. Files and Code Sections (with short snippets)",
      "4. Errors and fixes (include user feedback)",
      "5. Problem Solving",
      "6. All user messages (critical \u2014 list them)",
      "7. Pending Tasks",
      "8. Current Work",
      "9. Optional Next Step (quote the user if relevant)"
    ].join("\n");
  }
});

// ../dist/extensibility/mcp/config.js
function approvedServersPath() {
  return import_node_path16.default.join(userConfigDir(), "mcp-approved.json");
}
function loadApproved() {
  try {
    const raw = JSON.parse(import_node_fs18.default.readFileSync(approvedServersPath(), "utf8"));
    return raw.servers ?? [];
  } catch {
    return [];
  }
}
function discoverMcpServers(cwd, userServers, askApprove) {
  const entries = [];
  const skipped = [];
  const approved = new Set(loadApproved());
  const toCfg = (raw) => {
    if (typeof raw.command === "string" && raw.command !== "") {
      return { command: raw.command, args: raw.args, env: raw.env };
    }
    return null;
  };
  for (const [name, raw] of Object.entries(userServers ?? {})) {
    const cfg = toCfg(raw);
    if (cfg !== null)
      entries.push({ name, cfg, source: "user" });
  }
  const projectFile = import_node_path16.default.join(cwd, ".mcp.json");
  if (import_node_fs18.default.existsSync(projectFile)) {
    try {
      const parsed = JSON.parse(import_node_fs18.default.readFileSync(projectFile, "utf8"));
      for (const [name, raw] of Object.entries(parsed.mcpServers ?? {})) {
        if (entries.some((e) => e.name === name))
          continue;
        if (!approved.has(name)) {
          skipped.push(name);
          continue;
        }
        const cfg = toCfg(raw);
        if (cfg !== null)
          entries.push({ name, cfg, source: "project" });
      }
    } catch {
    }
  }
  void askApprove;
  return { entries, skipped };
}
var import_node_fs18, import_node_path16;
var init_config = __esm({
  "../dist/extensibility/mcp/config.js"() {
    "use strict";
    import_node_fs18 = __toESM(require("node:fs"), 1);
    import_node_path16 = __toESM(require("node:path"), 1);
    init_paths();
  }
});

// ../dist/extensibility/mcp/client.js
var import_node_child_process5, McpClient;
var init_client2 = __esm({
  "../dist/extensibility/mcp/client.js"() {
    "use strict";
    import_node_child_process5 = require("node:child_process");
    McpClient = class {
      serverName;
      cfg;
      child = null;
      nextId = 1;
      pending = /* @__PURE__ */ new Map();
      buffer = "";
      serverInfo = {};
      status = "disconnected";
      constructor(serverName, cfg) {
        this.serverName = serverName;
        this.cfg = cfg;
      }
      async start() {
        this.child = (0, import_node_child_process5.spawn)(this.cfg.command, this.cfg.args ?? [], {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...this.cfg.env ?? {} },
          windowsHide: true
        });
        this.status = "connected";
        this.child.stdout?.on("data", (chunk) => {
          this.buffer += chunk.toString("utf8");
          let nl;
          while ((nl = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if (line === "")
              continue;
            try {
              this.handleLine(JSON.parse(line));
            } catch {
            }
          }
        });
        this.child.stderr?.on("data", () => {
        });
        this.child.on("exit", () => {
          this.status = "disconnected";
          for (const [id, p] of this.pending) {
            p.reject(new Error(`MCP server "${this.serverName}" exited`));
            this.pending.delete(id);
          }
        });
        const info = await this.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "vexa-code", version: "0.1.0" }
        });
        this.serverInfo = info?.serverInfo ?? {};
        this.notify("notifications/initialized");
      }
      handleLine(msg) {
        if (msg.id === void 0 || typeof msg.id !== "number")
          return;
        const p = this.pending.get(msg.id);
        if (p === void 0)
          return;
        this.pending.delete(msg.id);
        if (msg.error !== void 0)
          p.reject(new Error(msg.error.message ?? "MCP error"));
        else
          p.resolve(msg.result);
      }
      async request(method, params, timeoutMs = 15e3) {
        if (this.child === null)
          throw new Error(`MCP server "${this.serverName}" not started`);
        const id = this.nextId++;
        const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        const p = new Promise((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          setTimeout(() => {
            if (this.pending.has(id)) {
              this.pending.delete(id);
              reject(new Error(`MCP request ${method} timed out (${this.serverName})`));
            }
          }, timeoutMs);
        });
        this.child.stdin?.write(msg);
        return p;
      }
      notify(method) {
        this.child?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params: {} }) + "\n");
      }
      async listTools() {
        const result = await this.request("tools/list", {});
        return result?.tools ?? [];
      }
      async callTool(name, args) {
        const result = await this.request("tools/call", { name, arguments: args ?? {} });
        const text = (result?.content ?? []).filter((c2) => c2.type === "text" || typeof c2.text === "string").map((c2) => c2.text ?? "").join("\n");
        return { text: text === "" ? "(empty result)" : text, isError: result?.isError === true };
      }
      stop() {
        if (this.child !== null && this.status === "connected") {
          this.child.kill();
        }
        this.status = "disconnected";
      }
    };
  }
});

// ../dist/tools/mcpBridge.js
function mcpToolsFromClient(client, defs) {
  return defs.map((def) => ({
    name: `mcp__${client.serverName}__${def.name}`,
    description: def.description ?? `MCP tool "${def.name}" from server "${client.serverName}"`,
    inputSchema: def.inputSchema ?? { type: "object", properties: {} },
    isEnabled: () => client.status === "connected",
    isReadOnly: false,
    // fail-closed: unknown MCP tools may have side effects
    isConcurrencySafe: false,
    checkPermissions: () => "ask",
    maxResultSizeChars: 5e4,
    async call(input, _ctx) {
      const r = await client.callTool(def.name, input);
      return { data: r.text };
    }
  }));
}
var init_mcpBridge = __esm({
  "../dist/tools/mcpBridge.js"() {
    "use strict";
    init_client2();
  }
});

// ../dist/engine/contextTracker.js
function computeContextState(messages, contextWindow, maxOutputTokens) {
  const effectiveWindow2 = contextWindow - Math.min(maxOutputTokens, 2e4);
  const triggerTokens = effectiveWindow2 - 13e3;
  const warnTokens = triggerTokens - 2e4;
  let anchorTokens = 0;
  let anchorIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const u = messages[i]?.usage;
    if (u !== void 0 && u.estimated === false) {
      anchorTokens = u.inputTokens + u.outputTokens;
      anchorIdx = i;
      break;
    }
  }
  let tail = 0;
  for (let i = anchorIdx + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m === void 0)
      continue;
    for (const b of m.content) {
      if (b.type === "text")
        tail += estimateTokens(b.text);
      else if (b.type === "tool_result")
        tail += estimateTokens(b.content);
      else
        tail += 8;
    }
  }
  const usedTokens = anchorTokens + tail;
  const pct = contextWindow > 0 ? Math.min(100, Math.round(usedTokens / contextWindow * 100)) : 0;
  return {
    usedTokens,
    contextWindow,
    effectiveWindow: effectiveWindow2,
    pct,
    shouldWarn: usedTokens >= warnTokens,
    triggerTokens
  };
}
var init_contextTracker = __esm({
  "../dist/engine/contextTracker.js"() {
    "use strict";
    init_types();
  }
});

// ../dist/extensibility/hooks.js
function hookConfigsFor(settings, event) {
  const hooks = settings.hooks ?? {};
  return hooks[event] ?? [];
}
function matcherApplies(matcher, toolName) {
  if (matcher === void 0 || matcher === "")
    return true;
  if (toolName === void 0)
    return true;
  try {
    return new RegExp(matcher).test(toolName);
  } catch {
    return false;
  }
}
async function runOne2(command, payload, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = (0, import_node_child_process6.spawn)(command, { shell: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ code: -1, stdout, stderr: "timeout", failed: true });
      }
    }, timeoutMs);
    child.stdout?.on("data", (d) => stdout += d.toString());
    child.stderr?.on("data", (d) => stderr += d.toString());
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: "spawn failed", failed: true });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr, failed: false });
      }
    });
    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();
  });
}
async function runHooks(settings, event, payload) {
  const matchers = hookConfigsFor(settings, event);
  const result = { blocking: false };
  for (const m of matchers) {
    if (!matcherApplies(m.matcher, payload.toolName))
      continue;
    for (const h of m.hooks) {
      if (h.type !== "command")
        continue;
      const r = await runOne2(h.command, { event, session_id: payload.sessionId, tool_name: payload.toolName, tool_input: payload.toolInput, cwd: payload.cwd }, h.timeout ?? 3e4);
      if (r.failed)
        continue;
      if (r.code === 2) {
        return { blocking: true, decision: "block", reason: r.stderr.trim() !== "" ? r.stderr.trim() : `blocked by ${event} hook (exit 2)` };
      }
      const parsed = parseJsonSafe(r.stdout);
      if (parsed !== null && typeof parsed === "object") {
        const o = parsed;
        if (o.decision === "block")
          return { blocking: true, decision: "block", reason: o.reason ?? "blocked by hook", systemMessage: o.systemMessage };
        if (o.systemMessage !== void 0)
          result.systemMessage = o.systemMessage;
      }
    }
  }
  return result;
}
function parseJsonSafe(s) {
  try {
    return JSON.parse(s.trim().split("\n")[0] ?? "");
  } catch {
    return null;
  }
}
var import_node_child_process6;
var init_hooks = __esm({
  "../dist/extensibility/hooks.js"() {
    "use strict";
    import_node_child_process6 = require("node:child_process");
  }
});

// ../dist/ui/render.js
function clearLine() {
  return enabled ? "\r\x1B[K" : "\r";
}
function toolUseLine(toolName, summary) {
  return `${c.cyan("\u23FA")} ${c.bold(toolName)}${c.dim(`(${summary})`)}`;
}
function toolResultLine(text, isError = false) {
  const bullet = isError ? c.red("\u23BF") : c.dim("\u23BF");
  return `${bullet} ${c.dim(text)}`;
}
function summarizeToolInput(name, input) {
  if (input === null || typeof input !== "object")
    return "";
  const o = input;
  const firstString = () => {
    for (const v of Object.values(o))
      if (typeof v === "string")
        return v;
    return "";
  };
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return firstString();
    case "Bash":
      return firstString().slice(0, 80);
    case "Grep":
    case "Glob":
      return typeof o["pattern"] === "string" ? o["pattern"] : "";
    case "Task":
      return typeof o["description"] === "string" ? o["description"] : "";
    case "WebFetch":
      return typeof o["url"] === "string" ? o["url"] : "";
    default: {
      const s = firstString();
      return s.length > 60 ? s.slice(0, 60) + "\u2026" : s;
    }
  }
}
function usageLine(turnIn, turnOut, totalIn, totalOut, contextWindow) {
  const used = totalIn + totalOut;
  const pct = contextWindow > 0 ? Math.min(100, Math.round(used / contextWindow * 100)) : 0;
  return c.dim(`  in=${turnIn} out=${turnOut} \xB7 session in=${totalIn} out=${totalOut} \xB7 ctx\u2248${pct}%`);
}
function errorLine(msg) {
  return c.red(`\u2717 ${msg}`);
}
function successLine(msg) {
  return c.green(`\u2713 ${msg}`);
}
var enabled, wrap, c, StreamRenderer;
var init_render = __esm({
  "../dist/ui/render.js"() {
    "use strict";
    enabled = !(process.env["NO_COLOR"] !== void 0 || process.env["TERM"] === "dumb");
    wrap = (code, s) => enabled ? `\x1B[${code}m${s}\x1B[0m` : s;
    c = {
      dim: (s) => wrap("2", s),
      italic: (s) => wrap("3", s),
      bold: (s) => wrap("1", s),
      cyan: (s) => wrap("36", s),
      green: (s) => wrap("32", s),
      red: (s) => wrap("31", s),
      yellow: (s) => wrap("33", s),
      magenta: (s) => wrap("35", s)
    };
    StreamRenderer = class {
      write;
      lineBuf = "";
      inFence = false;
      pending = [];
      timer = null;
      closed = false;
      constructor(write) {
        this.write = write;
      }
      push(delta) {
        if (this.closed) {
          this.write(delta);
          return;
        }
        this.lineBuf += delta;
        let nl;
        while ((nl = this.lineBuf.indexOf("\n")) !== -1) {
          const line = this.lineBuf.slice(0, nl);
          this.lineBuf = this.lineBuf.slice(nl + 1);
          this.schedule(this.styleLine(line) + "\n");
        }
      }
      /** flush any partial line + pending styled output */
      flush() {
        if (this.lineBuf !== "") {
          const rest = this.lineBuf;
          this.lineBuf = "";
          this.schedule(this.styleLine(rest));
        }
        this.close();
      }
      /** write any pending styled output + partial line, but stay open for more deltas */
      flushSoft() {
        if (this.lineBuf !== "") {
          const rest = this.lineBuf;
          this.lineBuf = "";
          this.pending.push(this.styleLine(rest) + "\n");
        }
        if (this.pending.length > 0) {
          this.write(this.pending.join(""));
          this.pending = [];
        }
        if (this.timer !== null) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      }
      close() {
        this.closed = true;
        if (this.timer !== null) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        if (this.pending.length > 0) {
          this.write(this.pending.join(""));
          this.pending = [];
        }
      }
      schedule(text) {
        this.pending.push(text);
        if (this.timer === null) {
          this.timer = setTimeout(() => {
            this.timer = null;
            if (this.pending.length > 0) {
              this.write(this.pending.join(""));
              this.pending = [];
            }
          }, 16);
        }
      }
      styleLine(line) {
        const fence = line.trimStart().startsWith("```");
        if (fence) {
          this.inFence = !this.inFence;
          return c.dim(line.trimStart() === "```" ? "  \u2500 \u2500 \u2500" : `  \u2500 ${line.trimStart().slice(3)} \u2500 \u2500`);
        }
        if (this.inFence)
          return c.cyan(`  ${line}`);
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading !== null)
          return c.bold(heading[2] ?? "");
        let styled = line.replace(/`([^`]+)`/g, (_m, code) => c.cyan(code)).replace(/\*\*([^*]+)\*\*/g, (_m, b) => c.bold(b));
        if (/^\s*[-*]\s+/.test(styled))
          styled = styled.replace(/^(\s*)[-*]\s+/, `$1${c.dim("\u2022")} `);
        return styled;
      }
    };
  }
});

// ../dist/ui/spinner.js
var FRAMES, VERBS, Spinner;
var init_spinner = __esm({
  "../dist/ui/spinner.js"() {
    "use strict";
    init_render();
    FRAMES = ["\xB7", "\u2722", "\u2733", "\u2736", "\u273B", "\u273D"];
    VERBS = [
      "Vexing",
      "Thinking",
      "Pondering",
      "Brewing",
      "Musing",
      "Percolating",
      "Conjuring",
      "Distilling",
      "Weaving",
      "Forging"
    ];
    Spinner = class {
      out;
      timer = null;
      frame = 0;
      verb;
      startedAt = Date.now();
      constructor(out, verb) {
        this.out = out;
        this.verb = verb ?? VERBS[Math.floor(Math.random() * VERBS.length)] ?? "Vexing";
      }
      start(hint = "(esc to interrupt)") {
        this.stop();
        this.timer = setInterval(() => {
          const f = FRAMES[this.frame % FRAMES.length] ?? "\xB7";
          this.frame++;
          const secs = Math.floor((Date.now() - this.startedAt) / 1e3);
          const elapsed = secs > 0 ? c.dim(` ${secs}s \xB7`) : "";
          this.out.write(`${clearLine()}${c.magenta(f)} ${this.verb}\u2026 ${elapsed} ${c.dim(hint)}`);
        }, 120);
      }
      stop() {
        if (this.timer !== null) {
          clearInterval(this.timer);
          this.timer = null;
          this.out.write(clearLine());
        }
      }
    };
  }
});

// ../dist/ui/repl.js
function skillsPromptSectionSafe(skills) {
  return skillsPromptSection(skills) ?? void 0;
}
function truncateResult(s) {
  const one = s.replace(/\n/g, " \u23CE ");
  return one.length > 220 ? one.slice(0, 220) + "\u2026" : one;
}
function uuid2() {
  return globalThis.crypto.randomUUID();
}
function isGitRepo(cwd) {
  return new Promise((resolve) => {
    (0, import_node_child_process7.exec)("git rev-parse --is-inside-work-tree 2>/dev/null", { cwd }, (err, stdout) => resolve(err === null && stdout.trim() === "true"));
  });
}
function makeMsg(type, text, parent) {
  return {
    uuid: uuid2(),
    parentUuid: parent,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    type,
    content: [{ type: "text", text }]
  };
}
async function runRepl(ctx) {
  const out = process.stdout;
  const git = await isGitRepo(process.cwd());
  const sessionVexamd = loadVexamd(process.cwd());
  let compactFailures = 0;
  let checkpointer = null;
  const ensureCheckpointer = () => {
    if (checkpointer === null)
      checkpointer = createCheckpointer(state.sessionId, process.cwd());
    return checkpointer;
  };
  appState.webSearch = ctx.settings.webSearch !== void 0 ? { provider: ctx.settings.webSearch.provider, apiKeyEnv: ctx.settings.webSearch.apiKeyEnv } : void 0;
  const memoryDir = ensureMemoryDir(process.cwd());
  const memory = loadMemory(process.cwd());
  const skills = discoverSkills(process.cwd());
  const customCommands = discoverCommands(process.cwd());
  for (const w of memory.warnings)
    out.write(c.yellow(`  \u26A0 ${w}
`));
  const estimateUsage = (msgs) => {
    let n = 0;
    for (const m of msgs)
      for (const b of m.content)
        n += b.type === "text" ? Math.ceil(b.text.length / 4) : 16;
    return n;
  };
  appState.planApproval = async (plan) => {
    out.write(`
${c.bold("Plan:")}
${plan}

`);
    if (process.stdin.isTTY !== true)
      return false;
    const answer = await new Promise((resolve) => {
      rl.question(c.cyan("  approve this plan? (y/n) > "), (a) => resolve(a.trim().toLowerCase()));
    });
    return answer === "y" || answer === "yes";
  };
  appState.onTodosChanged = (todos) => {
    out.write(c.dim("\u250C\u2500 todos\n") + todos.map((t) => c.dim("\u2502 ") + renderTodos([t])).join("\n") + c.dim("\n\u2514\u2500\n"));
  };
  out.write([
    "",
    c.magenta("\u273B ") + c.bold("Welcome to Vexa Code!"),
    c.dim("   a coding agent for your terminal \u2014 any model, any provider"),
    "",
    `  ${c.dim("model:")}  ${ctx.resolved.modelId} ${c.dim(`(${ctx.resolved.profileName})`)}`,
    `  ${c.dim("cwd:")}    ${process.cwd()}${git ? c.dim("  \xB7  git repo") : ""}`,
    `  ${c.dim("mode:")}   ${ctx.settings.permissions.defaultMode}`,
    "",
    c.dim(`  type a task, or /help for commands \xB7 shift+tab cycles modes`),
    ""
  ].join("\n"));
  const state = {
    messages: [],
    totalUsage: { ...EMPTY_USAGE },
    mode: ctx.settings.permissions.defaultMode,
    resolved: ctx.resolved,
    turns: 0,
    interrupted: false,
    sessionId: newSessionId(),
    transcript: new Transcript(transcriptPathFor(process.cwd(), newSessionId()), "", ctx.version),
    mcpTools: [],
    mcpClients: []
  };
  {
    const { entries, skipped } = discoverMcpServers(process.cwd(), ctx.settings.mcpServers, async () => false);
    for (const s of skipped)
      out.write(c.dim(`MCP server "${s}" in .mcp.json not approved yet \u2014 approve via /mcp
`));
    for (const entry of entries) {
      try {
        const client = new McpClient(entry.name, entry.cfg);
        await client.start();
        const defs = await client.listTools();
        state.mcpClients.push(client);
        state.mcpTools.push(...mcpToolsFromClient(client, defs));
        out.write(c.dim(`\u2713 MCP "${entry.name}" connected \u2014 ${defs.length} tool(s)
`));
      } catch (e) {
        out.write(c.yellow(`\u26A0 MCP "${entry.name}" failed: ${e.message}
`));
      }
    }
  }
  if (ctx.resumeTarget !== void 0) {
    const sessions = listSessions(process.cwd());
    const target = ctx.resumeTarget === "" ? sessions[0] : sessions.find((s) => s.id === ctx.resumeTarget || s.id.startsWith(ctx.resumeTarget ?? ""));
    if (target === void 0) {
      out.write(c.yellow(`no session found for "${ctx.resumeTarget}" \u2014 starting fresh
`));
    } else {
      const { messages, warnings, sessionId } = readTranscript(target.path);
      state.messages = messages;
      state.sessionId = sessionId ?? target.id;
      for (const w of warnings)
        out.write(c.yellow(`  \u26A0 ${w}
`));
      for (const m of state.messages) {
        if (m.usage !== void 0 && m.usage.estimated === false) {
          state.totalUsage = addUsage(state.totalUsage, m.usage);
        }
      }
      out.write(c.dim(`\u2713 resumed ${state.messages.length} messages from ${target.id.slice(0, 8)}\u2026 (${new Date(target.mtimeMs).toLocaleString()})
`));
    }
  }
  state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);
  const rl = import_node_readline2.default.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.cyan("\u276F "),
    terminal: process.stdin.isTTY === true
  });
  import_node_readline2.default.emitKeypressEvents(process.stdin, rl);
  const onKeypress = (_str, key) => {
    if (key === void 0)
      return;
    if (key.shift === true && key.name === "tab" && !running) {
      state.mode = MODE_CYCLE[(MODE_CYCLE.indexOf(state.mode) + 1) % MODE_CYCLE.length] ?? "default";
      const label = MODE_LABEL[state.mode];
      out.write(`${clearLine()}${label === "" ? c.dim("mode: default") : c.yellow(label)}
`);
      rl.prompt(true);
    }
  };
  let running = false;
  process.stdin.on("keypress", onKeypress);
  const printPrompt = () => {
    const label = MODE_LABEL[state.mode];
    rl.setPrompt(label === "" ? c.cyan("\u276F ") : `${c.yellow(label)}
${c.cyan("\u276F ")}`);
    rl.prompt(true);
  };
  const runTurn = async (input) => {
    running = true;
    const userMsg = makeMsg("user", input, state.messages.at(-1)?.uuid ?? null);
    state.messages.push(userMsg);
    await state.transcript.append(userMsg, { fsync: true });
    let key = "";
    try {
      key = resolveApiKey(state.resolved.profile, state.resolved.profileName);
    } catch (e) {
      out.write(errorLine(e.message) + "\n");
      running = false;
      return;
    }
    const upHook = await runHooks(ctx.settings, "UserPromptSubmit", { sessionId: state.sessionId, cwd: process.cwd() });
    if (upHook.blocking) {
      out.write(c.red(`\u23F9 prompt blocked by UserPromptSubmit hook: ${upHook.reason ?? "no reason"}`) + "\n");
      running = false;
      return;
    }
    if (upHook.systemMessage !== void 0)
      out.write(c.dim(upHook.systemMessage) + "\n");
    const spinner = new Spinner(out);
    spinner.start();
    const abort = new AbortController();
    let interrupted = false;
    const toolCtx = {
      abortController: abort,
      readFileState,
      cwd: process.cwd(),
      checkpoint: (fp, prior) => ensureCheckpointer().save(fp, prior)
    };
    const askPermission = async (tool, input2) => {
      const decision = evaluatePermission(tool, input2, { settings: ctx.settings, mode: state.mode }, toolCtx);
      if (decision === "allow")
        return true;
      if (decision === "deny") {
        out.write(c.red(`\u23F9 ${tool.name} denied by permission rules (settings: deny list${state.mode === "plan" ? " / plan mode" : ""})
`));
        return false;
      }
      const pre = await runHooks(ctx.settings, "PreToolUse", {
        sessionId: state.sessionId,
        toolName: tool.name,
        toolInput: input2,
        cwd: process.cwd()
      });
      if (pre.decision === "approve")
        return true;
      if (pre.blocking) {
        out.write(c.red(`\u23F9 ${tool.name} blocked by PreToolUse hook: ${pre.reason ?? "no reason"}`) + "\n");
        return false;
      }
      if (process.stdin.isTTY !== true)
        return false;
      rl.pause();
      out.write(`
${c.yellow(`\u26A0 ${tool.name} requests permission`)} ${c.dim(JSON.stringify(input2 ?? {}).slice(0, 180))}
`);
      const answer = await new Promise((resolve) => {
        rl.question(c.cyan("  allow? (y/n) > "), (a) => resolve(a.trim().toLowerCase()));
      });
      rl.resume();
      return answer === "y" || answer === "yes";
    };
    const baseTools = [...getAllBaseTools().filter((t) => t.isEnabled()), ...state.mcpTools];
    const tools = [
      ...baseTools,
      createTaskTool({
        baseUrl: state.resolved.profile.baseUrl,
        apiKey: key,
        model: state.resolved.modelId,
        label: state.resolved.profileName,
        headers: state.resolved.profile.headers,
        maxTokens: state.resolved.profile.maxTokens,
        maxTokensParam: state.resolved.profile.maxTokensParam,
        temperature: state.resolved.profile.temperature,
        supports: state.resolved.profile.supports,
        dropFields: state.resolved.profile.dropFields,
        parentTools: baseTools,
        parentPermissionAsk: askPermission,
        cwd: process.cwd(),
        maxTurns: Math.min(ctx.flags.maxTurns ?? 200, 60),
        signal: abort.signal
      })
    ];
    appState.mode = state.mode;
    const promptBuilt = buildSystemPrompt({
      modelId: state.resolved.modelId,
      modelLabel: state.resolved.profile.label ?? state.resolved.modelId,
      cwd: process.cwd(),
      isGitRepo: git,
      toolsEnabled: tools.map((t) => t.name),
      permissionMode: state.mode,
      vexamd: sessionVexamd,
      memoryContent: memory.content,
      memoryDir,
      skillsSection: skillsPromptSectionSafe(skills)
    });
    for (const w of promptBuilt.warnings)
      out.write(c.yellow(`  \u26A0 ${w}
`));
    const system = promptBuilt.system;
    const wasRaw = process.stdin.isRaw === true;
    if (process.stdin.isTTY === true) {
      process.stdin.setRawMode(true);
      const onKey = (_s, k) => {
        if (k === void 0)
          return;
        if (k.name === "escape") {
          interrupted = true;
          abort.abort();
        }
        if (k.ctrl === true && k.name === "c") {
          interrupted = true;
          abort.abort();
        }
      };
      process.stdin.once("keypress", onKey);
      process.stdin.resume();
      var cleanupKeys = () => {
        process.stdin.removeListener("keypress", onKey);
        if (!wasRaw)
          process.stdin.setRawMode(false);
      };
    } else {
      var cleanupKeys = () => {
      };
    }
    const in0 = state.totalUsage.inputTokens;
    const out0 = state.totalUsage.outputTokens;
    let firstChunk = true;
    const renderer = new StreamRenderer((s) => process.stdout.write(s));
    try {
      const result = await runAgentTurn({
        baseUrl: state.resolved.profile.baseUrl,
        apiKey: key,
        model: state.resolved.modelId,
        label: state.resolved.profileName,
        headers: state.resolved.profile.headers,
        system,
        messages: state.messages,
        tools,
        maxTokens: state.resolved.profile.maxTokens,
        maxTokensParam: state.resolved.profile.maxTokensParam,
        temperature: state.resolved.profile.temperature,
        supports: state.resolved.profile.supports,
        dropFields: state.resolved.profile.dropFields,
        maxTurns: ctx.flags.maxTurns ?? 200,
        toolContext: toolCtx,
        permissionAsk: askPermission,
        onTextDelta: (d) => {
          if (firstChunk) {
            firstChunk = false;
            spinner.stop();
          }
          renderer.push(d);
        },
        onReasoningDelta: (d) => {
          if (firstChunk) {
            firstChunk = false;
            spinner.stop();
          }
          renderer.push(c.dim(c.italic(d)));
        },
        onToolStart: (name, input2) => {
          renderer.flushSoft();
          if (firstChunk) {
            firstChunk = false;
            spinner.stop();
          }
          out.write("\n" + toolUseLine(name, summarizeToolInput(name, input2)));
        },
        onToolResult: (name, content, isError) => {
          out.write(toolResultLine(truncateResult(content), isError) + "\n");
          void runHooks(ctx.settings, "PostToolUse", {
            sessionId: state.sessionId,
            toolName: name,
            toolInput: void 0,
            cwd: process.cwd()
          }).then((h) => {
            if (h.systemMessage !== void 0)
              out.write(c.dim(h.systemMessage) + "\n");
          });
        },
        signal: abort.signal,
        getAttachments: () => {
          const rem = todoReminder(appState.todos);
          if (rem === null)
            return [];
          return [
            {
              uuid: uuid2(),
              parentUuid: null,
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              type: "user",
              isMeta: true,
              content: [{ type: "text", text: rem }]
            }
          ];
        },
        autoCompact: async () => {
          if (ctx.settings.autoCompactEnabled !== true)
            return false;
          if (compactFailures >= MAX_CONSECUTIVE_FAILURES)
            return false;
          if (!shouldAutoCompact(state.messages, state.resolved.profile.contextWindow, state.resolved.profile.maxTokens))
            return false;
          spinner.stop();
          out.write(c.yellow("\u273B context nearly full \u2014 compacting\u2026\n"));
          try {
            const { summary } = await summarizeConversation(state.messages, {
              baseUrl: state.resolved.profile.baseUrl,
              apiKey: key,
              model: state.resolved.modelId,
              maxTokensParam: state.resolved.profile.maxTokensParam,
              maxTokens: state.resolved.profile.maxTokens
            });
            const tpath = transcriptPathFor(process.cwd(), state.sessionId);
            const compacted = applyCompaction(state.messages, summary, tpath);
            void state.transcript.append(compacted[0], {
              compactMetadata: { trigger: "auto", preCompactTokenCount: state.messages.length }
            });
            state.messages.length = 0;
            state.messages.push(...compacted);
            compactFailures = 0;
            out.write(successLine(`compacted \u2014 conversation now ~${estimateUsage(state.messages)} tokens
`));
            return true;
          } catch (e) {
            compactFailures++;
            out.write(errorLine(`compaction failed (${compactFailures}/${MAX_CONSECUTIVE_FAILURES}): ${e.message}`) + "\n");
            return false;
          }
        }
      });
      spinner.stop();
      renderer.flush();
      if (result.finalText !== "")
        out.write("\n");
      state.totalUsage = addUsage(state.totalUsage, result.usage);
      state.messages.push({
        uuid: uuid2(),
        parentUuid: state.messages.at(-1)?.uuid ?? null,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "assistant",
        content: [{ type: "text", text: result.finalText === "" ? result.finishReason === "max_turns_reached" ? "[max turns reached]" : "" : result.finalText }],
        model: state.resolved.modelId,
        provider: state.resolved.profileName,
        usage: result.usage,
        finishReason: result.finishReason
      });
      void state.transcript.append(state.messages.at(-1));
      state.turns++;
      out.write(usageLine(result.usage.inputTokens, result.usage.outputTokens, state.totalUsage.inputTokens, state.totalUsage.outputTokens, state.resolved.profile.contextWindow) + "\n");
      const cs = computeContextState(state.messages, state.resolved.profile.contextWindow, state.resolved.profile.maxTokens);
      if (cs.shouldWarn) {
        out.write(c.yellow(`\u26A0 context ${cs.usedTokens.toLocaleString()} tok (\u2248${cs.pct}%) \u2014 auto-compact triggers at ${cs.triggerTokens.toLocaleString()} (P14)`) + "\n");
      }
      if (interrupted)
        out.write(c.yellow("\u23F9 interrupted\n"));
    } catch (err) {
      spinner.stop();
      renderer.flushSoft();
      out.write("\n");
      if (err instanceof ProviderError) {
        out.write(errorLine(`${err.kind}: ${err.message}`) + "\n");
        if (err.kind === "auth") {
          out.write(c.dim(`  \u2192 check the key: vexa providers test ${state.resolved.profileName}`) + "\n");
        }
      } else {
        out.write(errorLine(err.message) + "\n");
      }
      if (interrupted)
        out.write(c.yellow("\u23F9 interrupted\n"));
    } finally {
      cleanupKeys();
      running = false;
    }
  };
  const handleSlash = async (line) => {
    const [cmdRaw, ...rest] = line.trim().split(/\s+/);
    const cmd = (cmdRaw ?? "").toLowerCase();
    const arg = rest.join(" ").trim();
    switch (cmd) {
      case "/help":
        out.write(HELP_LINES.map((l) => c.dim(l)).join("\n") + "\n");
        return "handled";
      case "/clear":
        state.messages = [];
        state.turns = 0;
        state.totalUsage = { ...EMPTY_USAGE };
        state.sessionId = newSessionId();
        state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);
        checkpointer = null;
        out.write(c.dim("\u2713 conversation cleared (new session started)\n"));
        return "handled";
      case "/resume": {
        const sessions = listSessions(process.cwd());
        if (sessions.length === 0) {
          out.write(c.dim("no sessions yet for this directory\n"));
          return "handled";
        }
        const target = arg === "" ? sessions[0] : sessions.find((s) => s.id === arg || s.id.startsWith(arg));
        if (target === void 0) {
          out.write(errorLine(`no session matching "${arg}"`) + "\n");
          return "handled";
        }
        const { messages, warnings, sessionId } = readTranscript(target.path);
        state.messages = messages;
        state.sessionId = sessionId ?? target.id;
        state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);
        checkpointer = null;
        state.totalUsage = { ...EMPTY_USAGE };
        for (const m of state.messages) {
          if (m.usage !== void 0 && m.usage.estimated === false)
            state.totalUsage = addUsage(state.totalUsage, m.usage);
        }
        for (const w of warnings)
          out.write(c.yellow(`  \u26A0 ${w}
`));
        out.write(successLine(`resumed ${state.messages.length} messages (${new Date(target.mtimeMs).toLocaleString()})
`));
        return "handled";
      }
      case "/sessions": {
        const sums = sessionSummaries(process.cwd());
        if (sums.length === 0) {
          out.write(c.dim("no sessions yet for this directory\n"));
          return "handled";
        }
        out.write(c.bold("recent sessions\n"));
        sums.forEach((sm, i) => {
          const when = new Date(sm.mtimeMs).toLocaleString();
          out.write(c.dim(`  ${String(i + 1).padStart(2)}) `) + `${sm.id.slice(0, 8)}  ${c.dim(when)}  ${String(sm.msgCount)} msgs  ${c.dim(sm.firstPrompt !== "" ? sm.firstPrompt : "(no prompt captured)")}
`);
        });
        if (arg !== "") {
          const n = Number(arg);
          if (!Number.isInteger(n) || n < 1 || n > sums.length) {
            out.write(errorLine(`/sessions: pick 1-${sums.length} (or /resume <id-prefix>)`) + "\n");
            return "handled";
          }
          const t2 = sums[n - 1];
          if (t2 === void 0) {
            out.write(errorLine(`/sessions: pick 1-${sums.length}`) + "\n");
            return "handled";
          }
          const { messages, warnings, sessionId } = readTranscript(t2.path);
          state.messages = messages;
          state.sessionId = sessionId ?? t2.id;
          state.transcript = new Transcript(transcriptPathFor(process.cwd(), state.sessionId), state.sessionId, ctx.version);
          checkpointer = null;
          state.totalUsage = { ...EMPTY_USAGE };
          for (const m of state.messages) {
            if (m.usage !== void 0 && m.usage.estimated === false)
              state.totalUsage = addUsage(state.totalUsage, m.usage);
          }
          for (const w of warnings)
            out.write(c.yellow(`  \u26A0 ${w}
`));
          out.write(successLine(`resumed session ${t2.id.slice(0, 8)} (${state.messages.length} messages)
`));
        } else {
          out.write(c.dim("  resume one: /sessions <n>\n"));
        }
        return "handled";
      }
      case "/continue":
        out.write(c.dim("use /resume \u2014 same thing; /continue is an alias\n"));
        return "handled";
      case "/model": {
        if (arg === "") {
          out.write(c.bold("current: ") + `${state.resolved.profileName}:${state.resolved.modelId}
`);
          for (const [name, target] of Object.entries(ctx.settings.aliases)) {
            out.write(c.dim(`  alias ${name} \u2192 ${target}
`));
          }
          for (const [name, p0] of Object.entries(ctx.settings.providerProfiles)) {
            const p = p0;
            out.write(c.dim(`  profile ${name} \u2192 ${p.model} (${p.baseUrl})
`));
          }
          out.write(c.dim("  switch: /model <alias|profile:model|model-id>\n"));
          return "handled";
        }
        try {
          state.resolved = resolveModelRef(ctx.settings, arg);
          out.write(successLine(`model \u2192 ${state.resolved.profileName}:${state.resolved.modelId}
`));
        } catch (e) {
          out.write(errorLine(e.message) + "\n");
        }
        return "handled";
      }
      case "/cost":
        out.write(c.dim(`session: in=${state.totalUsage.inputTokens} out=${state.totalUsage.outputTokens} total=${state.totalUsage.totalTokens}${state.totalUsage.estimated ? " (estimated)" : ""} \xB7 turns=${state.turns}`) + "\n");
        return "handled";
      case "/status":
        out.write([
          `  model     ${state.resolved.profileName}:${state.resolved.modelId}`,
          `  provider  ${state.resolved.profile.baseUrl}`,
          `  mode      ${state.mode}`,
          `  context   ${state.resolved.profile.contextWindow.toLocaleString()} tok \xB7 messages ${state.messages.length}`,
          `  session   ${state.sessionId.slice(0, 8)}\u2026`,
          `  transcript ${transcriptPathFor(process.cwd(), state.sessionId)}`,
          `  cwd       ${process.cwd()}`
        ].map((l) => c.dim(l)).join("\n") + "\n");
        return "handled";
      case "/permissions": {
        const p = ctx.settings.permissions;
        out.write([
          `  mode: ${state.mode} (shift+tab to cycle)`,
          `  allow: ${p.allow.length === 0 ? "(none)" : ""}`,
          ...p.allow.map((r) => c.green(`    \u2713 ${r}`)),
          `  ask: ${p.ask.length === 0 ? "(none)" : ""}`,
          ...p.ask.map((r) => c.yellow(`    ? ${r}`)),
          `  deny: ${p.deny.length === 0 ? "(none)" : ""}`,
          ...p.deny.map((r) => c.red(`    \u2717 ${r}`)),
          c.dim("  rules live in ~/.vexa/config.json and .vexa/settings.json")
        ].join("\n") + "\n");
        return "handled";
      }
      case "/compact": {
        if (state.messages.length === 0) {
          out.write(c.dim("nothing to compact yet\n"));
          return "handled";
        }
        const args = line.trim().slice("/compact".length).trim();
        out.write(c.yellow("\u273B compacting\u2026\n"));
        try {
          const key = resolveApiKey(state.resolved.profile, state.resolved.profileName);
          const { summary } = await summarizeConversation(state.messages, {
            baseUrl: state.resolved.profile.baseUrl,
            apiKey: key,
            model: state.resolved.modelId,
            maxTokensParam: state.resolved.profile.maxTokensParam,
            maxTokens: state.resolved.profile.maxTokens,
            instructions: args
          });
          const tpath = transcriptPathFor(process.cwd(), state.sessionId);
          const compacted = applyCompaction(state.messages, summary, tpath);
          void state.transcript.append(compacted[0], {
            compactMetadata: { trigger: "manual", preCompactTokenCount: state.messages.length }
          });
          state.messages.length = 0;
          state.messages.push(...compacted);
          compactFailures = 0;
          out.write(successLine(`compacted \u2014 ~${estimateUsage(state.messages)} tokens of context now
`));
        } catch (e) {
          compactFailures++;
          out.write(errorLine(`compaction failed: ${e.message}`) + "\n");
        }
        return "handled";
      }
      case "/init": {
        const p = `${process.cwd()}\\VEXA.md`;
        if (import_node_fs19.default.existsSync(p)) {
          out.write(c.dim(`VEXA.md already exists at ${p} \u2014 edit it directly or use /memory (P15)`) + "\n");
          return "handled";
        }
        import_node_fs19.default.writeFileSync(p, [
          "# VEXA.md",
          "",
          "Instructions for Vexa Code when working in this repository.",
          "",
          "## Build & test commands",
          "- Build: (fill in)",
          "- Test: (fill in)",
          "- Lint/typecheck: (fill in)",
          "",
          "## Conventions",
          "- (fill in: framework, style, patterns)",
          "",
          "## Notes",
          "- Lines starting with @ can include other files, e.g.:",
          "@docs/PLAN.md",
          ""
        ].join("\n"));
        out.write(successLine(`created ${p} \u2014 fill in the sections so Vexa knows your repo`) + "\n");
        return "handled";
      }
      case "/mcp": {
        if (state.mcpClients.length === 0) {
          out.write(c.dim('no MCP servers connected \u2014 add them to ~/.vexa/config.json "mcpServers" or project .mcp.json\n'));
          return "handled";
        }
        for (const mc of state.mcpClients) {
          out.write(c.dim(`  ${mc.serverName}: ${mc.status} \u2014 ${mc.serverInfo.name ?? "?"} v${mc.serverInfo.version ?? "?"}
`));
        }
        return "handled";
      }
      case "/rewind": {
        const cp = ensureCheckpointer();
        if (line.trim().endsWith("list") || line.trim() === "/rewind") {
          const all = cp.list();
          if (all.length === 0) {
            out.write(c.dim("no checkpoints yet \u2014 they are created before every Edit/Write\n"));
            return "handled";
          }
          out.write(c.dim(all.slice(-8).map((e) => `  #${e.n}  ${new Date(e.timestamp).toLocaleTimeString()}  ${e.filePath}`).join("\n") + "\n"));
          out.write(c.dim("  restore: /rewind <n>\n"));
          return "handled";
        }
        const n = Number(line.trim().split(/\s+/)[1] ?? NaN);
        const r = cp.restore(Number.isInteger(n) ? n : void 0);
        if (r === null) {
          out.write(errorLine("checkpoint not found") + "\n");
          return "handled";
        }
        out.write(successLine(`restored ${r.entry.filePath} (${r.restoredBytes} bytes) from checkpoint #${r.entry.n}`) + "\n");
        readFileState.delete(r.entry.filePath);
        return "handled";
      }
      case "/quit":
      case "/exit":
        return "quit";
      default:
        out.write(errorLine(`unknown command ${cmd} \u2014 /help for the list`) + "\n");
        return "handled";
    }
  };
  printPrompt();
  const queue = [];
  let draining = false;
  let quitRequested = false;
  let inputClosed = false;
  const drain = async () => {
    if (draining)
      return;
    draining = true;
    while (queue.length > 0 && !quitRequested) {
      const line = (queue.shift() ?? "").trim();
      if (line !== "" && line.startsWith("/")) {
        const cmdName = line.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
        const custom = customCommands.find((cc) => cc.name === cmdName);
        if (custom !== void 0) {
          const args = line.slice(1 + cmdName.length).trim();
          await runTurn(expandCommand(custom, args));
          if (queue.length === 0)
            printPrompt();
          continue;
        }
        const r = await handleSlash(line);
        if (r === "quit")
          quitRequested = true;
        else if (queue.length === 0)
          printPrompt();
        continue;
      }
      if (line === "") {
        if (queue.length === 0)
          printPrompt();
        continue;
      }
      await runTurn(line);
      if (queue.length === 0)
        printPrompt();
    }
    if (quitRequested || inputClosed && queue.length === 0) {
      rl.close();
      out.write(c.dim("\nvexa out. \u273B\n"));
      process.exit(0);
    }
    draining = false;
  };
  rl.on("line", (line) => {
    queue.push(line);
    void drain();
  });
  rl.on("close", () => {
    inputClosed = true;
    void drain();
  });
}
var import_node_readline2, import_node_fs19, import_node_child_process7, readFileState, MODE_CYCLE, MODE_LABEL, HELP_LINES;
var init_repl = __esm({
  "../dist/ui/repl.js"() {
    "use strict";
    import_node_readline2 = __toESM(require("node:readline"), 1);
    import_node_fs19 = __toESM(require("node:fs"), 1);
    import_node_child_process7 = require("node:child_process");
    init_client();
    init_wire();
    init_retry();
    init_profiles();
    init_types();
    init_prompt();
    init_vexamd();
    init_queryLoop();
    init_registry2();
    init_task();
    init_checkpoints();
    init_state();
    init_engine();
    init_compaction();
    init_config();
    init_client2();
    init_mcpBridge();
    init_contextTracker();
    init_memory();
    init_skills();
    init_hooks();
    init_skills();
    init_transcript();
    init_render();
    init_spinner();
    init_profiles();
    readFileState = /* @__PURE__ */ new Map();
    MODE_CYCLE = ["default", "acceptEdits", "plan", "bypassPermissions"];
    MODE_LABEL = {
      default: "",
      acceptEdits: "\u23F5\u23F5 accept edits on",
      plan: "\u23F8\u23F8 plan mode on",
      bypassPermissions: "\u23F5\u23F5\u23F5 bypass permissions on (unsafe)"
    };
    HELP_LINES = [
      "Vexa Code commands:",
      "  /help              show this help",
      "  /clear             start a fresh conversation",
      "  /model [ref]       show or switch model (alias, profile:model, or bare id)",
      "  /cost              session token usage",
      "  /status            model, provider, mode, context",
      "  /permissions       show permission mode (editor lands in P10)",
      "  /compact [note]    compact the conversation (lands in P14)",
      "  /resume [id]       resume a session (lands in P18)",
      "  /quit              exit",
      "",
      "Keyboard: Shift+Tab cycles permission mode \xB7 Esc interrupts \xB7 Ctrl+C twice exits"
    ];
  }
});

// ../dist/entrypoints/repl.js
var repl_exports = {};
__export(repl_exports, {
  startRepl: () => startRepl
});
async function startRepl(ctx) {
  await runRepl(ctx);
}
var init_repl2 = __esm({
  "../dist/entrypoints/repl.js"() {
    "use strict";
    init_repl();
  }
});

// ../dist/cli.js
var import_node_util = require("node:util");
init_paths();

// ../dist/config/settings.js
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
init_paths();
var ConfigError = class extends Error {
  filePath;
  constructor(message, filePath) {
    super(message);
    this.filePath = filePath;
    this.name = "ConfigError";
  }
};
var PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions"
];
var DEFAULT_SETTINGS = {
  model: "default",
  providerProfiles: {},
  aliases: {},
  permissions: {
    allow: [],
    ask: [],
    deny: [],
    defaultMode: "default",
    additionalDirectories: []
  },
  env: {},
  autoCompactEnabled: true
};
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
var KNOWN_TOP_LEVEL_KEYS = /* @__PURE__ */ new Set([
  "model",
  "providerProfiles",
  "aliases",
  "permissions",
  "hooks",
  "env",
  "autoCompactEnabled",
  "webSearch",
  "summaryModel",
  "appendSystemPrompt",
  "mcpServers"
]);
function validateFile(filePath, data, errors, warnings) {
  for (const key of Object.keys(data)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`${filePath}: unknown key "${key}" (typo or from a newer version?)`);
    }
  }
  if (data["model"] !== void 0 && typeof data["model"] !== "string") {
    errors.push(`${filePath}: "model" must be a string`);
  }
  if (data["aliases"] !== void 0) {
    if (!isPlainObject(data["aliases"])) {
      errors.push(`${filePath}: "aliases" must be an object`);
    } else {
      for (const [k, v] of Object.entries(data["aliases"])) {
        if (typeof v !== "string")
          errors.push(`${filePath}: aliases."${k}" must be a string`);
      }
    }
  }
  if (data["env"] !== void 0 && !isPlainObject(data["env"])) {
    errors.push(`${filePath}: "env" must be an object of strings`);
  }
  if (data["autoCompactEnabled"] !== void 0 && typeof data["autoCompactEnabled"] !== "boolean") {
    errors.push(`${filePath}: "autoCompactEnabled" must be a boolean`);
  }
  if (data["providerProfiles"] !== void 0) {
    if (!isPlainObject(data["providerProfiles"])) {
      errors.push(`${filePath}: "providerProfiles" must be an object`);
    } else {
      for (const [name, p] of Object.entries(data["providerProfiles"])) {
        if (!isPlainObject(p)) {
          errors.push(`${filePath}: providerProfiles."${name}" must be an object`);
          continue;
        }
        const prof = p;
        if (typeof prof["baseUrl"] !== "string" || prof["baseUrl"] === "") {
          errors.push(`${filePath}: providerProfiles."${name}".baseUrl must be a non-empty string`);
        }
        if (typeof prof["apiKeyEnv"] !== "string" || prof["apiKeyEnv"] === "") {
          errors.push(`${filePath}: providerProfiles."${name}".apiKeyEnv must be a non-empty string (name of the env var holding the API key)`);
        }
        if (typeof prof["model"] !== "string" || prof["model"] === "") {
          errors.push(`${filePath}: providerProfiles."${name}".model must be a non-empty string`);
        }
        if (prof["contextWindow"] !== void 0 && typeof prof["contextWindow"] !== "number") {
          errors.push(`${filePath}: providerProfiles."${name}".contextWindow must be a number`);
        }
      }
    }
  }
  if (data["permissions"] !== void 0) {
    if (!isPlainObject(data["permissions"])) {
      errors.push(`${filePath}: "permissions" must be an object`);
    } else {
      const perms = data["permissions"];
      for (const listKey of ["allow", "ask", "deny"]) {
        if (perms[listKey] !== void 0) {
          const list = perms[listKey];
          if (!Array.isArray(list) || list.some((r) => typeof r !== "string")) {
            errors.push(`${filePath}: permissions.${listKey} must be an array of rule strings`);
          }
        }
      }
      if (perms["defaultMode"] !== void 0 && !PERMISSION_MODES.includes(perms["defaultMode"])) {
        errors.push(`${filePath}: permissions.defaultMode must be one of ${PERMISSION_MODES.join(" | ")}`);
      }
    }
  }
}
function readSettingsFile(label, filePath, errors, warnings) {
  if (!import_node_fs2.default.existsSync(filePath))
    return {};
  let raw;
  try {
    raw = import_node_fs2.default.readFileSync(filePath, "utf8");
  } catch (e) {
    errors.push(`${filePath}: cannot read (${e.message})`);
    return {};
  }
  if (raw.trim() === "") {
    warnings.push(`${filePath}: file is empty, ignoring`);
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errors.push(`${filePath}: invalid JSON \u2014 ${e.message}`);
    return {};
  }
  if (!isPlainObject(parsed)) {
    errors.push(`${filePath}: top level must be a JSON object`);
    return {};
  }
  validateFile(filePath, parsed, errors, warnings);
  return parsed;
}
function expandEnvStrings(value, warnings) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name) => {
      const v = process.env[name];
      if (v === void 0) {
        warnings.push(`env var "\${${name}}" is not set \u2014 expanded to empty string`);
        return "";
      }
      return v;
    });
  }
  if (Array.isArray(value))
    return value.map((v) => expandEnvStrings(v, warnings));
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value))
      out[k] = expandEnvStrings(v, warnings);
    return out;
  }
  return value;
}
function mergeSettings(base, over) {
  for (const [key, overVal] of Object.entries(over)) {
    const baseVal = base[key];
    if (key === "permissions" && isPlainObject(baseVal) && isPlainObject(overVal)) {
      const merged = { ...baseVal };
      mergeSettings(merged, overVal);
      for (const listKey of ["allow", "ask", "deny"]) {
        const b = merged[listKey];
        const o = overVal[listKey];
        if (Array.isArray(b) && Array.isArray(o)) {
          merged[listKey] = [.../* @__PURE__ */ new Set([...b, ...o])];
        }
      }
      base[key] = merged;
      continue;
    }
    if (isPlainObject(baseVal) && isPlainObject(overVal)) {
      const merged = { ...baseVal };
      mergeSettings(merged, overVal);
      base[key] = merged;
    } else {
      base[key] = overVal;
    }
  }
}
function loadSettings(cwd, settingsFlag) {
  const errors = [];
  const warnings = [];
  const sources = [];
  const userPath = userConfigPath();
  const user = readSettingsFile("user", userPath, errors, warnings);
  if (Object.keys(user).length > 0)
    sources.push(userPath);
  const projectRoot = findProjectRoot(cwd);
  const projectFiles = [];
  if (projectRoot) {
    projectFiles.push(["project", import_node_path2.default.join(projectRoot, ".vexa", "settings.json")], ["local", import_node_path2.default.join(projectRoot, ".vexa", "settings.local.json")]);
  }
  if (settingsFlag)
    projectFiles.push(["--settings", import_node_path2.default.resolve(settingsFlag)]);
  const merged = structuredClone(DEFAULT_SETTINGS);
  mergeSettings(merged, user);
  for (const [label, filePath] of projectFiles) {
    const data = readSettingsFile(label, filePath, errors, warnings);
    if (Object.keys(data).length > 0) {
      mergeSettings(merged, data);
      sources.push(filePath);
    }
  }
  if (errors.length > 0)
    throw new ConfigError(errors.join("\n"), userPath);
  const expanded = expandEnvStrings(merged, warnings);
  expanded.permissions = { ...DEFAULT_SETTINGS.permissions, ...expanded.permissions };
  expanded.providerProfiles = expanded.providerProfiles ?? {};
  expanded.aliases = expanded.aliases ?? {};
  expanded.env = expanded.env ?? {};
  return { settings: expanded, warnings, sources, projectRoot };
}

// ../dist/cli.js
init_profiles();

// ../dist/entrypoints/providers.js
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_readline = __toESM(require("node:readline"), 1);
init_paths();

// ../dist/config/presets.js
var PROVIDER_PRESETS = [
  {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    contextWindow: 131072,
    label: "OpenRouter (router \u2014 hundreds of models, many :free)",
    free: true,
    notes: "append :free to model ids for free tier; usage needs stream_options"
  },
  {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    contextWindow: 131072,
    label: "Groq (free tier, extremely fast)",
    free: true
  },
  {
    name: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    contextWindow: 1048576,
    label: "Google Gemini OpenAI-compat endpoint (free tier)",
    free: true
  },
  {
    name: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    apiKeyEnv: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    contextWindow: 131072,
    label: "Mistral (free experiment tier)",
    free: true
  },
  {
    name: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKeyEnv: "CEREBRAS_API_KEY",
    defaultModel: "llama-3.3-70b",
    contextWindow: 128e3,
    label: "Cerebras (free tier, wafer-speed inference)",
    free: true
  },
  {
    name: "github",
    baseUrl: "https://models.github.ai/inference",
    apiKeyEnv: "GITHUB_TOKEN",
    defaultModel: "openai/gpt-4.1-mini",
    contextWindow: 128e3,
    label: "GitHub Models (free tier with a GitHub PAT)",
    free: true
  },
  {
    name: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKeyEnv: "NVIDIA_API_KEY",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    contextWindow: 128e3,
    label: "NVIDIA NIM (free credits)",
    notes: "catalog is per-account (old ids 404) \u2014 run `vexa providers test nvidia` to list yours; nemotron-3-ultra currently hangs server-side"
  },
  {
    name: "huggingface",
    baseUrl: "https://router.huggingface.co/v1",
    apiKeyEnv: "HF_TOKEN",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    contextWindow: 131072,
    label: "Hugging Face router (free credits)"
  },
  {
    name: "zai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    apiKeyEnv: "ZAI_API_KEY",
    defaultModel: "glm-4.6",
    contextWindow: 2e5,
    label: "Z.AI / Zhipu GLM (cheap, long context)"
  },
  {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    contextWindow: 128e3,
    label: "DeepSeek (very cheap, strong coder)"
  },
  {
    name: "together",
    baseUrl: "https://api.together.xyz/v1",
    apiKeyEnv: "TOGETHER_API_KEY",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    contextWindow: 131072,
    label: "Together AI (cheap open models)"
  },
  {
    name: "ollama",
    baseUrl: "http://localhost:11434/v1",
    apiKeyEnv: "OLLAMA_API_KEY",
    defaultModel: "qwen2.5-coder:7b",
    contextWindow: 8192,
    label: "Ollama (local, free, offline)",
    noAuth: true,
    notes: "raise contextWindow to match your ollama num_ctx or compaction math lies"
  },
  {
    name: "lmstudio",
    baseUrl: "http://localhost:1234/v1",
    apiKeyEnv: "LMSTUDIO_API_KEY",
    defaultModel: "local-model",
    contextWindow: 8192,
    label: "LM Studio (local, free, offline)",
    noAuth: true,
    notes: "set contextWindow to the loaded model context"
  },
  {
    name: "vllm",
    baseUrl: "http://localhost:8000/v1",
    apiKeyEnv: "VLLM_API_KEY",
    defaultModel: "meta-llama/Llama-3.1-8B-Instruct",
    contextWindow: 32768,
    label: "vLLM (self-hosted)",
    noAuth: true
  }
];
function getPreset(name) {
  const lower = name.toLowerCase();
  return PROVIDER_PRESETS.find((p) => p.name === lower);
}

// ../dist/entrypoints/providers.js
init_auth();
function readUserConfigRaw() {
  const p = userConfigPath();
  if (!import_node_fs4.default.existsSync(p))
    return {};
  const parsed = JSON.parse(import_node_fs4.default.readFileSync(p, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${p}: top level must be a JSON object`);
  }
  return parsed;
}
function writeUserConfigRaw(cfg) {
  import_node_fs4.default.writeFileSync(userConfigPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 384 });
  import_node_fs4.default.chmodSync(userConfigPath(), 384);
}
function fail(msg) {
  process.stderr.write(`vexa providers: ${msg}
`);
  process.exit(1);
}
function parseAddArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === void 0)
      break;
    const next = () => {
      const v = argv[++i];
      if (v === void 0)
        fail(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--base-url":
        args.baseUrl = next();
        break;
      case "--api-key-env":
        args.apiKeyEnv = next();
        break;
      case "--model":
        args.model = next();
        break;
      case "--as":
        args.as = next();
        break;
      case "--context-window":
        args["context-window"] = next();
        break;
      case "--no-auth":
        args["no-auth"] = true;
        break;
      default:
        if (a.startsWith("-"))
          fail(`unknown flag ${a}`);
        else if (args.name === void 0)
          args.name = a;
        else
          fail(`unexpected argument "${a}" (profile name goes last)`);
    }
  }
  return args;
}
function cmdList() {
  const cfg = readUserConfigRaw();
  const profiles = cfg["providerProfiles"] ?? {};
  const keys = new Set(storedKeyNames());
  const lines = ["PRESETS (vexa providers add <name>)", ""];
  for (const p of PROVIDER_PRESETS) {
    const configured = Object.values(profiles).some((v) => typeof v === "object" && v !== null && v["baseUrl"] === p.baseUrl);
    const flag = p.free ? " [free]" : "";
    const mark = configured ? "\u2713" : " ";
    const key = p.noAuth ? "" : keys.has(p.name) ? " key:set(auth.json)" : ` key: env ${p.apiKeyEnv}`;
    lines.push(` ${mark} ${p.name.padEnd(13)} ${p.label}${flag}${key}`);
  }
  lines.push("", "YOUR PROFILES", "");
  const entries = Object.entries(profiles);
  if (entries.length === 0)
    lines.push(" (none yet \u2014 try: vexa providers add groq)");
  for (const [name, v] of entries) {
    const prof = v ?? {};
    const envName = typeof prof["apiKeyEnv"] === "string" ? prof["apiKeyEnv"] : "";
    const envSet = envName !== "" && (process.env[envName] ?? "") !== "";
    const hasKey = prof["noAuth"] === true || keys.has(name) || envSet;
    lines.push(` \u2022 ${name.padEnd(13)} ${String(prof["baseUrl"] ?? "?")}  model=${String(prof["model"] ?? "?")}  ${hasKey ? "key:configured" : "key:MISSING"}`);
  }
  lines.push("", "usage: vexa providers add <preset|custom> \xB7 set-key <profile> \xB7 test <profile> \xB7 remove <profile>");
  process.stdout.write(lines.join("\n") + "\n");
}
function cmdAdd(argv) {
  const a = parseAddArgs(argv);
  const preset = a.name ? getPreset(a.name) : void 0;
  const name = a.as ?? a.name;
  if (name === void 0 || name === "") {
    fail("profile name required: vexa providers add <preset> [--as other-name] or vexa providers add <name> --base-url URL --model M");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name))
    fail(`profile name "${name}" must be [a-zA-Z0-9_-]`);
  const baseUrl = a.baseUrl ?? preset?.baseUrl;
  const model = a.model ?? preset?.defaultModel;
  const noAuth = a["no-auth"] ?? preset?.noAuth ?? false;
  const apiKeyEnv = a.apiKeyEnv ?? preset?.apiKeyEnv ?? `${name.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const contextWindow = a["context-window"] !== void 0 ? Number(a["context-window"]) : preset?.contextWindow;
  if (baseUrl === void 0 || model === void 0) {
    fail("custom profiles need --base-url and --model (presets fill these automatically)");
  }
  if (Number.isNaN(contextWindow ?? 0) || (contextWindow ?? 0) <= 0) {
    fail("--context-window must be a positive integer");
  }
  const cfg = readUserConfigRaw();
  const profiles = { ...cfg["providerProfiles"] ?? {} };
  profiles[name] = {
    baseUrl,
    apiKeyEnv: noAuth ? apiKeyEnv : apiKeyEnv,
    model,
    contextWindow,
    label: preset?.label ?? name,
    ...preset?.noAuth || noAuth ? { noAuth: true } : {},
    ...preset?.notes ? { notes: preset.notes } : {}
  };
  cfg["providerProfiles"] = profiles;
  writeUserConfigRaw(cfg);
  const keyHint = noAuth ? "no API key needed (local server)" : `API key: set env ${apiKeyEnv}  OR  run: vexa providers set-key ${name}`;
  process.stdout.write(`\u2713 profile "${name}" written to ${userConfigPath()}
  baseUrl : ${baseUrl}
  model   : ${model}
  ${keyHint}
  use it  : vexa --model ${name === "default" ? "" : `${name}:`}${model}
`);
}
function cmdRemove(argv) {
  const name = argv[0];
  if (name === void 0)
    fail("usage: vexa providers remove <profile>");
  const cfg = readUserConfigRaw();
  const profiles = { ...cfg["providerProfiles"] ?? {} };
  if (!(name in profiles))
    fail(`no profile named "${name}"`);
  delete profiles[name];
  cfg["providerProfiles"] = profiles;
  writeUserConfigRaw(cfg);
  removeApiKey(name);
  process.stdout.write(`\u2713 removed profile "${name}" (and any stored key)
`);
}
async function cmdSetKey(argv) {
  const name = argv[0];
  if (name === void 0)
    fail("usage: vexa providers set-key <profile>  (key on stdin: echo <key> | vexa providers set-key <profile>)");
  const cfg = readUserConfigRaw();
  const profiles = cfg["providerProfiles"] ?? {};
  if (!(name in profiles))
    fail(`no profile named "${name}" (vexa providers list)`);
  let key;
  if (process.stdin.isTTY) {
    process.stdout.write(`paste API key for "${name}" (visible in TTY \u2014 pipe it instead for privacy):
> `);
    const rl = import_node_readline.default.createInterface({ input: process.stdin });
    const it = rl[Symbol.asyncIterator]();
    const first = await it.next();
    rl.close();
    if (first.done || (first.value ?? "").trim() === "")
      fail("empty key");
    key = String(first.value).trim();
  } else {
    const chunks = [];
    for await (const c2 of process.stdin)
      chunks.push(c2);
    key = Buffer.concat(chunks).toString("utf8").trim();
    if (key === "")
      fail("empty key on stdin");
  }
  const p = saveApiKey(name, key);
  process.stdout.write(`\u2713 key for "${name}" stored in ${p} (0600, never written to config.json)
`);
}
async function cmdTest(argv) {
  const name = argv[0];
  if (name === void 0)
    fail("usage: vexa providers test <profile>");
  const cfg = readUserConfigRaw();
  const profiles = cfg["providerProfiles"] ?? {};
  const prof = profiles[name];
  if (prof === void 0)
    fail(`no profile named "${name}"`);
  const baseUrl = String(prof["baseUrl"] ?? "").replace(/\/+$/, "");
  const apiKeyEnv = String(prof["apiKeyEnv"] ?? "");
  const noAuth = prof["noAuth"] === true;
  const key = noAuth ? "" : process.env[apiKeyEnv] ?? readStoredKey(name) ?? "";
  if (!noAuth && key === "") {
    fail(`no key for "${name}" \u2014 set env ${apiKeyEnv} or vexa providers set-key ${name}`);
  }
  process.stdout.write(`GET ${baseUrl}/models \u2026 `);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1e4);
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: noAuth ? {} : { Authorization: `Bearer ${key}` },
      signal: ctrl.signal
    });
    if (!res.ok) {
      process.stdout.write(`HTTP ${res.status} ${res.statusText}
`);
      process.exit(1);
    }
    const body = await res.json();
    const ids = (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
    process.stdout.write(`OK \u2014 ${ids.length} models
`);
    if (ids.length > 0) {
      process.stdout.write(`  e.g. ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? `, \u2026 +${ids.length - 5} more` : ""}
`);
    }
  } catch (e) {
    process.stdout.write(`FAILED \u2014 ${e.message}
`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}
async function runProviders(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "list":
      cmdList();
      return;
    case "add":
      cmdAdd(rest);
      return;
    case "remove":
    case "rm":
      cmdRemove(rest);
      return;
    case "set-key":
      await cmdSetKey(rest);
      return;
    case "test":
      await cmdTest(rest);
      return;
    default:
      process.stdout.write("usage: vexa providers <list | add <preset|name> [--as n] [--model m] [--base-url u] [--api-key-env v] [--context-window n] [--no-auth] | set-key <profile> | test <profile> | remove <profile>>\n");
      if (cmd !== void 0)
        process.exit(2);
  }
}

// ../dist/version.js
var VERSION = "1.0.0";

// ../dist/cli.js
var HELP_TEXT = `vexa \u2014 a coding agent for your terminal. Any model. Any provider.

USAGE
  vexa                        interactive REPL
  vexa "prompt"               run one prompt in the REPL
  vexa -p "prompt"            headless: print the answer and exit
  vexa providers ...          manage provider profiles
  vexa --gui                  desktop bridge (used by the Vexa Code app)

FLAGS
  -p, --print            headless one-shot (VEXA_OUTPUT_FORMAT=json for JSON)
      --gui              stdio line-JSON bridge for the desktop app
      --model <ref>      provider profile name or alias (default profile if omitted)
      --settings <file>  extra settings file (lowest priority wins per key)
      --add-dir <dir>    grant access to an extra working directory
      --max-turns <n>    agent turn budget
      --resume [id]      resume session (most recent if no id given)
  -h, --help             show this help
      --version          show version

EXAMPLES
  vexa                                   start coding
  vexa --model nvidia                    use the "nvidia" provider profile
  vexa -p "summarize TODOs"              one-shot answer
  VEXA_OUTPUT_FORMAT=json vexa -p "..."  machine-readable output
  vexa --resume                          continue your last session

Inside the REPL: /help for slash commands (/sessions /rewind /model /mcp \u2026).
`;
function parseCliFlags() {
  const argv = process.argv.slice(2).map((a) => a === "--resume" ? "--resume=" : a);
  const { values, positionals } = (0, import_node_util.parseArgs)({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      model: { type: "string" },
      settings: { type: "string" },
      "add-dir": { type: "string", multiple: true },
      "max-turns": { type: "string" },
      gui: { type: "boolean" },
      print: { type: "boolean", short: "p" },
      resume: { type: "string" }
    }
  });
  if (values.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }
  if (values.version) {
    process.stdout.write(`vexa ${VERSION}
`);
    process.exit(0);
  }
  let maxTurns;
  if (values["max-turns"] !== void 0) {
    maxTurns = Number(values["max-turns"]);
    if (!Number.isInteger(maxTurns) || maxTurns <= 0) {
      fail2(`--max-turns must be a positive integer, got "${String(values["max-turns"])}"`);
    }
  }
  return {
    flags: {
      model: values.model,
      settings: values.settings,
      addDir: values["add-dir"],
      maxTurns,
      print: values.print === true,
      gui: values.gui === true,
      resume: values.resume
    },
    positionals
  };
}
function fail2(message) {
  process.stderr.write(`vexa: ${message}
`);
  process.exit(1);
}
async function main() {
  const raw = process.argv.slice(2);
  if (raw[0] === "providers") {
    await runProviders(raw.slice(1));
    return;
  }
  const { flags, positionals } = parseCliFlags();
  ensureUserDirs();
  const loaded = loadSettings(process.cwd(), flags.settings);
  for (const w of loaded.warnings)
    process.stderr.write(`vexa: warning: ${w}
`);
  const resolved = resolveModelRef(loaded.settings, flags.model);
  const ctx = {
    settings: loaded.settings,
    resolved,
    flags,
    projectRoot: loaded.projectRoot,
    settingsSources: loaded.sources,
    version: VERSION,
    ...flags.resume !== void 0 ? { resumeTarget: flags.resume } : {}
  };
  if (flags.gui === true) {
    const { runGuiBridge: runGuiBridge2 } = await Promise.resolve().then(() => (init_guiBridge(), guiBridge_exports));
    runGuiBridge2(ctx);
    return;
  }
  if (flags.print) {
    const { runHeadless: runHeadless2 } = await Promise.resolve().then(() => (init_headless(), headless_exports));
    await runHeadless2(ctx, positionals);
    return;
  }
  const { startRepl: startRepl2 } = await Promise.resolve().then(() => (init_repl2(), repl_exports));
  await startRepl2(ctx);
}
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`vexa: unexpected async error: ${reason instanceof Error ? reason.message : String(reason)}
`);
});
process.on("uncaughtException", (err) => {
  process.stderr.write(`vexa: fatal: ${err.message}
`);
  process.exit(1);
});
main().catch((err) => {
  if (err instanceof ConfigError) {
    fail2(`invalid settings
${err.message}
(fix the file and run again: ${userConfigPath()})`);
  }
  fail2(err instanceof Error ? err.message : String(err));
});
