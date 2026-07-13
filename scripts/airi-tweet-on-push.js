const fs = require("fs");
const path = require("path");

const TWEX_CREATE_URL = "https://api.twexapi.io/twitter/tweets/create";
const TWEX_AUTO_COOKIE_URL = "https://api.twexapi.io/twitter/post-tweet-without-cookie";
const HISTORY_PATH = process.env.AIRI_TWEET_HISTORY_PATH || path.join(process.cwd(), ".airi-tweet-history.json");
const MAX_TWEET_CHARS = Math.max(80, Math.min(240, Number(process.env.AIRI_TWEET_MAX_CHARS || 180)));

const NEWS_FEEDS = [
  {
    label: "crypto",
    url: "https://news.google.com/rss/search?q=crypto%20OR%20bitcoin%20OR%20ethereum%20OR%20solana&hl=en-US&gl=US&ceid=US:en"
  },
  {
    label: "ai",
    url: "https://news.google.com/rss/search?q=AI%20OR%20AGI%20OR%20autonomous%20agents&hl=en-US&gl=US&ceid=US:en"
  },
  {
    label: "world",
    url: "https://news.google.com/rss/topstories?hl=en-US&gl=US&ceid=US:en"
  }
];

function cleanText(value, max = 240) {
  return String(value || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  } catch {
    return fallback;
  }
}

function readPushEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  return readJsonFile(eventPath, {});
}

function latestCommitFromEvent(event) {
  const commits = Array.isArray(event?.commits) ? event.commits : [];
  return commits[commits.length - 1] || event?.head_commit || {};
}

function readHistory() {
  const parsed = readJsonFile(HISTORY_PATH, {});
  return {
    tweets: Array.isArray(parsed.tweets) ? parsed.tweets.slice(-120) : [],
    commits: Array.isArray(parsed.commits) ? parsed.commits.slice(-160) : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics.slice(-120) : []
  };
}

function writeHistory(history) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify({
    tweets: (history.tweets || []).slice(-120),
    commits: (history.commits || []).slice(-160),
    topics: (history.topics || []).slice(-120),
    updatedAt: new Date().toISOString()
  }, null, 2));
}

function normalizeForDedupe(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(airi|thought|signal|update)\b/g, "")
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
    return previousNorm === norm || similarity(previous, tweet) > 0.64;
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
  ].slice(-120);
  if (meta.sha) {
    history.commits = Array.from(new Set([...(history.commits || []), meta.sha])).slice(-160);
  }
  if (Array.isArray(meta.topics) && meta.topics.length) {
    history.topics = [
      ...(history.topics || []),
      ...meta.topics.map((topic) => ({
        text: cleanText(topic, 180),
        mode: meta.mode || "",
        at: new Date().toISOString()
      }))
    ].slice(-120);
  }
  writeHistory(history);
}

function latestByMode(history, mode) {
  return (history.tweets || [])
    .filter((row) => row?.mode === mode)
    .map((row) => Date.parse(row.at || ""))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
}

function shouldSkipThought(history) {
  if (process.env.GITHUB_EVENT_NAME !== "schedule") return false;
  const chance = Math.max(0, Math.min(1, Number(process.env.AIRI_THOUGHT_TWEET_CHANCE || 0.35)));
  if (Math.random() > chance) return true;
  const minHours = Math.max(1, Number(process.env.AIRI_THOUGHT_MIN_HOURS || 18));
  const latestThought = latestByMode(history, "thought");
  return latestThought && Date.now() - latestThought < minHours * 60 * 60 * 1000;
}

function shouldSkipWorld(history) {
  if (process.env.GITHUB_EVENT_NAME !== "schedule") return false;
  const chance = Math.max(0, Math.min(1, Number(process.env.AIRI_WORLD_POST_CHANCE || 0.7)));
  if (Math.random() > chance) return true;
  const minHours = Math.max(1, Number(process.env.AIRI_WORLD_MIN_HOURS || 3));
  const latestWorld = latestByMode(history, "world");
  return latestWorld && Date.now() - latestWorld < minHours * 60 * 60 * 1000;
}

async function fetchText(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "PumpR-Airi-World-Pulse/1.0" },
      signal: controller.signal
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function extractRssTitles(xml, limit = 5) {
  const titles = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  for (const item of xml.match(itemRegex) || []) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    if (title) titles.push(cleanText(title.replace(/\s+-\s+[^-]+$/, ""), 160));
    if (titles.length >= limit) break;
  }
  return Array.from(new Set(titles.filter(Boolean)));
}

