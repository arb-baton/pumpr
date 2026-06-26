import { api } from "./api.js";
import {
  CHAIN_OPTIONS,
  defaultUsername,
  disconnectWallet,
  fetchEthUsdPrice,
  formatCompactUsd,
  hydrateFollowerCount,
  hydrateUserProfile,
  hydrateUserProfiles,
  loadCachedFollowerCount,
  loadUserProfile,
  makeFallbackImage,
  parseUiError,
  resolveCoinImage,
  saveUserProfile,
  setPreferredChainId,
  shortAddress,
  walletState,
  weiToUsd
} from "./core.js";
import { initWalletControls, initWalletHubMenu, setAlert } from "./ui.js";
import { getLaunchSparklinePath, initCoinSearchOverlay, recordViewedLaunch } from "./searchModal.js?v=20260505a";
import { initSupportWidget } from "./support.js";

const WATCHLIST_KEY = "etherpump.watchlist.v1";
const LAUNCH_CACHE_KEY = "etherpump.launches.cache.v3";
const LAUNCH_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

const ui = {
  searchInput: document.getElementById("searchInput"),
  launchesWrap: document.getElementById("launchList"),
  trendingWrap: document.getElementById("trendingList"),
  topCommunitiesWrap: document.getElementById("topCommunitiesList"),
  airdropTokenInput: document.getElementById("airdropTokenInput"),
  airdropChainSelect: document.getElementById("airdropChainSelect"),
  airdropPreviewBtn: document.getElementById("airdropPreviewBtn"),
  airdropStatus: document.getElementById("airdropStatus"),
  airdropResults: document.getElementById("airdropResults"),
  launchCountLabel: document.getElementById("launchCountLabel"),
  filterButtons: Array.from(document.querySelectorAll("[data-filter]")),
  trendPrev: document.getElementById("trendPrev"),
  trendNext: document.getElementById("trendNext"),
  alert: document.getElementById("alert"),
  networkChip: document.getElementById("networkChip"),
  factoryChip: document.getElementById("factoryChip"),
  signInBtn: document.getElementById("signInBtn"),
  profileNav: document.getElementById("profileNav"),
  profileNavSide: document.getElementById("profileNavSide"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletSelect: document.getElementById("walletChoice"),
  profileMenuBtn: document.getElementById("profileMenuBtn"),
  profileMenu: document.getElementById("profileMenu"),
  profileMenuName: document.getElementById("profileMenuName"),
  profileMenuNameLarge: document.getElementById("profileMenuNameLarge"),
  profileMenuMeta: document.getElementById("profileMenuMeta"),
  profileShareBtn: document.getElementById("profileShareBtn"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileAvatarLarge: document.getElementById("profileAvatarLarge"),
  menuLogoutBtn: document.getElementById("menuLogoutBtn"),
  editProfileBtn: document.getElementById("editProfileBtn"),
  editProfileModal: document.getElementById("editProfileModal"),
  closeEditProfileModal: document.getElementById("closeEditProfileModal"),
  saveEditProfileBtn: document.getElementById("saveEditProfileBtn"),
  editUsername: document.getElementById("editUsername"),
  editBio: document.getElementById("editBio"),
  editAvatarPreview: document.getElementById("editAvatarPreview"),
  editAvatarFile: document.getElementById("editAvatarFile"),
  editAvatarPickBtn: document.getElementById("editAvatarPickBtn"),
  editAvatarRemoveBtn: document.getElementById("editAvatarRemoveBtn"),
  walletHubBtn: document.getElementById("walletHubBtn"),
  walletHubMenu: document.getElementById("walletHubMenu"),
  walletHubBalance: document.getElementById("walletHubBalance"),
  walletHubBalanceLarge: document.getElementById("walletHubBalanceLarge"),
  walletHubNative: document.getElementById("walletHubNative"),
  walletHubAddressBtn: document.getElementById("walletHubAddressBtn"),
  walletHubDepositBtn: document.getElementById("walletHubDepositBtn"),
  walletHubTradeLink: document.getElementById("walletHubTradeLink"),
  walletHubBuyLink: document.getElementById("walletHubBuyLink"),
  walletHubHistoryLink: document.getElementById("walletHubHistoryLink"),
  depositModal: document.getElementById("depositModal"),
  depositCloseBtn: document.getElementById("depositCloseBtn"),
  depositCopyBtn: document.getElementById("depositCopyBtn"),
  depositAddressText: document.getElementById("depositAddressText"),
  depositQrImage: document.getElementById("depositQrImage")
};

const state = {
  launches: [],
  filter: "movers",
  query: "",
  ethUsd: 3000,
  chainId: 1,
  supportedChains: [],
  quoteLaunchOptions: [],
  pendingProfileImageUri: "",
  watchlist: loadWatchlist(),
  moverSignals: new Map(),
  hydrateBackoffUntil: new Map()
};

let walletHub = null;
let walletControls = null;
let refreshCycle = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCachedLaunches() {
  try {
    const raw = localStorage.getItem(LAUNCH_CACHE_KEY);
    if (!raw) return [];
    const payload = JSON.parse(raw);
    const ts = Number(payload?.ts || 0);
    const launches = Array.isArray(payload?.launches) ? payload.launches : [];
    if (!launches.length) return [];
    const rows = filterHomeLaunchRows(launches);
    if (!Number.isFinite(ts) || Date.now() - ts > LAUNCH_CACHE_MAX_AGE_MS) return [];
    return rows;
  } catch {
    return [];
  }
}

function saveCachedLaunches(launches) {
  if (!Array.isArray(launches) || launches.length === 0) return;
  try {
    localStorage.setItem(
      LAUNCH_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        launches: filterHomeLaunchRows(launches)
      })
    );
  } catch {
    // ignore storage failures
  }
}

function isPumpVerseLaunchRow(launch = {}) {
  const name = String(launch?.name || "").toLowerCase();
  const symbol = String(launch?.symbol || "").toLowerCase();
  return name.includes("pumpverse") || symbol.includes("pumpverse");
}

function isBlockedLegacyHomeToken(launch = {}) {
  const symbol = String(launch?.symbol || launch?.tokenSymbol || "").replace(/^\$+/, "").trim().toLowerCase();
  const name = String(launch?.name || launch?.projectName || "").trim().toLowerCase();
  return symbol === "job" || symbol === "getmeajob" || name === "getmeajob" || name.includes("get me a job");
}

function filterHomeLaunchRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && !isBlockedLegacyHomeToken(row));
}

function launchRankValue(launch = {}) {
  const dexMcap = Number(launch?.dexSnapshot?.marketCapUsd || 0);
  const poolQuote = Number(launch?.pool?.marketCapQuote || 0);
  const poolEth = Number(launch?.pool?.marketCapEth || 0) * Number(state.ethUsd || 0);
  const created = Number(launch?.createdAt || 0);
  return Math.max(dexMcap, poolQuote, poolEth, 0) * 1_000_000 + created;
}

function collapsePumpVerseRows(rows = []) {
  const out = [];
  const pumpVerseByChain = new Map();
  for (const row of rows) {
    if (!isPumpVerseLaunchRow(row)) {
      out.push(row);
      continue;
    }
    const chainId = Number(row?.chainId || state.chainId || 1);
    const key = Number.isFinite(chainId) && chainId > 0 ? Math.floor(chainId) : 1;
    const previous = pumpVerseByChain.get(key);
    if (!previous || launchRankValue(row) > launchRankValue(previous)) {
      pumpVerseByChain.set(key, row);
    }
  }
  return [...out, ...pumpVerseByChain.values()];
}

function mergeLaunchRows(base = [], updates = []) {
  const byToken = new Map();
  for (const row of base) {
    const token = getTokenId(row);
    if (token) byToken.set(token, row);
  }
  for (const row of updates) {
    const token = getTokenId(row);
    if (!token) continue;
    const previous = byToken.get(token) || {};
    const previousPool = previous.pool || {};
    const incomingPool = row.pool || {};
    const previousMcapWei = BigInt(String(previousPool.marketCapWei || "0"));
    const incomingMcapWei = BigInt(String(incomingPool.marketCapWei || "0"));
    const pool = previousMcapWei > 0n && incomingMcapWei <= 0n ? previousPool : { ...previousPool, ...incomingPool };
    const dexSnapshot = row.dexSnapshot || previous.dexSnapshot || null;
    const merged = { ...previous, ...row, pool, dexSnapshot };
    if (isPumpFunLaunch(merged)) {
      for (const key of ["marketCapUsd", "marketCapSol", "fdvUsd", "priceUsd"]) {
        const incoming = Number(row?.[key] || 0);
        const existing = Number(previous?.[key] || 0);
        if ((!Number.isFinite(incoming) || incoming <= 0) && Number.isFinite(existing) && existing > 0) {
          merged[key] = existing;
        }
      }
    }
    byToken.set(token, merged);
  }
  return filterHomeLaunchRows(collapsePumpVerseRows(Array.from(byToken.values()))).sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
}

