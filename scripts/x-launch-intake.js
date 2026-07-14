const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATE_PATH = process.env.X_LAUNCH_INTAKE_STATE_PATH || path.join(ROOT, "cache", "x-launch-intake-state.json");
const QUEUE_PATH = process.env.X_LAUNCH_INTAKE_QUEUE_PATH || path.join(ROOT, "cache", "x-launch-queue.json");
const APP_BASE_URL = String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || "https://pump-r.fun").replace(/\/+$/, "");
const MAX_MENTIONS = Math.max(5, Math.min(100, Number(process.env.X_LAUNCH_MAX_MENTIONS || 20)));
const BROWSER_MENTION_URL = "https://x.com/notifications/mentions";
const BROWSER_SEARCH_BASE_URL = "https://x.com/search";
const X_WEB_HOME = "https://x.com/home";
const X_WEB_ASSET_BASE = "https://abs.twimg.com/responsive-web/client-web/";
const X_WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_STATE_IDS = 240;
const EMPTY_FETCH_BACKOFF_MINUTES = Math.max(0, Number(process.env.X_LAUNCH_EMPTY_FETCH_BACKOFF_MINUTES || 0));
const ACTIVE_FETCH_BACKOFF_MINUTES = Math.max(0, Number(process.env.X_LAUNCH_ACTIVE_FETCH_BACKOFF_MINUTES || 0));
const RH_CHAIN_ID = 4663;
const RH_DEFAULT_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const RH_DEPLOYMENT_PATH = path.join(ROOT, "frontend", "deployments", "4663.json");
const FIXED_TOTAL_SUPPLY_WEI = "1000000000000000000000000000";
const DEFAULT_ROBINHOOD_TRADE_FEE_BPS = 50;
const DEFAULT_CREATOR_ALLOCATION_BPS = 0;
const FACTORY_ABI = [
  "event LaunchCreated(uint256 indexed launchId,address indexed creator,address indexed token,address pool,uint256 totalSupply,uint256 creatorAllocation,uint256 feeBps,uint256 graduationTargetEth,address dexRouter,address lpRecipient,address v3PositionManager,uint24 v3Fee)",
  "function createLaunchLiveDexCurveWithTax(string name,string symbol,string imageURI,string description,uint256 totalSupply,uint256 creatorAllocationBps,uint256 tokenTradeFeeBps) payable returns (uint256 launchId,address tokenAddress,address poolAddress)",
  "function defaultV3PositionManager() view returns (address)",
  "function launchFeeWei() view returns (uint256)"
];

const LAUNCHPAD_ALIASES = new Map([
  ["pumpfun", "pumpfun"],
  ["pump.fun", "pumpfun"],
  ["pump fun", "pumpfun"],
  ["pumfun", "pumpfun"],
  ["pum.fun", "pumpfun"],
  ["pump", "pumpfun"],
  ["robinhood", "robinhood"],
  ["robinhood chain", "robinhood"],
  ["rh", "robinhood"],
  ["base", "base"],
  ["ethereum", "ethereum"],
  ["eth", "ethereum"],
  ["monad", "monad"],
  ["pumpverse", "pumpverse"]
]);

const DIRECT_LAUNCHPADS = new Set(["pumpfun", "robinhood"]);

let cachedCreateTweetOperation = null;

