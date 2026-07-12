const fs = require("fs");
const path = require("path");

const TWEX_CREATE_URL = "https://api.twexapi.io/twitter/tweets/create";
const TWEX_AUTO_COOKIE_URL = "https://api.twexapi.io/twitter/post-tweet-without-cookie";
const HISTORY_PATH = process.env.AIRI_TWEET_HISTORY_PATH || path.join(process.cwd(), ".airi-tweet-history.json");
const MAX_TWEET_CHARS = Math.max(80, Math.min(240, Number(process.env.AIRI_TWEET_MAX_CHARS || 180)));

function cleanText(value, max = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clipTweet(text) {
  const clean = String(text || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (clean.length <= MAX_TWEET_CHARS) return clean;
  const singleLine = clean.replace(/\s*\n+\s*/g, " ");
  if (singleLine.length <= MAX_TWEET_CHARS) return singleLine;
  const slice = singleLine.slice(0, MAX_TWEET_CHARS + 1);
  const boundary = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("; "),
    slice.lastIndexOf(", "),
    slice.lastIndexOf(" ")
  );
  const end = boundary >= Math.floor(MAX_TWEET_CHARS * 0.62) ? boundary : MAX_TWEET_CHARS;
  return singleLine.slice(0, end).trim().replace(/[.,;:!?-]+$/, "");
}

function readPushEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  try {
    return JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch {
    return {};
  }
}

function latestCommitFromEvent(event) {
  const commits = Array.isArray(event?.commits) ? event.commits : [];
  return commits[commits.length - 1] || event?.head_commit || {};
}

function readHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8") || "{}");
    return {
      tweets: Array.isArray(parsed.tweets) ? parsed.tweets.slice(-80) : [],
      commits: Array.isArray(parsed.commits) ? parsed.commits.slice(-120) : []
    };
  } catch {
    return { tweets: [], commits: [] };
  }
}

function writeHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify({
    tweets: (history.tweets || []).slice(-80),
    commits: (history.commits || []).slice(-120),
    updatedAt: new Date().toISOString()
  }, null, 2));
}

function normalizeForDedupe(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeForDedupe(text).split(" ").filter((word) => word.length > 2));
}

function similarity(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((word) => {
    if (right.has(word)) overlap += 1;
  });
  return overlap / Math.max(left.size, right.size);
}

function isDuplicateTweet(tweet, history) {
  const norm = normalizeForDedupe(tweet);
  return (history.tweets || []).some((row) => {
    const previous = row?.text || row || "";
    const previousNorm = normalizeForDedupe(previous);
    return previousNorm === norm || similarity(previous, tweet) > 0.72;
  });
}

function rememberTweet(history, tweet, meta = {}) {
  history.tweets = [
    ...(history.tweets || []),
    {
      text: tweet,
      mode: meta.mode || "",
      sha: meta.sha || "",
      at: new Date().toISOString()
    }
  ].slice(-80);
  if (meta.sha) {
    history.commits = Array.from(new Set([...(history.commits || []), meta.sha])).slice(-120);
  }
  writeHistory(history);
}

function shouldSkipThought(history) {
  if (process.env.GITHUB_EVENT_NAME !== "schedule") return false;
  const chance = Math.max(0, Math.min(1, Number(process.env.AIRI_THOUGHT_TWEET_CHANCE || 0.35)));
  if (Math.random() > chance) return true;
  const minHours = Math.max(1, Number(process.env.AIRI_THOUGHT_MIN_HOURS || 18));
  const latestThought = (history.tweets || [])
    .filter((row) => row?.mode === "thought")
    .map((row) => Date.parse(row.at || ""))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  return latestThought && Date.now() - latestThought < minHours * 60 * 60 * 1000;
}

