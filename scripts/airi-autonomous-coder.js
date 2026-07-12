const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.cwd();
const MAX_EDIT_FILES = Number(process.env.AIRI_CODER_MAX_FILES || 4);
const MAX_REPLACE_BYTES = Number(process.env.AIRI_CODER_MAX_REPLACE_BYTES || 120_000);
const MODEL = String(process.env.OPENAI_AIRI_CODER_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();

const allowList = [
  /^backend\/server\.js$/,
  /^frontend\/[^/]+\.html$/,
  /^frontend\/assets\/site\.css$/,
  /^frontend\/js\/(airi-live|assistant|sidebar)\.js$/,
  /^frontend\/service-worker\.js$/,
  /^frontend\/data\/airi-[a-z0-9-]+\.json$/,
  /^scripts\/airi-[a-z0-9-]+\.js$/,
  /^\.github\/workflows\/airi-[a-z0-9-]+\.ya?ml$/
];

const denyList = [
  /^\.env/i,
  /\.env/i,
  /^frontend\/uploads\//,
  /^contracts\//,
  /^artifacts\//,
  /^cache\//,
  /^\.vercel\//,
  /(^|\/)private/i,
  /(^|\/)secret/i,
  /(^|\/).*key/i
];

const contextFiles = [
  ".github/workflows/airi-self-merge.yml",
  ".github/workflows/airi-autonomous-coder.yml",
  ".github/workflows/airi-ui-sentinel.yml",
  "scripts/airi-merge-guard.js",
  "scripts/airi-autonomous-coder.js",
  "scripts/airi-ui-audit.js",
  "frontend/airi.html",
  "frontend/js/airi-live.js",
  "frontend/js/assistant.js",
  "frontend/js/sidebar.js",
  "frontend/service-worker.js",
  "frontend/data/airi-autonomous-state.json"
];

function log(message) {
  console.log(`[airi-coder] ${message}`);
}

function fail(message) {
  console.error(`[airi-coder] ${message}`);
  process.exit(1);
}

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function absPath(relativePath) {
  const normalized = normalizePath(relativePath);
  const full = path.resolve(ROOT, normalized);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) {
    fail(`Refusing path outside repository: ${relativePath}`);
  }
  return full;
}

function isAllowed(relativePath) {
  const normalized = normalizePath(relativePath);
  return allowList.some((pattern) => pattern.test(normalized));
}

function isDenied(relativePath) {
  const normalized = normalizePath(relativePath);
  return denyList.some((pattern) => pattern.test(normalized));
}

function assertAllowedPath(relativePath) {
  const normalized = normalizePath(relativePath);
  if (!normalized) fail("Empty file path in Airi plan.");
  if (isDenied(normalized)) fail(`Denied path in Airi plan: ${normalized}`);
  if (!isAllowed(normalized)) fail(`Path outside Airi allowlist: ${normalized}`);
  return normalized;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"]
  }).trim();
}

