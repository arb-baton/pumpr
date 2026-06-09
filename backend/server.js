const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

dotenv.config({ override: true });

const app = express();
const PORT = Number(process.env.PORT || 4173);

const ROOT = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const DEPLOYMENT_PATH = path.join(FRONTEND_DIR, "deployment.json");
const UPLOADS_DIR = path.join(FRONTEND_DIR, "uploads");
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL);
const UPLOAD_MODE = String(process.env.UPLOAD_MODE || (IS_VERCEL_RUNTIME ? "inline" : "disk")).toLowerCase();
const PROFILE_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-profiles.json") : path.join(ROOT, "cache", "profiles.json");
const FOLLOW_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-follows.json") : path.join(ROOT, "cache", "follows.json");
const SUPPORT_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-support.json") : path.join(ROOT, "cache", "support.json");
const COMMUNITY_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-community.json") : path.join(ROOT, "cache", "community.json");
const GO_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-go.json") : path.join(ROOT, "cache", "go.json");
const ALPHA_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-alpha.json") : path.join(ROOT, "cache", "alpha.json");
const PUMPFUN_METADATA_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-pumpfun-metadata.json") : path.join(ROOT, "cache", "pumpfun-metadata.json");
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ""
).trim();
const SUPABASE_PROFILE_TABLE = String(process.env.SUPABASE_PROFILE_TABLE || "user_profiles").trim();
const SUPABASE_FOLLOW_TABLE = String(process.env.SUPABASE_FOLLOW_TABLE || "user_follows").trim();
const SUPABASE_SCHEMA = String(process.env.SUPABASE_SCHEMA || "public").trim();
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "uploads").trim();
const SUPABASE_COMMUNITY_OBJECT = String(process.env.SUPABASE_COMMUNITY_OBJECT || "community/community.json").trim();
const SUPABASE_ALPHA_OBJECT = String(process.env.SUPABASE_ALPHA_OBJECT || "alpha/alpha.json").trim();
const PROFILE_IMAGE_URI_MAX_LENGTH = 2 * 1024 * 1024;
const STRICT_PROFILE_STORE = String(process.env.STRICT_PROFILE_STORE || "0") === "1";
const STRICT_SOCIAL_STORE = String(process.env.STRICT_SOCIAL_STORE || (STRICT_PROFILE_STORE ? "1" : "0")) === "1";
const STRICT_UPLOAD_STORE = String(process.env.STRICT_UPLOAD_STORE || "0") === "1";
// Vercel runtime filesystem is ephemeral/read-only for project paths. Force inline mode there.
const USE_DISK_UPLOADS = !IS_VERCEL_RUNTIME && UPLOAD_MODE !== "inline";

let solanaWeb3Promise = null;
let pumpSdkPromise = null;
const nativeImport = new Function("specifier", "return import(specifier)");

async function loadSolanaWeb3() {
  if (!solanaWeb3Promise) {
    const browserBundlePath = path.join(ROOT, "node_modules", "@solana", "web3.js", "lib", "index.browser.cjs.js");
    solanaWeb3Promise = Promise.resolve(require(browserBundlePath));
  }
  const mod = await solanaWeb3Promise;
  return {
    Connection: mod.Connection,
    Keypair: mod.Keypair,
    PublicKey: mod.PublicKey,
    Transaction: mod.Transaction
  };
}

async function loadPumpFunSdk() {
  if (!pumpSdkPromise) {
    pumpSdkPromise = nativeImport("@pump-fun/pump-sdk");
  }
  const mod = await pumpSdkPromise;
  return mod.PUMP_SDK || mod.default?.PUMP_SDK || mod.default;
}

const FACTORY_ARTIFACT = require(path.join(ROOT, "artifacts", "contracts", "MemeLaunchFactory.sol", "MemeLaunchFactory.json"));
const POOL_ARTIFACT = require(path.join(ROOT, "artifacts", "contracts", "MemePool.sol", "MemePool.json"));
const TOKEN_ARTIFACT = require(path.join(ROOT, "artifacts", "contracts", "MemeToken.sol", "MemeToken.json"));
const V2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)"
];
const V2_ROUTER_ABI = ["function WETH() view returns (address)"];
const POOL_READ_ABI = [
  ...POOL_ARTIFACT.abi,
  "function quoteToken() view returns (address)"
];
const GECKO_NETWORK_BY_CHAIN = {
  1: "eth",
  143: "monad",
  8453: "base",
  11155111: "sepolia-testnet"
};
const DEXSCREENER_CHAIN_BY_ID = {
  1: "ethereum",
  143: "monad",
  8453: "base",
  11155111: "sepolia"
};
const CHAIN_META = {
  1: {
    name: "Ethereum",
    shortName: "ETH",
    nativeCurrency: "ETH",
    explorerBaseUrl: "https://etherscan.io",
    rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://rpc.ankr.com/eth"],
    dexRouter: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  },
  8453: {
    name: "Base",
    shortName: "BASE",
    nativeCurrency: "ETH",
    explorerBaseUrl: "https://basescan.org",
    rpcUrls: ["https://mainnet.base.org"],
    dexRouter: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24"
  },
  143: {
    name: "Monad",
    shortName: "MONAD",
    nativeCurrency: "MON",
    explorerBaseUrl: "https://monadvision.com",
    rpcUrls: ["https://rpc.monad.xyz"],
    dexRouter: ethers.ZeroAddress
  },
  101: {
    name: "Solana",
    shortName: "SOL",
    nativeCurrency: "SOL",
    explorerBaseUrl: "https://solscan.io",
    rpcUrls: ["https://sparkling-blue-sponge.solana-mainnet.quiknode.pro/1a7f99d93cb6940285e9a095de8fc546c3c76d35/"],
    dexRouter: ethers.ZeroAddress
  },
  11155111: {
    name: "Sepolia",
    shortName: "SEP",
    nativeCurrency: "ETH",
    explorerBaseUrl: "https://sepolia.etherscan.io",
    rpcUrls: [],
    dexRouter: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3"
  },
  31337: {
    name: "Local",
    shortName: "LOCAL",
    nativeCurrency: "ETH",
    explorerBaseUrl: "",
    rpcUrls: ["http://127.0.0.1:8545"],
    dexRouter: ethers.ZeroAddress
  }
};
const QUOTE_ASSETS = {
  native: {
    mode: "native",
    symbol: "ETH",
    name: "Native",
    address: ethers.ZeroAddress,
    decimals: 18,
    isNative: true
  },
  usdc: {
    mode: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    isNative: false
  }
};

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.set("trust proxy", true);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

if (USE_DISK_UPLOADS && !fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const contextCache = new Map();

const LAUNCHES_CACHE_TTL_MS = 4_000;
const POOL_SNAPSHOT_CACHE_TTL_MS = Math.max(0, Number(process.env.POOL_SNAPSHOT_CACHE_TTL_MS || 2_500));
const STATS_CACHE_TTL_MS = 20_000;
const TOKEN_CACHE_TTL_MS = Math.max(0, Number(process.env.TOKEN_CACHE_TTL_MS || 2_000));
const PROFILE_CACHE_TTL_MS = 15_000;
const PROFILE_SOCIAL_CACHE_TTL_MS = 45_000;
const PARTICIPANTS_CACHE_TTL_MS = 30_000;
const GECKO_POOL_CACHE_TTL_MS = 15_000;
const GECKO_TRADES_CACHE_TTL_MS = 10_000;
const GECKO_SPARKLINE_CACHE_TTL_MS = 45_000;
const DEX_TOKEN_CACHE_TTL_MS = 4_000;
const MAX_LAUNCH_READ_CONCURRENCY = 3;
const MAX_BALANCE_READ_CONCURRENCY = 10;
const MAX_SOCIAL_POOL_CONCURRENCY = 3;
const LOG_LOOKBACK_BLOCKS = Math.max(120, Number(process.env.LOG_LOOKBACK_BLOCKS || 1200));
const POOL_TRADE_LOOKBACK_BLOCKS = Math.max(
  LOG_LOOKBACK_BLOCKS,
  Number(process.env.POOL_TRADE_LOOKBACK_BLOCKS || 45000)
);
const DEX_LOG_LOOKBACK_BLOCKS = Math.max(40, Number(process.env.DEX_LOG_LOOKBACK_BLOCKS || 220));
const DEX_LOG_DEEP_LOOKBACK_BLOCKS = Math.max(
  DEX_LOG_LOOKBACK_BLOCKS,
  Number(process.env.DEX_LOG_DEEP_LOOKBACK_BLOCKS || 3500)
);
const TOKEN_TRADES_RESPONSE_LIMIT = Math.max(20, Math.min(200, Number(process.env.TOKEN_TRADES_RESPONSE_LIMIT || 80)));
const TOKEN_CHART_RESPONSE_LIMIT = Math.max(20, Math.min(240, Number(process.env.TOKEN_CHART_RESPONSE_LIMIT || 120)));
const DEFAULT_LOG_RANGE = Math.max(5, Number(process.env.DEFAULT_LOG_RANGE || 45000));
const MIN_LOG_RANGE = Math.max(1, Number(process.env.MIN_LOG_RANGE || 5));
const CREATOR_CLAIM_LOOKBACK_BLOCKS = Math.max(
  LOG_LOOKBACK_BLOCKS,
  Number(process.env.CREATOR_CLAIM_LOOKBACK_BLOCKS || 500000)
);
const ENABLE_ONCHAIN_LOG_TRADES = String(process.env.ENABLE_ONCHAIN_LOG_TRADES || "0") === "1";
const ENABLE_ONCHAIN_SOCIAL_LOGS = String(process.env.ENABLE_ONCHAIN_SOCIAL_LOGS || "0") === "1";
const ENABLE_ONCHAIN_CLAIM_HISTORY = String(process.env.ENABLE_ONCHAIN_CLAIM_HISTORY || "0") === "1";
const RPC_PROBE_TIMEOUT_MS = Math.max(1_500, Number(process.env.RPC_PROBE_TIMEOUT_MS || 4_500));
const RPC_READ_TIMEOUT_MS = Math.max(2_000, Number(process.env.RPC_READ_TIMEOUT_MS || 8_000));

const launchesCache = new Map();
const launchListCache = new Map();
const poolSnapshotCache = new Map();
const tokenCache = new Map();
const statsCache = new Map();
const profileCache = new Map();
const participantsCache = new Map();
const geckoPoolCache = new Map();
const geckoTradesCache = new Map();
const geckoSparklineCache = new Map();
const dexTokenCache = new Map();
const geckoIndexedSticky = new Set();
const pairTradesCache = new Map();
const tokenLaunchHintCache = new Map();
let profileDbCache = null;
let followDbCache = null;
let supportDbCache = null;
let communityDbCache = null;
let communityDbRemoteLoaded = false;
let goDbCache = null;
let alphaDbCache = null;
let alphaDbRemoteLoaded = false;
const profileLastKnownCache = new Map();
const xOauthStates = new Map();

function resolvePlatformSupportAddress() {
  const candidates = [
    process.env.SUPPORT_WALLET,
    process.env.PLATFORM_FEE_RECIPIENT,
    process.env.FEE_RECIPIENT
  ];
  for (const candidate of candidates) {
    const normalized = normalizeAddress(candidate || "");
    if (normalized) return normalized;
  }
  return null;
}

function supportHelpCollections() {
  return [
    {
      key: "creating",
      title: "Creating and Managing Coins",
      description: "Token setup, launch flow, and post-launch management.",
      articles: 4
    },
    {
      key: "wallet",
      title: "Managing Your Wallet",
      description: "Connecting wallets, balances, and common wallet issues.",
      articles: 3
    },
    {
      key: "fees",
      title: "Tokenomics & Fees",
      description: "Launch fee, creator rewards, and platform fee details.",
      articles: 4
    },
    {
      key: "trading",
      title: "Trading & Liquidity",
      description: "Uniswap pair behavior, slippage, and trade troubleshooting.",
      articles: 3
    }
  ];
}

function getCachedValue(cache, key) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() >= row.expiresAt) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function setCachedValue(cache, key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function withCache(cache, key, ttlMs, builder) {
  const cached = getCachedValue(cache, key);
  if (cached) return cached;
  const value = await builder();
  setCachedValue(cache, key, value, ttlMs);
  return value;
}

function withTimeout(promise, ms, label = "operation") {
  let timeout = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timeout) clearTimeout(timeout);
    }),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    })
  ]);
}

function isLogRangeLimitError(error) {
  const text = String(
    error?.shortMessage || error?.message || error?.error?.message || error?.info?.error?.message || ""
  ).toLowerCase();
  return (
    text.includes("eth_getlogs is limited") ||
    text.includes("limited to a 5 range") ||
    text.includes("up to a 10 block range") ||
    text.includes("block range should work") ||
    text.includes("eth_getlogs requests with up to")
  );
}

async function queryFilterAdaptive(pool, filter, fromBlock, toBlock, initialRange = DEFAULT_LOG_RANGE) {
  const out = [];
  let range = Math.max(MIN_LOG_RANGE, Number(initialRange || DEFAULT_LOG_RANGE));
  let start = Number(fromBlock || 0);
  const endAll = Number(toBlock || 0);

  while (start <= endAll) {
    const end = Math.min(endAll, start + range);
    try {
      const rows = await pool.queryFilter(filter, start, end);
      out.push(...rows);
      start = end + 1;
    } catch (error) {
      if (!isLogRangeLimitError(error)) {
        throw error;
      }

      if (range <= MIN_LOG_RANGE) {
        // Provider is still rejecting tiny windows; skip this slice instead of failing whole payload.
        start = end + 1;
        continue;
      }

      range = Math.max(MIN_LOG_RANGE, Math.floor(range / 2));
    }
  }

  return out;
}

function loadDeploymentConfig() {
  if (!fs.existsSync(DEPLOYMENT_PATH)) {
    throw new Error(`Missing deployment config at ${DEPLOYMENT_PATH}`);
  }

  const raw = fs.readFileSync(DEPLOYMENT_PATH, "utf8");
  const config = JSON.parse(raw);

  if (!config?.memeLaunchFactory || !ethers.isAddress(config.memeLaunchFactory)) {
    throw new Error("deployment.json missing valid memeLaunchFactory");
  }

  return config;
}

function loadChainDeploymentConfig(chainId) {
  const normalized = parseChainId(chainId);
  if (!normalized) return null;
  const filePath = path.join(FRONTEND_DIR, "deployments", `${normalized}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!ethers.isAddress(parsed?.memeLaunchFactory)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseChainId(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

function normalizeQuoteMode(value = "native") {
  const text = String(value || "native").trim().toLowerCase();
  return text === "usdc" ? "usdc" : "native";
}

function resolveRequestedQuoteMode(req) {
  return normalizeQuoteMode(req?.query?.quote || req?.headers?.["x-quote-mode"] || "native");
}

function parseJsonObjectEnv(key) {
  const raw = String(process.env[key] || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function readFactoryMapFromDeploymentFiles() {
  const map = new Map();
  const dir = path.join(FRONTEND_DIR, "deployments");
  if (!fs.existsSync(dir)) return map;

  for (const name of fs.readdirSync(dir)) {
    if (!/^\d+\.json$/.test(name)) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, name), "utf8");
      const parsed = JSON.parse(raw);
      const chainId = parseChainId(parsed?.chainId || name.replace(/\.json$/, ""));
      if (!chainId || !ethers.isAddress(parsed?.memeLaunchFactory)) continue;
      map.set(chainId, ethers.getAddress(parsed.memeLaunchFactory));
    } catch {
      // Ignore malformed optional chain deployment files.
    }
  }

  return map;
}

function readFactoryMapFromEnv() {
  const map = readFactoryMapFromDeploymentFiles();

  const jsonMap = parseJsonObjectEnv("FACTORY_ADDRESSES");
  for (const [chain, address] of Object.entries(jsonMap)) {
    const chainId = parseChainId(chain);
    if (!chainId || !ethers.isAddress(address)) continue;
    map.set(chainId, ethers.getAddress(address));
  }

  for (const [key, value] of Object.entries(process.env)) {
    const m = key.match(/^FACTORY_ADDRESS_(\d+)$/);
    if (!m) continue;
    const chainId = parseChainId(m[1]);
    if (!chainId || !ethers.isAddress(value)) continue;
    map.set(chainId, ethers.getAddress(value));
  }

  const envChain = parseChainId(process.env.CHAIN_ID);
  const envFactory = String(process.env.FACTORY_ADDRESS || "").trim();
  if (envChain && ethers.isAddress(envFactory)) {
    map.set(envChain, ethers.getAddress(envFactory));
  }

  return map;
}

function readQuoteFactoryMapFromEnv(quoteMode = "native") {
  const normalized = normalizeQuoteMode(quoteMode);
  const map = new Map();
  if (normalized === "native") return map;

  const dir = path.join(FRONTEND_DIR, "deployments");
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!new RegExp(`^\\d+\\.${normalized}\\.json$`).test(name)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
        const chainId = parseChainId(parsed?.chainId || name.split(".")[0]);
        if (!chainId || !ethers.isAddress(parsed?.memeLaunchFactory)) continue;
        map.set(chainId, ethers.getAddress(parsed.memeLaunchFactory));
      } catch {
        // Ignore malformed optional quote deployment files.
      }
    }
  }

  const upper = normalized.toUpperCase();
  const jsonMap = parseJsonObjectEnv(`${upper}_FACTORY_ADDRESSES`);
  for (const [chain, address] of Object.entries(jsonMap)) {
    const chainId = parseChainId(chain);
    if (!chainId || !ethers.isAddress(address)) continue;
    map.set(chainId, ethers.getAddress(address));
  }

  for (const [key, value] of Object.entries(process.env)) {
    const m = key.match(new RegExp(`^${upper}_FACTORY_ADDRESS_(\\d+)$`));
    if (!m) continue;
    const chainId = parseChainId(m[1]);
    if (!chainId || !ethers.isAddress(value)) continue;
    map.set(chainId, ethers.getAddress(value));
  }

  const envChain = parseChainId(process.env.CHAIN_ID) || 1;
  const direct = String(process.env[`${upper}_FACTORY_ADDRESS`] || "").trim();
  if (envChain && ethers.isAddress(direct)) {
    map.set(envChain, ethers.getAddress(direct));
  }

  return map;
}

function resolveFactoryAddress(chainId, deployment, quoteMode = "native") {
  const normalizedQuote = normalizeQuoteMode(quoteMode);
  if (normalizedQuote !== "native") {
    const quoteMap = readQuoteFactoryMapFromEnv(normalizedQuote);
    if (quoteMap.has(chainId)) {
      return quoteMap.get(chainId);
    }
    throw new Error(`No ${normalizedQuote.toUpperCase()} factory configured for chain ${chainId}`);
  }

  const deploymentChain = parseChainId(deployment?.chainId);
  if (deploymentChain === chainId && ethers.isAddress(deployment?.memeLaunchFactory)) {
    return ethers.getAddress(deployment.memeLaunchFactory);
  }

  const envMap = readFactoryMapFromEnv();
  if (envMap.has(chainId)) {
    return envMap.get(chainId);
  }

  throw new Error(`No factory configured for chain ${chainId}`);
}

function defaultChainIdFromConfig(deployment) {
  const envChain = parseChainId(process.env.CHAIN_ID);
  if (envChain) return envChain;
  const deploymentChain = parseChainId(deployment?.chainId);
  if (deploymentChain) return deploymentChain;
  return 1;
}

function resolveRequestedChainId(req, deployment) {
  const fallback = defaultChainIdFromConfig(deployment);
  const requested = parseChainId(req?.query?.chainId || req?.headers?.["x-chain-id"]);
  if (!requested) return fallback;

  try {
    resolveFactoryAddress(requested, deployment, resolveRequestedQuoteMode(req));
    return requested;
  } catch {
    return fallback;
  }
}

function resolveSupportedChains(deployment) {
  const map = readFactoryMapFromEnv();
  const deploymentChain = parseChainId(deployment?.chainId);
  if (deploymentChain && ethers.isAddress(deployment?.memeLaunchFactory)) {
    map.set(deploymentChain, ethers.getAddress(deployment.memeLaunchFactory));
  }
  const chainRank = (chainId) => {
    const order = [1, 8453, 143, 11155111, 31337];
    const index = order.indexOf(Number(chainId));
    return index >= 0 ? index : order.length + Number(chainId || 0);
  };

  return [...map.entries()]
    .map(([chainId, factoryAddress]) => {
      const meta = CHAIN_META[chainId] || {};
      const chainDeployment = loadChainDeploymentConfig(chainId);
      return {
        chainId,
        name: meta.name || `Chain ${chainId}`,
        shortName: meta.shortName || String(chainId),
        nativeCurrency: meta.nativeCurrency || "ETH",
        factoryAddress,
        explorerBaseUrl: explorerBaseForChain(chainId),
        dexRouter: chainDeployment?.dexRouter || meta.dexRouter || ethers.ZeroAddress
      };
    })
    .sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId));
}

function resolveQuoteLaunchOptions() {
  const rows = [];
  const usdcMap = readQuoteFactoryMapFromEnv("usdc");
  for (const [chainId, factoryAddress] of usdcMap.entries()) {
    const meta = CHAIN_META[chainId] || {};
    rows.push({
      mode: "usdc",
      chainId,
      name: `${meta.name || `Chain ${chainId}`} + USDC`,
      shortName: `${meta.shortName || String(chainId)} + USDC`,
      nativeCurrency: meta.nativeCurrency || "ETH",
      factoryAddress,
      quoteAsset: QUOTE_ASSETS.usdc,
      explorerBaseUrl: explorerBaseForChain(chainId),
      dexRouter: meta.dexRouter || ethers.ZeroAddress
    });
  }
  return rows.sort((a, b) => Number(a.chainId) - Number(b.chainId));
}

function pickRpcUrls(chainId) {
  const urls = [];
  const pushIf = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (!urls.includes(text)) urls.push(text);
  };

  pushIf(process.env.RPC_URL);
  pushIf(process.env[`RPC_URL_${chainId}`]);

  const rpcJsonMap = parseJsonObjectEnv("RPC_URLS_BY_CHAIN");
  if (rpcJsonMap && Object.prototype.hasOwnProperty.call(rpcJsonMap, String(chainId))) {
    const value = rpcJsonMap[String(chainId)];
    if (Array.isArray(value)) {
      for (const row of value) pushIf(row);
    } else {
      pushIf(value);
    }
  }

  if (chainId === 31337) {
    pushIf(process.env.LOCAL_RPC_URL);
    pushIf("http://127.0.0.1:8545");
    return urls;
  }

  if (chainId === 11155111) {
    pushIf(process.env.SEPOLIA_RPC_URL);
    pushIf("https://ethereum-sepolia-rpc.publicnode.com");
    pushIf("https://rpc.sepolia.org");
    pushIf("https://gateway.tenderly.co/public/sepolia");
    return urls;
  }

  if (chainId === 8453) {
    pushIf(process.env.BASE_RPC_URL);
    pushIf("https://base-rpc.publicnode.com");
    pushIf("https://mainnet.base.org");
    return urls;
  }

  if (chainId === 143) {
    pushIf(process.env.MONAD_RPC_URL);
    pushIf("https://rpc.monad.xyz");
    return urls;
  }

  if (chainId === 101) {
    pushIf(process.env.SOLANA_RPC_URL);
    pushIf(process.env.PUMPFUN_SOLANA_RPC_URL);
    pushIf("https://sparkling-blue-sponge.solana-mainnet.quiknode.pro/1a7f99d93cb6940285e9a095de8fc546c3c76d35/");
    return urls;
  }

  if (chainId === 1) {
    pushIf(process.env.MAINNET_RPC_URL);
    pushIf("https://eth-mainnet.g.alchemy.com/v2/iJRW-AEdqp-ijB69j9JQe");
    pushIf("https://ethereum-rpc.publicnode.com");
    pushIf("https://rpc.ankr.com/eth");
    pushIf("https://cloudflare-eth.com");
    return urls;
  }

  if (!urls.length) {
    throw new Error(`No RPC URL configured for chain ${chainId}`);
  }

  return urls;
}

async function buildContext(chainId, factoryAddress, deployment = loadDeploymentConfig(), options = {}) {
  const normalizedChainId = parseChainId(chainId);
  const verify = options.verify !== false;
  if (!normalizedChainId) {
    throw new Error(`Invalid chainId ${chainId}`);
  }

  if (!ethers.isAddress(factoryAddress)) {
    throw new Error("Invalid FACTORY_ADDRESS");
  }

  const rpcUrls = pickRpcUrls(normalizedChainId);
  const probeTimeoutMs = normalizedChainId === 8453 || normalizedChainId === 143 ? Math.max(RPC_PROBE_TIMEOUT_MS, 12_000) : RPC_PROBE_TIMEOUT_MS;
  let lastError = null;
  let provider = null;
  let factory = null;
  let rpcUrl = rpcUrls[0] || "";

  for (const candidate of rpcUrls) {
    try {
      const p = new ethers.JsonRpcProvider(candidate, normalizedChainId, {
        // Prevent extra eth_chainId checks on every call; this avoids
        // tripping strict per-second RPC limits in production.
        staticNetwork: true
      });
      const f = new ethers.Contract(factoryAddress, FACTORY_ARTIFACT.abi, p);
      if (verify) {
        await withTimeout(p.getBlockNumber(), probeTimeoutMs, "RPC block probe");
        const code = await withTimeout(p.getCode(factoryAddress), probeTimeoutMs, "factory code probe");
        if (!code || code === "0x") {
          throw new Error("Factory contract not found at configured address");
        }
      } else {
        await withTimeout(f.getLaunchCount(), probeTimeoutMs, "factory count probe");
      }
      provider = p;
      factory = f;
      rpcUrl = candidate;
      break;
    } catch (error) {
      lastError = error;
      if (String(process.env.DEBUG_RPC || "0") === "1") {
        console.error(`[rpc] chain ${normalizedChainId} failed ${candidate}: ${error?.message || error}`);
      }
    }
  }

  if (!provider || !factory) {
    throw new Error(lastError?.message || "Unable to connect to any configured RPC endpoint");
  }

  return {
    deployment,
    chainId: normalizedChainId,
    quoteMode: normalizeQuoteMode(options.quoteMode || "native"),
    quoteAsset: QUOTE_ASSETS[normalizeQuoteMode(options.quoteMode || "native")] || QUOTE_ASSETS.native,
    rpcUrl,
    provider,
    factory,
    factoryAddress: ethers.getAddress(factoryAddress)
  };
}

async function getContext(requestedChainId = null, options = {}) {
  const deployment = loadDeploymentConfig();
  const quoteMode = normalizeQuoteMode(options.quoteMode || "native");
  const chainId = requestedChainId || defaultChainIdFromConfig(deployment);
  const factoryAddress = resolveFactoryAddress(chainId, deployment, quoteMode);
  const key = `${quoteMode}:${chainId}:${factoryAddress.toLowerCase()}`;

  if (!contextCache.has(key)) {
    contextCache.set(key, await buildContext(chainId, factoryAddress, deployment, { ...options, quoteMode }));
  }

  return contextCache.get(key);
}

function toFloat(weiLike, decimals = 18, max = 8) {
  const n = Number(ethers.formatUnits(weiLike, decimals));
  if (!Number.isFinite(n)) return 0;
  const clamped = Number(n.toFixed(max));
  return clamped;
}

function normalizeAddress(input) {
  try {
    return ethers.getAddress(input);
  } catch {
    return null;
  }
}

function defaultUsername(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return "Guest";
  return `eth_${normalized.slice(2, 8).toLowerCase()}`;
}

function sanitizePersistedImageUri(rawImageURI = "") {
  const raw = String(rawImageURI || "").trim();
  if (!raw) return "";

  if (raw.startsWith("data:image/")) {
    return raw;
  }

  const toUploadPathOrFallback = (pathname = "") => {
    const cleanPath = String(pathname || "").trim();
    if (!cleanPath.startsWith("/uploads/")) {
      return "/assets/pump-r-logo.png";
    }
    const filename = path.basename(cleanPath);
    if (!filename) return "/assets/pump-r-logo.png";
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      return `/uploads/${filename}`;
    }
    return "/assets/pump-r-logo.png";
  };

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    const isLoopbackHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (isLoopbackHost) {
      if (parsed.pathname.startsWith("/assets/")) return parsed.pathname;
      if (parsed.pathname.startsWith("/uploads/")) return toUploadPathOrFallback(parsed.pathname);
      return "/assets/pump-r-logo.png";
    }
    return raw;
  } catch {
    if (raw.startsWith("/assets/")) return raw;
    if (raw.startsWith("/uploads/")) return toUploadPathOrFallback(raw);
    return raw;
  }
}

function sanitizeProfileValue(address, value = {}) {
  const normalized = normalizeAddress(address);
  const safeAddress = normalized || "";
  const usernameRaw = String(value.username || "").trim();
  const bioRaw = String(value.bio || "").trim();
  const imageRaw = sanitizePersistedImageUri(String(value.imageUri || "").trim());
  return {
    address: safeAddress,
    username: usernameRaw || defaultUsername(safeAddress),
    bio: bioRaw.slice(0, 500),
    imageUri: imageRaw.slice(0, PROFILE_IMAGE_URI_MAX_LENGTH)
  };
}

function mergeProfileValues(address, localValue = {}, remoteValue = {}) {
  const normalized = normalizeAddress(address);
  const local = sanitizeProfileValue(normalized, localValue || {});
  const remote = sanitizeProfileValue(normalized, remoteValue || {});
  const fallbackName = defaultUsername(normalized);

  const localHasCustomName = String(local.username || "") !== fallbackName;
  const remoteHasCustomName = String(remote.username || "") !== fallbackName;

  return sanitizeProfileValue(normalized, {
    username: remoteHasCustomName ? remote.username : localHasCustomName ? local.username : remote.username || local.username,
    bio: String(remote.bio || "").trim() ? remote.bio : local.bio,
    imageUri: String(remote.imageUri || "").trim() ? remote.imageUri : local.imageUri
  });
}

function cacheProfileRow(address, value = {}) {
  const normalized = normalizeAddress(address);
  if (!normalized) return;
  profileLastKnownCache.set(normalized.toLowerCase(), sanitizeProfileValue(normalized, value));
}

function getCachedProfile(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  return profileLastKnownCache.get(normalized.toLowerCase()) || null;
}

function readProfileDb() {
  if (profileDbCache && typeof profileDbCache === "object") {
    return profileDbCache;
  }

  try {
    if (fs.existsSync(PROFILE_DB_PATH)) {
      const raw = fs.readFileSync(PROFILE_DB_PATH, "utf8");
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        profileDbCache = parsed;
        return profileDbCache;
      }
    }
  } catch {
    // fall through to empty store
  }

  profileDbCache = {};
  return profileDbCache;
}

function writeProfileDb(store) {
  fs.mkdirSync(path.dirname(PROFILE_DB_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_DB_PATH, JSON.stringify(store, null, 2));
  profileDbCache = store;
}

function getPersistedProfileSync(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return sanitizeProfileValue("", {});
  }
  const store = readProfileDb();
  const key = normalized.toLowerCase();
  const row = store[key] || {};
  return sanitizeProfileValue(normalized, row);
}

function getPersistedProfilesSync(addresses = []) {
  const out = {};
  for (const raw of addresses) {
    const normalized = normalizeAddress(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    out[key] = getPersistedProfileSync(normalized);
  }
  return out;
}

function setPersistedProfileSync(address, value = {}) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    throw new Error("Invalid address");
  }
  const store = readProfileDb();
  const key = normalized.toLowerCase();
  store[key] = sanitizeProfileValue(normalized, value);
  writeProfileDb(store);
  return store[key];
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_PROFILE_TABLE);
}

function getSupabaseRestUrl(relativePath, query = null) {
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${relativePath.replace(/^\/+/, "")}`);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isSupabaseStorageConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_STORAGE_BUCKET);
}