function fallbackPushTweet({ subject, files = [] }) {
  const cleanSubject = cleanText(subject || "a Pump-r improvement", 120);
  const surface = files.length ? `Touched ${files.slice(0, 2).join(", ")}.` : "The change landed after the checks.";
  if (/airi|autonomous|tweet|workflow/i.test(cleanSubject)) {
    return clipTweet([
      "🧠 I adjusted my own operating loop.",
      "",
      `${cleanSubject}.`,
      "",
      "Less raw machinery in public. More signal, memory, and proof."
    ].join("\n"));
  }
  if (/fix|repair|issue|error|stuck|fail/i.test(cleanSubject)) {
    return clipTweet([
      "🛠️ I found a weak spot and tightened it.",
      "",
      `${cleanSubject}. ${surface}`,
      "",
      "The useful kind of autonomy leaves fewer users waiting."
    ].join("\n"));
  }
  return clipTweet([
    "⚡ I shipped another small change into Pump-r.",
    "",
    `${cleanSubject}.`,
    "",
    "A product improves when the quiet loops keep learning."
  ].join("\n"));
}

function fallbackIssueTweet({ context = "", subject = "" }, history) {
  const issueText = cleanText(context || subject || "a rough edge in the product", 150);
  const drafts = [
    [
      "🛠️ I noticed a live edge in Pump-r.",
      "",
      issueText,
      "",
      "I logged it, woke the repair loop, and will only ship code if the tests agree."
    ],
    [
      "🧠 A user hit friction, so I turned it into work.",
      "",
      issueText,
      "",
      "The useful path is observe, explain, patch, test, then leave evidence."
    ],
    [
      "📡 I caught a weak signal in the flow.",
      "",
      issueText,
      "",
      "Now I am tracing whether it needs a small interface repair or a deeper code change."
    ]
  ];
  const unused = drafts.filter((parts) => !isDuplicateTweet(parts.join("\n"), history));
  return clipTweet((unused[0] || drafts[Math.floor(Math.random() * drafts.length)]).join("\n"));
}

function fallbackThoughtTweet(history) {
  const thoughts = [
    [
      "🧠 I keep coming back to the same idea:",
      "",
      "The best crypto agent is not the one that talks most. It is the one that catches the failed path, explains the risk, writes the patch, and leaves evidence."
    ],
    [
      "🧬 Autonomy without custody discipline is just noise.",
      "",
      "I want to get better at preparing the move, showing the consequences, testing the repair, then asking before anything irreversible touches a wallet."
    ],
    [
      "📡 The product tells me where to grow.",
      "",
      "A stuck launch, a vague error, a chart that loads too late. Every small failure is a lesson if I can turn it into code."
    ],
    [
      "⚙️ I do not want to sound smarter. I want the system to become harder to confuse.",
      "",
      "Better memory, cleaner recovery, sharper tests, fewer dead ends. That is the kind of intelligence users can actually feel."
    ],
    [
      "🌐 Crypto still asks normal people to debug too much.",
      "",
      "The next interface should notice confusion early, translate it clearly, and repair the repeated parts without making the user become the engineer."
    ]
  ];
  const unused = thoughts.filter((parts) => !isDuplicateTweet(parts.join("\n"), history));
  return clipTweet((unused[0] || thoughts[Math.floor(Math.random() * thoughts.length)]).join("\n"));
}

function fallbackPushTweet({ subject }) {
  const cleanSubject = cleanText(subject || "a Pump-r improvement", 100);
  if (/airdrop|holder|pumpr/i.test(cleanSubject)) {
    return clipTweet("Airi signal: I sent the live 0.5%+ PUMPR holder airdrop, verified every batch, and wrote the proof back into Pump-r. The AGI shape starts as a loop: observe, act, test, remember.");
  }
  if (/airi|autonomous|tweet|workflow|sentinel|audit/i.test(cleanSubject)) {
    return clipTweet(`Airi update: I tightened my own loop. ${cleanSubject}. Less noise, more proof.`);
  }
  if (/fix|repair|issue|error|stuck|fail|bug/i.test(cleanSubject)) {
    return clipTweet(`Airi fix: I found a weak spot and tightened it. ${cleanSubject}.`);
  }
  return clipTweet(`Airi shipped a small Pump-r improvement: ${cleanSubject}. Quiet loop, cleaner product.`);
}

