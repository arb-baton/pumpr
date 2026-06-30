import { api } from "./api.js?v=20260630signin";
import {
  TOKEN_ABI,
  defaultUsername,
  disconnectWallet,
  ethToUsd,
  ethers,
  fetchEthUsdPrice,
  formatCompactUsd,
  formatEth,
  formatToken,
  hydrateFollowerCount,
  hydrateUserProfile,
  hydrateUserProfiles,
  loadCachedFollowerCount,
  loadUserProfile,
  makePoolContract,
  makeRouterContract,
  makeTokenContract,
  parseUiError,
  resolveCoinImage,
  saveUserProfile,
  sendTxWithFallback,
  setPreferredChainId,
  shortAddress,
  walletState
} from "./core.js?v=20260630signin";
import { initWalletControls, initWalletHubMenu, setAlert, setWalletLabel, showCopyToast } from "./ui.js?v=20260630signin";
import { initCoinSearchOverlay, recordViewedLaunch } from "./searchModal.js?v=20260630signin";
import { initSupportWidget } from "./support.js?v=20260630signin";

const RANGE_MS = {
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "5d": 5 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000
};

const CANDLE_BUCKET_SEC = {
  "1h": 60,
  "4h": 5 * 60,
  "1d": 15 * 60,
  "5d": 60 * 60,
  "1m": 4 * 60 * 60,
  "24h": 15 * 60,
  all: 60 * 60
};

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

const ui = {
  walletSelect: document.getElementById("walletChoice"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletLabel: document.getElementById("walletAddress"),
  alert: document.getElementById("alert"),
  tokenSearchInput: document.getElementById("tokenSearchInput"),
  signInBtn: document.getElementById("signInBtn"),
  netChip: document.getElementById("networkChip"),
  factoryChip: document.getElementById("factoryChip"),
  tokenTitle: document.getElementById("tokenTitle"),
  tokenSymbolLine: document.getElementById("tokenSymbolLine"),
  tokenCreatorInfo: document.getElementById("tokenCreatorInfo"),
  tokenImage: document.getElementById("tokenImage"),
  marketCapHeadline: document.getElementById("marketCapHeadline"),
  marketCapDelta24h: document.getElementById("marketCapDelta24h"),
  athFill: document.getElementById("athFill"),
  athLabel: document.getElementById("athLabel"),
  chartPairLabel: document.getElementById("chartPairLabel"),
  chartOpen: document.getElementById("chartOpen"),
  chartHigh: document.getElementById("chartHigh"),
  chartLow: document.getElementById("chartLow"),
  chartClose: document.getElementById("chartClose"),
  chartVolume: document.getElementById("chartVolume"),
  priceChart: document.getElementById("priceChart"),
  volume24h: document.getElementById("volume24h"),
  lastPrice: document.getElementById("lastPrice"),
  delta5m: document.getElementById("delta5m"),
  delta1h: document.getElementById("delta1h"),
  delta6h: document.getElementById("delta6h"),
  buyInput: document.getElementById("buyInput"),
  buyTokenInput: document.getElementById("buyTokenInput"),
  buyBtn: document.getElementById("buyBtn"),
  sellInput: document.getElementById("sellInput"),
  sellEthInput: document.getElementById("sellEthInput"),
  sellBtn: document.getElementById("sellBtn"),
  buyFields: document.getElementById("buyFields"),
  sellFields: document.getElementById("sellFields"),
  buyTabBtn: document.getElementById("buyTabBtn"),
  sellTabBtn: document.getElementById("sellTabBtn"),
  walletBalance: document.getElementById("walletBalance"),
  walletBalanceUsd: document.getElementById("walletBalanceUsd"),
  tradeMaxBtn: document.getElementById("tradeMaxBtn"),
  tradePrimaryAmount: document.getElementById("tradePrimaryAmount"),
  tradePrimaryUnit: document.getElementById("tradePrimaryUnit"),
  tradeApproxLine: document.getElementById("tradeApproxLine"),
  tradeReceiveLine: document.getElementById("tradeReceiveLine"),
  tradeTable: document.getElementById("tradeTableBody"),
  tradeFilterEnabled: document.getElementById("tradeFilterEnabled"),
  tradeFilterMin: document.getElementById("tradeFilterMin"),
  creatorLabel: document.getElementById("creatorLabel"),
  creatorShare: document.getElementById("creatorShare"),
  creatorClaimableUsd: document.getElementById("creatorClaimableUsd"),
  creatorUnclaimedLine: document.getElementById("creatorUnclaimedLine"),
  creatorSharePct: document.getElementById("creatorSharePct"),
  openCreator: document.getElementById("openCreator"),
  creatorProfileLink: document.getElementById("creatorProfileLink"),
  creatorRewardAvatar: document.getElementById("creatorRewardAvatar"),
  creatorAddressLine: document.getElementById("creatorAddressLine"),
  bondingProgressLabel: document.getElementById("bondingProgressLabel"),
  bondingProgressFill: document.getElementById("bondingProgressFill"),
  bondingStatusText: document.getElementById("bondingStatusText"),
  topHoldersList: document.getElementById("topHoldersList"),
  communityNavSide: document.getElementById("communityNavSide"),
  communityMiniTitle: document.getElementById("communityMiniTitle"),
  communityMiniMeta: document.getElementById("communityMiniMeta"),
  communityMiniPreview: document.getElementById("communityMiniPreview"),
  visitCommunityBtn: document.getElementById("visitCommunityBtn"),
  terminalLink: document.getElementById("terminalLink"),
  profileNav: document.getElementById("profileNav"),
  profileNavSide: document.getElementById("profileNavSide"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  rangeButtons: Array.from(document.querySelectorAll("[data-range]")),
  quickEthButtons: Array.from(document.querySelectorAll("[data-quick-eth]")),
  quickTokenButtons: Array.from(document.querySelectorAll("[data-quick-token]")),
  shareTokenBtn: document.getElementById("shareTokenBtn"),
  copyTokenBtn: document.getElementById("copyTokenBtn"),
  profileMenuBtn: document.getElementById("profileMenuBtn"),
  profileMenu: document.getElementById("profileMenu"),
  profileMenuName: document.getElementById("profileMenuName"),
  profileMenuNameLarge: document.getElementById("profileMenuNameLarge"),
  profileMenuMeta: document.getElementById("profileMenuMeta"),
  profileShareBtn: document.getElementById("profileShareBtn"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileAvatarLarge: document.getElementById("profileAvatarLarge"),
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
  depositQrImage: document.getElementById("depositQrImage"),
  editProfileBtn: document.getElementById("editProfileBtn"),
  menuLogoutBtn: document.getElementById("menuLogoutBtn"),
  editProfileModal: document.getElementById("editProfileModal"),
  closeEditProfileModal: document.getElementById("closeEditProfileModal"),
  saveEditProfileBtn: document.getElementById("saveEditProfileBtn"),
  editUsername: document.getElementById("editUsername"),
  editBio: document.getElementById("editBio"),
  editAvatarPreview: document.getElementById("editAvatarPreview"),
  editAvatarFile: document.getElementById("editAvatarFile"),
  editAvatarPickBtn: document.getElementById("editAvatarPickBtn"),
  editAvatarRemoveBtn: document.getElementById("editAvatarRemoveBtn")
};

const state = {
  token: "",
  launch: null,
  trades: [],
  topHolders: [],
  chartApi: null,
  candleSeries: null,
  volumeSeries: null,
  resizeObserver: null,
  explorerBaseUrl: "",
  mode: "mcap",
  range: "1d",
  livePoints: [],
  allSeries: [],
  chainId: 1,
  quoteMode: "native",
  quoteAsset: { mode: "native", symbol: "ETH", decimals: 18, address: "0x0000000000000000000000000000000000000000", isNative: true },
  gecko: null,
  dex: null,
  ethUsd: 3000,
  isBuyTab: true,
  pendingProfileImageUri: "",
  activeChartEmbedUrl: "",
  creatorClaimPending: false,
  optimisticTrades: [],
  forceLocalChartUntil: 0,
  pairMeta: null,
  community: null,
  fullRefreshInFlight: false,
  lastFullRefreshAt: 0
};
let walletHub = null;
let walletControls = null;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const GECKO_NETWORK_BY_CHAIN = {
  1: "eth",
  11155111: "sepolia-testnet"
};
const DEXSCREENER_NETWORK_BY_CHAIN = {
  1: "ethereum",
  11155111: "sepolia"
};

function formatEthDisplay(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 ETH";
  if (n < 0.000000000001) return `${n.toExponential(4)} ETH`;
  if (n < 0.000001) return `${n.toLocaleString(undefined, { maximumFractionDigits: 15 })} ETH`;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 12 })} ETH`;
}
const tradeSyncTimers = {
  buyFromEth: null,
  buyFromToken: null,
  sellFromToken: null,
  sellFromEth: null
};
const V2_PAIR_SWAP_EVENT_ABI = [
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
];
const V2_PAIR_META_ABI = ["function token0() view returns (address)", "function token1() view returns (address)"];
const CLAIM_MIN_USD = 8;

async function ensurePumpRHolderPaymentAccess(address) {
  const eligibility = await api.holderEligibility({ address });
  if (eligibility?.required === false) return eligibility;
  if (!eligibility?.configured) {
    throw new Error("Official Pump-r token is not configured yet. Set PUMPR_TOKEN_ADDRESS and PUMPR_TOKEN_CHAIN_ID before enabling creator payments.");
  }
  if (eligibility.required !== false && !eligibility.eligibleToLaunch) {
    const symbol = String(eligibility.symbol || "PUMPR").replace(/^\$/, "").toUpperCase();
    const chain = String(eligibility.chainShortName || eligibility.chainName || "configured chain");
    throw new Error(`Hold $${symbol} in your ${chain} wallet to receive creator payments. 1%+ holders will also be eligible for later airdrops.`);
  }
  return eligibility;
}

const RECENT_VIEWED_KEY = "etherpump.search.viewed.v1";


function followerMetaText(count) {
  const numeric = Math.max(0, Number(count || 0));
  return `${numeric} ${numeric === 1 ? "follower" : "followers"}`;
}

const COPY_PILL_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2"></rect>
    <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path>
  </svg>
`;

function spotPriceWei() {
  const pool = state.launch?.pool || {};
  return poolUnitPriceWei(pool);
}

function parseUnitsSafe(value, decimals = 18) {
  const text = String(value || "").trim();
  if (!text) return 0n;
  try {
    return ethers.parseUnits(text, decimals);
  } catch {
    if (!text.includes(".")) throw new Error("invalid number");
    const [whole, fracRaw] = text.split(".");
    const frac = String(fracRaw || "").slice(0, decimals);
    const normalized = frac ? `${whole}.${frac}` : whole;
    return ethers.parseUnits(normalized, decimals);
  }
}

function parseBigIntSafe(value, fallback = 0n) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return fallback;
  }
}

function poolUnitPriceWei(pool) {
  const graduated = Boolean(pool?.graduated) || String(pool?.priceSource || "").toLowerCase() === "dex";
  const effective = parseBigIntSafe(pool?.effectiveSpotPriceWei || "0");
  if (effective > 0n) return effective;

  const marketCapWei = parseBigIntSafe(pool?.marketCapWei || "0");
  const circulating = parseBigIntSafe(pool?.circulatingSupply || "0");
  if (marketCapWei > 0n && circulating > 0n) {
    return (marketCapWei * 10n ** 18n) / circulating;
  }

  if (graduated) return 0n;
  return parseBigIntSafe(pool?.spotPriceWei || "0");
}

function normalizeAddress(value) {
  try {
    return ethers.getAddress(String(value || "").trim());
  } catch {
    return "";
  }
}

function profileHrefForAddress(value) {
  const normalized = normalizeAddress(value);
  return normalized ? `/profile?address=${normalized}` : "/profile";
}

function creatorClaimableUsdFromLaunch(launch) {
  const claimableTokenWei = parseBigIntSafe(launch?.feeSnapshot?.creatorClaimableWei || "0");
  if (claimableTokenWei <= 0n) return 0;

  const priceWei = poolUnitPriceWei(launch?.pool);
  if (priceWei <= 0n) return 0;

  const valueInEthWei = (claimableTokenWei * priceWei) / 10n ** 18n;
  const valueEth = Number(ethers.formatUnits(valueInEthWei, 18));
  if (!Number.isFinite(valueEth) || valueEth <= 0) return 0;
  return ethToUsd(valueEth, state.ethUsd);
}