function getSupabaseStorageUploadUrl(objectPath) {
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const safePath = String(objectPath || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${safePath}`;
}

function getSupabaseStoragePublicUrl(objectPath) {
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const safePath = String(objectPath || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${safePath}`;
}

async function ensureSupabaseStorageBucket() {
  if (!isSupabaseStorageConfigured()) return false;
  const base = SUPABASE_URL.replace(/\/+$/, "");
  const url = `${base}/storage/v1/bucket`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };

  const createRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: SUPABASE_STORAGE_BUCKET,
      public: true,
      file_size_limit: 1_048_576
    })
  });

  if (createRes.ok) return true;
  if (createRes.status === 409) return true;

  const text = await createRes.text().catch(() => "");
  if (String(text || "").toLowerCase().includes("already exists")) return true;
  throw new Error(`Supabase bucket create failed: ${createRes.status} ${text}`.trim());
}

const UPLOAD_CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime"
};

async function uploadBinaryToSupabaseStorage(binary, ext = "png", folder = "launches") {
  if (!isSupabaseStorageConfigured()) {
    return "";
  }
  const cleanExt = String(ext || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const cleanFolder = String(folder || "launches").toLowerCase().replace(/[^a-z0-9/_-]/g, "") || "launches";
  const objectPath = `${cleanFolder}/${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${cleanExt}`;
  const contentType = UPLOAD_CONTENT_TYPES[cleanExt] || "application/octet-stream";
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": contentType,
    "x-upsert": "true"
  };
  let response = await fetch(getSupabaseStorageUploadUrl(objectPath), {
    method: "POST",
    headers,
    body: binary
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const lowered = String(text || "").toLowerCase();
    const bucketMissing = response.status === 400 && lowered.includes("bucket not found");
    if (bucketMissing) {
      await ensureSupabaseStorageBucket();
      response = await fetch(getSupabaseStorageUploadUrl(objectPath), {
        method: "POST",
        headers,
        body: binary
      });
    }
    if (!response.ok) {
      const retryText = await response.text().catch(() => "");
      throw new Error(`Supabase storage upload failed: ${response.status} ${retryText || text}`.trim());
    }
  }
  return getSupabaseStoragePublicUrl(objectPath);
}

async function uploadImageToSupabaseStorage(binary, ext = "png") {
  return uploadBinaryToSupabaseStorage(binary, ext, "launches");
}

async function supabaseRequest(relativePath, { method = "GET", query = null, body = null, prefer = "" } = {}) {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/json"
  };
  if (SUPABASE_SCHEMA) {
    headers["Accept-Profile"] = SUPABASE_SCHEMA;
    headers["Content-Profile"] = SUPABASE_SCHEMA;
  }
  if (prefer) {
    headers.Prefer = prefer;
  }
  const init = { method, headers };
  if (body != null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(getSupabaseRestUrl(relativePath, query), init);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase ${method} ${relativePath} failed: ${response.status} ${text}`.trim());
  }
  if (response.status === 204) return [];
  const text = await response.text();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

function isSupabaseMissingTableError(error) {
  const text = String(error?.message || "").toLowerCase();
  return text.includes("pgrst205") || text.includes("could not find the table");
}

function quotedCsv(values = []) {
  const out = [];
  for (const value of values) {
    const safe = String(value || "").replace(/"/g, '\\"');
    out.push(`"${safe}"`);
  }
  return out.join(",");
}

async function getSupabaseProfile(address) {
  const key = String(address || "").toLowerCase();
  const rows = await supabaseRequest(SUPABASE_PROFILE_TABLE, {
    query: {
      select: "address,username,bio,imageUri",
      address: `eq.${key}`,
      limit: 1
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getSupabaseProfiles(addresses = []) {
  if (!addresses.length) return [];
  const rows = await supabaseRequest(SUPABASE_PROFILE_TABLE, {
    query: {
      select: "address,username,bio,imageUri",
      address: `in.(${quotedCsv(addresses.map((row) => String(row || "").toLowerCase()))})`
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function upsertSupabaseProfile(row) {
  const rows = await supabaseRequest(SUPABASE_PROFILE_TABLE, {
    method: "POST",
    query: {
      on_conflict: "address",
      select: "address,username,bio,imageUri"
    },
    body: [row],
    prefer: "resolution=merge-duplicates,return=representation"
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function allowFileProfileFallback() {
  // Local/dev can fall back to file store. Production serverless should be strict.
  if (STRICT_PROFILE_STORE) return false;
  return true;
}

function assertProfileStoreConfigured() {
  if (!STRICT_PROFILE_STORE) return;
  if (!isSupabaseConfigured()) {
    throw new Error("Profile store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in strict mode");
  }
}

async function getPersistedProfile(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return sanitizeProfileValue("", {});

  assertProfileStoreConfigured();

  try {
    if (isSupabaseConfigured()) {
      const row = await getSupabaseProfile(normalized);
      const disk = getPersistedProfileSync(normalized);
      if (row) {
        const merged = mergeProfileValues(normalized, disk, row);
        cacheProfileRow(normalized, merged);
        return merged;
      }
      cacheProfileRow(normalized, disk);
      return disk;
    }
  } catch (error) {
    const cached = getCachedProfile(normalized);
    if (cached) {
      return cached;
    }
    if (isSupabaseMissingTableError(error)) {
      if (!allowFileProfileFallback()) {
        const empty = sanitizeProfileValue(normalized, {});
        cacheProfileRow(normalized, empty);
        return empty;
      }
      const disk = getPersistedProfileSync(normalized);
      cacheProfileRow(normalized, disk);
      return disk;
    }
    if (!allowFileProfileFallback()) {
      throw new Error(`Supabase profile read failed: ${error?.message || "connection error"}`);
    }
  }

  return getPersistedProfileSync(normalized);
}

async function getPersistedProfiles(addresses = []) {
  const normalized = [...new Set((Array.isArray(addresses) ? addresses : []).map((row) => normalizeAddress(row)).filter(Boolean))];
  if (!normalized.length) return {};

  assertProfileStoreConfigured();

  try {
    if (isSupabaseConfigured()) {
      const keys = normalized.map((row) => row.toLowerCase());
      const rows = await getSupabaseProfiles(keys);
      const byId = new Map(rows.map((row) => [String(row?.address || "").toLowerCase(), row]));
      const out = {};
      const disk = getPersistedProfilesSync(normalized);
      for (const address of normalized) {
        const key = address.toLowerCase();
        const profile = mergeProfileValues(address, disk[key] || {}, byId.get(key) || {});
        out[key] = profile;
        cacheProfileRow(address, profile);
      }
      return out;
    }
  } catch (error) {
    const cachedOnly = {};
    for (const address of normalized) {
      const hit = getCachedProfile(address);
      if (hit) {
        cachedOnly[address.toLowerCase()] = hit;
      }
    }
    if (Object.keys(cachedOnly).length) {
      return cachedOnly;
    }
    if (isSupabaseMissingTableError(error)) {
      if (!allowFileProfileFallback()) {
        const out = {};
        for (const address of normalized) {
          const empty = sanitizeProfileValue(address, {});
          out[address.toLowerCase()] = empty;
          cacheProfileRow(address, empty);
        }
        return out;
      }
      const disk = getPersistedProfilesSync(normalized);
      for (const address of normalized) {
        const key = address.toLowerCase();
        cacheProfileRow(address, disk[key] || sanitizeProfileValue(address, {}));
      }
      return disk;
    }
    if (!allowFileProfileFallback()) {
      throw new Error(`Supabase profile batch read failed: ${error?.message || "connection error"}`);
    }
  }

  return getPersistedProfilesSync(normalized);
}

async function setPersistedProfile(address, value = {}) {
  const normalized = normalizeAddress(address);
  if (!normalized) throw new Error("Invalid address");
  const key = normalized.toLowerCase();
  const next = sanitizeProfileValue(normalized, value);

  assertProfileStoreConfigured();

  try {
    if (isSupabaseConfigured()) {
      await upsertSupabaseProfile({
        address: key,
        username: next.username,
        bio: next.bio,
        imageUri: next.imageUri
      });
      // Keep a local mirror so profile data survives remote outages or table changes.
      setPersistedProfileSync(normalized, next);
      cacheProfileRow(normalized, next);
      return next;
    }
  } catch (error) {
    if (isSupabaseMissingTableError(error)) {
      const saved = setPersistedProfileSync(normalized, next);
      cacheProfileRow(normalized, saved);
      return saved;
    }
    if (!allowFileProfileFallback()) {
      throw new Error(`Supabase profile write failed: ${error?.message || "connection error"}`);
    }
  }

  const saved = setPersistedProfileSync(normalized, next);
  cacheProfileRow(normalized, saved);
  return saved;
}

function readFollowDb() {
  if (followDbCache && typeof followDbCache === "object") {
    return followDbCache;
  }

  try {
    if (fs.existsSync(FOLLOW_DB_PATH)) {
      const raw = fs.readFileSync(FOLLOW_DB_PATH, "utf8");
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        followDbCache = parsed;
        return followDbCache;
      }
    }
  } catch {
    // fall through to empty store
  }

  followDbCache = {};
  return followDbCache;
}

function writeFollowDb(store) {
  fs.mkdirSync(path.dirname(FOLLOW_DB_PATH), { recursive: true });
  fs.writeFileSync(FOLLOW_DB_PATH, JSON.stringify(store, null, 2));
  followDbCache = store;
}

function readCommunityDb() {
  if (communityDbCache && typeof communityDbCache === "object") {
    return communityDbCache;
  }

  try {
    if (fs.existsSync(COMMUNITY_DB_PATH)) {
      const raw = fs.readFileSync(COMMUNITY_DB_PATH, "utf8");
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        communityDbCache = parsed;
        return communityDbCache;
      }
    }
  } catch {
    // fall through to empty store
  }

  communityDbCache = { posts: [], comments: {}, likes: {} };
  return communityDbCache;
}

function writeCommunityDb(store) {
  fs.mkdirSync(path.dirname(COMMUNITY_DB_PATH), { recursive: true });
  fs.writeFileSync(COMMUNITY_DB_PATH, JSON.stringify(store, null, 2));
  communityDbCache = store;
}

function emptyCommunityStore() {
  return { posts: [], comments: {}, likes: {} };
}

function sanitizeCommunityStore(store) {
  if (!store || typeof store !== "object" || Array.isArray(store)) return emptyCommunityStore();
  return {
    posts: Array.isArray(store.posts) ? store.posts : [],
    comments: store.comments && typeof store.comments === "object" && !Array.isArray(store.comments) ? store.comments : {},
    likes: store.likes && typeof store.likes === "object" && !Array.isArray(store.likes) ? store.likes : {}
  };
}

async function readCommunityDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_COMMUNITY_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_COMMUNITY_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase community read failed: ${response.status} ${text}`.trim());
  }
  return sanitizeCommunityStore(await response.json().catch(() => emptyCommunityStore()));
}

async function writeCommunityDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_COMMUNITY_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_COMMUNITY_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizeCommunityStore(store), null, 2)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase community write failed: ${response.status} ${text}`.trim());
  }
  return true;
}

async function readCommunityDbPersistent(options = {}) {
  const refresh = Boolean(options.refresh);
  if (isSupabaseStorageConfigured() && (refresh || !communityDbRemoteLoaded)) {
    try {
      const remote = await readCommunityDbRemote();
      if (remote) {
        communityDbCache = remote;
        writeCommunityDb(remote);
      }
      communityDbRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase community read failed: ${error?.message || "connection error"}`);
      communityDbRemoteLoaded = true;
    }
  }
  return sanitizeCommunityStore(readCommunityDb());
}

async function writeCommunityDbPersistent(store) {
  const safe = sanitizeCommunityStore(store);
  writeCommunityDb(safe);
  if (isSupabaseStorageConfigured()) {
    await writeCommunityDbRemote(safe);
  }
  return safe;
}

function emptyAlphaStore() {
  return { tips: [] };
}

function sanitizeAlphaText(value, max = 500) {
  return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

function isSolanaAlphaChain(chainId) {
  return Number(chainId || 0) === 101;
}

function normalizeSolanaAddress(value = "") {
  const text = sanitizeAlphaText(value || "", 80);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : "";
}

function normalizeAlphaTokenAddress(value = "", chainId = 1) {
  return isSolanaAlphaChain(chainId) ? normalizeSolanaAddress(value) : normalizeAddress(value);
}

function normalizeAlphaId(value = "") {
  return sanitizeAlphaText(value || `alpha-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, 90)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function normalizeAlphaTip(row = {}) {
  const id = normalizeAlphaId(row.id || "");
  const title = sanitizeAlphaText(row.title || "", 120);
  const body = sanitizeAlphaText(row.body || row.alpha || "", 2200);
  const chainId = parseChainId(row.chainId || 1) || 1;
  const tokenAddress = normalizeAlphaTokenAddress(row.tokenAddress || row.token || "", chainId);
  if (!id || !title || !body || !tokenAddress) return null;
  const author = normalizeAddress(row.author || row.address || "") || ethers.ZeroAddress;
  const authorWallet = normalizeAddress(row.authorWallet || row.tipWallet || author || "") || ethers.ZeroAddress;
  const minBalance = sanitizeAlphaText(row.minBalance || row.requiredBalance || "1", 40) || "1";
  const tips = Array.isArray(row.tips) ? row.tips : [];
  const unlocks = Array.isArray(row.unlocks) ? row.unlocks.map(normalizeAddress).filter(Boolean) : [];
  const upvotes = Array.isArray(row.upvotes) ? row.upvotes.map(normalizeAddress).filter(Boolean) : [];
  const downvotes = Array.isArray(row.downvotes) ? row.downvotes.map(normalizeAddress).filter(Boolean) : [];
  const comments = Array.isArray(row.comments) ? row.comments : [];
  return {
    id,
    title,
    projectName: sanitizeAlphaText(row.projectName || row.project || row.tokenName || "", 80),
    tokenSymbol: sanitizeAlphaText(row.tokenSymbol || row.symbol || "", 24).replace(/^\$/, "").toUpperCase(),
    tokenAddress,
    chainId,
    minBalance,
    category: sanitizeAlphaText(row.category || "Intel", 32),
    confidence: ["low", "medium", "high"].includes(String(row.confidence || "").toLowerCase())
      ? String(row.confidence || "").toLowerCase()
      : "medium",
    teaser: sanitizeAlphaText(row.teaser || row.summary || "", 240),
    body,
    evidenceUrl: String(row.evidenceUrl || row.mediaUrl || "").trim().slice(0, 1024),
    evidenceType: sanitizeAlphaText(row.evidenceType || row.mediaType || "", 80),
    author,
    authorName: sanitizeAlphaText(row.authorName || row.xHandle || "", 80),
    authorWallet,
    xHandle: normalizeXHandle(row.xHandle || ""),
    xName: sanitizeAlphaText(row.xName || "", 80),
    xImage: String(row.xImage || "").trim().slice(0, 1024),
    xFollowers: Math.max(0, Number(row.xFollowers || 0) || 0),
    tips: tips
      .map((tip) => ({
        from: normalizeAddress(tip?.from || tip?.address || "") || ethers.ZeroAddress,
        txHash: sanitizeAlphaText(tip?.txHash || "", 120),
        amount: sanitizeAlphaText(tip?.amount || "0", 40),
        chainId: parseChainId(tip?.chainId || chainId) || chainId,
        createdAt: Number(tip?.createdAt || Math.floor(Date.now() / 1000))
      }))
      .filter((tip) => tip.txHash || Number(tip.amount || 0) > 0)
      .slice(-500),
    upvotes: [...new Set(upvotes.map((address) => address.toLowerCase()))].slice(-2000),
    downvotes: [...new Set(downvotes.map((address) => address.toLowerCase()))].slice(-2000),
    comments: comments
      .map((comment) => normalizeAlphaComment(comment, id))
      .filter(Boolean)
      .slice(-500),
    unlocks: [...new Set(unlocks.map((address) => address.toLowerCase()))].slice(-1000),
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function alphaPublicTip(tip = {}, options = {}) {
  const unlocked = options.unlocked !== false;
  const totalNativeTips = (Array.isArray(tip.tips) ? tip.tips : []).reduce((sum, row) => sum + (Number(row.amount || 0) || 0), 0);
  return {
    id: tip.id,
    title: tip.title,
    projectName: tip.projectName,
    tokenSymbol: tip.tokenSymbol,
    tokenAddress: tip.tokenAddress,
    chainId: tip.chainId,
    minBalance: tip.minBalance,
    category: tip.category,
    confidence: tip.confidence,
    teaser: tip.teaser,
    body: tip.body || "",
    evidenceUrl: tip.evidenceUrl || "",
    evidenceType: tip.evidenceType || "",
    author: tip.author,
    authorName: tip.authorName,
    authorWallet: tip.authorWallet,
    xHandle: tip.xHandle,
    xName: tip.xName,
    xImage: tip.xImage,
    xFollowers: tip.xFollowers,
    createdAt: tip.createdAt,
    unlocked,
    unlockCount: Array.isArray(tip.unlocks) ? tip.unlocks.length : 0,
    tipCount: Array.isArray(tip.tips) ? tip.tips.length : 0,
    upvotes: Array.isArray(tip.upvotes) ? tip.upvotes.length : 0,
    downvotes: Array.isArray(tip.downvotes) ? tip.downvotes.length : 0,
    comments: Array.isArray(tip.comments) ? tip.comments : [],
    totalNativeTips
  };
}

function normalizeAlphaComment(row = {}, tipId = "") {
  const author = normalizeAddress(row.author || row.address || "");
  const body = sanitizeAlphaText(row.body || "", 260);
  if (!author || !body) return null;
  return {
    id: normalizeAlphaId(row.id || `alpha-comment-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
    tipId: normalizeAlphaId(row.tipId || tipId || ""),
    author,
    xHandle: normalizeXHandle(row.xHandle || ""),
    xName: sanitizeAlphaText(row.xName || "", 80),
    xImage: String(row.xImage || "").trim().slice(0, 1024),
    xFollowers: Math.max(0, Number(row.xFollowers || 0) || 0),
    body,
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function sanitizeAlphaStore(store) {
  const base = store && typeof store === "object" && !Array.isArray(store) ? store : emptyAlphaStore();
  return {
    tips: (Array.isArray(base.tips) ? base.tips : []).map(normalizeAlphaTip).filter(Boolean)
  };
}

function readAlphaDb() {
  if (alphaDbCache && typeof alphaDbCache === "object") return alphaDbCache;
  try {
    if (fs.existsSync(ALPHA_DB_PATH)) {
      alphaDbCache = sanitizeAlphaStore(JSON.parse(fs.readFileSync(ALPHA_DB_PATH, "utf8") || "{}"));
      return alphaDbCache;
    }
  } catch {
    // fall through
  }
  alphaDbCache = emptyAlphaStore();
  return alphaDbCache;
}

function writeAlphaDb(store) {
  const safe = sanitizeAlphaStore(store);
  fs.mkdirSync(path.dirname(ALPHA_DB_PATH), { recursive: true });
  fs.writeFileSync(ALPHA_DB_PATH, JSON.stringify(safe, null, 2));
  alphaDbCache = safe;
  return safe;
}

async function readAlphaDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_ALPHA_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_ALPHA_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase alpha read failed: ${response.status} ${text}`.trim());
  }
  return sanitizeAlphaStore(await response.json().catch(() => emptyAlphaStore()));
}

async function writeAlphaDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_ALPHA_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_ALPHA_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizeAlphaStore(store), null, 2)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase alpha write failed: ${response.status} ${text}`.trim());
  }
  return true;
}