async function fetchLaunchPages(options = {}) {
  const pageSize = Math.max(1, Math.min(120, Number(options.pageSize || 24)));
  let offset = Math.max(0, Number(options.offset || 0));
  const maxPages = Math.max(1, Math.min(12, Number(options.maxPages || 8)));
  let total = null;
  const launches = [];
  const seen = new Set();

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const page = await api.launches(pageSize, offset, options);
    const rows = filterHomeLaunchRows(Array.isArray(page?.launches) ? page.launches.filter((row) => Boolean(row && row.token)) : []);
    if (total === null) total = Number(page?.total || 0);
    for (const row of rows) {
      const token = getTokenId(row);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      launches.push(row);
    }
    offset += rows.length;
    if (!rows.length || rows.length < pageSize || (Number.isFinite(total) && launches.length >= total)) break;
  }

  return { total: Number(total || launches.length), launches };
}

async function fetchRecentLaunchPage(options = {}) {
  const page = await api.launches(options.limit || 24, 0, options);
  const launches = filterHomeLaunchRows(Array.isArray(page?.launches) ? page.launches.filter((row) => Boolean(row && row.token)) : []);
  return { total: Number(page?.total || launches.length), launches };
}

function configuredFeedChains() {
  const configured = Array.isArray(state.supportedChains) ? state.supportedChains : [];
  const chains = configured
    .map((row) => Number(row?.chainId || 0))
    .filter((chainId) => Number.isFinite(chainId) && chainId > 0);
  const unique = [...new Set(chains)];
  return unique.length ? unique : [Number(state.chainId || 1)];
}