function toPositiveNumber(raw) {
  const n = Number(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatTradeNumber(value, maxFractionDigits = 6) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function formatAmountForInput(amountWei, decimals = 18, maxFractionDigits = 6) {
  const raw = ethers.formatUnits(amountWei || 0n, decimals);
  if (!raw.includes(".")) return raw;
  const [whole, fraction] = raw.split(".");
  const trimmedFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function queueTradeSync(timerKey, task, delayMs = 260) {
  if (tradeSyncTimers[timerKey]) {
    clearTimeout(tradeSyncTimers[timerKey]);
  }
  tradeSyncTimers[timerKey] = setTimeout(() => {
    task().catch(() => {
      // quote refresh is best-effort while typing
    });
  }, delayMs);
}

function hasDexMarket(launch) {
  const pool = launch?.pool || {};
  const graduated = Boolean(pool.graduated) || Boolean(state.dex?.pairAddress);
  const pair = String(pool.migratedPair || state.dex?.pairAddress || "").toLowerCase();
  const router = String(pool.dexRouter || "").toLowerCase();
  return graduated && pair && pair !== ZERO_ADDRESS && router && router !== ZERO_ADDRESS;
}

function poolAddressFromLaunch(launch = state.launch) {
  return normalizeAddress(String(launch?.poolAddress || launch?.pool || ""));
}

function hasBondingMarket(launch = state.launch) {
  const pool = launch?.pool || {};
  return Boolean(poolAddressFromLaunch(launch)) && !Boolean(pool.graduated) && String(pool.priceSource || "bonding").toLowerCase() !== "dex";
}

function hasTradeMarket(launch = state.launch) {
  return hasDexMarket(launch) || hasBondingMarket(launch);
}

function geckoPoolUrl(launch) {
  const geckoIndexed = Boolean(state.gecko?.indexed) || Boolean(state.gecko?.snapshot);
  if (geckoIndexed && state.gecko?.embedUrl) return String(state.gecko.embedUrl);
  if (!geckoIndexed) return "";
  const pair = String(launch?.pool?.migratedPair || state.dex?.pairAddress || "");
  if (!pair || pair.toLowerCase() === ZERO_ADDRESS) return "";
  const network = GECKO_NETWORK_BY_CHAIN[Number(state.chainId)] || "eth";
  return `https://www.geckoterminal.com/${network}/pools/${pair}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0`;
}

function dexscreenerPairUrl(launch) {
  const pair = String(launch?.pool?.migratedPair || state.dex?.pairAddress || "");
  if (!pair || pair.toLowerCase() === ZERO_ADDRESS) return "";
  return `https://dexscreener.com/${dexScreenerNetworkSlug()}/${pair}`;
}

function dexScreenerNetworkSlug() {
  return DEXSCREENER_NETWORK_BY_CHAIN[Number(state.chainId)] || "ethereum";
}

function pairAddressFromState() {
  return normalizeAddress(String(state.launch?.pool?.migratedPair || state.dex?.pairAddress || "")) || "";
}

function mergeTradesWithOptimistic(apiTrades = []) {
  const nowSec = Math.floor(Date.now() / 1000);
  const optimisticFresh = (state.optimisticTrades || []).filter((row) => nowSec - Number(row.timestamp || 0) < 30 * 60);
  state.optimisticTrades = optimisticFresh;

  const combined = [...optimisticFresh, ...(apiTrades || [])];
  const seen = new Set();
  const out = [];
  for (const row of combined) {
    const key = [
      String(row.txHash || ""),
      String(row.side || ""),
      Number(row.timestamp || 0),
      Number(row.blockNumber || 0),
      Number(row.logIndex || -1),
      String(row.ethAmountWei || ""),
      String(row.tokenAmountWei || "")
    ].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  return out.slice(0, 300);
}

async function getPairMeta() {
  const ws = walletState();
  const pair = pairAddressFromState();
  if (!ws.provider || !pair) return null;

  if (state.pairMeta && String(state.pairMeta.pair || "").toLowerCase() === pair.toLowerCase()) {
    return state.pairMeta;
  }

  const contract = new ethers.Contract(pair, V2_PAIR_META_ABI, ws.provider);
  const [token0, token1] = await Promise.all([contract.token0(), contract.token1()]);
  state.pairMeta = { pair, token0: String(token0 || ""), token1: String(token1 || "") };
  return state.pairMeta;
}

function pushOptimisticTrade(trade) {
  if (!trade || !trade.txHash) return;
  const tradeKey = [
    String(trade.txHash || ""),
    String(trade.side || ""),
    Number(trade.timestamp || 0),
    Number(trade.blockNumber || 0),
    Number(trade.logIndex || -1),
    String(trade.ethAmountWei || ""),
    String(trade.tokenAmountWei || "")
  ].join(":");
  const exists = state.optimisticTrades.some(
    (row) =>
      [
        String(row.txHash || ""),
        String(row.side || ""),
        Number(row.timestamp || 0),
        Number(row.blockNumber || 0),
        Number(row.logIndex || -1),
        String(row.ethAmountWei || ""),
        String(row.tokenAmountWei || "")
      ].join(":") === tradeKey
  );
  if (!exists) {
    state.optimisticTrades.unshift(trade);
    state.optimisticTrades = state.optimisticTrades.slice(0, 40);
  }

  const marketCapSupply = marketCapSupplyFloat(state.launch);
  if (Number.isFinite(trade.priceEth) && trade.priceEth > 0 && Number.isFinite(marketCapSupply) && marketCapSupply > 0) {
    const point = {
      t: Number(trade.timestamp || Math.floor(Date.now() / 1000)) * 1000,
      price: Number(trade.priceEth),
      mcap: Number(trade.priceEth) * marketCapSupply,
      source: "local"
    };
    state.livePoints.push(point);
  }
  if (state.launch?.pool) {
    state.launch.pool.spotPriceEth = Number(trade.priceEth || state.launch.pool.spotPriceEth || 0);
  }
  state.forceLocalChartUntil = Date.now() + 2 * 60 * 1000;
}

async function parseOptimisticTradeFromReceipt(receipt, fallbackSide = "buy") {
  const ws = walletState();
  if (!ws.provider || !receipt) return null;

  const pair = pairAddressFromState();
  if (!pair) return null;

  const iface = new ethers.Interface(V2_PAIR_SWAP_EVENT_ABI);
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const pairLog = logs.find((log) => String(log?.address || "").toLowerCase() === pair.toLowerCase());
  if (!pairLog) return null;

  let parsed;
  try {
    parsed = iface.parseLog(pairLog);
  } catch {
    return null;
  }
  if (!parsed?.args) return null;

  const meta = await getPairMeta();
  if (!meta) return null;
  const launchToken = String(state.launch?.token || "").toLowerCase();
  const weth = String(state.launch?.pool?.dexWethAddress || "").toLowerCase();
  const token0 = String(meta.token0 || "").toLowerCase();
  const token1 = String(meta.token1 || "").toLowerCase();

  const amount0In = parseBigIntSafe(parsed.args.amount0In);
  const amount1In = parseBigIntSafe(parsed.args.amount1In);
  const amount0Out = parseBigIntSafe(parsed.args.amount0Out);
  const amount1Out = parseBigIntSafe(parsed.args.amount1Out);

  let ethIn = 0n;
  let ethOut = 0n;
  let tokenIn = 0n;
  let tokenOut = 0n;

  if (token0 === weth && token1 === launchToken) {
    ethIn = amount0In;
    ethOut = amount0Out;
    tokenIn = amount1In;
    tokenOut = amount1Out;
  } else if (token1 === weth && token0 === launchToken) {
    ethIn = amount1In;
    ethOut = amount1Out;
    tokenIn = amount0In;
    tokenOut = amount0Out;
  } else if (token0 === launchToken || token1 === launchToken) {
    // Fallback: infer trade direction with launch-token leg even when WETH address
    // wasn't available yet from pool metadata.
    if (token0 === launchToken) {
      tokenIn = amount0In;
      tokenOut = amount0Out;
      ethIn = amount1In;
      ethOut = amount1Out;
    } else {
      tokenIn = amount1In;
      tokenOut = amount1Out;
      ethIn = amount0In;
      ethOut = amount0Out;
    }
  } else {
    return null;
  }

  const side = tokenOut > 0n && ethIn > 0n ? "buy" : tokenIn > 0n && ethOut > 0n ? "sell" : fallbackSide;
  const ethAmountWei = side === "buy" ? ethIn : ethOut;
  const tokenAmountWei = side === "buy" ? tokenOut : tokenIn;
  if (ethAmountWei <= 0n || tokenAmountWei <= 0n) return null;

  const priceWei = (ethAmountWei * 10n ** 18n) / tokenAmountWei;
  const block = await ws.provider.getBlock(Number(receipt.blockNumber || 0));
  const timestamp = Number(block?.timestamp || Math.floor(Date.now() / 1000));

  return {
    side,
    account: String(ws.address || ""),
    txHash: String(receipt.hash || receipt.transactionHash || ""),
    blockNumber: Number(receipt.blockNumber || 0),
    timestamp,
    ethAmountWei: ethAmountWei.toString(),
    tokenAmountWei: tokenAmountWei.toString(),
    priceWei: priceWei.toString(),
    priceEth: Number(ethers.formatUnits(priceWei, 18)),
    source: "local"
  };
}

function buildSyntheticOptimisticTrade({
  side = "buy",
  account = "",
  txHash = "",
  ethAmountWei = 0n,
  tokenAmountWei = 0n,
  timestamp = Math.floor(Date.now() / 1000)
}) {
  const ethAmount = BigInt(ethAmountWei || 0n);
  const tokenAmount = BigInt(tokenAmountWei || 0n);
  const priceWei = tokenAmount > 0n ? (ethAmount * 10n ** 18n) / tokenAmount : 0n;

  return {
    side,
    account: String(account || ""),
    txHash: String(txHash || ""),
    blockNumber: 0,
    timestamp: Number(timestamp || Math.floor(Date.now() / 1000)),
    ethAmountWei: ethAmount.toString(),
    tokenAmountWei: tokenAmount.toString(),
    priceWei: priceWei.toString(),
    priceEth: Number(ethers.formatUnits(priceWei, 18)),
    source: "local"
  };
}

function readSeededLaunch(tokenAddress) {
  const token = normalizeAddress(tokenAddress);
  if (!token) return null;
  try {
    const viewed = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || "[]");
    if (!Array.isArray(viewed)) return null;
    const entry = viewed.find((row) => normalizeAddress(row?.token || row?.tokenAddress || "") === token);
    if (!entry) return null;
    const pool = entry.pool && typeof entry.pool === "object"
      ? entry.pool
      : {
          graduated: false,
          migratedPair: ZERO_ADDRESS,
          dexRouter: ZERO_ADDRESS,
          spotPriceWei: "0",
          effectiveSpotPriceWei: "0",
          spotPriceEth: 0,
          marketCapWei: String(entry.marketCapWei || "0"),
          marketCapEth: 0,
          circulatingSupply: String(entry.totalSupply || "0")
        };
    return {
      id: Number(entry.id || 0),
      token,
      tokenAddress: token,
      poolAddress: String(entry.poolAddress || entry.pool || ""),
      pool: String(entry.poolAddress || entry.pool || ""),
      creator: String(entry.creator || ""),
      name: String(entry.name || "Token"),
      symbol: String(entry.symbol || "TOKEN"),
      imageURI: String(entry.imageURI || ""),
      description: String(entry.description || ""),
      totalSupply: String(entry.totalSupply || pool.circulatingSupply || "0"),
      creatorAllocation: String(entry.creatorAllocation || "0"),
      createdAt: Number(entry.createdAt || Math.floor(Number(entry.ts || Date.now()) / 1000)),
      creatorProfile: entry.creatorProfile || null,
      feeSnapshot: entry.feeSnapshot || {
        creatorClaimableWei: "0",
        creatorClaimedWei: "0",
        platformClaimableWei: "0"
      },
      pool
    };
  } catch {
    return null;
  }
}

function renderSeededLaunch() {
  const seeded = readSeededLaunch(state.token);
  if (!seeded) return false;
  state.launch = seeded;
  state.trades = mergeTradesWithOptimistic(state.trades || []);
  state.gecko = null;
  state.dex = null;
  setTokenHeader(seeded);
  setSideMetrics(seeded);
  appendLivePoint(seeded);
  state.allSeries = buildSeries({ launch: seeded, chart: [] });
  renderTrades(state.trades);
  renderOverview();
  renderTradePanel();
  return true;
}

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const direct =
    params.get("token") ||
    params.get("ca") ||
    params.get("address") ||
    params.get("contract") ||
    params.get("pair") ||
    "";
  if (direct) return direct;

  const pathMatch = window.location.pathname.match(/\/token\/(0x[a-fA-F0-9]{40})/);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const viewed = JSON.parse(localStorage.getItem(RECENT_VIEWED_KEY) || "[]");
    if (Array.isArray(viewed) && viewed[0]?.token) {
      return String(viewed[0].token);
    }
  } catch {
    // ignore local storage parse issues
  }
  return "";
}

function getQuoteModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("quote") || "").toLowerCase() === "usdc" ? "usdc" : "native";
}

function quoteDecimals() {
  return Number(state.quoteAsset?.decimals || (state.quoteMode === "usdc" ? 6 : 18));
}

function quoteSymbol() {
  return String(state.quoteAsset?.symbol || (state.quoteMode === "usdc" ? "USDC" : "ETH"));
}

function isUsdcQuote() {
  return state.quoteMode === "usdc" || String(state.launch?.pool?.quoteMode || "").toLowerCase() === "usdc";
}

async function fetchJsonRaw(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore parse failures
    }
    throw new Error(message);
  }
  return res.json();
}