function log(message) {
  console.log(`[x-launch] ${message}`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse((fs.readFileSync(file, "utf8") || "{}").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readState() {
  const parsed = readJson(STATE_PATH, {});
  return {
    processedTweetIds: Array.isArray(parsed.processedTweetIds) ? parsed.processedTweetIds.slice(-MAX_STATE_IDS) : [],
    repliedTweetIds: Array.isArray(parsed.repliedTweetIds) ? parsed.repliedTweetIds.slice(-MAX_STATE_IDS) : [],
    processedStatusByTweetId: parsed.processedStatusByTweetId && typeof parsed.processedStatusByTweetId === "object"
      ? Object.fromEntries(Object.entries(parsed.processedStatusByTweetId).slice(-MAX_STATE_IDS))
      : {},
    pendingByConversation: parsed.pendingByConversation && typeof parsed.pendingByConversation === "object"
      ? parsed.pendingByConversation
      : {},
    launches: Array.isArray(parsed.launches) ? parsed.launches.slice(-80) : [],
    lastFetchAt: parsed.lastFetchAt || "",
    lastFetchSource: parsed.lastFetchSource || "",
    lastFetchMentionCount: Number(parsed.lastFetchMentionCount || 0),
    emptyFetchStreak: Number(parsed.emptyFetchStreak || 0),
    updatedAt: parsed.updatedAt || ""
  };
}

function writeState(state) {
  const processedIds = Array.from(new Set(state.processedTweetIds || [])).slice(-MAX_STATE_IDS);
  const statusEntries = Object.entries(state.processedStatusByTweetId || {})
    .filter(([id]) => processedIds.includes(id))
    .slice(-MAX_STATE_IDS);
  writeJson(STATE_PATH, {
    processedTweetIds: processedIds,
    repliedTweetIds: Array.from(new Set(state.repliedTweetIds || [])).slice(-MAX_STATE_IDS),
    processedStatusByTweetId: Object.fromEntries(statusEntries),
    pendingByConversation: state.pendingByConversation || {},
    launches: Array.isArray(state.launches) ? state.launches.slice(-80) : [],
    lastFetchAt: state.lastFetchAt || "",
    lastFetchSource: state.lastFetchSource || "",
    lastFetchMentionCount: Number(state.lastFetchMentionCount || 0),
    emptyFetchStreak: Number(state.emptyFetchStreak || 0),
    updatedAt: new Date().toISOString()
  });
}

function readQueue() {
  const parsed = readJson(QUEUE_PATH, {});
  return {
    requests: Array.isArray(parsed.requests) ? parsed.requests : []
  };
}

function writeQueue(queue) {
  writeJson(QUEUE_PATH, {
    requests: Array.isArray(queue.requests) ? queue.requests.slice(-200) : [],
    updatedAt: new Date().toISOString()
  });
}

function cleanText(value, max = 500) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function stripMentions(text = "") {
  return cleanText(text.replace(/@\w+/g, " "), 800);
}

function normalizeTicker(value = "") {
  return String(value || "")
    .replace(/^\$/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 13);
}

function normalizeName(value = "") {
  return cleanText(value, 32).replace(/^["']|["']$/g, "");
}

function normalizeDescription(value = "") {
  return cleanText(value, 280).replace(/^["']|["']$/g, "");
}

function normalizeLaunchpad(value = "") {
  const key = cleanText(value, 40).toLowerCase().replace(/[-_]+/g, " ");
  return LAUNCHPAD_ALIASES.get(key) || "";
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function hasPendingConversation(state = {}) {
  return Object.keys(state.pendingByConversation || {}).length > 0;
}

function isScheduledRun() {
  return String(process.env.GITHUB_EVENT_NAME || "").toLowerCase() === "schedule";
}

function minutesSince(value = "") {
  const ts = Date.parse(value || "");
  if (!Number.isFinite(ts)) return Infinity;
  return (Date.now() - ts) / 60_000;
}

function shouldSkipScheduledFetch(state = {}) {
  if (!isScheduledRun()) return false;
  if (hasPendingConversation(state)) return false;
  const lastCount = Number(state.lastFetchMentionCount || 0);
  const backoffMinutes = lastCount > 0 ? ACTIVE_FETCH_BACKOFF_MINUTES : EMPTY_FETCH_BACKOFF_MINUTES;
  if (backoffMinutes <= 0) return false;
  return minutesSince(state.lastFetchAt) < backoffMinutes;
}

function recordFetchResult(state, source, mentionCount) {
  state.lastFetchAt = new Date().toISOString();
  state.lastFetchSource = source || "";
  state.lastFetchMentionCount = Number(mentionCount || 0);
  state.emptyFetchStreak = mentionCount > 0 ? 0 : Number(state.emptyFetchStreak || 0) + 1;
}

function rememberProcessed(state, tweetId, status) {
  const id = String(tweetId || "").trim();
  if (!id) return;
  state.processedTweetIds = Array.from(new Set([...(state.processedTweetIds || []), id])).slice(-MAX_STATE_IDS);
  state.processedStatusByTweetId = {
    ...(state.processedStatusByTweetId || {}),
    [id]: {
      status: String(status || "processed"),
      at: new Date().toISOString()
    }
  };
}

function processedStatus(state, tweetId) {
  return String(state.processedStatusByTweetId?.[String(tweetId || "")]?.status || "");
}

function latestLaunchForTweet(state, tweetId) {
  const id = String(tweetId || "").trim();
  return (Array.isArray(state.launches) ? state.launches : [])
    .filter((row) => String(row?.tweetId || "") === id)
    .slice(-1)[0] || null;
}

function shouldReprocessTweet(tweet, state) {
  const status = processedStatus(state, tweet.id);
  if (["launched_reply_failed", "reply_failed", "error_no_reply", "error"].includes(status) && latestLaunchForTweet(state, tweet.id)) {
    return true;
  }
  if (status === "ignored") {
    const fallback = fallbackClassify(tweet, {});
    return Boolean(fallback.isLaunchRequest && fallback.launchpad && fallback.name && fallback.ticker);
  }
  if (status === "queued_author_not_allowlisted" && isTruthy(process.env.X_LAUNCH_ALLOW_PUBLIC)) return true;
  if (status === "queued_unsupported") {
    const fallback = fallbackClassify(tweet, {});
    return Boolean(fallback.isLaunchRequest && fallback.launchpad && DIRECT_LAUNCHPADS.has(fallback.launchpad));
  }
  if (status === "reply_failed" || status === "error_no_reply") return true;
  if (status === "error") {
    const fallback = fallbackClassify(tweet, {});
    return Boolean(fallback.isLaunchRequest && fallback.launchpad && !DIRECT_LAUNCHPADS.has(fallback.launchpad));
  }
  return false;
}

function fetchHeaders(extra = {}) {
  return {
    "User-Agent": "PumpR-X-Launch-Intake/1.0",
    ...extra
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: fetchHeaders(options.headers || {})
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload?.detail || payload?.title || payload?.error || payload?.message || text || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function pumprCookie() {
  return String(
    process.env.PUMPR_X_COOKIE ||
      process.env.X_PUMPR_COOKIE ||
      process.env.PUMPR_TWEX_X_COOKIE ||
      process.env.TWEXAPI_PUMPR_X_COOKIE ||
      process.env.TWEXAPI_X_COOKIE ||
      ""
  ).trim();
}

function twexApiToken() {
  return String(
    process.env.TWEXAPI_BEARER_TOKEN ||
      process.env.TWEXAPI_API_KEY ||
      process.env.PUMPR_TWEXAPI_BEARER_TOKEN ||
      ""
  ).trim();
}

function twexApiProxy() {
  return String(process.env.TWEXAPI_PROXY || process.env.PUMPR_TWEXAPI_PROXY || "").trim();
}

function mediaCandidate(value = "") {
  const raw = String(value || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const pathName = parsed.pathname.toLowerCase();
    const isTwitterMedia = host === "pbs.twimg.com" || host === "video.twimg.com";
    const isImagePath = /\.(png|jpe?g|gif|webp)(?:$|\?)/i.test(raw) || /\/media\//i.test(pathName);
    if (!isTwitterMedia && !isImagePath) return "";
    if (host === "pbs.twimg.com" && parsed.searchParams.has("name")) {
      parsed.searchParams.set("name", "large");
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function twitterImageVariant(value = "", size = "large") {
  const raw = mediaCandidate(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === "pbs.twimg.com" && parsed.searchParams.has("name")) {
      parsed.searchParams.set("name", size);
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function imageMimeFromUrl(url = "") {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

async function uploadImageDataUrl(dataUrl) {
  const payload = await fetchJson(`${APP_BASE_URL}/api/upload-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, requireHosted: true })
  });
  return String(payload?.url || "").trim();
}

async function relayLaunchImage(imageUrl = "") {
  const direct = mediaCandidate(imageUrl);
  if (!direct) return "";
  const variants = [...new Set([
    twitterImageVariant(direct, "large"),
    twitterImageVariant(direct, "medium"),
    twitterImageVariant(direct, "small"),
    direct
  ].filter(Boolean))];

  for (const url of variants) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "User-Agent": "Pump-r-X-Launch/1.0"
        }
      });
      if (!response.ok) {
        log(`Tweet image fetch failed ${response.status} for ${url}`);
        continue;
      }
      const contentType = String(response.headers.get("content-type") || imageMimeFromUrl(url)).split(";")[0].trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        log(`Tweet image fetch returned ${contentType || "unknown content type"} for ${url}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 1024 * 1024) {
        log(`Tweet image variant ${url} is ${buffer.length} bytes; trying another size.`);
        continue;
      }
      const uploaded = await uploadImageDataUrl(`data:${contentType};base64,${buffer.toString("base64")}`);
      if (uploaded) {
        log(`Relayed tweet image for Pump.fun metadata: ${uploaded}`);
        return uploaded;
      }
    } catch (error) {
      log(`Tweet image relay failed for ${url}: ${error.message || error}`);
    }
  }

  log("Using direct tweet image URL because hosted relay was unavailable.");
  return direct;
}

async function fetchMentionsWithBrowser() {
  const cookie = pumprCookie();
  if (!cookie) throw new Error("Set PUMPR_X_COOKIE so the browser mention watcher can open @pumpr_fun notifications.");
  const username = String(process.env.PUMPR_X_USERNAME || "pumpr_fun").replace(/^@/, "").trim().toLowerCase();
  const searchUrl = `${BROWSER_SEARCH_BASE_URL}?q=${encodeURIComponent(`@${username} (create OR launch OR deploy OR mint)`)}&src=typed_query&f=live`;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"]
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: X_WEB_USER_AGENT
    });
    await context.addCookies(browserCookiesFromHeader(cookie));
    const page = await context.newPage();
    const scrapeCurrentPage = async () => page.evaluate((targetUsername) => {
      const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
      const articles = Array.from(document.querySelectorAll("article"));
      return articles.map((article) => {
        const links = Array.from(article.querySelectorAll("a[href]")).map((link) => {
          try {
            return new URL(link.getAttribute("href"), "https://x.com").toString();
          } catch {
            return "";
          }
        }).filter(Boolean);
        const statusUrl = links.find((href) => /\/status\/\d+/i.test(href)) || "";
        const statusMatch = statusUrl.match(/x\.com\/([^/?#]+)\/status\/(\d+)/i);
        const tweetText = clean(article.querySelector('[data-testid="tweetText"]')?.innerText || "");
        const fullText = clean(article.innerText || "");
        const media = Array.from(article.querySelectorAll('img[src*="pbs.twimg.com/media"]'))
          .map((image) => image.getAttribute("src") || "")
          .filter(Boolean)
          .map((url) => ({ type: "photo", url }));
        const time = article.querySelector("time");
        return {
          id: statusMatch?.[2] || "",
          text: tweetText || fullText,
          authorUsername: statusMatch?.[1] || "",
          authorId: "",
          conversationId: statusMatch?.[2] || "",
          createdAt: time?.getAttribute("datetime") || "",
          media,
          sourceUrl: statusUrl,
        mentionsTarget: new RegExp(`@${targetUsername}\\b`, "i").test(tweetText || fullText)
      };
      }).filter((row) => {
        if (!row.id || !row.text || !row.authorUsername) return false;
        if (row.authorUsername.toLowerCase() === targetUsername) return false;
        return row.mentionsTarget || /create|launch|deploy|mint/i.test(row.text);
      });
    }, username);
    const scrapeUrl = async (url) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(3500);
      for (let i = 0; i < 2; i += 1) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(1200);
      }
      return scrapeCurrentPage();
    };
    const rows = [
      ...(await scrapeUrl(BROWSER_MENTION_URL)),
      ...(await scrapeUrl(searchUrl))
    ];
    log(`Browser mention scan returned ${rows.length} candidate tweet(s).`);
    return rows.map((row) => ({
      id: String(row.id || ""),
      text: String(row.text || ""),
      authorId: String(row.authorId || ""),
      authorUsername: String(row.authorUsername || "").replace(/^@/, ""),
      conversationId: String(row.conversationId || row.id || ""),
      createdAt: String(row.createdAt || ""),
      media: Array.isArray(row.media) ? row.media : []
    })).filter((tweet) => tweet.id && tweet.text);
  } finally {
    await browser.close().catch(() => {});
  }
}

function sortTweetIdsAscending(a, b) {
  try {
    return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
  } catch {
    return String(a.id).localeCompare(String(b.id));
  }
}

function dedupeMentions(tweets = [], state = {}) {
  const processed = new Set(state.processedTweetIds || []);
  const seen = new Set();
  return tweets
    .filter((tweet) => {
      if (!tweet.id || seen.has(tweet.id)) return false;
      if (processed.has(tweet.id) && !shouldReprocessTweet(tweet, state)) return false;
      seen.add(tweet.id);
      return true;
    })
    .sort(sortTweetIdsAscending);
}

async function fetchMentionsFromConfiguredSource(state) {
  const source = cleanText(process.env.X_LAUNCH_MENTION_SOURCE || "browser", 20).toLowerCase();
  if (source === "browser") {
    const mentions = await fetchMentionsWithBrowser();
    return dedupeMentions(mentions, state);
  }
  throw new Error(`Unsupported X_LAUNCH_MENTION_SOURCE=${source}. Use browser.`);
}

function firstImageUrl(tweet = {}) {
  const mediaRows = Array.isArray(tweet.media) ? tweet.media : [];
  const image = mediaRows.find((media) => {
    const type = String(media?.type || "").toLowerCase();
    return type === "photo" || type === "animated_gif" || type === "video";
  }) || mediaRows[0];
  return mediaCandidate(image?.url) || mediaCandidate(image?.preview_image_url);
}

function extractLabeled(text, labels, stopLabels) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const stopPattern = stopLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`\\b(?:${labelPattern})\\b\\s*(?:is|=|:|-)?\\s+(.+?)(?=\\s+(?:and\\s+)?\\b(?:${stopPattern})\\b\\s*(?:is|=|:|-)?|$)`, "i");
  return cleanText(text.match(regex)?.[1] || "", 280).replace(/^["']|["']$/g, "");
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    throw new Error("Playwright is not installed. Install it with: npm install --no-save --package-lock=false playwright@1.49.1 && npx playwright install chromium");
  }
}

function parseCookieHeader(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => {
      const index = part.indexOf("=");
      if (index <= 0) return null;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (!name || !value) return null;
      return { name, value };
    })
    .filter(Boolean);
}

function ct0FromCookie(cookieHeader = "") {
  return parseCookieHeader(cookieHeader).find((cookie) => cookie.name === "ct0")?.value || "";
}

function browserCookiesFromHeader(cookieHeader = "") {
  const parsed = parseCookieHeader(cookieHeader);
  const domains = [".x.com", ".twitter.com"];
  return parsed.flatMap((cookie) => domains.map((domain) => ({
    name: cookie.name,
    value: cookie.value,
    domain,
    path: "/",
    secure: true,
    sameSite: "Lax"
  })));
}

function inferLaunchpad(text = "") {
  const lower = text.toLowerCase();
  const direct = lower.match(/\b(?:launch|create|make|deploy|mint)\b[\s\S]{0,80}\b(?:on|at|via|using)\s+([a-z0-9.\- ]{2,30})/i);
  if (direct) {
    const words = direct[1].split(/\s+/).slice(0, 3);
    for (let len = words.length; len > 0; len -= 1) {
      const normalized = normalizeLaunchpad(words.slice(0, len).join(" "));
      if (normalized) return normalized;
    }
  }
  for (const [alias, normalized] of LAUNCHPAD_ALIASES.entries()) {
    if (new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) return normalized;
  }
  return "";
}

function fallbackClassify(tweet, prior = {}) {
  const text = stripMentions(tweet.text || "");
  const lower = text.toLowerCase();
  const hasLaunchVerb = /\b(create|launch|make|deploy|mint|start)\b/i.test(lower);
  const hasTokenNoun = /\b(token|coin|memecoin|meme coin|ticker|ca)\b/i.test(lower);
  const launchpad = inferLaunchpad(text) || prior.launchpad || "";
  const name = normalizeName(
    extractLabeled(text, ["name", "anme", "called", "coin name", "token name"], ["ticker", "symbol", "description", "desc", "launchpad", "image", "on", "with"]) ||
      prior.name ||
      ""
  );
  const ticker = normalizeTicker(
    extractLabeled(text, ["ticker", "symbol", "ticker symbol"], ["name", "description", "desc", "launchpad", "image", "on", "with"]) ||
      prior.ticker ||
      ""
  );
  const description = normalizeDescription(
    extractLabeled(text, ["description", "desc", "bio"], ["name", "ticker", "symbol", "launchpad", "image", "on"]) ||
      prior.description ||
      ""
  );
  const imageUrl = firstImageUrl(tweet) || prior.imageUrl || "";
  const isLaunchRequest = hasLaunchVerb && hasTokenNoun;
  return {
    isLaunchRequest,
    confidence: isLaunchRequest ? 0.72 : 0.1,
    launchpad,
    name,
    ticker,
    description,
    imageUrl,
    missingFields: [],
    reason: isLaunchRequest ? "rule_match" : "not_a_launch_request"
  };
}

function parseOpenAIJson(payload) {
  const chunks = [];
  if (typeof payload?.output_text === "string") chunks.push(payload.output_text);
  (Array.isArray(payload?.output) ? payload.output : []).forEach((item) => {
    (Array.isArray(item?.content) ? item.content : []).forEach((content) => {
      if (typeof content?.text === "string") chunks.push(content.text);
    });
  });
  const text = chunks.join("\n").trim();
  const json = text.match(/\{[\s\S]*\}/)?.[0] || text;
  return JSON.parse(json);
}

async function classifyWithOpenAI(tweet, prior = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  const model = String(process.env.OPENAI_X_LAUNCH_MODEL || process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const prompt = [
    "You classify whether an X mention is a real token launch request for Pump-r.",
    "Only mark isLaunchRequest true when the user is asking to create, mint, deploy, or launch a token/coin.",
    "Ignore jokes, market commentary, support questions, replies that are not launch intent, and generic mentions.",
    "Extract launchpad only if explicitly named. Normalize Pump.fun/Pumfun/pumpfun to pumpfun.",
    "Do not infer pumpfun from the @pumpr_fun account mention; if the tweet says Robinhood, Base, Ethereum, Monad, or PumpVerse, keep that launchpad.",
    "Extract name, ticker, and description even with typos such as anme for name.",
    "If there is prior draft data, merge it with the new tweet when the conversation is continuing.",
    "Return strict JSON only with keys: isLaunchRequest, confidence, launchpad, name, ticker, description, reason.",
    "",
    `Tweet: ${tweet.text}`,
    `Author: @${tweet.authorUsername || tweet.authorId}`,
    `Has attached image: ${firstImageUrl(tweet) ? "yes" : "no"}`,
    `Prior draft: ${JSON.stringify(prior || {})}`
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
      temperature: 0.1,
      max_output_tokens: 320
    })
  });
  if (!response.ok) {
    log(`OpenAI classifier failed: ${response.status}`);
    return null;
  }
  try {
    const parsed = parseOpenAIJson(await response.json());
    return {
      isLaunchRequest: Boolean(parsed.isLaunchRequest),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
      launchpad: normalizeLaunchpad(parsed.launchpad) || "",
      name: normalizeName(parsed.name || ""),
      ticker: normalizeTicker(parsed.ticker || ""),
      description: normalizeDescription(parsed.description || ""),
      imageUrl: firstImageUrl(tweet) || prior.imageUrl || "",
      reason: cleanText(parsed.reason || "", 120)
    };
  } catch (error) {
    log(`OpenAI classifier JSON parse failed: ${error.message}`);
    return null;
  }
}

function mergeClassification(aiResult, fallbackResult, prior = {}) {
  const source = aiResult && Number(aiResult.confidence || 0) >= 0.55 ? aiResult : fallbackResult;
  const deterministicLaunchpad = fallbackResult.launchpad || "";
  const merged = {
    isLaunchRequest: Boolean(source.isLaunchRequest || fallbackResult.isLaunchRequest || prior.isLaunchRequest),
    confidence: Math.max(Number(source.confidence || 0), Number(fallbackResult.confidence || 0), Number(prior.confidence || 0)),
    launchpad: deterministicLaunchpad || source.launchpad || prior.launchpad || "",
    name: source.name || fallbackResult.name || prior.name || "",
    ticker: source.ticker || fallbackResult.ticker || prior.ticker || "",
    description: source.description || fallbackResult.description || prior.description || "",
    imageUrl: source.imageUrl || fallbackResult.imageUrl || prior.imageUrl || "",
    reason: source.reason || fallbackResult.reason || ""
  };
  const missing = [];
  if (!merged.launchpad) missing.push("launchpad");
  if (!merged.name) missing.push("name");
  if (!merged.ticker) missing.push("ticker");
  if (!merged.description) missing.push("description");
  if (!merged.imageUrl) missing.push("image");
  merged.missingFields = missing;
  return merged;
}

async function classifyLaunchRequest(tweet, prior = {}) {
  const fallbackResult = fallbackClassify(tweet, prior);
  if (!prior.isLaunchRequest && !fallbackResult.isLaunchRequest) return mergeClassification(null, fallbackResult, prior);
  const aiResult = await classifyWithOpenAI(tweet, prior);
  return mergeClassification(aiResult, fallbackResult, prior);
}

function allowedRequester(tweet) {
  if (isTruthy(process.env.X_LAUNCH_ALLOW_PUBLIC)) return true;
  const usernames = String(process.env.X_LAUNCH_ALLOWED_USERNAMES || process.env.PUMPR_X_LAUNCH_ALLOWED_USERNAMES || "")
    .split(",")
    .map((row) => row.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  const ids = String(process.env.X_LAUNCH_ALLOWED_USER_IDS || process.env.PUMPR_X_LAUNCH_ALLOWED_USER_IDS || "")
    .split(",")
    .map((row) => row.trim())
    .filter(Boolean);
  if (!usernames.length && !ids.length) return false;
  return usernames.includes(String(tweet.authorUsername || "").toLowerCase()) || ids.includes(String(tweet.authorId || ""));
}

function replyTextForMissing(request) {
  if (request.missingFields.includes("launchpad")) {
    return "Got the token request. Which launchpad should I use? Reply with Pump.fun, Robinhood Chain, Base, Ethereum, Monad, or PumpVerse.";
  }
  const human = request.missingFields.map((field) => field === "ticker" ? "ticker" : field).join(", ");
  return `I can prep this launch, but I still need: ${human}. Reply in the same thread and attach the image if needed.`;
}

function extensionForMime(mime = "") {
  const clean = String(mime || "").split(";")[0].trim().toLowerCase();
  if (clean === "image/png") return ".png";
  if (clean === "image/webp") return ".webp";
  if (clean === "image/gif") return ".gif";
  return ".jpg";
}

async function downloadReplyMedia(mediaUrl = "") {
  const direct = mediaCandidate(mediaUrl);
  if (!direct) return "";
  const response = await fetch(direct, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "Pump-r-X-Launch/1.0"
    }
  });
  if (!response.ok) throw new Error(`Reply image fetch failed: ${response.status}`);
  const contentType = String(response.headers.get("content-type") || imageMimeFromUrl(direct)).split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error(`Reply image is ${contentType || "not an image"}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Reply image was empty.");
  if (buffer.length > 5 * 1024 * 1024) throw new Error("Reply image is larger than 5 MB.");
  const filePath = path.join(os.tmpdir(), `pumpr-x-reply-${Date.now()}-${Math.random().toString(16).slice(2)}${extensionForMime(contentType)}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function discoverCreateTweetOperation(cookieHeader = "") {
  if (cachedCreateTweetOperation) return cachedCreateTweetOperation;
  const headers = {
    "user-agent": X_WEB_USER_AGENT,
    cookie: cookieHeader
  };
  const homeResponse = await fetch(X_WEB_HOME, { headers });
  const homeHtml = await homeResponse.text();
  const scriptUrls = Array.from(homeHtml.matchAll(/<script[^>]+src="([^"]+)"/g))
    .map((match) => new URL(match[1], X_WEB_HOME).toString())
    .filter((url) => url.includes("/responsive-web/client-web/"));
  const urls = scriptUrls.length ? scriptUrls : [`${X_WEB_ASSET_BASE}main.js`];

  let bearer = "";
  for (const url of urls) {
    const response = await fetch(url, { headers: { "user-agent": X_WEB_USER_AGENT } }).catch(() => null);
    if (!response?.ok) continue;
    const source = await response.text();
    bearer ||= source.match(/Bearer ([A-Za-z0-9%._-]+)/)?.[1] || "";
    const operation = source.match(/queryId:"([^"]+)",operationName:"CreateTweet",operationType:"mutation",metadata:{featureSwitches:\[([^\]]*)\],fieldToggles:\[([^\]]*)\]/);
    if (operation) {
      const quoted = (value) => Array.from(String(value || "").matchAll(/"([^"]+)"/g)).map((match) => match[1]);
      cachedCreateTweetOperation = {
        queryId: operation[1],
        bearer,
        features: Object.fromEntries(quoted(operation[2]).map((feature) => [feature, true])),
        fieldToggles: Object.fromEntries(quoted(operation[3]).map((toggle) => [toggle, true]))
      };
      return cachedCreateTweetOperation;
    }
  }
  throw new Error("Could not discover X CreateTweet operation from the web bundle.");
}

async function postWithXWebCookie(cookieHeader, text, replyToTweetId = "") {
  const ct0 = ct0FromCookie(cookieHeader);
  if (!ct0) throw new Error("X cookie is missing ct0, so browser-cookie posting cannot pass CSRF.");
  const operation = await discoverCreateTweetOperation(cookieHeader);
  if (!operation.bearer) throw new Error("Could not discover X web bearer token.");
  const variables = {
    tweet_text: text,
    dark_request: false,
    media: {
      media_entities: [],
      possibly_sensitive: false
    },
    semantic_annotation_ids: []
  };
  if (replyToTweetId) {
    variables.reply = {
      in_reply_to_tweet_id: String(replyToTweetId),
      exclude_reply_user_ids: []
    };
  }
  const response = await fetch(`https://x.com/i/api/graphql/${operation.queryId}/CreateTweet`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${operation.bearer}`,
      "content-type": "application/json",
      cookie: cookieHeader,
      referer: replyToTweetId ? `https://x.com/i/status/${encodeURIComponent(String(replyToTweetId))}` : "https://x.com/compose/post",
      "user-agent": X_WEB_USER_AGENT,
      "x-csrf-token": ct0,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en"
    },
    body: JSON.stringify({
      variables,
      features: operation.features,
      fieldToggles: operation.fieldToggles,
      queryId: operation.queryId
    })
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const duplicate = errors.some((error) => /duplicate|already|same/i.test(String(error?.message || "")) || Number(error?.code) === 187);
  if (!response.ok || (errors.length && !duplicate)) {
    const detail = errors.map((error) => error.message || error.code).filter(Boolean).join("; ") || payload?.raw || `HTTP ${response.status}`;
    throw new Error(`X web CreateTweet failed: ${detail}`);
  }
  return {
    ok: true,
    method: duplicate ? "x_web_cookie_duplicate" : "x_web_cookie",
    tweetId: payload?.data?.create_tweet?.tweet_results?.result?.rest_id || ""
  };
}

async function fillXComposer(page, composer, text) {
  await composer.waitFor({ state: "visible", timeout: 25_000 });
  await composer.click();
  await page.keyboard.press("Control+A").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await page.waitForTimeout(250);
  await page.keyboard.insertText(text);
  await page.waitForTimeout(800);
  const currentText = cleanText(await composer.innerText().catch(() => ""), 600);
  if (!currentText.includes(cleanText(text, 600))) {
    await composer.fill(text).catch(() => {});
    await page.waitForTimeout(800);
  }
  const finalText = cleanText(await composer.innerText().catch(() => ""), 600);
  if (!finalText.includes(cleanText(text, 600))) {
    throw new Error(`Browser reply composer did not accept text. composer="${finalText}"`);
  }
}

async function waitForXButtonEnabled(page, locator, label, logger = () => {}) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  for (let index = 0; index < 30; index += 1) {
    const enabled = await locator.evaluate((button) => {
      return button.getAttribute("aria-disabled") !== "true" && !button.disabled;
    }).catch(() => false);
    if (enabled) return;
    await page.waitForTimeout(500);
  }
  const buttonState = await locator.evaluate((button) => ({
    ariaDisabled: button.getAttribute("aria-disabled"),
    disabled: Boolean(button.disabled),
    text: button.innerText || ""
  })).catch(() => null);
  const bodyText = cleanText(await page.locator("body").innerText().catch(() => ""), 260);
  logger(`Browser ${label} stayed disabled. button=${JSON.stringify(buttonState)} body="${bodyText}"`);
  throw new Error(`Browser ${label} stayed disabled.`);
}

function visibleReplyNeedle(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => cleanText(line.replace(/https?:\/\/\S+/g, ""), 120))
    .filter(Boolean);
  return (
    lines.find((line) => /(launched|dry run|queued|parsed|prep|found|error)/i.test(line)) ||
    lines.find((line) => !/^@[\w_]+$/i.test(line)) ||
    lines[0] ||
    ""
  ).slice(0, 90);
}

async function waitForPostedReply(page, tweetId, text) {
  const needle = visibleReplyNeedle(text);
  if (!needle) throw new Error("Browser reply verification had no text to check.");
  await page.goto(`https://x.com/i/status/${encodeURIComponent(String(tweetId))}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3500);
  for (let index = 0; index < 12; index += 1) {
    const bodyText = cleanText(await page.locator("body").innerText().catch(() => ""), 6000);
    if (bodyText.includes(needle)) return;
    await page.mouse.wheel(0, 900).catch(() => {});
    await page.waitForTimeout(1000);
    const scrolledText = cleanText(await page.locator("body").innerText().catch(() => ""), 6000);
    if (scrolledText.includes(needle)) return;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  const bodyText = cleanText(await page.locator("body").innerText().catch(() => ""), 320);
  throw new Error(`Browser clicked reply, but the reply was not visible in thread ${tweetId}. needle="${needle}" body="${bodyText}"`);
}

async function replyWithBrowser(tweetId, text, mediaUrl = "") {
  const cookie = pumprCookie();
  if (!cookie) throw new Error("Set PUMPR_X_COOKIE so the browser reply worker can open @pumpr_fun.");
  if (!isTruthy(process.env.X_LAUNCH_REPLY_UI_FIRST)) {
    try {
      const result = await postWithXWebCookie(cookie, text, tweetId);
      log(`Reply posted through ${result.method} to ${tweetId}.`);
      return result;
    } catch (webError) {
      log(`X web-cookie reply failed, trying browser UI: ${cleanText(webError.message || webError, 220)}`);
    }
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"]
  });
  let mediaPath = "";
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: X_WEB_USER_AGENT
    });
    await context.addCookies(browserCookiesFromHeader(cookie));
    const page = await context.newPage();
    await page.goto(`https://x.com/i/status/${encodeURIComponent(String(tweetId))}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(3500);

    try {
      const composer = page.locator('[data-testid="tweetTextarea_0"]').first();
      await fillXComposer(page, composer, text);

      if (mediaUrl) {
        try {
          mediaPath = await downloadReplyMedia(mediaUrl);
          const fileInput = page.locator('input[data-testid="fileInput"][type="file"], input[type="file"]').first();
          await fileInput.setInputFiles(mediaPath);
          await page.waitForTimeout(2500);
        } catch (error) {
          log(`Browser reply image attach skipped: ${error.message || error}`);
        }
      }

      const replyButton = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').last();
      await waitForXButtonEnabled(page, replyButton, "reply button", log);
      await clickXButton(page, replyButton, "reply button", log);
      await page.waitForTimeout(4500);
      await waitForPostedReply(page, tweetId, text);
      log(`Browser reply posted and verified to ${tweetId}.`);
      return { ok: true, method: "browser" };
    } catch (browserError) {
      log(`Browser UI reply failed, trying X web-cookie fallback: ${cleanText(browserError.message || browserError, 220)}`);
      const result = await postWithXWebCookie(cookie, text, tweetId);
      log(`Reply posted through ${result.method} to ${tweetId}.`);
      return result;
    }
  } finally {
    await browser.close().catch(() => {});
    if (mediaPath) fs.rmSync(mediaPath, { force: true });
  }
}

async function clickXButton(page, locator, label, logger = () => {}) {
  await locator.waitFor({ state: "visible", timeout: 20_000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const attempts = [
    async () => locator.click({ timeout: 5000 }),
    async () => locator.click({ timeout: 5000, force: true }),
    async () => locator.evaluate((button) => button.click()),
    async () => page.keyboard.press("Control+Enter")
  ];
  let lastError = null;
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      await attempts[index]();
      if (index > 0) logger(`Browser ${label} used fallback click path ${index + 1}.`);
      return;
    } catch (error) {
      lastError = error;
      logger(`Browser ${label} click path ${index + 1} failed: ${cleanText(error.message || error, 180)}`);
    }
  }
  throw lastError || new Error(`Could not click ${label}.`);
}

async function replyWithTwexApi(tweetId, text, mediaUrl = "") {
  const token = twexApiToken();
  if (!token) throw new Error("Set TWEXAPI_BEARER_TOKEN before using TwexAPI replies.");
  const cookie = pumprCookie();
  if (!cookie) throw new Error("Set PUMPR_X_COOKIE or PUMPR_TWEX_X_COOKIE so TwexAPI can post from @pumpr_fun.");
  const payload = {
    tweet_content: text,
    cookie,
    reply_tweet_id: String(tweetId)
  };
  const directMediaUrl = String(mediaUrl || "").trim();
  if (directMediaUrl && /^https?:\/\//i.test(directMediaUrl)) payload.media_url = directMediaUrl;
  const proxy = twexApiProxy();
  if (proxy) payload.proxy = proxy;

  const response = await fetch("https://api.twexapi.io/twitter/tweets/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "PumpR-X-Launch-Intake/1.0"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok || body?.success === false || body?.error) {
    const detail = body?.message || body?.error || body?.detail || body?.raw || `HTTP ${response.status}`;
    throw new Error(`TwexAPI reply failed: ${cleanText(detail, 220)}`);
  }
  log(`TwexAPI reply posted to ${tweetId}.`);
  return {
    ok: true,
    method: "twexapi",
    tweetId: body?.data?.tweet_id || body?.data?.id || body?.tweet_id || ""
  };
}

async function postReply(tweetId, text, mediaUrl = "") {
  if (isTruthy(process.env.X_LAUNCH_DRY_RUN)) {
    log(`Dry run reply to ${tweetId}: ${text}`);
    return { skipped: true, reason: "dry_run" };
  }
  const twexOnly = !/^false$/i.test(process.env.X_LAUNCH_REPLY_TWEXAPI_ONLY || "true");
  if (!/^false$/i.test(process.env.X_LAUNCH_REPLY_TWEXAPI_FIRST || "true") && twexApiToken()) {
    try {
      return await replyWithTwexApi(tweetId, text, mediaUrl);
    } catch (error) {
      if (twexOnly) throw error;
      log(`TwexAPI reply failed, trying browser/cookie fallback: ${cleanText(error.message || error, 220)}`);
    }
  } else if (twexOnly) {
    throw new Error("Set TWEXAPI_BEARER_TOKEN before posting X launch replies through TwexAPI.");
  }
  return replyWithBrowser(tweetId, text, mediaUrl);
}

function appendQueue(request, status, extra = {}) {
  const queue = readQueue();
  const existingIndex = queue.requests.findIndex((row) => row.tweetId === request.tweetId);
  const row = {
    ...request,
    status,
    ...extra,
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) queue.requests[existingIndex] = { ...queue.requests[existingIndex], ...row };
  else queue.requests.push({ ...row, createdAt: new Date().toISOString() });
  writeQueue(queue);
}

function decodeLaunchKeypair() {
  const raw = String(process.env.X_LAUNCH_SOLANA_PRIVATE_KEY || process.env.PUMPR_X_LAUNCH_SOLANA_PRIVATE_KEY || "").trim();
  if (!raw) throw new Error("Set X_LAUNCH_SOLANA_PRIVATE_KEY as a GitHub/Vercel secret. Do not commit it.");
  const { Keypair } = require("@solana/web3.js");
  if (raw.startsWith("[")) {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const bs58 = require("bs58");
  return Keypair.fromSecretKey(bs58.decode(raw));
}

async function signTransactionPayload(payload, keypair) {
  const {
    Transaction,
    VersionedTransaction
  } = require("@solana/web3.js");
  const encoded = String(payload.transactionBase64 || "");
  if (!encoded) throw new Error("Pump-r launch API did not return a transaction.");
  if (payload.versionedTransaction || payload.transactionFormat === "v0") {
    const tx = VersionedTransaction.deserialize(Buffer.from(encoded, "base64"));
    tx.sign([keypair]);
    return Buffer.from(tx.serialize()).toString("base64");
  }
  const tx = Transaction.from(Buffer.from(encoded, "base64"));
  tx.partialSign(keypair);
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
}

async function launchPumpFun(request) {
  const keypair = decodeLaunchKeypair();
  const creator = keypair.publicKey.toBase58();
  const imageUri = await relayLaunchImage(request.imageUrl);
  const launchPayload = await fetchJson(`${APP_BASE_URL}/api/pumpfun/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: request.name,
      symbol: request.ticker,
      description: request.description,
      imageUri,
      userPublicKey: creator,
      creatorWallet: creator,
      starterBuySol: "0",
      devBuySol: "0",
      transactionFormat: "legacy"
    })
  });
  const signedTransactionBase64 = await signTransactionPayload(launchPayload, keypair);
  const finalized = await fetchJson(`${APP_BASE_URL}/api/pumpfun/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signingToken: launchPayload.signingToken,
      signedTransactionBase64,
      transactionBase64: signedTransactionBase64,
      versionedTransaction: Boolean(launchPayload.versionedTransaction)
    })
  });
  return {
    ...finalized,
    replyImageUrl: imageUri || request.imageUrl || ""
  };
}

function robinhoodRpcUrl() {
  return String(
    process.env.X_LAUNCH_ROBINHOOD_RPC_URL ||
      process.env.ROBINHOOD_RPC_URL ||
      process.env.RH_RPC_URL ||
      RH_DEFAULT_RPC_URL
  ).trim();
}

function decodeRobinhoodWallet(provider) {
  const raw = String(
    process.env.X_LAUNCH_ROBINHOOD_PRIVATE_KEY ||
      process.env.X_LAUNCH_ROBINHOOD_MNEMONIC ||
      process.env.PUMPR_X_LAUNCH_ROBINHOOD_PRIVATE_KEY ||
      process.env.PUMPR_X_LAUNCH_ROBINHOOD_MNEMONIC ||
      ""
  ).trim();
  if (!raw) {
    throw new Error("Set X_LAUNCH_ROBINHOOD_MNEMONIC or X_LAUNCH_ROBINHOOD_PRIVATE_KEY as a GitHub secret before Robinhood X launches.");
  }
  const { ethers } = require("ethers");
  if (/^0x[0-9a-fA-F]{64}$/.test(raw) || /^[0-9a-fA-F]{64}$/.test(raw)) {
    return new ethers.Wallet(raw.startsWith("0x") ? raw : `0x${raw}`, provider);
  }
  return ethers.Wallet.fromPhrase(raw).connect(provider);
}

function extractLaunchCreatedFromReceipt(receipt) {
  const { ethers } = require("ethers");
  const iface = new ethers.Interface(FACTORY_ABI);
  for (const logRow of receipt?.logs || []) {
    try {
      const parsed = iface.parseLog(logRow);
      if (parsed?.name === "LaunchCreated") {
        return {
          launchId: String(parsed.args.launchId),
          token: String(parsed.args.token || ""),
          pool: String(parsed.args.pool || "")
        };
      }
    } catch {
      // Ignore unrelated logs.
    }
  }
  return null;
}

async function launchRobinhood(request) {
  const { ethers } = require("ethers");
  const deployment = readJson(RH_DEPLOYMENT_PATH, {});
  const factoryAddress = String(deployment.memeLaunchFactory || "").trim();
  if (!ethers.isAddress(factoryAddress)) {
    throw new Error("Robinhood factory is not configured in frontend/deployments/4663.json.");
  }
  const rpcUrl = robinhoodRpcUrl();
  if (!rpcUrl) throw new Error("Robinhood RPC URL is not configured.");
  const provider = new ethers.JsonRpcProvider(rpcUrl, RH_CHAIN_ID);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== RH_CHAIN_ID) {
    throw new Error(`Robinhood RPC returned chain ${network.chainId}; expected ${RH_CHAIN_ID}.`);
  }
  const signer = decodeRobinhoodWallet(provider);
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
  const v3PositionManager = String(deployment.v3PositionManager || "").trim();
  if (!ethers.isAddress(v3PositionManager) || v3PositionManager === ethers.ZeroAddress) {
    throw new Error("Robinhood Uniswap V3 position manager is not configured.");
  }
  const configuredManager = await factory.defaultV3PositionManager().catch(() => "");
  if (!ethers.isAddress(configuredManager) || configuredManager === ethers.ZeroAddress) {
    throw new Error("Robinhood factory does not have a Uniswap V3 position manager configured.");
  }
  const launchFeeWei = BigInt(String(deployment.launchFeeWei || await factory.launchFeeWei()));
  const imageUri = await relayLaunchImage(request.imageUrl) || `${APP_BASE_URL}/assets/pump-r-logo.png`;
  const creatorBps = BigInt(String(process.env.X_LAUNCH_ROBINHOOD_CREATOR_BPS || DEFAULT_CREATOR_ALLOCATION_BPS));
  const tradeFeeBps = BigInt(String(process.env.X_LAUNCH_ROBINHOOD_TRADE_FEE_BPS || DEFAULT_ROBINHOOD_TRADE_FEE_BPS));
  const args = [
    request.name,
    normalizeTicker(request.ticker),
    imageUri,
    request.description,
    BigInt(FIXED_TOTAL_SUPPLY_WEI),
    creatorBps,
    tradeFeeBps
  ];

  const balance = await provider.getBalance(signer.address);
  if (balance < launchFeeWei) {
    throw new Error(`Robinhood launch wallet needs ETH on chain 4663. Have ${Number(ethers.formatEther(balance)).toFixed(6)} ETH; launch fee is ${Number(ethers.formatEther(launchFeeWei)).toFixed(6)} ETH before gas.`);
  }

  const simulated = await factory.createLaunchLiveDexCurveWithTax.staticCall(...args, { value: launchFeeWei });
  const tx = await factory.createLaunchLiveDexCurveWithTax(...args, { value: launchFeeWei });
  const receipt = await tx.wait();
  const launchInfo = extractLaunchCreatedFromReceipt(receipt) || {
    launchId: String(simulated?.[0] ?? ""),
    token: String(simulated?.[1] || ""),
    pool: String(simulated?.[2] || "")
  };
  const token = String(launchInfo.token || "");
  const tokenUrl = token ? `${APP_BASE_URL}/token?token=${encodeURIComponent(token)}&chainId=${RH_CHAIN_ID}` : `${APP_BASE_URL}/create`;
  return {
    ok: true,
    launchpad: "robinhood",
    chainId: RH_CHAIN_ID,
    token,
    tokenAddress: token,
    pool: String(launchInfo.pool || ""),
    launchId: String(launchInfo.launchId || ""),
    signature: receipt?.hash || tx.hash,
    txHash: receipt?.hash || tx.hash,
    tokenUrl,
    replyImageUrl: imageUri || request.imageUrl || "",
    explorerUrl: `${String(deployment.blockExplorerUrl || "https://robinhoodchain.blockscout.com").replace(/\/+$/, "")}/tx/${receipt?.hash || tx.hash}`,
    creator: signer.address
  };
}

function publicRequest(tweet, classification) {
  return {
    tweetId: tweet.id,
    conversationId: tweet.conversationId,
    authorUsername: tweet.authorUsername,
    authorId: tweet.authorId,
    sourceUrl: `https://x.com/${tweet.authorUsername || "i"}/status/${tweet.id}`,
    launchpad: classification.launchpad,
    name: classification.name,
    ticker: classification.ticker,
    description: classification.description,
    imageUrl: classification.imageUrl,
    confidence: classification.confidence,
    missingFields: classification.missingFields || []
  };
}

function pumpFunCoinUrl(result = {}) {
  const direct = String(result.pumpfunUrl || "").trim();
  if (direct) return direct;
  const mint = String(result.mint || result.tokenAddress || "").trim();
  return mint ? `https://pump.fun/coin/${mint}` : "https://pump.fun";
}

function launchSuccessReply(tweet, request, result) {
  const handle = String(request.authorUsername || tweet.authorUsername || "").replace(/^@/, "").trim();
  const mention = handle ? `@${handle}` : "Request";
  const isRobinhood = request.launchpad === "robinhood" || result?.launchpad === "robinhood" || Number(result?.chainId || 0) === RH_CHAIN_ID;
  const url = isRobinhood ? String(result.tokenUrl || `${APP_BASE_URL}/token?token=${encodeURIComponent(String(result.token || result.tokenAddress || ""))}&chainId=${RH_CHAIN_ID}`) : pumpFunCoinUrl(result);
  const txUrl = isRobinhood ? String(result.explorerUrl || "").trim() : "";
  const launchLabel = isRobinhood ? "Robinhood Chain" : "Pump.fun";
  const baseLines = [
    `${mention} launched on ${launchLabel}`,
    `Name: ${cleanText(request.name, 32)}`,
    `Ticker: $${normalizeTicker(request.ticker)}`,
    `Desc: ${cleanText(request.description, 72)}`,
    url,
    txUrl ? `Tx: ${txUrl}` : ""
  ].filter((line) => line && !/:\s*$/.test(line));
  let reply = baseLines.join("\n");
  if (reply.length <= 270) return reply;
  const shortLines = [
    `${mention} launched on ${launchLabel}`,
    `Name: ${cleanText(request.name, 32)}`,
    `Ticker: $${normalizeTicker(request.ticker)}`,
    url
  ];
  reply = shortLines.join("\n");
  return reply.length <= 270 ? reply : `${mention} launched $${normalizeTicker(request.ticker)} on ${launchLabel}\n${url}`;
}

function unsupportedLaunchpadReply(tweet, request) {
  const handle = String(request.authorUsername || tweet.authorUsername || "").replace(/^@/, "").trim();
  const mention = handle ? `@${handle}` : "Request";
  const launchpadName = request.launchpad === "robinhood"
    ? "Robinhood"
    : request.launchpad === "ethereum"
      ? "Ethereum"
      : request.launchpad === "pumpverse"
        ? "PumpVerse"
        : request.launchpad || "that chain";
  return [
    `${mention} ${launchpadName} launch is queued, not converted to Pump.fun.`,
    "X autopilot can only direct-fire Pump.fun right now.",
    "Use Pump-r Create for wallet-signed chain launches."
  ].join("\n");
}

async function handleLaunchRequest(tweet, classification, state) {
  const request = publicRequest(tweet, classification);
  if (["launched_reply_failed", "reply_failed", "error_no_reply", "error"].includes(processedStatus(state, tweet.id))) {
    const existing = latestLaunchForTweet(state, tweet.id);
    if (existing) {
      await postReply(tweet.id, launchSuccessReply(tweet, request, existing), existing.replyImageUrl || request.imageUrl || "");
      appendQueue(request, "launched_reply_sent", {
        mint: existing.mint,
        token: existing.token,
        chainId: existing.chainId,
        signature: existing.signature,
        txHash: existing.txHash,
        pumpfunUrl: existing.pumpfunUrl,
        tokenUrl: existing.tokenUrl,
        explorerUrl: existing.explorerUrl
      });
      return "launched";
    }
  }
  if (classification.missingFields.length) {
    state.pendingByConversation[tweet.conversationId] = {
      ...request,
      isLaunchRequest: true,
      updatedAt: new Date().toISOString()
    };
    appendQueue(request, "needs_more_info");
    await postReply(tweet.id, replyTextForMissing(classification));
    return "asked_for_more_info";
  }

  delete state.pendingByConversation[tweet.conversationId];

  if (!DIRECT_LAUNCHPADS.has(classification.launchpad)) {
    appendQueue(request, "queued_unsupported_direct_launchpad");
    await postReply(tweet.id, unsupportedLaunchpadReply(tweet, request));
    return "queued_unsupported";
  }

  if (!allowedRequester(tweet)) {
    appendQueue(request, "queued_author_not_allowlisted");
    await postReply(tweet.id, "I parsed the launch request, but this X launch rail is guarded. Ask the Pump-r team to allowlist your account before I spend a launch wallet.");
    return "queued_author_not_allowlisted";
  }

  if (!isTruthy(process.env.X_LAUNCH_AUTOPILOT_ENABLED)) {
    appendQueue(request, "queued_autopilot_off");
    await postReply(tweet.id, `Launch request queued for $${request.ticker}. Autopilot is off, so I will not spend the launch wallet until the team enables it.`);
    return "queued_autopilot_off";
  }

  if (isTruthy(process.env.X_LAUNCH_DRY_RUN)) {
    appendQueue(request, "dry_run_launch_ready");
    const launchLabel = classification.launchpad === "robinhood" ? "Robinhood Chain" : "Pump.fun";
    await postReply(tweet.id, `Dry run: $${request.ticker} is ready to launch on ${launchLabel}.`);
    return "dry_run_launch_ready";
  }

  appendQueue(request, "launching");
  const result = classification.launchpad === "robinhood"
    ? await launchRobinhood(request)
    : await launchPumpFun(request);
  appendQueue(request, "launched", {
    mint: result.mint || result.tokenAddress || result.token,
    token: result.token || result.tokenAddress || result.mint,
    chainId: result.chainId || (classification.launchpad === "robinhood" ? RH_CHAIN_ID : 101),
    signature: result.signature,
    txHash: result.txHash,
    pumpfunUrl: result.pumpfunUrl,
    tokenUrl: result.tokenUrl,
    explorerUrl: result.explorerUrl,
    replyImageUrl: result.replyImageUrl || request.imageUrl || ""
  });
  state.launches.push({
    tweetId: tweet.id,
    launchpad: classification.launchpad,
    mint: result.mint || result.tokenAddress || result.token,
    token: result.token || result.tokenAddress || result.mint,
    chainId: result.chainId || (classification.launchpad === "robinhood" ? RH_CHAIN_ID : 101),
    signature: result.signature,
    txHash: result.txHash,
    pumpfunUrl: result.pumpfunUrl,
    tokenUrl: result.tokenUrl,
    explorerUrl: result.explorerUrl,
    replyImageUrl: result.replyImageUrl || request.imageUrl || "",
    at: new Date().toISOString()
  });
  try {
    await postReply(tweet.id, launchSuccessReply(tweet, request, result), result.replyImageUrl || request.imageUrl || "");
  } catch (error) {
    log(`Launch succeeded but reply failed for ${tweet.id}: ${error.message || error}`);
    rememberProcessed(state, tweet.id, "launched_reply_failed");
    return "launched_reply_failed";
  }
  return "launched";
}

async function processTweet(tweet, state) {
  if (state.processedTweetIds.includes(tweet.id) && !shouldReprocessTweet(tweet, state)) return "already_processed";
  const prior = state.pendingByConversation[tweet.conversationId] || {};
  const classification = await classifyLaunchRequest(tweet, prior);
  if (!classification.isLaunchRequest || classification.confidence < 0.55) {
    log(`Ignoring ${tweet.id}: ${classification.reason || "not launch intent"} | text="${cleanText(tweet.text, 160)}"`);
    rememberProcessed(state, tweet.id, "ignored");
    return "ignored";
  }
  log(`Launch intent ${tweet.id}: ${classification.name || "?"} $${classification.ticker || "?"} on ${classification.launchpad || "missing launchpad"}`);
  try {
    const result = await handleLaunchRequest(tweet, classification, state);
    if (result !== "launched_reply_failed") {
      state.repliedTweetIds.push(tweet.id);
    }
    rememberProcessed(state, tweet.id, result);
    return result;
  } catch (error) {
    appendQueue(publicRequest(tweet, classification), "error", { error: error.message || String(error) });
    log(`Failed ${tweet.id}: ${error.message || error}`);
    if (!state.repliedTweetIds.includes(tweet.id)) {
      const replyResult = await postReply(tweet.id, `I found the launch request, but the launch rail hit an error: ${cleanText(error.message || error, 180)}`).then(() => {
        state.repliedTweetIds.push(tweet.id);
        return "sent";
      }).catch((replyError) => {
        log(`Error reply failed: ${replyError.message}`);
        rememberProcessed(state, tweet.id, "reply_failed");
        return "failed";
      });
      if (replyResult === "failed") return "reply_failed";
    }
    rememberProcessed(state, tweet.id, state.repliedTweetIds.includes(tweet.id) ? "error" : "error_no_reply");
    return "error";
  }
}

async function main() {
  const state = readState();
  const mockPath = String(process.env.X_LAUNCH_MOCK_MENTIONS_PATH || "").trim();
  const mockPayload = mockPath ? readJson(mockPath, []) : null;
  if (!mockPath && shouldSkipScheduledFetch(state)) {
    const waitMinutes = Number(state.lastFetchMentionCount || 0) > 0 ? ACTIVE_FETCH_BACKOFF_MINUTES : EMPTY_FETCH_BACKOFF_MINUTES;
    log(`Skipping browser mention fetch; last check found ${state.lastFetchMentionCount || 0} new mention(s) ${minutesSince(state.lastFetchAt).toFixed(1)} minutes ago. Backoff is ${waitMinutes} minutes.`);
    writeState(state);
    return;
  }
  const mentions = mockPath
    ? (Array.isArray(mockPayload) ? mockPayload : mockPayload && typeof mockPayload === "object" ? [mockPayload] : [])
    : await fetchMentionsFromConfiguredSource(state);
  if (!mockPath) {
    recordFetchResult(state, process.env.X_LAUNCH_MENTION_SOURCE || "browser", mentions.length);
  }
  log(`Fetched ${mentions.length} mention(s).`);
  const results = {};
  for (const tweet of mentions) {
    const result = await processTweet(tweet, state);
    results[result] = (results[result] || 0) + 1;
    writeState(state);
  }
  writeState(state);
  log(`Done: ${JSON.stringify(results)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[x-launch] ${error?.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  _test: {
    fallbackClassify,
    inferLaunchpad,
    mergeClassification,
    shouldReprocessTweet,
    unsupportedLaunchpadReply
  }
};