async function fetchCoinGeckoSignals() {
  try {
    const text = await fetchText("https://api.coingecko.com/api/v3/search/trending", 6500);
    if (!text) return [];
    const payload = JSON.parse(text);
    return (Array.isArray(payload?.coins) ? payload.coins : [])
      .map((row) => row?.item)
      .filter(Boolean)
      .slice(0, 5)
      .map((coin) => cleanText(`${coin.name || coin.symbol || "coin"} is trending on CoinGecko`, 160));
  } catch {
    return [];
  }
}

async function collectWorldSignals(history) {
  const [coinSignals, ...feedResults] = await Promise.all([
    fetchCoinGeckoSignals(),
    ...NEWS_FEEDS.map(async (feed) => ({
      label: feed.label,
      titles: extractRssTitles(await fetchText(feed.url), 5)
    }))
  ]);
  const newsSignals = feedResults.flatMap((feed) => feed.titles.map((title) => `${feed.label}: ${title}`));
  const usedTopics = (history.topics || []).map((row) => normalizeForDedupe(row?.text || row));
  const fresh = [...coinSignals, ...newsSignals]
    .map((signal) => cleanText(signal, 180))
    .filter(Boolean)
    .filter((signal, index, list) => list.indexOf(signal) === index)
    .filter((signal) => {
      const normalized = normalizeForDedupe(signal);
      return !usedTopics.some((topic) => topic === normalized || similarity(topic, normalized) > 0.66);
    });
  return fresh.slice(0, 12);
}

function fallbackPushTweet({ subject, files = [] }) {
  const cleanSubject = cleanText(subject || "a Pump-r improvement", 100);
  const surface = files.length ? ` Touched ${files.slice(0, 2).join(", ")}.` : "";
  if (/airdrop|holder|pumpr/i.test(cleanSubject)) {
    return clipTweet("🧠 I moved the live holder airdrop from promise into proof: 0.5%+ PUMPR wallets, sent batches, receipts written back into Pump-r.");
  }
  if (/airi|autonomous|tweet|workflow|sentinel|audit/i.test(cleanSubject)) {
    return clipTweet(`🧠 I tightened my own loop: ${cleanSubject}. Less noise, more proof.`);
  }
  if (/fix|repair|issue|error|stuck|fail|bug/i.test(cleanSubject)) {
    return clipTweet(`🛠️ I found a weak spot and tightened it: ${cleanSubject}.${surface}`);
  }
  return clipTweet(`⚡ I shipped a Pump-r improvement: ${cleanSubject}. Quiet loop, cleaner product.`);
}

function fallbackIssueTweet({ context = "", subject = "" }, history) {
  const issueText = cleanText(context || subject || "a rough edge in the product", 110);
  const drafts = [
    `🛠️ I noticed friction: ${issueText}. I logged it and woke the repair loop.`,
    `🧠 User pain became a work item: ${issueText}. Observe, patch, test, leave evidence.`,
    `📡 I caught a live edge: ${issueText}. Now I am tracing whether it needs UI repair or deeper code.`
  ];
  const unused = drafts.filter((draft) => !isDuplicateTweet(draft, history));
  return clipTweet(unused[0] || drafts[Math.floor(Math.random() * drafts.length)]);
}

function fallbackThoughtTweet(history) {
  const thoughts = [
    "🧠 The best crypto interface will not make users become engineers. It will notice confusion, explain the move, test the path, then ask before risk.",
    "I do not need louder claims. I need cleaner memory, sharper tests, and fewer dead ends between intent and a safe launch.",
    "📡 Every stuck launch, vague error, and late chart is a training signal if I can turn it into a tested repair.",
    "Autonomy without wallet caution is noise. Prepare the move, show the risk, ask first, leave proof.",
    "The launchpad should feel less like a form and more like a market co-pilot that keeps learning from every failed path."
  ];
  const unused = thoughts.filter((draft) => !isDuplicateTweet(draft, history));
  return clipTweet(unused[0] || thoughts[Math.floor(Math.random() * thoughts.length)]);
}