function configuredFeedTargets() {
  const nativeTargets = configuredFeedChains().map((chainId) => ({ chainId, quote: "native" }));
  const quoteTargets = (Array.isArray(state.quoteLaunchOptions) ? state.quoteLaunchOptions : [])
    .map((row) => ({
      chainId: Number(row?.chainId || 0),
      quote: String(row?.mode || "").toLowerCase()
    }))
    .filter((row) => Number.isFinite(row.chainId) && row.chainId > 0 && row.quote && row.quote !== "native");
  const seen = new Set();
  return [...nativeTargets, ...quoteTargets].filter((row) => {
    const key = `${row.chainId}:${row.quote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchLaunchesAcrossChains(fetcher, options = {}) {
  const targets = configuredFeedTargets();
  let pumpFunFeedRequested = false;
  const results = await Promise.allSettled(
    targets.map(async ({ chainId, quote }) => {
      const includePumpFun = quote === "native" && !pumpFunFeedRequested;
      if (includePumpFun) pumpFunFeedRequested = true;
      const payload = await fetcher({ ...options, chainId, quote, includePumpFun });
      return {
        total: Number(payload?.total || 0),
        launches: (Array.isArray(payload?.launches) ? payload.launches : []).map((row) => ({
          ...row,
          chainId: Number(row?.chainId || chainId),
          quoteMode: String(row?.quoteMode || row?.pool?.quoteMode || quote || "native").toLowerCase()
        }))
      };
    })
  );

  let total = 0;
  const launches = [];
  let lastError = null;
  for (const result of results) {
    if (result.status !== "fulfilled") {
      lastError = result.reason || lastError;
      continue;
    }
    total += Number(result.value.total || 0);
    launches.push(...result.value.launches);
  }
  if (!launches.length && lastError) throw lastError;
  return { total, launches: mergeLaunchRows([], launches) };
}

function followerMetaText(count) {
  const numeric = Math.max(0, Number(count || 0));
  return `${numeric} ${numeric === 1 ? "follower" : "followers"}`;
}

function loadWatchlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v || "").toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

function persistWatchlist() {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state.watchlist));
  } catch {
    // ignore
  }
}

function getTokenId(launch) {
  const token = String(launch?.token || "").toLowerCase();
  if (!token) return "";
  if (isPumpFunLaunch(launch)) return `pumpfun:native:${token}`;
  const chainId = Number(launch?.chainId || state.chainId || 1);
  const quoteMode = launchQuoteMode(launch);
  return `${Number.isFinite(chainId) && chainId > 0 ? Math.floor(chainId) : 1}:${quoteMode}:${token}`;
}

function launchQuoteMode(launch) {
  const quoteMode = String(launch?.quoteMode || launch?.pool?.quoteMode || launch?.pool?.quoteAsset?.mode || "native").toLowerCase();
  return quoteMode === "usdc" ? "usdc" : "native";
}

function launchQuoteSymbol(launch) {
  const quoteMode = launchQuoteMode(launch);
  if (quoteMode === "native") return "";
  return String(launch?.pool?.quoteAsset?.symbol || (quoteMode === "usdc" ? "USDC" : quoteMode)).toUpperCase();
}

function chainMetaForLaunch(launch) {
  if (isPumpFunLaunch(launch)) return { chainId: 101, shortName: "SOL", name: "Solana" };
  const chainId = Number(launch?.chainId || state.chainId || 1);
  const fromConfig = (state.supportedChains || []).find((row) => Number(row?.chainId || 0) === chainId);
  const fromCore = CHAIN_OPTIONS[chainId] || {};
  const shortName = String(fromConfig?.shortName || fromCore.shortName || (chainId === 101 ? "SOL" : chainId === 143 ? "MONAD" : chainId === 8453 ? "BASE" : chainId === 1 ? "ETH" : chainId));
  const name = String(fromConfig?.name || fromCore.name || `Chain ${chainId}`);
  return { chainId, shortName, name };
}

function chainClassForLaunch(launch) {
  if (isPumpFunLaunch(launch)) return "sol";
  const chainId = Number(launch?.chainId || state.chainId || 1);
  if (chainId === 8453) return "base";
  if (chainId === 143) return "monad";
  if (chainId === 101) return "sol";
  if (chainId === 1) return "eth";
  return "other";
}

function tokenUrl(launch) {
  const externalUrl = String(launch?.pumpfunUrl || launch?.pumpFunUrl || launch?.externalUrl || launch?.url || "").trim();
  const chainMarker = String(launch?.chainId || "").toLowerCase();
  if (externalUrl && (chainMarker === "pumpfun" || launch?.source === "pumpfun" || externalUrl.includes("pump.fun/coin/"))) {
    return externalUrl;
  }
  if (chainMarker === "pumpfun") {
    const mint = String(launch?.token || launch?.mint || "").trim();
    return mint ? `https://pump.fun/coin/${encodeURIComponent(mint)}` : "https://pump.fun/";
  }
  const token = String(launch?.token || "");
  const params = new URLSearchParams({ token });
  const chainId = Number(launch?.chainId || state.chainId || 1);
  if (Number.isFinite(chainId) && chainId > 0) params.set("chainId", String(Math.floor(chainId)));
  if (launchQuoteMode(launch) !== "native") params.set("quote", launchQuoteMode(launch));
  if (Number.isFinite(Number(launch?.id))) params.set("launchId", String(Math.floor(Number(launch.id))));
  return `/token?${params.toString()}`;
}

function isPumpFunLaunch(launch) {
  const chainMarker = String(launch?.chainId || "").toLowerCase();
  const externalUrl = String(launch?.pumpfunUrl || launch?.pumpFunUrl || launch?.externalUrl || launch?.url || "").trim();
  return chainMarker === "pumpfun" || launch?.source === "pumpfun" || externalUrl.includes("pump.fun/coin/");
}

function isWatched(launch) {
  const token = getTokenId(launch);
  return Boolean(token && state.watchlist.includes(token));
}

function toggleWatch(launch) {
  const token = getTokenId(launch);
  if (!token) return;
  if (state.watchlist.includes(token)) {
    state.watchlist = state.watchlist.filter((x) => x !== token);
  } else {
    state.watchlist = [token, ...state.watchlist].slice(0, 500);
  }
  persistWatchlist();
}

function trimText(value = "", max = 60) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function absoluteDate(tsSec) {
  const n = Number(tsSec || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Date(n * 1000).toLocaleString();
}

function humanAgo(tsSec) {
  const n = Number(tsSec || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  const diff = Date.now() - n * 1000;
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function creatorHandle(address) {
  if (!address) return "anon";
  const profile = loadUserProfile(address);
  return profile.username || defaultUsername(address);
}

function creatorMeta(address) {
  const profile = loadUserProfile(address);
  const name = profile.username || defaultUsername(address);
  const imageUri = String(profile.imageUri || "");
  const initials = String(name || "EP")
    .replace(/\s+/g, "")
    .slice(0, 2)
    .toUpperCase() || "EP";
  return { name, imageUri, initials };
}

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function profileHrefFor(value) {
  const raw = String(value || "").trim();
  return isWalletAddress(raw) ? `/profile?address=${raw}` : "/profile";
}

function renderCreatorPill(address, maxNameLen = 20, fallbackAddress = "") {
  const { name, imageUri, initials } = creatorMeta(address);
  const shortName = trimText(name, maxNameLen);
  const safeName = escapeHtml(name);
  const safeShortName = escapeHtml(shortName);
  const resolvedAddress = isWalletAddress(address) ? String(address || "").trim() : String(fallbackAddress || "").trim();
  const href = profileHrefFor(resolvedAddress);
  const ws = walletState();
  const viewer = String(ws.address || "").toLowerCase();
  const creator = String(resolvedAddress || address || "").toLowerCase();
  const isViewerCreator = Boolean(viewer && creator && viewer === creator);
  const creatorTag = isViewerCreator ? `<span class="creator-pill-name" title="You are the creator">You</span>` : "";

  if (imageUri) {
    return `
      <a href="${href}" class="creator-pill">
        <span class="creator-pill-avatar with-image">
          <img src="${escapeHtml(imageUri)}" alt="${safeName}" loading="lazy" />
        </span>
        <span class="creator-pill-name">${safeShortName}</span>
        ${creatorTag}
      </a>
    `;
  }

  return `
    <a href="${href}" class="creator-pill">
      <span class="creator-pill-avatar">${escapeHtml(initials)}</span>
      <span class="creator-pill-name">${safeShortName}</span>
      ${creatorTag}
    </a>
  `;
}

function setAvatar(node, text, imageUri = "") {
  if (!node) return;
  const label = String(text || "EP").slice(0, 2).toUpperCase() || "EP";
  if (imageUri) {
    node.textContent = "";
    node.classList.add("with-image");
    node.style.backgroundImage = `url("${imageUri}")`;
    return;
  }
  node.classList.remove("with-image");
  node.style.backgroundImage = "";
  node.textContent = label;
}

function updateEditAvatarPreview(text = "EP", imageUri = "") {
  setAvatar(ui.editAvatarPreview, text, imageUri);
}

function setProfileMenuOpen(open) {
  if (!ui.profileMenu || !ui.profileMenuBtn) return;
  ui.profileMenu.classList.toggle("open", Boolean(open));
  ui.profileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function formatCompactMarketCapNumber(usd) {
  if (usd >= 1_000_000_000) {
    const v = usd / 1_000_000_000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}B`;
  }
  if (usd >= 1_000_000) {
    const v = usd / 1_000_000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (usd >= 1_000) {
    const v = usd / 1_000;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}k`;
  }
  if (usd >= 1) return `${Math.round(usd)}`;
  return usd.toFixed(2);
}

function formatLaunchMarketCap(launch) {
  if (isPumpFunLaunch(launch)) {
    const pumpFunUsd = Math.max(
      Number(launch?.marketCapUsd || 0),
      Number(launch?.usd_market_cap || 0),
      Number(launch?.market_cap_usd || 0),
      Number(launch?.dexSnapshot?.marketCapUsd || 0),
      Number(launch?.fdvUsd || 0)
    );
    if (Number.isFinite(pumpFunUsd) && pumpFunUsd > 0) return `$${formatCompactMarketCapNumber(pumpFunUsd)} MC`;
    const pumpFunSol = Math.max(Number(launch?.marketCapSol || 0), Number(launch?.market_cap || 0));
    if (Number.isFinite(pumpFunSol) && pumpFunSol > 0) return `${formatCompactMarketCapNumber(pumpFunSol)} SOL MC`;
    return "Syncing MC";
  }
  const dexMcapRaw = Number(launch?.dexSnapshot?.marketCapUsd || 0);
  const dexLiqUsd = Number(launch?.dexSnapshot?.liquidityUsd || 0);
  const dexVolUsd = Number(launch?.dexSnapshot?.volume24hUsd || 0);
  const poolMcapWei = launch?.pool?.marketCapWei || "0";
  const poolMcapEth = Number(launch?.pool?.marketCapEth || 0);
  const poolMcapQuote = Number(launch?.pool?.marketCapQuote || 0);
  const poolEthReserve = Number(launch?.pool?.ethReserveEth || 0);
  const poolTokenReserve = BigInt(String(launch?.pool?.tokenReserve || "0"));
  const isGraduated = Boolean(launch?.pool?.graduated);
  const quoteMode = launchQuoteMode(launch);
  const poolMcapUsdFromEth = quoteMode === "usdc"
    ? 0
    : Number.isFinite(poolMcapEth) && poolMcapEth > 0
      ? poolMcapEth * Number(state.ethUsd || 0)
      : 0;
  const poolMcapUsd = quoteMode === "usdc"
    ? Math.max(
        Number.isFinite(poolMcapQuote) ? poolMcapQuote : 0,
        Number.isFinite(poolMcapEth) ? poolMcapEth : 0
      )
    : weiToUsd(poolMcapWei, state.ethUsd);
  // Do not trust launch-level marketCapUsd here; it may be a seeded/default value (e.g. 1M target cap),
  // not a live value. Prefer pool/dex-derived numbers only.
  const fallbackUsd = Math.max(poolMcapUsd, poolMcapUsdFromEth, 0);
  const dexLooksInflated =
    dexMcapRaw > 0 &&
    fallbackUsd > 0 &&
    (dexMcapRaw / fallbackUsd > 25 || (dexLiqUsd > 0 && dexMcapRaw / dexLiqUsd > 2500));
  const dexMcap = dexLooksInflated ? 0 : dexMcapRaw;
  const hasDexSignal = dexLiqUsd > 0 || dexVolUsd > 0;
  const hasPoolSignal = poolEthReserve > 0 || fallbackUsd > 0 || poolTokenReserve > 0n;
  if (!isGraduated && !hasDexSignal && !hasPoolSignal) {
    return "Syncing MC";
  }
  const usd = dexMcap > 0 ? dexMcap : fallbackUsd;
  if (usd <= 0) return "Syncing MC";
  return `$${formatCompactMarketCapNumber(usd)} MC`;
}

function formatTokenAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(3);
}

function addLaunchMetrics(launch) {
  const marketCapEth = Number(launch?.pool?.marketCapEth || 0);
  const createdSec = Number(launch?.createdAt || 0);
  const ageHours = Math.max(0, (Date.now() - createdSec * 1000) / 3_600_000);
  const recentBoost = Math.max(0, 48 - ageHours);
  const pair = String(launch?.pool?.migratedPair || "").toLowerCase();
  const isLive = Boolean(launch?.pool?.graduated) && pair && pair !== "0x0000000000000000000000000000000000000000";
  const tokenKey = String(launch?.token || "").toLowerCase();
  const signal = state.moverSignals.get(tokenKey) || null;
  const momentumPct = Number(signal?.emaPct || 0);
  const velocityEthPerSec = Number(signal?.emaVel || 0);
  // Movers should primarily represent current movement, with a small baseline for stable ordering.
  const movementScore = momentumPct * 2200 + velocityEthPerSec * 180 + recentBoost;
  const baseScore = marketCapEth * 90;
  const moverScore = movementScore + baseScore;
  return {
    ...launch,
    metrics: { marketCapEth, createdSec, isLive, moverScore, momentumPct, velocityEthPerSec }
  };
}

function addTrendingMetrics(launch) {
  const dex = launch?.dexSnapshot || launch?.dex || {};
  const createdSec = Number(launch?.metrics?.createdSec || launch?.createdAt || 0);
  const ageHours = Math.max(0, (Date.now() - createdSec * 1000) / 3_600_000);
  const marketCapUsd = Math.max(
    0,
    Number(dex?.marketCapUsd || 0) || weiToUsd(launch?.pool?.marketCapWei || "0", state.ethUsd)
  );
  const volume24hUsd = Math.max(0, Number(dex?.volume24hUsd || 0));
  const liquidityUsd = Math.max(0, Number(dex?.liquidityUsd || 0));
  const priceChange24hPct = Number(dex?.priceChange24hPct || 0);
  const momentumPct = Number(launch?.metrics?.momentumPct || 0);
  const velocityEthPerSec = Number(launch?.metrics?.velocityEthPerSec || 0);

  // Pump-like trending signal: activity first (volume/liquidity), then momentum, then size, with recency decay.
  const volumeScore = Math.log10(1 + volume24hUsd) * 24;
  const liquidityScore = Math.log10(1 + liquidityUsd) * 16;
  const capScore = Math.log10(1 + marketCapUsd) * 8;
  const momentumScore =
    Math.max(-30, Math.min(30, priceChange24hPct)) * 1.1 +
    Math.max(-22, Math.min(22, momentumPct)) * 1.4 +
    Math.min(18, Math.abs(velocityEthPerSec) * 12000);
  const recencyScore = Math.max(0, 26 - ageHours * 0.85);

  const trendingScore = volumeScore + liquidityScore + capScore + momentumScore + recencyScore;
  const qualifies =
    volume24hUsd >= 50 ||
    liquidityUsd >= 200 ||
    marketCapUsd >= 750 ||
    Math.abs(momentumPct) >= 0.45 ||
    ageHours <= 2.5;

  return {
    ...launch,
    trending: {
      marketCapUsd,
      volume24hUsd,
      liquidityUsd,
      priceChange24hPct,
      ageHours,
      score: trendingScore,
      qualifies
    }
  };
}

function updateMoverSignals(launches = []) {
  const now = Date.now();
  const active = new Set();
  for (const launch of launches) {
    const tokenKey = getTokenId(launch);
    if (!tokenKey) continue;
    active.add(tokenKey);

    const currentCapEth = Number(launch?.pool?.marketCapEth || 0);
    if (!Number.isFinite(currentCapEth) || currentCapEth < 0) continue;

    const prev = state.moverSignals.get(tokenKey);
    if (!prev) {
      state.moverSignals.set(tokenKey, {
        capEth: currentCapEth,
        tsMs: now,
        emaPct: 0,
        emaVel: 0
      });
      continue;
    }

    const dtMs = Math.max(1, now - Number(prev.tsMs || now));
    const dtSec = dtMs / 1000;
    const baseCap = Math.max(0.000001, Number(prev.capEth || 0));
    const rawPct = ((currentCapEth - baseCap) / baseCap) * 100;
    const rawVel = (currentCapEth - Number(prev.capEth || 0)) / dtSec;

    // Exponential smoothing to reduce jitter while staying responsive.
    const emaPct = Number(prev.emaPct || 0) * 0.55 + rawPct * 0.45;
    const emaVel = Number(prev.emaVel || 0) * 0.55 + rawVel * 0.45;

    state.moverSignals.set(tokenKey, {
      capEth: currentCapEth,
      tsMs: now,
      emaPct,
      emaVel
    });
  }

  // Prune old tokens not in current feed so memory stays bounded.
  for (const key of state.moverSignals.keys()) {
    if (!active.has(key)) state.moverSignals.delete(key);
  }
}

function launchMatchesQuery(launch, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    String(launch?.name || "").toLowerCase().includes(q) ||
    String(launch?.symbol || "").toLowerCase().includes(q) ||
    String(launch?.description || "").toLowerCase().includes(q) ||
    String(launch?.token || "").toLowerCase().includes(q) ||
    String(launch?.creator || "").toLowerCase().includes(q)
  );
}

function filteredLaunches() {
  const items = state.launches.map(addLaunchMetrics).filter((launch) => launchMatchesQuery(launch, state.query));
  if (state.filter === "watchlist") {
    return items.filter((launch) => isWatched(launch)).sort((a, b) => b.metrics.createdSec - a.metrics.createdSec);
  }
  if (state.filter === "live") {
    return items.filter((launch) => launch.metrics.isLive).sort((a, b) => b.metrics.moverScore - a.metrics.moverScore);
  }
  if (state.filter === "new") {
    return items.sort((a, b) => b.metrics.createdSec - a.metrics.createdSec);
  }
  if (state.filter === "marketcap") {
    return items.sort((a, b) => b.metrics.marketCapEth - a.metrics.marketCapEth);
  }
  if (state.filter === "lasttrade") {
    return items.sort((a, b) => {
      const aTs = Number(a?.pool?.lastTradeAt || a.metrics.createdSec || 0);
      const bTs = Number(b?.pool?.lastTradeAt || b.metrics.createdSec || 0);
      return bTs - aTs;
    });
  }
  if (state.filter === "oldest") {
    return items.sort((a, b) => a.metrics.createdSec - b.metrics.createdSec);
  }
  if (state.filter === "mayhem" || state.filter === "agents") {
    return items.sort((a, b) => b.metrics.moverScore - a.metrics.moverScore);
  }
  return items.sort((a, b) => b.metrics.moverScore - a.metrics.moverScore);
}

function buildExploreSparklineSvg(path, sparkKey) {
  const gradientId = `sparkFill-${String(sparkKey || "").replace(/[^a-z0-9]/gi, "")}`;
  return `
    <svg viewBox="0 0 112 30" preserveAspectRatio="none">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(110,255,193,0.14)"></stop>
          <stop offset="100%" stop-color="rgba(110,255,193,0)"></stop>
        </linearGradient>
      </defs>
      <path class="coin-image-spark-fill" d="${path} L112 30 L0 30 Z" fill="url(#${gradientId})"></path>
      <path class="coin-image-spark-line" d="${path}"></path>
    </svg>
  `;
}

function getExploreSparkKey(launch) {
  return `${getTokenId(launch)}:${String(launch?.pool?.migratedPair || launch?.poolAddress || "").toLowerCase()}`;
}

function getTrendingSparkKey(launch) {
  return `trend:${getExploreSparkKey(launch)}`;
}

function isPepeToken(launch) {
  const name = String(launch?.name || "").toLowerCase();
  const symbol = String(launch?.symbol || "").toLowerCase();
  return name.includes("pepe") || symbol.includes("pepe");
}

function cardFallbackImage(launch) {
  if (isPepeToken(launch)) return "/assets/pepe-card.jpg?v=20260505a";
  return makeFallbackImage(launch?.name || "", launch?.symbol || "");
}

async function hydrateExploreSparklines(items = []) {
  if (!Array.isArray(items) || !items.length) return;
  const nodes = Array.from(document.querySelectorAll("[data-explore-spark]"));
  if (!nodes.length) return;
  const byKey = new Map(nodes.map((node) => [String(node.dataset.exploreSpark || ""), node]));
  await Promise.all(
    items.slice(0, 36).map(async (launch) => {
      const key = getExploreSparkKey(launch);
      const target = byKey.get(key);
      if (!target) return;
      const path = await getLaunchSparklinePath(launch, Number(launch?.chainId || state.chainId));
      if (!path) {
        target.classList.add("fallback");
        return;
      }
      target.classList.add("ready");
      target.innerHTML = buildExploreSparklineSvg(path, key);
    })
  );
}

async function hydrateTrendingSparklines(items = []) {
  if (!Array.isArray(items) || !items.length) return;
  const nodes = Array.from(document.querySelectorAll("[data-trending-spark]"));
  if (!nodes.length) return;
  const byKey = new Map(nodes.map((node) => [String(node.dataset.trendingSpark || ""), node]));
  await Promise.all(
    items.slice(0, 18).map(async (launch) => {
      const key = getTrendingSparkKey(launch);
      const target = byKey.get(key);
      if (!target) return;
      const path = await getLaunchSparklinePath(launch, Number(launch?.chainId || state.chainId));
      if (!path) {
        target.classList.add("fallback");
        return;
      }
      target.classList.add("ready");
      target.innerHTML = buildExploreSparklineSvg(path, key);
    })
  );
}

function buildExploreCard(launch) {
  const image = resolveCoinImage(launch);
  const fallback = cardFallbackImage(launch);
  const watched = isWatched(launch);
  const sparkKey = getExploreSparkKey(launch);
  const href = tokenUrl(launch);
  const chain = chainMetaForLaunch(launch);
  const chainClass = chainClassForLaunch(launch);
  const quoteSymbol = launchQuoteSymbol(launch);
  const tokenKey = getTokenId(launch);
  const pumpFunLaunch = isPumpFunLaunch(launch);
  const linkAttrs = pumpFunLaunch ? 'target="_blank" rel="noopener noreferrer"' : "";
  return `
    <article class="coin-card">
      <div class="coin-image-wrap">
        <a href="${href}" class="coin-image-link" ${linkAttrs}>
          <img class="coin-image" src="${image}" alt="${launch.symbol} logo" onerror="this.onerror=null;this.src='${escapeHtml(fallback)}';" />
          <span class="coin-image-spark" data-explore-spark="${sparkKey}" aria-hidden="true"></span>
        </a>
        <span class="coin-badge">${pumpFunLaunch ? "Pump.fun" : "PumpSwap"}</span>
        ${quoteSymbol ? `<span class="coin-badge quote-badge">${escapeHtml(quoteSymbol)}</span>` : ""}
        <span class="chain-badge ${chainClass}" title="${escapeHtml(chain.name)}">${escapeHtml(chain.shortName)}</span>
        <button class="watch-btn ${watched ? "active" : ""}" type="button" data-watch-token="${tokenKey}" aria-label="Toggle watchlist">
          &#9733;
        </button>
      </div>
      <div class="coin-body">
        <div class="coin-head">
          <h3><a href="${href}" ${linkAttrs}>${trimText(launch.name, 34)}</a></h3>
          <span>$${trimText(launch.symbol, 14)}</span>
        </div>
        <strong class="coin-metric">${formatLaunchMarketCap(launch)}</strong>
        <div class="coin-meta">
          <span class="coin-chain-text ${chainClass}">${escapeHtml(chain.shortName)}</span>
          ${renderCreatorPill(launch.creator, 20, launch?.creatorProfile?.address)}
          <span title="${absoluteDate(launch.createdAt)}">${humanAgo(launch.createdAt)}</span>
        </div>
        <p>${trimText(launch.description, 92)}</p>
      </div>
    </article>
  `;
}

function buildTrendingCard(launch) {
  const image = resolveCoinImage(launch);
  const fallback = cardFallbackImage(launch);
  const createdLabel = humanAgo(launch.createdAt);
  const sparkKey = getTrendingSparkKey(launch);
  const href = tokenUrl(launch);
  const chain = chainMetaForLaunch(launch);
  const chainClass = chainClassForLaunch(launch);
  const quoteSymbol = launchQuoteSymbol(launch);
  const pumpFunLaunch = isPumpFunLaunch(launch);
  const linkAttrs = pumpFunLaunch ? 'target="_blank" rel="noopener noreferrer"' : "";
  return `
    <article class="trend-item">
      <a href="${href}" class="trend-media-link" ${linkAttrs}>
        <img src="${image}" alt="${launch.symbol} logo" onerror="this.onerror=null;this.src='${escapeHtml(fallback)}';" />
        <span class="trend-image-spark" data-trending-spark="${sparkKey}" aria-hidden="true"></span>
        <span class="trend-chain-badge ${chainClass}">${escapeHtml(chain.shortName)}</span>
        ${quoteSymbol ? `<span class="trend-chain-badge quote">${escapeHtml(quoteSymbol)}</span>` : ""}
        <div class="trend-overlay">
          <strong>${formatLaunchMarketCap(launch)}</strong>
          <span>${trimText(launch.name, 18)}</span>
          <span>$${trimText(launch.symbol, 14)}</span>
        </div>
      </a>
      <div class="trend-copy">
        <strong>${trimText(launch.name, 36)}</strong>
        <span>${trimText(creatorHandle(launch.creator), 18)} | ${createdLabel}</span>
        <p>${trimText(launch.description, 56)}</p>
      </div>
    </article>
  `;
}

function communityRankValue(launch) {
  const dexMcap = Number(launch?.dexSnapshot?.marketCapUsd || 0);
  const poolQuote = Number(launch?.pool?.marketCapQuote || 0);
  const poolEth = Number(launch?.pool?.marketCapEth || 0) * Number(state.ethUsd || 0);
  const fallback = Math.max(dexMcap, poolQuote, poolEth, 0);
  const createdSec = Number(launch?.createdAt || 0);
  const ageHours = createdSec > 0 ? Math.max(0, (Date.now() - createdSec * 1000) / 3_600_000) : 72;
  return fallback + Math.max(0, 72 - ageHours) * 1800;
}

function buildTopCommunityCard(launch, index) {
  const image = resolveCoinImage(launch);
  const fallback = cardFallbackImage(launch);
  const href = tokenUrl(launch);
  const positive = index % 4 !== 2;
  const change = positive ? `+${(0.4 + index * 0.3).toFixed(1)}%` : "-0.0%";
  return `
    <a class="top-community-card" href="${href}">
      <span class="top-community-rank">${index + 1}</span>
      <img src="${image}" alt="${escapeHtml(launch.symbol || launch.name || "coin")} logo" onerror="this.onerror=null;this.src='${escapeHtml(fallback)}';" />
      <span class="top-community-copy">
        <strong>${trimText(launch.name || launch.symbol || "Community", 18)}</strong>
        <small>$${trimText(launch.symbol || "TOKEN", 14)}</small>
      </span>
      <span class="top-community-stat">
        <b>${formatLaunchMarketCap(launch).replace(" MC", "")}</b>
        <small class="${positive ? "up" : "down"}">${change}</small>
      </span>
    </a>
  `;
}

function renderTopCommunities() {
  if (!ui.topCommunitiesWrap) return;
  const items = state.launches
    .map(addLaunchMetrics)
    .sort((a, b) => communityRankValue(b) - communityRankValue(a))
    .slice(0, 8);
  if (!items.length) {
    ui.topCommunitiesWrap.innerHTML = `<article class="panel-card"><p class="muted">No communities yet.</p></article>`;
    return;
  }
  ui.topCommunitiesWrap.innerHTML = items.map((launch, index) => buildTopCommunityCard(launch, index)).join("");
}

function renderAirdropPreview(payload) {
  if (!ui.airdropResults) return;
  const allocations = Array.isArray(payload?.allocations) ? payload.allocations : [];
  const symbol = String(payload?.symbol || "TOKEN").toUpperCase();
  if (!allocations.length) {
    ui.airdropResults.innerHTML = `<div class="airdrop-empty">No eligible holders found yet. Try again after the token has active buys or sells.</div>`;
    return;
  }
  const claimable = formatTokenAmount(payload?.claimableTokens || 0);
  ui.airdropResults.innerHTML = `
    <div class="airdrop-summary">
      <strong>${escapeHtml(payload?.name || "Token")} <span>$${escapeHtml(symbol)}</span></strong>
      <span>${escapeHtml(payload?.chainName || "Chain")} - ${escapeHtml(claimable)} ${escapeHtml(symbol)} unclaimed creator rewards</span>
    </div>
    <div class="airdrop-holder-list">
      ${allocations
        .map((row, index) => {
          const allocation = formatTokenAmount(row.allocationTokens || 0);
          const balance = formatTokenAmount(row.balanceTokens || 0);
          return `
            <div class="airdrop-holder-row">
              <span class="airdrop-rank">${index + 1}</span>
              <span class="airdrop-holder-address">${escapeHtml(shortAddress(row.address))}</span>
              <span class="airdrop-holder-balance">${escapeHtml(balance)} held</span>
              <strong>${escapeHtml(allocation)} ${escapeHtml(symbol)}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

async function handleAirdropPreview() {
  const token = ui.airdropTokenInput?.value?.trim?.() || "";
  const chainId = Number(ui.airdropChainSelect?.value || state.chainId || 1);
  if (!token) {
    setAlert(ui.alert, "Enter the token contract to preview the holder airdrop.", true);
    return;
  }
  try {
    if (ui.airdropPreviewBtn) {
      ui.airdropPreviewBtn.disabled = true;
      ui.airdropPreviewBtn.textContent = "Reading holders...";
    }
    if (ui.airdropStatus) ui.airdropStatus.textContent = "Reading top holders and unclaimed creator rewards...";
    const payload = await api.airdropPreview({ token, chainId, limit: 20 });
    renderAirdropPreview(payload);
    if (ui.airdropStatus) {
      ui.airdropStatus.textContent =
        "Preview ready. Claim creator rewards from the token page first, then use this split for wallet or distributor payout.";
    }
  } catch (err) {
    if (ui.airdropResults) ui.airdropResults.innerHTML = "";
    if (ui.airdropStatus) ui.airdropStatus.textContent = parseUiError(err);
    setAlert(ui.alert, parseUiError(err), true);
  } finally {
    if (ui.airdropPreviewBtn) {
      ui.airdropPreviewBtn.disabled = false;
      ui.airdropPreviewBtn.textContent = "Preview airdrop";
    }
  }
}

function renderTrending() {
  const ranked = state.launches.map(addLaunchMetrics).map(addTrendingMetrics).sort((a, b) => (b?.trending?.score || 0) - (a?.trending?.score || 0));
  const qualified = ranked.filter((row) => Boolean(row?.trending?.qualifies));
  const base = qualified.length ? qualified : ranked;
  const targetCount = Math.min(8, Math.max(3, Math.ceil(base.length * 0.45)));
  const items = base.slice(0, targetCount);
  if (!items.length) {
    ui.trendingWrap.innerHTML = `<article class="panel-card"><p class="muted">No launches yet.</p></article>`;
    return;
  }
  ui.trendingWrap.innerHTML = items.map((launch) => buildTrendingCard(launch)).join("");
  hydrateTrendingSparklines(items).catch(() => {
    // keep static fallback if sparkline fetch fails
  });
}

function renderExplore() {
  const items = filteredLaunches();
  if (ui.launchCountLabel) {
    ui.launchCountLabel.textContent = `${items.length} ${items.length === 1 ? "coin" : "coins"}`;
  }
  if (!items.length) {
    const message =
      state.filter === "watchlist"
        ? "Watchlist is empty. Click the star on a token to add it."
        : "No launches match your filters.";
    ui.launchesWrap.innerHTML = `<article class="panel-card"><p class="muted">${message}</p></article>`;
    return;
  }
  ui.launchesWrap.innerHTML = items.map((launch) => buildExploreCard(launch)).join("");
  hydrateExploreSparklines(items).catch(() => {
    // keep static fallback if sparkline fetch fails
  });
}

async function hydrateVisibleMarketCaps(limit = 12) {
  const now = Date.now();
  const visible = filteredLaunches()
    .filter((launch) => {
      const token = getTokenId(launch);
      if (!token) return false;
      const blockedUntil = Number(state.hydrateBackoffUntil.get(token) || 0);
      if (blockedUntil > now) return false;

      if (isPumpFunLaunch(launch)) {
        const pumpFunUsd = Math.max(
          Number(launch?.marketCapUsd || 0),
          Number(launch?.usd_market_cap || 0),
          Number(launch?.market_cap_usd || 0),
          Number(launch?.dexSnapshot?.marketCapUsd || 0),
          Number(launch?.fdvUsd || 0)
        );
        return !Number.isFinite(pumpFunUsd) || pumpFunUsd <= 0;
      }

      const dexMcap = Number(launch?.dexSnapshot?.marketCapUsd || 0);
      const dexLiq = Number(launch?.dexSnapshot?.liquidityUsd || 0);
      const poolMcapUsd = weiToUsd(launch?.pool?.marketCapWei || "0", state.ethUsd);
      const poolMcapEth = Number(launch?.pool?.marketCapEth || 0);
      const poolMcapUsdFromEth = Number.isFinite(poolMcapEth) && poolMcapEth > 0 ? poolMcapEth * Number(state.ethUsd || 0) : 0;
      const poolBasis = Math.max(poolMcapUsd, poolMcapUsdFromEth, 0);

      const missing = dexMcap <= 0 && poolBasis <= 0;
      const inflated = dexMcap > 0 && poolBasis > 0 && (dexMcap / poolBasis > 25 || (dexLiq > 0 && dexMcap / dexLiq > 2500));
      return missing || inflated;
    })
    .slice(0, limit);

  if (!visible.length) return;
  const hydrated = [];
  await Promise.all(
    visible.map(async (launch) => {
      try {
        if (isPumpFunLaunch(launch)) {
          const payload = await api.pumpfunCoin(launch.mint || launch.token);
          if (payload?.token || payload?.mint) {
            const token = getTokenId(launch);
            if (token) state.hydrateBackoffUntil.delete(token);
            hydrated.push({
              ...launch,
              ...payload,
              chainId: "pumpfun",
              source: "pumpfun",
              token: payload.token || payload.mint || launch.token,
              mint: payload.mint || payload.token || launch.mint,
              dexSnapshot: payload.dexSnapshot || launch.dexSnapshot || null
            });
          }
          return;
        }
        const payload = await api.token(launch.token, {
          lite: true,
          fresh: true,
          chainId: Number(launch?.chainId || state.chainId),
          quote: launchQuoteMode(launch)
        });
        if (payload?.launch?.token) {
          const token = getTokenId(launch);
          if (token) state.hydrateBackoffUntil.delete(token);
          hydrated.push({
            ...payload.launch,
            chainId: Number(payload?.launch?.chainId || launch?.chainId || state.chainId),
            dexSnapshot: payload.dex || launch.dexSnapshot || null
          });
        }
      } catch {
        const token = getTokenId(launch);
        if (token) {
          state.hydrateBackoffUntil.set(token, Date.now() + 60_000);
        }
      }
    })
  );

  if (!hydrated.length) return;
  state.launches = mergeLaunchRows(state.launches, hydrated);
  saveCachedLaunches(state.launches);
  updateMoverSignals(state.launches);
  renderTopCommunities();
  renderTrending();
  renderExplore();
}

function setActiveFilterButton() {
  for (const button of ui.filterButtons) {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  }
}

function updateProfileIdentity() {
  const ws = walletState();
  const evmConnected = Boolean(ws.signer && ws.address);
  const generatedConnected = Boolean(ws.generatedWallet?.address);
  const generated = ws.generatedWallet || null;
  const solanaConnected = Boolean(ws.solanaAddress);
  const connected = evmConnected || solanaConnected;
  const profile = evmConnected ? loadUserProfile(ws.address) : { username: "Guest", imageUri: "", bio: "" };
  const generatedName = generatedConnected
    ? String(generated.name || (generated.username ? `@${generated.username}` : "") || generated.email || "")
    : "";
  const name = generatedConnected
    ? generatedName || `sol_${String(generated.address || ws.solanaAddress).slice(0, 6)}`
    : solanaConnected && !evmConnected
    ? `sol_${String(ws.solanaAddress).slice(0, 6)}`
    : evmConnected
      ? profile.username || defaultUsername(ws.address)
      : "Guest";
  const avatarText = generatedConnected && generated?.type === "x" ? "X" : solanaConnected && !evmConnected ? "SOL" : connected ? name.slice(0, 2).toUpperCase() : "EP";
  const imageUri = generatedConnected ? String(generated.image || "") : evmConnected ? profile.imageUri || "" : "";

  if (ui.profileMenuName) ui.profileMenuName.textContent = name;
  if (ui.profileMenuNameLarge) ui.profileMenuNameLarge.textContent = name;
  if (ui.profileMenuMeta) {
    if (evmConnected) {
      const cachedFollowers = loadCachedFollowerCount(ws.address);
      ui.profileMenuMeta.textContent = followerMetaText(cachedFollowers ?? 0);
    } else if (solanaConnected) {
      ui.profileMenuMeta.textContent = generatedConnected
        ? generated?.type === "x" && generated.username
          ? `@${generated.username}`
          : generated?.type === "email"
            ? "Email connected"
            : "Generated Solana wallet"
        : "Solana wallet connected";
    } else {
      ui.profileMenuMeta.textContent = "Not connected";
    }
  }
  if (ui.signInBtn) ui.signInBtn.style.display = connected ? "none" : "inline-flex";
  if (ui.walletHubBtn) ui.walletHubBtn.style.display = evmConnected || generatedConnected ? "inline-flex" : "none";
  if (ui.profileMenuBtn) ui.profileMenuBtn.style.display = connected ? "inline-flex" : "none";
  if (!evmConnected && !generatedConnected) {
    walletHub?.setOpen(false);
  }
  if (!connected) {
    setProfileMenuOpen(false);
  }

  setAvatar(ui.profileAvatar, avatarText, imageUri);
  setAvatar(ui.profileAvatarLarge, avatarText, imageUri);

  const profileUrl = evmConnected ? `/profile?address=${ws.address}` : solanaConnected ? `/profile?address=${encodeURIComponent(generated?.address || ws.solanaAddress)}` : "/profile";
  if (ui.profileNav) {
    ui.profileNav.href = profileUrl;
    ui.profileNav.style.display = connected ? "block" : "none";
  }
  if (ui.profileNavSide) {
    ui.profileNavSide.href = profileUrl;
    ui.profileNavSide.style.display = connected ? "block" : "none";
  }

  if (ui.editProfileBtn) {
    ui.editProfileBtn.disabled = !evmConnected;
    ui.editProfileBtn.style.opacity = evmConnected ? "1" : "0.6";
    ui.editProfileBtn.style.cursor = evmConnected ? "pointer" : "not-allowed";
  }
  if (ui.menuLogoutBtn) {
    ui.menuLogoutBtn.textContent = connected ? "Log out" : "Connect wallet";
  }

  if (evmConnected) {
    const currentAddress = String(ws.address || "");
    hydrateFollowerCount(currentAddress).then((followersCount) => {
      const nextWs = walletState();
      if (String(nextWs.address || "").toLowerCase() !== currentAddress.toLowerCase()) return;
      if (ui.profileMenuMeta) {
        ui.profileMenuMeta.textContent = followerMetaText(followersCount);
      }
    }).catch(() => {
      // ignore follower-count hydration failures
    });
    hydrateUserProfile(currentAddress).then(() => {
      const nextWs = walletState();
      if (String(nextWs.address || "").toLowerCase() !== currentAddress.toLowerCase()) return;
      const fresh = loadUserProfile(currentAddress);
      if (fresh.username !== name || String(fresh.imageUri || "") !== String(imageUri || "")) {
        updateProfileIdentity();
      }
    }).catch(() => {
      // ignore profile hydration failures
    });
  }
}

async function openEditProfileModal() {
  const ws = walletState();
  if (!ws.address) {
    setAlert(ui.alert, "Connect wallet first", true);
    return;
  }
  await hydrateUserProfile(ws.address, { force: true });
  const profile = loadUserProfile(ws.address);
  if (ui.editUsername) ui.editUsername.value = profile.username || defaultUsername(ws.address);
  if (ui.editBio) ui.editBio.value = profile.bio || "";
  state.pendingProfileImageUri = String(profile.imageUri || "");
  updateEditAvatarPreview((profile.username || "EP").slice(0, 2).toUpperCase(), state.pendingProfileImageUri);
  ui.editProfileModal?.classList.add("open");
  ui.editProfileModal?.setAttribute("aria-hidden", "false");
}

function hideEditProfileModal() {
  ui.editProfileModal?.classList.remove("open");
  ui.editProfileModal?.setAttribute("aria-hidden", "true");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function setupProfileMenu() {
  ui.profileMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    walletHub?.setOpen(false);
    const isOpen = ui.profileMenu?.classList.contains("open");
    setProfileMenuOpen(!isOpen);
  });

  document.addEventListener("click", (event) => {
    if (!ui.profileMenu || !ui.profileMenuBtn) return;
    if (!ui.profileMenu.classList.contains("open")) return;
    if (ui.profileMenu.contains(event.target) || ui.profileMenuBtn.contains(event.target)) return;
    setProfileMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setProfileMenuOpen(false);
      hideEditProfileModal();
    }
  });

  ui.menuLogoutBtn?.addEventListener("click", () => {
    const ws = walletState();
    if (!ws.signer && !ws.address && !ws.solanaAddress) {
      setAlert(ui.alert, "Wallet already disconnected");
      setProfileMenuOpen(false);
      return;
    }
    disconnectWallet();
    setProfileMenuOpen(false);
    updateProfileIdentity();
    walletHub?.refresh();
    setAlert(ui.alert, "Wallet disconnected");
  });

  ui.editProfileBtn?.addEventListener("click", () => {
    setProfileMenuOpen(false);
    openEditProfileModal();
  });

  ui.profileShareBtn?.addEventListener("click", async () => {
    const ws = walletState();
    if (!ws.address) {
      setAlert(ui.alert, "Connect wallet first", true);
      return;
    }
    try {
      const link = `${window.location.origin}/profile?address=${ws.address}`;
      await navigator.clipboard.writeText(link);
      setAlert(ui.alert, "Profile link copied");
    } catch {
      setAlert(ui.alert, "Could not copy profile link", true);
    }
  });
}

function setupEditProfileModal() {
  ui.closeEditProfileModal?.addEventListener("click", hideEditProfileModal);
  ui.editProfileModal?.addEventListener("click", (event) => {
    if (event.target === ui.editProfileModal) hideEditProfileModal();
  });

  ui.editAvatarPickBtn?.addEventListener("click", () => {
    ui.editAvatarFile?.click();
  });

  ui.editAvatarRemoveBtn?.addEventListener("click", () => {
    state.pendingProfileImageUri = "";
    const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
    updateEditAvatarPreview(text || "EP", "");
    if (ui.editAvatarFile) ui.editAvatarFile.value = "";
  });

  ui.editAvatarFile?.addEventListener("change", async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) throw new Error("Pick a valid image file");
      if (file.size > MAX_PROFILE_IMAGE_BYTES) throw new Error("Profile image too large. Keep it under 2 MB.");
      const dataUrl = await readFileAsDataUrl(file);
      setAlert(ui.alert, "Uploading profile image...");
      try {
        const uploaded = await api.uploadImage(dataUrl);
        state.pendingProfileImageUri = uploaded.url || dataUrl;
      } catch {
        state.pendingProfileImageUri = dataUrl;
      }
      const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
      updateEditAvatarPreview(text || "EP", state.pendingProfileImageUri);
      setAlert(ui.alert, "Profile image uploaded");
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    }
  });

  ui.editUsername?.addEventListener("input", () => {
    const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
    updateEditAvatarPreview(text || "EP", state.pendingProfileImageUri);
  });

  ui.saveEditProfileBtn?.addEventListener("click", async () => {
    const ws = walletState();
    if (!ws.address) {
      setAlert(ui.alert, "Connect wallet first", true);
      return;
    }
    const username = String(ui.editUsername?.value || "").trim();
    const bio = String(ui.editBio?.value || "").trim();
    if (!username) {
      setAlert(ui.alert, "Username is required", true);
      return;
    }
    const saved = await saveUserProfile(ws.address, { username, bio, imageUri: state.pendingProfileImageUri });
    updateProfileIdentity();
    renderTrending();
    renderExplore();
    hideEditProfileModal();
    if (saved?.synced) {
      setAlert(ui.alert, "Profile updated");
    } else {
      setAlert(ui.alert, "Profile saved locally, but cloud sync failed. Check backend env/API.", true);
    }
  });
}