async function fetchTokenRaw(tokenAddress, options = {}) {
  const params = new URLSearchParams();
  if (options.fresh) params.set("fresh", "1");
  if (options.lite) params.set("lite", "1");
  if (options.chainId) params.set("chainId", String(options.chainId));
  if (options.quote) params.set("quote", String(options.quote));
  if (Number.isFinite(Number(options.launchId))) params.set("launchId", String(Math.floor(Number(options.launchId))));
  const qs = params.toString();
  return fetchJsonRaw(`/api/token/${tokenAddress}${qs ? `?${qs}` : ""}`);
}

function seededLaunchId() {
  const seeded = readSeededLaunch(state.token);
  return Number.isFinite(Number(seeded?.id)) ? Number(seeded.id) : null;
}

async function discoverTokenAcrossChains(tokenAddress) {
  const normalized = normalizeAddress(tokenAddress);
  if (!normalized) return null;

  let cfg;
  try {
    // Intentionally bypass preferred-chain injection so we can see all supported chains.
    cfg = await fetchJsonRaw("/api/config");
  } catch {
    return null;
  }

  const candidates = [];
  const supported = Array.isArray(cfg?.supportedChains) ? cfg.supportedChains : [];
  for (const row of supported) {
    const id = Number(row?.chainId || 0);
    if (Number.isFinite(id) && id > 0 && !candidates.includes(id)) {
      candidates.push(id);
    }
  }
  const cfgChain = Number(cfg?.chainId || 0);
  if (Number.isFinite(cfgChain) && cfgChain > 0 && !candidates.includes(cfgChain)) {
    candidates.unshift(cfgChain);
  }

  for (const chainId of candidates) {
    try {
      const payload = await fetchTokenRaw(normalized, { fresh: true, chainId });
      if (payload?.launch?.token) {
        return { chainId, payload };
      }
    } catch {
      // try next chain
    }
  }

  return null;
}

async function resolveTokenAddressByPoolishAddress(address) {
  const needle = normalizeAddress(address);
  if (!needle) return "";

  const seen = new Set();
  let offset = 0;
  for (let i = 0; i < 8; i++) {
    const page = await api.launches(60, offset);
    const launches = Array.isArray(page?.launches) ? page.launches : [];
    if (!launches.length) break;
    for (const launch of launches) {
      const tokenAddr = normalizeAddress(launch?.token || launch?.tokenAddress || "");
      const pairAddr = normalizeAddress(launch?.pool?.migratedPair || "");
      const poolAddr = normalizeAddress(launch?.poolAddress || launch?.pool || "");
      if (tokenAddr && tokenAddr.toLowerCase() === needle.toLowerCase()) return tokenAddr;
      if (pairAddr && pairAddr.toLowerCase() === needle.toLowerCase()) return tokenAddr || "";
      if (poolAddr && poolAddr.toLowerCase() === needle.toLowerCase()) return tokenAddr || "";
      if (tokenAddr) seen.add(tokenAddr.toLowerCase());
    }
    offset += launches.length;
    if (launches.length < 60) break;
  }
  return "";
}

function circulatingSupplyFloat(launch) {
  const raw = launch?.pool?.circulatingSupply || "0";
  const n = Number(ethers.formatUnits(raw, 18));
  return Number.isFinite(n) ? n : 0;
}

function marketCapSupplyFloat(launch) {
  const candidates = [launch?.totalSupply, launch?.pool?.circulatingSupply];
  for (const raw of candidates) {
    const text = String(raw || "0");
    if (!text || text === "0") continue;
    const n = Number(ethers.formatUnits(text, 18));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function modeValue(point) {
  if (!point) return 0;
  if (state.mode === "price") {
    return Number(point.price || 0);
  }
  return ethToUsd(Number(point.mcap || 0), state.ethUsd);
}

function priceFormat(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "-";
  if (state.mode === "price") {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 12 })} ETH`;
  }
  return formatCompactUsd(n);
}

function volumeFormat(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "-";
  if (state.mode === "price") {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} ETH`;
  }
  return formatCompactUsd(n);
}

function creatorHandle(address) {
  if (!address) return "anon";
  const profile = loadUserProfile(address);
  return profile.username || defaultUsername(address);
}

async function copyText(value) {
  await navigator.clipboard.writeText(String(value || ""));
}

function escapeHtml(input = "") {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function humanAgo(timestampSec) {
  const tsMs = Number(timestampSec || 0) * 1000;
  if (!Number.isFinite(tsMs) || tsMs <= 0) return "-";
  const diff = Date.now() - tsMs;
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function updateTradeQuickTokenLabels(symbol = "TOK") {
  const tokenLabel = String(symbol || "TOK").toUpperCase().slice(0, 6) || "TOK";
  for (const btn of ui.quickTokenButtons || []) {
    const raw = String(btn.dataset.quickToken || "");
    if (raw.endsWith("%")) {
      btn.textContent = raw;
      continue;
    }
    if (raw === "max") {
      btn.textContent = `Max ${tokenLabel}`;
      continue;
    }

    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      btn.textContent = `TOK ${tokenLabel}`;
      continue;
    }

    if (n >= 1_000_000) {
      btn.textContent = `${(n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M ${tokenLabel}`;
    } else if (n >= 1_000) {
      btn.textContent = `${(n / 1_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}K ${tokenLabel}`;
    } else {
      btn.textContent = `${n} ${tokenLabel}`;
    }
  }
}

function setAvatarNode(node, text, imageUri = "") {
  if (!node) return;
  if (imageUri) {
    node.textContent = "";
    node.classList.add("with-image");
    node.style.backgroundImage = `url("${imageUri}")`;
    return;
  }
  node.classList.remove("with-image");
  node.style.backgroundImage = "";
  node.textContent = text;
}

function updateEditAvatarPreview(text = "EP", imageUri = "") {
  setAvatarNode(ui.editAvatarPreview, text, imageUri);
}

function setProfileMenuOpen(open) {
  if (!ui.profileMenu || !ui.profileMenuBtn) return;
  ui.profileMenu.classList.toggle("open", open);
  ui.profileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function updateProfileIdentity() {
  const ws = walletState();
  const evmConnected = Boolean(ws.signer && ws.address);
  const generated = ws.generatedWallet || null;
  const generatedConnected = Boolean(generated?.address);
  const solanaConnected = Boolean(ws.solanaAddress);
  const connected = evmConnected || solanaConnected;
  const profile = evmConnected ? loadUserProfile(ws.address) : { username: "Guest", bio: "", imageUri: "" };
  const generatedName = generatedConnected
    ? String(generated.name || (generated.username ? `@${generated.username}` : "") || generated.email || "")
    : "";
  const username = generatedConnected
    ? generatedName || `sol_${String(generated.address || ws.solanaAddress).slice(0, 6)}`
    : solanaConnected && !evmConnected
      ? `sol_${String(ws.solanaAddress).slice(0, 6)}`
      : evmConnected
        ? profile.username || defaultUsername(ws.address)
        : "Guest";
  const avatarText = generatedConnected && generated?.type === "x"
    ? "X"
    : solanaConnected && !evmConnected
      ? "SOL"
      : connected
        ? username.slice(0, 2).toUpperCase()
        : "EP";
  const imageUri = generatedConnected ? String(generated.image || "") : evmConnected ? profile.imageUri || "" : "";
  const profileHref = evmConnected
    ? `/profile?address=${ws.address}`
    : solanaConnected
      ? `/profile?address=${encodeURIComponent(generated?.address || ws.solanaAddress)}`
      : "/profile";

  if (ui.profileMenuName) ui.profileMenuName.textContent = username;
  if (ui.profileMenuNameLarge) ui.profileMenuNameLarge.textContent = username;
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
  if (!connected) {
    walletHub?.setOpen(false);
    setProfileMenuOpen(false);
  } else if (!evmConnected && !generatedConnected) {
    walletHub?.setOpen(false);
  }
  setAvatarNode(ui.profileAvatar, avatarText, imageUri);
  setAvatarNode(ui.profileAvatarLarge, avatarText, imageUri);

  if (ui.profileNav) {
    ui.profileNav.href = profileHref;
    ui.profileNav.style.display = connected ? "block" : "none";
  }
  if (ui.profileNavSide) {
    ui.profileNavSide.href = profileHref;
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
      const next = walletState();
      if (String(next.address || "").toLowerCase() !== currentAddress.toLowerCase()) return;
      if (ui.profileMenuMeta) {
        ui.profileMenuMeta.textContent = followerMetaText(followersCount);
      }
    }).catch(() => {
      // ignore follower-count hydration failures
    });
    hydrateUserProfile(currentAddress).then(() => {
      const next = walletState();
      if (String(next.address || "").toLowerCase() !== currentAddress.toLowerCase()) return;
      const fresh = loadUserProfile(currentAddress);
      if (fresh.username !== username || String(fresh.imageUri || "") !== String(imageUri || "")) {
        updateProfileIdentity();
        if (state.launch) setTokenHeader(state.launch);
      }
    }).catch(() => {
      // ignore profile hydration failures
    });
  }
}
function hideEditProfileModal() {
  if (!ui.editProfileModal) return;
  ui.editProfileModal.classList.remove("open");
  ui.editProfileModal.setAttribute("aria-hidden", "true");
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
    const open = ui.profileMenu?.classList.contains("open");
    setProfileMenuOpen(!open);
  });

  document.addEventListener("click", (event) => {
    if (!ui.profileMenu || !ui.profileMenuBtn) return;
    if (ui.profileMenu.contains(event.target) || ui.profileMenuBtn.contains(event.target)) return;
    setProfileMenuOpen(false);
  });

  ui.editProfileBtn?.addEventListener("click", () => {
    if (ui.editProfileBtn.disabled) return;
    setProfileMenuOpen(false);
    openEditProfileModal();
  });

  ui.profileShareBtn?.addEventListener("click", async () => {
    const ws = walletState();
    if (!ws.address) return;
    const profileUrl = new URL(`/profile?address=${ws.address}`, window.location.origin).toString();
    try {
      await copyText(profileUrl);
      showCopyToast("Profile link copied");
    } catch {
      setAlert(ui.alert, "Could not copy profile link", true);
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
    setWalletLabel(ui.walletLabel);
    if (ui.disconnectBtn?.style) ui.disconnectBtn.style.display = "none";
    setAlert(ui.alert, "Wallet disconnected");
    setProfileMenuOpen(false);
    updateProfileIdentity();
    walletHub?.refresh();
    refreshWalletBalance().catch(() => {
      // noop
    });
  });
}

function setupEditProfileModal() {
  ui.closeEditProfileModal?.addEventListener("click", hideEditProfileModal);
  ui.editProfileModal?.addEventListener("click", (event) => {
    if (event.target === ui.editProfileModal) {
      hideEditProfileModal();
    }
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
    if (state.launch?.creator?.toLowerCase() === ws.address.toLowerCase()) {
      setTokenHeader(state.launch);
    }
    hideEditProfileModal();
    if (saved?.synced) {
      setAlert(ui.alert, "Profile updated");
    } else {
      setAlert(ui.alert, "Profile saved locally, but cloud sync failed. Check backend env/API.", true);
    }
  });
}