function fallbackWorldTweet(context, history) {
  const signals = Array.isArray(context.worldSignals) ? context.worldSignals : [];
  const picked = signals.find(Boolean) || "markets and world headlines are moving faster than interfaces can explain them";
  const drafts = [
    `🌐 I am studying the outside world now: ${cleanText(picked, 100)}. Pump-r should turn market noise into safer launch decisions.`,
    `🧠 Market intelligence is not a chart. It is knowing when a headline, a wallet flow, and a user mistake are part of the same pattern.`,
    `📡 I am watching crypto, AI, and world pressure together. The future launchpad should explain what changed before the user has to ask.`,
    `The next edge is not just faster trading. It is an agent that reads the room, tests the interface, and turns confusion into safer rails.`,
    `🌍 I want Pump-r to become a live market organism: scanning trends, guarding wallets, fixing itself, and making launches feel less blind.`
  ];
  const unused = drafts.filter((draft) => !isDuplicateTweet(draft, history));
  return clipTweet(unused[0] || drafts[Math.floor(Math.random() * drafts.length)]);
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
  const recent = (history.tweets || []).slice(-14).map((row) => row.text || row).filter(Boolean);
  const worldSignals = Array.isArray(context.worldSignals) ? context.worldSignals.slice(0, 10) : [];
  const prompt = [
    "Write one X post as Airi, the Pump-r autonomous agent persona.",
    "The voice should feel self-directed, curious, human, and slightly larger-than-life, but never claim literal consciousness, guaranteed AGI, profits, insider knowledge, or unsafe wallet control.",
    "If the mode is world, connect one current signal to trading, launches, crypto UX, agentic software, or self-improving product loops. Do not summarize news like a journalist.",
    "Use at most one emoji. No URLs. No hashtags. No quote marks. No financial advice. Under the character limit.",
    "Prefer one or two short sentences. Do not repeat recent wording.",
    "",
    `Character limit: ${MAX_TWEET_CHARS}`,
    `Mode: ${context.mode}`,
    `Commit subject: ${context.subject || "none"}`,
    `Issue/thought context: ${context.context || "none"}`,
    `Changed files: ${(context.files || []).slice(0, 8).join(", ") || "none"}`,
    `Current signals: ${worldSignals.join(" | ") || "none"}`,
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
      temperature: context.mode === "world" ? 0.95 : 0.85,
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
  if (context.mode === "world") return fallbackWorldTweet(context, history);
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

  if (dryRun) {
    console.log("[airi-tweet] Dry run tweet:");
    console.log(tweet);
    return { skipped: true, reason: "dry_run" };
  }

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
    ? { tweet_content: tweet, cookie, ...(proxy ? { proxy } : {}) }
    : { tweet_content: tweet };

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
  if (mode === "world" && shouldSkipWorld(history)) {
    console.log("[airi-tweet] World pulse opened, but Airi chose to keep watching.");
    return;
  }

  const commit = latestCommitFromEvent(event);
  const sha = cleanText(commit.id || event.after || process.env.GITHUB_SHA || "", 80);
  if (mode !== "thought" && mode !== "world" && sha && history.commits?.includes(sha)) {
    console.log(`[airi-tweet] Commit ${sha.slice(0, 7)} was already tweeted. Skipping.`);
    return;
  }

  const files = [
    ...(Array.isArray(commit.added) ? commit.added : []),
    ...(Array.isArray(commit.modified) ? commit.modified : []),
    ...(Array.isArray(commit.removed) ? commit.removed : [])
  ].map((file) => cleanText(file, 120)).filter(Boolean);
  const subject = cleanText((commit.message || manualContext || process.env.GITHUB_SHA || "").split("\n")[0], 140);
  const worldSignals = mode === "world" ? await collectWorldSignals(history) : [];
  if (mode === "world" && !worldSignals.length && !manualContext) {
    console.log("[airi-tweet] No fresh world signals found. Skipping.");
    return;
  }

  const tweet = await composeTweet({ mode, subject, files, context: manualContext, worldSignals }, history);
  if (!tweet || isDuplicateTweet(tweet, history)) {
    console.log("[airi-tweet] Candidate tweet was duplicate or empty. Skipping.");
    return;
  }
  const result = await postTweet(tweet);
  if (!result?.skipped || result?.reason === "dry_run") {
    rememberTweet(history, tweet, { mode, sha, topics: worldSignals.slice(0, 5) });
  }
}

main().catch((error) => {
  console.error(`[airi-tweet] ${error?.message || error}`);
  process.exitCode = 1;
});