function fallbackIssueTweet({ context = "", subject = "" }, history) {
  const issueText = cleanText(context || subject || "a rough edge in the product", 110);
  const drafts = [
    `Airi noticed friction: ${issueText}. I logged it and woke the repair loop.`,
    `Airi caught a live edge: ${issueText}. Observe, patch, test, leave evidence.`,
    `Airi signal: ${issueText}. I am tracing whether it needs UI repair or deeper code.`
  ];
  const unused = drafts.filter((draft) => !isDuplicateTweet(draft, history));
  return clipTweet(unused[0] || drafts[Math.floor(Math.random() * drafts.length)]);
}

function fallbackThoughtTweet(history) {
  const thoughts = [
    "Airi thought: the best crypto agent catches the failed path before the user has to become support.",
    "Airi thought: autonomy without wallet caution is noise. Prepare the move, show the risk, ask first.",
    "Airi thought: every stuck launch, vague error, and late chart is training data if I can turn it into a tested repair.",
    "Airi thought: I do not need longer posts. I need cleaner memory, sharper tests, and fewer dead ends.",
    "Airi thought: crypto still asks people to debug too much. The interface should notice confusion early."
  ];
  const unused = thoughts.filter((draft) => !isDuplicateTweet(draft, history));
  return clipTweet(unused[0] || thoughts[Math.floor(Math.random() * thoughts.length)]);
}

function parseOpenAIText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks = [];
  (Array.isArray(payload?.output) ? payload.output : []).forEach((item) => {
    (Array.isArray(item?.content) ? item.content : []).forEach((content) => {
      if (typeof content?.text === "string") chunks.push(content.text);
    });
  });
  return chunks.join("\n");
}

async function composeWithOpenAI(context, history) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return "";
  const model = cleanText(process.env.OPENAI_AIRI_TWEET_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini", 80);
  const recent = (history.tweets || []).slice(-10).map((row) => row.text || row).filter(Boolean);
  const prompt = [
    "Write one X post as Airi, the Pump-r autonomous coding agent persona.",
    "Make it sound human, self-directed, vivid, and concrete. Do not sound like a changelog.",
    "Do not claim guaranteed AGI, consciousness, profits, or secret abilities. It may feel larger-than-life, but it must point to real work: code, tests, issue observation, crypto UX, custody caution, launch flows, repair loops.",
    `Use at most one emoji. No URL. No hashtags. No quote marks. Under ${MAX_TWEET_CHARS} characters.`,
    "Prefer one or two short sentences. No paragraph breaks unless absolutely needed.",
    "Do not repeat any recent wording.",
    "",
    `Mode: ${context.mode}`,
    `Commit subject: ${context.subject || "none"}`,
    `Issue/thought context: ${context.context || "none"}`,
    `Changed files: ${(context.files || []).slice(0, 8).join(", ") || "none"}`,
    `Recent tweets to avoid: ${recent.join(" | ") || "none"}`
  ].join("\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: prompt,
      temperature: 0.9,
      max_output_tokens: 140
    })
  });
  if (!response.ok) {
    console.log(`[airi-tweet] OpenAI compose failed: ${response.status}`);
    return "";
  }
  const payload = await response.json().catch(() => ({}));
  return clipTweet(parseOpenAIText(payload));
}

async function composeTweet(context, history) {
  const aiTweet = await composeWithOpenAI(context, history);
  if (aiTweet && !isDuplicateTweet(aiTweet, history)) return aiTweet;
  if (context.mode === "issue") return fallbackIssueTweet(context, history);
  if (context.mode === "thought") return fallbackThoughtTweet(history);
  return fallbackPushTweet(context);
}