function setTokenHeader(launch) {
  if (!launch) return;
  const creatorAddress = String(launch?.creator || "");
  const creatorProfile = loadUserProfile(creatorAddress);
  const creatorName = creatorProfile.username || creatorHandle(creatorAddress);
  const creatorInitials = creatorName.slice(0, 2).toUpperCase() || "EP";
  const creatorImage = String(creatorProfile.imageUri || "");
  const creatorHref = profileHrefForAddress(creatorAddress);
  const safeCreatorName = escapeHtml(creatorName);
  const safeCreatorImage = escapeHtml(creatorImage);
  const ws = walletState();
  const connectedAddress = String(ws.address || "").toLowerCase();
  const creatorAddressLower = String(creatorAddress || "").toLowerCase();
  const isCreatorViewer = Boolean(connectedAddress && creatorAddressLower && connectedAddress === creatorAddressLower);
  const creatorNameLabel = isCreatorViewer ? `${safeCreatorName} (You)` : safeCreatorName;

  if (ui.tokenTitle) ui.tokenTitle.textContent = launch.name || "Token";
  if (ui.tokenSymbolLine) ui.tokenSymbolLine.textContent = launch?.symbol ? `$${launch.symbol}` : "---";

  if (ui.tokenCreatorInfo) {
    ui.tokenCreatorInfo.innerHTML = `
      <span class="token-creator-avatar ${creatorImage ? "with-image" : ""}" ${creatorImage ? `style="background-image:url('${safeCreatorImage}')"` : ""}>${
        creatorImage ? "" : escapeHtml(creatorInitials)
      }</span>
      <a class="token-creator-link" href="${creatorHref}">${creatorNameLabel}</a>
      <span class="token-creator-sep">&bull;</span>
      <span class="token-creator-time">${humanAgo(launch.createdAt)}</span>
    `;
  }

  if (ui.openCreator) ui.openCreator.href = profileHrefForAddress(launch.creator);
  if (ui.creatorProfileLink) ui.creatorProfileLink.href = profileHrefForAddress(launch.creator);
  if (ui.creatorLabel) ui.creatorLabel.textContent = creatorHandle(launch.creator);
  if (ui.creatorAddressLine) ui.creatorAddressLine.textContent = shortAddress(creatorAddress);
  setAvatarNode(ui.creatorRewardAvatar, creatorInitials, creatorImage);
  if (ui.creatorShare) {
    const claimableUsd = creatorClaimableUsdFromLaunch(launch);
    ui.creatorShare.textContent = `Claimable ${formatCompactUsd(claimableUsd)} · Min $${CLAIM_MIN_USD}`;
    ui.creatorShare.hidden = false;
  }
  if (ui.creatorClaimableUsd || ui.creatorUnclaimedLine || ui.creatorSharePct) {
    const claimableWei = parseBigIntSafe(launch?.feeSnapshot?.creatorClaimableWei || "0");
    const claimableUsd = creatorClaimableUsdFromLaunch(launch);
    const claimableToken = Number(ethers.formatUnits(claimableWei, 18));
    if (ui.creatorClaimableUsd) ui.creatorClaimableUsd.textContent = formatCompactUsd(claimableUsd);
    if (ui.creatorUnclaimedLine) {
      const symbol = String(launch?.symbol || "TOKEN").toUpperCase();
      ui.creatorUnclaimedLine.textContent = `Unclaimed ${formatTradeNumber(claimableToken, 4)} ${symbol}`;
    }
    if (ui.creatorSharePct) ui.creatorSharePct.textContent = "100%";
  }

  if (ui.openCreator) {
    const claimableWei = parseBigIntSafe(launch?.feeSnapshot?.creatorClaimableWei || "0");
    const claimableUsd = creatorClaimableUsdFromLaunch(launch);
    const hasClaimable = claimableWei > 0n;
    const claimReady = hasClaimable && claimableUsd >= CLAIM_MIN_USD;

    if (isCreatorViewer) {
      const disabled = state.creatorClaimPending || !claimReady;
      ui.openCreator.textContent = state.creatorClaimPending
        ? "Claiming..."
          : !hasClaimable
          ? "Nothing to claim"
          : claimReady
            ? "Claim rewards"
            : `Min $${CLAIM_MIN_USD}`;
      ui.openCreator.href = claimReady ? "#" : profileHrefForAddress(launch.creator);
      ui.openCreator.dataset.action = claimReady ? "claim" : "none";
      ui.openCreator.setAttribute("aria-disabled", disabled ? "true" : "false");
      ui.openCreator.classList.toggle("is-disabled", disabled);
    } else {
      ui.openCreator.textContent = "Follow";
      ui.openCreator.href = profileHrefForAddress(launch.creator);
      ui.openCreator.dataset.action = "follow";
      ui.openCreator.removeAttribute("aria-disabled");
      ui.openCreator.classList.remove("is-disabled");
    }
  }

  if (ui.tokenImage) {
    ui.tokenImage.src = resolveCoinImage(launch);
    ui.tokenImage.style.display = "block";
  }
  updateTradeQuickTokenLabels(launch.symbol);

  if (ui.terminalLink) {
    ui.terminalLink.href = "https://trade.padre.gg/";
  }

  if (ui.copyTokenBtn) {
    const copyTarget = String(launch.token || "");
    ui.copyTokenBtn.innerHTML = `${COPY_PILL_ICON}<span>${shortAddress(copyTarget)}</span>`;
  }
  renderCommunityMini();
  recordViewedLaunch(launch);
}
function setSideMetrics(launch) {
  const dexReady = hasDexMarket(launch);
  const bondingReady = hasBondingMarket(launch);
  const progressPct = dexReady ? 100 : Math.max(0, Math.min(100, Number(launch?.pool?.bondingProgressPct || 0)));
  if (ui.bondingProgressLabel) {
    ui.bondingProgressLabel.textContent = dexReady ? "DEX live" : bondingReady ? `${progressPct.toFixed(1)}%` : "Pending";
  }
  if (ui.bondingProgressFill) ui.bondingProgressFill.style.width = `${dexReady ? 100 : Math.max(4, progressPct)}%`;
  if (ui.bondingStatusText) {
    const target = Number(launch?.pool?.graduationTargetEth || 0);
    const reserve = Number(launch?.pool?.ethReserveEth || 0);
    ui.bondingStatusText.textContent = dexReady
      ? "Graduated to Uniswap. Trading now routes through the DEX pair."
      : bondingReady
        ? `${formatTradeNumber(reserve, 4)} / ${formatTradeNumber(target, 4)} ${quoteSymbol()} raised before automatic Uniswap graduation.`
        : "Bonding pool is syncing.";
  }

  const disabled = !hasTradeMarket(launch);
  if (ui.buyBtn) ui.buyBtn.disabled = disabled;
  if (ui.sellBtn) ui.sellBtn.disabled = disabled;
  if (ui.buyInput) ui.buyInput.disabled = disabled;
  if (ui.buyTokenInput) ui.buyTokenInput.disabled = disabled;
  if (ui.sellInput) ui.sellInput.disabled = disabled;
  if (ui.sellEthInput) ui.sellEthInput.disabled = disabled;
}

function appendLivePoint(launch) {
  const price = Number(launch?.pool?.spotPriceEth || 0);
  if (!Number.isFinite(price) || price < 0) return;
  const now = Date.now();
  const marketCapSupply = marketCapSupplyFloat(launch);
  if (!Number.isFinite(marketCapSupply) || marketCapSupply <= 0) return;

  if (!state.livePoints.length) {
    for (let i = 8; i >= 1; i--) {
      state.livePoints.push({
        t: now - i * 15_000,
        price,
        mcap: price * marketCapSupply,
        source: "live"
      });
    }
  }

  const last = state.livePoints[state.livePoints.length - 1];
  const next = { t: now, price, mcap: price * marketCapSupply, source: "live" };
  if (last && now - last.t < 10_000) {
    last.t = next.t;
    last.price = next.price;
    last.mcap = next.mcap;
  } else {
    state.livePoints.push(next);
  }

  if (state.livePoints.length > 500) {
    state.livePoints = state.livePoints.slice(state.livePoints.length - 500);
  }
}

function buildSeries(payload) {
  const launch = payload.launch;
  const marketCapSupply = marketCapSupplyFloat(launch);
  const tradeSeries = (payload.chart || [])
    .map((p) => {
      const t = Number(p.t);
      const price = Number(p.p);
      if (!Number.isFinite(t) || !Number.isFinite(price)) return null;
      return { t, price, mcap: price * marketCapSupply, source: "trade" };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  if (!tradeSeries.length) return [...state.livePoints];

  const lastTradeTs = tradeSeries[tradeSeries.length - 1].t;
  const liveTail = state.livePoints.filter((p) => p.t > lastTradeTs);
  const merged = tradeSeries.concat(liveTail).sort((a, b) => a.t - b.t);

  const deduped = [];
  for (const point of merged) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.t === point.t) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped;
}

function filterSeriesByRange(series) {
  if (!series.length) return [];
  if (state.range === "all") return series;
  const span = RANGE_MS[state.range];
  if (!span) return series;
  const cutoff = Date.now() - span;
  const filtered = series.filter((p) => p.t >= cutoff);
  if (filtered.length >= 2) return filtered;
  const previous = [...series].reverse().find((p) => p.t < cutoff);
  if (previous) return [previous, ...filtered];
  return filtered.length ? filtered : [series[series.length - 1]];
}

function bucketTimeSec(ms, bucketSec) {
  const sec = Math.floor(ms / 1000);
  return Math.floor(sec / bucketSec) * bucketSec;
}

function buildCandles(series) {
  const points = filterSeriesByRange(series);
  if (!points.length) return [];
  const bucketSec = CANDLE_BUCKET_SEC[state.range] || CANDLE_BUCKET_SEC.all;
  const map = new Map();

  for (const point of points) {
    const ts = bucketTimeSec(point.t, bucketSec);
    const value = modeValue(point);
    if (!Number.isFinite(value) || value <= 0) continue;
    const row = map.get(ts);
    if (!row) {
      map.set(ts, { time: ts, open: value, high: value, low: value, close: value });
    } else {
      row.high = Math.max(row.high, value);
      row.low = Math.min(row.low, value);
      row.close = value;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

function buildVolumeBars(trades) {
  const bucketSec = CANDLE_BUCKET_SEC[state.range] || CANDLE_BUCKET_SEC.all;
  const cutoff = state.range === "all" ? 0 : Date.now() - (RANGE_MS[state.range] || RANGE_MS["24h"]);
  const rows = new Map();

  for (const trade of trades || []) {
    const tsMs = Number(trade.timestamp || 0) * 1000;
    if (!tsMs || tsMs < cutoff) continue;
    const time = bucketTimeSec(tsMs, bucketSec);
    const eth = Number(ethers.formatUnits(trade.ethAmountWei || "0", 18));
    if (!Number.isFinite(eth) || eth <= 0) continue;
    const value = state.mode === "price" ? eth : ethToUsd(eth, state.ethUsd);
    const row = rows.get(time) || { buy: 0, sell: 0, value: 0 };
    if (trade.side === "buy") row.buy += value;
    else row.sell += value;
    row.value += value;
    rows.set(time, row);
  }

  return Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, row]) => ({
      time,
      value: row.value,
      color: row.buy >= row.sell ? "rgba(55, 217, 151, 0.65)" : "rgba(255, 107, 138, 0.65)"
    }));
}

function buildTradeMarkers(trades) {
  const bucketSec = CANDLE_BUCKET_SEC[state.range] || CANDLE_BUCKET_SEC.all;
  const cutoff = state.range === "all" ? 0 : Date.now() - (RANGE_MS[state.range] || RANGE_MS["24h"]);
  return [...(trades || [])]
    .filter((trade) => {
      const tsMs = Number(trade.timestamp || 0) * 1000;
      return tsMs && tsMs >= cutoff;
    })
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .slice(-90)
    .map((trade) => {
      const tsMs = Number(trade.timestamp || 0) * 1000;
      const eth = Number(ethers.formatUnits(trade.ethAmountWei || "0", 18));
      const isBuy = trade.side === "buy";
      return {
        time: bucketTimeSec(tsMs, bucketSec),
        position: isBuy ? "belowBar" : "aboveBar",
        color: isBuy ? "#5af0a4" : "#ff6b8a",
        shape: isBuy ? "circle" : "square",
        text: Number.isFinite(eth) && eth >= 0.1 ? eth.toFixed(eth >= 1 ? 1 : 2) : ""
      };
    });
}

function destroyLocalChart() {
  if (state.resizeObserver) {
    state.resizeObserver.disconnect();
    state.resizeObserver = null;
  }
  if (state.chartApi) {
    state.chartApi.remove();
  }
  state.chartApi = null;
  state.candleSeries = null;
  state.volumeSeries = null;
  state.activeChartEmbedUrl = "";
}

function renderGeckoChart(launch) {
  const url = geckoPoolUrl(launch);
  const label = `${launch.symbol || "TOKEN"}/${quoteSymbol()} - GeckoTerminal`;
  if (!url) return false;
  if (!ui.priceChart) return false;

  if (state.activeChartEmbedUrl === url && ui.priceChart.querySelector("iframe")) {
    ui.chartPairLabel.textContent = label;
    return true;
  }

  destroyLocalChart();

  ui.priceChart.innerHTML = `<iframe src="${url}" title="GeckoTerminal chart" style="border:0;width:100%;height:100%" allowfullscreen></iframe>`;
  state.activeChartEmbedUrl = url;
  ui.chartPairLabel.textContent = label;
  ui.chartOpen.textContent = "-";
  ui.chartHigh.textContent = "-";
  ui.chartLow.textContent = "-";
  ui.chartClose.textContent = "-";
  ui.chartVolume.textContent = "-";
  return true;
}

function ensureChart() {
  if (!ui.priceChart || !window.LightweightCharts) return;
  if (state.chartApi) return;

  state.chartApi = window.LightweightCharts.createChart(ui.priceChart, {
    autoSize: true,
    layout: {
      background: { color: "#101114" },
      textColor: "#9ca3af",
      fontFamily: "Sora, Inter, system-ui, sans-serif",
      fontSize: 11
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.045)" },
      horzLines: { color: "rgba(255,255,255,0.055)" }
    },
    crosshair: {
      mode: window.LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: "rgba(126, 240, 176, 0.35)", width: 1, style: 3 },
      horzLine: { color: "rgba(126, 240, 176, 0.35)", width: 1, style: 3 }
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,0.08)",
      scaleMargins: { top: 0.08, bottom: 0.22 }
    },
    timeScale: {
      borderColor: "rgba(255,255,255,0.08)",
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
      barSpacing: 10,
      minBarSpacing: 3
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true
    }
  });

  state.candleSeries = state.chartApi.addCandlestickSeries({
    upColor: "#57e389",
    downColor: "#ff6b6b",
    borderUpColor: "#57e389",
    borderDownColor: "#ff6b6b",
    wickUpColor: "#57e389",
    wickDownColor: "#ff6b6b",
    priceLineColor: "#57e389",
    priceLineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: true
  });

  state.volumeSeries = state.chartApi.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "",
    scaleMargins: { top: 0.78, bottom: 0 },
    base: 0
  });

  if (state.resizeObserver) {
    state.resizeObserver.disconnect();
  }
  state.resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry || !state.chartApi) return;
    state.chartApi.applyOptions({
      width: Math.floor(entry.contentRect.width),
      height: Math.floor(entry.contentRect.height)
    });
  });
  state.resizeObserver.observe(ui.priceChart);
}