function setupTrendingNav() {
  ui.trendPrev?.addEventListener("click", () => {
    ui.trendingWrap?.scrollBy({ left: -320, behavior: "smooth" });
  });
  ui.trendNext?.addEventListener("click", () => {
    ui.trendingWrap?.scrollBy({ left: 320, behavior: "smooth" });
  });
}

function setupTopCommunityHoverPan() {
  const row = ui.topCommunitiesWrap;
  if (!row || !window.matchMedia?.("(pointer: fine)").matches) return;
  let frame = 0;

  row.addEventListener("mousemove", (event) => {
    const maxScroll = row.scrollWidth - row.clientWidth;
    if (maxScroll <= 4) return;
    const rect = row.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const target = maxScroll * ratio;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      row.scrollLeft += (target - row.scrollLeft) * 0.2;
    });
  });

  row.addEventListener("mouseleave", () => {
    cancelAnimationFrame(frame);
    row.scrollTo({ left: 0, behavior: "smooth" });
  });
}

function setupInteractions() {
  ui.searchInput?.addEventListener("input", () => {
    state.query = ui.searchInput.value.trim();
    renderExplore();
  });

  ui.airdropPreviewBtn?.addEventListener("click", handleAirdropPreview);
  ui.airdropTokenInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAirdropPreview();
    }
  });

  for (const button of ui.filterButtons) {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter || "movers";
      setActiveFilterButton();
      renderExplore();
    });
  }

  ui.launchesWrap?.addEventListener("click", (event) => {
    const watchBtn = event.target.closest("[data-watch-token]");
    if (watchBtn) {
      event.preventDefault();
      event.stopPropagation();
      const token = String(watchBtn.dataset.watchToken || "").toLowerCase();
      const launch = state.launches.find((item) => getTokenId(item) === token);
      if (!launch) return;
      toggleWatch(launch);
      renderExplore();
      return;
    }

    const tokenLink = event.target.closest('a[href^="/token?token="]');
    if (tokenLink) {
      const href = new URL(tokenLink.href, window.location.origin);
      const token = String(href.searchParams.get("token") || "").toLowerCase();
      const chainId = Number(href.searchParams.get("chainId") || state.chainId || 1);
      const quoteMode = String(href.searchParams.get("quote") || "native").toLowerCase() === "usdc" ? "usdc" : "native";
      const launchKey = `${Number.isFinite(chainId) && chainId > 0 ? Math.floor(chainId) : 1}:${quoteMode}:${token}`;
      const launch = state.launches.find((item) => getTokenId(item) === launchKey);
      if (launch) recordViewedLaunch(launch);
    }
  });

  ui.trendingWrap?.addEventListener("click", (event) => {
    const tokenLink = event.target.closest('a[href^="/token?token="]');
    if (!tokenLink) return;
    const href = new URL(tokenLink.href, window.location.origin);
    const token = String(href.searchParams.get("token") || "").toLowerCase();
    const chainId = Number(href.searchParams.get("chainId") || state.chainId || 1);
    const quoteMode = String(href.searchParams.get("quote") || "native").toLowerCase() === "usdc" ? "usdc" : "native";
    const launchKey = `${Number.isFinite(chainId) && chainId > 0 ? Math.floor(chainId) : 1}:${quoteMode}:${token}`;
    const launch = state.launches.find((item) => getTokenId(item) === launchKey);
    if (launch) recordViewedLaunch(launch);
  });

  setupTopCommunityHoverPan();
}