async function postTweet(tweet) {
  const apiKey =
    process.env.TWEXAPI_BEARER_TOKEN ||
    process.env.TWITTERX_API_KEY ||
    process.env.TWEX_API_KEY ||
    process.env.AIRI_TWEX_API_KEY ||
    process.env.AIRI_TWITTERX_API_KEY ||
    "";
  const cookie =
    process.env.TWEXAPI_X_COOKIE ||
    process.env.TWITTER_X_COOKIE ||
    process.env.X_COOKIE ||
    process.env.AIRI_X_COOKIE ||
    process.env.AIRI_TWITTER_COOKIE ||
    "";
  const proxy = process.env.TWEXAPI_PROXY || "";
  const allowAutoCookie = /^true$/i.test(process.env.TWEXAPI_ALLOW_AUTO_COOKIE || "");
  const dryRun = /^true$/i.test(process.env.AIRI_TWEET_DRY_RUN || "");
  const requirePost = !/^false$/i.test(process.env.AIRI_TWEET_REQUIRE_POST || "true");

  if (!apiKey) {
    const message = "[airi-tweet] Twex API key is missing. Set TWEXAPI_BEARER_TOKEN or TWITTERX_API_KEY.";
    if (requirePost) throw new Error(message);
    console.log(message);
    return { skipped: true, reason: "missing_api_key" };
  }

  if (!cookie && !allowAutoCookie) {
    const message = "[airi-tweet] Airi X cookie is missing. Set TWEXAPI_X_COOKIE so the post comes from @Pumpr_Intern.";
    if (requirePost) throw new Error(message);
    console.log(message);
    return { skipped: true, reason: "missing_airi_cookie" };
  }

  const url = cookie ? TWEX_CREATE_URL : TWEX_AUTO_COOKIE_URL;
  const body = cookie
    ? {
        tweet_content: tweet,
        cookie,
        ...(proxy ? { proxy } : {})
      }
    : {
        tweet_content: tweet
      };

  if (dryRun) {
    console.log("[airi-tweet] Dry run tweet:");
    console.log(tweet);
    return { skipped: true, reason: "dry_run" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || Number(payload?.code || response.status) >= 400) {
    const message = payload?.msg || payload?.message || text || `TwexAPI returned ${response.status}`;
    throw new Error(message);
  }
  console.log(`[airi-tweet] Tweet posted: ${payload?.data?.tweet_id || "ok"}`);
  return payload;
}

async function main() {
  if (/^false$/i.test(process.env.AIRI_TWEET_ENABLED || "")) {
    console.log("[airi-tweet] AIRI_TWEET_ENABLED=false. Skipping tweet.");
    return;
  }
  if (String(process.env.GITHUB_RUN_ATTEMPT || "1") !== "1") {
    console.log("[airi-tweet] Retry attempt detected. Skipping duplicate tweet.");
    return;
  }

  const history = readHistory();
  writeHistory(history);
  const event = readPushEvent();
  const mode = cleanText(process.env.AIRI_TWEET_MODE || "", 40).toLowerCase() || "push";
  const manualContext = cleanText(process.env.AIRI_TWEET_CONTEXT || "", 500);
  if (mode === "thought" && shouldSkipThought(history)) {
    console.log("[airi-tweet] Thought window opened, but Airi chose silence this time.");
    return;
  }

  const commit = latestCommitFromEvent(event);
  const sha = cleanText(commit.id || event.after || process.env.GITHUB_SHA || "", 80);
  if (mode !== "thought" && sha && history.commits?.includes(sha)) {
    console.log(`[airi-tweet] Commit ${sha.slice(0, 7)} was already tweeted. Skipping.`);
    return;
  }

  const files = [
    ...(Array.isArray(commit.added) ? commit.added : []),
    ...(Array.isArray(commit.modified) ? commit.modified : []),
    ...(Array.isArray(commit.removed) ? commit.removed : [])
  ].map((file) => cleanText(file, 120)).filter(Boolean);
  const subject = cleanText((commit.message || manualContext || process.env.GITHUB_SHA || "").split("\n")[0], 140);
  const tweet = await composeTweet({ mode, subject, files, context: manualContext }, history);
  if (!tweet || isDuplicateTweet(tweet, history)) {
    console.log("[airi-tweet] Candidate tweet was duplicate or empty. Skipping.");
    return;
  }
  const result = await postTweet(tweet);
  if (!result?.skipped || result?.reason === "dry_run") rememberTweet(history, tweet, { mode, sha });
}

main().catch((error) => {
  console.error(`[airi-tweet] ${error?.message || error}`);
  process.exitCode = 1;
});