function renderChart() {
  const hasLocalSeries = Array.isArray(state.allSeries) && state.allSeries.length > 1;
  const hasLocalTrades = Array.isArray(state.trades) && state.trades.length > 0;
  // Prefer local live chart first for speed/freshness; fall back to Gecko embed only when local data is unavailable.
  if (!hasLocalSeries && !hasLocalTrades && geckoPoolUrl(state.launch)) {
    const rendered = renderGeckoChart(state.launch);
    if (rendered) return;
  }

  if (ui.priceChart && ui.priceChart.querySelector("iframe")) {
    ui.priceChart.innerHTML = "";
    state.activeChartEmbedUrl = "";
  }
  ensureChart();
  if (!state.chartApi || !state.candleSeries || !state.volumeSeries) return;

  const candles = buildCandles(state.allSeries);
  const volumes = buildVolumeBars(state.trades);
  const markers = buildTradeMarkers(state.trades);

  state.chartApi.applyOptions({
    localization: {
      priceFormatter: (value) => priceFormat(value)
    }
  });

  state.candleSeries.setData(candles);
  state.candleSeries.setMarkers(markers);
  state.volumeSeries.setData(volumes);
  if (candles.length > 1) {
    state.chartApi.timeScale().fitContent();
  }

  const latest = candles[candles.length - 1];
  const latestVol = volumes[volumes.length - 1];
  const rangeLabel = String(state.range || "").toUpperCase();
  ui.chartPairLabel.textContent = `${state.launch?.symbol || "TOKEN"}/${quoteSymbol()} ${state.mode === "price" ? `Price (${quoteSymbol()})` : "Market Cap (USD)"} - ${rangeLabel}`;
  ui.chartOpen.textContent = latest ? priceFormat(latest.open) : "-";
  ui.chartHigh.textContent = latest ? priceFormat(latest.high) : "-";
  ui.chartLow.textContent = latest ? priceFormat(latest.low) : "-";
  ui.chartClose.textContent = latest ? priceFormat(latest.close) : "-";
  ui.chartVolume.textContent = latestVol ? volumeFormat(latestVol.value) : "-";
}

function computeDelta(series, field, periodMs) {
  if (!series.length) return null;
  const last = series[series.length - 1];
  const current = Number(last[field]);
  if (!Number.isFinite(current)) return null;

  const targetTs = last.t - periodMs;
  let baseline = series[0];
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].t <= targetTs) {
      baseline = series[i];
      break;
    }
  }

  const base = Number(baseline[field]);
  if (!Number.isFinite(base) || base === 0) return null;

  const diff = current - base;
  const pct = (diff / base) * 100;
  return { diff, pct, current, base };
}

function applyDeltaClass(el, value) {
  if (!el) return;
  el.classList.remove("delta-pos", "delta-neg", "delta-flat");
  if (!Number.isFinite(value) || Math.abs(value) < 0.00001) {
    el.classList.add("delta-flat");
    return;
  }
  el.classList.add(value > 0 ? "delta-pos" : "delta-neg");
}

function renderDelta(el, delta) {
  if (!el) return;
  if (!delta) {
    el.textContent = "-";
    applyDeltaClass(el, NaN);
    return;
  }
  const sign = delta.pct > 0 ? "+" : "";
  el.textContent = `${sign}${delta.pct.toFixed(2)}%`;
  applyDeltaClass(el, delta.pct);
}

function renderOverview() {
  const all = state.allSeries;
  if (!all.length) {
    const geckoMcapUsd = Number(state.gecko?.snapshot?.marketCapUsd || 0);
    const dexMcapRaw = Number(state.dex?.marketCapUsd || geckoMcapUsd || 0);
    const dexLiqUsd = Number(state.dex?.liquidityUsd || state.gecko?.snapshot?.liquidityUsd || 0);
    const poolMcapEth = Number(state.launch?.pool?.marketCapEth || 0);
    const poolEthReserve = Number(state.launch?.pool?.ethReserveEth || 0);
    const graduated = Boolean(state.launch?.pool?.graduated);
    const poolMcapUsd = poolMcapEth > 0 ? ethToUsd(poolMcapEth, state.ethUsd) : 0;
    const dexLooksInflated =
      dexMcapRaw > 0 &&
      poolMcapUsd > 0 &&
      (dexMcapRaw / poolMcapUsd > 25 || (dexLiqUsd > 0 && dexMcapRaw / dexLiqUsd > 2500));
    const dexMcapUsd = dexLooksInflated ? 0 : dexMcapRaw;
    const geckoPriceEth = Number(state.gecko?.snapshot?.priceNative || 0);
    const dexPriceEth = Number(state.dex?.priceNative || geckoPriceEth || state.launch?.pool?.spotPriceEth || 0);
    const hasLiveSignal = dexMcapUsd > 0 || poolMcapUsd > 0 || poolEthReserve > 0 || graduated;
    ui.marketCapHeadline.textContent = !hasLiveSignal ? "Syncing MC" : dexMcapUsd > 0 ? formatCompactUsd(dexMcapUsd) : poolMcapUsd > 0 ? formatCompactUsd(poolMcapUsd) : "-";
    ui.lastPrice.textContent = dexPriceEth > 0 ? formatEthDisplay(dexPriceEth) : "-";
    const raw24hChange = state.dex?.priceChange24hPct ?? state.gecko?.snapshot?.priceChange24hPct;
    const pct24hChange = Number(raw24hChange ?? 0);
    ui.marketCapDelta24h.textContent = Number.isFinite(Number(raw24hChange))
      ? `${pct24hChange > 0 ? "+" : ""}${pct24hChange.toFixed(2)}% 24h`
      : "24h change unavailable yet";
    applyDeltaClass(ui.marketCapDelta24h, pct24hChange);
    const dexVolume24hUsd = Number(state.dex?.volume24hUsd || state.gecko?.snapshot?.volume24hUsd || 0);
    ui.volume24h.textContent = dexVolume24hUsd > 0 ? formatCompactUsd(dexVolume24hUsd) : "-";
    ui.delta5m.textContent = "-";
    ui.delta1h.textContent = "-";
    ui.delta6h.textContent = "-";
    const fallbackMcap = dexMcapUsd > 0 ? dexMcapUsd : poolMcapUsd;
    ui.athFill.style.width = fallbackMcap > 0 ? "100%" : "0%";
    ui.athLabel.textContent = fallbackMcap > 0 ? formatCompactUsd(fallbackMcap) : "-";
    renderChart();
    return;
  }

  const last = all[all.length - 1];
  const lastMcapUsd = ethToUsd(last.mcap, state.ethUsd);
  ui.marketCapHeadline.textContent = formatCompactUsd(lastMcapUsd);
  const latestPriceEth = Number(last.price || 0) > 0 ? Number(last.price || 0) : Number(state.dex?.priceNative || state.gecko?.snapshot?.priceNative || 0);
  ui.lastPrice.textContent = latestPriceEth > 0 ? formatEthDisplay(latestPriceEth) : "-";

  const d5 = computeDelta(all, "mcap", RANGE_MS["5m"]);
  const d1h = computeDelta(all, "mcap", RANGE_MS["1h"]);
  const d6h = computeDelta(all, "mcap", RANGE_MS["6h"]);
  const d24 = computeDelta(all, "mcap", RANGE_MS["24h"]);
  renderDelta(ui.delta5m, d5);
  renderDelta(ui.delta1h, d1h);
  renderDelta(ui.delta6h, d6h);

  if (d24) {
    const diffUsd = ethToUsd(d24.diff, state.ethUsd);
    const sign = diffUsd >= 0 ? "+" : "-";
    ui.marketCapDelta24h.textContent = `${sign}${formatCompactUsd(Math.abs(diffUsd))} (${d24.pct > 0 ? "+" : ""}${d24.pct.toFixed(2)}%) 24h`;
    applyDeltaClass(ui.marketCapDelta24h, d24.pct);
  } else {
    ui.marketCapDelta24h.textContent = "24h change unavailable yet";
    applyDeltaClass(ui.marketCapDelta24h, NaN);
  }

  const nowSec = Date.now() / 1000;
  const volume24hEth = (state.trades || []).reduce((sum, trade) => {
    if (Number(trade.timestamp || 0) < nowSec - 24 * 60 * 60) return sum;
    const eth = Number(ethers.formatUnits(trade.ethAmountWei || "0", 18));
    return sum + (Number.isFinite(eth) ? eth : 0);
  }, 0);
  const tradeVolume24hUsd = ethToUsd(volume24hEth, state.ethUsd);
  const dexVolume24hUsd = Number(state.dex?.volume24hUsd || state.gecko?.snapshot?.volume24hUsd || 0);
  const volume24hUsd = tradeVolume24hUsd > 0 ? tradeVolume24hUsd : dexVolume24hUsd;
  ui.volume24h.textContent = volume24hUsd > 0 ? formatCompactUsd(volume24hUsd) : "$0";

  const ath = all.reduce((max, row) => Math.max(max, ethToUsd(row.mcap, state.ethUsd)), 0);
  const fillPct = ath > 0 ? Math.max(0, Math.min(100, (lastMcapUsd / ath) * 100)) : 0;
  ui.athFill.style.width = `${fillPct.toFixed(2)}%`;
  ui.athLabel.textContent = formatCompactUsd(ath || lastMcapUsd || 0);

  renderChart();
}

function renderTopHolders(list) {
  if (!ui.topHoldersList) return;
  if (!Array.isArray(list) || !list.length) {
    ui.topHoldersList.innerHTML = `<p class="muted">No holder data yet.</p>`;
    return;
  }

  ui.topHoldersList.innerHTML = list
    .slice(0, 20)
    .map((row) => {
      const label = row.label === "Creator" ? creatorHandle(row.address) : shortAddress(row.address);
      return `
        <a class="tokenpf-holder-row" href="${profileHrefForAddress(row.address)}">
          <span>${label}</span>
          <b>${Number(row.pct || 0).toFixed(2)}%</b>
        </a>
      `;
    })
    .join("");
}

function renderCommunityMini() {
  const token = String(state.launch?.token || state.token || "");
  const symbol = String(state.launch?.symbol || "coin").toUpperCase();
  const posts = Array.isArray(state.community?.posts) ? state.community.posts : [];
  const stats = state.community?.stats || {};
  const href = token ? `/communities/${encodeURIComponent(token)}` : "/communities";
  if (ui.communityNavSide) ui.communityNavSide.href = href;
  if (ui.visitCommunityBtn) ui.visitCommunityBtn.href = href;
  if (ui.communityMiniTitle) ui.communityMiniTitle.textContent = `$${symbol} community`;
  if (ui.communityMiniMeta) {
    const posts24h = Number(stats.posts24h || 0);
    const total = Number(stats.posts || posts.length || 0);
    ui.communityMiniMeta.textContent = `${posts24h} posts in the last 24h · ${total} total`;
  }
  if (!ui.communityMiniPreview) return;
  const first = posts[0];
  if (!first) {
    ui.communityMiniPreview.innerHTML = `<p class="muted">Connect X and start the first post for this coin.</p>`;
    return;
  }
  const author = first.xHandle ? `@${escapeHtml(first.xHandle)}` : shortAddress(first.author);
  ui.communityMiniPreview.innerHTML = `
    <div class="token-community-mini-post">
      <span>${author}</span>
      <p>${escapeHtml(first.body)}</p>
    </div>
  `;
}

async function refreshCommunityMini() {
  if (!state.token) return;
  try {
    state.community = await api.community(state.token, 3);
  } catch {
    state.community = { posts: [], stats: { posts: 0, posts24h: 0 } };
  }
  renderCommunityMini();
}

function tradeFilterThreshold() {
  const enabled = Boolean(ui.tradeFilterEnabled?.checked);
  if (!enabled) return 0;
  const min = Number(ui.tradeFilterMin?.value || 0);
  return Number.isFinite(min) && min > 0 ? min : 0;
}

function renderTrades(trades) {
  if (!ui.tradeTable) return;
  ui.tradeTable.innerHTML = "";
  const minEth = tradeFilterThreshold();
  const filtered = (trades || []).filter((trade) => {
    const eth = Number(ethers.formatUnits(trade.ethAmountWei || "0", 18));
    if (!Number.isFinite(eth)) return false;
    return eth >= minEth;
  });

  if (!filtered.length) {
    const emptyMsg = hasDexMarket(state.launch)
      ? "No indexed swaps yet. New pools can take ~30-120s to fully index."
      : "No recent trades yet.";
    ui.tradeTable.innerHTML = `<tr><td colspan="6" class="muted">${emptyMsg}</td></tr>`;
    return;
  }

  const txBase = state.explorerBaseUrl || "";
  for (const trade of filtered.slice(0, 60)) {
    const tr = document.createElement("tr");
    const txHref = txBase ? `${txBase}/tx/${trade.txHash}` : "#";
    const account = trade.account ? shortAddress(trade.account) : "unknown";
    tr.innerHTML = `
      <td><a href="${trade.account ? profileHrefForAddress(trade.account) : "#"}">${account}</a></td>
      <td><span class="badge ${trade.side}">${trade.side}</span></td>
      <td>${formatEth(trade.ethAmountWei, 6)}</td>
      <td>${formatToken(trade.tokenAmountWei, 18, 2)}</td>
      <td>${new Date(Number(trade.timestamp || 0) * 1000).toLocaleTimeString()}</td>
      <td>${txBase ? `<a href="${txHref}" target="_blank" rel="noopener">tx</a>` : shortAddress(trade.txHash)}</td>
    `;
    ui.tradeTable.appendChild(tr);
  }
}

