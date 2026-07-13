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
const MAX_STATE_IDS = 240;
const EMPTY_FETCH_BACKOFF_MINUTES = Math.max(0, Number(process.env.X_LAUNCH_EMPTY_FETCH_BACKOFF_MINUTES || 0));
const ACTIVE_FETCH_BACKOFF_MINUTES = Math.max(0, Number(process.env.X_LAUNCH_ACTIVE_FETCH_BACKOFF_MINUTES || 0));
const TWEX_READ_DELAY_MS = Math.max(0, Number(process.env.X_LAUNCH_TWEX_READ_DELAY_MS || 5500));

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

const DIRECT_LAUNCHPADS = new Set(["pumpfun"]);

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

function bearerToken() {
  return String(
    process.env.PUMPR_X_BEARER_TOKEN ||
      process.env.X_BEARER_TOKEN ||
      process.env.TWITTER_BEARER_TOKEN ||
      ""
  ).trim().replace(/^Bearer\s+/i, "");
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

async function resolvePumprUserId() {
  const explicit = String(process.env.PUMPR_X_USER_ID || process.env.X_PUMPR_USER_ID || "").trim();
  if (explicit) return explicit;
  const username = String(process.env.PUMPR_X_USERNAME || "pumpr_fun").replace(/^@/, "").trim();
  const token = bearerToken();
  if (!token) throw new Error("Set PUMPR_X_BEARER_TOKEN or X_BEARER_TOKEN so the worker can read @pumpr_fun mentions.");
  const payload = await fetchJson(`${X_API_BASE_URL}/2/users/by/username/${encodeURIComponent(username)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const id = String(payload?.data?.id || "").trim();
  if (!id) throw new Error(`Could not resolve X user id for @${username}. Set PUMPR_X_USER_ID directly.`);
  return id;
}

function buildMentionUrl(userId, state) {
  const params = new URLSearchParams({
    max_results: String(MAX_MENTIONS),
    "tweet.fields": "attachments,author_id,conversation_id,created_at,entities,referenced_tweets",
    expansions: "author_id,attachments.media_keys,referenced_tweets.id",
    "user.fields": "username,name",
    "media.fields": "url,preview_image_url,type,alt_text"
  });
  const latest = [...(state.processedTweetIds || [])].reverse().find(Boolean);
  if (latest && /^\d+$/.test(latest)) params.set("since_id", latest);
  return `${X_API_BASE_URL}/2/users/${encodeURIComponent(userId)}/mentions?${params.toString()}`;
}

async function fetchMentions(state) {
  const token = bearerToken();
  if (!token) throw new Error("Set PUMPR_X_BEARER_TOKEN or X_BEARER_TOKEN so the worker can read @pumpr_fun mentions.");
  const userId = await resolvePumprUserId();
  const payload = await fetchJson(buildMentionUrl(userId, state), {
    headers: { Authorization: `Bearer ${token}` }
  });
  const mediaByKey = new Map((payload?.includes?.media || []).map((media) => [media.media_key, media]));
  const userById = new Map((payload?.includes?.users || []).map((user) => [user.id, user]));
  const tweets = Array.isArray(payload?.data) ? payload.data : [];
  return tweets
    .map((tweet) => {
      const mediaKeys = Array.isArray(tweet?.attachments?.media_keys) ? tweet.attachments.media_keys : [];
      const media = mediaKeys.map((key) => mediaByKey.get(key)).filter(Boolean);
      const author = userById.get(tweet.author_id) || {};
      return {
        id: String(tweet.id || ""),
        text: String(tweet.text || ""),
        authorId: String(tweet.author_id || ""),
        authorUsername: String(author.username || ""),
        conversationId: String(tweet.conversation_id || tweet.id || ""),
        createdAt: String(tweet.created_at || ""),
        media
      };
    })
    .filter((tweet) => tweet.id)
    .sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
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

function normalizeTwexMedia(media = []) {
  return (Array.isArray(media) ? media : [])
    .map((item) => ({
      type: item?.type || item?.media_type || "photo",
      url: item?.url || item?.media_url_https || item?.media_url || item?.expanded_url || "",
      preview_image_url: item?.preview_image_url || item?.thumbnail_url || item?.media_url_https || ""
    }))
    .filter((item) => item.url || item.preview_image_url);
}

function twexTweetMedia(tweet = {}) {
  return [
    ...normalizeTwexMedia(tweet.media),
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
  const searchTerms = configuredTerms.length
    ? configuredTerms
    : [
        `@${username}`,
        `"@${username}"`,
        username,
        `"${username}"`,
        `to:${username}`
      ];
  log(`Twex public search terms: ${searchTerms.join(" | ")}`);
  const payload = await withTwexRetry("public search", () => fetchJson(TWEX_ADVANCED_SEARCH_URL, {
    method: "POST",
    headers: twexHeaders(),
    body: JSON.stringify({
      searchTerms,
      maxItems: MAX_MENTIONS,
      sortBy: "Latest"
    })
  }));
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((row) => normalizeTwexTweet(row))
    .filter((tweet) => tweet.id && tweet.text)
    .filter((tweet) => tweet.authorUsername.toLowerCase() !== username.toLowerCase());
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
      if (!tweet.id || seen.has(tweet.id) || processed.has(tweet.id)) return false;
      seen.add(tweet.id);
      return true;
    })
    .sort(sortTweetIdsAscending);
}

async function fetchMentionsFromConfiguredSource(state) {
  const source = cleanText(process.env.X_LAUNCH_MENTION_SOURCE || "twex", 20).toLowerCase();
  if (source === "official") return fetchMentions(state);

  const errors = [];
  if (source === "twex" || source === "auto") {
    const combined = [];
    let twexReadOk = false;
    try {
      const notifications = await fetchMentionsWithTwexNotifications(state);
      const label = hasPendingConversation(state) ? "all/pending-thread" : "mention";
      log(`Twex notifications returned ${notifications.length} ${label} notification(s).`);
      combined.push(...notifications);
      twexReadOk = true;
    } catch (error) {
      errors.push(`notifications: ${error.message || error}`);
      log(`Twex notifications unavailable: ${error.message || error}`);
    }

    if (TWEX_READ_DELAY_MS > 0) {
      await sleep(TWEX_READ_DELAY_MS);
    }

    try {
      const search = await fetchMentionsWithTwexSearch();
      log(`Twex public search returned ${search.length} mention tweet(s).`);
      combined.push(...search);
      twexReadOk = true;
    } catch (error) {
      errors.push(`search: ${error.message || error}`);
      log(`Twex search unavailable: ${error.message || error}`);
    }

    const mentions = dedupeMentions(combined, state);
    if (mentions.length || source === "twex") return mentions;
    if (source === "auto" && !bearerToken() && twexReadOk) return mentions;
  }

  if (source === "auto") {
    try {
      return fetchMentions(state);
    } catch (error) {
      errors.push(`official: ${error.message || error}`);
    }
  }

  throw new Error(`Could not fetch X mentions. ${errors.join(" | ") || "No mention source configured."}`);
}

function firstImageUrl(tweet = {}) {
  const image = (Array.isArray(tweet.media) ? tweet.media : []).find((media) => {
    const type = String(media?.type || "").toLowerCase();
    return type === "photo" || type === "animated_gif" || type === "video";
  });
  return String(image?.url || image?.preview_image_url || "").trim();
}

function extractLabeled(text, labels, stopLabels) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const stopPattern = stopLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`\\b(?:${labelPattern})\\b\\s*(?:is|=|:|-)?\\s+(.+?)(?=\\s+\\b(?:${stopPattern})\\b\\s*(?:is|=|:|-)?|$)`, "i");
  return cleanText(text.match(regex)?.[1] || "", 280).replace(/^["']|["']$/g, "");
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
  const merged = {
    isLaunchRequest: Boolean(source.isLaunchRequest || fallbackResult.isLaunchRequest || prior.isLaunchRequest),
    confidence: Math.max(Number(source.confidence || 0), Number(fallbackResult.confidence || 0), Number(prior.confidence || 0)),
    launchpad: source.launchpad || fallbackResult.launchpad || prior.launchpad || "",
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

async function replyWithOfficialX(tweetId, text) {
  const token = String(process.env.PUMPR_X_USER_ACCESS_TOKEN || process.env.X_USER_ACCESS_TOKEN || "").trim();
  if (!token) return { skipped: true, reason: "missing_x_user_access_token" };
  return fetchJson(`${X_API_BASE_URL}/2/tweets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      reply: { in_reply_to_tweet_id: tweetId }
    })
  });
}