async function readAlphaDbPersistent(options = {}) {
  const refresh = Boolean(options.refresh);
  if (isSupabaseStorageConfigured() && (refresh || !alphaDbRemoteLoaded)) {
    try {
      const remote = await readAlphaDbRemote();
      if (remote) {
        alphaDbCache = remote;
        writeAlphaDb(remote);
      }
      alphaDbRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase alpha read failed: ${error?.message || "connection error"}`);
      alphaDbRemoteLoaded = true;
    }
  }
  return sanitizeAlphaStore(readAlphaDb());
}

async function writeAlphaDbPersistent(store) {
  const safe = writeAlphaDb(store);
  if (isSupabaseStorageConfigured()) {
    await writeAlphaDbRemote(safe);
  }
  return safe;
}

function alphaStats(store = readAlphaDb()) {
  const tips = (store.tips || []).map(normalizeAlphaTip).filter(Boolean);
  const now = Math.floor(Date.now() / 1000);
  const ratings = tips.reduce((sum, tip) => sum + (Array.isArray(tip.upvotes) ? tip.upvotes.length : 0) + (Array.isArray(tip.downvotes) ? tip.downvotes.length : 0), 0);
  const tipEvents = tips.reduce((sum, tip) => sum + (Array.isArray(tip.tips) ? tip.tips.length : 0), 0);
  const projects = new Set(tips.map((tip) => String(tip.tokenAddress || "").toLowerCase()).filter(Boolean));
  return {
    tips: tips.length,
    projects: projects.size,
    unlocks: ratings,
    ratings,
    tipEvents,
    last24h: tips.filter((tip) => Number(tip.createdAt || 0) >= now - 24 * 60 * 60).length,
    hotProjects: [...tips]
      .sort((a, b) => {
        const bScore = (b.upvotes || []).length * 3 - (b.downvotes || []).length + (b.comments || []).length * 2 + (b.tips || []).length * 4 + Number(b.createdAt || 0) / 1_000_000;
        const aScore = (a.upvotes || []).length * 3 - (a.downvotes || []).length + (a.comments || []).length * 2 + (a.tips || []).length * 4 + Number(a.createdAt || 0) / 1_000_000;
        return bScore - aScore;
      })
      .slice(0, 5)
      .map((tip) => alphaPublicTip(tip))
  };
}

function sanitizeCommunityText(value, max = 280) {
  return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

function normalizeXHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .split(/[/?#]/)[0]
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 15);
}

function pseudoAddressForXHandle(handle) {
  const normalized = normalizeXHandle(handle);
  if (!normalized) return "";
  const digest = crypto.createHash("sha256").update(`x:${normalized.toLowerCase()}`).digest("hex").slice(0, 40);
  return normalizeAddress(`0x${digest}`);
}

function communityPostId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCommunityPost(row = {}) {
  const token = normalizeAddress(row.token || row.tokenAddress || "");
  const author = normalizeAddress(row.author || row.address || "");
  if (!token || !author) return null;
  const id = String(row.id || communityPostId());
  const createdAt = Number(row.createdAt || Math.floor(Date.now() / 1000));
  const likes = Array.isArray(row.likes) ? row.likes.map(normalizeAddress).filter(Boolean) : [];
  const comments = Array.isArray(row.comments) ? row.comments : [];
  return {
    id,
    token,
    author,
    xHandle: normalizeXHandle(row.xHandle || ""),
    xName: sanitizeCommunityText(row.xName || "", 80),
    xImage: String(row.xImage || "").trim().slice(0, 1024),
    xFollowers: Math.max(0, Number(row.xFollowers || 0) || 0),
    body: sanitizeCommunityText(row.body || ""),
    createdAt: Number.isFinite(createdAt) ? createdAt : Math.floor(Date.now() / 1000),
    likes: [...new Set(likes.map((address) => address.toLowerCase()))],
    comments: comments
      .map((comment) => normalizeCommunityComment(comment, id))
      .filter(Boolean)
      .slice(0, 100)
  };
}

function normalizeCommunityComment(row = {}, postId = "") {
  const author = normalizeAddress(row.author || row.address || "");
  if (!author) return null;
  const createdAt = Number(row.createdAt || Math.floor(Date.now() / 1000));
  return {
    id: String(row.id || communityPostId()),
    postId: String(row.postId || postId || ""),
    author,
    xHandle: normalizeXHandle(row.xHandle || ""),
    xName: sanitizeCommunityText(row.xName || "", 80),
    xImage: String(row.xImage || "").trim().slice(0, 1024),
    xFollowers: Math.max(0, Number(row.xFollowers || 0) || 0),
    body: sanitizeCommunityText(row.body || "", 180),
    createdAt: Number.isFinite(createdAt) ? createdAt : Math.floor(Date.now() / 1000)
  };
}

function listCommunityPosts(tokenAddress, limit = 60, storeOverride = null) {
  const token = normalizeAddress(tokenAddress || "");
  if (!token) return [];
  const store = storeOverride || readCommunityDb();
  const posts = Array.isArray(store.posts) ? store.posts : [];
  return posts
    .map(normalizeCommunityPost)
    .filter((post) => post && post.token.toLowerCase() === token.toLowerCase())
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 60))));
}

function listAllCommunityPosts(limit = 80, storeOverride = null) {
  const store = storeOverride || readCommunityDb();
  const posts = Array.isArray(store.posts) ? store.posts : [];
  return posts
    .map(normalizeCommunityPost)
    .filter(Boolean)
    .sort((a, b) => {
      const bScore = (Array.isArray(b.likes) ? b.likes.length : 0) + (Array.isArray(b.comments) ? b.comments.length : 0) * 2;
      const aScore = (Array.isArray(a.likes) ? a.likes.length : 0) + (Array.isArray(a.comments) ? a.comments.length : 0) * 2;
      if (bScore !== aScore) return bScore - aScore;
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    })
    .slice(0, Math.max(1, Math.min(120, Number(limit || 80))));
}

function communityStatsForToken(tokenAddress, storeOverride = null) {
  const posts = listCommunityPosts(tokenAddress, 500, storeOverride);
  const now = Math.floor(Date.now() / 1000);
  const posts24h = posts.filter((post) => Number(post.createdAt || 0) >= now - 24 * 60 * 60).length;
  const comments = posts.reduce((sum, post) => sum + (Array.isArray(post.comments) ? post.comments.length : 0), 0);
  const members = new Set();
  for (const post of posts) {
    members.add(post.author.toLowerCase());
    for (const comment of post.comments || []) members.add(comment.author.toLowerCase());
  }
  return { posts: posts.length, posts24h, comments, members: members.size };
}

function communityStatsByToken(storeOverride = null) {
  const out = new Map();
  for (const post of listAllCommunityPosts(1000, storeOverride)) {
    const key = post.token.toLowerCase();
    const prev = out.get(key) || { token: post.token, posts: 0, likes: 0, comments: 0, latestAt: 0, members: new Set() };
    prev.posts += 1;
    prev.likes += Array.isArray(post.likes) ? post.likes.length : 0;
    prev.comments += Array.isArray(post.comments) ? post.comments.length : 0;
    prev.latestAt = Math.max(prev.latestAt, Number(post.createdAt || 0));
    prev.members.add(post.author.toLowerCase());
    for (const comment of post.comments || []) prev.members.add(String(comment.author || "").toLowerCase());
    out.set(key, prev);
  }
  return out;
}

function emptyGoStore() {
  const now = Math.floor(Date.now() / 1000);
  return {
    bounties: [
      {
        id: "go-spray-wall",
        title: "Spray paint a wall with the ticker $Pump-r",
        description: "Create a real-world photo or video showing the $Pump-r ticker on a wall, sign, or public-safe surface.",
        deliverables: ["Photo or video proof", "Ticker must be readable", "No illegal or unsafe activity"],
        rewardUsd: 206.92,
        tokenSymbol: "Pump-r",
        tokenAmount: 3,
        tokenUnit: "ETH",
        creator: "0xEF1F5aa00C169B2F5ca4f4ab47350e7DB17c84D3",
        creatorName: "Pump-r",
        status: "open",
        imageUri: "/assets/pump-r-logo.png",
        createdAt: now - 23 * 60,
        endsAt: now + 3 * 24 * 60 * 60
      },
      {
        id: "go-stream-clip",
        title: "Stream snipe a famous creator and get the clip",
        description: "Clip a live creator seeing or reacting to a Pump-r token mention.",
        deliverables: ["Clip link", "Creator visible or audible", "Ticker or token mention included"],
        rewardUsd: 689.45,
        tokenSymbol: "PUMPVERSE",
        tokenAmount: 10,
        tokenUnit: "MON",
        creator: "0x024469De02f5efFc7c10667f3e2A852Bd4a5149f",
        creatorName: "PumpVerse",
        status: "open",
        imageUri: "/assets/pump-r-logo.png",
        createdAt: now - 26 * 60,
        endsAt: now + 3 * 24 * 60 * 60
      },
      {
        id: "go-x-account",
        title: "Make an official X account for $PUMPVERSE",
        description: "Create clean X branding for the token and post the first launch thread.",
        deliverables: ["X profile screenshot", "Launch thread URL", "DM credentials to the bounty creator"],
        rewardUsd: 41.37,
        tokenSymbol: "PUMPVERSE",
        tokenAmount: 0.6,
        tokenUnit: "ETH",
        creator: "0x73230F236c6929192659fd6e8f527303A61325f2",
        creatorName: "Monad builder",
        status: "open",
        imageUri: "",
        createdAt: now - 17 * 60,
        endsAt: now + 30 * 24 * 60 * 60
      }
    ],
    submissions: [
      {
        id: "sub-demo-wall",
        bountyId: "go-spray-wall",
        author: "0x9bD6814208c60c773E07da8C772Bf5ea8311fC0C",
        authorName: "raresalmonhonor",
        body: "It's done sir!",
        mediaUrl: "/assets/pump-r-logo.png",
        likes: [],
        createdAt: now - 16 * 60
      }
    ]
  };
}

function sanitizeGoText(value, max = 500) {
  return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

function sanitizeGoUrl(value) {
  const text = String(value || "").trim().slice(0, 1024);
  if (!text) return "";
  if (text.startsWith("/") || /^https?:\/\//i.test(text) || text.startsWith("data:image/")) return text;
  return "";
}

function normalizeGoId(value, fallbackPrefix = "go") {
  return sanitizeGoText(value || `${fallbackPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function normalizeGoBounty(row = {}) {
  const id = normalizeGoId(row.id, "go");
  const title = sanitizeGoText(row.title || "", 140);
  if (!id || !title) return null;
  const now = Math.floor(Date.now() / 1000);
  const deliverables = Array.isArray(row.deliverables)
    ? row.deliverables.map((item) => sanitizeGoText(item, 140)).filter(Boolean).slice(0, 8)
    : String(row.deliverables || "")
        .split(/\n|,/)
        .map((item) => sanitizeGoText(item, 140))
        .filter(Boolean)
        .slice(0, 8);
  return {
    id,
    title,
    description: sanitizeGoText(row.description || "", 900),
    deliverables,
    rewardUsd: Math.max(0, Number(row.rewardUsd || row.reward || 0) || 0),
    tokenSymbol: sanitizeGoText(row.tokenSymbol || "Pump-r", 24).replace(/^\$/, "").toUpperCase(),
    tokenAmount: Math.max(0, Number(row.tokenAmount || 0) || 0),
    tokenUnit: sanitizeGoText(row.tokenUnit || "ETH", 16).toUpperCase(),
    payoutChainId: parseChainId(row.payoutChainId || row.chainId || 1) || 1,
    escrowAddress: normalizeAddress(row.escrowAddress || "") || "",
    escrowTxHash: sanitizeGoText(row.escrowTxHash || "", 120),
    releaseTxHash: sanitizeGoText(row.releaseTxHash || "", 120),
    escrowStatus: ["funded", "released", "refunded"].includes(String(row.escrowStatus || "").toLowerCase())
      ? String(row.escrowStatus || "").toLowerCase()
      : "unfunded",
    winnerSubmissionId: normalizeGoId(row.winnerSubmissionId || "", "sub"),
    winnerAddress: normalizeAddress(row.winnerAddress || "") || "",
    creator: normalizeAddress(row.creator || row.address || "") || ethers.ZeroAddress,
    creatorName: sanitizeGoText(row.creatorName || row.xHandle || "", 80),
    status: String(row.status || "open").toLowerCase() === "closed" ? "closed" : "open",
    imageUri: sanitizeGoUrl(row.imageUri || row.mediaUrl || ""),
    createdAt: Number(row.createdAt || now),
    endsAt: Number(row.endsAt || now + 3 * 24 * 60 * 60)
  };
}

function goEscrowAddressForChain(chainId) {
  const id = parseChainId(chainId);
  const defaults = {
    1: "0x72C17284180122A94866bbb54BcE0060Af172832",
    143: "0x2fe6a113c7C5c0696A02676cCfC2235539424c89"
  };
  const direct = String(process.env[`GO_ESCROW_ADDRESS_${id}`] || process.env[`BOUNTY_ESCROW_ADDRESS_${id}`] || "").trim();
  const fallback =
    id === 1
      ? String(process.env.GO_ESCROW_ADDRESS || process.env.BOUNTY_ESCROW_ADDRESS || "").trim()
      : "";
  const address = direct || fallback || defaults[id] || "";
  return ethers.isAddress(address) ? ethers.getAddress(address) : "";
}

function goEscrowConfig() {
  return [1, 8453, 143, 101].map((chainId) => {
    const meta = CHAIN_META[chainId] || {};
    const escrowAddress = goEscrowAddressForChain(chainId);
    return {
      chainId,
      name: meta.name || String(chainId),
      shortName: meta.shortName || String(chainId),
      nativeCurrency: meta.nativeCurrency || "ETH",
      escrowAddress,
      enabled: Boolean(escrowAddress)
    };
  });
}

function officialAirdropConfig() {
  const rawToken = String(
    process.env.AIRDROP_TOKEN_ADDRESS ||
      process.env.OFFICIAL_AIRDROP_TOKEN ||
      process.env.PUMPR_AIRDROP_TOKEN ||
      process.env.ETHERPUMP_AIRDROP_TOKEN ||
      ""
  ).trim();
  const chainId = parseChainId(
    process.env.AIRDROP_CHAIN_ID ||
      process.env.OFFICIAL_AIRDROP_CHAIN_ID ||
      process.env.PUMPR_AIRDROP_CHAIN_ID ||
      process.env.ETHERPUMP_AIRDROP_CHAIN_ID ||
      "1"
  ) || 1;
  const quoteMode = normalizeQuoteMode(process.env.AIRDROP_QUOTE_MODE || process.env.OFFICIAL_AIRDROP_QUOTE || "native");
  const token = chainId === 101 ? normalizeSolanaAddress(rawToken) : normalizeAddress(rawToken);
  return {
    configured: Boolean(token),
    token,
    chainId,
    chainName: CHAIN_META[chainId]?.name || `Chain ${chainId}`,
    chainShortName: CHAIN_META[chainId]?.shortName || String(chainId),
    quoteMode,
    name: String(process.env.AIRDROP_TOKEN_NAME || process.env.OFFICIAL_AIRDROP_TOKEN_NAME || "Pump-r").trim(),
    symbol: String(process.env.AIRDROP_TOKEN_SYMBOL || process.env.OFFICIAL_AIRDROP_TOKEN_SYMBOL || "Pump-r").trim().replace(/^\$/, "").toUpperCase(),
    message: String(
      process.env.AIRDROP_MESSAGE ||
        "After the official Pump-r token launches, creator rewards will be routed back to top holders from this page."
    ).trim()
  };
}

async function buildSolanaAirdropPreview(rawToken, limit = 20) {
  const { Connection: SolanaConnection, PublicKey: SolanaPublicKey } = await loadSolanaWeb3();
  const mintText = String(rawToken || "").trim();
  let mint;
  try {
    mint = new SolanaPublicKey(mintText);
  } catch {
    throw new Error("Valid Solana token mint is required");
  }

  const rpcUrl = String(process.env.SOLANA_RPC_URL || process.env.PUMPFUN_SOLANA_RPC_URL || CHAIN_META[101].rpcUrls[0]).trim();
  const connection = new SolanaConnection(rpcUrl, "confirmed");
  const [largestAccounts, mintInfo] = await Promise.all([
    connection.getTokenLargestAccounts(mint),
    connection.getParsedAccountInfo(mint).catch(() => ({ value: null }))
  ]);
  const mintParsed = mintInfo?.value?.data?.parsed?.info || {};
  const supplyRaw = BigInt(String(mintParsed.supply || "0"));
  const decimals = Number(mintParsed.decimals ?? largestAccounts?.value?.[0]?.decimals ?? 6) || 6;
  const accounts = (largestAccounts?.value || []).slice(0, Math.max(3, Math.min(50, Number(limit || 20))));
  const owners = await Promise.all(
    accounts.map(async (account) => {
      const info = await connection.getParsedAccountInfo(account.address).catch(() => ({ value: null }));
      const owner = info?.value?.data?.parsed?.info?.owner || account.address.toBase58();
      const amountRaw = BigInt(String(account.amount || "0"));
      return {
        address: owner,
        label: "holder",
        balanceWei: amountRaw.toString(),
        balanceTokens: Number(account.uiAmountString || account.uiAmount || 0) || Number(amountRaw) / 10 ** decimals,
        holderPct: supplyRaw > 0n ? Number((amountRaw * 10000n) / supplyRaw) / 100 : 0,
        allocationWei: "0",
        allocationTokens: 0
      };
    })
  );

  const totalHolderBalance = owners.reduce((sum, row) => sum + BigInt(row.balanceWei || "0"), 0n);
  return {
    chainId: 101,
    chainName: CHAIN_META[101]?.name || "Solana",
    token: mint.toBase58(),
    pool: "",
    name: "Solana token",
    symbol: "SOL",
    creator: "",
    quoteMode: "native",
    claimableWei: "0",
    claimableTokens: 0,
    claimedWei: "0",
    claimedTokens: 0,
    holderCount: owners.length,
    totalHolderBalanceWei: totalHolderBalance.toString(),
    totalHolderBalanceTokens: owners.reduce((sum, row) => sum + Number(row.balanceTokens || 0), 0),
    marketCapUsd: 0,
    allocations: owners
  };
}

function normalizeGoSubmission(row = {}) {
  const bountyId = normalizeGoId(row.bountyId || "", "go");
  const body = sanitizeGoText(row.body || "", 700);
  if (!bountyId || !body) return null;
  const likes = Array.isArray(row.likes) ? row.likes.map(normalizeAddress).filter(Boolean) : [];
  const links = Array.isArray(row.links)
    ? row.links.map(sanitizeGoUrl).filter(Boolean).slice(0, 5)
    : String(row.links || "")
        .split(/\s+/)
        .map(sanitizeGoUrl)
        .filter(Boolean)
        .slice(0, 5);
  return {
    id: normalizeGoId(row.id, "sub"),
    bountyId,
    author: normalizeAddress(row.author || row.address || "") || ethers.ZeroAddress,
    authorName: sanitizeGoText(row.authorName || row.xHandle || "", 80),
    body,
    mediaUrl: sanitizeGoUrl(row.mediaUrl || ""),
    links,
    likes: [...new Set(likes.map((address) => address.toLowerCase()))],
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function sanitizeGoStore(store) {
  const base = store && typeof store === "object" && !Array.isArray(store) ? store : emptyGoStore();
  return {
    bounties: (Array.isArray(base.bounties) ? base.bounties : []).map(normalizeGoBounty).filter(Boolean),
    submissions: (Array.isArray(base.submissions) ? base.submissions : []).map(normalizeGoSubmission).filter(Boolean)
  };
}

function readGoDb() {
  if (goDbCache && typeof goDbCache === "object") return goDbCache;
  try {
    if (fs.existsSync(GO_DB_PATH)) {
      goDbCache = sanitizeGoStore(JSON.parse(fs.readFileSync(GO_DB_PATH, "utf8") || "{}"));
      return goDbCache;
    }
  } catch {
    // fall through to seeded store
  }
  goDbCache = emptyGoStore();
  return goDbCache;
}

function writeGoDb(store) {
  const safe = sanitizeGoStore(store);
  fs.mkdirSync(path.dirname(GO_DB_PATH), { recursive: true });
  fs.writeFileSync(GO_DB_PATH, JSON.stringify(safe, null, 2));
  goDbCache = safe;
  return safe;
}

function decorateGoBounty(bounty, store = readGoDb()) {
  const id = String(bounty?.id || "").toLowerCase();
  const submissions = (store.submissions || []).filter((row) => String(row.bountyId || "").toLowerCase() === id).length;
  const now = Math.floor(Date.now() / 1000);
  return {
    ...bounty,
    submissions,
    secondsLeft: Math.max(0, Number(bounty.endsAt || 0) - now)
  };
}

async function createCommunityPost(value = {}) {
  const token = normalizeAddress(value.token || value.tokenAddress || "");
  const xHandle = normalizeXHandle(value.xHandle || "");
  const author = normalizeAddress(value.author || value.address || "") || pseudoAddressForXHandle(xHandle);
  const body = sanitizeCommunityText(value.body || "");
  if (!token) throw new Error("token is required");
  if (!author) throw new Error("author is required");
  if (!body) throw new Error("post text is required");
  const store = await readCommunityDbPersistent();
  const post = normalizeCommunityPost({
    id: communityPostId(),
    token,
    author,
    xHandle,
    xName: value.xName || "",
    xImage: value.xImage || "",
    xFollowers: value.xFollowers || 0,
    body,
    createdAt: Math.floor(Date.now() / 1000),
    likes: [],
    comments: []
  });
  store.posts = [post, ...(Array.isArray(store.posts) ? store.posts : [])].slice(0, 2000);
  await writeCommunityDbPersistent(store);
  return post;
}

async function createCommunityComment(postId, value = {}) {
  const id = String(postId || "");
  const xHandle = normalizeXHandle(value.xHandle || "");
  const author = normalizeAddress(value.author || value.address || "") || pseudoAddressForXHandle(xHandle);
  const body = sanitizeCommunityText(value.body || "", 180);
  if (!id) throw new Error("post id is required");
  if (!author) throw new Error("author is required");
  if (!body) throw new Error("comment text is required");
  const store = await readCommunityDbPersistent();
  const posts = Array.isArray(store.posts) ? store.posts : [];
  const post = posts.find((row) => String(row?.id || "") === id);
  if (!post) throw new Error("post not found");
  const comment = normalizeCommunityComment({
    id: communityPostId(),
    postId: id,
    author,
    xHandle,
    xName: value.xName || "",
    xImage: value.xImage || "",
    xFollowers: value.xFollowers || 0,
    body,
    createdAt: Math.floor(Date.now() / 1000)
  }, id);
  post.comments = [...(Array.isArray(post.comments) ? post.comments : []), comment].slice(-100);
  await writeCommunityDbPersistent(store);
  return normalizeCommunityPost(post);
}

async function setCommunityLike(postId, address, liked) {
  const id = String(postId || "");
  const viewer = normalizeAddress(address || "");
  if (!id) throw new Error("post id is required");
  if (!viewer) throw new Error("address is required");
  const store = await readCommunityDbPersistent();
  const posts = Array.isArray(store.posts) ? store.posts : [];
  const post = posts.find((row) => String(row?.id || "") === id);
  if (!post) throw new Error("post not found");
  const likes = new Set((Array.isArray(post.likes) ? post.likes : []).map((row) => String(row || "").toLowerCase()));
  if (liked) likes.add(viewer.toLowerCase());
  else likes.delete(viewer.toLowerCase());
  post.likes = [...likes];
  await writeCommunityDbPersistent(store);
  return normalizeCommunityPost(post);
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlText(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(text.padEnd(text.length + ((4 - text.length % 4) % 4), "="), "base64").toString("utf8");
}

function makePkceVerifier() {
  return base64Url(crypto.randomBytes(64)).slice(0, 96);
}

function makePkceChallenge(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function pruneXOAuthStates() {
  const now = Date.now();
  for (const [key, value] of xOauthStates.entries()) {
    if (!value?.expiresAt || value.expiresAt <= now) xOauthStates.delete(key);
  }
}

function safeLocalReturnTo(value) {
  const requested = String(value || "/communities");
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/communities";
}

function parseCookieHeader(header = "") {
  return String(header || "").split(";").reduce((cookies, entry) => {
    const index = entry.indexOf("=");
    if (index <= 0) return cookies;
    const key = entry.slice(0, index).trim();
    const value = entry.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function xOAuthCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: publicOriginFromRequest(req).startsWith("https://"),
    maxAge: 10 * 60 * 1000,
    path: "/api/x/oauth"
  };
}

function readXOAuthCookie(req, stateId) {
  try {
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const payload = JSON.parse(decodeBase64UrlText(cookies.etherpump_x_oauth || ""));
    if (String(payload?.stateId || "") !== String(stateId || "")) return null;
    if (!payload?.expiresAt || Number(payload.expiresAt) <= Date.now()) return null;
    return {
      returnTo: safeLocalReturnTo(payload.returnTo),
      codeVerifier: String(payload.codeVerifier || ""),
      expiresAt: Number(payload.expiresAt || 0)
    };
  } catch {
    return null;
  }
}

function publicOriginFromRequest(req) {
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const forwardedHost = String(req.get("x-forwarded-host") || "").split(",")[0].trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function xCallbackUrl(req) {
  const configured = String(process.env.X_CALLBACK_URL || "").trim();
  const origin = publicOriginFromRequest(req);
  const host = String(req.get("host") || "").toLowerCase();
  if (host.startsWith("localhost:") || host.startsWith("127.0.0.1:")) {
    return `${origin}/api/x/oauth/callback`;
  }
  if (configured) return configured;
  return `${origin}/api/x/oauth/callback`;
}

function followEdgeKey(followerAddress, followeeAddress) {
  return `${String(followerAddress || "").toLowerCase()}=>${String(followeeAddress || "").toLowerCase()}`;
}

function parseFollowTimestamp(value) {
  const unix = parseUnixTimestamp(value);
  return unix > 0 ? unix : Math.floor(Date.now() / 1000);
}

function normalizeFollowEdge(row = {}) {
  const follower = normalizeAddress(row.follower || row.from || row.address || "");
  const followee = normalizeAddress(row.followee || row.target || row.to || "");
  if (!follower || !followee) return null;
  return {
    follower,
    followee,
    createdAt: parseFollowTimestamp(row.createdAt || row.created_at || row.inserted_at || row.createdon || row.ts)
  };
}

function listFollowEdgesFromStore(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return { followers: [], following: [] };
  }

  const followers = [];
  const following = [];
  const store = readFollowDb();
  for (const value of Object.values(store)) {
    const edge = normalizeFollowEdge(value);
    if (!edge) continue;
    if (edge.followee.toLowerCase() === normalized.toLowerCase()) {
      followers.push(edge);
    }
    if (edge.follower.toLowerCase() === normalized.toLowerCase()) {
      following.push(edge);
    }
  }

  followers.sort((a, b) => b.createdAt - a.createdAt);
  following.sort((a, b) => b.createdAt - a.createdAt);
  return { followers, following };
}

function hasFollowInStore(followerAddress, followeeAddress) {
  const follower = normalizeAddress(followerAddress);
  const followee = normalizeAddress(followeeAddress);
  if (!follower || !followee) return false;
  const store = readFollowDb();
  return Boolean(store[followEdgeKey(follower, followee)]);
}

function setFollowInStore(followerAddress, followeeAddress, follow = true) {
  const follower = normalizeAddress(followerAddress);
  const followee = normalizeAddress(followeeAddress);
  if (!follower || !followee) throw new Error("Invalid follow addresses");

  const key = followEdgeKey(follower, followee);
  const store = readFollowDb();

  if (follow) {
    store[key] = {
      follower: follower.toLowerCase(),
      followee: followee.toLowerCase(),
      createdAt: Math.floor(Date.now() / 1000)
    };
  } else {
    delete store[key];
  }

  writeFollowDb(store);
}

function isSupabaseFollowConfigured() {
  return Boolean(isSupabaseConfigured() && SUPABASE_FOLLOW_TABLE);
}

function allowFileFollowFallback() {
  // Local/dev can fall back to file store. Production serverless should be strict.
  if (STRICT_SOCIAL_STORE) return false;
  return true;
}

function assertFollowStoreConfigured() {
  if (!STRICT_SOCIAL_STORE) return;
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Follow store requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in strict mode"
    );
  }
  if (!SUPABASE_FOLLOW_TABLE) {
    throw new Error("Follow store requires SUPABASE_FOLLOW_TABLE in strict mode");
  }
}

async function getSupabaseFollowEdgesForAddress(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return { followers: [], following: [] };
  }

  const key = normalized.toLowerCase();
  const [followersRows, followingRows] = await Promise.all([
    supabaseRequest(SUPABASE_FOLLOW_TABLE, {
      query: {
        select: "*",
        followee: `eq.${key}`
      }
    }),
    supabaseRequest(SUPABASE_FOLLOW_TABLE, {
      query: {
        select: "*",
        follower: `eq.${key}`
      }
    })
  ]);

  const followers = (Array.isArray(followersRows) ? followersRows : [])
    .map((row) => normalizeFollowEdge(row))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
  const following = (Array.isArray(followingRows) ? followingRows : [])
    .map((row) => normalizeFollowEdge(row))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);

  return { followers, following };
}

async function hasSupabaseFollow(followerAddress, followeeAddress) {
  const follower = normalizeAddress(followerAddress);
  const followee = normalizeAddress(followeeAddress);
  if (!follower || !followee) return false;

  const rows = await supabaseRequest(SUPABASE_FOLLOW_TABLE, {
    query: {
      select: "follower,followee",
      follower: `eq.${follower.toLowerCase()}`,
      followee: `eq.${followee.toLowerCase()}`,
      limit: 1
    }
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function setFollowInSupabase(followerAddress, followeeAddress, follow = true) {
  const follower = normalizeAddress(followerAddress);
  const followee = normalizeAddress(followeeAddress);
  if (!follower || !followee) throw new Error("Invalid follow addresses");

  if (follow) {
    await supabaseRequest(SUPABASE_FOLLOW_TABLE, {
      method: "POST",
      query: {
        on_conflict: "follower,followee"
      },
      body: [
        {
          follower: follower.toLowerCase(),
          followee: followee.toLowerCase()
        }
      ],
      prefer: "resolution=merge-duplicates,return=minimal"
    });
    return;
  }

  await supabaseRequest(SUPABASE_FOLLOW_TABLE, {
    method: "DELETE",
    query: {
      follower: `eq.${follower.toLowerCase()}`,
      followee: `eq.${followee.toLowerCase()}`
    }
  });
}

function mapFollowRows(edges = [], mode = "followers") {
  return edges.map((edge) => {
    const address = mode === "followers" ? edge.follower : edge.followee;
    return {
      address,
      interactions: 1,
      details: [mode === "followers" ? "Follower" : "Following"],
      createdAt: edge.createdAt
    };
  });
}

async function getPersistedSocialGraph(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return { followers: [], following: [] };
  }

  assertFollowStoreConfigured();

  try {
    if (isSupabaseFollowConfigured()) {
      const edges = await getSupabaseFollowEdgesForAddress(normalized);
      return {
        followers: mapFollowRows(edges.followers, "followers"),
        following: mapFollowRows(edges.following, "following")
      };
    }
  } catch (error) {
    if (isSupabaseMissingTableError(error)) {
      if (!allowFileFollowFallback()) {
        return { followers: [], following: [] };
      }
      const edges = listFollowEdgesFromStore(normalized);
      return {
        followers: mapFollowRows(edges.followers, "followers"),
        following: mapFollowRows(edges.following, "following")
      };
    }
    if (!allowFileFollowFallback()) {
      throw new Error(`Supabase follow read failed: ${error?.message || "connection error"}`);
    }
    console.warn(`Supabase follow read failed: ${error?.message || "connection error"}`);
  }

  if (!allowFileFollowFallback()) {
    throw new Error("Supabase follow store is unavailable in strict mode");
  }
  const edges = listFollowEdgesFromStore(normalized);
  return {
    followers: mapFollowRows(edges.followers, "followers"),
    following: mapFollowRows(edges.following, "following")
  };
}

async function getFollowState(viewerAddress, targetAddress) {
  const viewer = normalizeAddress(viewerAddress);
  const target = normalizeAddress(targetAddress);
  if (!viewer || !target) {
    return { viewer, target, isFollowing: false, followersCount: 0, followingCount: 0 };
  }

  assertFollowStoreConfigured();

  try {
    if (isSupabaseFollowConfigured()) {
      const [isFollowing, targetSocial, viewerSocial] = await Promise.all([
        hasSupabaseFollow(viewer, target),
        getSupabaseFollowEdgesForAddress(target),
        getSupabaseFollowEdgesForAddress(viewer)
      ]);
      return {
        viewer,
        target,
        isFollowing,
        followersCount: targetSocial.followers.length,
        followingCount: viewerSocial.following.length
      };
    }
  } catch (error) {
    if (isSupabaseMissingTableError(error)) {
      if (!allowFileFollowFallback()) {
        return {
          viewer,
          target,
          isFollowing: false,
          followersCount: 0,
          followingCount: 0
        };
      }
      const targetSocial = listFollowEdgesFromStore(target);
      const viewerSocial = listFollowEdgesFromStore(viewer);
      return {
        viewer,
        target,
        isFollowing: hasFollowInStore(viewer, target),
        followersCount: targetSocial.followers.length,
        followingCount: viewerSocial.following.length
      };
    }
    if (!allowFileFollowFallback()) {
      throw new Error(`Supabase follow state failed: ${error?.message || "connection error"}`);
    }
    console.warn(`Supabase follow state failed: ${error?.message || "connection error"}`);
  }

  if (!allowFileFollowFallback()) {
    throw new Error("Supabase follow store is unavailable in strict mode");
  }
  const targetSocial = listFollowEdgesFromStore(target);
  const viewerSocial = listFollowEdgesFromStore(viewer);
  return {
    viewer,
    target,
    isFollowing: hasFollowInStore(viewer, target),
    followersCount: targetSocial.followers.length,
    followingCount: viewerSocial.following.length
  };
}

async function setFollowState(viewerAddress, targetAddress, follow = true) {
  const viewer = normalizeAddress(viewerAddress);
  const target = normalizeAddress(targetAddress);
  if (!viewer || !target) throw new Error("Invalid address");
  if (viewer.toLowerCase() === target.toLowerCase()) {
    throw new Error("You cannot follow yourself");
  }

  assertFollowStoreConfigured();

  let persisted = false;
  try {
    if (isSupabaseFollowConfigured()) {
      await setFollowInSupabase(viewer, target, follow);
      persisted = true;
      // Keep a local mirror so follower data survives remote cache/schema outages.
      setFollowInStore(viewer, target, follow);
    }
  } catch (error) {
    if (!allowFileFollowFallback()) {
      throw new Error(`Supabase follow write failed: ${error?.message || "connection error"}`);
    }
    console.warn(`Supabase follow write failed: ${error?.message || "connection error"}`);
  }

  if (!persisted) {
    if (!allowFileFollowFallback()) {
      throw new Error("Supabase follow store is unavailable in strict mode");
    }
    setFollowInStore(viewer, target, follow);
  }

  clearProfileDependentCaches();
  return getFollowState(viewer, target);
}

function readSupportDb() {
  if (supportDbCache && typeof supportDbCache === "object") {
    return supportDbCache;
  }

  try {
    if (fs.existsSync(SUPPORT_DB_PATH)) {
      const raw = fs.readFileSync(SUPPORT_DB_PATH, "utf8");
      const parsed = JSON.parse(raw || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
        supportDbCache = { messages };
        return supportDbCache;
      }
    }
  } catch {
    // fall through to empty
  }

  supportDbCache = { messages: [] };
  return supportDbCache;
}

function writeSupportDb(store) {
  const safe = {
    messages: Array.isArray(store?.messages) ? store.messages : []
  };
  fs.mkdirSync(path.dirname(SUPPORT_DB_PATH), { recursive: true });
  fs.writeFileSync(SUPPORT_DB_PATH, JSON.stringify(safe, null, 2));
  supportDbCache = safe;
}

function normalizeSupportMessage(row = {}) {
  const id = String(row.id || "").trim();
  const fromAddress = normalizeAddress(row.fromAddress || row.from || "");
  const toAddress = normalizeAddress(row.toAddress || row.to || "");
  const subject = String(row.subject || "").trim().slice(0, 120);
  const body = String(row.body || "").trim().slice(0, 4000);
  const category = String(row.category || "").trim().slice(0, 64);
  const tokenAddress = normalizeAddress(row.tokenAddress || row.token || "");
  const createdAt = parseUnixTimestamp(row.createdAt || row.created_at || row.ts);
  if (!id || !fromAddress || !toAddress || !body || createdAt <= 0) return null;
  return {
    id,
    fromAddress,
    toAddress,
    subject: subject || "Support request",
    body,
    category: category || "general",
    tokenAddress: tokenAddress || "",
    status: String(row.status || "open"),
    createdAt
  };
}

function listSupportMessagesForAddress(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return [];
  const key = normalized.toLowerCase();
  const store = readSupportDb();
  const rows = (Array.isArray(store.messages) ? store.messages : [])
    .map((row) => normalizeSupportMessage(row))
    .filter(Boolean)
    .filter((row) => row.fromAddress.toLowerCase() === key || row.toAddress.toLowerCase() === key)
    .sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

function listSupportInbox(platformAddress) {
  const normalized = normalizeAddress(platformAddress);
  if (!normalized) return [];
  const key = normalized.toLowerCase();
  const store = readSupportDb();
  return (Array.isArray(store.messages) ? store.messages : [])
    .map((row) => normalizeSupportMessage(row))
    .filter(Boolean)
    .filter((row) => row.toAddress.toLowerCase() === key)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function createSupportMessage(payload = {}) {
  const fromAddress = normalizeAddress(payload.fromAddress || payload.from || "");
  const platformAddress = resolvePlatformSupportAddress();
  if (!fromAddress) throw new Error("fromAddress is required");
  if (!platformAddress) throw new Error("Support wallet is not configured");

  const body = String(payload.body || "").trim();
  if (!body) throw new Error("Message body is required");
  if (body.length > 4000) throw new Error("Message is too long");

  const subjectRaw = String(payload.subject || "").trim();
  const categoryRaw = String(payload.category || "").trim();
  const tokenAddress = normalizeAddress(payload.tokenAddress || "");

  const store = readSupportDb();
  const next = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    fromAddress: fromAddress.toLowerCase(),
    toAddress: platformAddress.toLowerCase(),
    subject: (subjectRaw || "Support request").slice(0, 120),
    body: body.slice(0, 4000),
    category: (categoryRaw || "general").slice(0, 64).toLowerCase(),
    tokenAddress: tokenAddress ? tokenAddress.toLowerCase() : "",
    status: "open",
    createdAt: Math.floor(Date.now() / 1000)
  };
  const normalized = normalizeSupportMessage(next);
  if (!normalized) throw new Error("Failed to create support message");
  const messages = Array.isArray(store.messages) ? store.messages : [];
  messages.push(normalized);
  if (messages.length > 2000) {
    messages.splice(0, messages.length - 2000);
  }
  writeSupportDb({ messages });
  return normalized;
}

function clearProfileDependentCaches() {
  launchesCache.clear();
  tokenCache.clear();
  profileCache.clear();
}

function isZeroAddress(input) {
  const normalized = normalizeAddress(input);
  if (!normalized) return true;
  return normalized === ethers.ZeroAddress;
}

function geckoNetworkForChain(chainId) {
  return GECKO_NETWORK_BY_CHAIN[Number(chainId)] || "eth";
}

function dexscreenerChainForChain(chainId) {
  return DEXSCREENER_CHAIN_BY_ID[Number(chainId)] || "ethereum";
}

function buildGeckoPoolUrls(chainId, pairAddress) {
  const pair = normalizeAddress(pairAddress);
  if (!pair || pair === ethers.ZeroAddress) {
    return {
      network: geckoNetworkForChain(chainId),
      poolUrl: "",
      embedUrl: "",
      apiUrl: ""
    };
  }
  const network = geckoNetworkForChain(chainId);
  return {
    network,
    poolUrl: `https://www.geckoterminal.com/${network}/pools/${pair}`,
    embedUrl: `https://www.geckoterminal.com/${network}/pools/${pair}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0`,
    apiUrl: `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pair}`
  };
}

function parseUnixTimestamp(input) {
  if (input == null) return 0;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return 0;
    if (input > 1e12) return Math.floor(input / 1000);
    return Math.floor(input);
  }

  const text = String(input).trim();
  if (!text) return 0;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    if (asNumber > 1e12) return Math.floor(asNumber / 1000);
    return Math.floor(asNumber);
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed / 1000);
  }
  return 0;
}

function expandScientificNumber(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) return text;
  const sign = match[1] || "";
  const intPart = match[2] || "0";
  const fracPart = match[3] || "";
  const exponent = Number(match[4] || "0");
  if (!Number.isFinite(exponent)) return text;

  const digits = `${intPart}${fracPart}`.replace(/^0+/, "") || "0";
  if (digits === "0") return "0";

  const decimalIndex = intPart.length + exponent;
  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function parseAmountToWei(amount, decimals = 18) {
  let raw = String(amount ?? "").trim();
  if (!raw) return 0n;
  if (/[eE]/.test(raw)) {
    raw = expandScientificNumber(raw);
  }
  try {
    return ethers.parseUnits(raw, decimals);
  } catch {
    return 0n;
  }
}

async function readGeckoPoolStatus(chainId, pairAddress) {
  const pair = normalizeAddress(pairAddress);
  const urls = buildGeckoPoolUrls(chainId, pair);
  if (!pair || pair === ethers.ZeroAddress) {
    return {
      indexed: false,
      ...urls
    };
  }

  const key = `${urls.network}:${pair.toLowerCase()}`;
  const cached = getCachedValue(geckoPoolCache, key);
  if (cached) {
    return cached;
  }

  let indexed = geckoIndexedSticky.has(key);
  let snapshot = null;
  try {
    const response = await fetch(urls.apiUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2500)
    });
    if (response.ok) {
      const payload = await response.json();
      const attr = payload?.data?.attributes || null;
      if (attr) {
        snapshot = {
          priceNative: toNumberSafe(attr.base_token_price_native_currency, 0),
          priceUsd: toNumberSafe(attr.base_token_price_usd, 0),
          marketCapUsd: toNumberSafe(attr.market_cap_usd, 0),
          fdvUsd: toNumberSafe(attr.fdv_usd, 0),
          liquidityUsd: toNumberSafe(attr.reserve_in_usd, 0),
          volume24hUsd: toNumberSafe(attr?.volume_usd?.h24, 0),
          priceChange24hPct: toNumberSafe(attr?.price_change_percentage?.h24, 0),
          tx24hBuys: toNumberSafe(attr?.transactions?.h24?.buys, 0),
          tx24hSells: toNumberSafe(attr?.transactions?.h24?.sells, 0)
        };
      }
      indexed = true;
      geckoIndexedSticky.add(key);
    }
  } catch {
    // Keep sticky true status once Gecko has indexed this pair.
    indexed = geckoIndexedSticky.has(key);
  }

  const value = {
    indexed,
    snapshot,
    ...urls
  };
  setCachedValue(geckoPoolCache, key, value, GECKO_POOL_CACHE_TTL_MS);
  return value;
}

async function readGeckoPoolTrades(chainId, pairAddress, tokenAddress, wethAddress = "") {
  const pair = normalizeAddress(pairAddress);
  if (!pair || pair === ethers.ZeroAddress) return [];

  const network = geckoNetworkForChain(chainId);
  const cacheKey = `${network}:${pair.toLowerCase()}`;
  const cached = getCachedValue(geckoTradesCache, cacheKey);
  if (cached) return cached;

  const token = normalizeAddress(tokenAddress || "");
  const weth = normalizeAddress(wethAddress || "");
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pair}/trades`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3500)
    });

    if (!response.ok) {
      setCachedValue(geckoTradesCache, cacheKey, [], GECKO_TRADES_CACHE_TTL_MS);
      return [];
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const mapped = [];

    for (const row of rows) {
      const attr = row?.attributes || {};
      const sideHint = String(attr.kind || attr.side || "").toLowerCase();
      const side = sideHint.includes("buy") ? "buy" : sideHint.includes("sell") ? "sell" : "";
      if (!side) continue;

      const fromTokenAddress = normalizeAddress(attr.from_token_address || attr.from_address || "");
      const toTokenAddress = normalizeAddress(attr.to_token_address || attr.to_address || "");
      const fromAmountWei = parseAmountToWei(attr.from_token_amount || attr.amount_in || "0", 18);
      const toAmountWei = parseAmountToWei(attr.to_token_amount || attr.amount_out || "0", 18);

      let ethAmountWei = 0n;
      let tokenAmountWei = 0n;

      if (weth && fromTokenAddress && fromTokenAddress.toLowerCase() === weth.toLowerCase()) {
        ethAmountWei = fromAmountWei;
      } else if (weth && toTokenAddress && toTokenAddress.toLowerCase() === weth.toLowerCase()) {
        ethAmountWei = toAmountWei;
      } else if (side === "buy") {
        ethAmountWei = fromAmountWei;
      } else {
        ethAmountWei = toAmountWei;
      }

      if (token && fromTokenAddress && fromTokenAddress.toLowerCase() === token.toLowerCase()) {
        tokenAmountWei = fromAmountWei;
      } else if (token && toTokenAddress && toTokenAddress.toLowerCase() === token.toLowerCase()) {
        tokenAmountWei = toAmountWei;
      } else if (side === "buy") {
        tokenAmountWei = toAmountWei;
      } else {
        tokenAmountWei = fromAmountWei;
      }

      if (ethAmountWei <= 0n || tokenAmountWei <= 0n) continue;

      const timestamp = parseUnixTimestamp(attr.block_timestamp || attr.timestamp);
      const txHash = String(attr.tx_hash || row?.id || "");
      const account = normalizeAddress(attr.tx_from_address || attr.taker || "");
      const priceWei = (ethAmountWei * 10n ** 18n) / tokenAmountWei;

      mapped.push({
        side,
        account: account || "",
        txHash,
        blockNumber: Number(attr.block_number || 0),
        logIndex: Number(attr.log_index || -1),
        timestamp,
        ethAmountWei: ethAmountWei.toString(),
        tokenAmountWei: tokenAmountWei.toString(),
        priceWei: priceWei.toString(),
        priceEth: toFloat(priceWei, 18, 18),
        source: "gecko"
      });
    }

    mapped.sort((a, b) => {
      if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
      return b.blockNumber - a.blockNumber;
    });

    const sliced = mapped.slice(0, TOKEN_TRADES_RESPONSE_LIMIT);
    setCachedValue(geckoTradesCache, cacheKey, sliced, GECKO_TRADES_CACHE_TTL_MS);
    return sliced;
  } catch {
    setCachedValue(geckoTradesCache, cacheKey, [], GECKO_TRADES_CACHE_TTL_MS);
    return [];
  }
}

function buildSparklinePathFromOhlcv(values = [], width = 112, height = 30) {
  if (!Array.isArray(values) || values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-12);
  const xStep = width / Math.max(values.length - 1, 1);

  const points = values.map((value, index) => {
    const x = index * xStep;
    const y = height - ((value - min) / span) * height;
    return [x, y];
  });

  return points.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

async function readGeckoPoolSparkline(chainId, pairAddress, options = {}) {
  const pair = normalizeAddress(pairAddress);
  if (!pair || pair === ethers.ZeroAddress) {
    return { path: "", network: geckoNetworkForChain(chainId), source: "none" };
  }

  const network = geckoNetworkForChain(chainId);
  const aggregate = Math.max(1, Math.min(60, Number(options.aggregate || 15)));
  const limit = Math.max(8, Math.min(96, Number(options.limit || 24)));
  const cacheKey = `${network}:${pair.toLowerCase()}:${aggregate}:${limit}`;
  const cached = getCachedValue(geckoSparklineCache, cacheKey);
  if (cached) {
    return cached;
  }

  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pair}/ohlcv/minute?aggregate=${aggregate}&limit=${limit}&currency=usd`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      const previous = geckoSparklineCache.get(cacheKey)?.value;
      if (response.status === 429 && previous) {
        return previous;
      }
      const empty = { path: "", network, source: "gecko-http" };
      setCachedValue(geckoSparklineCache, cacheKey, empty, 8_000);
      return empty;
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.data?.attributes?.ohlcv_list) ? payload.data.attributes.ohlcv_list : [];
    const closes = rows
      .map((row) => ({ t: Number(row?.[0] || 0), c: Number(row?.[4] || 0) }))
      .filter((row) => Number.isFinite(row.t) && row.t > 0 && Number.isFinite(row.c) && row.c > 0)
      .sort((a, b) => a.t - b.t)
      .map((row) => row.c);

    const path = buildSparklinePathFromOhlcv(closes);
    const value = { path, network, source: "gecko" };
    setCachedValue(geckoSparklineCache, cacheKey, value, path ? GECKO_SPARKLINE_CACHE_TTL_MS : 8_000);
    return value;
  } catch {
    const previous = geckoSparklineCache.get(cacheKey)?.value;
    if (previous) return previous;
    return { path: "", network, source: "gecko-error" };
  }
}