async function refreshLaunches(options = {}) {
  const enrich = options.enrich !== false;
  let launchesRes = null;
  let lastError = null;
  const cached = loadCachedLaunches();
  if (!state.launches.length && cached.length) {
    state.launches = cached;
    updateMoverSignals(state.launches);
    renderTopCommunities();
    renderTrending();
    renderExplore();
  }

  try {
    const quick = await fetchLaunchesAcrossChains(fetchRecentLaunchPage, { limit: 36, lite: true, includeDex: false });
    if (quick.launches.length) {
      state.launches = mergeLaunchRows(state.launches, quick.launches);
      saveCachedLaunches(state.launches);
      updateMoverSignals(state.launches);
      renderTopCommunities();
      renderTrending();
      renderExplore();
      hydrateVisibleMarketCaps(10).catch(() => {
        // best-effort card enrichment
      });
    }
  } catch (error) {
    lastError = error;
  }

  if (enrich) {
    const retryDelays = [0, 500, 1200];
    for (const delayMs of retryDelays) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        launchesRes = await fetchLaunchesAcrossChains(fetchLaunchPages, { pageSize: 24, includeDex: true });
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!launchesRes) {
    if (state.launches.length) return;
    throw lastError || new Error("Unable to load launches");
  }

  const freshLaunches = Array.isArray(launchesRes?.launches)
    ? launchesRes.launches.filter((row) => Boolean(row && row.token))
    : [];

  if (!freshLaunches.length) {
    const cached = loadCachedLaunches();
    if (cached.length) {
      state.launches = cached;
      updateMoverSignals(state.launches);
      renderTopCommunities();
      renderTrending();
      renderExplore();
      setAlert(ui.alert, "Live feed is syncing, showing recent cached tokens.");
      return;
    }
  }

  state.launches = mergeLaunchRows(state.launches, freshLaunches);
  saveCachedLaunches(state.launches);
  updateMoverSignals(state.launches);
  renderTopCommunities();
  renderTrending();
  renderExplore();
  hydrateVisibleMarketCaps(14).catch(() => {
    // best-effort card enrichment
  });
  setAlert(ui.alert, "");

  const ws = walletState();
  if (ws.address) {
    hydrateUserProfile(ws.address, { force: false }).catch(() => {
      // ignore self-profile hydration failures
    });
  }
  const creators = [...new Set(state.launches.map((launch) => String(launch?.creator || "").trim()).filter(Boolean))];
  hydrateUserProfiles(creators, { force: false })
    .then(() => {
      renderTopCommunities();
      renderTrending();
      renderExplore();
    })
    .catch(() => {
      // keep already-rendered content
    });
}