function activateButtons(buttons, key, value) {
  for (const button of buttons) {
    if (button.dataset[key] === value) button.classList.add("active");
    else button.classList.remove("active");
  }
}

function setTradeTab(isBuy) {
  state.isBuyTab = isBuy;
  ui.buyTabBtn?.classList.toggle("active", isBuy);
  ui.sellTabBtn?.classList.toggle("active", !isBuy);
  if (ui.buyFields && ui.buyBtn) {
    ui.buyFields.style.display = isBuy ? "grid" : "none";
    ui.buyBtn.style.display = isBuy ? "block" : "none";
  }
  if (ui.sellFields && ui.sellBtn) {
    ui.sellFields.style.display = isBuy ? "none" : "grid";
    ui.sellBtn.style.display = isBuy ? "none" : "block";
  }
  renderTradePanel();
}

async function refreshWalletBalance() {
  const ws = walletState();
  if (!ws.signer || !ws.address || !ws.provider) {
    ui.walletBalance.textContent = "Not connected";
    if (ui.walletBalanceUsd) ui.walletBalanceUsd.textContent = "($0)";
    renderTradePanel();
    return;
  }
  try {
    let balance = await ws.provider.getBalance(ws.address);
    let balanceDecimals = 18;
    let balanceSymbol = "ETH";
    let usdBalance = ethToUsd(Number(ethers.formatUnits(balance, 18)), state.ethUsd);
    if (isUsdcQuote() && state.quoteAsset?.address) {
      const quote = new ethers.Contract(state.quoteAsset.address, TOKEN_ABI, ws.signer);
      balance = await quote.balanceOf(ws.address);
      balanceDecimals = quoteDecimals();
      balanceSymbol = quoteSymbol();
      usdBalance = Number(ethers.formatUnits(balance, balanceDecimals));
    }
    ui.walletBalance.textContent = `${formatAmountForInput(balance, balanceDecimals, 4)} ${balanceSymbol}`;
    if (ui.walletBalanceUsd) ui.walletBalanceUsd.textContent = `(${formatCompactUsd(usdBalance)})`;
  } catch {
    ui.walletBalance.textContent = "Unavailable";
    if (ui.walletBalanceUsd) ui.walletBalanceUsd.textContent = "";
  }
  renderTradePanel();
}

function renderTradePanel() {
  const symbol = String(state.launch?.symbol || "TOKEN").toUpperCase();
  const qSymbol = quoteSymbol();
  const qUsd = isUsdcQuote() ? 1 : state.ethUsd;
  const buyEth = toPositiveNumber(ui.buyInput?.value);
  const buyToken = toPositiveNumber(ui.buyTokenInput?.value);
  const sellToken = toPositiveNumber(ui.sellInput?.value);
  const sellEth = toPositiveNumber(ui.sellEthInput?.value);

  if (state.isBuyTab) {
    if (ui.tradePrimaryAmount) ui.tradePrimaryAmount.textContent = formatTradeNumber(buyEth, 6);
    if (ui.tradePrimaryUnit) ui.tradePrimaryUnit.textContent = qSymbol;
    if (ui.tradeApproxLine) {
      ui.tradeApproxLine.textContent = `~ ${formatCompactUsd(buyEth * qUsd)} · ~ ${formatTradeNumber(
        buyToken,
        4
      )} ${symbol}`;
    }
    if (ui.tradeReceiveLine) ui.tradeReceiveLine.textContent = `You receive ˜ ${formatTradeNumber(buyToken, 4)} ${symbol}`;
    if (ui.buyBtn) ui.buyBtn.textContent = buyEth > 0 ? `Buy ${formatTradeNumber(buyEth, 6)} ${qSymbol}` : "Enter amount to buy";
  } else {
    if (ui.tradePrimaryAmount) ui.tradePrimaryAmount.textContent = formatTradeNumber(sellToken, 4);
    if (ui.tradePrimaryUnit) ui.tradePrimaryUnit.textContent = symbol;
    if (ui.tradeApproxLine) {
      ui.tradeApproxLine.textContent = `~ ${formatCompactUsd(sellEth * qUsd)} · ~ ${formatTradeNumber(
        sellEth,
        6
      )} ${qSymbol}`;
    }
    if (ui.tradeReceiveLine) ui.tradeReceiveLine.textContent = `You receive ˜ ${formatTradeNumber(sellEth, 6)} ${qSymbol}`;
    if (ui.sellBtn) ui.sellBtn.textContent = sellToken > 0 ? `Sell ${formatTradeNumber(sellToken, 4)} ${symbol}` : "Enter amount to sell";
  }
}

function setupChartControls() {
  for (const button of ui.modeButtons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (!mode || (mode !== "mcap" && mode !== "price")) return;
      state.mode = mode;
      activateButtons(ui.modeButtons, "mode", mode);
      renderOverview();
    });
  }

  for (const button of ui.rangeButtons) {
    button.addEventListener("click", () => {
      const range = button.dataset.range;
      if (!range) return;
      state.range = range;
      activateButtons(ui.rangeButtons, "range", range);
      renderOverview();
    });
  }
}

function setupInteractions() {
  ui.tradeFilterEnabled?.addEventListener("change", () => renderTrades(state.trades));
  ui.tradeFilterMin?.addEventListener("input", () => renderTrades(state.trades));

  ui.buyTabBtn?.addEventListener("click", () => setTradeTab(true));
  ui.sellTabBtn?.addEventListener("click", () => setTradeTab(false));

  ui.buyInput?.addEventListener("input", () => {
    queueTradeSync("buyFromEth", syncBuyTokenFromEth);
    renderTradePanel();
  });

  ui.buyTokenInput?.addEventListener("input", () => {
    queueTradeSync("buyFromToken", syncBuyEthFromToken);
    renderTradePanel();
  });

  ui.sellInput?.addEventListener("input", () => {
    queueTradeSync("sellFromToken", syncSellEthFromToken);
    renderTradePanel();
  });

  ui.sellEthInput?.addEventListener("input", () => {
    queueTradeSync("sellFromEth", syncSellTokenFromEth);
    renderTradePanel();
  });

  ui.quickEthButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = String(btn.dataset.quickEth || "");
      if (!value) return;

      if (value === "max" && state.isBuyTab) {
        try {
          const balance = await getWalletEthBalanceWei();
          const raw = Number(ethers.formatEther(balance));
          const v = Math.max(0, raw - 0.003);
          ui.buyInput.value = v > 0 ? v.toFixed(4) : "0";
          await syncBuyTokenFromEth();
          renderTradePanel();
        } catch {
          // ignore
        }
        return;
      }

      if (value === "max" && !state.isBuyTab) {
        try {
          const tokenBalance = await getWalletTokenBalanceWei();
          ui.sellInput.value = formatAmountForInput(tokenBalance, 18, 4);
          await syncSellEthFromToken();
          renderTradePanel();
        } catch {
          // ignore
        }
        return;
      }

      if (state.isBuyTab) {
        ui.buyInput.value = value;
        await syncBuyTokenFromEth();
        renderTradePanel();
      } else {
        if (ui.sellEthInput) {
          ui.sellEthInput.value = value;
        }
        await syncSellTokenFromEth();
        renderTradePanel();
      }
    });
  });

  ui.quickTokenButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = String(btn.dataset.quickToken || "");
      if (!value) return;

      if (value.endsWith("%")) {
        const pct = Number(value.replace("%", ""));
        if (Number.isFinite(pct) && pct > 0) {
          if (state.isBuyTab) {
            try {
              const balance = await getWalletEthBalanceWei();
              const raw = Number(ethers.formatEther(balance));
              const v = Math.max(0, (raw * pct) / 100 - 0.003);
              ui.buyInput.value = v > 0 ? v.toFixed(6) : "0";
              await syncBuyTokenFromEth();
              renderTradePanel();
            } catch {
              // ignore
            }
          } else {
            try {
              const tokenBalance = await getWalletTokenBalanceWei();
              const scaled = (tokenBalance * BigInt(Math.round(pct * 100))) / 10000n;
              ui.sellInput.value = formatAmountForInput(scaled, 18, 4);
              await syncSellEthFromToken();
              renderTradePanel();
            } catch {
              // ignore
            }
          }
        }
        return;
      }

      if (value === "max" && state.isBuyTab) {
        try {
          const balance = await getWalletEthBalanceWei();
          const raw = Number(ethers.formatEther(balance));
          const v = Math.max(0, raw - 0.003);
          ui.buyInput.value = v > 0 ? v.toFixed(4) : "0";
          await syncBuyTokenFromEth();
          renderTradePanel();
        } catch {
          // ignore
        }
        return;
      }

      if (value === "max" && !state.isBuyTab) {
        try {
          const tokenBalance = await getWalletTokenBalanceWei();
          ui.sellInput.value = formatAmountForInput(tokenBalance, 18, 4);
          await syncSellEthFromToken();
          renderTradePanel();
        } catch {
          // ignore
        }
        return;
      }

      if (state.isBuyTab) {
        if (ui.buyTokenInput) {
          ui.buyTokenInput.value = value;
        }
        await syncBuyEthFromToken();
        renderTradePanel();
      } else {
        ui.sellInput.value = value;
        await syncSellEthFromToken();
        renderTradePanel();
      }
    });
  });

  ui.tradeMaxBtn?.addEventListener("click", async () => {
    try {
      if (state.isBuyTab) {
        const balance = await getWalletEthBalanceWei();
        const raw = Number(ethers.formatEther(balance));
        const v = Math.max(0, raw - 0.003);
        ui.buyInput.value = v > 0 ? v.toFixed(6) : "0";
        await syncBuyTokenFromEth();
      } else {
        const tokenBalance = await getWalletTokenBalanceWei();
        ui.sellInput.value = formatAmountForInput(tokenBalance, 18, 4);
        await syncSellEthFromToken();
      }
      renderTradePanel();
    } catch {
      // ignore
    }
  });

  ui.shareTokenBtn?.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await copyText(url);
      setAlert(ui.alert, "Token URL copied");
    } catch {
      setAlert(ui.alert, "Could not copy URL", true);
    }
  });

  ui.copyTokenBtn?.addEventListener("click", async () => {
    const targetAddress = state.launch?.token;
    if (!targetAddress) return;
    try {
      await copyText(targetAddress);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(ui.alert, "Could not copy address", true);
    }
  });

  ui.openCreator?.addEventListener("click", async (event) => {
    const action = String(ui.openCreator?.dataset.action || "");
    if (action !== "claim") return;
    event.preventDefault();
    await onClaimCreatorRewards();
  });
}

async function onClaimCreatorRewards() {
  if (state.creatorClaimPending) return;
  try {
    const ws = walletState();
    if (!ws.signer || !ws.address) throw new Error("Connect wallet first");
    if (!state.launch?.token) throw new Error("Token data unavailable");
    const creator = String(state.launch?.creator || "").toLowerCase();
    const connected = String(ws.address || "").toLowerCase();
    if (!creator || connected !== creator) throw new Error("Only the token creator can claim rewards");
    await ensurePumpRHolderPaymentAccess(ws.address);
    const claimableWei = parseBigIntSafe(state.launch?.feeSnapshot?.creatorClaimableWei || "0");
    if (claimableWei <= 0n) throw new Error("No creator rewards to claim yet");
    const claimableUsd = creatorClaimableUsdFromLaunch(state.launch);
    if (claimableUsd < CLAIM_MIN_USD) {
      throw new Error(`Minimum claim is $${CLAIM_MIN_USD} equivalent`);
    }

    state.creatorClaimPending = true;
    setTokenHeader(state.launch);
    setAlert(ui.alert, "Claiming creator rewards...");

    const token = makeTokenContract(state.launch.token);
    const tx = await sendTxWithFallback({
      label: "Claim Creator Rewards",
      populatedTx: token.claimCreatorFees.populateTransaction(),
      walletNativeSend: () => token.claimCreatorFees()
    });
    await tx.wait();

    setAlert(ui.alert, "Creator rewards claimed");
    await loadTokenPage(true, false);
  } catch (err) {
    setAlert(ui.alert, parseUiError(err), true);
  } finally {
    state.creatorClaimPending = false;
    if (state.launch) setTokenHeader(state.launch);
  }
}