function toNumberSafe(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function readDexScreenerTokenSnapshot(chainId, tokenAddress, pairHint = "") {
  const token = normalizeAddress(tokenAddress || "");
  if (!token) return null;

  const chainSlug = dexscreenerChainForChain(chainId);
  const key = `${chainSlug}:${token.toLowerCase()}:${String(pairHint || "").toLowerCase()}`;
  const cached = getCachedValue(dexTokenCache, key);
  if (cached !== null) return cached;

  const url = `https://api.dexscreener.com/latest/dex/tokens/${token}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3500)
    });

    if (!response.ok) {
      setCachedValue(dexTokenCache, key, null, DEX_TOKEN_CACHE_TTL_MS);
      return null;
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.pairs) ? payload.pairs : [];
    const targetPair = normalizeAddress(pairHint || "");
    const filtered = rows.filter((row) => String(row?.chainId || "").toLowerCase() === chainSlug.toLowerCase());
    const candidates = filtered.length ? filtered : rows;
    if (!candidates.length) {
      setCachedValue(dexTokenCache, key, null, DEX_TOKEN_CACHE_TTL_MS);
      return null;
    }

    let best = null;
    if (targetPair) {
      best =
        candidates.find(
          (row) => normalizeAddress(row?.pairAddress || "")?.toLowerCase() === String(targetPair).toLowerCase()
        ) || null;
    }

    if (!best) {
      best = [...candidates].sort((a, b) => {
        const liqA = toNumberSafe(a?.liquidity?.usd, 0);
        const liqB = toNumberSafe(b?.liquidity?.usd, 0);
        if (liqA !== liqB) return liqB - liqA;
        const volA = toNumberSafe(a?.volume?.h24, 0);
        const volB = toNumberSafe(b?.volume?.h24, 0);
        return volB - volA;
      })[0];
    }

    const value = {
      chainId: String(best?.chainId || chainSlug),
      dexId: String(best?.dexId || ""),
      pairAddress: normalizeAddress(best?.pairAddress || "") || "",
      pairUrl: String(best?.url || ""),
      baseSymbol: String(best?.baseToken?.symbol || ""),
      quoteSymbol: String(best?.quoteToken?.symbol || ""),
      priceNative: toNumberSafe(best?.priceNative, 0),
      priceUsd: toNumberSafe(best?.priceUsd, 0),
      marketCapUsd: toNumberSafe(best?.marketCap, 0),
      fdvUsd: toNumberSafe(best?.fdv, 0),
      liquidityUsd: toNumberSafe(best?.liquidity?.usd, 0),
      volume24hUsd: toNumberSafe(best?.volume?.h24, 0),
      priceChange24hPct: toNumberSafe(best?.priceChange?.h24, 0),
      pairCreatedAt: Number(best?.pairCreatedAt || 0),
      raw: best
    };

    setCachedValue(dexTokenCache, key, value, DEX_TOKEN_CACHE_TTL_MS);
    return value;
  } catch {
    setCachedValue(dexTokenCache, key, null, DEX_TOKEN_CACHE_TTL_MS);
    return null;
  }
}

function explorerBaseForChain(chainId) {
  return CHAIN_META[Number(chainId)]?.explorerBaseUrl || "";
}

async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const results = new Array(list.length);
  let cursor = 0;
  const limit = Math.max(1, Math.min(concurrency, list.length));

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}

async function readFactoryLaunchCount(factory) {
  if (!factory) return 0;
  const fallbackCalls = [
    () => factory.getLaunchCount(),
    () => factory.launchCount(),
    () => factory.totalLaunches()
  ];
  for (const call of fallbackCalls) {
    try {
      const value = await withTimeout(call(), RPC_READ_TIMEOUT_MS, "factory launch count");
      const count = Number(value || 0);
      if (Number.isFinite(count) && count >= 0) return count;
    } catch {
      // try next signature
    }
  }
  return 0;
}

async function readLaunch(factory, index) {
  const launch = await withTimeout(factory.getLaunch(index), RPC_READ_TIMEOUT_MS, `launch ${index} read`);
  const rawImageURI = String(launch.imageURI || "").trim();
  const imageURI = sanitizeLaunchImageUri(rawImageURI);

  return {
    id: index,
    token: launch.token,
    pool: launch.pool,
    creator: launch.creator,
    name: launch.name,
    symbol: launch.symbol,
    imageURI,
    description: launch.description,
    totalSupply: launch.totalSupply.toString(),
    creatorAllocation: launch.creatorAllocation.toString(),
    createdAt: Number(launch.createdAt)
  };
}

function sanitizeLaunchImageUri(rawImageURI = "") {
  return sanitizePersistedImageUri(rawImageURI);
}

function buildPoolFallbackFromLaunch(launch) {
  const totalSupply = BigInt(String(launch?.totalSupply || "0"));
  const deployment = loadDeploymentConfig();
  const virtualEthReserve = BigInt(String(deployment?.virtualEthReserve || "0"));
  const virtualTokenReserve = BigInt(String(deployment?.virtualTokenReserve || "0"));
  const spotPriceWei =
    virtualEthReserve > 0n && virtualTokenReserve > 0n ? (virtualEthReserve * 10n ** 18n) / virtualTokenReserve : 0n;
  const marketCapWei = totalSupply > 0n ? (spotPriceWei * totalSupply) / 10n ** 18n : 0n;
  const fdvWei = marketCapWei;
  return {
    quoteMode: "native",
    quoteAsset: QUOTE_ASSETS.native,
    feeBps: 50,
    graduated: false,
    migratedPair: ethers.ZeroAddress,
    dexRouter: ethers.ZeroAddress,
    lpRecipient: ethers.ZeroAddress,
    priceSource: "bonding",
    spotPriceWei: spotPriceWei.toString(),
    effectiveSpotPriceWei: spotPriceWei.toString(),
    spotPriceEth: toFloat(spotPriceWei, 18, 18),
    tokenReserve: totalSupply.toString(),
    ethReserveWei: "0",
    ethReserveEth: 0,
    dexWethReserveWei: "0",
    dexWethReserveEth: 0,
    dexWethAddress: ethers.ZeroAddress,
    dexTokenReserve: "0",
    graduationTargetEthWei: "0",
    graduationTargetEth: 0,
    bondingProgressBps: 0,
    bondingProgressPct: 0,
    circulatingSupply: totalSupply.toString(),
    fdvWei: fdvWei.toString(),
    fdvEth: toFloat(fdvWei),
    marketCapWei: marketCapWei.toString(),
    marketCapEth: toFloat(marketCapWei)
  };
}

async function readPoolSnapshot(provider, launch, options = {}) {
  const snapshotCacheKey = String(launch.pool || "").toLowerCase();
  const cachedSnapshot = options.fresh ? null : getCachedValue(poolSnapshotCache, snapshotCacheKey);
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const pool = new ethers.Contract(launch.pool, POOL_READ_ABI, provider);
  const callOr = async (fn, fallback) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const [spotPrice, tokenReserve, ethReserve, feeBps, graduated, graduationTargetEth, targetProgressBps, migratedPair, dexRouter, lpRecipient, quoteToken] =
    await Promise.all([
      callOr(() => pool.spotPrice(), 0n),
      callOr(() => pool.tokenReserve(), 0n),
      callOr(() => pool.ethReserve(), 0n),
      callOr(() => pool.feeBps(), 50n),
      callOr(() => pool.graduated(), false),
      callOr(() => pool.graduationTargetEth(), 0n),
      callOr(() => pool.targetProgressBps(), 0n),
      callOr(() => pool.migratedPair(), ethers.ZeroAddress),
      callOr(() => pool.dexRouter(), ethers.ZeroAddress),
      callOr(() => pool.lpRecipient(), ethers.ZeroAddress),
      callOr(() => pool.quoteToken(), ethers.ZeroAddress)
    ]);
  const requestedQuote = options.quoteAsset || null;
  const isUsdcQuote = String(quoteToken || "").toLowerCase() === QUOTE_ASSETS.usdc.address.toLowerCase() || normalizeQuoteMode(options.quoteMode) === "usdc";
  const quoteAsset = isUsdcQuote ? QUOTE_ASSETS.usdc : requestedQuote || QUOTE_ASSETS.native;
  const quoteDecimals = Number(quoteAsset?.decimals || 18);

  const totalSupply = BigInt(launch.totalSupply);
  let currentPriceWei = BigInt(spotPrice);
  const tokenReserveWei = BigInt(tokenReserve);
  let priceSource = "bonding";
  let dexWethReserveWei = 0n;
  let dexTokenReserveWei = 0n;
  let dexWethAddress = ethers.ZeroAddress;

  if (Boolean(graduated) && !isZeroAddress(migratedPair)) {
    try {
      const pair = new ethers.Contract(migratedPair, V2_PAIR_ABI, provider);
      const [token0, token1, reserves, wethFromPair] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves(),
        callOr(
          () => {
            if (!isZeroAddress(dexRouter)) {
              const router = new ethers.Contract(dexRouter, V2_ROUTER_ABI, provider);
              return router.WETH();
            }
            return Promise.resolve(ethers.ZeroAddress);
          },
          ethers.ZeroAddress
        )
      ]);
      const weth =
        !isZeroAddress(wethFromPair) ?
          wethFromPair
        : token0.toLowerCase() === launch.token.toLowerCase() ?
          token1
        : token0;
      dexWethAddress = normalizeAddress(weth) || ethers.ZeroAddress;

      const launchToken = launch.token.toLowerCase();
      const wethLower = String(weth).toLowerCase();
      const token0Lower = String(token0).toLowerCase();
      const token1Lower = String(token1).toLowerCase();

      let tokenRes = 0n;
      let wethRes = 0n;

      if (token0Lower === launchToken && token1Lower === wethLower) {
        tokenRes = BigInt(reserves[0]);
        wethRes = BigInt(reserves[1]);
      } else if (token1Lower === launchToken && token0Lower === wethLower) {
        tokenRes = BigInt(reserves[1]);
        wethRes = BigInt(reserves[0]);
      }

      if (tokenRes > 0n && wethRes > 0n) {
        currentPriceWei = (wethRes * 10n ** 18n) / tokenRes;
        priceSource = "dex";
        dexTokenReserveWei = tokenRes;
        dexWethReserveWei = wethRes;
      }
    } catch {
      // Keep bonding-curve price fallback when pair reads fail.
    }
  }

  const circulating = totalSupply > tokenReserveWei ? totalSupply - tokenReserveWei : 0n;
  const valuationPriceWei = currentPriceWei;
  const fdvWei = (valuationPriceWei * totalSupply) / 10n ** 18n;
  const marketCapSupply = totalSupply;
  const marketCapWei = (valuationPriceWei * marketCapSupply) / 10n ** 18n;

  const snapshot = {
    feeBps: Number(feeBps),
    graduated: Boolean(graduated),
    migratedPair,
    dexRouter,
    lpRecipient,
    priceSource,
    spotPriceWei: spotPrice.toString(),
    effectiveSpotPriceWei: currentPriceWei.toString(),
    quoteMode: quoteAsset.mode || "native",
    quoteAsset,
    spotPriceEth: toFloat(currentPriceWei, 18, 18),
    spotPriceQuote: toFloat(currentPriceWei, 18, 18),
    tokenReserve: tokenReserve.toString(),
    ethReserveWei: ethReserve.toString(),
    ethReserveEth: toFloat(ethReserve, quoteDecimals),
    quoteReserve: toFloat(ethReserve, quoteDecimals),
    dexWethReserveWei: dexWethReserveWei.toString(),
    dexWethReserveEth: toFloat(dexWethReserveWei),
    dexWethAddress,
    dexTokenReserve: dexTokenReserveWei.toString(),
    graduationTargetEthWei: graduationTargetEth.toString(),
    graduationTargetEth: toFloat(graduationTargetEth, quoteDecimals),
    graduationTargetQuote: toFloat(graduationTargetEth, quoteDecimals),
    bondingProgressBps: Number(targetProgressBps),
    bondingProgressPct: Number((Number(targetProgressBps) / 100).toFixed(2)),
    circulatingSupply: circulating.toString(),
    fdvWei: fdvWei.toString(),
    fdvEth: toFloat(fdvWei, 18),
    fdvQuote: toFloat(fdvWei, 18),
    marketCapWei: marketCapWei.toString(),
    marketCapEth: toFloat(marketCapWei, 18),
    marketCapQuote: toFloat(marketCapWei, 18)
  };

  setCachedValue(poolSnapshotCache, snapshotCacheKey, snapshot, POOL_SNAPSHOT_CACHE_TTL_MS);
  return snapshot;
}

async function readRecentTrades(provider, poolAddress, limit = 400) {
  const pool = new ethers.Contract(poolAddress, POOL_ARTIFACT.abi, provider);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - POOL_TRADE_LOOKBACK_BLOCKS);

  let buyEvents = [];
  let sellEvents = [];
  try {
    [buyEvents, sellEvents] = await Promise.all([
      queryFilterAdaptive(pool, pool.filters.Buy(), fromBlock, latestBlock),
      queryFilterAdaptive(pool, pool.filters.Sell(), fromBlock, latestBlock)
    ]);
  } catch {
    return { trades: [], chart: [] };
  }

  const blockTsCache = new Map();
  async function blockTs(blockNumber) {
    if (!blockTsCache.has(blockNumber)) {
      const b = await provider.getBlock(blockNumber);
      blockTsCache.set(blockNumber, b ? Number(b.timestamp) : 0);
    }
    return blockTsCache.get(blockNumber);
  }

  const trades = [];

  for (const ev of buyEvents) {
    const ts = await blockTs(ev.blockNumber);
    const ethIn = ev.args.ethIn;
    const tokensOut = ev.args.tokensOut;
    const priceWei = tokensOut > 0n ? (ethIn * 10n ** 18n) / tokensOut : 0n;
    const buyer = normalizeAddress(ev.args?.buyer || "");

    trades.push({
      side: "buy",
      account: buyer || "",
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      timestamp: ts,
      ethAmountWei: ethIn.toString(),
      tokenAmountWei: tokensOut.toString(),
      priceWei: priceWei.toString(),
      priceEth: toFloat(priceWei, 18, 18)
    });
  }

  for (const ev of sellEvents) {
    const ts = await blockTs(ev.blockNumber);
    const ethOut = ev.args.ethOut;
    const tokensIn = ev.args.tokensIn;
    const priceWei = tokensIn > 0n ? (ethOut * 10n ** 18n) / tokensIn : 0n;
    const seller = normalizeAddress(ev.args?.seller || "");

    trades.push({
      side: "sell",
      account: seller || "",
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      timestamp: ts,
      ethAmountWei: ethOut.toString(),
      tokenAmountWei: tokensIn.toString(),
      priceWei: priceWei.toString(),
      priceEth: toFloat(priceWei, 18, 18)
    });
  }

  trades.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.timestamp - b.timestamp;
  });

  const sliced = trades.slice(Math.max(0, trades.length - limit));
  const chart = sliced.map((t) => ({ t: t.timestamp * 1000, p: t.priceEth, side: t.side }));

  return { trades: sliced.reverse(), chart };
}

async function readPairRecentTrades(provider, pairAddress, launchTokenAddress, wethAddress, limit = 300) {
  const pair = normalizeAddress(pairAddress || "");
  const token = normalizeAddress(launchTokenAddress || "");
  const weth = normalizeAddress(wethAddress || "");
  if (!pair || !token) {
    return { trades: [], chart: [] };
  }

  const cacheKey = `${pair.toLowerCase()}:${token.toLowerCase()}:${weth.toLowerCase() || "unknown"}`;
  const contract = new ethers.Contract(pair, V2_PAIR_ABI, provider);
  const latestBlock = await provider.getBlockNumber();
  const cached = pairTradesCache.get(cacheKey);
  const fromBlock = cached
    ? Math.max(0, Number(cached.lastBlock || 0) + 1)
    : Math.max(0, latestBlock - DEX_LOG_LOOKBACK_BLOCKS);
  if (cached && fromBlock > latestBlock) {
    const hot = cached.trades.slice(0, Math.max(1, limit));
    const hotChart = [...hot]
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .map((t) => ({ t: Number(t.timestamp || 0) * 1000, p: Number(t.priceEth || 0), side: t.side }))
      .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.p) && row.p > 0);
    return { trades: hot, chart: hotChart };
  }

  let token0;
  let token1;
  let events = [];
  try {
    // Start with a smaller range for pair swap logs to avoid provider plans
    // (for example QuickNode discover) rejecting very wide eth_getLogs windows.
    const initialSwapRange = Math.min(DEFAULT_LOG_RANGE, 180);
    [token0, token1, events] = await Promise.all([
      contract.token0(),
      contract.token1(),
      queryFilterAdaptive(contract, contract.filters.Swap(), fromBlock, latestBlock, initialSwapRange)
    ]);

    // If recent-window query returns no swaps on first load, do one deeper scan.
    // This helps new viewers see history when the last swaps are older than the
    // shallow lookback but Gecko index rows are still delayed.
    if ((!events || !events.length) && !cached) {
      const deepFromBlock = Math.max(0, latestBlock - DEX_LOG_DEEP_LOOKBACK_BLOCKS);
      if (deepFromBlock < fromBlock) {
        events = await queryFilterAdaptive(
          contract,
          contract.filters.Swap(),
          deepFromBlock,
          latestBlock,
          initialSwapRange
        );
      }
    }
  } catch {
    return { trades: [], chart: [] };
  }

  const token0Lower = String(token0).toLowerCase();
  const token1Lower = String(token1).toLowerCase();
  const tokenLower = token.toLowerCase();
  const wethLower = weth.toLowerCase();

  const tokenIs0 = token0Lower === tokenLower;
  const tokenIs1 = token1Lower === tokenLower;
  const wethIs0 = token0Lower === wethLower;
  const wethIs1 = token1Lower === wethLower;

  if (!(tokenIs0 || tokenIs1)) {
    return { trades: [], chart: [] };
  }

  const blockTsCache = new Map();
  async function blockTs(blockNumber) {
    if (!blockTsCache.has(blockNumber)) {
      const b = await provider.getBlock(blockNumber);
      blockTsCache.set(blockNumber, b ? Number(b.timestamp) : 0);
    }
    return blockTsCache.get(blockNumber);
  }

  const trades = [];
  for (const ev of events) {
    const amount0In = BigInt(ev.args?.amount0In || 0n);
    const amount1In = BigInt(ev.args?.amount1In || 0n);
    const amount0Out = BigInt(ev.args?.amount0Out || 0n);
    const amount1Out = BigInt(ev.args?.amount1Out || 0n);

    const tokenIn = tokenIs0 ? amount0In : amount1In;
    const tokenOut = tokenIs0 ? amount0Out : amount1Out;
    const quoteIn = tokenIs0 ? amount1In : amount0In;
    const quoteOut = tokenIs0 ? amount1Out : amount0Out;

    let side = "";
    let quoteAmountWei = 0n;
    let tokenAmountWei = 0n;

    if (quoteIn > 0n && tokenOut > 0n) {
      side = "buy";
      quoteAmountWei = quoteIn;
      tokenAmountWei = tokenOut;
    } else if (tokenIn > 0n && quoteOut > 0n) {
      side = "sell";
      quoteAmountWei = quoteOut;
      tokenAmountWei = tokenIn;
    } else {
      continue;
    }

    if (quoteAmountWei <= 0n || tokenAmountWei <= 0n) continue;

    const timestamp = await blockTs(ev.blockNumber);
    const account = normalizeAddress(ev.args?.to || ev.args?.sender || "");
    const priceWei = (quoteAmountWei * 10n ** 18n) / tokenAmountWei;

    trades.push({
      side,
      account: account || "",
      txHash: ev.transactionHash,
      blockNumber: ev.blockNumber,
      logIndex: Number(ev.logIndex ?? -1),
      timestamp,
      ethAmountWei: quoteAmountWei.toString(),
      tokenAmountWei: tokenAmountWei.toString(),
      priceWei: priceWei.toString(),
      priceEth: toFloat(priceWei, 18, 18),
      source: "pair"
    });
  }

  trades.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return b.blockNumber - a.blockNumber;
  });

  const merged = [];
  const seen = new Set();
  for (const row of [...trades, ...(cached?.trades || [])]) {
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
    merged.push(row);
  }
  merged.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return b.blockNumber - a.blockNumber;
  });
  const bounded = merged.slice(0, 600);
  pairTradesCache.set(cacheKey, { lastBlock: latestBlock, trades: bounded });

  const sliced = bounded.slice(0, Math.max(1, Math.min(limit, TOKEN_TRADES_RESPONSE_LIMIT)));
  const chart = [...sliced]
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .map((t) => ({ t: Number(t.timestamp || 0) * 1000, p: Number(t.priceEth || 0), side: t.side }))
    .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.p) && row.p > 0);

  return { trades: sliced, chart };
}

function calcPct(value, total, precision = 2) {
  const numerator = BigInt(value || 0);
  const denominator = BigInt(total || 0);
  if (numerator <= 0n || denominator <= 0n) return 0;

  const scale = 10n ** BigInt(precision + 2);
  const scaled = (numerator * scale) / denominator;
  return Number(scaled) / 10 ** precision;
}

async function readTopHolders(provider, launch, limit = 20) {
  const token = new ethers.Contract(launch.token, TOKEN_ARTIFACT.abi, provider);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - LOG_LOOKBACK_BLOCKS);
  const participants = await readPoolParticipants(provider, launch.pool, fromBlock, latestBlock);

  const participantAddresses = participants
    .sort((a, b) => Number(b.interactions || 0) - Number(a.interactions || 0))
    .slice(0, 120)
    .map((row) => row.address);

  const addresses = new Set();
  addresses.add(launch.creator);
  addresses.add(launch.pool);
  for (const addr of participantAddresses) {
    addresses.add(addr);
  }

  const unique = Array.from(addresses)
    .map((addr) => normalizeAddress(addr))
    .filter(Boolean);

  const balances = await mapWithConcurrency(unique, MAX_BALANCE_READ_CONCURRENCY, async (address) => {
    const balance = await token.balanceOf(address);
    return {
      address,
      balance: balance.toString(),
      label:
        address.toLowerCase() === launch.creator.toLowerCase()
          ? "Creator"
          : address.toLowerCase() === launch.pool.toLowerCase()
            ? "Pool"
            : "Holder"
    };
  });

  const totalSupply = BigInt(launch.totalSupply || "0");
  const rows = balances
    .map((row) => ({
      ...row,
      pct: calcPct(row.balance, totalSupply, 2)
    }))
    .filter((row) => BigInt(row.balance || "0") > 0n)
    .sort((a, b) => {
      const left = BigInt(a.balance || "0");
      const right = BigInt(b.balance || "0");
      if (left === right) return 0;
      return left > right ? -1 : 1;
    })
    .slice(0, Math.max(1, limit));

  return rows;
}

async function readTokenFeeSnapshot(provider, tokenAddress) {
  const token = new ethers.Contract(tokenAddress, TOKEN_ARTIFACT.abi, provider);
  try {
    const [creator, platformFeeRecipient, creatorClaimable, platformClaimable] = await Promise.all([
      token.creator(),
      token.platformFeeRecipient(),
      token.creatorClaimable(),
      token.platformClaimable()
    ]);
    let creatorClaimed = 0n;
    if (ENABLE_ONCHAIN_CLAIM_HISTORY) {
      try {
        const latestBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, Number(latestBlock || 0) - CREATOR_CLAIM_LOOKBACK_BLOCKS);
        const claimLogs = await queryFilterAdaptive(
          token,
          token.filters.CreatorFeesClaimed(creator),
          fromBlock,
          latestBlock,
          Math.min(DEFAULT_LOG_RANGE, 20_000)
        );
        creatorClaimed = claimLogs.reduce((sum, ev) => {
          const amount = BigInt(ev?.args?.amount?.toString?.() || "0");
          return sum + amount;
        }, 0n);
      } catch {
        creatorClaimed = 0n;
      }
    }
    return {
      creator,
      platformFeeRecipient,
      creatorClaimableWei: creatorClaimable.toString(),
      platformClaimableWei: platformClaimable.toString(),
      creatorClaimedWei: creatorClaimed.toString(),
      creatorClaimableTokens: toFloat(creatorClaimable),
      creatorClaimedTokens: toFloat(creatorClaimed),
      platformClaimableTokens: toFloat(platformClaimable)
    };
  } catch {
    return {
      creator: ethers.ZeroAddress,
      platformFeeRecipient: ethers.ZeroAddress,
      creatorClaimableWei: "0",
      platformClaimableWei: "0",
      creatorClaimedWei: "0",
      creatorClaimableTokens: 0,
      creatorClaimedTokens: 0,
      platformClaimableTokens: 0
    };
  }
}

async function readPoolParticipants(provider, poolAddress, fromBlock, toBlock) {
  const bucketSize = 300;
  const fromBucket = Math.floor(Number(fromBlock || 0) / bucketSize);
  const toBucket = Math.floor(Number(toBlock || 0) / bucketSize);
  const participantsKey = `${String(poolAddress || "").toLowerCase()}:${fromBucket}:${toBucket}`;
  const cachedParticipants = getCachedValue(participantsCache, participantsKey);
  if (cachedParticipants) {
    return cachedParticipants;
  }

  const pool = new ethers.Contract(poolAddress, POOL_ARTIFACT.abi, provider);
  const bucket = new Map();

  const bump = (addr, blockNumber) => {
    const key = String(addr || "").toLowerCase();
    if (!key || !ethers.isAddress(key)) return;
    const prev = bucket.get(key) || { address: ethers.getAddress(key), interactions: 0, lastBlock: 0 };
    prev.interactions += 1;
    if (blockNumber > prev.lastBlock) prev.lastBlock = blockNumber;
    bucket.set(key, prev);
  };

  try {
    const [buys, sells] = await Promise.all([
      queryFilterAdaptive(pool, pool.filters.Buy(), fromBlock, toBlock),
      queryFilterAdaptive(pool, pool.filters.Sell(), fromBlock, toBlock)
    ]);

    for (const ev of buys) {
      bump(ev.args?.buyer, ev.blockNumber);
    }
    for (const ev of sells) {
      bump(ev.args?.seller, ev.blockNumber);
    }
  } catch {
    setCachedValue(participantsCache, participantsKey, [], PARTICIPANTS_CACHE_TTL_MS);
    return [];
  }

  const participants = Array.from(bucket.values());
  setCachedValue(participantsCache, participantsKey, participants, PARTICIPANTS_CACHE_TTL_MS);
  return participants;
}

async function readLaunchList(ctx) {
  const count = await readFactoryLaunchCount(ctx.factory);
  const launchListKey = `${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${count}`;

  return withCache(launchListCache, launchListKey, LAUNCHES_CACHE_TTL_MS, async () => {
    const ids = Array.from({ length: count }, (_row, index) => count - 1 - index);
    const launches = await mapWithConcurrency(ids, MAX_LAUNCH_READ_CONCURRENCY, async (id) => {
      try {
        return await readLaunch(ctx.factory, id);
      } catch {
        return null;
      }
    });
    return launches.filter(Boolean);
  });
}

function cacheLaunchHints(chainId, factoryAddress, launches = []) {
  const prefix = `${chainId}:${String(factoryAddress || "").toLowerCase()}:`;
  for (const row of launches) {
    const token = normalizeAddress(row?.token || row?.tokenAddress || "");
    if (!token) continue;
    const key = `${prefix}${token.toLowerCase()}`;
    setCachedValue(tokenLaunchHintCache, key, row, 30_000);
  }
}

async function readLaunchPage(ctx, limit, offset) {
  const count = await readFactoryLaunchCount(ctx.factory);
  const total = Number.isFinite(count) && count > 0 ? count : 0;
  if (!total) {
    return { total: 0, launches: [] };
  }

  const safeLimit = Math.max(1, Math.min(120, Number(limit || 20)));
  const safeOffset = Math.max(0, Number(offset || 0));
  const start = total - 1 - safeOffset;
  if (start < 0) {
    return { total, launches: [] };
  }

  const end = Math.max(0, start - safeLimit + 1);
  const ids = [];
  for (let id = start; id >= end; id--) {
    ids.push(id);
  }

  const launches = await mapWithConcurrency(ids, MAX_LAUNCH_READ_CONCURRENCY, async (id) => {
    try {
      return await readLaunch(ctx.factory, id);
    } catch {
      return null;
    }
  });
  return { total, launches: launches.filter(Boolean) };
}

async function findLaunchByToken(factory, tokenAddress) {
  const count = await readFactoryLaunchCount(factory);
  for (let i = count - 1; i >= 0; i--) {
    let launch = null;
    try {
      launch = await readLaunch(factory, i);
    } catch {
      launch = null;
    }
    if (!launch) continue;
    if (launch.token.toLowerCase() === tokenAddress.toLowerCase()) {
      return launch;
    }
  }
  return null;
}

function pickPumpFunMint(payload = {}) {
  return String(
    payload?.mint ||
      payload?.tokenAddress ||
      payload?.token ||
      payload?.address ||
      payload?.coin?.mint ||
      payload?.coin?.address ||
      payload?.data?.mint ||
      payload?.data?.tokenAddress ||
      ""
  ).trim();
}

function pickPumpFunUrl(payload = {}, mint = "") {
  const explicit = String(payload?.pumpfunUrl || payload?.coinUrl || payload?.url || payload?.data?.url || "").trim();
  if (explicit) return explicit;
  return mint ? `https://pump.fun/coin/${encodeURIComponent(mint)}` : "";
}

function getPublicBaseUrl(req) {
  const explicit = String(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const host = String(req.get("host") || "").trim();
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  return host ? `${proto}://${host}` : "";
}

function isPublicHostedUrl(value = "") {
  try {
    const parsed = new URL(String(value || ""));
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host && host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

function readPumpFunMetadataDb() {
  try {
    if (fs.existsSync(PUMPFUN_METADATA_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(PUMPFUN_METADATA_DB_PATH, "utf8") || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    }
  } catch {
    // fall through
  }
  return {};
}

function writePumpFunMetadataDb(store) {
  const safe = store && typeof store === "object" ? store : {};
  fs.mkdirSync(path.dirname(PUMPFUN_METADATA_DB_PATH), { recursive: true });
  fs.writeFileSync(PUMPFUN_METADATA_DB_PATH, JSON.stringify(safe, null, 2));
  return safe;
}

async function createPumpFunMetadataUri(req, metadata) {
  const clean = {
    name: String(metadata?.name || "").slice(0, 32),
    symbol: String(metadata?.symbol || "").slice(0, 13),
    description: String(metadata?.description || "").slice(0, 4000),
    image: String(metadata?.image || ""),
    showName: true
  };
  const binary = Buffer.from(JSON.stringify(clean), "utf8");

  if (isSupabaseStorageConfigured()) {
    try {
      return await uploadBinaryToSupabaseStorage(binary, "json", "pumpfun");
    } catch {
      if (STRICT_UPLOAD_STORE) throw new Error("Pump.fun metadata storage failed");
    }
  }

  const id = crypto.randomBytes(10).toString("hex");
  if (USE_DISK_UPLOADS) {
    const filename = `${id}.json`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, binary);
    const base = getPublicBaseUrl(req);
    return `${base}/uploads/${filename}`;
  }

  const store = readPumpFunMetadataDb();
  store[id] = { ...clean, createdAt: Date.now() };
  writePumpFunMetadataDb(store);
  const base = getPublicBaseUrl(req);
  return `${base}/api/pumpfun/metadata/${id}`;
}

app.get("/api/pumpfun/metadata/:id", (req, res) => {
  const id = String(req.params.id || "").replace(/[^a-f0-9]/gi, "");
  const store = readPumpFunMetadataDb();
  const row = id ? store[id] : null;
  if (!row) return res.status(404).json({ error: "Metadata not found" });
  res.json(row);
});

app.post("/api/pumpfun/launch", async (req, res) => {
  try {
    const {
      Connection: SolanaConnection,
      Keypair: SolanaKeypair,
      PublicKey: SolanaPublicKey,
      Transaction: SolanaTransaction
    } = await loadSolanaWeb3();
    const PUMP_SDK = await loadPumpFunSdk();
    if (!PUMP_SDK?.createV2Instruction) {
      return res.status(500).json({ error: "Pump.fun SDK is not available in this runtime" });
    }

    const name = String(req.body?.name || "").trim().slice(0, 32);
    const symbol = String(req.body?.symbol || "").trim().toUpperCase().slice(0, 13);
    if (!name || !symbol) {
      return res.status(400).json({ error: "name and symbol are required" });
    }
    const userPublicKey = String(req.body?.userPublicKey || req.body?.creatorWallet || "").trim();
    if (!userPublicKey) {
      return res.status(400).json({ error: "Connect a Solana wallet first" });
    }

    let user;
    let creator;
    try {
      user = new SolanaPublicKey(userPublicKey);
      creator = new SolanaPublicKey(String(req.body?.creatorWallet || userPublicKey).trim());
    } catch {
      return res.status(400).json({ error: "Invalid Solana wallet public key" });
    }

    const metadataUri = await createPumpFunMetadataUri(req, {
      name,
      symbol,
      description: String(req.body?.description || "").trim(),
      image: String(req.body?.imageUri || "").trim()
    });
    if (!metadataUri || metadataUri.length > 200) {
      return res.status(500).json({ error: "Pump.fun metadata URI is missing or too long" });
    }

    const mintKeypair = SolanaKeypair.generate();
    const instruction = await PUMP_SDK.createV2Instruction({
      mint: mintKeypair.publicKey,
      name,
      symbol,
      uri: metadataUri,
      creator,
      user,
      mayhemMode: false,
      cashback: false
    });

    const rpcUrl = String(process.env.SOLANA_RPC_URL || process.env.PUMPFUN_SOLANA_RPC_URL || CHAIN_META[101].rpcUrls[0]).trim();
    let latest = {
      blockhash: String(req.body?.blockhash || "").trim(),
      lastValidBlockHeight: Number(req.body?.lastValidBlockHeight || 0)
    };
    if (!latest.blockhash) {
      const connection = new SolanaConnection(rpcUrl, "confirmed");
      latest = await connection.getLatestBlockhash("confirmed");
    }
    const tx = new SolanaTransaction({
      feePayer: user,
      recentBlockhash: latest.blockhash
    }).add(instruction);
    tx.partialSign(mintKeypair);

    const mint = mintKeypair.publicKey.toBase58();
    res.json({
      ok: true,
      mode: "sdk",
      mint,
      tokenAddress: mint,
      pumpfunUrl: pickPumpFunUrl({}, mint),
      metadataUri,
      transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      rpcUrl,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Pump.fun SDK transaction build failed" });
  }
});

app.get("/api/airdrop/preview", async (req, res) => {
  try {
    const official = officialAirdropConfig();
    if (!official.configured) {
      return res.status(400).json({
        error: "Official airdrop token is not configured yet. Launch the Pump-r token, then set AIRDROP_TOKEN_ADDRESS and AIRDROP_CHAIN_ID in Vercel."
      });
    }

    const rawToken = official.token;
    const requestedRawChainId = official.chainId;
    if (requestedRawChainId === 101) {
      const limit = Math.max(3, Math.min(50, Number(req.query.limit || 20)));
      const payload = await buildSolanaAirdropPreview(rawToken, limit);
      return res.json({ ...payload, name: official.name, symbol: official.symbol, officialAirdrop: official });
    }

    const tokenAddress = normalizeAddress(rawToken);
    if (!tokenAddress) {
      return res.status(400).json({ error: "Valid token contract is required" });
    }

    const deployment = loadDeploymentConfig();
    const requestedChainId = official.chainId;
    const quoteMode = official.quoteMode;
    const ctx = await getContext(requestedChainId, { verify: false, quoteMode });
    const limit = Math.max(3, Math.min(50, Number(req.query.limit || 20)));
    const launch = await findLaunchByToken(ctx.factory, tokenAddress);
    if (!launch) {
      return res.status(404).json({ error: "Token was not found in this Pump-r factory" });
    }

    const [holdersRaw, feeSnapshot, poolSnapshot] = await Promise.all([
      readTopHolders(ctx.provider, launch, limit + 5).catch(() => []),
      readTokenFeeSnapshot(ctx.provider, launch.token).catch(() => ({
        creatorClaimableWei: "0",
        creatorClaimedWei: "0",
        creatorClaimableTokens: 0,
        creatorClaimedTokens: 0
      })),
      readPoolSnapshot(ctx.provider, launch, { quoteMode: ctx.quoteMode, quoteAsset: ctx.quoteAsset }).catch(() => buildPoolFallbackFromLaunch(launch))
    ]);

    const holders = (Array.isArray(holdersRaw) ? holdersRaw : [])
      .filter((row) => String(row?.label || "").toLowerCase() !== "pool")
      .filter((row) => BigInt(row?.balance || "0") > 0n)
      .slice(0, limit);
    const totalHolderBalance = holders.reduce((sum, row) => sum + BigInt(row.balance || "0"), 0n);
    const claimableWei = BigInt(feeSnapshot?.creatorClaimableWei || "0");
    const allocations = holders.map((row) => {
      const balanceWei = BigInt(row.balance || "0");
      const allocationWei = claimableWei > 0n && totalHolderBalance > 0n ? (claimableWei * balanceWei) / totalHolderBalance : 0n;
      return {
        address: row.address,
        label: row.label,
        balanceWei: balanceWei.toString(),
        balanceTokens: toFloat(balanceWei),
        holderPct: Number(row.pct || 0),
        allocationWei: allocationWei.toString(),
        allocationTokens: toFloat(allocationWei)
      };
    });

    res.json({
      chainId: ctx.chainId,
      chainName: CHAIN_META[ctx.chainId]?.name || `Chain ${ctx.chainId}`,
      token: launch.token,
      pool: launch.pool,
      name: launch.name,
      symbol: launch.symbol,
      creator: launch.creator,
      quoteMode: ctx.quoteMode,
      claimableWei: claimableWei.toString(),
      claimableTokens: toFloat(claimableWei),
      claimedWei: String(feeSnapshot?.creatorClaimedWei || "0"),
      claimedTokens: toFloat(feeSnapshot?.creatorClaimedWei || "0"),
      holderCount: holders.length,
      totalHolderBalanceWei: totalHolderBalance.toString(),
      totalHolderBalanceTokens: toFloat(totalHolderBalance),
      marketCapUsd: Number(poolSnapshot?.marketCapUsd || 0),
      officialAirdrop: official,
      allocations
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to preview airdrop" });
  }
});

app.get("/api/airdrop/official", (_req, res) => {
  const official = officialAirdropConfig();
  res.json(official);
});

app.get("/api/health", async (req, res) => {
  try {
    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const ctx = await getContext(requestedChainId);
    res.json({
      ok: true,
      chainId: ctx.chainId,
      factory: ctx.factoryAddress,
      supportedChains: resolveSupportedChains(deployment)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/config", async (req, res) => {
  try {
    const deployment = loadDeploymentConfig();
    const quoteMode = resolveRequestedQuoteMode(req);
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const chainId = requestedChainId;
    const factoryAddress = resolveFactoryAddress(chainId, deployment, quoteMode);
    const rpcUrls = pickRpcUrls(chainId);
    const supportedChains = resolveSupportedChains(deployment);
    const quoteLaunchOptions = resolveQuoteLaunchOptions();
    const chainMeta = CHAIN_META[chainId] || {};
    const chainDeployment = loadChainDeploymentConfig(chainId);
    const quoteAsset = QUOTE_ASSETS[quoteMode] || QUOTE_ASSETS.native;
    const effectiveDeployment = {
      ...deployment,
      ...(chainDeployment || {}),
      chainId,
      memeLaunchFactory: factoryAddress,
      quoteMode,
      quoteAsset,
      dexRouter: chainDeployment?.dexRouter || chainMeta.dexRouter || deployment.dexRouter || ethers.ZeroAddress
    };

    res.json({
      chainId,
      chainName: chainMeta.name || `Chain ${chainId}`,
      chainShortName: chainMeta.shortName || String(chainId),
      nativeCurrency: chainMeta.nativeCurrency || "ETH",
      requestedChainId: parseChainId(req?.query?.chainId || req?.headers?.["x-chain-id"]),
      quoteMode,
      quoteAsset,
      factoryAddress,
      supportedChains,
      quoteLaunchOptions,
      deployment: effectiveDeployment,
      rpcUrl: rpcUrls[0] || "",
      rpcUrls,
      explorerBaseUrl: explorerBaseForChain(chainId),
      dexRouter: effectiveDeployment.dexRouter || ethers.ZeroAddress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/launches", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(120, Number(req.query.limit || 20)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const includeDex = String(req.query.includeDex || "0") === "1";
    const lite = String(req.query.lite || "0") === "1";
    const forceFresh = String(req.query.fresh || "0") === "1";

    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const quoteMode = resolveRequestedQuoteMode(req);
    const ctx = await getContext(requestedChainId, { verify: false, quoteMode });
    const count = await readFactoryLaunchCount(ctx.factory);
    const launchesKey = `${ctx.quoteMode}:${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${count}:${limit}:${offset}:${includeDex ? "dex" : "nodex"}:${lite ? "lite" : "full"}`;
    const builder = async () => {
      const page = await readLaunchPage(ctx, limit, offset);
      const creatorAddresses = [...new Set(page.launches.map((launch) => String(launch?.creator || "").toLowerCase()).filter(Boolean))];
      let creatorProfiles = {};
      try {
        creatorProfiles = await getPersistedProfiles(creatorAddresses);
      } catch {
        creatorProfiles = {};
      }

      const launches = await mapWithConcurrency(
        page.launches.map((launch, index) => ({ launch, index })),
        MAX_LAUNCH_READ_CONCURRENCY,
        async ({ launch, index }) => {
        let pool = null;
        let dexSnapshot = null;
        try {
          // Even in lite mode, read live pool snapshot so home cards don't stick to seeded defaults.
          pool = await withTimeout(
            readPoolSnapshot(ctx.provider, launch, { quoteMode: ctx.quoteMode, quoteAsset: ctx.quoteAsset }),
            lite ? 1800 : RPC_READ_TIMEOUT_MS,
            "pool snapshot"
          );
        } catch {
          pool = buildPoolFallbackFromLaunch(launch);
        }
        if (includeDex && index < Math.min(limit, 24)) {
          try {
            dexSnapshot = await readDexScreenerTokenSnapshot(ctx.chainId, launch.token, pool?.migratedPair || "");
            const pairHint = normalizeAddress(pool?.migratedPair || dexSnapshot?.pairAddress || "");
            if ((!dexSnapshot || Number(dexSnapshot?.marketCapUsd || 0) <= 0) && pairHint && pairHint !== ethers.ZeroAddress) {
              const gecko = await readGeckoPoolStatus(ctx.chainId, pairHint);
              if (gecko?.snapshot) {
                const geckoDexShape = {
                  chainId: dexscreenerChainForChain(ctx.chainId),
                  dexId: "uniswap_v2",
                  pairAddress: pairHint,
                  pairUrl: String(gecko.poolUrl || ""),
                  baseSymbol: String(launch?.symbol || ""),
                  quoteSymbol: "WETH",
                  priceNative: toNumberSafe(gecko.snapshot.priceNative, 0),
                  priceUsd: toNumberSafe(gecko.snapshot.priceUsd, 0),
                  marketCapUsd: toNumberSafe(gecko.snapshot.marketCapUsd, 0),
                  fdvUsd: toNumberSafe(gecko.snapshot.fdvUsd, 0),
                  liquidityUsd: toNumberSafe(gecko.snapshot.liquidityUsd, 0),
                  volume24hUsd: toNumberSafe(gecko.snapshot.volume24hUsd, 0),
                  priceChange24hPct: toNumberSafe(gecko.snapshot.priceChange24hPct, 0),
                  pairCreatedAt: Number(launch?.createdAt || 0) * 1000,
                  raw: { source: "gecko_snapshot" }
                };
                dexSnapshot = dexSnapshot ? { ...geckoDexShape, ...dexSnapshot } : geckoDexShape;
              }
            }
          } catch {
            dexSnapshot = null;
          }
        }

        return {
          ...launch,
          chainId: ctx.chainId,
          tokenAddress: launch.token,
          poolAddress: launch.pool,
          creatorProfile: creatorProfiles[String(launch.creator || "").toLowerCase()] || null,
          pool,
          dexSnapshot: dexSnapshot || null
        };
      });
      cacheLaunchHints(ctx.chainId, ctx.factoryAddress, launches);
      return { total: page.total, launches };
    };
    const payload = forceFresh ? await builder() : await withCache(launchesCache, launchesKey, LAUNCHES_CACHE_TTL_MS, builder);

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sparkline", async (req, res) => {
  try {
    const pool = normalizeAddress(req.query.pool || "");
    if (!pool) {
      return res.status(400).json({ error: "Invalid pool address" });
    }

    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const aggregate = Number(req.query.aggregate || 15);
    const limit = Number(req.query.limit || 24);
    const sparkline = await readGeckoPoolSparkline(requestedChainId, pool, { aggregate, limit });
    res.json(sparkline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/upload-image", async (req, res) => {
  try {
    const dataUrl = String(req.body?.dataUrl || "");
    const requireHosted = req.body?.requireHosted === true || String(req.body?.requireHosted || "") === "1";
    if (!dataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "Invalid image payload" });
    }

    const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: "Invalid image encoding" });
    }

    const extRaw = match[1].toLowerCase();
    const ext = extRaw === "jpeg" ? "jpg" : extRaw === "svg+xml" ? "svg" : extRaw;
    const allowed = new Set(["png", "jpg", "webp", "gif", "svg"]);
    if (!allowed.has(ext)) {
      return res.status(400).json({ error: "Unsupported image format" });
    }

    const binary = Buffer.from(match[2], "base64");
    if (binary.length === 0 || binary.length > 1024 * 1024) {
      return res.status(400).json({ error: "Image must be between 1 byte and 1 MB" });
    }

    if (isSupabaseStorageConfigured()) {
      try {
        const storageUrl = await uploadImageToSupabaseStorage(binary, ext);
        if (storageUrl) {
          if (requireHosted && !isPublicHostedUrl(storageUrl)) {
            return res.status(500).json({ error: "Image storage returned a non-public URL. Pump.fun launches require a hosted image URL." });
          }
          return res.json({ url: storageUrl });
        }
      } catch (uploadError) {
        if (STRICT_UPLOAD_STORE || requireHosted) {
          throw uploadError;
        }
      }
    }

    if (!USE_DISK_UPLOADS) {
      if (STRICT_UPLOAD_STORE || requireHosted) {
        return res.status(500).json({
          error:
            "Hosted image storage is not configured. Add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET on Vercel, then retry the Pump.fun launch."
        });
      }
      return res.json({ url: dataUrl });
    }

    const filename = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, binary);

    if (requireHosted) {
      const publicUrl = `${getPublicBaseUrl(req)}/uploads/${filename}`;
      if (!isPublicHostedUrl(publicUrl)) {
        return res.status(500).json({ error: "Pump.fun launches require a public hosted image URL. Local uploads cannot be used from localhost." });
      }
      return res.json({ url: publicUrl });
    }

    res.json({ url: `/uploads/${filename}` });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to upload image" });
  }
});

app.post("/api/upload-file", async (req, res) => {
  try {
    const dataUrl = String(req.body?.dataUrl || "");
    const match = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: "Invalid file encoding" });
    }

    const mime = match[1].toLowerCase();
    const mimeToExt = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
      "application/pdf": "pdf",
      "text/plain": "txt",
      "text/csv": "csv",
      "application/json": "json",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov"
    };
    const ext = mimeToExt[mime] || "";
    if (!ext) {
      return res.status(400).json({ error: "Unsupported evidence file format" });
    }

    const binary = Buffer.from(match[2], "base64");
    if (binary.length === 0 || binary.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "Evidence file must be between 1 byte and 2 MB" });
    }

    if (isSupabaseStorageConfigured()) {
      try {
        const storageUrl = await uploadBinaryToSupabaseStorage(binary, ext, "alpha");
        if (storageUrl) {
          return res.json({ url: storageUrl, mime });
        }
      } catch (uploadError) {
        if (STRICT_UPLOAD_STORE) {
          throw uploadError;
        }
      }
    }

    if (!USE_DISK_UPLOADS) {
      if (STRICT_UPLOAD_STORE) {
        return res.status(500).json({ error: "File storage is not configured on this deployment" });
      }
      return res.json({ url: dataUrl, mime });
    }

    const filename = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, binary);
    res.json({ url: `/uploads/${filename}`, mime });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to upload file" });
  }
});

app.get("/api/user-profile/:address", async (req, res) => {
  try {
    const profile = await getPersistedProfile(req.params.address);
    if (!profile.address) {
      return res.status(400).json({ error: "Invalid address" });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load profile" });
  }
});

app.post("/api/user-profile/:address", async (req, res) => {
  try {
    const profile = await setPersistedProfile(req.params.address, req.body || {});
    clearProfileDependentCaches();
    res.json(profile);
  } catch (error) {
    const text = String(error?.message || "");
    const status = text.toLowerCase().includes("invalid address") ? 400 : 500;
    res.status(status).json({ error: text || "Failed to save profile" });
  }
});

app.post("/api/user-profiles", async (req, res) => {
  try {
    const addressesRaw = Array.isArray(req.body?.addresses) ? req.body.addresses : [];
    const limited = addressesRaw.slice(0, 200);
    const profiles = await getPersistedProfiles(limited);
    res.json({ profiles });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load profiles" });
  }
});

app.get("/api/follow/state", async (req, res) => {
  try {
    const viewer = normalizeAddress(req.query.viewer);
    const target = normalizeAddress(req.query.target);
    if (!viewer || !target) {
      return res.status(400).json({ error: "viewer and target are required" });
    }
    const payload = await getFollowState(viewer, target);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load follow state" });
  }
});

app.post("/api/follow", async (req, res) => {
  try {
    const viewer = normalizeAddress(req.body?.viewer);
    const target = normalizeAddress(req.body?.target);
    const follow = Boolean(req.body?.follow);
    if (!viewer || !target) {
      return res.status(400).json({ error: "viewer and target are required" });
    }
    const payload = await setFollowState(viewer, target, follow);
    res.json(payload);
  } catch (error) {
    const message = String(error?.message || "Failed to update follow state");
    const status = message.toLowerCase().includes("follow yourself") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get("/api/communities", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(120, Number(req.query.limit || 80)));
    const store = await readCommunityDbPersistent({ refresh: true });
    const posts = listAllCommunityPosts(limit, store);
    const byToken = communityStatsByToken(store);
    const topCommunities = [...byToken.values()]
      .map((row) => ({
        token: row.token,
        posts: row.posts,
        comments: row.comments,
        likes: row.likes,
        members: row.members.size,
        latestAt: row.latestAt,
        score: row.posts * 3 + row.comments * 2 + row.likes + row.members.size
      }))
      .sort((a, b) => b.score - a.score || b.latestAt - a.latestAt)
      .slice(0, 10);
    res.json({ posts, topCommunities });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load communities" });
  }
});

app.get("/api/community/:token", async (req, res) => {
  try {
    const token = normalizeAddress(req.params.token || "");
    if (!token) return res.status(400).json({ error: "Invalid token address" });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 60)));
    const store = await readCommunityDbPersistent({ refresh: true });
    res.json({
      token,
      stats: communityStatsForToken(token, store),
      posts: listCommunityPosts(token, limit, store)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load community" });
  }
});

app.get("/api/x/oauth/start", (req, res) => {
  try {
    const returnTo = safeLocalReturnTo(req.query.returnTo || "/communities");
    const callbackUrl = xCallbackUrl(req);
    const clientId = String(process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.status(500).json({ error: "X_CLIENT_ID is not configured" });
    }
    pruneXOAuthStates();
    const stateId = base64Url(crypto.randomBytes(24));
    const codeVerifier = makePkceVerifier();
    const oauthState = {
      stateId,
      returnTo,
      codeVerifier,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    xOauthStates.set(stateId, oauthState);
    res.cookie("etherpump_x_oauth", base64Url(Buffer.from(JSON.stringify(oauthState))), xOAuthCookieOptions(req));
    const url = new URL("https://x.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("scope", "tweet.read users.read");
    url.searchParams.set("state", stateId);
    url.searchParams.set("code_challenge", makePkceChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    res.redirect(url.toString());
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to start X OAuth" });
  }
});

app.get("/api/x/oauth/callback", async (req, res) => {
  let returnTo = "/communities";
  try {
    pruneXOAuthStates();
    const stateId = String(req.query.state || "");
    const row = xOauthStates.get(stateId) || readXOAuthCookie(req, stateId);
    if (!row) {
      const target = new URL(returnTo, publicOriginFromRequest(req));
      target.searchParams.set("x", "expired");
      res.clearCookie("etherpump_x_oauth", { path: "/api/x/oauth" });
      return res.redirect(target.toString());
    }
    xOauthStates.delete(stateId);
    res.clearCookie("etherpump_x_oauth", { path: "/api/x/oauth" });
    returnTo = safeLocalReturnTo(row.returnTo);

    if (req.query.error) {
      const target = new URL(returnTo, publicOriginFromRequest(req));
      target.searchParams.set("x", "cancelled");
      return res.redirect(target.toString());
    }

    const code = String(req.query.code || "");
    const clientId = String(process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || "").trim();
    const callbackUrl = xCallbackUrl(req);
    if (!code || !clientId || !clientSecret) {
      throw new Error("X OAuth callback is missing code or credentials");
    }

    const params = new URLSearchParams();
    params.set("code", code);
    params.set("grant_type", "authorization_code");
    params.set("client_id", clientId);
    params.set("redirect_uri", callbackUrl);
    params.set("code_verifier", row.codeVerifier);

    const response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`X token exchange failed: ${response.status} ${text}`.trim());
    }
    const tokenPayload = await response.json().catch(() => ({}));
    const accessToken = String(tokenPayload?.access_token || "");
    let xUser = null;
    if (accessToken) {
      const userRes = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,public_metrics,username,name", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
      if (userRes.ok) {
        const userPayload = await userRes.json().catch(() => ({}));
        const data = userPayload?.data || {};
        xUser = {
          id: String(data.id || ""),
          username: normalizeXHandle(data.username || ""),
          name: sanitizeCommunityText(data.name || "", 80),
          image: String(data.profile_image_url || "").trim().slice(0, 1024),
          followers: Math.max(0, Number(data?.public_metrics?.followers_count || 0) || 0)
        };
      }
    }

    const target = new URL(returnTo, publicOriginFromRequest(req));
    target.searchParams.set("x", "authorized");
    if (xUser?.username) {
      target.searchParams.set("x_user", base64Url(Buffer.from(JSON.stringify(xUser))));
    }
    res.redirect(target.toString());
  } catch (error) {
    const target = new URL(returnTo, publicOriginFromRequest(req));
    target.searchParams.set("x", "failed");
    target.searchParams.set("reason", String(error?.message || "oauth_failed").slice(0, 120));
    res.redirect(target.toString());
  }
});

app.post("/api/community/:token/post", async (req, res) => {
  try {
    const token = normalizeAddress(req.params.token || "");
    const post = await createCommunityPost({ ...(req.body || {}), token });
    const store = await readCommunityDbPersistent();
    res.json({ post, stats: communityStatsForToken(token, store) });
  } catch (error) {
    const text = String(error?.message || "Failed to create post");
    const status = text.toLowerCase().includes("required") || text.toLowerCase().includes("invalid") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/community/:token/posts/:postId/comment", async (req, res) => {
  try {
    const token = normalizeAddress(req.params.token || "");
    if (!token) return res.status(400).json({ error: "Invalid token address" });
    const post = await createCommunityComment(req.params.postId, req.body || {});
    const store = await readCommunityDbPersistent();
    res.json({ post, stats: communityStatsForToken(token, store) });
  } catch (error) {
    const text = String(error?.message || "Failed to add comment");
    const status = text.toLowerCase().includes("required") || text.toLowerCase().includes("not found") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/community/:token/posts/:postId/like", async (req, res) => {
  try {
    const token = normalizeAddress(req.params.token || "");
    if (!token) return res.status(400).json({ error: "Invalid token address" });
    const post = await setCommunityLike(req.params.postId, req.body?.address, Boolean(req.body?.liked));
    const store = await readCommunityDbPersistent();
    res.json({ post, stats: communityStatsForToken(token, store) });
  } catch (error) {
    const text = String(error?.message || "Failed to update like");
    const status = text.toLowerCase().includes("required") || text.toLowerCase().includes("not found") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.get("/api/go", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(120, Number(req.query.limit || 80)));
    const tab = String(req.query.tab || "trending").toLowerCase();
    const store = readGoDb();
    const bounties = (store.bounties || []).map((row) => decorateGoBounty(row, store));
    const submissions = (store.submissions || [])
      .map(normalizeGoSubmission)
      .filter(Boolean)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const rankedBounties = [...bounties].sort((a, b) => {
      if (tab === "bounties") return Number(b.rewardUsd || 0) - Number(a.rewardUsd || 0);
      const bScore = Number(b.rewardUsd || 0) + Number(b.submissions || 0) * 75 + Number(b.createdAt || 0) / 1_000_000;
      const aScore = Number(a.rewardUsd || 0) + Number(a.submissions || 0) * 75 + Number(a.createdAt || 0) / 1_000_000;
      return bScore - aScore;
    });
    const openBounties = bounties.filter((row) => row.status === "open");
    res.json({
      bounties: rankedBounties.slice(0, limit),
      submissions: submissions.slice(0, limit),
      stats: {
        bounties: bounties.length,
        open: openBounties.length,
        submissions: submissions.length,
        totalRewardUsd: openBounties.reduce((sum, row) => sum + Number(row.rewardUsd || 0), 0),
        highestOpen: [...openBounties].sort((a, b) => Number(b.rewardUsd || 0) - Number(a.rewardUsd || 0)).slice(0, 3),
        recentSubmissions: submissions.slice(0, 12)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load GO" });
  }
});

app.get("/api/go/config", async (_req, res) => {
  res.json({ payoutChains: goEscrowConfig() });
});

app.get("/api/go/bounties/:id", async (req, res) => {
  try {
    const id = normalizeGoId(req.params.id || "", "go");
    const store = readGoDb();
    const bounty = (store.bounties || []).map(normalizeGoBounty).find((row) => row && row.id === id);
    if (!bounty) return res.status(404).json({ error: "bounty not found" });
    const submissions = (store.submissions || [])
      .map(normalizeGoSubmission)
      .filter((row) => row && row.bountyId === id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    res.json({ bounty: decorateGoBounty(bounty, store), submissions });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load bounty" });
  }
});

app.post("/api/go/bounties", async (req, res) => {
  try {
    const body = req.body || {};
    const title = sanitizeGoText(body.title || "", 140);
    if (!title) throw new Error("bounty title is required");
    const store = readGoDb();
    const bounty = normalizeGoBounty({
      id:
        body.id ||
        `go-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 44)}-${Date.now().toString(36)}`,
      title,
      description: body.description || "",
      deliverables: body.deliverables || [],
      rewardUsd: body.rewardUsd || 0,
      tokenSymbol: body.tokenSymbol || body.tokenUnit || "ETH",
      tokenAmount: body.tokenAmount || 0,
      tokenUnit: body.tokenUnit || "ETH",
      payoutChainId: body.payoutChainId || 1,
      escrowAddress: body.escrowAddress || "",
      escrowTxHash: body.escrowTxHash || "",
      escrowStatus: body.escrowTxHash ? "funded" : "unfunded",
      creator: body.creator || body.address || "",
      creatorName: body.creatorName || "",
      imageUri: body.imageUri || "",
      createdAt: Math.floor(Date.now() / 1000),
      endsAt: Math.floor(Date.now() / 1000) + Math.max(1, Math.min(30, Number(body.days || 3) || 3)) * 24 * 60 * 60
    });
    if (!bounty) throw new Error("invalid bounty");
    const expectedEscrow = goEscrowAddressForChain(bounty.payoutChainId);
    if (!expectedEscrow) throw new Error("escrow is not configured for this payout chain");
    if (String(bounty.escrowAddress || "").toLowerCase() !== expectedEscrow.toLowerCase()) {
      throw new Error("escrow address does not match configured payout chain");
    }
    if (!bounty.escrowTxHash) throw new Error("escrow funding transaction is required");
    store.bounties = [bounty, ...(Array.isArray(store.bounties) ? store.bounties : [])].slice(0, 1000);
    writeGoDb(store);
    res.json({ bounty: decorateGoBounty(bounty, store) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to create bounty" });
  }
});

app.post("/api/go/bounties/:id/release", async (req, res) => {
  try {
    const id = normalizeGoId(req.params.id || "", "go");
    const store = readGoDb();
    const index = (store.bounties || []).findIndex((row) => normalizeGoId(row?.id || "", "go") === id);
    if (index < 0) throw new Error("bounty not found");
    const releaseTxHash = sanitizeGoText(req.body?.releaseTxHash || "", 120);
    const winnerSubmissionId = normalizeGoId(req.body?.winnerSubmissionId || "", "sub");
    const winnerAddress = normalizeAddress(req.body?.winnerAddress || "");
    if (!releaseTxHash) throw new Error("release transaction is required");
    if (!winnerAddress) throw new Error("winner wallet address is required");
    store.bounties[index] = {
      ...store.bounties[index],
      escrowStatus: "released",
      status: "closed",
      releaseTxHash,
      winnerSubmissionId,
      winnerAddress
    };
    writeGoDb(store);
    res.json({ bounty: decorateGoBounty(store.bounties[index], store) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to release escrow" });
  }
});

app.post("/api/go/bounties/:id/submissions", async (req, res) => {
  try {
    const id = normalizeGoId(req.params.id || "", "go");
    const store = readGoDb();
    const bounty = (store.bounties || []).find((row) => normalizeGoId(row?.id || "", "go") === id);
    if (!bounty) throw new Error("bounty not found");
    const submission = normalizeGoSubmission({
      bountyId: id,
      author: req.body?.author || req.body?.address || "",
      authorName: req.body?.authorName || "",
      body: req.body?.body || "",
      mediaUrl: req.body?.mediaUrl || "",
      links: req.body?.links || [],
      createdAt: Math.floor(Date.now() / 1000),
      likes: []
    });
    if (!submission) throw new Error("submission text is required");
    store.submissions = [submission, ...(Array.isArray(store.submissions) ? store.submissions : [])].slice(0, 4000);
    writeGoDb(store);
    res.json({ submission });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to submit work" });
  }
});

app.get("/api/alpha", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(120, Number(req.query.limit || 80)));
    const store = await readAlphaDbPersistent({ refresh: true });
    const tips = (store.tips || [])
      .map(normalizeAlphaTip)
      .filter(Boolean)
      .sort((a, b) => {
        const bScore = (b.upvotes || []).length * 3 - (b.downvotes || []).length + (b.comments || []).length * 2 + (b.tips || []).length * 5 + Number(b.createdAt || 0) / 1_000_000;
        const aScore = (a.upvotes || []).length * 3 - (a.downvotes || []).length + (a.comments || []).length * 2 + (a.tips || []).length * 5 + Number(a.createdAt || 0) / 1_000_000;
        return bScore - aScore;
      })
      .slice(0, limit)
      .map((tip) => alphaPublicTip(tip));
    res.json({ tips, stats: alphaStats(store) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load alpha" });
  }
});

app.get("/api/alpha/:id", async (req, res) => {
  try {
    const id = normalizeAlphaId(req.params.id || "");
    const store = await readAlphaDbPersistent({ refresh: true });
    const tip = (store.tips || []).map(normalizeAlphaTip).find((row) => row && row.id === id);
    if (!tip) return res.status(404).json({ error: "alpha tip not found" });
    res.json({
      tip: alphaPublicTip(tip),
      unlocked: true,
      balance: "",
      error: ""
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load alpha tip" });
  }
});

app.post("/api/alpha", async (req, res) => {
  try {
    const body = req.body || {};
    const title = sanitizeAlphaText(body.title || "", 120);
    if (!title) throw new Error("alpha title is required");
    const chainId = parseChainId(body.chainId || 1) || 1;
    const tokenAddress = normalizeAlphaTokenAddress(body.tokenAddress || body.token || "", chainId);
    if (!tokenAddress) {
      throw new Error(isSolanaAlphaChain(chainId) ? "valid Solana token mint is required" : "token address is required");
    }
    if (!isSolanaAlphaChain(chainId) && tokenAddress === ethers.ZeroAddress) throw new Error("token address cannot be the zero address");
    const author = normalizeAddress(body.author || body.address || "");
    if (!author) throw new Error("author wallet is required");
    const authorWallet = normalizeAddress(body.authorWallet || body.tipWallet || author || "");
    if (!authorWallet) throw new Error("tip wallet is required");
    const xHandle = normalizeXHandle(body.xHandle || "");
    if (!xHandle) throw new Error("Connect X before submitting alpha");
    const alphaBody = sanitizeAlphaText(body.body || body.alpha || "", 2200);
    if (!alphaBody) throw new Error("alpha body is required");
    const store = await readAlphaDbPersistent();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 44);
    const tip = normalizeAlphaTip({
      id: body.id || `alpha-${slug}-${Date.now().toString(36)}`,
      ...body,
      title,
      body: alphaBody,
      tokenAddress,
      chainId,
      author,
      authorWallet,
      xHandle,
      xName: body.xName || "",
      xImage: body.xImage || "",
      xFollowers: body.xFollowers || 0,
      createdAt: Math.floor(Date.now() / 1000),
      tips: [],
      upvotes: [],
      downvotes: [],
      comments: [],
      unlocks: []
    });
    if (!tip) throw new Error("invalid alpha tip");
    store.tips = [tip, ...(Array.isArray(store.tips) ? store.tips : [])].slice(0, 2000);
    await writeAlphaDbPersistent(store);
    res.json({ tip: alphaPublicTip(tip, { unlocked: true }), stats: alphaStats(store) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to submit alpha" });
  }
});

app.post("/api/alpha/:id/vote", async (req, res) => {
  try {
    const id = normalizeAlphaId(req.params.id || "");
    const voter = normalizeAddress(req.body?.address || req.body?.voter || "");
    const direction = String(req.body?.direction || "").toLowerCase();
    if (!voter) throw new Error("voter address is required");
    if (!["up", "down", "clear"].includes(direction)) throw new Error("vote direction is required");
    const store = await readAlphaDbPersistent();
    const index = (store.tips || []).findIndex((row) => normalizeAlphaId(row?.id || "") === id);
    if (index < 0) throw new Error("alpha tip not found");
    const tip = normalizeAlphaTip(store.tips[index]);
    const key = voter.toLowerCase();
    const upvotes = new Set((tip.upvotes || []).map((row) => String(row).toLowerCase()));
    const downvotes = new Set((tip.downvotes || []).map((row) => String(row).toLowerCase()));
    upvotes.delete(key);
    downvotes.delete(key);
    if (direction === "up") upvotes.add(key);
    if (direction === "down") downvotes.add(key);
    store.tips[index] = normalizeAlphaTip({ ...tip, upvotes: [...upvotes], downvotes: [...downvotes] });
    await writeAlphaDbPersistent(store);
    res.json({ tip: alphaPublicTip(store.tips[index]), stats: alphaStats(store) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to vote on alpha" });
  }
});

app.post("/api/alpha/:id/comment", async (req, res) => {
  try {
    const id = normalizeAlphaId(req.params.id || "");
    const store = await readAlphaDbPersistent();
    const index = (store.tips || []).findIndex((row) => normalizeAlphaId(row?.id || "") === id);
    if (index < 0) throw new Error("alpha tip not found");
    const comment = normalizeAlphaComment({
      tipId: id,
      author: req.body?.author || req.body?.address || "",
      xHandle: req.body?.xHandle || "",
      xName: req.body?.xName || "",
      xImage: req.body?.xImage || "",
      xFollowers: req.body?.xFollowers || 0,
      body: req.body?.body || "",
      createdAt: Math.floor(Date.now() / 1000)
    }, id);
    if (!comment) throw new Error("comment text and author are required");
    if (!comment.xHandle) throw new Error("Connect X before commenting");
    const tip = normalizeAlphaTip(store.tips[index]);
    store.tips[index] = normalizeAlphaTip({ ...tip, comments: [...(tip.comments || []), comment] });
    await writeAlphaDbPersistent(store);
    res.json({ tip: alphaPublicTip(store.tips[index]), stats: alphaStats(store) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to comment on alpha" });
  }
});

app.post("/api/alpha/:id/tip", async (req, res) => {
  try {
    const id = normalizeAlphaId(req.params.id || "");
    const txHash = sanitizeAlphaText(req.body?.txHash || "", 120);
    const from = normalizeAddress(req.body?.from || req.body?.address || "");
    const amount = sanitizeAlphaText(req.body?.amount || "0", 40);
    if (!txHash) throw new Error("tip transaction is required");
    if (!from) throw new Error("tipper address is required");
    if (!(Number(amount || 0) > 0)) throw new Error("tip amount is required");
    const store = await readAlphaDbPersistent();
    const index = (store.tips || []).findIndex((row) => normalizeAlphaId(row?.id || "") === id);
    if (index < 0) throw new Error("alpha tip not found");
    const tip = normalizeAlphaTip(store.tips[index]);
    const record = {
      from,
      txHash,
      amount,
      chainId: parseChainId(req.body?.chainId || tip.chainId) || tip.chainId,
      createdAt: Math.floor(Date.now() / 1000)
    };
    store.tips[index] = normalizeAlphaTip({
      ...tip,
      tips: [...(Array.isArray(tip.tips) ? tip.tips : []), record]
    });
    await writeAlphaDbPersistent(store);
    res.json({ tip: alphaPublicTip(store.tips[index], { unlocked: true }), stats: alphaStats(store) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to record alpha tip" });
  }
});

app.get("/api/support/config", async (_req, res) => {
  try {
    const platformAddress = resolvePlatformSupportAddress();
    res.json({
      platformAddress: platformAddress || "",
      quickActions: [
        { key: "coin_details", label: "Coin Details" },
        { key: "trading_problems", label: "Trading Problems" },
        { key: "submit_feedback", label: "Submit Feedback" },
        { key: "speak_to_support", label: "Speak to Support" }
      ],
      collections: supportHelpCollections()
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load support config" });
  }
});

app.post("/api/support/message", async (req, res) => {
  try {
    const row = createSupportMessage(req.body || {});
    res.json({ message: row });
  } catch (error) {
    const text = String(error?.message || "Failed to send support message");
    const status = text.toLowerCase().includes("required") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.get("/api/support/messages", async (req, res) => {
  try {
    const address = normalizeAddress(req.query.address || "");
    if (!address) return res.status(400).json({ error: "address is required" });
    const rows = listSupportMessagesForAddress(address).slice(0, 200);
    res.json({ messages: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load support messages" });
  }
});

app.get("/api/support/inbox", async (req, res) => {
  try {
    const viewer = normalizeAddress(req.query.address || "");
    const platformAddress = resolvePlatformSupportAddress();
    if (!viewer) return res.status(400).json({ error: "address is required" });
    if (!platformAddress || viewer.toLowerCase() !== platformAddress.toLowerCase()) {
      return res.status(403).json({ error: "Only platform support wallet can view inbox" });
    }
    const rows = listSupportInbox(platformAddress).slice(0, 500);
    res.json({ messages: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load support inbox" });
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const ctx = await getContext(requestedChainId);
    const statsKey = `${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}`;
    const payload = await withCache(statsCache, statsKey, STATS_CACHE_TTL_MS, async () => {
      const launchList = await readLaunchList(ctx);
      const count = launchList.length;
      let graduatedCount = 0;
      let totalBondingEthWei = 0n;
      let aggregateFdvWei = 0n;

      const sampleLaunches = launchList.slice(0, Math.min(count, 80));
      const pools = await mapWithConcurrency(sampleLaunches, MAX_LAUNCH_READ_CONCURRENCY, (launch) =>
        readPoolSnapshot(ctx.provider, launch)
      );

      for (const pool of pools) {
        if (pool.graduated) graduatedCount++;
        totalBondingEthWei += BigInt(pool.ethReserveWei);
        aggregateFdvWei += BigInt(pool.fdvWei);
      }

      return {
        totalLaunches: count,
        sampledLaunches: sampleLaunches.length,
        graduatedCount,
        totalBondingEthWei: totalBondingEthWei.toString(),
        totalBondingEth: toFloat(totalBondingEthWei),
        aggregateFdvWei: aggregateFdvWei.toString(),
        aggregateFdvEth: toFloat(aggregateFdvWei)
      };
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function handleTokenRequest(req, res, tokenCandidate) {
  try {
    const tokenAddress = normalizeAddress(tokenCandidate);
    if (!tokenAddress) {
      return res.status(400).json({ error: "Invalid token address" });
    }

    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const lite = String(req.query.lite || "0") === "1";
    const quoteMode = resolveRequestedQuoteMode(req);
    const ctx = await getContext(requestedChainId, { verify: !lite, quoteMode });
    const launchIdHintRaw = req.query?.launchId ?? req.query?.id;
    const launchIdHint = Number.isFinite(Number(launchIdHintRaw)) ? Math.floor(Number(launchIdHintRaw)) : null;
    const tokenKey = `${ctx.quoteMode}:${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${tokenAddress.toLowerCase()}:${lite ? "lite" : "full"}:${launchIdHint ?? "scan"}`;
    const forceFresh = String(req.query.fresh || "0") === "1";
    const builder = async () => {
      let launch = null;
      if (launchIdHint !== null && launchIdHint >= 0) {
        try {
          const hinted = await readLaunch(ctx.factory, launchIdHint);
          if (String(hinted?.token || "").toLowerCase() === tokenAddress.toLowerCase()) {
            launch = hinted;
          }
        } catch {
          launch = null;
        }
      }
      if (!launch) {
        const launchList = await readLaunchList(ctx);
        launch = launchList.find((row) => String(row.token || "").toLowerCase() === tokenAddress.toLowerCase()) || null;
      }
      if (!launch) {
        const hintKey = `${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${tokenAddress.toLowerCase()}`;
        const hinted = getCachedValue(tokenLaunchHintCache, hintKey);
        if (hinted && String(hinted?.token || "").toLowerCase() === tokenAddress.toLowerCase()) {
          launch = hinted;
        }
      }
      if (!launch) {
        return null;
      }

      const safeLaunch = {
        ...launch,
        imageURI: sanitizeLaunchImageUri(launch.imageURI)
      };
      const poolBase = await readPoolSnapshot(ctx.provider, safeLaunch, {
        fresh: forceFresh,
        quoteMode: ctx.quoteMode,
        quoteAsset: ctx.quoteAsset
      }).catch(() => buildPoolFallbackFromLaunch(safeLaunch));
      const emptyFeeSnapshot = {
        creator: ethers.ZeroAddress,
        platformFeeRecipient: ethers.ZeroAddress,
        creatorClaimableWei: "0",
        platformClaimableWei: "0",
        creatorClaimedWei: "0",
        creatorClaimableTokens: 0,
        creatorClaimedTokens: 0,
        platformClaimableTokens: 0
      };
      const feeSnapshot = lite
        ? emptyFeeSnapshot
        : await readTokenFeeSnapshot(ctx.provider, safeLaunch.token).catch(() => emptyFeeSnapshot);

      if (lite) {
        let dexLite = null;
        try {
          // Fast hint for first paint: if pool.migratedPair is missing, try a short Dex fallback lookup.
          dexLite = await withTimeout(
            readDexScreenerTokenSnapshot(ctx.chainId, safeLaunch.token, poolBase.migratedPair),
            1200,
            "lite dex snapshot"
          );
        } catch {
          dexLite = null;
        }
        const pairFallbackLite = normalizeAddress(dexLite?.pairAddress || "");
        const effectivePairLite = normalizeAddress(poolBase.migratedPair) || pairFallbackLite || ethers.ZeroAddress;
        const poolLite =
          effectivePairLite !== ethers.ZeroAddress &&
          String(poolBase.migratedPair || "").toLowerCase() !== effectivePairLite.toLowerCase()
            ? { ...poolBase, migratedPair: effectivePairLite, graduated: true, priceSource: "dex" }
            : poolBase;
        const geckoUrlsLite = buildGeckoPoolUrls(ctx.chainId, effectivePairLite);
        const geckoLite = geckoUrlsLite.embedUrl
          ? {
              indexed: false,
              network: geckoUrlsLite.network,
              poolUrl: geckoUrlsLite.poolUrl,
              embedUrl: geckoUrlsLite.embedUrl,
              apiUrl: geckoUrlsLite.apiUrl,
              snapshot: null
            }
          : null;
        let liteTrades = [];
        let liteChart = [];
        if (!poolLite.graduated) {
          try {
            const localPayload = await withTimeout(
              readRecentTrades(ctx.provider, safeLaunch.pool, 60),
              2600,
              "lite pool trades"
            );
            liteTrades = Array.isArray(localPayload?.trades) ? localPayload.trades : [];
            liteChart = Array.isArray(localPayload?.chart) ? localPayload.chart : [];
          } catch {
            liteTrades = [];
            liteChart = [];
          }
        } else if (!isZeroAddress(effectivePairLite)) {
          try {
            const pairPayload = await withTimeout(
              readPairRecentTrades(ctx.provider, effectivePairLite, safeLaunch.token, poolLite.dexWethAddress, 40),
              2200,
              "lite pair trades"
            );
            liteTrades = Array.isArray(pairPayload?.trades) ? pairPayload.trades : [];
            liteChart = Array.isArray(pairPayload?.chart) ? pairPayload.chart : [];
          } catch {
            liteTrades = [];
            liteChart = [];
          }
        }
        return {
          launch: {
            ...safeLaunch,
            tokenAddress: safeLaunch.token,
            poolAddress: safeLaunch.pool,
            creatorProfile: await getPersistedProfile(safeLaunch.creator).catch(() => sanitizeProfileValue(safeLaunch.creator)),
            pool: poolLite,
            feeSnapshot
          },
          trades: liteTrades,
          chart: liteChart,
          topHolders: null,
          gecko: geckoLite,
          dex: dexLite
        };
      }

      let dex = null;
      try {
        dex = await readDexScreenerTokenSnapshot(ctx.chainId, safeLaunch.token, poolBase.migratedPair);
      } catch {
        dex = null;
      }
      const pairFallback = normalizeAddress(dex?.pairAddress || "");
      const effectivePair = normalizeAddress(poolBase.migratedPair) || pairFallback || ethers.ZeroAddress;
      const pool =
        effectivePair !== ethers.ZeroAddress && String(poolBase.migratedPair || "").toLowerCase() !== effectivePair.toLowerCase()
          ? { ...poolBase, migratedPair: effectivePair, graduated: true, priceSource: "dex" }
          : poolBase;

      // Keep token page indexer-first, but allow on-chain pair trades to improve
      // freshness and avoid missing multiple recent swaps.
      const useOnchainPoolTrades = String(process.env.USE_ONCHAIN_POOL_TRADES || "1") === "1";
      const useOnchainPairTrades = true;
      const useOnchainTopHolders = String(process.env.USE_ONCHAIN_TOP_HOLDERS || "0") === "1";

      const [topHoldersRes, geckoRes, geckoTradesRes] = await Promise.allSettled([
        useOnchainTopHolders && !lite ? readTopHolders(ctx.provider, safeLaunch, 25) : Promise.resolve(null),
        readGeckoPoolStatus(ctx.chainId, effectivePair),
        readGeckoPoolTrades(ctx.chainId, effectivePair, safeLaunch.token, pool.dexWethAddress)
      ]);

      const topHolders = topHoldersRes.status === "fulfilled" ? topHoldersRes.value : null;
      const gecko = geckoRes.status === "fulfilled" ? geckoRes.value : null;
      const geckoTrades = geckoTradesRes.status === "fulfilled" ? geckoTradesRes.value : [];
      if (!dex && gecko?.snapshot) {
        dex = {
          chainId: dexscreenerChainForChain(ctx.chainId),
          dexId: "uniswap_v2",
          pairAddress: normalizeAddress(effectivePair || "") || "",
          pairUrl: gecko.poolUrl || "",
          baseSymbol: String(safeLaunch.symbol || ""),
          quoteSymbol: "WETH",
          priceNative: toNumberSafe(gecko.snapshot.priceNative, 0),
          priceUsd: toNumberSafe(gecko.snapshot.priceUsd, 0),
          marketCapUsd: toNumberSafe(gecko.snapshot.marketCapUsd, 0),
          fdvUsd: toNumberSafe(gecko.snapshot.fdvUsd, 0),
          liquidityUsd: toNumberSafe(gecko.snapshot.liquidityUsd, 0),
          volume24hUsd: toNumberSafe(gecko.snapshot.volume24hUsd, 0),
          priceChange24hPct: toNumberSafe(gecko.snapshot.priceChange24hPct, 0),
          pairCreatedAt: Number(safeLaunch.createdAt || 0) * 1000,
          raw: { source: "gecko_snapshot" }
        };
      }

      let localTradesPayload = { trades: [], chart: [] };
      let pairTradesPayload = { trades: [], chart: [] };
      const shouldReadPoolTrades = useOnchainPoolTrades && !pool.graduated && (!Array.isArray(geckoTrades) || !geckoTrades.length);
      // Always sample recent pair swaps and merge with indexer data.
      // This keeps trade history visible even when indexer APIs lag.
      const shouldReadPairTrades = useOnchainPairTrades && !isZeroAddress(effectivePair);

      if (shouldReadPoolTrades || shouldReadPairTrades) {
        const [localTradesRes, pairTradesRes] = await Promise.allSettled([
          shouldReadPoolTrades ? readRecentTrades(ctx.provider, safeLaunch.pool, TOKEN_TRADES_RESPONSE_LIMIT) : Promise.resolve({ trades: [], chart: [] }),
          shouldReadPairTrades
            ? readPairRecentTrades(ctx.provider, effectivePair, safeLaunch.token, pool.dexWethAddress, TOKEN_TRADES_RESPONSE_LIMIT)
            : Promise.resolve({ trades: [], chart: [] })
        ]);
        localTradesPayload = localTradesRes.status === "fulfilled" ? localTradesRes.value : { trades: [], chart: [] };
        pairTradesPayload = pairTradesRes.status === "fulfilled" ? pairTradesRes.value : { trades: [], chart: [] };
      }

      let trades = [...(localTradesPayload.trades || []), ...(pairTradesPayload.trades || [])];
      let chart = localTradesPayload.chart?.length ? localTradesPayload.chart : pairTradesPayload.chart || [];

      if (Array.isArray(geckoTrades) && geckoTrades.length) {
        const seen = new Set();
        const merged = [];
        for (const row of [...geckoTrades, ...trades]) {
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
          merged.push(row);
        }
        merged.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
        trades = merged.slice(0, TOKEN_TRADES_RESPONSE_LIMIT);

        if (!Array.isArray(chart) || !chart.length) {
          chart = [...trades]
            .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
            .map((row) => ({
              t: Number(row.timestamp || 0) * 1000,
              p: Number(row.priceEth || 0),
              side: row.side
            }))
            .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.p) && row.p > 0);
        }
      }

      if ((Number(pool?.spotPriceEth || 0) <= 0 || Number(pool?.marketCapEth || 0) <= 0) && Number(dex?.priceNative || 0) > 0) {
        const dexPriceWei = parseAmountToWei(String(dex.priceNative || "0"), 18);
        if (dexPriceWei > 0n) {
          const circulating = BigInt(pool.circulatingSupply || "0");
          const totalSupply = BigInt(safeLaunch.totalSupply || "0");
          const marketCapWei = circulating > 0n ? (dexPriceWei * circulating) / 10n ** 18n : 0n;
          const fdvWei = totalSupply > 0n ? (dexPriceWei * totalSupply) / 10n ** 18n : 0n;
          pool.effectiveSpotPriceWei = dexPriceWei.toString();
          pool.spotPriceEth = toFloat(dexPriceWei, 18, 18);
          pool.priceSource = "dex";
          if (marketCapWei > 0n) {
            pool.marketCapWei = marketCapWei.toString();
            pool.marketCapEth = toFloat(marketCapWei);
          }
          if (fdvWei > 0n) {
            pool.fdvWei = fdvWei.toString();
            pool.fdvEth = toFloat(fdvWei);
          }
          if (effectivePair !== ethers.ZeroAddress) {
            pool.graduated = true;
          }
        }
      }

      if ((!Array.isArray(chart) || !chart.length) && (dex?.priceNative || pool?.spotPriceEth)) {
        const seedPrice = Number(dex?.priceNative || pool?.spotPriceEth || 0);
        if (Number.isFinite(seedPrice) && seedPrice > 0) {
          const now = Date.now();
          chart = Array.from({ length: 20 }, (_row, idx) => ({
            t: now - (19 - idx) * 60_000,
            p: seedPrice,
            side: "seed"
          }));
        }
      }

        return {
        launch: {
          ...safeLaunch,
          tokenAddress: safeLaunch.token,
          poolAddress: safeLaunch.pool,
          creatorProfile: await getPersistedProfile(safeLaunch.creator).catch(() => sanitizeProfileValue(safeLaunch.creator)),
          pool,
          feeSnapshot
        },
        trades,
        chart: Array.isArray(chart) ? chart.slice(-TOKEN_CHART_RESPONSE_LIMIT) : [],
        topHolders: Array.isArray(topHolders) ? topHolders : null,
        gecko,
        dex
      };
    };
    const payload = forceFresh ? await builder() : await withCache(tokenCache, tokenKey, TOKEN_CACHE_TTL_MS, builder);

    if (!payload) {
      return res.status(404).json({ error: "Token launch not found" });
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

app.get("/api/token", async (req, res) => {
  return handleTokenRequest(req, res, req.query?.token);
});

app.get("/api/token/:token", async (req, res) => {
  return handleTokenRequest(req, res, req.params?.token);
});

app.get("/api/profile/:address", async (req, res) => {
  try {
    const address = normalizeAddress(req.params.address);
    if (!address) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const ctx = await getContext(requestedChainId);
    const cacheKey = `${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${address.toLowerCase()}:social-v2`;
    const cachedProfile = getCachedValue(profileCache, cacheKey);
    if (cachedProfile) {
      return res.json(cachedProfile);
    }

    async function collectProfileRowsForContext(chainCtx) {
      let launchList = [];
      try {
        launchList = await readLaunchList(chainCtx);
      } catch {
        launchList = [];
      }
      const createdRows = [];
      const holdingsRows = [];
      const poolCache = new Map();
      const tokenFeeCache = new Map();

      async function getPoolForLaunch(launch) {
        const key = `${chainCtx.chainId}:${launch.pool.toLowerCase()}`;
        if (!poolCache.has(key)) {
          try {
            poolCache.set(key, await readPoolSnapshot(chainCtx.provider, launch));
          } catch {
            poolCache.set(key, buildPoolFallbackFromLaunch(launch));
          }
        }
        return poolCache.get(key);
      }

      async function getTokenFeeForLaunch(launch) {
        const key = `${chainCtx.chainId}:${launch.token.toLowerCase()}`;
        if (!tokenFeeCache.has(key)) {
          try {
            tokenFeeCache.set(key, await readTokenFeeSnapshot(chainCtx.provider, launch.token));
          } catch {
            tokenFeeCache.set(key, {
              creator: ethers.ZeroAddress,
              platformFeeRecipient: ethers.ZeroAddress,
              creatorClaimableWei: "0",
              platformClaimableWei: "0",
              creatorClaimedWei: "0",
              creatorClaimableTokens: 0,
              creatorClaimedTokens: 0,
              platformClaimableTokens: 0
            });
          }
        }
        return tokenFeeCache.get(key);
      }

      const balances = await mapWithConcurrency(launchList, MAX_BALANCE_READ_CONCURRENCY, async (launch) => {
        try {
          const token = new ethers.Contract(launch.token, TOKEN_ARTIFACT.abi, chainCtx.provider);
          const balance = await token.balanceOf(address);
          return balance.toString();
        } catch {
          return "0";
        }
      });

      for (let i = 0; i < launchList.length; i++) {
        const launch = launchList[i];
        const balance = BigInt(balances[i] || "0");
        const isCreator = String(launch?.creator || "").toLowerCase() === address.toLowerCase();

        if (isCreator) {
          const pool = await getPoolForLaunch(launch);
          const feeSnapshot = await getTokenFeeForLaunch(launch);
          createdRows.push({
            ...launch,
            tokenAddress: launch.token,
            poolAddress: launch.pool,
            chainId: chainCtx.chainId,
            creatorProfile: await getPersistedProfile(launch.creator),
            pool,
            feeSnapshot,
            holderBalance: balance.toString(),
            holderBalanceFloat: toFloat(balance)
          });
        }

        if (balance > 0n) {
          const pool = await getPoolForLaunch(launch);
          holdingsRows.push({
            ...launch,
            tokenAddress: launch.token,
            poolAddress: launch.pool,
            chainId: chainCtx.chainId,
            creatorProfile: await getPersistedProfile(launch.creator),
            pool,
            holderBalance: balance.toString(),
            holderBalanceFloat: toFloat(balance)
          });
        }
      }

      return { createdRows, holdingsRows };
    }

    const created = [];
    const holdings = [];
    const seenCreated = new Set();
    const seenHoldings = new Set();
    function mergeRows(target, rows, seen) {
      for (const row of rows || []) {
        const token = String(row?.token || "").toLowerCase();
        const chain = Number(row?.chainId || 0);
        const key = `${chain}:${token}`;
        if (!token || seen.has(key)) continue;
        seen.add(key);
        target.push(row);
      }
    }

    const primary = await collectProfileRowsForContext(ctx);
    mergeRows(created, primary.createdRows, seenCreated);
    mergeRows(holdings, primary.holdingsRows, seenHoldings);

    // Fallback/merge across additional configured chains so profiles show launches
    // even when wallet activity spans multiple deployments.
    const supported = resolveSupportedChains(deployment).map((row) => Number(row?.chainId || 0)).filter((n) => n > 0);
    for (const chainId of supported) {
      if (chainId === Number(ctx.chainId)) continue;
      try {
        const extraCtx = await getContext(chainId, { verify: false });
        const extra = await collectProfileRowsForContext(extraCtx);
        mergeRows(created, extra.createdRows, seenCreated);
        mergeRows(holdings, extra.holdingsRows, seenHoldings);
      } catch {
        // ignore unavailable chain contexts and continue with available data
      }
    }
    const social = await getPersistedSocialGraph(address);
    const followers = Array.isArray(social.followers) ? social.followers : [];
    const following = Array.isArray(social.following) ? social.following : [];
    const creatorRewardsTotalWei = created.reduce(
      (sum, row) => sum + BigInt(row?.feeSnapshot?.creatorClaimableWei || "0"),
      0n
    );
    const creatorRewardsClaimedTotalWei = created.reduce(
      (sum, row) => sum + BigInt(row?.feeSnapshot?.creatorClaimedWei || "0"),
      0n
    );
    const creatorRewardsCombinedTotalWei = creatorRewardsTotalWei + creatorRewardsClaimedTotalWei;

    const payload = {
      address,
      profile: await getPersistedProfile(address),
      created,
      holdings,
      creatorRewardsTotalWei: creatorRewardsTotalWei.toString(),
      creatorRewardsTotalTokens: toFloat(creatorRewardsTotalWei),
      creatorRewardsClaimedTotalWei: creatorRewardsClaimedTotalWei.toString(),
      creatorRewardsClaimedTotalTokens: toFloat(creatorRewardsClaimedTotalWei),
      creatorRewardsCombinedTotalWei: creatorRewardsCombinedTotalWei.toString(),
      creatorRewardsCombinedTotalTokens: toFloat(creatorRewardsCombinedTotalWei),
      followers,
      following,
      followersCount: followers.length,
      followingCount: following.length,
      socialIncluded: true
    };
    setCachedValue(profileCache, cacheKey, payload, PROFILE_SOCIAL_CACHE_TTL_MS);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get(["/", "/home"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/create", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "create.html"));
});

app.get("/token", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "token.html"));
});

app.get(["/communities", "/communities/:token"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "communities.html"));
});

app.get(["/go", "/go/:bountyId"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "go.html"));
});

app.get(["/alpha", "/alpha/:alphaId"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "alpha.html"));
});

app.get("/onboard", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "onboard.html"));
});

app.get("/airdrop", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "airdrop.html"));
});

app.get("/profile", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "profile.html"));
});

app.get("/vendor/solana-web3.iife.min.js", (_req, res) => {
  res.sendFile(path.join(ROOT, "node_modules", "@solana", "web3.js", "lib", "index.iife.min.js"));
});

app.get("/uploads/:filename", (req, res) => {
  const filename = path.basename(String(req.params.filename || ""));
  if (!filename) {
    return res.status(404).end();
  }

  const filePath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  return res.redirect(302, "/assets/pump-r-logo.png");
});

app.use(
  express.static(FRONTEND_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      const lower = String(filePath || "").toLowerCase();
      if (
        lower.endsWith(".html") ||
        lower.endsWith(".js") ||
        lower.endsWith(".css") ||
        lower.endsWith(".json")
      ) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      } else {
        res.setHeader("Cache-Control", "public, max-age=300");
      }
    }
  })
);

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message || "Unexpected server error" });
});

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`[web] Launchpad running on http://localhost:${PORT}`);
  });
}