async function postReply(tweetId, text) {
  if (isTruthy(process.env.X_LAUNCH_DRY_RUN)) {
    log(`Dry run reply to ${tweetId}: ${text}`);
    return { skipped: true, reason: "dry_run" };
  }
  try {
    return await replyWithTwex(tweetId, text);
  } catch (twexError) {
    log(`Twex reply failed, trying official X if configured: ${twexError.message}`);
    return replyWithOfficialX(tweetId, text);
  }
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
  const launchPayload = await fetchJson(`${APP_BASE_URL}/api/pumpfun/launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: request.name,
      symbol: request.ticker,
      description: request.description,
      imageUri: request.imageUrl,
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
    await postReply(tweet.id, `${classification.launchpad} launch intent is queued. Right now the X autopilot can directly fire Pump.fun launches only; use Pump-r Create for wallet-signed chain launches.`);
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

  appendQueue(request, "launching");
  const result = await launchPumpFun(request);
  appendQueue(request, "launched", {
    mint: result.mint || result.tokenAddress,
    signature: result.signature,
    pumpfunUrl: result.pumpfunUrl
  });
  state.launches.push({
    tweetId: tweet.id,
    mint: result.mint || result.tokenAddress,
    signature: result.signature,
    pumpfunUrl: result.pumpfunUrl,
    at: new Date().toISOString()
  });
  await postReply(tweet.id, `Launched $${request.ticker} on Pump.fun: ${result.pumpfunUrl || `https://pump.fun/coin/${result.mint || result.tokenAddress}`}`);
  return "launched";
}

async function processTweet(tweet, state) {
  if (state.processedTweetIds.includes(tweet.id)) return "already_processed";
  const prior = state.pendingByConversation[tweet.conversationId] || {};
  const classification = await classifyLaunchRequest(tweet, prior);
  if (!classification.isLaunchRequest || classification.confidence < 0.55) {
    log(`Ignoring ${tweet.id}: ${classification.reason || "not launch intent"}`);
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
      await postReply(tweet.id, `I found the launch request, but the launch rail hit an error: ${cleanText(error.message || error, 180)}`).catch((replyError) => {
        log(`Error reply failed: ${replyError.message}`);
      });
      state.repliedTweetIds.push(tweet.id);
    }
    rememberProcessed(state, tweet.id, "error");
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
  main
};