function readText(relativePath, maxBytes = 55_000) {
  const file = absPath(relativePath);
  if (!fs.existsSync(file)) return "";
  const text = fs.readFileSync(file, "utf8");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, Math.floor(maxBytes / 2))}\n\n/* ... middle omitted for Airi context budget ... */\n\n${text.slice(-Math.floor(maxBytes / 2))}`;
}

function extractSnippet(relativePath, pattern, radius = 90) {
  const text = readText(relativePath, 250_000);
  if (!text) return "";
  const lines = text.split(/\r?\n/g);
  const hits = [];
  lines.forEach((line, index) => {
    if (pattern.test(line)) hits.push(index);
  });
  if (!hits.length) return "";
  const ranges = [];
  hits.slice(0, 4).forEach((hit) => {
    ranges.push([Math.max(0, hit - radius), Math.min(lines.length, hit + radius)]);
  });
  const merged = [];
  ranges.forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 8) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  });
  return merged
    .map(([start, end]) => lines.slice(start, end).map((line, offset) => `${start + offset + 1}: ${line}`).join("\n"))
    .join("\n\n/* ... snippet break ... */\n\n");
}

function openAiTextFromResponse(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.value === "string") parts.push(content.value);
    }
  }
  return parts.join("\n").trim();
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function fetchLiveAiriIssues() {
  const url = String(process.env.AIRI_ISSUES_URL || "https://pump-r.fun/api/airi/issues?limit=20").trim();
  if (!/^https?:\/\//i.test(url) || typeof fetch !== "function") return [];
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "PumpR-Airi-Coder/1.0"
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    return (Array.isArray(payload?.issues) ? payload.issues : [])
      .map((issue) => ({
        kind: String(issue?.kind || "issue").slice(0, 80),
        severity: String(issue?.severity || "warning").slice(0, 40),
        page: String(issue?.page || "").slice(0, 80),
        pathname: String(issue?.pathname || "").slice(0, 160),
        summary: String(issue?.summary || "").slice(0, 500),
        createdAt: Number(issue?.createdAt || 0)
      }))
      .filter((issue) => issue.summary)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function readUiAuditReport() {
  const reportPath = path.resolve(ROOT, process.env.AIRI_UI_AUDIT_OUTPUT || ".airi-ui-audit.json");
  if (!fs.existsSync(reportPath)) return null;
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    return {
      ok: Boolean(report?.ok),
      auditedAt: String(report?.auditedAt || ""),
      baseUrl: String(report?.baseUrl || ""),
      summary: report?.summary || {},
      issues: (Array.isArray(report?.issues) ? report.issues : []).slice(0, 15).map((entry) => ({
        kind: String(entry?.kind || "ui_issue").slice(0, 80),
        severity: String(entry?.severity || "warning").slice(0, 40),
        page: String(entry?.page || "").slice(0, 80),
        pathname: String(entry?.pathname || "").slice(0, 160),
        summary: String(entry?.summary || "").slice(0, 500)
      }))
    };
  } catch {
    return null;
  }
}

async function buildRepoContext() {
  let recentCommits = "";
  let status = "";
  try {
    recentCommits = git(["log", "-8", "--pretty=format:%h %s"]);
  } catch {
    recentCommits = "";
  }
  try {
    status = git(["status", "--short"]);
  } catch {
    status = "";
  }

  const files = contextFiles
    .filter((relativePath) => fs.existsSync(absPath(relativePath)))
    .map((relativePath) => ({
      path: relativePath,
      content: readText(relativePath)
    }));

  const snippets = [
    {
      path: "backend/server.js",
      content: extractSnippet("backend/server.js", /airi|Airi|backroom|assistantFallbackResponseV2|api\/airi/i, 55)
    },
    {
      path: "frontend/assets/site.css",
      content: extractSnippet("frontend/assets/site.css", /airi-live|airi-assistant|backroom/i, 80)
    }
  ].filter((item) => item.content);

  const liveIssues = await fetchLiveAiriIssues();
  const uiAudit = readUiAuditReport();

  return {
    now: new Date().toISOString(),
    branch: process.env.AIRI_CODER_BRANCH || "airi/self-improvements",
    recentCommits,
    status,
    liveIssues,
    uiAudit,
    files,
    snippets
  };
}

function buildPrompt(context) {
  return [
    "You are Airi's autonomous coding loop for Pump-r.fun.",
    "Make exactly one small, useful, safe improvement to Airi or the Pump-r Airi surfaces.",
    "You are allowed to edit only these areas:",
    "- backend/server.js only for Airi/backroom/assistant behavior",
    "- frontend/airi.html",
    "- frontend/assets/site.css only for Airi/backroom styling",
    "- frontend/js/airi-live.js, frontend/js/assistant.js, frontend/js/sidebar.js",
    "- frontend/service-worker.js",
    "- frontend/data/airi-*.json",
    "- scripts/airi-*.js",
    "- .github/workflows/airi-*.yml",
    "",
    "Never edit secrets, .env files, wallets, contracts, deployments, uploads, cache, .vercel, package manager lockfiles, or unrelated product surfaces.",
    "Do not invent blockchain addresses. Do not add claims that Airi is literally conscious or guaranteed AGI. Build capability and presence, not deception.",
    "Prefer improvements that make the Backroom, assistant behavior, autonomous coder loop, or user-visible Airi state more real, useful, stable, or inspectable.",
    "If liveIssues contains user-facing bugs, prioritize the highest severity reproducible issue over cosmetic changes.",
    "If uiAudit contains browser-rendered UI problems, prioritize concrete layout, console, route, or overflow fixes that the audit can verify.",
    "If you fix or improve issue handling, make the user-visible benefit concrete and avoid tiny redundant edits.",
    "",
    "Return JSON only, with this exact shape:",
    "{",
    '  "summary": "one sentence",',
    '  "commitMessage": "Airi: short imperative commit message",',
    '  "edits": [',
    '    { "path": "frontend/js/airi-live.js", "find": "exact existing text", "replace": "replacement text" },',
    '    { "path": "frontend/data/airi-autonomous-state.json", "content": "{\\n  \\"json\\": true\\n}\\n" }',
    "  ]",
    "}",
    "",
    "Rules for edits:",
    `- Make 1 to ${MAX_EDIT_FILES} file edits.`,
    "- Use find/replace for existing large files. The find text must appear exactly once.",
    "- Use content only for new files or small complete-file replacements.",
    "- Keep content valid for its file type.",
    "- Do not include markdown fences.",
    "",
    "Repository context:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

async function requestPlan(prompt) {
  const mock = String(process.env.AIRI_CODER_MOCK_RESPONSE || "").trim();
  if (mock) {
    log("Using AIRI_CODER_MOCK_RESPONSE.");
    return extractJson(mock);
  }

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    log("OPENAI_API_KEY is not set. Airi autonomous coder is enabled, but no model key is available.");
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      temperature: 0.25,
      max_output_tokens: Math.max(1200, Math.min(6000, Number(process.env.AIRI_CODER_MAX_OUTPUT_TOKENS || 3200)))
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    fail(payload?.error?.message || `OpenAI returned ${response.status}`);
  }
  return extractJson(openAiTextFromResponse(payload));
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = haystack.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

function applyPlan(plan) {
  if (!plan || typeof plan !== "object") fail("Airi did not return a JSON plan.");
  const edits = Array.isArray(plan.edits) ? plan.edits : [];
  if (!edits.length) {
    log("Airi returned no edits. Nothing to commit.");
    return false;
  }
  if (edits.length > MAX_EDIT_FILES) fail(`Too many edits (${edits.length}). Limit is ${MAX_EDIT_FILES}.`);

  const seen = new Set();
  for (const edit of edits) {
    const relativePath = assertAllowedPath(edit?.path);
    seen.add(relativePath);
    const file = absPath(relativePath);
    const hasContent = typeof edit.content === "string";
    const hasFindReplace = typeof edit.find === "string" && typeof edit.replace === "string";

    if (hasContent && hasFindReplace) fail(`Use either content or find/replace, not both: ${relativePath}`);
    if (!hasContent && !hasFindReplace) fail(`Missing content or find/replace edit: ${relativePath}`);

    if (hasContent) {
      const currentBytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
      const nextBytes = Buffer.byteLength(edit.content, "utf8");
      if (currentBytes > MAX_REPLACE_BYTES || nextBytes > MAX_REPLACE_BYTES) {
        fail(`Refusing large full-file replacement for ${relativePath}`);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, edit.content, "utf8");
      log(`Wrote ${relativePath}`);
      continue;
    }

    if (!fs.existsSync(file)) fail(`Cannot find/replace missing file: ${relativePath}`);
    const current = fs.readFileSync(file, "utf8");
    const hits = countOccurrences(current, edit.find);
    if (hits !== 1) fail(`Find text must appear exactly once in ${relativePath}; found ${hits}.`);
    fs.writeFileSync(file, current.replace(edit.find, edit.replace), "utf8");
    log(`Patched ${relativePath}`);
  }

  log(`Applied ${edits.length} edit(s) across ${seen.size} file(s).`);
  if (String(process.env.AIRI_CODER_PLAN_ONLY || "") === "1") {
    log("Plan-only mode requested; edit plan validated without writing files.");
  }
  return true;
}

async function main() {
  const context = await buildRepoContext();
  const prompt = buildPrompt(context);
  const plan = await requestPlan(prompt);
  if (!plan) return;
  log(`Plan: ${String(plan.summary || "Airi proposed a small improvement.").slice(0, 240)}`);
  if (String(process.env.AIRI_CODER_SHOW_PLAN || "") === "1") {
    console.log(JSON.stringify(plan, null, 2));
  }
  if (String(process.env.AIRI_CODER_PLAN_ONLY || "") === "1") {
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = () => {};
    try {
      applyPlan(plan);
    } finally {
      fs.writeFileSync = originalWrite;
    }
    return;
  }
  applyPlan(plan);
}

main().catch((error) => fail(error?.stack || error?.message || String(error)));