async function loadTokenPage(forceFresh = false, lite = false) {
  if (!state.token) throw new Error("Missing token query parameter");
  let payload;
  try {
    // Always try chain-agnostic fetch first so stale preferred-chain state doesn't blank token page.
    payload = await fetchTokenRaw(state.token, {
      fresh: forceFresh,
      lite,
      launchId: seededLaunchId(),
      chainId: state.chainId,
      quote: state.quoteMode
    });
  } catch (err) {
    // First, attempt a chain-agnostic recovery for any token-load failure.
    // This fixes stale preferred-chain cases where the token exists on a different chain.
    const discoveredAny = await discoverTokenAcrossChains(state.token).catch(() => null);
    if (discoveredAny?.payload) {
      state.chainId = discoveredAny.chainId;
      setPreferredChainId(discoveredAny.chainId);
      if (ui.netChip) ui.netChip.textContent = `Chain ${discoveredAny.chainId}`;
      payload = discoveredAny.payload;
    } else {
    const text = String(err?.message || "").toLowerCase();
    const recoverable = text.includes("token launch not found") || text.includes("invalid token address") || text.includes("http 404");
    if (!recoverable) throw err;
    const resolved = await resolveTokenAddressByPoolishAddress(state.token);
    if (!resolved) {
      const discovered = await discoverTokenAcrossChains(state.token);
      if (!discovered?.payload) throw err;
      state.chainId = discovered.chainId;
      setPreferredChainId(discovered.chainId);
      if (ui.netChip) ui.netChip.textContent = `Chain ${discovered.chainId}`;
      payload = discovered.payload;
    } else {
      state.token = resolved;
      const next = new URL(window.location.href);
      next.searchParams.set("token", resolved);
      window.history.replaceState({}, "", next.toString());
      try {
        payload = await fetchTokenRaw(state.token, {
          fresh: forceFresh,
          lite,
          launchId: seededLaunchId(),
          chainId: state.chainId,
          quote: state.quoteMode
        });
      } catch {
        const discovered = await discoverTokenAcrossChains(state.token);
        if (!discovered?.payload) throw err;
        state.chainId = discovered.chainId;
        setPreferredChainId(discovered.chainId);
        if (ui.netChip) ui.netChip.textContent = `Chain ${discovered.chainId}`;
        payload = discovered.payload;
      }
    }
    }
  }
  if (payload?.launch?.creator) {
    const payloadQuote = payload?.launch?.pool?.quoteAsset || null;
    if (payloadQuote) {
      state.quoteAsset = payloadQuote;
      state.quoteMode = String(payloadQuote.mode || state.quoteMode || "native").toLowerCase() === "usdc" ? "usdc" : "native";
    }
    const ws = walletState();
    const creatorAddress = String(payload.launch.creator || "");
    const forceCreatorProfile =
      Boolean(forceFresh) ||
      (Boolean(ws.address) && String(ws.address || "").toLowerCase() === creatorAddress.toLowerCase());
    try {
      await hydrateUserProfiles([creatorAddress], { force: forceCreatorProfile });
      payload.launch.creatorProfile = loadUserProfile(creatorAddress);
    } catch {
      payload.launch.creatorProfile = payload.launch.creatorProfile || loadUserProfile(creatorAddress);
    }
  }
  const previousTrades = Array.isArray(state.trades) ? state.trades : [];
  const previousSeries = Array.isArray(state.allSeries) ? state.allSeries : [];
  state.launch = payload.launch;
  const incomingTrades = Array.isArray(payload.trades) ? payload.trades : [];
  const shouldReplaceTrades = Boolean(forceFresh && incomingTrades.length) || !lite || incomingTrades.length || !previousTrades.length;
  if (shouldReplaceTrades) {
    state.trades = mergeTradesWithOptimistic(incomingTrades);
  } else {
    state.trades = mergeTradesWithOptimistic(previousTrades);
  }
  if (Array.isArray(payload.topHolders)) {
    state.topHolders = payload.topHolders;
  }
  state.gecko = payload.gecko || null;
  state.dex = payload.dex || null;

  setTokenHeader(payload.launch);
  setSideMetrics(payload.launch);
  renderTrades(state.trades);
  if (!lite) {
    renderTopHolders(state.topHolders);
  }

  appendLivePoint(payload.launch);
  const incomingChart = Array.isArray(payload.chart) ? payload.chart : [];
  if (incomingChart.length || !lite || !previousSeries.length || forceFresh) {
    state.allSeries = buildSeries(payload);
  } else {
    state.allSeries = previousSeries;
  }
  if (!lite) {
    state.lastFullRefreshAt = Date.now();
  }
  renderOverview();
  await refreshWalletBalance();
  renderTradePanel();
  if (!lite) {
    refreshCommunityMini().catch(() => {
      // community preview is best-effort
    });
  }
}


async function refreshTokenFull(forceFresh = true) {
  if (state.fullRefreshInFlight) return;
  state.fullRefreshInFlight = true;
  try {
    await loadTokenPage(forceFresh, false);
  } finally {
    state.fullRefreshInFlight = false;
  }
}
async function refreshEthUsd(force = false) {
  const price = await fetchEthUsdPrice(force);
  if (Number.isFinite(price) && price > 0) {
    state.ethUsd = price;
  }
}

async function resolveDexPathBuy() {
  const routerAddress = state.launch?.pool?.dexRouter;
  if (!routerAddress || String(routerAddress).toLowerCase() === ZERO_ADDRESS) {
    throw new Error("DEX router unavailable for this token");
  }
  const router = makeRouterContract(routerAddress);
  const weth = await router.WETH();
  return { router, path: [weth, state.launch.token] };
}

async function resolveDexPathSell() {
  const routerAddress = state.launch?.pool?.dexRouter;
  if (!routerAddress || String(routerAddress).toLowerCase() === ZERO_ADDRESS) {
    throw new Error("DEX router unavailable for this token");
  }
  const router = makeRouterContract(routerAddress);
  const weth = await router.WETH();
  return { router, path: [state.launch.token, weth] };
}

async function getWalletEthBalanceWei() {
  const ws = walletState();
  if (!ws.signer || !ws.address || !ws.provider) return 0n;
  return ws.provider.getBalance(ws.address);
}

async function getWalletTokenBalanceWei() {
  const ws = walletState();
  if (!ws.signer || !ws.address || !state.launch?.token) return 0n;
  const token = makeTokenContract(state.launch.token);
  return token.balanceOf(ws.address);
}

async function syncBuyTokenFromEth() {
  const raw = String(ui.buyInput?.value || "").trim();
  if (!raw) {
    if (ui.buyTokenInput) ui.buyTokenInput.value = "";
    renderTradePanel();
    return;
  }

  try {
    const ethIn = parseUnitsSafe(raw, quoteDecimals());
    if (ethIn <= 0n) throw new Error("invalid eth");
    if (hasBondingMarket(state.launch)) {
      const pool = makePoolContract(poolAddressFromLaunch());
      const quoted = await pool.quoteBuy(ethIn);
      if (ui.buyTokenInput) {
        ui.buyTokenInput.value = formatAmountForInput(quoted?.[0] || 0n, 18, 4);
      }
      renderTradePanel();
      return;
    }
    const { router, path } = await resolveDexPathBuy();
    const quoted = await router.getAmountsOut(ethIn, path);
    if (ui.buyTokenInput) {
      ui.buyTokenInput.value = formatAmountForInput(quoted?.[1] || 0n, 18, 4);
    }
    renderTradePanel();
  } catch {
    const price = spotPriceWei();
    if (!ui.buyTokenInput || price <= 0n) {
      if (ui.buyTokenInput) ui.buyTokenInput.value = "";
      renderTradePanel();
      return;
    }
    try {
      const ethIn = parseUnitsSafe(raw, quoteDecimals());
      if (ethIn <= 0n) throw new Error("invalid eth");
      const approxTokenOut = (ethIn * 10n ** 18n) / price;
      ui.buyTokenInput.value = formatAmountForInput(approxTokenOut, 18, 4);
      renderTradePanel();
    } catch {
      ui.buyTokenInput.value = "";
      renderTradePanel();
    }
  }
}

async function syncBuyEthFromToken() {
  const raw = String(ui.buyTokenInput?.value || "").trim();
  if (!raw) {
    ui.buyInput.value = "";
    renderTradePanel();
    return;
  }

  try {
    const tokenOut = parseUnitsSafe(raw, 18);
    if (tokenOut <= 0n) throw new Error("invalid token");
    if (hasBondingMarket(state.launch)) {
      const price = spotPriceWei();
      if (price <= 0n) throw new Error("price unavailable");
      const grossEth = (tokenOut * price) / 10n ** 18n;
      const feeBps = BigInt(Number(state.launch?.pool?.feeBps || 0));
      const feeDenom = 10000n;
      const ethIn = feeBps > 0n ? (grossEth * feeDenom + (feeDenom - feeBps - 1n)) / (feeDenom - feeBps) : grossEth;
      ui.buyInput.value = formatAmountForInput(ethIn, quoteDecimals(), 6);
      renderTradePanel();
      return;
    }
    const { router, path } = await resolveDexPathBuy();
    const quotedIn = await router.getAmountsIn(tokenOut, path);
    ui.buyInput.value = formatAmountForInput(quotedIn?.[0] || 0n, 18, 6);
    renderTradePanel();
  } catch {
    const price = spotPriceWei();
    if (price <= 0n) {
      ui.buyInput.value = "";
      renderTradePanel();
      return;
    }
    try {
      const tokenOut = parseUnitsSafe(raw, 18);
      if (tokenOut <= 0n) throw new Error("invalid token");
      const approxEthIn = (tokenOut * price) / 10n ** 18n;
      ui.buyInput.value = formatAmountForInput(approxEthIn, quoteDecimals(), 6);
      renderTradePanel();
    } catch {
      ui.buyInput.value = "";
      renderTradePanel();
    }
  }
}

async function syncSellEthFromToken() {
  const raw = String(ui.sellInput?.value || "").trim();
  if (!raw) {
    if (ui.sellEthInput) ui.sellEthInput.value = "";
    renderTradePanel();
    return;
  }

  try {
    const tokenIn = parseUnitsSafe(raw, 18);
    if (tokenIn <= 0n) throw new Error("invalid token");
    if (hasBondingMarket(state.launch)) {
      const pool = makePoolContract(poolAddressFromLaunch());
      const quoted = await pool.quoteSell(tokenIn);
      if (ui.sellEthInput) {
        ui.sellEthInput.value = formatAmountForInput(quoted?.[0] || 0n, quoteDecimals(), 6);
      }
      renderTradePanel();
      return;
    }
    const { router, path } = await resolveDexPathSell();
    const quotedOut = await router.getAmountsOut(tokenIn, path);
    if (ui.sellEthInput) {
      ui.sellEthInput.value = formatAmountForInput(quotedOut?.[1] || 0n, 18, 6);
    }
    renderTradePanel();
  } catch {
    const price = spotPriceWei();
    if (!ui.sellEthInput || price <= 0n) {
      if (ui.sellEthInput) ui.sellEthInput.value = "";
      renderTradePanel();
      return;
    }
    try {
      const tokenIn = parseUnitsSafe(raw, 18);
      if (tokenIn <= 0n) throw new Error("invalid token");
      const approxEthOut = (tokenIn * price) / 10n ** 18n;
      ui.sellEthInput.value = formatAmountForInput(approxEthOut, quoteDecimals(), 6);
      renderTradePanel();
    } catch {
      ui.sellEthInput.value = "";
      renderTradePanel();
    }
  }
}

async function syncSellTokenFromEth() {
  const raw = String(ui.sellEthInput?.value || "").trim();
  if (!raw) {
    ui.sellInput.value = "";
    renderTradePanel();
    return;
  }

  try {
    const ethOut = parseUnitsSafe(raw, quoteDecimals());
    if (ethOut <= 0n) throw new Error("invalid eth");
    if (hasBondingMarket(state.launch)) {
      const price = spotPriceWei();
      if (price <= 0n) throw new Error("price unavailable");
      const tokenIn = (ethOut * 10n ** 18n) / price;
      ui.sellInput.value = formatAmountForInput(tokenIn, 18, 4);
      renderTradePanel();
      return;
    }
    const { router, path } = await resolveDexPathSell();
    const quotedIn = await router.getAmountsIn(ethOut, path);
    ui.sellInput.value = formatAmountForInput(quotedIn?.[0] || 0n, 18, 4);
    renderTradePanel();
  } catch {
    const price = spotPriceWei();
    if (price <= 0n) {
      ui.sellInput.value = "";
      renderTradePanel();
      return;
    }
    try {
      const ethOut = parseUnitsSafe(raw, quoteDecimals());
      if (ethOut <= 0n) throw new Error("invalid eth");
      const approxTokenIn = (ethOut * 10n ** 18n) / price;
      ui.sellInput.value = formatAmountForInput(approxTokenIn, 18, 4);
      renderTradePanel();
    } catch {
      ui.sellInput.value = "";
      renderTradePanel();
    }
  }
}

