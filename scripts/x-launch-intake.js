const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATE_PATH = process.env.X_LAUNCH_INTAKE_STATE_PATH || path.join(ROOT, "cache", "x-launch-intake-state.json");
const QUEUE_PATH = process.env.X_LAUNCH_INTAKE_QUEUE_PATH || path.join(ROOT, "cache", "x-launch-queue.json");
const APP_BASE_URL = String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || "https://pump-r.fun").replace(/\/+$/, "");
const X_API_BASE_URL = String(process.env.X_API_BASE_URL || "https://api.x.com").replace(/\/+$/, "");
const TWEX_CREATE_URL = "https://api.twexapi.io/twitter/tweets/create";
const TWEX_NOTIFICATIONS_URL = "https://api.twexapi.io/twitter/notifications";
const TWEX_ADVANCED_SEARCH_URL = "https://api.twexapi.io/twitter/advanced_search";
const MAX_MENTIONS = Math.max(5, Math.min(100, Number(process.env.X_LAUNCH_MAX_MENTIONS || 20)));
const BROWSER_MENTION_URL = "https://x.com/notifications/mentions";
const BROWSER_SEARCH_BASE_URL = "https://x.com/search";
const MAX_STATE_IDS = 240;
const EMPTY_FETCH_BACKOFF_MINUTES = Math.max(0, Number(process.env.X_LAUNCH_EMPTY_FETCH_BACKOFF_MINUTES || 0));
const ACTIVE_FETCH_BACKOFF_MINUTES = Math.max(0, Number(process.env.X_LAUNCH_ACTIVE_FETCH_BACKOFF_MINUTES || 0));
const TWEX_READ_DELAY_MS = Math.max(0, Math.min(1000, Number(process.env.X_LAUNCH_TWEX_READ_DELAY_MS || 1000)));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function twexRetryDelayMs(error) {
  const message = String(error?.message || error || "");
  const waitMatch = message.match(/wait\s+([\d.]+)\s*seconds/i);
  if (waitMatch) return Math.ceil(Number(waitMatch[1]) * 1000) + 750;
  const code = Number(error?.status || error?.payload?.code || 0);
  return code === 429 || /rate limit/i.test(message) ? 5750 : 0;
}

