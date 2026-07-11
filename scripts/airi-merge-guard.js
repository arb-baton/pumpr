const { execFileSync } = require("child_process");

const baseRef = process.env.AIRI_BASE_REF || "origin/main";
const branch = process.env.AIRI_BRANCH || "";
const compareIndex = process.env.AIRI_COMPARE_INDEX === "1";
const maxFiles = Number(process.env.AIRI_MAX_CHANGED_FILES || 50);
const maxLines = Number(process.env.AIRI_MAX_DIFF_LINES || 7000);

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

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function fail(message) {
  console.error(`[airi-merge-guard] ${message}`);
  process.exit(1);
}

function normalizePath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

if (branch && !/^airi\/[a-z0-9._/-]+$/i.test(branch)) {
  fail(`Refusing branch outside airi/* namespace: ${branch}`);
}

let files = [];
try {
  files = git(compareIndex ? ["diff", "--name-only", "--cached"] : ["diff", "--name-only", `${baseRef}...HEAD`])
    .split(/\r?\n/g)
    .map(normalizePath)
    .filter(Boolean);
} catch (error) {
  fail(`Could not read diff against ${baseRef}: ${error.message}`);
}

if (!files.length) {
  console.log("[airi-merge-guard] No changed files. Nothing to merge.");
  process.exit(0);
}

if (files.length > maxFiles) {
  fail(`Too many changed files (${files.length}). Limit is ${maxFiles}.`);
}

const denied = files.filter((file) => denyList.some((pattern) => pattern.test(file)));
if (denied.length) {
  fail(`Denied paths present:\n${denied.map((file) => `- ${file}`).join("\n")}`);
}

const outsideAllowList = files.filter((file) => !allowList.some((pattern) => pattern.test(file)));
if (outsideAllowList.length) {
  fail(`Paths outside Airi allowlist:\n${outsideAllowList.map((file) => `- ${file}`).join("\n")}`);
}

let totalLines = 0;
try {
  const numstat = git(compareIndex ? ["diff", "--numstat", "--cached"] : ["diff", "--numstat", `${baseRef}...HEAD`]);
  totalLines = numstat
    .split(/\r?\n/g)
    .filter(Boolean)
    .reduce((sum, line) => {
      const [added, deleted] = line.split(/\s+/g);
      const a = Number(added) || 0;
      const d = Number(deleted) || 0;
      return sum + a + d;
    }, 0);
} catch (error) {
  fail(`Could not read diff size: ${error.message}`);
}

if (totalLines > maxLines) {
  fail(`Diff is too large (${totalLines} changed lines). Limit is ${maxLines}.`);
}

console.log("[airi-merge-guard] Airi diff approved.");
console.log(`[airi-merge-guard] Files: ${files.length}`);
console.log(`[airi-merge-guard] Changed lines: ${totalLines}`);
files.forEach((file) => console.log(`- ${file}`));