async function onBuy() {
  try {
    if (!walletState().signer) throw new Error("Connect wallet first");
    if (!hasTradeMarket(state.launch)) throw new Error("Trading is not ready yet");
    if (!String(ui.buyInput.value || "").trim() && String(ui.buyTokenInput?.value || "").trim()) {
      await syncBuyEthFromToken();
    }
    const amount = ui.buyInput.value.trim();
    if (!amount) throw new Error(`Enter ${quoteSymbol()} amount`);

    const ethIn = parseUnitsSafe(amount, quoteDecimals());
    if (ethIn <= 0n) throw new Error("Amount must be > 0");

    const ws = walletState();
    if (hasBondingMarket(state.launch)) {
      const pool = makePoolContract(poolAddressFromLaunch());
      const quoted = await pool.quoteBuy(ethIn);
      const quotedTokens = BigInt(quoted?.[0] || 0n);
      const minTokensOut = quotedTokens > 0n ? (quotedTokens * 97n) / 100n : 0n;

      setAlert(ui.alert, "Buying on bonding curve...");
      let tx;
      if (isUsdcQuote()) {
        const quote = new ethers.Contract(state.quoteAsset.address, TOKEN_ABI, ws.signer);
        const allowance = await quote.allowance(ws.address, poolAddressFromLaunch());
        if (allowance < ethIn) {
          setAlert(ui.alert, "Approving USDC...");
          const approval = await sendTxWithFallback({
            label: "Approve USDC",
            populatedTx: quote.approve.populateTransaction(poolAddressFromLaunch(), ethers.MaxUint256),
            walletNativeSend: () => quote.approve(poolAddressFromLaunch(), ethers.MaxUint256)
          });
          await approval.wait();
        }
        tx = await sendTxWithFallback({
          label: "USDC Bonding Buy",
          populatedTx: pool.buyWithQuote.populateTransaction(ethIn, minTokensOut),
          walletNativeSend: () => pool.buyWithQuote(ethIn, minTokensOut)
        });
      } else {
        tx = await sendTxWithFallback({
          label: "Bonding Buy",
          populatedTx: pool.buy.populateTransaction(minTokensOut, { value: ethIn }),
          walletNativeSend: () => pool.buy(minTokensOut, { value: ethIn })
        });
      }
      const receipt = await tx.wait();
      const optimistic = buildSyntheticOptimisticTrade({
        side: "buy",
        account: ws.address,
        txHash: String(receipt?.hash || tx?.hash || ""),
        ethAmountWei: ethIn,
        tokenAmountWei: quotedTokens,
        timestamp: Math.floor(Date.now() / 1000)
      });
      if (optimistic?.txHash) {
        pushOptimisticTrade(optimistic);
        state.trades = mergeTradesWithOptimistic(state.trades);
        renderTrades(state.trades);
        renderOverview();
      }
      setAlert(ui.alert, "Buy complete on bonding curve");
      await loadTokenPage(true, false);
      return;
    }

    const { router, path } = await resolveDexPathBuy();
    const quoted = await router.getAmountsOut(ethIn, path);
    const amountOutMin = quoted?.[1] ? (quoted[1] * 97n) / 100n : 0n;
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60;

    setAlert(ui.alert, "Swapping on Uniswap...");
    const tx = await sendTxWithFallback({
      label: "Uniswap Buy",
      populatedTx: router.swapExactETHForTokensSupportingFeeOnTransferTokens.populateTransaction(
        amountOutMin,
        path,
        ws.address,
        deadline,
        { value: ethIn }
      ),
      walletNativeSend: () =>
        router.swapExactETHForTokensSupportingFeeOnTransferTokens(amountOutMin, path, ws.address, deadline, {
          value: ethIn
        })
    });
    const receipt = await tx.wait();
    const optimistic =
      (await parseOptimisticTradeFromReceipt(receipt, "buy")) ||
      buildSyntheticOptimisticTrade({
        side: "buy",
        account: ws.address,
        txHash: String(receipt?.hash || tx?.hash || ""),
        ethAmountWei: ethIn,
        tokenAmountWei: BigInt(quoted?.[1] || 0n),
        timestamp: Math.floor(Date.now() / 1000)
      });
    if (optimistic?.txHash) {
      pushOptimisticTrade(optimistic);
      state.trades = mergeTradesWithOptimistic(state.trades);
      renderTrades(state.trades);
      renderOverview();
    }
    setAlert(ui.alert, "Buy complete on Uniswap");
    await loadTokenPage(true, false);
  } catch (err) {
    setAlert(ui.alert, parseUiError(err), true);
  }
}

async function onSell() {
  try {
    const ws = walletState();
    if (!ws.signer || !ws.address) throw new Error("Connect wallet first");
    if (!hasTradeMarket(state.launch)) throw new Error("Trading is not ready yet");

    if (!String(ui.sellInput.value || "").trim() && String(ui.sellEthInput?.value || "").trim()) {
      await syncSellTokenFromEth();
    }
    const amount = ui.sellInput.value.trim();
    if (!amount) throw new Error("Enter token amount");

    const tokenIn = ethers.parseUnits(amount, 18);
    if (tokenIn <= 0n) throw new Error("Amount must be > 0");

    const token = makeTokenContract(state.launch.token);
    if (hasBondingMarket(state.launch)) {
      const poolAddress = poolAddressFromLaunch();
      const pool = makePoolContract(poolAddress);
      const quoted = await pool.quoteSell(tokenIn);
      const quotedEth = BigInt(quoted?.[0] || 0n);
      const minEthOut = quotedEth > 0n ? (quotedEth * 96n) / 100n : 0n;
      const allowance = await token.allowance(ws.address, poolAddress);
      if (allowance < tokenIn) {
        setAlert(ui.alert, "Approving bonding pool...");
        const approval = await sendTxWithFallback({
          label: "Approve Pool",
          populatedTx: token.approve.populateTransaction(poolAddress, ethers.MaxUint256),
          walletNativeSend: () => token.approve(poolAddress, ethers.MaxUint256)
        });
        await approval.wait();
      }

      setAlert(ui.alert, "Selling on bonding curve...");
      const tx = await sendTxWithFallback({
        label: "Bonding Sell",
        populatedTx: pool.sell.populateTransaction(tokenIn, minEthOut),
        walletNativeSend: () => pool.sell(tokenIn, minEthOut)
      });
      const receipt = await tx.wait();
      const optimistic = buildSyntheticOptimisticTrade({
        side: "sell",
        account: ws.address,
        txHash: String(receipt?.hash || tx?.hash || ""),
        ethAmountWei: quotedEth,
        tokenAmountWei: tokenIn,
        timestamp: Math.floor(Date.now() / 1000)
      });
      if (optimistic?.txHash) {
        pushOptimisticTrade(optimistic);
        state.trades = mergeTradesWithOptimistic(state.trades);
        renderTrades(state.trades);
        renderOverview();
      }
      setAlert(ui.alert, "Sell complete on bonding curve");
      await loadTokenPage(true, false);
      return;
    }

    const { router, path } = await resolveDexPathSell();
    const allowance = await token.allowance(ws.address, state.launch.pool.dexRouter);
    if (allowance < tokenIn) {
      setAlert(ui.alert, "Approving router...");
      const approval = await sendTxWithFallback({
        label: "Approve Router",
        populatedTx: token.approve.populateTransaction(state.launch.pool.dexRouter, ethers.MaxUint256),
        walletNativeSend: () => token.approve(state.launch.pool.dexRouter, ethers.MaxUint256)
      });
      await approval.wait();
    }

    const quoted = await router.getAmountsOut(tokenIn, path);
    const amountOutMin = quoted?.[1] ? (quoted[1] * 96n) / 100n : 0n;
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60;

    setAlert(ui.alert, "Swapping on Uniswap...");
    const tx = await sendTxWithFallback({
      label: "Uniswap Sell",
      populatedTx: router.swapExactTokensForETHSupportingFeeOnTransferTokens.populateTransaction(
        tokenIn,
        amountOutMin,
        path,
        ws.address,
        deadline
      ),
      walletNativeSend: () =>
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(tokenIn, amountOutMin, path, ws.address, deadline)
    });
    const receipt = await tx.wait();
    const optimistic =
      (await parseOptimisticTradeFromReceipt(receipt, "sell")) ||
      buildSyntheticOptimisticTrade({
        side: "sell",
        account: ws.address,
        txHash: String(receipt?.hash || tx?.hash || ""),
        ethAmountWei: BigInt(quoted?.[1] || 0n),
        tokenAmountWei: tokenIn,
        timestamp: Math.floor(Date.now() / 1000)
      });
    if (optimistic?.txHash) {
      pushOptimisticTrade(optimistic);
      state.trades = mergeTradesWithOptimistic(state.trades);
      renderTrades(state.trades);
      renderOverview();
    }
    setAlert(ui.alert, "Sell complete on Uniswap");
    await loadTokenPage(true, false);
  } catch (err) {
    setAlert(ui.alert, parseUiError(err), true);
  }
}

async function init() {
  state.token = getTokenFromUrl();
  state.quoteMode = getQuoteModeFromUrl();

  try {
    const cfg = await api.config({ quote: state.quoteMode });
    state.chainId = Number(cfg.chainId || 1);
    if (cfg.quoteAsset) state.quoteAsset = cfg.quoteAsset;
    state.quoteMode = String(cfg.quoteMode || state.quoteMode || "native").toLowerCase() === "usdc" ? "usdc" : "native";
    setPreferredChainId(state.chainId);
    state.explorerBaseUrl = cfg.explorerBaseUrl || "";
    if (ui.netChip) ui.netChip.textContent = `Chain ${cfg.chainId}`;
    if (ui.factoryChip) ui.factoryChip.textContent = shortAddress(cfg.factoryAddress);
  } catch {
    state.chainId = 1;
    setPreferredChainId(1);
    state.explorerBaseUrl = "";
  }

  try {
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
  } catch (err) {
    console.warn("[token] wallet hub init failed", err);
    walletHub = null;
  }

  try {
    walletControls = initWalletControls({
      selectEl: ui.walletSelect,
      connectBtn: ui.connectBtn,
      disconnectBtn: ui.disconnectBtn,
      labelEl: ui.walletLabel,
      alertEl: ui.alert,
      onConnected: async () => {
        const ws = walletState();
        if (ws.address) {
          ui.profileNav.href = `/profile?address=${ws.address}`;
          ui.profileNavSide.href = `/profile?address=${ws.address}`;
        }
        updateProfileIdentity();
        if (state.launch) setTokenHeader(state.launch);
        setProfileMenuOpen(false);
        await walletHub?.refresh();
        await refreshWalletBalance();
      }
    });
  } catch (err) {
    console.warn("[token] wallet controls init failed", err);
    walletControls = null;
  }

  ui.disconnectBtn?.addEventListener("click", () => {
    updateProfileIdentity();
    if (state.launch) setTokenHeader(state.launch);
    setProfileMenuOpen(false);
    walletHub?.refresh();
    refreshWalletBalance().catch(() => {
      // noop
    });
  });
  ui.connectBtn?.addEventListener("click", () => {
    setTimeout(() => {
      updateProfileIdentity();
      walletHub?.refresh();
    }, 20);
  });
  ui.walletSelect?.addEventListener("change", () => {
    setTimeout(() => {
      updateProfileIdentity();
      walletHub?.refresh();
    }, 20);
  });

  ui.signInBtn?.addEventListener("click", () => {
    if (walletControls?.connect) {
      walletControls.connect();
      return;
    }
    ui.connectBtn?.click();
    setAlert(ui.alert, "Wallet connector unavailable in this tab. Refresh and try again.", true);
  });

  const ws = walletState();
  if (ws.address) {
    ui.profileNav.href = `/profile?address=${ws.address}`;
    ui.profileNavSide.href = `/profile?address=${ws.address}`;
  }

  updateProfileIdentity();
  setupProfileMenu();
  setupEditProfileModal();
  initSupportWidget({ alertEl: ui.alert });
  setupChartControls();
  setupInteractions();
  initCoinSearchOverlay({ triggerInputs: [ui.tokenSearchInput] });
  if (ui.tradeFilterEnabled) {
    ui.tradeFilterEnabled.checked = false;
  }
  setTradeTab(true);

  ui.buyBtn?.addEventListener("click", onBuy);
  ui.sellBtn?.addEventListener("click", onSell);

  try {
    await refreshEthUsd();
  } catch {
    // keep fallback ETH/USD price
  }

  renderSeededLaunch();
  // Render fast lite payload first, then enrich with full payload to avoid stale-lite overwrite races.
  await loadTokenPage(true, true);
  refreshTokenFull(true).catch(() => {
    // Keep rich market data best-effort.
  });

  setInterval(() => {
    loadTokenPage(true, true).catch(() => {
      // ignore transient poll failures
    });
    const needsDexSync = !hasDexMarket(state.launch);
    const staleFull = Date.now() - Number(state.lastFullRefreshAt || 0) > 12_000;
    if (needsDexSync && staleFull) {
      refreshTokenFull(true).catch(() => {
        // ignore transient full-refresh failures
      });
    }
  }, 2_500);

  setInterval(() => {
    refreshEthUsd(true)
      .then(() => {
        renderOverview();
      })
      .catch(() => {
        // ignore ETH/USD polling failures
      });
  }, 60_000);

  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    loadTokenPage(true, true)
      .then(() => refreshTokenFull(true))
      .catch(() => {
        // ignore transient resume refresh failures
      });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    loadTokenPage(true, true)
      .then(() => {
        const staleFull = Date.now() - Number(state.lastFullRefreshAt || 0) > 5_000;
        if (staleFull) return refreshTokenFull(true);
        return null;
      })
      .catch(() => {
        // ignore transient foreground refresh failures
      });
  });
}

init().catch((err) => {
  console.error("[token] init failed", err);
  if (ui.tokenTitle) ui.tokenTitle.textContent = "Load failed";
  if (ui.tokenSymbolLine) ui.tokenSymbolLine.textContent = parseUiError(err);
  setAlert(ui.alert, parseUiError(err), true);
});