async function withTwexRetry(label, task) {
  try {
    return await task();
  } catch (error) {
    const delayMs = twexRetryDelayMs(error);
    if (!delayMs) throw error;
    log(`Twex ${label} rate-limited; retrying in ${Math.ceil(delayMs / 1000)}s.`);
    await sleep(delayMs);
    return task();
  }
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

function shouldReprocessTweet(tweet, state) {
  const status = processedStatus(state, tweet.id);
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

function twexApiKey() {
  return String(
    process.env.TWEXAPI_BEARER_TOKEN ||
      process.env.TWITTERX_API_KEY ||
      process.env.TWEX_API_KEY ||
      ""
  ).trim().replace(/^Bearer\s+/i, "");
}

function pumprCookie() {
  return String(
    process.env.PUMPR_TWEX_X_COOKIE ||
      process.env.TWEXAPI_PUMPR_X_COOKIE ||
      process.env.X_PUMPR_COOKIE ||
      process.env.PUMPR_X_COOKIE ||
      process.env.TWEXAPI_X_COOKIE ||
      ""
  ).trim();
}

function twexHeaders() {
  const apiKey = twexApiKey();
  if (!apiKey) throw new Error("Set TWEXAPI_BEARER_TOKEN so the worker can read mentions through TwexAPI.");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function twexTweetUser(tweet = {}) {
  return tweet.user || tweet.author || tweet.core?.user_results?.result || tweet.legacy?.user || {};
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

function normalizeTwexMedia(media = []) {
  return (Array.isArray(media) ? media : [])
    .map((item) => {
      const url = mediaCandidate(item?.media_url_https) ||
        mediaCandidate(item?.media_url) ||
        mediaCandidate(item?.url) ||
        mediaCandidate(item?.secure_url) ||
        mediaCandidate(item?.image_url) ||
        mediaCandidate(item?.image?.url) ||
        mediaCandidate(item?.original?.url) ||
        mediaCandidate(item?.expanded_url);
      const preview = mediaCandidate(item?.preview_image_url) ||
        mediaCandidate(item?.thumbnail_url) ||
        mediaCandidate(item?.thumb?.url) ||
        mediaCandidate(item?.media_url_https) ||
        mediaCandidate(item?.media_url);
      return {
        type: item?.type || item?.media_type || item?.kind || "photo",
        url,
        preview_image_url: preview
      };
    })
    .filter((item) => item.url || item.preview_image_url);
}

function twexTweetMedia(tweet = {}) {
  return [
    ...normalizeTwexMedia(tweet.media),
    ...normalizeTwexMedia(tweet.photos),
    ...normalizeTwexMedia(tweet.attachments?.media),
    ...normalizeTwexMedia(tweet.entities?.media),
    ...normalizeTwexMedia(tweet.extended_entities?.media),
    ...normalizeTwexMedia(tweet.legacy?.entities?.media),
    ...normalizeTwexMedia(tweet.legacy?.extended_entities?.media)
  ];
}

function normalizeTwexTweet(tweet = {}, notification = null) {
  const user = twexTweetUser(tweet);
  const id = String(tweet.tweet_id || tweet.id || tweet.rest_id || tweet.legacy?.id_str || notification?.id || "").trim();
  const text = String(tweet.full_text || tweet.text || tweet.legacy?.full_text || tweet.legacy?.text || notification?.message || "").trim();
  const authorId = String(tweet.author_id || tweet.user_id || user.id || user.rest_id || user.id_str || notification?.from_user?.id || "").trim();
  const authorUsername = String(
    tweet.author_username ||
      tweet.username ||
      user.username ||
      user.screen_name ||
      user.legacy?.screen_name ||
      notification?.from_user?.username ||
      notification?.from_user?.screen_name ||
      ""
  ).replace(/^@/, "");
  return {
    id,
    text,
    authorId,
    authorUsername,
    conversationId: String(tweet.conversation_id || tweet.conversation_id_str || tweet.legacy?.conversation_id_str || id || ""),
    createdAt: String(tweet.created_at_datetime || tweet.created_at || tweet.legacy?.created_at || notification?.timestamp_ms || ""),
    media: twexTweetMedia(tweet)
  };
}

async function fetchMentionsWithTwexNotifications(state = {}) {
  const cookie = pumprCookie();
  if (!cookie) throw new Error("Set PUMPR_TWEX_X_COOKIE so TwexAPI can read @pumpr_fun mention notifications.");
  const notificationType = hasPendingConversation(state) ? "All" : "Mentions";
  const payload = await withTwexRetry("notifications", () => fetchJson(TWEX_NOTIFICATIONS_URL, {
    method: "POST",
    headers: twexHeaders(),
    body: JSON.stringify({ cookie, type: notificationType })
  }));
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const pendingIds = new Set(Object.keys(state.pendingByConversation || {}));
  return rows
    .map((row) => normalizeTwexTweet(row?.tweet || row, row))
    .filter((tweet) => {
      if (!tweet.id || !tweet.text) return false;
      if (notificationType !== "All") return true;
      return pendingIds.has(tweet.conversationId) || /@pumpr_fun\b/i.test(tweet.text);
    });
}

async function fetchMentionsWithTwexSearch() {
  const username = String(process.env.PUMPR_X_USERNAME || "pumpr_fun").replace(/^@/, "").trim();
  const configuredTerms = String(process.env.X_LAUNCH_PUBLIC_SEARCH_TERMS || process.env.X_LAUNCH_PUBLIC_SEARCH_TERM || "")
    .split(/\r?\n|\|/)
    .map((term) => term.trim())
    .filter(Boolean);
  const searchTerms = [...new Set([
    ...configuredTerms,
    `@${username}`,
    `"@${username}"`,
    `to:${username}`,
    username,
    `"${username}"`
  ].filter(Boolean))];
  log(`Twex public search terms: ${searchTerms.join(" | ")}`);
  const terms = searchTerms.slice(0, 5);
  const payload = await withTwexRetry(`public search ${terms.join(" | ")}`, () => fetchJson(TWEX_ADVANCED_SEARCH_URL, {
    method: "POST",
    headers: twexHeaders(),
    body: JSON.stringify({
      searchTerms: terms,
      maxItems: MAX_MENTIONS,
      sortBy: "Latest"
    })
  }));
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  log(`Twex public search returned ${rows.length} raw tweet(s) for ${terms.length} term(s).`);
  return rows
    .map((row) => normalizeTwexTweet(row))
    .filter((tweet) => tweet.id && tweet.text)
    .filter((tweet) => tweet.authorUsername.toLowerCase() !== username.toLowerCase());
}

async function fetchMentionsWithBrowser() {
  const cookie = pumprCookie();
  if (!cookie) throw new Error("Set PUMPR_TWEX_X_COOKIE so the browser mention watcher can open @pumpr_fun notifications.");
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
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
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
  const source = cleanText(process.env.X_LAUNCH_MENTION_SOURCE || "twex", 20).toLowerCase();

  const errors = [];
  if (source === "browser") {
    const mentions = await fetchMentionsWithBrowser();
    return dedupeMentions(mentions, state);
  }

  if (source === "twex") {
    const combined = [];
    const notificationMode = cleanText(process.env.X_LAUNCH_TWEX_NOTIFICATIONS_MODE || "always", 20).toLowerCase();
    const searchMode = cleanText(process.env.X_LAUNCH_TWEX_SEARCH_MODE || "off", 20).toLowerCase();
    const shouldFetchNotifications = notificationMode === "always" || (notificationMode !== "off" && hasPendingConversation(state));
    if (shouldFetchNotifications) {
      try {
        const notifications = await fetchMentionsWithTwexNotifications(state);
        const label = hasPendingConversation(state) ? "all/pending-thread" : "mention";
        log(`Twex notifications returned ${notifications.length} ${label} notification(s).`);
        combined.push(...notifications);
      } catch (error) {
        errors.push(`notifications: ${error.message || error}`);
        log(`Twex notifications unavailable: ${error.message || error}`);
      }
    } else {
      log(`Twex notifications skipped (${notificationMode}); public search handles fresh mentions.`);
    }

    if (shouldFetchNotifications && TWEX_READ_DELAY_MS > 0) {
      await sleep(TWEX_READ_DELAY_MS);
    }

    const shouldFetchSearch = searchMode === "always" || (searchMode === "fallback" && combined.length === 0);
    if (shouldFetchSearch) {
      try {
        const search = await fetchMentionsWithTwexSearch();
        log(`Twex public search returned ${search.length} mention tweet(s).`);
        combined.push(...search);
      } catch (error) {
        errors.push(`search: ${error.message || error}`);
        log(`Twex search unavailable: ${error.message || error}`);
      }
    } else {
      log(`Twex public search skipped (${searchMode}); notification mentions are the low-credit source.`);
    }

    return dedupeMentions(combined, state);
  }

  throw new Error(`Unsupported X_LAUNCH_MENTION_SOURCE=${source}. Use browser or twex.`);
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

async function replyWithTwex(tweetId, text) {
  const apiKey = twexApiKey();
  const cookie = pumprCookie();
  if (!apiKey || !cookie) return { skipped: true, reason: "missing_twex_credentials" };
  const response = await fetch(TWEX_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tweet_content: text,
      cookie,
      reply_tweet_id: tweetId,
      reply_to_tweet_id: tweetId,
      in_reply_to_tweet_id: tweetId
    })
  });
  const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok || Number(payload?.code || response.status) >= 400) {
    throw new Error(payload?.msg || payload?.message || payload?.raw || `Twex reply failed: ${response.status}`);
  }
  return payload;
}

async function postReply(tweetId, text) {
  if (isTruthy(process.env.X_LAUNCH_DRY_RUN)) {
    log(`Dry run reply to ${tweetId}: ${text}`);
    return { skipped: true, reason: "dry_run" };
  }
  return replyWithTwex(tweetId, text);
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
  return finalized;
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
    explorerUrl: result.explorerUrl
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
    at: new Date().toISOString()
  });
  await postReply(tweet.id, launchSuccessReply(tweet, request, result));
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
    state.repliedTweetIds.push(tweet.id);
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
    log(`Skipping Twex mention fetch; last check found ${state.lastFetchMentionCount || 0} new mention(s) ${minutesSince(state.lastFetchAt).toFixed(1)} minutes ago. Backoff is ${waitMinutes} minutes.`);
    writeState(state);
    return;
  }
  const mentions = mockPath
    ? (Array.isArray(mockPayload) ? mockPayload : mockPayload && typeof mockPayload === "object" ? [mockPayload] : [])
    : await fetchMentionsFromConfiguredSource(state);
  if (!mockPath) {
    recordFetchResult(state, process.env.X_LAUNCH_MENTION_SOURCE || "twex", mentions.length);
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