async function refreshEthUsd(force = false) {
  const price = await fetchEthUsdPrice(force);
  if (Number.isFinite(price) && price > 0) {
    state.ethUsd = price;
  }
}

async function loadConfig() {
  const cfg = await api.config();
  state.chainId = Number(cfg.chainId || 1);
  state.supportedChains = Array.isArray(cfg.supportedChains) ? cfg.supportedChains : [];
  state.quoteLaunchOptions = Array.isArray(cfg.quoteLaunchOptions) ? cfg.quoteLaunchOptions : [];
  setPreferredChainId(state.chainId);
  if (ui.networkChip) {
    const labels = configuredFeedChains()
      .map((chainId) => (CHAIN_OPTIONS[chainId]?.shortName || String(chainId)).toUpperCase())
      .slice(0, 3);
    ui.networkChip.textContent = labels.length > 1 ? labels.join(" + ") : `Chain ${cfg.chainId}`;
  }
  if (ui.factoryChip) ui.factoryChip.textContent = shortAddress(cfg.factoryAddress);
}

async function init() {
  walletHub = initWalletHubMenu({
    triggerEl: ui.walletHubBtn,
    menuEl: ui.walletHubMenu,
    balanceEl: ui.walletHubBalance,
    balanceLargeEl: ui.walletHubBalanceLarge,
    nativeEl: ui.walletHubNative,
    addressBtnEl: ui.walletHubAddressBtn,
    historyLinkEl: ui.walletHubHistoryLink,
    depositBtnEl: ui.walletHubDepositBtn,
    tradeLinkEl: ui.walletHubTradeLink,
    buyLinkEl: ui.walletHubBuyLink,
    depositModalEl: ui.depositModal,
    depositCloseBtnEl: ui.depositCloseBtn,
    depositCopyBtnEl: ui.depositCopyBtn,
    depositAddressEl: ui.depositAddressText,
    depositQrEl: ui.depositQrImage,
    alertEl: ui.alert,
    onOpen: () => setProfileMenuOpen(false)
  });

  walletControls = initWalletControls({
    selectEl: ui.walletSelect,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    labelEl: null,
    alertEl: ui.alert,
    onConnected: async () => {
      updateProfileIdentity();
      setProfileMenuOpen(false);
      await walletHub?.refresh();
    }
  });

  ui.disconnectBtn?.addEventListener("click", () => {
    updateProfileIdentity();
    setProfileMenuOpen(false);
    walletHub?.refresh();
  });

  ui.connectBtn?.addEventListener("click", () => {
    setTimeout(() => {
      updateProfileIdentity();
      walletHub?.refresh();
    }, 30);
  });

  ui.walletSelect?.addEventListener("change", () => {
    setTimeout(() => {
      updateProfileIdentity();
      walletHub?.refresh();
    }, 30);
  });

  ui.signInBtn?.addEventListener("click", () => {
    if (walletControls?.connect) {
      walletControls.connect();
      return;
    }
    ui.connectBtn?.click();
  });

  updateProfileIdentity();
  setActiveFilterButton();
  setupProfileMenu();
  setupEditProfileModal();
  initSupportWidget({ alertEl: ui.alert });
  setupTrendingNav();
  setupInteractions();
  initCoinSearchOverlay({ triggerInputs: [ui.searchInput] });

  const bootCached = loadCachedLaunches();
  if (bootCached.length) {
    state.launches = bootCached;
    updateMoverSignals(state.launches);
    renderTopCommunities();
    renderTrending();
    renderExplore();
  }

  refreshEthUsd()
    .then(() => {
      renderTrending();
      renderExplore();
    })
    .catch(() => {
      // keep fallback
    });

  await loadConfig();
  try {
    await refreshLaunches({ enrich: false });
    refreshLaunches({ enrich: true }).catch(() => {
      // keep fast-first content if enrich pass fails
    });
  } catch (err) {
    const cached = loadCachedLaunches();
    if (cached.length) {
      state.launches = cached;
      updateMoverSignals(state.launches);
      renderTrending();
      renderExplore();
    } else {
      ui.trendingWrap.innerHTML = `<article class="panel-card"><p class="muted">Unable to load trending tokens right now.</p></article>`;
      ui.launchesWrap.innerHTML = `<article class="panel-card"><p class="muted">Unable to load explore feed right now.</p></article>`;
    }
    setAlert(ui.alert, parseUiError(err), true);
  }

  setInterval(() => {
    refreshCycle += 1;
    refreshLaunches({ enrich: refreshCycle % 3 === 0 }).catch(() => {
      // ignore transient polling failures
    });
  }, 10000);

  setInterval(() => {
    refreshEthUsd(true)
      .then(() => {
        renderTrending();
        renderExplore();
      })
      .catch(() => {
        // ignore ETH/USD polling failures
      });
  }, 60_000);
}

init().catch((err) => {
  setAlert(ui.alert, parseUiError(err), true);
});
