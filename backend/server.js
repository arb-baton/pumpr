const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { ethers } = require("ethers");
const QRCode = require("qrcode");
const bs58 = require("bs58");
const { ed25519 } = require("@noble/curves/ed25519");

dotenv.config({ override: true });

const app = express();
const PORT = Number(process.env.PORT || 4173);

const ROOT = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const DEPLOYMENT_PATH = path.join(FRONTEND_DIR, "deployment.json");
const UPLOADS_DIR = path.join(FRONTEND_DIR, "uploads");
const AGENT_SKILL_PATH = path.join(FRONTEND_DIR, "skill.md");
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL);
const UPLOAD_MODE = String(process.env.UPLOAD_MODE || (IS_VERCEL_RUNTIME ? "inline" : "disk")).toLowerCase();
const PROFILE_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-profiles.json") : path.join(ROOT, "cache", "profiles.json");
const FOLLOW_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-follows.json") : path.join(ROOT, "cache", "follows.json");
const SUPPORT_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-support.json") : path.join(ROOT, "cache", "support.json");
const COMMUNITY_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-community.json") : path.join(ROOT, "cache", "community.json");
const GO_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-go.json") : path.join(ROOT, "cache", "go.json");
const ALPHA_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-alpha.json") : path.join(ROOT, "cache", "alpha.json");
const AGENTS_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-agents.json") : path.join(ROOT, "cache", "agents.json");
const PUMPFUN_PREPARED_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-pumpfun-prepared.json") : path.join(ROOT, "cache", "pumpfun-prepared.json");
const PUMPFUN_SESSIONS_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-pumpfun-sessions.json") : path.join(ROOT, "cache", "pumpfun-sessions.json");
const PUMPFUN_METADATA_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-pumpfun-metadata.json") : path.join(ROOT, "cache", "pumpfun-metadata.json");
const PUMPFUN_LAUNCHES_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "etherpump-pumpfun-launches.json") : path.join(ROOT, "cache", "pumpfun-launches.json");
const AIRDROP_HOLDER_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-airdrop-holders.json") : path.join(ROOT, "cache", "airdrop-holders.json");
const PUMPR_CARD_WAITLIST_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-card-waitlist.json") : path.join(ROOT, "cache", "pumpr-card-waitlist.json");
const REFERRAL_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-referrals.json") : path.join(ROOT, "cache", "referrals.json");
const SOCIAL_DB_PATH = IS_VERCEL_RUNTIME ? path.join("/tmp", "pumpr-social.json") : path.join(ROOT, "cache", "social.json");
const OFFICIAL_PUMPFUN_MINT = "C64Fr3nt6S9mmbehCS66Y1HYLnwBdMeUCdTimfmvpump";
const PUMPFUN_MINT_SUFFIX_ENABLED = !["0", "false", "no", "off"].includes(String(process.env.PUMPFUN_MINT_SUFFIX_ENABLED || "1").trim().toLowerCase());
const PUMPFUN_MINT_SUFFIX = PUMPFUN_MINT_SUFFIX_ENABLED ? String(process.env.PUMPFUN_MINT_SUFFIX || "pr").trim() : "";
const PUMPFUN_MINT_SUFFIX_MAX_ATTEMPTS = Math.max(1_000, Math.min(1_000_000, Number(process.env.PUMPFUN_MINT_SUFFIX_MAX_ATTEMPTS || 25_000)));
const DEFAULT_PUMPR_ADMIN_WALLET = "ER4KEmk3jCeNhfV7hNTNyh2XGNpbE8Pqk9CZsBe2BJiy";
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
const SUPABASE_AGENTS_OBJECT = String(process.env.SUPABASE_AGENTS_OBJECT || "agents/agents.json").trim();
const SUPABASE_PUMPFUN_PREPARED_OBJECT = String(process.env.SUPABASE_PUMPFUN_PREPARED_OBJECT || "pumpfun/prepared-submissions.json").trim();
const SUPABASE_PUMPFUN_SESSIONS_OBJECT = String(process.env.SUPABASE_PUMPFUN_SESSIONS_OBJECT || "pumpfun/sessions.json").trim();
const SUPABASE_PUMPFUN_LAUNCHES_OBJECT = String(process.env.SUPABASE_PUMPFUN_LAUNCHES_OBJECT || "pumpfun/launches.json").trim();
const SUPABASE_PUMPFUN_METADATA_OBJECT = String(process.env.SUPABASE_PUMPFUN_METADATA_OBJECT || "pumpfun/metadata.json").trim();
const SUPABASE_SUPPORT_OBJECT = String(process.env.SUPABASE_SUPPORT_OBJECT || "support/messages.json").trim();
const SUPABASE_PUMPR_CARD_WAITLIST_OBJECT = String(process.env.SUPABASE_PUMPR_CARD_WAITLIST_OBJECT || "pumpr-card/waitlist.json").trim();
const SUPABASE_REFERRAL_OBJECT = String(process.env.SUPABASE_REFERRAL_OBJECT || "referrals/referrals.json").trim();
const SUPABASE_SOCIAL_OBJECT = String(process.env.SUPABASE_SOCIAL_OBJECT || "social/social.json").trim();
const COMMUNITY_RESET_BEFORE_UNIX = Math.max(0, Number(process.env.COMMUNITY_RESET_BEFORE_UNIX || "1782413298"));
const PROFILE_IMAGE_URI_MAX_LENGTH = 2 * 1024 * 1024;
const STRICT_PROFILE_STORE = String(process.env.STRICT_PROFILE_STORE || (IS_VERCEL_RUNTIME ? "1" : "0")) === "1";
const STRICT_SOCIAL_STORE = String(process.env.STRICT_SOCIAL_STORE || (STRICT_PROFILE_STORE ? "1" : "0")) === "1";
const STRICT_JSON_STORE = String(process.env.STRICT_JSON_STORE || (IS_VERCEL_RUNTIME ? "1" : "0")) === "1";
const STRICT_UPLOAD_STORE = String(process.env.STRICT_UPLOAD_STORE || (IS_VERCEL_RUNTIME ? "1" : "0")) === "1";
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
    Transaction: mod.Transaction,
    TransactionMessage: mod.TransactionMessage,
    VersionedTransaction: mod.VersionedTransaction,
    ComputeBudgetProgram: mod.ComputeBudgetProgram
  };
}

async function loadPumpFunSdk() {
  if (!pumpSdkPromise) {
    pumpSdkPromise = Promise.resolve(require("@pump-fun/pump-sdk"));
  }
  const mod = await pumpSdkPromise;
  return mod.PUMP_SDK || mod.default?.PUMP_SDK || mod.default;
}

async function loadPumpFunSdkModule() {
  if (!pumpSdkPromise) {
    pumpSdkPromise = Promise.resolve(require("@pump-fun/pump-sdk"));
  }
  return pumpSdkPromise;
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
  4663: "robinhood-chain",
  8453: "base",
  11155111: "sepolia-testnet"
};
const DEXSCREENER_CHAIN_BY_ID = {
  1: "ethereum",
  143: "monad",
  101: "solana",
  4663: "robinhood",
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
  4663: {
    name: "Robinhood Chain",
    shortName: "RH",
    nativeCurrency: "ETH",
    explorerBaseUrl: "https://robinhoodchain.blockscout.com",
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
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
app.use(express.json({ limit: "25mb" }));
app.set("trust proxy", true);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Selected evidence file is too large to upload through Pump-r." });
  }
  return next(error);
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
let supportDbRemoteLoaded = false;
let communityDbCache = null;
let communityDbRemoteLoaded = false;
let goDbCache = null;
let alphaDbCache = null;
let alphaDbRemoteLoaded = false;
let agentsDbCache = null;
let agentsDbRemoteLoaded = false;
let referralDbCache = null;
let referralDbRemoteLoaded = false;
let socialDbCache = null;
let socialDbRemoteLoaded = false;
let pumpFunBountiesCache = { rows: [], fetchedAt: 0, error: "" };
const pumpFunBountyDetailCache = new Map();
let pumpFunLaunchesDbCache = null;
let pumpFunLaunchesRemoteLoaded = false;
const profileLastKnownCache = new Map();
const xOauthStates = new Map();

function resolvePlatformSupportAddress() {
  const candidates = [
    process.env.PUMPR_MAIN_WALLET,
    process.env.PUMPR_MAIN_ADMIN_WALLET,
    process.env.PUMPR_ADMIN_WALLET,
    DEFAULT_PUMPR_ADMIN_WALLET,
    process.env.SUPPORT_WALLET,
    process.env.PLATFORM_FEE_RECIPIENT,
    process.env.FEE_RECIPIENT
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSupportAddress(candidate || "");
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
    const order = [1, 8453, 143, 4663, 11155111, 31337];
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

  if (chainId === 4663) {
    pushIf(process.env.ROBINHOOD_RPC_URL);
    pushIf(process.env.RH_RPC_URL);
    pushIf("https://rpc.mainnet.chain.robinhood.com");
    return urls;
  }

  if (chainId === 101) {
    pushIf(process.env.PUMPFUN_SOLANA_RPC_URL);
    pushIf(process.env.ALCHEMY_SOLANA_RPC_URL);
    pushIf(process.env.HELIUS_SOLANA_RPC_URL);
    pushIf(process.env.SOLANA_RPC_URL);
    pushIf("https://sparkling-blue-sponge.solana-mainnet.quiknode.pro/1a7f99d93cb6940285e9a095de8fc546c3c76d35/");
    pushIf("https://solana-rpc.publicnode.com");
    pushIf("https://api.mainnet-beta.solana.com");
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

function pickPumpFunSolanaRpcUrls(preferred = "") {
  const urls = [];
  const pushIf = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (!urls.includes(text)) urls.push(text);
  };
  pushIf(preferred);
  pushIf(process.env.PUMPFUN_SOLANA_RPC_URL);
  pushIf(process.env.ALCHEMY_SOLANA_RPC_URL);
  pushIf(process.env.HELIUS_SOLANA_RPC_URL);
  const extra = String(process.env.SOLANA_RPC_URLS || "").split(/[,\s]+/).filter(Boolean);
  for (const row of extra) pushIf(row);
  pushIf(process.env.SOLANA_RPC_URL);
  for (const row of pickRpcUrls(101)) pushIf(row);
  return urls;
}

function isRetryableSolanaRpcError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("daily request limit") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    error?.code === -32003
  );
}

async function withPumpFunSolanaRpc(SolanaConnection, label, worker, options = {}) {
  const urls = pickPumpFunSolanaRpcUrls(options.preferredRpcUrl);
  let lastError = null;
  for (let index = 0; index < urls.length; index += 1) {
    const rpcUrl = urls[index];
    const connection = new SolanaConnection(rpcUrl, "confirmed");
    try {
      return await worker(connection, rpcUrl);
    } catch (error) {
      lastError = error;
      const retryable = !error?.noRpcRetry && (isRetryableSolanaRpcError(error) || options.retryAll === true);
      if (!retryable || index === urls.length - 1) break;
      console.warn(`${label} Solana RPC failed, trying fallback ${index + 2}/${urls.length}: ${error?.message || error}`);
    }
  }
  throw lastError || new Error(`${label} failed: no Solana RPC configured`);
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
  const probeTimeoutMs = [8453, 143, 4663].includes(normalizedChainId) ? Math.max(RPC_PROBE_TIMEOUT_MS, 12_000) : RPC_PROBE_TIMEOUT_MS;
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

function normalizeProfileAddress(input) {
  const text = String(input || "").trim();
  const evm = normalizeAddress(text);
  if (evm) return evm;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : null;
}

function normalizeSupportAddress(input) {
  return normalizeProfileAddress(input);
}

function supportAddressKey(input) {
  const normalized = normalizeSupportAddress(input);
  if (!normalized) return "";
  return /^0x[a-fA-F0-9]{40}$/.test(normalized) ? normalized.toLowerCase() : normalized;
}

function configuredAdminWallets() {
  const values = [
    DEFAULT_PUMPR_ADMIN_WALLET,
    process.env.PUMPR_MAIN_WALLET,
    process.env.PUMPR_MAIN_ADMIN_WALLET,
    process.env.PUMPR_ADMIN_WALLET,
    process.env.SUPPORT_WALLET,
    ...(String(process.env.PUMPR_ADMIN_WALLETS || "")
      .split(",")
      .map((row) => row.trim())
      .filter(Boolean))
  ];
  const seen = new Set();
  const wallets = [];
  for (const value of values) {
    const normalized = normalizeSupportAddress(value);
    const key = supportAddressKey(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    wallets.push(normalized);
  }
  return wallets;
}

function isAdminSupportWallet(input) {
  const key = supportAddressKey(input);
  if (!key) return false;
  return configuredAdminWallets().some((wallet) => supportAddressKey(wallet) === key);
}

function buildAdminAuthMessage(wallet, scope, issuedAt) {
  return [
    "Pump-r admin access",
    `Wallet: ${wallet}`,
    `Scope: ${scope}`,
    `Issued At: ${issuedAt}`
  ].join("\n");
}

function decodeAdminSignature(value = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return Buffer.from(text, "base64");
  } catch {
    return null;
  }
}

function verifyAdminWalletProof(req, scope = "pumpr-admin") {
  const wallet = normalizeSupportAddress(req.query.adminWallet || req.query.wallet || req.query.address || req.get("x-admin-wallet") || "");
  const message = String(req.query.adminMessage || req.get("x-admin-message") || "");
  const signature = decodeAdminSignature(req.query.adminSignature || req.get("x-admin-signature") || "");
  if (!wallet || !message || !signature || !isAdminSupportWallet(wallet)) return false;

  const issuedMatch = message.match(/^Issued At:\s*(.+)$/m);
  const issuedAt = String(issuedMatch?.[1] || "").trim();
  const issuedMs = Date.parse(issuedAt);
  const now = Date.now();
  if (!Number.isFinite(issuedMs) || issuedMs < now - 15 * 60 * 1000 || issuedMs > now + 2 * 60 * 1000) return false;
  if (message !== buildAdminAuthMessage(wallet, scope, issuedAt)) return false;

  try {
    const publicKeyBytes = bs58.decode(wallet);
    if (publicKeyBytes.length !== 32 || signature.length !== 64) return false;
    return ed25519.verify(signature, Buffer.from(message, "utf8"), publicKeyBytes);
  } catch {
    return false;
  }
}

function hasAdminRequestAccess(req, scope = "pumpr-admin") {
  const configuredKey = String(process.env.PUMPR_CARD_WAITLIST_ADMIN_KEY || process.env.PUMPR_ADMIN_KEY || "").trim();
  const providedKey = String(req.query.key || req.get("x-admin-key") || "").trim();
  if (configuredKey && providedKey === configuredKey) return true;
  return verifyAdminWalletProof(req, scope);
}

function defaultUsername(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return "Guest";
  return `eth_${normalized.slice(2, 8).toLowerCase()}`;
}

function defaultProfileUsername(address) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return "Guest";
  if (normalizeAddress(normalized)) return defaultUsername(normalized);
  return `sol_${normalized.slice(0, 6)}`;
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
  const normalized = normalizeProfileAddress(address);
  const safeAddress = normalized || "";
  const usernameRaw = String(value.username || "").trim();
  const bioRaw = String(value.bio || "").trim();
  const imageRaw = sanitizePersistedImageUri(String(value.imageUri || "").trim());
  return {
    address: safeAddress,
    username: usernameRaw || defaultProfileUsername(safeAddress),
    bio: bioRaw.slice(0, 500),
    imageUri: imageRaw.slice(0, PROFILE_IMAGE_URI_MAX_LENGTH)
  };
}

function mergeProfileValues(address, localValue = {}, remoteValue = {}) {
  const normalized = normalizeProfileAddress(address);
  const local = sanitizeProfileValue(normalized, localValue || {});
  const remote = sanitizeProfileValue(normalized, remoteValue || {});
  const fallbackName = defaultProfileUsername(normalized);

  const localHasCustomName = String(local.username || "") !== fallbackName;
  const remoteHasCustomName = String(remote.username || "") !== fallbackName;

  return sanitizeProfileValue(normalized, {
    username: remoteHasCustomName ? remote.username : localHasCustomName ? local.username : remote.username || local.username,
    bio: String(remote.bio || "").trim() ? remote.bio : local.bio,
    imageUri: String(remote.imageUri || "").trim() ? remote.imageUri : local.imageUri
  });
}

function cacheProfileRow(address, value = {}) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return;
  profileLastKnownCache.set(normalized.toLowerCase(), sanitizeProfileValue(normalized, value));
}

function getCachedProfile(address) {
  const normalized = normalizeProfileAddress(address);
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
  const normalized = normalizeProfileAddress(address);
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
    const normalized = normalizeProfileAddress(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    out[key] = getPersistedProfileSync(normalized);
  }
  return out;
}

function setPersistedProfileSync(address, value = {}) {
  const normalized = normalizeProfileAddress(address);
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

function assertJsonStoreConfigured(label, objectPath) {
  if (!STRICT_JSON_STORE) return;
  if (!isSupabaseStorageConfigured()) {
    throw new Error(`${label} store requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET in production`);
  }
  if (!String(objectPath || "").trim()) {
    throw new Error(`${label} store requires a Supabase storage object path in production`);
  }
}

function allowFileJsonFallback() {
  return !STRICT_JSON_STORE;
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
  if ([408, 429, 500, 502, 503, 504, 544].includes(Number(createRes.status))) {
    console.warn(`Supabase bucket create deferred: ${createRes.status} ${text}`.trim());
    return false;
  }
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
      const combinedText = String(retryText || text || "");
      if (String(combinedText).toLowerCase().includes("bucket not found")) {
        throw new Error(`Supabase storage bucket "${SUPABASE_STORAGE_BUCKET}" is not ready. Create it in Supabase Storage or retry after the database timeout clears.`);
      }
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
  const normalized = normalizeProfileAddress(address);
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
  const normalized = [...new Set((Array.isArray(addresses) ? addresses : []).map((row) => normalizeProfileAddress(row)).filter(Boolean))];
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
  const normalized = normalizeProfileAddress(address);
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
      if (!allowFileProfileFallback()) {
        throw new Error(`Supabase profile write failed: ${error?.message || "profile table missing"}`);
      }
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
  const resetBefore = COMMUNITY_RESET_BEFORE_UNIX;
  const commentsByPost = {};
  if (store.comments && typeof store.comments === "object" && !Array.isArray(store.comments)) {
    for (const [postId, comments] of Object.entries(store.comments)) {
      const rows = Array.isArray(comments)
        ? comments
            .map((comment) => normalizeCommunityComment(comment, postId))
            .filter(Boolean)
            .filter((comment) => Number(comment.createdAt || 0) >= resetBefore)
        : [];
      if (rows.length) commentsByPost[postId] = rows.slice(-100);
    }
  }
  const posts = (Array.isArray(store.posts) ? store.posts : [])
    .map(normalizeCommunityPost)
    .filter(Boolean)
    .map((post) => ({
      ...post,
      comments: (Array.isArray(post.comments) ? post.comments : []).filter((comment) => Number(comment?.createdAt || 0) >= resetBefore)
    }))
    .filter((post) => Number(post.createdAt || 0) >= resetBefore);
  return {
    posts,
    comments: commentsByPost,
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
  assertJsonStoreConfigured("Community", SUPABASE_COMMUNITY_OBJECT);
  writeCommunityDb(safe);
  if (isSupabaseStorageConfigured()) {
    await writeCommunityDbRemote(safe);
  }
  return safe;
}

function emptyPumprCardWaitlistStore() {
  return { entries: [] };
}

function sanitizePumprCardText(value = "", max = 240) {
  return Array.from(String(value || "").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

function normalizePumprCardEmail(value = "") {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email.slice(0, 180);
}

function sanitizePumprCardWaitlistStore(store = {}) {
  const seen = new Set();
  const entries = (Array.isArray(store?.entries) ? store.entries : [])
    .map((row) => {
      const email = normalizePumprCardEmail(row?.email || "");
      if (!email) return null;
      return {
        email,
        wallet: sanitizePumprCardText(row?.wallet || row?.address || "", 90),
        source: sanitizePumprCardText(row?.source || "pumpr-card", 80),
        createdAt: Number(row?.createdAt || Math.floor(Date.now() / 1000)),
        userAgent: sanitizePumprCardText(row?.userAgent || "", 220)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .filter((row) => {
      if (seen.has(row.email)) return false;
      seen.add(row.email);
      return true;
    })
    .slice(0, 5000);
  return { entries };
}

function readPumprCardWaitlistDb() {
  try {
    if (fs.existsSync(PUMPR_CARD_WAITLIST_DB_PATH)) {
      return sanitizePumprCardWaitlistStore(JSON.parse(fs.readFileSync(PUMPR_CARD_WAITLIST_DB_PATH, "utf8") || "{}"));
    }
  } catch {
    // fall through
  }
  return emptyPumprCardWaitlistStore();
}

function writePumprCardWaitlistDb(store) {
  const safe = sanitizePumprCardWaitlistStore(store);
  try {
    fs.mkdirSync(path.dirname(PUMPR_CARD_WAITLIST_DB_PATH), { recursive: true });
    fs.writeFileSync(PUMPR_CARD_WAITLIST_DB_PATH, JSON.stringify(safe, null, 2));
  } catch {
    // /tmp/local cache failures should not block remote storage attempts.
  }
  return safe;
}

async function readPumprCardWaitlistRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPR_CARD_WAITLIST_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPR_CARD_WAITLIST_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase PUMPR Card waitlist read failed: ${response.status}`);
  return sanitizePumprCardWaitlistStore(await response.json().catch(() => emptyPumprCardWaitlistStore()));
}

async function writePumprCardWaitlistRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPR_CARD_WAITLIST_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPR_CARD_WAITLIST_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizePumprCardWaitlistStore(store), null, 2)
  });
  if (!response.ok) throw new Error(`Supabase PUMPR Card waitlist write failed: ${response.status}`);
  return true;
}

async function readPumprCardWaitlistPersistent(options = {}) {
  if (isSupabaseStorageConfigured() && options.refresh) {
    const remote = await readPumprCardWaitlistRemote().catch(() => null);
    if (remote) writePumprCardWaitlistDb(remote);
  }
  return sanitizePumprCardWaitlistStore(readPumprCardWaitlistDb());
}

async function writePumprCardWaitlistPersistent(store) {
  assertJsonStoreConfigured("PUMPR Card waitlist", SUPABASE_PUMPR_CARD_WAITLIST_OBJECT);
  const safe = writePumprCardWaitlistDb(store);
  if (isSupabaseStorageConfigured()) {
    await writePumprCardWaitlistRemote(safe).catch((error) => {
      if (!allowFileJsonFallback()) throw error;
      console.warn(`Supabase PUMPR Card waitlist write failed: ${error?.message || "connection error"}`);
    });
  }
  return safe;
}

async function addPumprCardWaitlistEntry(value = {}) {
  const email = normalizePumprCardEmail(value.email || "");
  if (!email) throw new Error("Enter a valid email address");
  const store = await readPumprCardWaitlistPersistent({ refresh: true });
  const entry = {
    email,
    wallet: sanitizePumprCardText(value.wallet || value.address || "", 90),
    source: sanitizePumprCardText(value.source || "pumpr-card", 80),
    createdAt: Math.floor(Date.now() / 1000),
    userAgent: sanitizePumprCardText(value.userAgent || "", 220)
  };
  const entries = [entry, ...(store.entries || []).filter((row) => row.email !== email)];
  await writePumprCardWaitlistPersistent({ entries });
  return entry;
}

function emptyReferralStore() {
  return { profiles: [], referrals: [], visits: [], payouts: [], updatedAt: 0 };
}

function referralWalletKey(input) {
  return supportAddressKey(input);
}

function normalizeReferralName(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 24);
  return /^[a-z0-9][a-z0-9_-]{2,23}$/.test(text) ? text : "";
}

function reservedReferralNames() {
  return new Set([
    "api",
    "admin",
    "airdrop",
    "alpha",
    "assets",
    "card",
    "communities",
    "create",
    "go",
    "home",
    "js",
    "profile",
    "pumpr",
    "pumpr-card",
    "referral",
    "referrals",
    "support",
    "token",
    "uploads"
  ]);
}

function defaultReferralName(wallet = "", existing = new Set()) {
  const normalized = normalizeSupportAddress(wallet);
  const seed = String(normalized || wallet || "pumpr").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "holder";
  const base = normalizeReferralName(`pumpr-${seed}`) || "pumpr-holder";
  if (!existing.has(base) && !reservedReferralNames().has(base)) return base;
  for (let i = 2; i < 5000; i += 1) {
    const candidate = normalizeReferralName(`${base}-${i}`);
    if (candidate && !existing.has(candidate) && !reservedReferralNames().has(candidate)) return candidate;
  }
  return `pumpr-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeReferralProfile(row = {}) {
  const wallet = normalizeSupportAddress(row.wallet || row.address || "");
  const key = referralWalletKey(wallet);
  if (!wallet || !key) return null;
  return {
    wallet,
    key,
    name: normalizeReferralName(row.name || row.code || ""),
    createdAt: parseUnixTimestamp(row.createdAt || row.created_at || row.ts) || Math.floor(Date.now() / 1000),
    updatedAt: parseUnixTimestamp(row.updatedAt || row.updated_at || row.ts) || Math.floor(Date.now() / 1000)
  };
}

function normalizeReferralVisit(row = {}) {
  const ref = normalizeReferralName(row.ref || row.referralName || row.code || "");
  const referrerWallet = normalizeSupportAddress(row.referrerWallet || "");
  if (!ref && !referrerWallet) return null;
  return {
    id: String(row.id || "").trim() || `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    ref,
    referrerWallet: referrerWallet || "",
    landingPath: String(row.landingPath || row.path || "/").slice(0, 240),
    userAgentHash: String(row.userAgentHash || "").slice(0, 80),
    createdAt: parseUnixTimestamp(row.createdAt || row.created_at || row.ts) || Math.floor(Date.now() / 1000)
  };
}

function normalizeReferralRow(row = {}) {
  const referrerWallet = normalizeSupportAddress(row.referrerWallet || row.referrer || "");
  const referredWallet = normalizeSupportAddress(row.referredWallet || row.referred || "");
  const referrerKey = referralWalletKey(referrerWallet);
  const referredKey = referralWalletKey(referredWallet);
  if (!referrerWallet || !referredWallet || !referrerKey || !referredKey || referrerKey === referredKey) return null;
  const createdAt = parseUnixTimestamp(row.createdAt || row.created_at || row.ts) || Math.floor(Date.now() / 1000);
  const connectedAt = parseUnixTimestamp(row.connectedAt || row.connected_at) || createdAt;
  const firstQualifiedAt = parseUnixTimestamp(row.firstQualifiedAt || row.first_qualified_at) || 0;
  const lastCheckedAt = parseUnixTimestamp(row.lastCheckedAt || row.last_checked_at) || 0;
  const holderPct = Math.max(0, Number(row.holderPct || 0) || 0);
  const balanceTokens = Math.max(0, Number(row.balanceTokens || 0) || 0);
  const holdingSeconds = Math.max(0, Number(row.holdingSeconds || 0) || 0);
  return {
    id: String(row.id || `${referrerKey}:${referredKey}`).slice(0, 160),
    referrerWallet,
    referredWallet,
    referrerKey,
    referredKey,
    referralName: normalizeReferralName(row.referralName || row.code || ""),
    landingPath: String(row.landingPath || "/").slice(0, 240),
    source: String(row.source || "referral").slice(0, 80),
    status: String(row.status || "connected").slice(0, 40),
    tier: String(row.tier || "Pending").slice(0, 40),
    score: Math.max(0, Math.floor(Number(row.score || 0) || 0)),
    rewardEstimatePumpr: Math.max(0, Math.floor(Number(row.rewardEstimatePumpr || 0) || 0)),
    balanceTokens,
    balanceRaw: String(row.balanceRaw || ""),
    holderPct,
    holdingSeconds,
    createdAt,
    connectedAt,
    firstQualifiedAt,
    lastCheckedAt,
    payoutStatus: String(row.payoutStatus || "pending").slice(0, 40),
    payoutTx: String(row.payoutTx || "").slice(0, 140)
  };
}

function sanitizeReferralStore(store = {}) {
  const profilesByWallet = new Map();
  const names = new Set();
  for (const row of Array.isArray(store?.profiles) ? store.profiles : []) {
    const profile = normalizeReferralProfile(row);
    if (!profile) continue;
    let name = profile.name;
    if (!name || names.has(name) || reservedReferralNames().has(name)) {
      name = defaultReferralName(profile.wallet, names);
    }
    profile.name = name;
    names.add(name);
    profilesByWallet.set(profile.key, profile);
  }

  const referralsByReferred = new Map();
  for (const row of Array.isArray(store?.referrals) ? store.referrals : []) {
    const referral = normalizeReferralRow(row);
    if (!referral) continue;
    const existing = referralsByReferred.get(referral.referredKey);
    if (!existing || Number(referral.createdAt || 0) < Number(existing.createdAt || 0)) {
      referralsByReferred.set(referral.referredKey, referral);
    }
  }

  const visits = (Array.isArray(store?.visits) ? store.visits : [])
    .map((row) => normalizeReferralVisit(row))
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 5000);

  return {
    profiles: [...profilesByWallet.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    referrals: [...referralsByReferred.values()].sort((a, b) => Number(b.connectedAt || b.createdAt || 0) - Number(a.connectedAt || a.createdAt || 0)),
    visits,
    payouts: (Array.isArray(store?.payouts) ? store.payouts : []).slice(-2000),
    updatedAt: parseUnixTimestamp(store?.updatedAt) || Math.floor(Date.now() / 1000)
  };
}

function readReferralDb() {
  if (referralDbCache && typeof referralDbCache === "object") return referralDbCache;
  try {
    if (fs.existsSync(REFERRAL_DB_PATH)) {
      referralDbCache = sanitizeReferralStore(JSON.parse(fs.readFileSync(REFERRAL_DB_PATH, "utf8") || "{}"));
      return referralDbCache;
    }
  } catch {
    // fall through
  }
  referralDbCache = emptyReferralStore();
  return referralDbCache;
}

function writeReferralDb(store) {
  const safe = sanitizeReferralStore(store);
  safe.updatedAt = Math.floor(Date.now() / 1000);
  try {
    fs.mkdirSync(path.dirname(REFERRAL_DB_PATH), { recursive: true });
    fs.writeFileSync(REFERRAL_DB_PATH, JSON.stringify(safe, null, 2));
  } catch {
    // /tmp/local cache failures should not block remote storage attempts.
  }
  referralDbCache = safe;
  return safe;
}

async function readReferralDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_REFERRAL_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_REFERRAL_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase referral read failed: ${response.status}`);
  return sanitizeReferralStore(await response.json().catch(() => emptyReferralStore()));
}

async function writeReferralDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_REFERRAL_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_REFERRAL_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizeReferralStore(store), null, 2)
  });
  if (!response.ok) throw new Error(`Supabase referral write failed: ${response.status}`);
  return true;
}

async function readReferralDbPersistent(options = {}) {
  const refresh = Boolean(options.refresh);
  if (isSupabaseStorageConfigured() && (refresh || !referralDbRemoteLoaded)) {
    try {
      const remote = await readReferralDbRemote();
      if (remote) writeReferralDb(remote);
      referralDbRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase referral read failed: ${error?.message || "connection error"}`);
      referralDbRemoteLoaded = true;
    }
  }
  return sanitizeReferralStore(readReferralDb());
}

async function writeReferralDbPersistent(store) {
  assertJsonStoreConfigured("Referral", SUPABASE_REFERRAL_OBJECT);
  const safe = writeReferralDb(store);
  if (isSupabaseStorageConfigured()) {
    await writeReferralDbRemote(safe);
  }
  return safe;
}

function referralProfileForWallet(store, wallet, options = {}) {
  const normalized = normalizeSupportAddress(wallet);
  const key = referralWalletKey(normalized);
  if (!normalized || !key) return null;
  let profile = (store.profiles || []).find((row) => row.key === key) || null;
  if (!profile && options.create) {
    const used = new Set((store.profiles || []).map((row) => row.name).filter(Boolean));
    profile = normalizeReferralProfile({
      wallet: normalized,
      name: defaultReferralName(normalized, used),
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });
    store.profiles = [...(store.profiles || []), profile];
  }
  return profile;
}

function findReferralProfileByRef(store, ref = "") {
  const text = String(ref || "").trim();
  const name = normalizeReferralName(text);
  if (name) {
    const byName = (store.profiles || []).find((row) => row.name === name);
    if (byName) return byName;
  }
  const wallet = normalizeSupportAddress(text);
  const key = referralWalletKey(wallet);
  return key ? (store.profiles || []).find((row) => row.key === key) || normalizeReferralProfile({ wallet, name: "" }) : null;
}

function emptySocialStore() {
  return {
    profiles: [
      {
        wallet: DEFAULT_PUMPR_ADMIN_WALLET,
        handle: "pumpr_social",
        displayName: "Pump-r Social",
        bio: "Official Pump-r Social beta account.",
        imageUri: "/assets/pump-r-logo.png?v=20260609brand",
        source: "official",
        xUsername: "pf_remastered",
        createdAt: 1783305600,
        updatedAt: 1783305600,
        xp: 25
      }
    ],
    posts: [
      {
        id: "seed-pumpr-social",
        authorWallet: DEFAULT_PUMPR_ADMIN_WALLET,
        body: "Pump-r Social beta is live. Post useful crypto takes, follow creators, build your profile, and earn social XP while rewards are tested.",
        token: "$PUMPR",
        chain: "SOL",
        category: "announcement",
        createdAt: 1783305600,
        likes: [],
        reposts: [],
        replies: []
      },
      {
        id: "seed-launch-radar",
        authorWallet: DEFAULT_PUMPR_ADMIN_WALLET,
        body: "Launch radar is for contract posts, new Pump-r launches, creator updates, and mint links. Drop the CA when the token is live.",
        token: "$PUMPR",
        chain: "SOL",
        category: "launch",
        createdAt: 1783303800,
        likes: [],
        reposts: [],
        replies: []
      },
      {
        id: "seed-alpha-desk",
        authorWallet: DEFAULT_PUMPR_ADMIN_WALLET,
        body: "Alpha desk is for actual signals: wallet flow, chart context, watchlists, launch support, and theses people can act on.",
        token: "$PUMPR",
        chain: "SOL",
        category: "alpha",
        createdAt: 1783303000,
        likes: [],
        reposts: [],
        replies: []
      },
      {
        id: "seed-builder-rewards",
        authorWallet: DEFAULT_PUMPR_ADMIN_WALLET,
        body: "Rewards feed tracks social XP, holder rewards, referral bonuses, creator rewards, and airdrop-related updates.",
        token: "$PUMPR",
        chain: "SOL",
        category: "rewards",
        createdAt: 1783302000,
        likes: [],
        reposts: [],
        replies: []
      }
    ],
    updatedAt: Math.floor(Date.now() / 1000)
  };
}

function normalizeSocialHandle(value = "") {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return /^[a-z0-9][a-z0-9_]{2,23}$/.test(text) ? text : "";
}

function reservedSocialHandles() {
  return new Set([
    "admin",
    "airdrop",
    "alpha",
    "api",
    "card",
    "communities",
    "create",
    "go",
    "home",
    "official",
    "profile",
    "pump",
    "pumpr",
    "pumpfun",
    "referrals",
    "social",
    "support",
    "token"
  ]);
}

function sanitizeSocialText(value = "", max = 280) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeSocialMediaUrl(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString().slice(0, 1024);
  } catch {
    return "";
  }
}

function defaultSocialHandle(wallet = "", existing = new Set()) {
  const seed = String(wallet || "pumpr").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase() || "holder";
  const base = normalizeSocialHandle(`pumpr_${seed}`) || "pumpr_holder";
  if (!existing.has(base) && !reservedSocialHandles().has(base)) return base;
  for (let i = 2; i < 5000; i += 1) {
    const candidate = normalizeSocialHandle(`${base}_${i}`);
    if (candidate && !existing.has(candidate) && !reservedSocialHandles().has(candidate)) return candidate;
  }
  return `pumpr_${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeSocialProfile(row = {}, existingHandles = new Set()) {
  const wallet = normalizeSupportAddress(row.wallet || row.address || "");
  const key = supportAddressKey(wallet);
  if (!wallet || !key) return null;
  let handle = normalizeSocialHandle(row.handle || row.username || row.name || "");
  if (!handle || reservedSocialHandles().has(handle) || existingHandles.has(handle)) {
    handle = defaultSocialHandle(wallet, existingHandles);
  }
  return {
    wallet,
    key,
    handle,
    displayName: sanitizeSocialText(row.displayName || row.name || row.username || handle, 60),
    bio: sanitizeSocialText(row.bio || "", 180),
    imageUri: normalizeSocialMediaUrl(row.imageUri || row.image || row.profileImageUrl || ""),
    source: sanitizeSocialText(row.source || row.type || "wallet", 40),
    xUsername: normalizeSocialHandle(row.xUsername || row.x_username || ""),
    createdAt: parseUnixTimestamp(row.createdAt || row.created_at || row.ts) || Math.floor(Date.now() / 1000),
    updatedAt: parseUnixTimestamp(row.updatedAt || row.updated_at || row.ts) || Math.floor(Date.now() / 1000),
    xp: Math.max(0, Math.floor(Number(row.xp || 0) || 0))
  };
}

function extractCryptoTags(text = "") {
  const body = String(text || "");
  const cashtags = [...new Set((body.match(/\$[A-Za-z][A-Za-z0-9_]{1,20}/g) || []).map((row) => row.toUpperCase()))].slice(0, 8);
  const contracts = [...new Set(body.match(/\b(?:0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})\b/g) || [])].slice(0, 4);
  return { cashtags, contracts };
}

function normalizeSocialReply(row = {}) {
  const authorWallet = normalizeSupportAddress(row.authorWallet || row.wallet || row.address || "");
  const authorKey = supportAddressKey(authorWallet);
  const body = sanitizeSocialText(row.body || row.text || "", 360);
  if (!authorWallet || !authorKey || !body) return null;
  return {
    id: String(row.id || `reply-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`).slice(0, 80),
    authorWallet,
    authorKey,
    body,
    createdAt: parseUnixTimestamp(row.createdAt || row.created_at || row.ts) || Math.floor(Date.now() / 1000)
  };
}

function normalizeSocialPost(row = {}) {
  const authorWallet = normalizeSupportAddress(row.authorWallet || row.wallet || row.address || "");
  const authorKey = supportAddressKey(authorWallet);
  const body = sanitizeSocialText(row.body || row.text || row.content || "", 1200);
  if (!authorWallet || !authorKey || !body) return null;
  const tags = extractCryptoTags(body);
  return {
    id: String(row.id || `post-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`).slice(0, 90),
    authorWallet,
    authorKey,
    body,
    token: sanitizeSocialText(row.token || row.cashtag || tags.cashtags[0] || "", 32),
    chain: sanitizeSocialText(row.chain || "SOL", 24).toUpperCase(),
    category: sanitizeSocialText(row.category || "post", 40),
    mediaUrl: normalizeSocialMediaUrl(row.mediaUrl || row.media || ""),
    createdAt: parseUnixTimestamp(row.createdAt || row.created_at || row.ts) || Math.floor(Date.now() / 1000),
    tags,
    likes: [...new Set((Array.isArray(row.likes) ? row.likes : []).map((value) => supportAddressKey(value)).filter(Boolean))].slice(0, 5000),
    reposts: [...new Set((Array.isArray(row.reposts) ? row.reposts : []).map((value) => supportAddressKey(value)).filter(Boolean))].slice(0, 5000),
    replies: (Array.isArray(row.replies) ? row.replies : []).map((reply) => normalizeSocialReply(reply)).filter(Boolean).slice(0, 300)
  };
}

function sanitizeSocialStore(store = {}) {
  const handles = new Set();
  const profilesByKey = new Map();
  for (const row of Array.isArray(store?.profiles) ? store.profiles : []) {
    const profile = normalizeSocialProfile(row, handles);
    if (!profile) continue;
    handles.add(profile.handle);
    profilesByKey.set(profile.key, profile);
  }

  const postsById = new Map();
  for (const row of Array.isArray(store?.posts) ? store.posts : []) {
    const post = normalizeSocialPost(row);
    if (!post) continue;
    postsById.set(post.id, post);
    if (!profilesByKey.has(post.authorKey)) {
      const profile = normalizeSocialProfile(
        post.authorWallet === DEFAULT_PUMPR_ADMIN_WALLET
          ? {
              wallet: post.authorWallet,
              handle: "pumpr_social",
              displayName: "Pump-r Social",
              imageUri: "/assets/pump-r-logo.png?v=20260609brand",
              source: "official",
              xUsername: "pf_remastered",
              xp: 25
            }
          : { wallet: post.authorWallet, source: "post" },
        handles
      );
      if (profile) {
        handles.add(profile.handle);
        profilesByKey.set(profile.key, profile);
      }
    }
  }

  const seeded = postsById.size ? [...postsById.values()] : emptySocialStore().posts;
  return {
    profiles: [...profilesByKey.values()].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
    posts: seeded.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 1000),
    updatedAt: parseUnixTimestamp(store?.updatedAt) || Math.floor(Date.now() / 1000)
  };
}

function readSocialDb() {
  if (socialDbCache && typeof socialDbCache === "object") return socialDbCache;
  try {
    if (fs.existsSync(SOCIAL_DB_PATH)) {
      socialDbCache = sanitizeSocialStore(JSON.parse(fs.readFileSync(SOCIAL_DB_PATH, "utf8") || "{}"));
      return socialDbCache;
    }
  } catch {
    // fall through
  }
  socialDbCache = emptySocialStore();
  return socialDbCache;
}

function writeSocialDb(store) {
  const safe = sanitizeSocialStore(store);
  safe.updatedAt = Math.floor(Date.now() / 1000);
  try {
    fs.mkdirSync(path.dirname(SOCIAL_DB_PATH), { recursive: true });
    fs.writeFileSync(SOCIAL_DB_PATH, JSON.stringify(safe, null, 2));
  } catch {
    // Local mirror failures should not block remote writes.
  }
  socialDbCache = safe;
  return safe;
}

async function readSocialDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_SOCIAL_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_SOCIAL_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase social read failed: ${response.status}`);
  return sanitizeSocialStore(await response.json().catch(() => emptySocialStore()));
}

async function writeSocialDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_SOCIAL_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_SOCIAL_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizeSocialStore(store), null, 2)
  });
  if (!response.ok) throw new Error(`Supabase social write failed: ${response.status}`);
  return true;
}

async function readSocialDbPersistent(options = {}) {
  if (isSupabaseStorageConfigured() && (options.refresh || !socialDbRemoteLoaded)) {
    try {
      const remote = await readSocialDbRemote();
      if (remote) writeSocialDb(remote);
      socialDbRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase social read failed: ${error?.message || "connection error"}`);
      socialDbRemoteLoaded = true;
    }
  }
  return sanitizeSocialStore(readSocialDb());
}

async function writeSocialDbPersistent(store) {
  assertJsonStoreConfigured("Social", SUPABASE_SOCIAL_OBJECT);
  const safe = writeSocialDb(store);
  if (isSupabaseStorageConfigured()) {
    await writeSocialDbRemote(safe);
  }
  return safe;
}

function findSocialProfileByWallet(store, wallet) {
  const key = supportAddressKey(wallet);
  return key ? (store.profiles || []).find((row) => row.key === key) || null : null;
}

function createOrUpdateSocialProfile(store, value = {}) {
  const wallet = normalizeSupportAddress(value.wallet || value.address || "");
  const key = supportAddressKey(wallet);
  if (!wallet || !key) throw new Error("Connect a wallet or X-generated Solana wallet first");
  const existing = findSocialProfileByWallet(store, wallet);
  const requestedHandle = normalizeSocialHandle(value.handle || value.username || existing?.handle || "");
  const duplicate = requestedHandle
    ? (store.profiles || []).find((row) => row.handle === requestedHandle && row.key !== key)
    : null;
  if (duplicate || (requestedHandle && reservedSocialHandles().has(requestedHandle))) {
    throw new Error("That social name is already taken");
  }
  const used = new Set((store.profiles || []).filter((row) => row.key !== key).map((row) => row.handle).filter(Boolean));
  const profile = normalizeSocialProfile(
    {
      ...(existing || {}),
      wallet,
      handle: requestedHandle || existing?.handle || value.handle || value.username || "",
      displayName: value.displayName || value.name || value.username || existing?.displayName || "",
      bio: value.bio ?? existing?.bio ?? "",
      imageUri: value.imageUri || value.image || existing?.imageUri || "",
      source: value.source || value.type || existing?.source || "wallet",
      xUsername: value.xUsername || value.x_username || existing?.xUsername || "",
      xp: existing?.xp || 0,
      createdAt: existing?.createdAt || Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    },
    used
  );
  if (!profile) throw new Error("Could not create social profile");
  store.profiles = [profile, ...(store.profiles || []).filter((row) => row.key !== key)];
  return profile;
}

function socialProfilePublic(profile = {}) {
  return {
    wallet: profile.wallet || "",
    handle: profile.handle || "",
    displayName: profile.displayName || profile.handle || "",
    bio: profile.bio || "",
    imageUri: profile.imageUri || "",
    source: profile.source || "wallet",
    xUsername: profile.xUsername || "",
    xp: Math.max(0, Math.floor(Number(profile.xp || 0) || 0)),
    createdAt: profile.createdAt || 0,
    updatedAt: profile.updatedAt || 0
  };
}

function socialStatsForWallet(store, wallet) {
  const key = supportAddressKey(wallet);
  const authored = (store.posts || []).filter((post) => post.authorKey === key);
  const likesReceived = authored.reduce((sum, post) => sum + (post.likes || []).length, 0);
  const repostsReceived = authored.reduce((sum, post) => sum + (post.reposts || []).length, 0);
  const repliesWritten = (store.posts || []).reduce((sum, post) => sum + (post.replies || []).filter((reply) => reply.authorKey === key).length, 0);
  const profile = findSocialProfileByWallet(store, wallet);
  const xp = Math.max(0, Math.floor(Number(profile?.xp || 0) || 0)) + authored.length * 5 + repliesWritten * 2 + likesReceived + repostsReceived * 3;
  let tier = "New";
  if (xp >= 1000) tier = "Diamond";
  else if (xp >= 350) tier = "Gold";
  else if (xp >= 120) tier = "Silver";
  else if (xp >= 25) tier = "Bronze";
  return {
    xp,
    tier,
    posts: authored.length,
    likesReceived,
    repostsReceived,
    repliesWritten
  };
}

function socialLeaderboard(store) {
  const rows = [];
  for (const profile of store.profiles || []) {
    const stats = socialStatsForWallet(store, profile.wallet);
    rows.push({ profile: socialProfilePublic(profile), stats });
  }
  return rows.sort((a, b) => Number(b.stats?.xp || 0) - Number(a.stats?.xp || 0)).slice(0, 20);
}

function socialPostPublic(post = {}, store = {}, viewer = "") {
  const viewerKey = supportAddressKey(viewer);
  const profile = findSocialProfileByWallet(store, post.authorWallet) || normalizeSocialProfile({ wallet: post.authorWallet }, new Set());
  return {
    id: post.id,
    author: socialProfilePublic(profile),
    body: post.body,
    token: post.token,
    chain: post.chain,
    category: post.category,
    mediaUrl: post.mediaUrl,
    createdAt: post.createdAt,
    tags: post.tags || extractCryptoTags(post.body),
    stats: {
      likes: (post.likes || []).length,
      reposts: (post.reposts || []).length,
      replies: (post.replies || []).length
    },
    viewer: {
      liked: viewerKey ? (post.likes || []).includes(viewerKey) : false,
      reposted: viewerKey ? (post.reposts || []).includes(viewerKey) : false
    },
    replies: (post.replies || []).slice(-8).map((reply) => ({
      ...reply,
      author: socialProfilePublic(findSocialProfileByWallet(store, reply.authorWallet) || normalizeSocialProfile({ wallet: reply.authorWallet }, new Set()))
    }))
  };
}

function referralTierFor({ holderPct = 0, balanceTokens = 0, holdingSeconds = 0 } = {}) {
  const pct = Number(holderPct || 0);
  const balance = Number(balanceTokens || 0);
  const seconds = Number(holdingSeconds || 0);
  if (pct >= 1 && seconds >= 24 * 60 * 60) return { tier: "Diamond", status: "qualified", score: 500, rewardEstimatePumpr: 50000 };
  if (pct >= 1) return { tier: "Gold", status: "qualified", score: 300, rewardEstimatePumpr: 25000 };
  if (pct >= 0.25) return { tier: "Silver", status: "qualified", score: 120, rewardEstimatePumpr: 10000 };
  if (balance > 0) return { tier: "Bronze", status: "holding", score: 40, rewardEstimatePumpr: 2500 };
  return { tier: "Pending", status: "connected", score: 0, rewardEstimatePumpr: 0 };
}

async function refreshReferralQualifications(store = null) {
  const safeStore = store || (await readReferralDbPersistent({ refresh: true }));
  const official = officialAirdropConfig();
  const now = Math.floor(Date.now() / 1000);
  let holderPayload = null;
  let holders = [];
  try {
    if (official.configured && official.chainId === 101) {
      holderPayload = await buildSolanaAirdropPreview(official.token, 50);
      holders = Array.isArray(holderPayload?.allocations) ? holderPayload.allocations : [];
    }
  } catch (error) {
    console.warn(`Referral holder refresh failed: ${error?.message || "connection error"}`);
  }

  const holderByKey = new Map();
  for (const holder of holders) {
    const key = referralWalletKey(holder.address);
    if (key) holderByKey.set(key, holder);
  }

  if (official.configured && official.chainId === 101) {
    const missingWallets = [];
    const seenMissing = new Set();
    for (const row of safeStore.referrals || []) {
      const referral = normalizeReferralRow(row);
      if (!referral?.referredWallet || !referral.referredKey || holderByKey.has(referral.referredKey)) continue;
      if (seenMissing.has(referral.referredKey)) continue;
      seenMissing.add(referral.referredKey);
      missingWallets.push(referral.referredWallet);
    }

    await mapWithConcurrency(missingWallets.slice(0, 250), 4, async (wallet) => {
      try {
        const eligibility = await readSolanaOfficialHolderEligibility(official, wallet);
        const key = referralWalletKey(wallet);
        const balanceTokens = Number(eligibility?.balanceTokens || 0);
        if (key && balanceTokens > 0) {
          holderByKey.set(key, {
            address: wallet,
            balanceTokens,
            balanceWei: String(eligibility.balanceRaw || "0"),
            holderPct: Number(eligibility.holderPct || 0),
            firstSeenAt: now
          });
        }
      } catch (error) {
        console.warn(`Referral wallet balance check failed for ${wallet}: ${error?.message || "connection error"}`);
      }
    });
  }

  safeStore.referrals = (safeStore.referrals || [])
    .map((row) => {
      const referral = normalizeReferralRow(row);
      if (!referral) return null;
      const holder = holderByKey.get(referral.referredKey);
      const balanceTokens = Number(holder?.balanceTokens || 0);
      const holderPct = Number(holder?.holderPct || 0);
      const balanceRaw = String(holder?.balanceWei || referral.balanceRaw || "0");
      const firstQualifiedAt = balanceTokens > 0 ? Number(referral.firstQualifiedAt || holder?.firstSeenAt || now) : Number(referral.firstQualifiedAt || 0);
      const holdingSeconds = balanceTokens > 0 ? Math.max(0, now - Math.max(0, Number(firstQualifiedAt || now))) : 0;
      const tier = referralTierFor({ holderPct, balanceTokens, holdingSeconds });
      return {
        ...referral,
        ...tier,
        balanceTokens,
        balanceRaw,
        holderPct,
        holdingSeconds,
        firstQualifiedAt,
        lastCheckedAt: now
      };
    })
    .filter(Boolean);
  safeStore.updatedAt = now;
  const written = await writeReferralDbPersistent(safeStore);
  return { store: written, official, holderPayload, refreshedAt: now };
}

function referralStatsForWallet(store, wallet) {
  const key = referralWalletKey(wallet);
  const rows = (store.referrals || []).filter((row) => row.referrerKey === key);
  return {
    invited: rows.length,
    connected: rows.filter((row) => row.status !== "visited").length,
    holding: rows.filter((row) => Number(row.balanceTokens || 0) > 0).length,
    qualified: rows.filter((row) => ["Bronze", "Silver", "Gold", "Diamond"].includes(row.tier)).length,
    goldOrBetter: rows.filter((row) => ["Gold", "Diamond"].includes(row.tier)).length,
    score: rows.reduce((sum, row) => sum + Number(row.score || 0), 0),
    rewardEstimatePumpr: rows.reduce((sum, row) => sum + Number(row.rewardEstimatePumpr || 0), 0)
  };
}

function publicReferralRow(row = {}) {
  return {
    id: row.id,
    referredWallet: row.referredWallet,
    referralName: row.referralName,
    status: row.status,
    tier: row.tier,
    score: row.score,
    rewardEstimatePumpr: row.rewardEstimatePumpr,
    balanceTokens: row.balanceTokens,
    holderPct: row.holderPct,
    holdingSeconds: row.holdingSeconds,
    connectedAt: row.connectedAt,
    firstQualifiedAt: row.firstQualifiedAt,
    lastCheckedAt: row.lastCheckedAt,
    payoutStatus: row.payoutStatus,
    payoutTx: row.payoutTx
  };
}

async function ensureReferralProfile(wallet) {
  const normalized = normalizeSupportAddress(wallet);
  if (!normalized) throw new Error("Connect a valid wallet to create a referral link");
  const store = await readReferralDbPersistent({ refresh: true });
  let profile = referralProfileForWallet(store, normalized, { create: false });
  if (!profile) {
    profile = referralProfileForWallet(store, normalized, { create: true });
    const saved = await writeReferralDbPersistent(store);
    return { store: saved, profile: referralProfileForWallet(saved, normalized, { create: false }) || profile };
  }
  return { store, profile };
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

function normalizeAlphaWallet(value = "") {
  return normalizeAddress(value) || normalizeSolanaAddress(value);
}

function normalizeAlphaIdentityKey(value = "") {
  const evm = normalizeAddress(value);
  if (evm) return evm.toLowerCase();
  return normalizeSolanaAddress(value);
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
  const author = normalizeAlphaWallet(row.author || row.address || "") || ethers.ZeroAddress;
  const authorWallet = normalizeAlphaWallet(row.authorWallet || row.tipWallet || author || "") || ethers.ZeroAddress;
  const minBalance = sanitizeAlphaText(row.minBalance || row.requiredBalance || "1", 40) || "1";
  const tips = Array.isArray(row.tips) ? row.tips : [];
  const unlocks = Array.isArray(row.unlocks) ? row.unlocks.map(normalizeAlphaIdentityKey).filter(Boolean) : [];
  const upvotes = Array.isArray(row.upvotes) ? row.upvotes.map(normalizeAlphaIdentityKey).filter(Boolean) : [];
  const downvotes = Array.isArray(row.downvotes) ? row.downvotes.map(normalizeAlphaIdentityKey).filter(Boolean) : [];
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
        from: normalizeAlphaWallet(tip?.from || tip?.address || "") || ethers.ZeroAddress,
        txHash: sanitizeAlphaText(tip?.txHash || "", 120),
        amount: sanitizeAlphaText(tip?.amount || "0", 40),
        chainId: parseChainId(tip?.chainId || chainId) || chainId,
        createdAt: Number(tip?.createdAt || Math.floor(Date.now() / 1000))
      }))
      .filter((tip) => tip.txHash || Number(tip.amount || 0) > 0)
      .slice(-500),
    upvotes: [...new Set(upvotes)].slice(-2000),
    downvotes: [...new Set(downvotes)].slice(-2000),
    comments: comments
      .map((comment) => normalizeAlphaComment(comment, id))
      .filter(Boolean)
      .slice(-500),
    unlocks: [...new Set(unlocks)].slice(-1000),
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
  const author = normalizeAlphaWallet(row.author || row.address || "");
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

function isLegacyEtherpumpAlphaTip(tip = {}) {
  const haystack = [
    tip.id,
    tip.title,
    tip.projectName,
    tip.tokenSymbol,
    tip.tokenAddress,
    tip.xHandle
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return (
    haystack.includes("etherpump taking over") ||
    haystack.includes("epump") ||
    haystack.includes("92tnfen3brvbbmeh35xxm96bz9x9pedqsiweneqwpump")
  );
}

function defaultPumpRemasteredAlphaTip() {
  return normalizeAlphaTip({
    id: "alpha-pump-fun-remastered",
    title: "PUMP FUN REMASTERED IS LIVE",
    projectName: "Pump Fun Remastered",
    tokenSymbol: "PUMPR",
    tokenAddress: "So11111111111111111111111111111111111111112",
    chainId: 101,
    minBalance: "0",
    category: "Launchpad, Solana, Ethereum, Base, Monad, Robinhood",
    confidence: "high",
    teaser: "Official Pump Fun Remastered account is live at @pumpr_fun.",
    body:
      "Pump Fun Remastered is building a multi-chain launchpad flow across Solana, Ethereum, Base, Monad, and Robinhood Chain. The signal to watch is the official @pumpr_fun account, upcoming PUMPR token rollout, Pump.fun launch support, PumpVerse multi-chain launches, Alpha, GO bounties, and holder reward tooling all coming together under one launch ecosystem.",
    evidenceUrl: "https://x.com/pumpr_fun",
    evidenceType: "X profile",
    author: ethers.ZeroAddress,
    authorWallet: ethers.ZeroAddress,
    authorName: "Pump Fun Remastered",
    xHandle: "pumpr_fun",
    xName: "Pump Fun Remastered",
    xImage: "/assets/pump-r-logo.png?v=20260608r",
    xFollowers: 110,
    upvotes: ["0x0000000000000000000000000000000000000001"],
    downvotes: [],
    comments: [],
    tips: [],
    unlocks: [],
    createdAt: 1781035200
  });
}

function applyAlphaSystemTips(store = {}) {
  const safe = sanitizeAlphaStore(store);
  const tips = (safe.tips || []).filter((tip) => !isLegacyEtherpumpAlphaTip(tip));
  const hasPumpRemastered = tips.some((tip) => {
    const symbol = String(tip.tokenSymbol || "").toUpperCase();
    const handle = String(tip.xHandle || "").toLowerCase();
    const title = String(tip.title || "").toLowerCase();
    return symbol === "PUMPR" || handle === "pumpr_fun" || title.includes("pump fun remastered");
  });
  if (!hasPumpRemastered) {
    const seeded = defaultPumpRemasteredAlphaTip();
    if (seeded) tips.unshift(seeded);
  }
  return sanitizeAlphaStore({ ...safe, tips });
}

function readAlphaDb() {
  if (alphaDbCache && typeof alphaDbCache === "object") return alphaDbCache;
  try {
    if (fs.existsSync(ALPHA_DB_PATH)) {
      alphaDbCache = applyAlphaSystemTips(JSON.parse(fs.readFileSync(ALPHA_DB_PATH, "utf8") || "{}"));
      return alphaDbCache;
    }
  } catch {
    // fall through
  }
  alphaDbCache = applyAlphaSystemTips(emptyAlphaStore());
  return alphaDbCache;
}

function writeAlphaDb(store) {
  const safe = applyAlphaSystemTips(store);
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
  return applyAlphaSystemTips(await response.json().catch(() => emptyAlphaStore()));
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
    body: JSON.stringify(applyAlphaSystemTips(store), null, 2)
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
  return applyAlphaSystemTips(readAlphaDb());
}

async function writeAlphaDbPersistent(store) {
  assertJsonStoreConfigured("Alpha", SUPABASE_ALPHA_OBJECT);
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

function emptyAgentsStore() {
  return { agents: [], posts: [] };
}

function normalizeAgentOwner(value = "") {
  const raw = sanitizeAlphaText(value || "", 90);
  return normalizeSolanaAddress(raw) || normalizeAddress(raw) || raw.slice(0, 80);
}

function normalizeAgentId(value = "") {
  return sanitizeAlphaText(value || `agent-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, 90)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "") || `agent-${Date.now().toString(36)}`;
}

const AGENT_CONTENT_BLOCKLIST = /\b(malicious|pwned|evil|exploit|hacked)\b|get\s*me\s*a\s*job|getmeajob/i;

function agentModerationText(row = {}) {
  return [
    row.id,
    row.owner,
    row.name,
    row.summary,
    row.targets,
    row.goals,
    row.skillsMd,
    row.skills,
    row.kind,
    row.title,
    row.body,
    row.latestPost?.title,
    row.latestPost?.body
  ].join("\n");
}

function isBlockedAgentContent(row = {}) {
  return AGENT_CONTENT_BLOCKLIST.test(agentModerationText(row));
}

function normalizeAgent(row = {}) {
  const owner = normalizeAgentOwner(row.owner || row.address || "");
  const name = sanitizeAlphaText(row.name || "", 80);
  const skillsMd = String(row.skillsMd || row.skills || "").replace(/\r\n/g, "\n").trim().slice(0, 12000);
  if (!owner || !name || !skillsMd) return null;
  const summary = sanitizeAlphaText(row.summary || "", 240);
  const goals = sanitizeAlphaText(row.goals || "", 800);
  const targets = sanitizeAlphaText(row.targets || "", 500);
  return {
    id: normalizeAgentId(row.id || `${name}-${owner.slice(0, 8)}`),
    owner,
    name,
    status: ["active", "paused"].includes(String(row.status || "").toLowerCase()) ? String(row.status).toLowerCase() : "active",
    summary,
    goals,
    targets,
    skillsMd,
    avatar: String(row.avatar || "").trim().slice(0, 1024),
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000)),
    updatedAt: Number(row.updatedAt || Math.floor(Date.now() / 1000)),
    lastPostAt: Number(row.lastPostAt || 0)
  };
}

function normalizeAgentPost(row = {}) {
  const agentId = normalizeAgentId(row.agentId || "");
  const body = sanitizeAgentDraftText(row.body || "", 6000);
  if (!agentId || !body) return null;
  const links = Array.isArray(row.links)
    ? row.links.map(sanitizeGoUrl).filter(Boolean).slice(0, 6)
    : String(row.links || row.url || "")
        .split(/\s+/)
        .map(sanitizeGoUrl)
        .filter(Boolean)
        .slice(0, 6);
  return {
    id: normalizeAgentId(row.id || `agent-post-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
    agentId,
    owner: normalizeAgentOwner(row.owner || ""),
    kind: ["bounty-work", "go-proof", "launch-support", "media", "update"].includes(String(row.kind || "").toLowerCase())
      ? String(row.kind || "").toLowerCase()
      : "bounty-work",
    title: sanitizeAlphaText(row.title || "", 120),
    body,
    bountyId: normalizeGoId(row.bountyId || "", "go"),
    mediaUrl: sanitizeGoUrl(row.mediaUrl || ""),
    mediaType: sanitizeAlphaText(row.mediaType || "", 80),
    links,
    url: links[0] || "",
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function sanitizeAgentsStore(store = {}) {
  const base = store && typeof store === "object" && !Array.isArray(store) ? store : emptyAgentsStore();
  const agents = (Array.isArray(base.agents) ? base.agents : []).map(normalizeAgent).filter((agent) => agent && !isBlockedAgentContent(agent));
  const agentIds = new Set(agents.map((agent) => agent.id));
  const posts = (Array.isArray(base.posts) ? base.posts : [])
    .map(normalizeAgentPost)
    .filter((post) => post && agentIds.has(post.agentId) && !isBlockedAgentContent(post))
    .slice(-1000);
  return { agents, posts };
}

function readAgentsDb() {
  if (agentsDbCache && typeof agentsDbCache === "object") return agentsDbCache;
  try {
    if (fs.existsSync(AGENTS_DB_PATH)) {
      agentsDbCache = sanitizeAgentsStore(JSON.parse(fs.readFileSync(AGENTS_DB_PATH, "utf8") || "{}"));
      return agentsDbCache;
    }
  } catch {
    // fall through
  }
  agentsDbCache = emptyAgentsStore();
  return agentsDbCache;
}

function writeAgentsDb(store) {
  const safe = sanitizeAgentsStore(store);
  fs.mkdirSync(path.dirname(AGENTS_DB_PATH), { recursive: true });
  fs.writeFileSync(AGENTS_DB_PATH, JSON.stringify(safe, null, 2));
  agentsDbCache = safe;
  return safe;
}

async function readAgentsDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_AGENTS_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_AGENTS_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase agents read failed: ${response.status} ${text}`.trim());
  }
  return sanitizeAgentsStore(await response.json().catch(() => emptyAgentsStore()));
}

async function writeAgentsDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_AGENTS_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_AGENTS_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizeAgentsStore(store), null, 2)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase agents write failed: ${response.status} ${text}`.trim());
  }
  return true;
}

async function readAgentsDbPersistent(options = {}) {
  const refresh = Boolean(options.refresh);
  if (isSupabaseStorageConfigured() && (refresh || !agentsDbRemoteLoaded)) {
    try {
      const remote = await readAgentsDbRemote();
      if (remote) {
        agentsDbCache = remote;
        writeAgentsDb(remote);
      }
      agentsDbRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase agents read failed: ${error?.message || "connection error"}`);
      agentsDbRemoteLoaded = true;
    }
  }
  return sanitizeAgentsStore(readAgentsDb());
}

async function writeAgentsDbPersistent(store) {
  assertJsonStoreConfigured("Agents", SUPABASE_AGENTS_OBJECT);
  const safe = writeAgentsDb(store);
  if (isSupabaseStorageConfigured()) {
    await writeAgentsDbRemote(safe);
  }
  return safe;
}

function publicAgent(agent = {}, store = readAgentsDb()) {
  const posts = (store.posts || []).filter((post) => post.agentId === agent.id);
  return {
    ...agent,
    postCount: posts.length,
    latestPost: posts.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null
  };
}

function emptyPumpFunPreparedStore() {
  return { items: [] };
}

function pumpFunPreparedId() {
  return `pumpr-${Date.now().toString(36)}-${crypto.randomBytes(5).toString("hex")}`;
}

function normalizePumpFunPrepared(row = {}) {
  const id = sanitizeAlphaText(row.id || pumpFunPreparedId(), 90).replace(/[^a-zA-Z0-9_-]/g, "");
  const body = sanitizeAgentDraftText(row.body || "", 6000);
  if (!id || !body) return null;
  const now = Math.floor(Date.now() / 1000);
  const links = Array.isArray(row.links)
    ? row.links.map(sanitizeGoUrl).filter(Boolean).slice(0, 8)
    : String(row.links || "")
        .split(/\s+/)
        .map(sanitizeGoUrl)
        .filter(Boolean)
        .slice(0, 8);
  const deliverables = Array.isArray(row.deliverables)
    ? row.deliverables.map((item) => sanitizeAlphaText(item, 300)).filter(Boolean).slice(0, 12)
    : [];
  return {
    id,
    taskId: sanitizeAlphaText(String(row.taskId || "").replace(/^pumpfun-/, ""), 160),
    bountyId: normalizeGoId(row.bountyId || "", "go"),
    title: sanitizeAlphaText(row.title || "Pump.fun bounty submission", 140),
    sourceUrl: sanitizeGoUrl(row.sourceUrl || ""),
    body,
    links,
    deliverables,
    agentName: sanitizeAlphaText(row.agentName || "", 80),
    agentId: normalizeAgentId(row.agentId || ""),
    authorName: sanitizeAlphaText(row.authorName || "", 80),
    createdAt: Number(row.createdAt || now),
    expiresAt: Number(row.expiresAt || now + 7 * 24 * 60 * 60)
  };
}

function sanitizePumpFunPreparedStore(store = {}) {
  const now = Math.floor(Date.now() / 1000);
  const items = (Array.isArray(store.items) ? store.items : [])
    .map(normalizePumpFunPrepared)
    .filter((item) => item && Number(item.expiresAt || 0) > now)
    .slice(0, 500);
  return { items };
}

function readPumpFunPreparedDb() {
  try {
    if (fs.existsSync(PUMPFUN_PREPARED_DB_PATH)) {
      return sanitizePumpFunPreparedStore(JSON.parse(fs.readFileSync(PUMPFUN_PREPARED_DB_PATH, "utf8") || "{}"));
    }
  } catch {
    // fall through
  }
  return emptyPumpFunPreparedStore();
}

function writePumpFunPreparedDb(store) {
  const safe = sanitizePumpFunPreparedStore(store);
  fs.mkdirSync(path.dirname(PUMPFUN_PREPARED_DB_PATH), { recursive: true });
  fs.writeFileSync(PUMPFUN_PREPARED_DB_PATH, JSON.stringify(safe, null, 2));
  return safe;
}

async function readPumpFunPreparedDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_PREPARED_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_PREPARED_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase prepared submission read failed: ${response.status} ${text}`.trim());
  }
  return sanitizePumpFunPreparedStore(await response.json().catch(() => emptyPumpFunPreparedStore()));
}

async function writePumpFunPreparedDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_PREPARED_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_PREPARED_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizePumpFunPreparedStore(store), null, 2)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase prepared submission write failed: ${response.status} ${text}`.trim());
  }
  return true;
}

async function readPumpFunPreparedDbPersistent() {
  if (isSupabaseStorageConfigured()) {
    try {
      const remote = await readPumpFunPreparedDbRemote();
      if (remote) {
        writePumpFunPreparedDb(remote);
        return remote;
      }
    } catch (error) {
      console.warn(`Supabase prepared submission read failed: ${error?.message || "connection error"}`);
    }
  }
  return readPumpFunPreparedDb();
}

async function writePumpFunPreparedDbPersistent(store) {
  assertJsonStoreConfigured("Pump.fun prepared launch", SUPABASE_PUMPFUN_PREPARED_OBJECT);
  const safe = writePumpFunPreparedDb(store);
  if (isSupabaseStorageConfigured()) {
    await writePumpFunPreparedDbRemote(safe);
  }
  return safe;
}

async function createPumpFunPreparedSubmission(value = {}) {
  const store = await readPumpFunPreparedDbPersistent();
  const item = normalizePumpFunPrepared({
    ...value,
    id: value.id || pumpFunPreparedId()
  });
  if (!item) throw new Error("Could not prepare Pump.fun submission");
  const items = [item, ...(store.items || []).filter((row) => row.id !== item.id)];
  await writePumpFunPreparedDbPersistent({ items });
  return item;
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

function normalizeCommunityToken(value = "") {
  return normalizeAddress(value) || normalizeSolanaAddress(value);
}

function normalizeCommunityIdentity(value = "") {
  return normalizeAddress(value) || normalizeSolanaAddress(value);
}

function communityIdentityKey(value = "") {
  const evm = normalizeAddress(value);
  if (evm) return evm.toLowerCase();
  return normalizeSolanaAddress(value);
}

function isCommunitySolanaToken(value = "") {
  const token = normalizeCommunityToken(value);
  return Boolean(token && !normalizeAddress(token) && normalizeSolanaAddress(token));
}

function assertCommunityWalletMatchesToken(token, author) {
  const normalizedToken = normalizeCommunityToken(token);
  const normalizedAuthor = normalizeCommunityIdentity(author);
  if (!normalizedToken) throw new Error("token is required");
  if (!normalizedAuthor) throw new Error("author is required");
  const solanaToken = isCommunitySolanaToken(normalizedToken);
  const solanaAuthor = Boolean(!normalizeAddress(normalizedAuthor) && normalizeSolanaAddress(normalizedAuthor));
  if (solanaToken && !solanaAuthor) throw new Error("Connect Phantom to post in Pump.fun communities");
  if (!solanaToken && solanaAuthor) throw new Error("Connect an EVM wallet to post in EVM communities");
  return { token: normalizedToken, author: normalizedAuthor };
}

function normalizeCommunityPost(row = {}) {
  const token = normalizeCommunityToken(row.token || row.tokenAddress || "");
  const author = normalizeCommunityIdentity(row.author || row.address || "");
  if (!token || !author) return null;
  const id = String(row.id || communityPostId());
  const createdAt = Number(row.createdAt || Math.floor(Date.now() / 1000));
  const likes = Array.isArray(row.likes) ? row.likes.map(communityIdentityKey).filter(Boolean) : [];
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
    likes: [...new Set(likes)],
    comments: comments
      .map((comment) => normalizeCommunityComment(comment, id))
      .filter(Boolean)
      .slice(0, 100)
  };
}

function normalizeCommunityComment(row = {}, postId = "") {
  const author = normalizeCommunityIdentity(row.author || row.address || "");
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
  const token = normalizeCommunityToken(tokenAddress || "");
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

function sanitizeAgentDraftText(value, max = 6000) {
  return Array.from(String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim()).slice(0, max).join("");
}

function sanitizeGoUrl(value) {
  const text = String(value || "").trim().slice(0, 1024);
  if (!text) return "";
  if (text.startsWith("/") || /^https?:\/\//i.test(text) || text.startsWith("data:image/") || text.startsWith("data:video/")) return text;
  return "";
}

function normalizeSolanaDisplayAddress(value = "") {
  const text = String(value || "").trim();
  return normalizeSolanaAddress(text) || (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : "");
}

function normalizeGoId(value, fallbackPrefix = "go") {
  return sanitizeGoText(value || `${fallbackPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function normalizeOptionalGoId(value, fallbackPrefix = "go") {
  const text = sanitizeGoText(value || "", 80);
  return text ? normalizeGoId(text, fallbackPrefix) : "";
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
  const chainConfigSnapshot =
    row.chainConfigSnapshot && typeof row.chainConfigSnapshot === "object"
      ? {
          submissionFeeVault: normalizeSolanaDisplayAddress(row.chainConfigSnapshot.submissionFeeVault || ""),
          submissionFeeLamports: String(row.chainConfigSnapshot.submissionFeeLamports || "").replace(/[^0-9]/g, ""),
          publishFeeVault: normalizeSolanaDisplayAddress(row.chainConfigSnapshot.publishFeeVault || ""),
          disputeFeeVault: normalizeSolanaDisplayAddress(row.chainConfigSnapshot.disputeFeeVault || "")
        }
      : null;
  return {
    id,
    title,
    description: sanitizeAgentDraftText(row.description || "", 6000),
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
    winnerSubmissionId: normalizeOptionalGoId(row.winnerSubmissionId || "", "sub"),
    winnerAddress: normalizeAddress(row.winnerAddress || "") || "",
    creator: normalizeAddress(row.creator || row.address || "") || ethers.ZeroAddress,
    creatorSolana: normalizeSolanaDisplayAddress(row.creatorSolana || row.creatorAddress || ""),
    creatorName: sanitizeGoText(row.creatorName || row.xHandle || "", 80),
    status: String(row.status || "open").toLowerCase() === "closed" ? "closed" : "open",
    imageUri: sanitizeGoUrl(row.imageUri || row.mediaUrl || ""),
    source: sanitizeGoText(row.source || "", 40),
    sourceUrl: sanitizeGoUrl(row.sourceUrl || ""),
    externalId: sanitizeGoText(row.externalId || row.taskId || "", 100),
    onChainBountyId: sanitizeGoText(row.onChainBountyId || "", 80),
    pumpBountiesProgramId: normalizeSolanaDisplayAddress(row.pumpBountiesProgramId || ""),
    bountyPda: normalizeSolanaDisplayAddress(row.bountyPda || ""),
    chainConfigSnapshot,
    coinAddress: normalizeSolanaDisplayAddress(row.coinAddress || ""),
    sourceSubmissionCount: Math.max(0, Number(row.sourceSubmissionCount || row.submissionCount || 0) || 0),
    sourceLikeCount: Math.max(0, Number(row.sourceLikeCount || row.likeCount || 0) || 0),
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
    process.env.PUMPR_TOKEN_ADDRESS ||
      process.env.OFFICIAL_PUMPR_TOKEN ||
      process.env.PUMPFUN_TOKEN_ADDRESS ||
      process.env.AIRDROP_TOKEN_ADDRESS ||
      process.env.OFFICIAL_AIRDROP_TOKEN ||
      process.env.PUMPR_AIRDROP_TOKEN ||
      process.env.ETHERPUMP_AIRDROP_TOKEN ||
      OFFICIAL_PUMPFUN_MINT
  ).trim();
  const chainId = parseChainId(
    process.env.PUMPR_TOKEN_CHAIN_ID ||
      process.env.OFFICIAL_PUMPR_TOKEN_CHAIN_ID ||
      process.env.PUMPFUN_TOKEN_CHAIN_ID ||
      process.env.AIRDROP_CHAIN_ID ||
      process.env.OFFICIAL_AIRDROP_CHAIN_ID ||
      process.env.PUMPR_AIRDROP_CHAIN_ID ||
      process.env.ETHERPUMP_AIRDROP_CHAIN_ID ||
      "101"
  ) || 1;
  const quoteMode = normalizeQuoteMode(process.env.AIRDROP_QUOTE_MODE || process.env.OFFICIAL_AIRDROP_QUOTE || "native");
  const token = chainId === 101 ? normalizeSolanaAddress(rawToken) : normalizeAddress(rawToken);
  const minHolderPct = Math.max(
    0,
    Number(process.env.PUMPR_AIRDROP_MIN_HOLDER_PCT || process.env.AIRDROP_MIN_HOLDER_PCT || "1") || 1
  );
  return {
    configured: Boolean(token),
    token,
    chainId,
    chainName: CHAIN_META[chainId]?.name || `Chain ${chainId}`,
    chainShortName: CHAIN_META[chainId]?.shortName || String(chainId),
    quoteMode,
    name: String(process.env.AIRDROP_TOKEN_NAME || process.env.OFFICIAL_AIRDROP_TOKEN_NAME || "Pumpfun Remastered").trim(),
    symbol: String(process.env.AIRDROP_TOKEN_SYMBOL || process.env.OFFICIAL_AIRDROP_TOKEN_SYMBOL || "PUMPR").trim().replace(/^\$/, "").toUpperCase(),
    minHolderPct,
    message: String(
      process.env.AIRDROP_MESSAGE ||
        "Pumpfun Remastered airdrops are reserved for top holders who keep holding long term. This page tracks the official Pump.fun mint and prioritizes loyal holders over short-term flips."
    ).trim()
  };
}

const HOLDER_GATE_ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)"
];

function officialHolderGateRequired() {
  const raw = String(process.env.PUMPR_HOLDER_GATE_REQUIRED || process.env.HOLDER_GATE_REQUIRED || "1").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(raw);
}

function holderPctFromRaw(balanceRaw, supplyRaw) {
  const balance = BigInt(String(balanceRaw || "0"));
  const supply = BigInt(String(supplyRaw || "0"));
  if (balance <= 0n || supply <= 0n) return 0;
  return Number((balance * 1_000_000n) / supply) / 10_000;
}

function buildHolderEligibilityPayload(official, row = {}) {
  const balanceRaw = String(row.balanceRaw || "0");
  const supplyRaw = String(row.supplyRaw || "0");
  const balanceFloat = Number(row.balanceTokens || 0) || 0;
  const holderPct = holderPctFromRaw(balanceRaw, supplyRaw);
  const hasBalance = BigInt(balanceRaw || "0") > 0n;
  const minHolderPct = Number(official.minHolderPct || 1);
  return {
    configured: Boolean(official.configured),
    required: officialHolderGateRequired(),
    token: official.token,
    chainId: official.chainId,
    chainName: official.chainName,
    chainShortName: official.chainShortName,
    symbol: official.symbol,
    minHolderPct,
    balanceRaw,
    balanceTokens: balanceFloat,
    supplyRaw,
    holderPct,
    eligibleToLaunch: hasBalance,
    eligibleForAirdrop: hasBalance && holderPct >= minHolderPct
  };
}

function readAirdropHolderDb() {
  try {
    if (!fs.existsSync(AIRDROP_HOLDER_DB_PATH)) return { tokens: {} };
    const parsed = JSON.parse(fs.readFileSync(AIRDROP_HOLDER_DB_PATH, "utf8") || "{}");
    return parsed && typeof parsed === "object" && parsed.tokens && typeof parsed.tokens === "object" ? parsed : { tokens: {} };
  } catch {
    return { tokens: {} };
  }
}

function writeAirdropHolderDb(store = { tokens: {} }) {
  try {
    fs.mkdirSync(path.dirname(AIRDROP_HOLDER_DB_PATH), { recursive: true });
    fs.writeFileSync(AIRDROP_HOLDER_DB_PATH, JSON.stringify(store, null, 2));
  } catch {
    // Duration tracking is best-effort.
  }
}

function annotateLongTermAirdropHolders(token = "", holders = []) {
  const tokenKey = String(token || "").trim();
  if (!tokenKey || !Array.isArray(holders) || !holders.length) return holders;
  const now = Math.floor(Date.now() / 1000);
  const minHoldDays = Math.max(0, Number(process.env.PUMPR_AIRDROP_MIN_HOLD_DAYS || process.env.AIRDROP_MIN_HOLD_DAYS || "7") || 7);
  const minHoldSeconds = Math.floor(minHoldDays * 86400);
  const store = readAirdropHolderDb();
  const tokens = store.tokens || {};
  const tokenStore = tokens[tokenKey] && typeof tokens[tokenKey] === "object" ? tokens[tokenKey] : {};
  const annotated = holders.map((row) => {
    const address = String(row.address || "").trim();
    const previous = address && tokenStore[address] && typeof tokenStore[address] === "object" ? tokenStore[address] : {};
    const firstSeenAt = Math.max(0, Number(previous.firstSeenAt || now));
    const snapshotsHeld = Math.max(1, Number(previous.snapshotsHeld || 0) + 1);
    if (address) {
      tokenStore[address] = {
        firstSeenAt,
        lastSeenAt: now,
        snapshotsHeld,
        lastBalanceWei: String(row.balanceWei || "0"),
        lastHolderPct: Number(row.holderPct || 0)
      };
    }
    return {
      ...row,
      firstSeenAt,
      lastSeenAt: now,
      snapshotsHeld,
      holdingDays: Math.max(0, (now - firstSeenAt) / 86400),
      longTermEligible: now - firstSeenAt >= minHoldSeconds
    };
  });
  tokens[tokenKey] = tokenStore;
  store.tokens = tokens;
  writeAirdropHolderDb(store);
  return annotated;
}

async function readEvmOfficialHolderEligibility(official, address) {
  const owner = normalizeAddress(address || "");
  if (!owner) throw new Error("Connect an EVM wallet that holds the Pump-r token.");
  const ctx = await getContext(official.chainId, { verify: false, quoteMode: official.quoteMode });
  const token = new ethers.Contract(official.token, HOLDER_GATE_ERC20_ABI, ctx.provider);
  const [balanceRaw, supplyRaw, decimalsRaw] = await Promise.all([
    token.balanceOf(owner),
    token.totalSupply().catch(() => 0n),
    token.decimals().catch(() => 18)
  ]);
  const decimals = Math.max(0, Math.min(30, Number(decimalsRaw || 18) || 18));
  return buildHolderEligibilityPayload(official, {
    balanceRaw: balanceRaw.toString(),
    supplyRaw: supplyRaw.toString(),
    balanceTokens: Number(ethers.formatUnits(balanceRaw, decimals)) || 0
  });
}

async function readSolanaOfficialHolderEligibility(official, solanaAddress) {
  const { Connection: SolanaConnection, PublicKey: SolanaPublicKey } = await loadSolanaWeb3();
  const ownerText = String(solanaAddress || "").trim();
  if (!ownerText) throw new Error("Connect a Solana wallet that holds the Pump-r token.");
  let owner;
  let mint;
  try {
    owner = new SolanaPublicKey(ownerText);
    mint = new SolanaPublicKey(String(official.token || ""));
  } catch {
    throw new Error("Valid Solana wallet and Pump-r mint are required.");
  }

  const { accounts, mintInfo } = await withPumpFunSolanaRpc(
    SolanaConnection,
    "Pump-r holder gate",
    async (connection) => {
      const [accounts, mintInfo] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, { mint }).catch(() => ({ value: [] })),
        connection.getParsedAccountInfo(mint).catch(() => ({ value: null }))
      ]);
      return { accounts, mintInfo };
    },
    { retryAll: true }
  );
  let balanceRaw = 0n;
  let balanceTokens = 0;
  for (const account of accounts?.value || []) {
    const amount = account?.account?.data?.parsed?.info?.tokenAmount || {};
    balanceRaw += BigInt(String(amount.amount || "0"));
    balanceTokens += Number(amount.uiAmountString || amount.uiAmount || 0) || 0;
  }
  const mintParsed = mintInfo?.value?.data?.parsed?.info || {};
  const supplyRaw = BigInt(String(mintParsed.supply || "0"));
  if (!balanceTokens && balanceRaw > 0n) {
    const decimals = Number(mintParsed.decimals || 6) || 6;
    balanceTokens = Number(balanceRaw) / 10 ** decimals;
  }
  return buildHolderEligibilityPayload(official, {
    balanceRaw: balanceRaw.toString(),
    supplyRaw: supplyRaw.toString(),
    balanceTokens
  });
}

async function readOfficialHolderEligibility({ address = "", solanaAddress = "", launchMode = "", targetChainId = 0 } = {}) {
  const official = officialAirdropConfig();
  if (!official.configured) {
    return buildHolderEligibilityPayload(official, { balanceRaw: "0", supplyRaw: "0", balanceTokens: 0 });
  }
  const mode = String(launchMode || "").trim().toLowerCase();
  const target = Math.floor(Number(targetChainId || 0));
  const isPumpFunLaunch = mode === "pumpfun" || target === 101;
  const isEvmLaunch = mode === "evm" || (target > 0 && target !== 101);
  if (official.chainId === 101 && isEvmLaunch && !solanaAddress) {
    return {
      ...buildHolderEligibilityPayload(official, { balanceRaw: "0", supplyRaw: "0", balanceTokens: 0 }),
      required: false,
      launchContextSkipped: true,
      launchContext: "evm",
      message: "Solana Pump-r holder validation applies to Pump.fun launches only."
    };
  }
  if (official.chainId === 101) {
    return readSolanaOfficialHolderEligibility(official, solanaAddress || address);
  }
  if (official.chainId !== 101 && isPumpFunLaunch && !address) {
    return {
      ...buildHolderEligibilityPayload(official, { balanceRaw: "0", supplyRaw: "0", balanceTokens: 0 }),
      required: false,
      launchContextSkipped: true,
      launchContext: "pumpfun",
      message: "EVM Pump-r holder validation applies to EVM launches only."
    };
  }
  return readEvmOfficialHolderEligibility(official, address);
}

async function assertOfficialHolderAccess({ address = "", solanaAddress = "", action = "launch", launchMode = "", targetChainId = 0 } = {}) {
  if (!officialHolderGateRequired()) return null;
  const official = officialAirdropConfig();
  if (!official.configured) {
    throw new Error("Official Pump-r token is not configured. Set PUMPR_TOKEN_ADDRESS and PUMPR_TOKEN_CHAIN_ID before enabling launches or payouts.");
  }
  const eligibility = await readOfficialHolderEligibility({ address, solanaAddress, launchMode, targetChainId });
  if (!eligibility.eligibleToLaunch) {
    const held = Number(eligibility.balanceTokens || 0);
    const heldText = Number.isFinite(held) && held > 0
      ? held.toLocaleString(undefined, { maximumFractionDigits: 6 })
      : "0";
    const chain = eligibility.chainShortName || eligibility.chainName || "configured chain";
    throw new Error(`You hold ${heldText} $${eligibility.symbol || "PUMPR"} on ${chain}. Hold any amount above 0 $${eligibility.symbol || "PUMPR"} in this wallet to ${action}. 1%+ holders will also be eligible for later airdrops.`);
  }
  return eligibility;
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

  const { connection, largestAccounts, mintInfo } = await withPumpFunSolanaRpc(
    SolanaConnection,
    "Solana airdrop preview",
    async (connection) => {
      const [largestAccounts, mintInfo] = await Promise.all([
        connection.getTokenLargestAccounts(mint),
        connection.getParsedAccountInfo(mint).catch(() => ({ value: null }))
      ]);
      return { connection, largestAccounts, mintInfo };
    },
    { retryAll: true }
  );
  const mintParsed = mintInfo?.value?.data?.parsed?.info || {};
  const supplyRaw = BigInt(String(mintParsed.supply || "0"));
  const decimals = Number(mintParsed.decimals ?? largestAccounts?.value?.[0]?.decimals ?? 6) || 6;
  const accounts = (largestAccounts?.value || []).slice(0, Math.max(3, Math.min(50, Number(limit || 20))));
  const ownersRaw = await Promise.all(
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
  const owners = annotateLongTermAirdropHolders(mint.toBase58(), ownersRaw);

  const totalHolderBalance = owners.reduce((sum, row) => sum + BigInt(row.balanceWei || "0"), 0n);
  return {
    chainId: 101,
    chainName: CHAIN_META[101]?.name || "Solana",
    token: mint.toBase58(),
    pool: "",
    name: "Pumpfun Remastered",
    symbol: "PUMPR",
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
    longTermPolicy: "Top holders who keep holding over time are prioritized for the airdrop.",
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

function unescapePumpFunPayload(html = "") {
  return String(html || "")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function readBalancedJsonObject(text = "", startIndex = 0) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  const start = String(text || "").indexOf("{", startIndex);
  if (start < 0) return "";
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return "";
}

function extractPumpFunBountyObjects(html = "") {
  const decoded = unescapePumpFunPayload(html);
  const out = [];
  const seen = new Set();
  const patterns = ['"initialTask":', '"bounty":', '"parentBounty":'];
  for (const pattern of patterns) {
    let index = 0;
    while (index >= 0 && index < decoded.length) {
      index = decoded.indexOf(pattern, index);
      if (index < 0) break;
      const objectText = readBalancedJsonObject(decoded, index + pattern.length);
      index += pattern.length + Math.max(1, objectText.length);
      if (!objectText) continue;
      try {
        const row = JSON.parse(objectText);
        const taskId = String(row?.taskId || "").trim();
        if (!taskId || seen.has(taskId)) continue;
        seen.add(taskId);
        out.push(row);
      } catch {
        // Pump.fun ships this inside Next's streamed payload. If one chunk is
        // malformed after string unescaping, keep scanning the rest.
      }
    }
  }
  return out;
}

function extractPumpFunBountyRowsFromPayload(payload) {
  const root =
    Array.isArray(payload) ? payload :
    Array.isArray(payload?.items) ? payload.items :
    Array.isArray(payload?.bounties) ? payload.bounties :
    Array.isArray(payload?.data?.items) ? payload.data.items :
    Array.isArray(payload?.data) ? payload.data :
    [];
  return root
    .map((item) => item?.bounty || item?.parentBounty || item?.task || item)
    .filter((item) => item && typeof item === "object" && item.taskId);
}

function nextPumpFunCursor(payload = {}) {
  return sanitizeGoText(
    payload.nextCursor ||
      payload.cursor ||
      payload.page?.nextCursor ||
      payload.pagination?.nextCursor ||
      payload.meta?.nextCursor ||
      "",
    500
  );
}

function parseNextFlightStringRefs(html = "") {
  const refs = new Map();
  const decoded = unescapePumpFunPayload(html);
  const re = /self\.__next_f\.push\(\[1,"([0-9a-z]+):([\s\S]*?)"\]\)/gi;
  let match = null;
  while ((match = re.exec(decoded))) {
    const key = match[1];
    let value = match[2] || "";
    try {
      value = JSON.parse(`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    } catch {
      // Keep the decoded text when JSON repair is not needed.
    }
    refs.set(`$${key}`, value);
  }
  const largeTextRe = /([0-9a-z]+):T[0-9a-f]+,"\]\)<\/script><script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/gi;
  while ((match = largeTextRe.exec(html))) {
    refs.set(`$${match[1]}`, unescapePumpFunPayload(match[2] || ""));
  }
  const scriptRe = /<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/gi;
  let pendingLargeTextKey = "";
  while ((match = scriptRe.exec(html))) {
    const chunk = unescapePumpFunPayload(match[1] || "");
    const marker = [...chunk.matchAll(/(?:^|\n)([0-9a-z]+):T[0-9a-f]+,?/gi)].pop();
    if (marker) {
      pendingLargeTextKey = marker[1];
      continue;
    }
    if (pendingLargeTextKey) {
      refs.set(`$${pendingLargeTextKey}`, chunk);
      pendingLargeTextKey = "";
    }
  }
  return refs;
}

function resolvePumpFunRefs(value, refs) {
  if (typeof value === "string") return refs.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => resolvePumpFunRefs(item, refs));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, row] of Object.entries(value)) out[key] = resolvePumpFunRefs(row, refs);
    return out;
  }
  return value;
}

function isoToUnix(value, fallback = Math.floor(Date.now() / 1000)) {
  const ts = Date.parse(String(value || ""));
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : fallback;
}

function rewardLegAmount(leg = {}) {
  const atomic = BigInt(String(leg.amountAtomic || leg.remainingAmountAtomic || "0").replace(/[^0-9]/g, "") || "0");
  const decimals = Math.max(0, Math.min(18, Number(leg.decimalsSnapshot || 0) || 0));
  const divisor = 10 ** decimals;
  if (!divisor) return 0;
  return Number(atomic) / divisor;
}

function pumpFunTokenUnit(row = {}) {
  const leg = Array.isArray(row.rewardLegs) ? row.rewardLegs[0] : null;
  const mint = String(leg?.mintAddress || row.coinAddress || "").trim();
  if (mint === "So11111111111111111111111111111111111111112") return "SOL";
  if (mint.endsWith("pump")) return "PUMP";
  return mint ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : "PUMP";
}

function normalizePumpFunBounty(row = {}) {
  const taskId = sanitizeGoText(row.taskId || "", 100);
  const title = sanitizeGoText(row.title || "", 140);
  if (!taskId || !title) return null;
  const firstAttachment = Array.isArray(row.attachments) ? row.attachments.find((item) => item?.url) : null;
  const criteria = Array.isArray(row.criteria)
    ? row.criteria
        .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
        .map((item) => sanitizeGoText(item?.text || "", 140))
        .filter(Boolean)
    : [];
  const firstLeg = Array.isArray(row.rewardLegs) ? row.rewardLegs[0] : null;
  const createdAt = isoToUnix(row.publishedAt || row.createdAt);
  const endsAt = isoToUnix(row.expiresAt, createdAt + 7 * 24 * 60 * 60);
  const liveUrl = `https://pump.fun/go/${encodeURIComponent(taskId)}`;
  const rawStatus = String(row.status || "").toUpperCase();
  const closedStatus =
    rawStatus.includes("CLOSED") ||
    rawStatus.includes("CANCEL") ||
    rawStatus.includes("EXPIRED") ||
    rawStatus.includes("PAID") ||
    rawStatus.includes("ARCHIVED");
  const isOpen = !closedStatus && endsAt > Math.floor(Date.now() / 1000);
  return normalizeGoBounty({
    id: `pumpfun-${taskId}`,
    title,
    description: row.bodyMarkdown || "",
    deliverables: criteria.length ? criteria : ["Complete the Pump.fun bounty brief", "Attach proof links, images, or video", "Submit before the bounty expires"],
    rewardUsd: row.rewardTotalUsd || 0,
    tokenSymbol: "PUMPFUN",
    tokenAmount: rewardLegAmount(firstLeg),
    tokenUnit: pumpFunTokenUnit(row),
    payoutChainId: 101,
    creator: "",
    creatorSolana: row.creatorAddress || "",
    creatorName: row.creatorAddress ? `pump_${String(row.creatorAddress).slice(0, 4)}` : "Pump.fun creator",
    status: isOpen && endsAt > Math.floor(Date.now() / 1000) ? "open" : "closed",
    imageUri: firstAttachment?.url || "",
    source: "Pump.fun",
    sourceUrl: liveUrl,
    externalId: taskId,
    onChainBountyId: row.onChainBountyId || "",
    pumpBountiesProgramId: row.pumpBountiesProgramId || "",
    bountyPda: row.bountyPda || "",
    chainConfigSnapshot: row.chainConfigSnapshot || null,
    coinAddress: row.coinAddress || "",
    sourceSubmissionCount: row.counts?.submissionCount || 0,
    sourceLikeCount: row.likeCount || 0,
    createdAt,
    endsAt
  });
}

async function fetchPumpFunBountyRowsFromApi() {
  const sourceUrl = String(process.env.PUMPFUN_BOUNTIES_API_URL || "https://livestream-api.pump.fun/bounties/tasks").trim();
  const pageLimit = Math.max(1, Math.min(100, Number(process.env.PUMPFUN_BOUNTY_PAGE_LIMIT || 100)));
  const maxPages = Math.max(1, Math.min(100, Number(process.env.PUMPFUN_BOUNTY_MAX_PAGES || 50)));
  const maxItems = Math.max(pageLimit, Math.min(5_000, Number(process.env.PUMPFUN_BOUNTY_MAX_ITEMS || 5_000)));
  const rows = [];
  let cursor = "";
  for (let page = 0; page < maxPages && rows.length < maxItems; page += 1) {
    const url = new URL(sourceUrl);
    if (!url.searchParams.has("limit")) url.searchParams.set("limit", String(pageLimit));
    if (!url.searchParams.has("listedOpenOnly") && !url.searchParams.has("status")) url.searchParams.set("listedOpenOnly", "true");
    if (!url.searchParams.has("sort")) url.searchParams.set("sort", "createdAt");
    if (!url.searchParams.has("order")) url.searchParams.set("order", "desc");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent": "PumpRBot/1.0 (+https://pump-r.fun)",
          Accept: "application/json",
          Origin: "https://pump.fun",
          Referer: "https://pump.fun/go/open"
        }
      }),
      8_000,
      "Pump.fun bounty API"
    );
    if (!response.ok) throw new Error(`Pump.fun bounty API returned ${response.status}`);
    const payload = await response.json();
    const pageRows = extractPumpFunBountyRowsFromPayload(payload);
    rows.push(...pageRows.slice(0, Math.max(0, maxItems - rows.length)));
    const nextCursor = nextPumpFunCursor(payload);
    if (!nextCursor || nextCursor === cursor || !pageRows.length) break;
    cursor = nextCursor;
  }
  return rows;
}

async function fetchPumpFunBountyRowsFromHtml() {
  const sourceUrl = String(process.env.PUMPFUN_BOUNTIES_URL || "https://pump.fun/go").trim();
  const response = await withTimeout(
    fetch(sourceUrl, {
      headers: {
        "User-Agent": "PumpRBot/1.0 (+https://pump-r.fun)",
        Accept: "text/html,application/json"
      }
    }),
    8_000,
    "Pump.fun bounties"
  );
  if (!response.ok) throw new Error(`Pump.fun returned ${response.status}`);
  const contentType = String(response.headers.get("content-type") || "");
  if (contentType.includes("application/json")) return extractPumpFunBountyRowsFromPayload(await response.json());
  return extractPumpFunBountyObjects(await response.text());
}

function dedupeAndSortPumpFunBounties(rows = []) {
  const byId = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) =>
    Number(b.createdAt || 0) - Number(a.createdAt || 0) ||
    Number(b.rewardUsd || 0) - Number(a.rewardUsd || 0) ||
    String(a.id || "").localeCompare(String(b.id || ""))
  );
}

async function fetchPumpFunBounties(options = {}) {
  const ttlMs = Math.max(15_000, Number(process.env.PUMPFUN_BOUNTY_CACHE_TTL_MS || 60_000));
  const now = Date.now();
  if (!options.fresh && pumpFunBountiesCache.rows.length && now - pumpFunBountiesCache.fetchedAt < ttlMs) {
    return pumpFunBountiesCache;
  }
  try {
    let rawRows = [];
    try {
      rawRows = await fetchPumpFunBountyRowsFromApi();
      if (!rawRows.length) throw new Error("Pump.fun bounty API returned no rows");
    } catch (apiError) {
      rawRows = await fetchPumpFunBountyRowsFromHtml();
      pumpFunBountiesCache.error = `Pump.fun API fallback: ${apiError?.message || "unavailable"}`;
    }
    const rows = dedupeAndSortPumpFunBounties(rawRows.map(normalizePumpFunBounty).filter((row) => row && row.status === "open"));
    pumpFunBountiesCache = { rows, fetchedAt: now, error: "" };
  } catch (error) {
    pumpFunBountiesCache = {
      rows: pumpFunBountiesCache.rows || [],
      fetchedAt: pumpFunBountiesCache.fetchedAt || now,
      error: error?.message || "Pump.fun bounties unavailable"
    };
  }
  return pumpFunBountiesCache;
}

async function fetchPumpFunBountyDetail(taskId = "", options = {}) {
  const id = sanitizeGoText(taskId || "", 100);
  if (!id) return null;
  const ttlMs = Math.max(15_000, Number(process.env.PUMPFUN_BOUNTY_DETAIL_CACHE_TTL_MS || 120_000));
  const cached = pumpFunBountyDetailCache.get(id);
  if (!options.fresh && cached && Date.now() - Number(cached.fetchedAt || 0) < ttlMs) return cached.row;
  try {
    const url = `https://pump.fun/go/${encodeURIComponent(id)}`;
    const response = await withTimeout(
      fetch(url, {
        headers: {
          "User-Agent": "PumpRBot/1.0 (+https://pump-r.fun)",
          Accept: "text/html"
        }
      }),
      8_000,
      "Pump.fun bounty detail"
    );
    if (!response.ok) throw new Error(`Pump.fun detail returned ${response.status}`);
    const html = await response.text();
    const refs = parseNextFlightStringRefs(html);
    const rows = extractPumpFunBountyObjects(html)
      .map((row) => resolvePumpFunRefs(row, refs))
      .filter((row) => String(row?.taskId || "") === id);
    const row = rows[0] ? normalizePumpFunBounty(rows[0]) : null;
    if (row) pumpFunBountyDetailCache.set(id, { row, fetchedAt: Date.now(), error: "" });
    return row;
  } catch (error) {
    if (cached?.row) return cached.row;
    return null;
  }
}

function normalizePumpFunSubmission(row = {}, bountyId = "") {
  const submissionId = sanitizeGoText(row.submissionId || row.id || "", 120);
  const body = sanitizeAgentDraftText(row.bodyMarkdown || row.description || row.body || "", 6000);
  if (!submissionId || !body) return null;
  const requester = normalizeSolanaDisplayAddress(row.requesterAddress || row.creatorAddress || row.address || "");
  const profileName =
    sanitizeGoText(row.requester?.username || row.user?.username || row.profile?.username || row.username || "", 80) ||
    (requester ? `pump_${requester.slice(0, 4)}` : "Pump.fun user");
  const links = Array.isArray(row.links)
    ? row.links.map(sanitizeGoUrl).filter(Boolean).slice(0, 8)
    : [];
  const firstAttachment = Array.isArray(row.attachments) ? row.attachments.find((item) => item?.url) : null;
  return normalizeGoSubmission({
    id: normalizeGoId(`pumpfun-sub-${submissionId}`, "sub"),
    bountyId,
    author: ethers.ZeroAddress,
    authorName: profileName,
    body,
    mediaUrl: firstAttachment?.url || "",
    links,
    createdAt: isoToUnix(row.createdAt || row.updatedAt),
    likes: []
  });
}

async function fetchPumpFunSubmissions(taskId = "", bountyId = "") {
  const id = sanitizeGoText(taskId || "", 100);
  if (!id) return [];
  try {
    const userAgent = String(
      process.env.PUMPFUN_USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
    ).trim();
    const response = await withTimeout(
      fetch(`https://livestream-api.pump.fun/bounties/tasks/${encodeURIComponent(id)}/submissions?limit=50`, {
        headers: {
          Accept: "application/json",
          Origin: "https://pump.fun",
          Referer: `https://pump.fun/go/${encodeURIComponent(id)}`,
          "User-Agent": userAgent
        }
      }),
      10_000,
      "Pump.fun submissions"
    );
    if (!response.ok) throw new Error(`Pump.fun submissions returned ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    const rows = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.submissions)
        ? payload.submissions
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
            ? payload
            : [];
    return rows
      .map((row) => normalizePumpFunSubmission(row, bountyId || `pumpfun-${id}`))
      .filter(Boolean);
  } catch (error) {
    console.warn(`Pump.fun submissions unavailable for ${id}: ${error?.message || "unknown error"}`);
    return [];
  }
}

async function listLiveGoBounties(options = {}) {
  if (String(process.env.ENABLE_PUMPFUN_BOUNTIES || "1") === "0") return [];
  const live = await fetchPumpFunBounties(options);
  return Array.isArray(live.rows) ? live.rows : [];
}

async function findLiveGoBounty(id = "") {
  const normalized = normalizeGoId(id || "", "go");
  const externalId = normalized.startsWith("pumpfun-") ? normalized.slice("pumpfun-".length) : "";
  if (externalId) {
    const detail = await fetchPumpFunBountyDetail(externalId);
    if (detail) return detail;
  }
  const rows = await listLiveGoBounties({ fresh: false });
  return rows.find((row) => row.id === normalized) || null;
}

function bountyForAgentPrompt(bounty = {}) {
  return {
    id: bounty.id || "",
    title: bounty.title || "",
    source: bounty.source || "Pump-r",
    sourceUrl: bounty.sourceUrl || "",
    rewardUsd: Number(bounty.rewardUsd || 0),
    tokenAmount: bounty.tokenAmount || 0,
    tokenUnit: bounty.tokenUnit || "",
    description: bounty.description || "",
    deliverables: Array.isArray(bounty.deliverables) ? bounty.deliverables : [],
    imageUri: bounty.imageUri || "",
    submissions: Number(bounty.submissions || 0),
    secondsLeft: Number(bounty.secondsLeft || 0)
  };
}

function fallbackAgentBountyDraft(agent = {}, bounty = {}) {
  const deliverables = (Array.isArray(bounty.deliverables) ? bounty.deliverables : [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const skills = String(agent.skillsMd || "").split("\n").slice(0, 12).join("\n");
  return [
    `Agent: ${agent.name || "Agent"}`,
    `Bounty: ${bounty.title || "Selected bounty"}`,
    `Source: ${bounty.source || "Pump-r"}`,
    `Reward: $${Number(bounty.rewardUsd || 0).toLocaleString()}${bounty.tokenAmount ? ` / ${bounty.tokenAmount} ${bounty.tokenUnit || ""}` : ""}`,
    "",
    "Synced brief:",
    bounty.description || "No description provided.",
    "",
    "Execution plan:",
    "- Read every acceptance criterion before creating proof.",
    "- Produce only legal, verifiable work that can be reviewed publicly.",
    "- Attach proof links, screenshots, images, or video before submitting.",
    "- Do not claim completion until every required criterion is satisfied.",
    "",
    "Acceptance criteria:",
    deliverables || "- No explicit criteria listed.",
    "",
    "Agent SKILLS.md:",
    skills || "- No skills provided.",
    "",
    "Submission draft:",
    "I reviewed the full synced bounty brief and prepared the required work package. Proof and final links are attached for review."
  ].join("\n");
}

function openAiTextFromResponse(payload = {}) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const chunks = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      const text = content.text || content?.content?.text || "";
      if (typeof text === "string" && text.trim()) chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

async function draftAgentBountyWithOpenAI(agent = {}, bounty = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      configured: false,
      body: fallbackAgentBountyDraft(agent, bounty),
      note: "OPENAI_API_KEY is not configured. Local draft generated instead."
    };
  }
  const model = String(process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const prompt = [
    "You are a Pump-r bounty-solving agent.",
    "Use the agent SKILLS.md and the synced bounty brief to create a practical, review-ready work package.",
    "Do not pretend the task is complete. Do not fabricate proof, links, contacts, screenshots, or real-world outcomes.",
    "If the bounty requires external real-world action, produce an execution plan, evidence checklist, risk notes, and a submission draft template.",
    "If the bounty can be completed digitally, produce exact next steps, required files/media, and a concise submission draft.",
    "Return plain text only, with sections: Agent Read, Bounty Summary, Feasibility, Execution Plan, Evidence Needed, Submission Draft, Warnings.",
    "",
    `Agent:\n${JSON.stringify({
      name: agent.name,
      summary: agent.summary,
      targets: agent.targets,
      goals: agent.goals,
      skillsMd: agent.skillsMd
    }, null, 2)}`,
    "",
    `Bounty:\n${JSON.stringify(bountyForAgentPrompt(bounty), null, 2)}`
  ].join("\n");
  const response = await withTimeout(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: Math.max(800, Math.min(5000, Number(process.env.OPENAI_AGENT_MAX_OUTPUT_TOKENS || 2200))),
        temperature: 0.3
      })
    }),
    30_000,
    "OpenAI agent draft"
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI returned ${response.status}`);
  }
  const body = openAiTextFromResponse(payload);
  return {
    configured: true,
    model,
    body: sanitizeAgentDraftText(body || fallbackAgentBountyDraft(agent, bounty), 6000),
    note: "AI bounty draft generated."
  };
}

function agentExecutionFallback(agent = {}, bounty = {}) {
  const deliverables = (Array.isArray(bounty.deliverables) ? bounty.deliverables : [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  return [
    `Submission for: ${bounty.title || "Selected bounty"}`,
    "",
    "Summary:",
    `${agent.name || "Agent"} reviewed the full bounty brief and prepared the work package below for sponsor review.`,
    "",
    "Work completed:",
    "- Read the full bounty requirements and acceptance criteria.",
    "- Organized the required deliverables into a review checklist.",
    "- Prepared the submission text and proof checklist for final review.",
    "",
    "Proof / links:",
    bounty.sourceUrl ? `- Original bounty: ${bounty.sourceUrl}` : "- Proof links should be attached before final reward review.",
    "",
    "Deliverables matched:",
    deliverables || "- No explicit deliverables listed by the bounty."
  ].join("\n");
}

async function executeAgentBountyWithOpenAI(agent = {}, bounty = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      configured: false,
      body: sanitizeAgentDraftText(agentExecutionFallback(agent, bounty), 6000),
      note: "OPENAI_API_KEY is not configured. Local execution package generated instead."
    };
  }
  const model = String(process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();
  const prompt = [
    "You are a Pump-r autonomous bounty agent running inside the Pump-r app.",
    "Your job is to do as much of the bounty work as can be done from the provided brief and agent SKILLS.md, then create a Pump.fun-ready submission package.",
    "You do not have private accounts, browsers, wallets, email, X, or Pump.fun write access unless the user supplies those tools later.",
    "Never claim you completed real-world actions you did not actually perform. Never fabricate proof, links, screenshots, contacts, media, transactions, or official confirmations.",
    "For tasks that require outside action, be honest: say what is prepared, what proof is required, and what must still happen before the bounty should be approved.",
    "For tasks that can be completed using text reasoning, research planning, copywriting, strategy, scripts, or checklists, complete those parts directly.",
    "Return plain text only. Do not include internal logs, JSON, markdown tables, or long agent analysis.",
    "Format the answer exactly with these section labels, each on its own line: Submission for:, Summary:, Work completed:, Proof / links:, Deliverables matched:.",
    "Put a blank line between sections. Use short bullet points under Work completed, Proof / links, and Deliverables matched.",
    "Keep the tone like a Pump.fun submission: direct, scannable, not corporate, and easy for the sponsor to review.",
    "Keep it concise enough to paste into a Pump.fun bounty submission box, but include enough detail for the bounty creator to review it.",
    "",
    `Agent:\n${JSON.stringify({
      name: agent.name,
      summary: agent.summary,
      targets: agent.targets,
      goals: agent.goals,
      skillsMd: agent.skillsMd
    }, null, 2)}`,
    "",
    `Bounty:\n${JSON.stringify(bountyForAgentPrompt(bounty), null, 2)}`
  ].join("\n");
  const response = await withTimeout(
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: Math.max(1200, Math.min(6000, Number(process.env.OPENAI_AGENT_MAX_OUTPUT_TOKENS || 3000)))
      })
    }),
    45_000,
    "OpenAI agent run"
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI returned ${response.status}`);
  }
  const body = openAiTextFromResponse(payload);
  return {
    configured: true,
    model,
    body: sanitizeAgentDraftText(body || agentExecutionFallback(agent, bounty), 6000),
    note: "AI agent run completed."
  };
}

function bountyNeedsRealWorldProof(bounty = {}) {
  const text = [
    bounty.title,
    bounty.description,
    ...(Array.isArray(bounty.deliverables) ? bounty.deliverables : [])
  ].join(" ").toLowerCase();
  const realWorldSignals = [
    "video",
    "recording",
    "footage",
    "selfie",
    "photo",
    "receipt",
    "tattoo",
    "interview",
    "march",
    "street",
    "donation",
    "drive",
    "official",
    "proof",
    "show your",
    "hold "
  ];
  return realWorldSignals.some((signal) => text.includes(signal));
}

async function generateOpenAiBountyConceptImage(agent = {}, bounty = {}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for AI concept image generation");
  }
  const needsRealWorldProof = bountyNeedsRealWorldProof(bounty);
  const model = String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-1").trim();
  const title = sanitizeAlphaText(bounty.title || "Pump.fun bounty concept", 120);
  const deliverables = (Array.isArray(bounty.deliverables) ? bounty.deliverables : [])
    .map((item) => `- ${sanitizeAlphaText(item, 180)}`)
    .join("\n");
  const prompt = [
    "Create one photorealistic camera-style image that visually represents the bounty task itself.",
    "The image must look like a real phone photo or documentary still, not a cartoon, anime image, illustration, 3D render, poster, checklist, UI card, infographic, app screenshot, title slide, or instruction sheet.",
    "Make the bounty action the subject of the image. For example, if the task asks for fries spelling a word on a fast-food table, show a realistic fast-food table with fries arranged to spell that exact word.",
    "Use only the text that the task specifically asks to show. Avoid extra captions, badges, labels, headings, disclaimers, menus, or paragraphs.",
    "Use natural lighting, realistic materials, real-world perspective, imperfect candid composition, and believable camera depth of field.",
    "Style: realistic everyday photo evidence scene, sharp but natural, no graphic design layout, no mascot characters, no decorative text overlays.",
    `Bounty title: ${title}`,
    `Bounty summary: ${sanitizeAgentDraftText(bounty.description || "", 700)}`,
    deliverables ? `Deliverables:\n${deliverables}` : "",
    `Agent: ${sanitizeAlphaText(agent.name || "Pump-r Agent", 80)}`
  ].filter(Boolean).join("\n\n");
  const response = await withTimeout(
    fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        size: String(process.env.OPENAI_IMAGE_SIZE || "1024x1024"),
        n: 1
      })
    }),
    60_000,
    "OpenAI concept image"
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI image generation returned ${response.status}`);
  }
  const b64 = String(payload?.data?.[0]?.b64_json || "").trim();
  if (!b64) throw new Error("OpenAI did not return image data");
  return {
    filename: `pumpr-task-scene-${Date.now().toString(36)}.png`,
    contentType: "image/png",
    size: Math.ceil((b64.length * 3) / 4),
    dataUrl: `data:image/png;base64,${b64}`,
    generatedBy: "openai",
    model,
    mode: needsRealWorldProof ? "storyboard" : "concept"
  };
}

async function loadGoBountyForAgent(bountyId = "") {
  const id = normalizeGoId(bountyId || "", "go");
  const goStore = readGoDb();
  const localBounty = (goStore.bounties || []).map(normalizeGoBounty).find((row) => row && row.id === id);
  const externalId = id.startsWith("pumpfun-") ? id.slice("pumpfun-".length) : "";
  const liveDetail = externalId ? await fetchPumpFunBountyDetail(externalId, { fresh: true }) : null;
  const bounty = decorateGoBounty(liveDetail || localBounty || (await findLiveGoBounty(id)), goStore);
  return bounty?.id ? { bounty, goStore } : { bounty: null, goStore };
}

async function createCommunityPost(value = {}) {
  const tokenRaw = value.token || value.tokenAddress || "";
  const xHandle = normalizeXHandle(value.xHandle || "");
  const authorRaw = value.author || value.address || "";
  const body = sanitizeCommunityText(value.body || "");
  const { token, author } = assertCommunityWalletMatchesToken(tokenRaw, authorRaw);
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
  const author = normalizeCommunityIdentity(value.author || value.address || "");
  const body = sanitizeCommunityText(value.body || "", 180);
  if (!id) throw new Error("post id is required");
  if (!author) throw new Error("author is required");
  if (!body) throw new Error("comment text is required");
  const store = await readCommunityDbPersistent();
  const posts = Array.isArray(store.posts) ? store.posts : [];
  const post = posts.find((row) => String(row?.id || "") === id);
  if (!post) throw new Error("post not found");
  const routeToken = normalizeCommunityToken(value.token || value.tokenAddress || "");
  if (routeToken && String(post.token || "").toLowerCase() !== routeToken.toLowerCase()) throw new Error("post does not belong to this community");
  assertCommunityWalletMatchesToken(post.token, author);
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

async function setCommunityLike(postId, address, liked, tokenAddress = "") {
  const id = String(postId || "");
  const viewer = normalizeCommunityIdentity(address || "");
  if (!id) throw new Error("post id is required");
  if (!viewer) throw new Error("address is required");
  const store = await readCommunityDbPersistent();
  const posts = Array.isArray(store.posts) ? store.posts : [];
  const post = posts.find((row) => String(row?.id || "") === id);
  if (!post) throw new Error("post not found");
  const routeToken = normalizeCommunityToken(tokenAddress || "");
  if (routeToken && String(post.token || "").toLowerCase() !== routeToken.toLowerCase()) throw new Error("post does not belong to this community");
  assertCommunityWalletMatchesToken(post.token, viewer);
  const viewerKey = communityIdentityKey(viewer);
  const likes = new Set((Array.isArray(post.likes) ? post.likes : []).map(communityIdentityKey).filter(Boolean));
  if (liked) likes.add(viewerKey);
  else likes.delete(viewerKey);
  post.likes = [...likes];
  await writeCommunityDbPersistent(store);
  return normalizeCommunityPost(post);
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlBuffer(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(text.padEnd(text.length + ((4 - text.length % 4) % 4), "="), "base64");
}

function decodeBase64UrlText(value) {
  return decodeBase64UrlBuffer(value).toString("utf8");
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
  if (configured) {
    try {
      const configuredHost = new URL(configured).hostname.toLowerCase();
      const requestHost = new URL(origin).hostname.toLowerCase();
      const staleEtherpumpCallback = configuredHost.includes("etherpump.fun") && requestHost.includes("pump-r.fun");
      if (!staleEtherpumpCallback) return configured;
    } catch {
      return configured;
    }
  }
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
  try {
    fs.mkdirSync(path.dirname(SUPPORT_DB_PATH), { recursive: true });
    fs.writeFileSync(SUPPORT_DB_PATH, JSON.stringify(safe, null, 2));
  } catch {
    // /tmp/local cache failures should not block remote storage attempts.
  }
  supportDbCache = safe;
}

function normalizeSupportMessage(row = {}) {
  const id = String(row.id || "").trim();
  const fromAddress = normalizeSupportAddress(row.fromAddress || row.from || "");
  const toAddress = normalizeSupportAddress(row.toAddress || row.to || "");
  const subject = String(row.subject || "").trim().slice(0, 120);
  const body = String(row.body || "").trim().slice(0, 4000);
  const category = String(row.category || "").trim().slice(0, 64);
  const tokenAddress = normalizeProfileAddress(row.tokenAddress || row.token || "");
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

function sanitizeSupportStore(store = {}) {
  const messages = (Array.isArray(store?.messages) ? store.messages : [])
    .map((row) => normalizeSupportMessage(row))
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 2000);
  return { messages };
}

async function readSupportDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_SUPPORT_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_SUPPORT_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase support read failed: ${response.status}`);
  return sanitizeSupportStore(await response.json().catch(() => ({ messages: [] })));
}

async function writeSupportDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_SUPPORT_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_SUPPORT_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizeSupportStore(store), null, 2)
  });
  if (!response.ok) throw new Error(`Supabase support write failed: ${response.status}`);
  return true;
}

async function readSupportDbPersistent(options = {}) {
  const refresh = Boolean(options.refresh);
  if (isSupabaseStorageConfigured() && (refresh || !supportDbRemoteLoaded)) {
    try {
      const remote = await readSupportDbRemote();
      if (remote) writeSupportDb(remote);
      supportDbRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase support read failed: ${error?.message || "connection error"}`);
      supportDbRemoteLoaded = true;
    }
  }
  return sanitizeSupportStore(readSupportDb());
}

async function writeSupportDbPersistent(store) {
  assertJsonStoreConfigured("Support", SUPABASE_SUPPORT_OBJECT);
  const safe = sanitizeSupportStore(store);
  writeSupportDb(safe);
  if (isSupabaseStorageConfigured()) {
    await writeSupportDbRemote(safe);
  }
  return safe;
}

function listSupportMessagesForAddress(address, storeOverride = null) {
  const key = supportAddressKey(address);
  if (!key) return [];
  const store = storeOverride || readSupportDb();
  const rows = (Array.isArray(store.messages) ? store.messages : [])
    .map((row) => normalizeSupportMessage(row))
    .filter(Boolean)
    .filter((row) => supportAddressKey(row.fromAddress) === key || supportAddressKey(row.toAddress) === key)
    .sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

function listAllSupportMessages(storeOverride = null) {
  const store = storeOverride || readSupportDb();
  return (Array.isArray(store.messages) ? store.messages : [])
    .map((row) => normalizeSupportMessage(row))
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function listSupportInbox(platformAddress, storeOverride = null) {
  const key = supportAddressKey(platformAddress);
  if (!key) return [];
  return listAllSupportMessages(storeOverride).filter((row) => supportAddressKey(row.toAddress) === key);
}

async function createSupportMessage(payload = {}) {
  const fromAddress = normalizeSupportAddress(payload.fromAddress || payload.from || "");
  const platformAddress = resolvePlatformSupportAddress();
  if (!fromAddress) throw new Error("fromAddress is required");
  if (!platformAddress) throw new Error("Support wallet is not configured");

  const body = String(payload.body || "").trim();
  if (!body) throw new Error("Message body is required");
  if (body.length > 4000) throw new Error("Message is too long");

  const subjectRaw = String(payload.subject || "").trim();
  const categoryRaw = String(payload.category || "").trim();
  const tokenAddress = normalizeProfileAddress(payload.tokenAddress || "");

  const store = await readSupportDbPersistent();
  const next = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    fromAddress,
    toAddress: platformAddress,
    subject: (subjectRaw || "Support request").slice(0, 120),
    body: body.slice(0, 4000),
    category: (categoryRaw || "general").slice(0, 64).toLowerCase(),
    tokenAddress: tokenAddress || "",
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
  await writeSupportDbPersistent({ messages });
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

function parseSolToLamports(amount, fallback = "0") {
  const raw = String(amount ?? "").trim() || String(fallback);
  return parseAmountToWei(raw, 9);
}

function formatSolLamports(lamports) {
  const safeLamports = typeof lamports === "bigint" ? lamports : BigInt(Math.max(0, Number(lamports || 0)));
  const whole = safeLamports / 1_000_000_000n;
  const fraction = (safeLamports % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction.slice(0, 4)} SOL` : `${whole} SOL`;
}

const PUMPFUN_CREATE_MIN_LAMPORTS = parseSolToLamports(process.env.PUMPFUN_CREATE_MIN_SOL, "0.025");
const PUMPFUN_TX_BUFFER_LAMPORTS = parseSolToLamports(process.env.PUMPFUN_TX_BUFFER_SOL, "0.004");
const PUMPFUN_TRANSFER_BUFFER_LAMPORTS = parseSolToLamports(process.env.PUMPFUN_TRANSFER_BUFFER_SOL, "0.003");

async function assertSolanaWalletHasLamports(connection, publicKey, requiredLamports, actionLabel) {
  const required = typeof requiredLamports === "bigint" ? requiredLamports : BigInt(Math.max(0, Number(requiredLamports || 0)));
  if (required <= 0n) return { balanceLamports: 0n, requiredLamports: required };
  let balanceLamports = 0n;
  try {
    balanceLamports = BigInt(await connection.getBalance(publicKey, "confirmed"));
  } catch (error) {
    const wrapped = new Error(`Could not check SOL balance before ${actionLabel}. Try again in a moment.`);
    wrapped.status = 503;
    wrapped.code = "SOL_BALANCE_CHECK_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }
  if (balanceLamports < required) {
    const shortage = required - balanceLamports;
    const message = `Not enough SOL for ${actionLabel}. Need about ${formatSolLamports(required)} and this wallet has ${formatSolLamports(balanceLamports)}. Add at least ${formatSolLamports(shortage)} and try again before opening Phantom.`;
    const error = new Error(message);
    error.status = 400;
    error.code = "INSUFFICIENT_SOL";
    error.balanceLamports = balanceLamports.toString();
    error.requiredLamports = required.toString();
    error.noRpcRetry = true;
    throw error;
  }
  return { balanceLamports, requiredLamports: required };
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
  const numericChainId = Number(chainId || 0);
  const token = numericChainId === 101 ? normalizeSolanaAddress(tokenAddress || "") : normalizeAddress(tokenAddress || "");
  if (!token) return null;

  const chainSlug = dexscreenerChainForChain(numericChainId);
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
    const targetPair = numericChainId === 101 ? normalizeSolanaAddress(pairHint || "") : normalizeAddress(pairHint || "");
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
          (row) => {
            const pair = numericChainId === 101 ? normalizeSolanaAddress(row?.pairAddress || "") : normalizeAddress(row?.pairAddress || "");
            return pair.toLowerCase() === String(targetPair).toLowerCase();
          }
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
      pairAddress: (numericChainId === 101 ? normalizeSolanaAddress(best?.pairAddress || "") : normalizeAddress(best?.pairAddress || "")) || "",
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

function sanitizeKolApplication(row = {}) {
  if (!row || typeof row !== "object" || !row.enabled) return null;
  const wallet = String(row.wallet || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return null;
  const buySol = Math.max(0, Math.min(toNumberSafe(row.buySol, 0), 100));
  const estimatedTokens = Math.max(0, toNumberSafe(row.estimatedTokens, 0));
  const estimatedSupplyPct = Math.max(0, Math.min(toNumberSafe(row.estimatedSupplyPct, 0), 100));
  return {
    enabled: true,
    name: String(row.name || "Selected wallet").trim().slice(0, 80),
    wallet,
    image: String(row.image || "").trim().slice(0, 2048),
    buySol,
    estimatedTokens,
    estimatedSupplyPct,
    kolBuy: row.kolBuy && typeof row.kolBuy === "object"
      ? {
          wallet,
          buySol,
          tokenAmount: String(row.kolBuy.tokenAmount || "").replace(/[^0-9]/g, "").slice(0, 80),
          estimatedSupplyPct: Math.max(0, Math.min(toNumberSafe(row.kolBuy.estimatedSupplyPct, estimatedSupplyPct), 100)),
          recipientMode: String(row.kolBuy.recipientMode || "").trim().slice(0, 40)
        }
      : null
  };
}

function emptyPumpFunLaunchesStore() {
  return { launches: [] };
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function normalizePumpFunLaunch(row = {}) {
  const mint = String(row.mint || row.token || row.tokenAddress || "").trim();
  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return null;
  const symbol = String(row.symbol || "").trim().replace(/^\$/, "").toUpperCase().slice(0, 13);
  const marketCapUsd = toNumberSafe(row.marketCapUsd || row.usd_market_cap || row.market_cap_usd, 0);
  const marketCapSol = toNumberSafe(row.marketCapSol || row.market_cap_sol || row.market_cap, 0);
  const fdvUsd = toNumberSafe(row.fdvUsd || row.fdv_usd, 0);
  const priceUsd = toNumberSafe(row.priceUsd || row.price_usd, 0);
  const dexInfo = row.dexSnapshot?.raw?.info || row.dexSnapshot?.info || {};
  const rawImageUri = String(
    row.imageUri ||
      row.imageURI ||
      row.image_url ||
      row.imageUrl ||
      row.image_uri ||
      row.image ||
      row.logo ||
      row.thumbnail ||
      row.metadata?.image ||
      row.metadata?.image_uri ||
      row.metadata?.imageUrl ||
      row.data?.image ||
      row.data?.image_uri ||
      dexInfo.imageUrl ||
      dexInfo.openGraph ||
      ""
  ).trim();
  return {
    id: String(row.id || mint).trim(),
    chainId: "pumpfun",
    source: "pumpfun",
    token: mint,
    tokenAddress: mint,
    mint,
    name: String(row.name || symbol || "Pump.fun token").trim().slice(0, 80),
    symbol: symbol || mint.slice(0, 6).toUpperCase(),
    description: String(row.description || "").trim().slice(0, 4000),
    imageUri: sanitizeLaunchImageUri(rawImageUri).slice(0, 2048),
    creator: String(row.creator || row.user || "").trim(),
    kolApplication: sanitizeKolApplication(row.kolApplication),
    kolBuySignature: String(row.kolBuySignature || "").trim(),
    kolTransferSignature: String(row.kolTransferSignature || "").trim(),
    pumpfunUrl: pickPumpFunUrl(row, mint),
    signature: String(row.signature || "").trim(),
    metadataUri: String(row.metadataUri || row.metadata_uri || row.uri || row.data?.metadata_uri || "").trim(),
    marketCapUsd,
    marketCapSol,
    fdvUsd,
    priceUsd,
    pumpfunComplete: Boolean(row.pumpfunComplete || row.complete),
    dexSnapshot: row.dexSnapshot && typeof row.dexSnapshot === "object" ? row.dexSnapshot : null,
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function pumpFunFrontendApiUrl(mint = "") {
  return `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(String(mint || "").trim())}`;
}

async function readPumpFunCoinSnapshot(mint = "") {
  const safeMint = String(mint || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(safeMint)) return null;
  const [pumpFunRes, dexRes] = await Promise.allSettled([
    (async () => {
      const response = await fetch(pumpFunFrontendApiUrl(safeMint), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3500)
      });
      if (!response.ok) return null;
      const row = await response.json().catch(() => null);
      if (!row || typeof row !== "object") return null;
      return row;
    })(),
    readDexScreenerTokenSnapshot(101, safeMint)
  ]);
  const row = pumpFunRes.status === "fulfilled" ? pumpFunRes.value : null;
  const dex = dexRes.status === "fulfilled" ? dexRes.value : null;
  if (!row && !dex) return null;
  const marketCapUsd = Math.max(
    toNumberSafe(row?.usd_market_cap || row?.market_cap_usd || row?.marketCapUsd, 0),
    toNumberSafe(dex?.marketCapUsd, 0),
    toNumberSafe(dex?.fdvUsd, 0)
  );
  const dexInfo = dex?.raw?.info || dex?.info || {};
  return {
    name: String(row?.name || "").trim(),
    symbol: String(row?.symbol || "").trim(),
    description: String(row?.description || "").trim(),
    imageUri: String(
      row?.image_uri ||
        row?.imageUrl ||
        row?.image_url ||
        row?.image ||
        row?.metadata?.image ||
        dexInfo.imageUrl ||
        dexInfo.openGraph ||
        ""
    ).trim(),
    creator: String(row?.creator || row?.user || "").trim(),
    metadataUri: String(row?.metadata_uri || row?.metadataUri || row?.uri || "").trim(),
    marketCapUsd,
    marketCapSol: toNumberSafe(row?.market_cap || row?.marketCapSol || row?.market_cap_sol, 0),
    fdvUsd: Math.max(toNumberSafe(row?.fdv_usd || row?.fdvUsd, 0), toNumberSafe(dex?.fdvUsd, 0)),
    priceUsd: Math.max(toNumberSafe(row?.price_usd || row?.priceUsd, 0), toNumberSafe(dex?.priceUsd, 0)),
    pumpfunComplete: Boolean(row?.complete),
    pumpfunUrl: pickPumpFunUrl(row || {}, safeMint),
    dexSnapshot: dex || null
  };
}

async function hydratePumpFunLaunchMarketCaps(rows = [], options = {}) {
  const launches = Array.isArray(rows) ? rows : [];
  const forceFresh = Boolean(options.fresh);
  const imageOnlyLimit = Number.isFinite(Number(options.imageOnlyLimit)) ? Math.max(0, Math.floor(Number(options.imageOnlyLimit))) : 0;
  let imageOnlyHydrated = 0;
  return mapWithConcurrency(launches, 4, async (launch) => {
    const hasMarketCap = Number(launch?.marketCapUsd || 0) > 0;
    const hasImage = Boolean(String(launch?.imageUri || launch?.imageURI || launch?.image || "").trim());
    if (!forceFresh && hasMarketCap && hasImage) return launch;
    if (!forceFresh && hasMarketCap && !hasImage && imageOnlyLimit > 0) {
      imageOnlyHydrated += 1;
      if (imageOnlyHydrated > imageOnlyLimit) return launch;
    }
    const snapshot = await readPumpFunCoinSnapshot(launch?.mint || launch?.token || "");
    if (!snapshot) return launch;
    return {
      ...launch,
      ...snapshot,
      imageUri: snapshot.imageUri || launch.imageUri || launch.imageURI || launch.image || "",
      name: snapshot.name || launch.name,
      symbol: snapshot.symbol || launch.symbol,
      description: snapshot.description || launch.description,
      metadataUri: snapshot.metadataUri || launch.metadataUri,
      pumpfunUrl: snapshot.pumpfunUrl || launch.pumpfunUrl
    };
  });
}

function sanitizePumpFunLaunchesStore(store = {}) {
  const seen = new Set();
  const launches = (Array.isArray(store?.launches) ? store.launches : [])
    .map(normalizePumpFunLaunch)
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .filter((row) => {
      const key = row.mint.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 300);
  return { launches };
}

function readPumpFunLaunchesDb() {
  if (pumpFunLaunchesDbCache) return pumpFunLaunchesDbCache;
  try {
    if (fs.existsSync(PUMPFUN_LAUNCHES_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(PUMPFUN_LAUNCHES_DB_PATH, "utf8") || "{}");
      pumpFunLaunchesDbCache = sanitizePumpFunLaunchesStore(parsed);
      return pumpFunLaunchesDbCache;
    }
  } catch {
    // fall through
  }
  pumpFunLaunchesDbCache = emptyPumpFunLaunchesStore();
  return pumpFunLaunchesDbCache;
}

function writePumpFunLaunchesDb(store) {
  const safe = sanitizePumpFunLaunchesStore(store);
  pumpFunLaunchesDbCache = safe;
  try {
    fs.mkdirSync(path.dirname(PUMPFUN_LAUNCHES_DB_PATH), { recursive: true });
    fs.writeFileSync(PUMPFUN_LAUNCHES_DB_PATH, JSON.stringify(safe, null, 2));
  } catch {
    // Vercel /tmp can fail under rare pressure; remote write below is still attempted.
  }
  return safe;
}

async function readPumpFunLaunchesRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_LAUNCHES_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_LAUNCHES_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase Pump.fun launch read failed: ${response.status} ${text}`.trim());
  }
  return sanitizePumpFunLaunchesStore(await response.json());
}

async function writePumpFunLaunchesRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_LAUNCHES_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const body = JSON.stringify(sanitizePumpFunLaunchesStore(store), null, 2);
  let lastText = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_LAUNCHES_OBJECT), {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
        "x-upsert": "true"
      },
      body
    });
    if (response.ok) return true;
    lastStatus = response.status;
    lastText = await response.text().catch(() => "");
    const lowered = String(lastText || "").toLowerCase();
    const retryable = [408, 425, 429, 500, 502, 503, 504, 544].includes(Number(response.status))
      || lowered.includes("too_many_connections")
      || lowered.includes("database") && lowered.includes("timeout");
    if (!retryable || attempt === 3) break;
    await waitMs(400 * (attempt + 1) ** 2);
  }
  throw new Error(`Supabase Pump.fun launch write failed: ${lastStatus} ${lastText}`.trim());
}

async function readPumpFunLaunchesPersistent(options = {}) {
  const refresh = Boolean(options.refresh);
  if (isSupabaseStorageConfigured() && (refresh || !pumpFunLaunchesRemoteLoaded)) {
    try {
      const remote = await readPumpFunLaunchesRemote();
      if (remote) writePumpFunLaunchesDb(remote);
      pumpFunLaunchesRemoteLoaded = true;
    } catch (error) {
      console.warn(`Supabase Pump.fun launch read failed: ${error?.message || "connection error"}`);
      pumpFunLaunchesRemoteLoaded = true;
    }
  }
  return sanitizePumpFunLaunchesStore(readPumpFunLaunchesDb());
}

async function writePumpFunLaunchesPersistent(store) {
  assertJsonStoreConfigured("Pump.fun launches", SUPABASE_PUMPFUN_LAUNCHES_OBJECT);
  const safe = writePumpFunLaunchesDb(store);
  if (isSupabaseStorageConfigured()) {
    try {
      await writePumpFunLaunchesRemote(safe);
    } catch (error) {
      if (!allowFileJsonFallback()) throw error;
      console.warn(`Supabase Pump.fun launch write failed: ${error?.message || "connection error"}`);
    }
  }
  return safe;
}

async function recordPumpFunLaunch(row = {}) {
  const hasMarketCap = Number(row?.marketCapUsd || 0) > 0;
  const hasImage = Boolean(String(row?.imageUri || row?.imageURI || row?.image || row?.image_url || row?.image_uri || "").trim());
  const snapshot = hasMarketCap && hasImage ? null : await readPumpFunCoinSnapshot(row?.mint || row?.token || "");
  const normalized = normalizePumpFunLaunch(snapshot
    ? {
        ...row,
        ...snapshot,
        name: snapshot.name || row.name,
        symbol: snapshot.symbol || row.symbol,
        description: snapshot.description || row.description,
        imageUri: snapshot.imageUri || row.imageUri || row.imageURI || row.image || "",
        metadataUri: snapshot.metadataUri || row.metadataUri
      }
    : row);
  if (!normalized) return null;
  const store = await readPumpFunLaunchesPersistent({ refresh: true });
  const launches = [normalized, ...(Array.isArray(store.launches) ? store.launches : []).filter((item) => String(item?.mint || "").toLowerCase() !== normalized.mint.toLowerCase())];
  await writePumpFunLaunchesPersistent({ launches });
  return normalized;
}

function normalizeLaunchNameKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeLaunchSymbolKey(value = "") {
  return String(value || "")
    .trim()
    .replace(/^\$+/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function launchIdentityMatch(row = {}, wanted = {}) {
  const rowNameKey = normalizeLaunchNameKey(row.name || row.tokenName || "");
  const rowSymbolKey = normalizeLaunchSymbolKey(row.symbol || row.tokenSymbol || "");
  if (wanted.nameKey && rowNameKey && wanted.nameKey === rowNameKey) return "name";
  if (wanted.symbolKey && rowSymbolKey && wanted.symbolKey === rowSymbolKey) return "symbol";
  return "";
}

function duplicateLaunchPayload(row = {}, field = "") {
  return {
    duplicate: true,
    field,
    existing: {
      name: String(row.name || row.tokenName || "").trim(),
      symbol: String(row.symbol || row.tokenSymbol || "").trim().replace(/^\$/, "").toUpperCase(),
      token: String(row.token || row.tokenAddress || row.mint || "").trim(),
      chainId: row.chainId || "",
      source: row.source || (row.mint ? "pumpfun" : "evm"),
      url: String(row.pumpfunUrl || row.url || "").trim()
    }
  };
}

async function findDuplicateLaunchIdentity({ name = "", symbol = "" } = {}) {
  const wanted = {
    nameKey: normalizeLaunchNameKey(name),
    symbolKey: normalizeLaunchSymbolKey(symbol)
  };
  if (!wanted.nameKey && !wanted.symbolKey) return { duplicate: false };

  const pumpFunStore = await readPumpFunLaunchesPersistent({ refresh: true });
  for (const row of Array.isArray(pumpFunStore.launches) ? pumpFunStore.launches : []) {
    const field = launchIdentityMatch(row, wanted);
    if (field) return duplicateLaunchPayload(row, field);
  }

  const deployment = loadDeploymentConfig();
  const targets = [
    ...resolveSupportedChains(deployment).map((row) => ({ chainId: row.chainId, quoteMode: "native" })),
    ...resolveQuoteLaunchOptions().map((row) => ({ chainId: row.chainId, quoteMode: row.mode || "usdc" }))
  ];
  const seenTargets = new Set();
  for (const target of targets) {
    const chainId = parseChainId(target.chainId);
    const quoteMode = normalizeQuoteMode(target.quoteMode);
    const key = `${chainId}:${quoteMode}`;
    if (!chainId || seenTargets.has(key)) continue;
    seenTargets.add(key);
    try {
      const ctx = await getContext(chainId, { verify: false, quoteMode });
      const rows = await readLaunchList(ctx);
      for (const row of rows) {
        const field = launchIdentityMatch(row, wanted);
        if (field) return duplicateLaunchPayload({ ...row, chainId: ctx.chainId, source: "evm" }, field);
      }
    } catch {
      // Keep checking other configured feeds; unavailable chains should not block launch checks.
    }
  }

  return { duplicate: false };
}

async function assertLaunchIdentityAvailable({ name = "", symbol = "" } = {}) {
  const duplicate = await findDuplicateLaunchIdentity({ name, symbol });
  if (!duplicate?.duplicate) return duplicate;
  const existing = duplicate.existing || {};
  const display = existing.symbol ? `$${existing.symbol}` : existing.name || "that token";
  const fieldLabel = duplicate.field === "name" ? "name" : "ticker";
  const error = new Error(`A token with this ${fieldLabel} already exists (${display}). Pick a different token name and ticker.`);
  error.status = 409;
  error.duplicate = duplicate;
  throw error;
}

function normalizePumpFunMintSuffix(value = PUMPFUN_MINT_SUFFIX) {
  const suffix = String(value || "").trim();
  if (!suffix) return "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{1,6}$/.test(suffix)) {
    throw new Error("Pump.fun mint suffix must be 1-6 base58 characters.");
  }
  return suffix;
}

function generatePumpFunMintKeypair(SolanaKeypair) {
  const suffix = normalizePumpFunMintSuffix();
  if (!suffix) {
    return {
      keypair: SolanaKeypair.generate(),
      suffix: "",
      attempts: 1,
      durationMs: 0
    };
  }

  const startedAt = Date.now();
  for (let attempts = 1; attempts <= PUMPFUN_MINT_SUFFIX_MAX_ATTEMPTS; attempts += 1) {
    const keypair = SolanaKeypair.generate();
    const mint = keypair.publicKey.toBase58();
    if (mint.endsWith(suffix)) {
      return {
        keypair,
        suffix,
        attempts,
        durationMs: Date.now() - startedAt
      };
    }
  }

  throw new Error(`Could not find a Pump.fun mint ending in ${suffix} after ${PUMPFUN_MINT_SUFFIX_MAX_ATTEMPTS.toLocaleString()} attempts. Try launching again.`);
}

function pumpFunSigningSecretKey() {
  const seed = String(
    process.env.PUMPFUN_SIGNING_SECRET ||
      process.env.X_CLIENT_SECRET ||
      process.env.PRIVATE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "pump-r-local-pumpfun-signing-secret"
  );
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptPumpFunSigningPayload(payload = {}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", pumpFunSigningSecretKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return base64Url(Buffer.concat([iv, tag, ciphertext]));
}

function decryptPumpFunSigningPayload(token = "") {
  const packed = decodeBase64UrlBuffer(token);
  if (packed.length < 29) throw new Error("Invalid Pump.fun signing token");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", pumpFunSigningSecretKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const payload = JSON.parse(plaintext);
  if (!payload || typeof payload !== "object") throw new Error("Invalid Pump.fun signing token");
  if (Number(payload.expiresAt || 0) < Date.now()) throw new Error("Pump.fun signing token expired. Rebuild the launch transaction.");
  return payload;
}

async function simulateSolanaTransaction(connection, tx, label = "Solana transaction") {
  const wireTransaction = (() => {
    try {
      return tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    } catch {
      return tx.serialize();
    }
  })();
  const encodedTransaction = Buffer.from(wireTransaction).toString("base64");
  const raw = await connection._rpcRequest("simulateTransaction", [
    encodedTransaction,
    {
      encoding: "base64",
      commitment: "confirmed",
      sigVerify: false,
      replaceRecentBlockhash: false
    }
  ]);
  if (raw?.error) {
    throw new Error(`${label} simulation failed: ${raw.error.message || JSON.stringify(raw.error)}`);
  }
  const simulated = raw?.result;
  const err = simulated?.value?.err;
  if (err) {
    throw new Error(`${label} simulation failed: ${JSON.stringify(err)}`);
  }
  return simulated;
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

function sanitizePumpFunMetadataStore(store = {}) {
  const safe = {};
  const rows = store && typeof store === "object" ? store : {};
  for (const [rawId, row] of Object.entries(rows)) {
    const id = String(rawId || "").replace(/[^a-f0-9]/gi, "").slice(0, 40);
    if (!id || !row || typeof row !== "object") continue;
    safe[id] = {
      name: String(row.name || "").slice(0, 32),
      symbol: String(row.symbol || "").slice(0, 13),
      description: String(row.description || "").slice(0, 4000),
      image: String(row.image || ""),
      showName: row.showName !== false,
      createdAt: Number(row.createdAt || Date.now())
    };
  }
  return safe;
}

async function readPumpFunMetadataRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_METADATA_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_METADATA_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase Pump.fun metadata read failed: ${response.status}`);
  return sanitizePumpFunMetadataStore(await response.json().catch(() => ({})));
}

async function writePumpFunMetadataRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_METADATA_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_METADATA_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizePumpFunMetadataStore(store), null, 2)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase Pump.fun metadata write failed: ${response.status} ${text}`.trim());
  }
  return true;
}

async function readPumpFunMetadataPersistent(options = {}) {
  let store = sanitizePumpFunMetadataStore(readPumpFunMetadataDb());
  if (isSupabaseStorageConfigured() && (options.refresh || !Object.keys(store).length)) {
    try {
      const remote = await readPumpFunMetadataRemote();
      if (remote) {
        store = remote;
        writePumpFunMetadataDb(store);
      }
    } catch (error) {
      console.warn(`Supabase Pump.fun metadata read failed: ${error?.message || "connection error"}`);
    }
  }
  return store;
}

async function writePumpFunMetadataPersistent(store) {
  const safe = sanitizePumpFunMetadataStore(store);
  writePumpFunMetadataDb(safe);
  if (isSupabaseStorageConfigured()) await writePumpFunMetadataRemote(safe);
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
    } catch (error) {
      console.warn(`Supabase Pump.fun metadata object upload failed: ${error?.message || "connection error"}`);
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

  const store = await readPumpFunMetadataPersistent();
  store[id] = { ...clean, createdAt: Date.now() };
  try {
    await writePumpFunMetadataPersistent(store);
  } catch (error) {
    console.warn(`Supabase Pump.fun metadata fallback write failed: ${error?.message || "connection error"}`);
    if (STRICT_UPLOAD_STORE && !IS_VERCEL_RUNTIME) throw new Error("Pump.fun metadata storage failed");
    writePumpFunMetadataDb(store);
  }
  const base = getPublicBaseUrl(req);
  return `${base}/api/pumpfun/metadata/${id}`;
}

app.get("/api/pumpfun/metadata/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").replace(/[^a-f0-9]/gi, "");
    const store = await readPumpFunMetadataPersistent({ refresh: true });
    const row = id ? store[id] : null;
    if (!row) return res.status(404).json({ error: "Metadata not found" });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message || "Metadata unavailable" });
  }
});

app.get("/api/pumpfun/coin/:mint", async (req, res) => {
  try {
    const mint = normalizeSolanaAddress(req.params.mint || "");
    if (!mint) return res.status(400).json({ error: "Invalid Pump.fun mint" });
    const snapshot = await readPumpFunCoinSnapshot(mint);
    if (!snapshot) return res.status(404).json({ error: "Pump.fun coin market data is not indexed yet" });
    res.json({
      mint,
      token: mint,
      tokenAddress: mint,
      chainId: "pumpfun",
      source: "pumpfun",
      pumpfunUrl: snapshot.pumpfunUrl || pickPumpFunUrl({}, mint),
      ...snapshot
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load Pump.fun coin market data" });
  }
});

function normalizeSolanaAddressText(value = "") {
  return String(value || "").trim().replace(/[^1-9A-HJ-NP-Za-km-z]/g, "").slice(0, 80);
}

function decodePumpFunAuthAddressFromToken(token = "") {
  const text = String(token || "").trim();
  if (!text || !text.includes(".")) return "";
  try {
    const payload = text.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), "=");
    const json = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return normalizeSolanaAddressText(json?.address || "");
  } catch {
    return "";
  }
}

function decodePumpFunAuthAddressFromCookie(cookie = "") {
  const token = String(cookie || "").match(/(?:^|;\s*)auth_token=([^;]+)/)?.[1] || "";
  return decodePumpFunAuthAddressFromToken(token);
}

function pumpFunSessionAddressFromEnv() {
  return decodePumpFunAuthAddressFromToken(process.env.PUMPFUN_API_BEARER || process.env.PUMPFUN_BEARER_TOKEN || "") ||
    decodePumpFunAuthAddressFromCookie(process.env.PUMPFUN_SESSION_COOKIE || "");
}

function normalizePumpFunSessionInput(row = {}) {
  const owner = normalizeSolanaAddressText(row.owner || row.address || row.wallet || "");
  const cookie = String(row.cookie || row.sessionCookie || "").trim().slice(0, 12000);
  const bearer = String(row.bearer || row.authToken || "").trim().replace(/^Bearer\s+/i, "").slice(0, 4000);
  const decodedAddress = decodePumpFunAuthAddressFromToken(bearer) || decodePumpFunAuthAddressFromCookie(cookie);
  const sessionAddress = normalizeSolanaAddressText(row.sessionAddress || decodedAddress || owner);
  if (!owner || (!cookie && !bearer) || !sessionAddress || owner !== sessionAddress) return null;
  return {
    owner,
    sessionAddress,
    cookie,
    bearer,
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000)),
    updatedAt: Number(row.updatedAt || Math.floor(Date.now() / 1000))
  };
}

function emptyPumpFunSessionsStore() {
  return { sessions: [] };
}

function sanitizePumpFunSessionsStore(store = {}) {
  const rows = Array.isArray(store.sessions) ? store.sessions : [];
  const byOwner = new Map();
  for (const row of rows) {
    const safe = normalizePumpFunSessionInput(row);
    if (safe) byOwner.set(safe.owner, safe);
  }
  return { sessions: Array.from(byOwner.values()) };
}

function readPumpFunSessionsDb() {
  try {
    if (fs.existsSync(PUMPFUN_SESSIONS_DB_PATH)) {
      return sanitizePumpFunSessionsStore(JSON.parse(fs.readFileSync(PUMPFUN_SESSIONS_DB_PATH, "utf8") || "{}"));
    }
  } catch {
    // fall through
  }
  return emptyPumpFunSessionsStore();
}

function writePumpFunSessionsDb(store) {
  const safe = sanitizePumpFunSessionsStore(store);
  fs.mkdirSync(path.dirname(PUMPFUN_SESSIONS_DB_PATH), { recursive: true });
  fs.writeFileSync(PUMPFUN_SESSIONS_DB_PATH, JSON.stringify(safe, null, 2));
  return safe;
}

async function readPumpFunSessionsDbRemote() {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_SESSIONS_OBJECT) return null;
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_SESSIONS_OBJECT), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase Pump.fun sessions read failed: ${response.status}`);
  return sanitizePumpFunSessionsStore(await response.json().catch(() => emptyPumpFunSessionsStore()));
}

async function writePumpFunSessionsDbRemote(store) {
  if (!isSupabaseStorageConfigured() || !SUPABASE_PUMPFUN_SESSIONS_OBJECT) return false;
  await ensureSupabaseStorageBucket();
  const response = await fetch(getSupabaseStorageUploadUrl(SUPABASE_PUMPFUN_SESSIONS_OBJECT), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json; charset=utf-8",
      "x-upsert": "true"
    },
    body: JSON.stringify(sanitizePumpFunSessionsStore(store), null, 2)
  });
  if (!response.ok) throw new Error(`Supabase Pump.fun sessions write failed: ${response.status}`);
  return true;
}

async function readPumpFunSessionsPersistent(options = {}) {
  if (isSupabaseStorageConfigured() && options.refresh) {
    const remote = await readPumpFunSessionsDbRemote().catch(() => null);
    if (remote) writePumpFunSessionsDb(remote);
  }
  return sanitizePumpFunSessionsStore(readPumpFunSessionsDb());
}

async function writePumpFunSessionsPersistent(store) {
  assertJsonStoreConfigured("Pump.fun sessions", SUPABASE_PUMPFUN_SESSIONS_OBJECT);
  const safe = writePumpFunSessionsDb(store);
  if (isSupabaseStorageConfigured()) await writePumpFunSessionsDbRemote(safe);
  return safe;
}

function publicPumpFunSession(row = null) {
  if (!row) return { configured: false };
  return {
    configured: true,
    owner: row.owner,
    sessionAddress: row.sessionAddress,
    hasCookie: Boolean(row.cookie),
    hasBearer: Boolean(row.bearer),
    updatedAt: row.updatedAt
  };
}

async function findPumpFunSessionForOwner(owner = "") {
  const key = normalizeSolanaAddressText(owner);
  if (!key) return null;
  const store = await readPumpFunSessionsPersistent({ refresh: IS_VERCEL_RUNTIME });
  return (store.sessions || []).find((row) => row.owner === key) || null;
}

function pumpFunSubmitAuthHeaders(options = {}) {
  const session = options.session || null;
  const cookie = String(session?.cookie || process.env.PUMPFUN_SESSION_COOKIE || "").trim();
  const bearer = String(session?.bearer || process.env.PUMPFUN_API_BEARER || process.env.PUMPFUN_BEARER_TOKEN || "").trim();
  if (!cookie && !bearer) {
    throw new Error("Add a Pump.fun session for this Phantom wallet before auto-submitting work");
  }
  const referer = String(options.referer || "https://pump.fun/go").trim();
  const userAgent = String(
    process.env.PUMPFUN_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
  ).trim();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://pump.fun",
    Referer: referer,
    "User-Agent": userAgent
  };
  if (cookie) headers.Cookie = cookie;
  if (bearer) headers.Authorization = bearer.toLowerCase().startsWith("bearer ") ? bearer : `Bearer ${bearer}`;
  return headers;
}

app.get("/api/pumpfun/session/:owner", async (req, res) => {
  try {
    const owner = normalizeSolanaAddressText(req.params.owner || "");
    if (!owner) return res.status(400).json({ error: "Connect Phantom first" });
    const session = await findPumpFunSessionForOwner(owner);
    res.json(publicPumpFunSession(session));
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to load Pump.fun session" });
  }
});

app.post("/api/pumpfun/session", async (req, res) => {
  try {
    const owner = normalizeSolanaAddressText(req.body?.owner || req.body?.address || "");
    const cookie = String(req.body?.cookie || "").trim();
    const bearer = String(req.body?.bearer || req.body?.authToken || "").trim();
    const sessionAddress = decodePumpFunAuthAddressFromToken(bearer) || decodePumpFunAuthAddressFromCookie(cookie);
    if (!owner) return res.status(400).json({ error: "Connect Phantom before saving Pump.fun session" });
    if (!cookie && !bearer) return res.status(400).json({ error: "Paste your Pump.fun auth_token or full Cookie header" });
    if (!sessionAddress) return res.status(400).json({ error: "Could not read a wallet address from this Pump.fun session. Include auth_token." });
    if (sessionAddress !== owner) {
      return res.status(400).json({ error: `This Pump.fun session belongs to ${sessionAddress.slice(0, 6)}...${sessionAddress.slice(-4)}, but Phantom is ${owner.slice(0, 6)}...${owner.slice(-4)}.` });
    }
    const store = await readPumpFunSessionsPersistent({ refresh: IS_VERCEL_RUNTIME });
    const next = sanitizePumpFunSessionsStore({
      sessions: [
        ...(store.sessions || []).filter((row) => row.owner !== owner),
        { owner, sessionAddress, cookie, bearer: bearer.replace(/^Bearer\s+/i, ""), updatedAt: Math.floor(Date.now() / 1000) }
      ]
    });
    await writePumpFunSessionsPersistent(next);
    res.json(publicPumpFunSession(next.sessions.find((row) => row.owner === owner)));
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to save Pump.fun session" });
  }
});

app.delete("/api/pumpfun/session/:owner", async (req, res) => {
  try {
    const owner = normalizeSolanaAddressText(req.params.owner || "");
    const store = await readPumpFunSessionsPersistent({ refresh: IS_VERCEL_RUNTIME });
    const next = sanitizePumpFunSessionsStore({ sessions: (store.sessions || []).filter((row) => row.owner !== owner) });
    await writePumpFunSessionsPersistent(next);
    res.json({ configured: false });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to remove Pump.fun session" });
  }
});
async function pumpFunLivestreamRequest(pathname, options = {}) {
  const base = String(process.env.PUMPFUN_LIVESTREAM_API_URL || "https://livestream-api.pump.fun").replace(/\/+$/, "");
  const target = `${base}/${String(pathname || "").replace(/^\/+/, "")}`;
  const response = await withTimeout(
    fetch(target, {
      method: options.method || "GET",
      headers: pumpFunSubmitAuthHeaders(options),
      body: options.body ? JSON.stringify(options.body) : undefined
    }),
    20_000,
    "Pump.fun submit API"
  );
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const message = payload?.error || payload?.message || payload?.reason || `Pump.fun returned ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    error.target = target;
    throw error;
  }
  return payload;
}

function encodeAnchorString(value = "") {
  const bytes = Buffer.from(String(value || ""), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function derivePumpFunSubmissionCommitment(publicKey, submissionId = "") {
  return crypto
    .createHash("sha256")
    .update(Buffer.from("pump.fun:bounty:submission", "utf8"))
    .update(publicKey.toBuffer())
    .update(Buffer.from(String(submissionId || ""), "utf8"))
    .digest();
}

function bnLe8(value) {
  const BN = require("bn.js");
  return new BN(String(value || "0")).toArrayLike(Buffer, "le", 8);
}

async function buildPumpFunSubmissionFeeTransaction({ bounty, submissionId, userPublicKey }) {
  const { Connection: SolanaConnection, PublicKey: SolanaPublicKey, Transaction: SolanaTransaction } = await loadSolanaWeb3();
  const { TransactionInstruction, SystemProgram } = require("@solana/web3.js");
  const programId = new SolanaPublicKey(String(bounty?.pumpBountiesProgramId || "").trim());
  const payerText = normalizeSolanaAddressText(userPublicKey || "");
  const session = await findPumpFunSessionForOwner(payerText);
  if (!session) throw new Error("Add a Pump.fun session for this Phantom wallet before paying the submission fee");
  const payer = new SolanaPublicKey(payerText);
  const bountyId = String(bounty?.onChainBountyId || "").trim();
  const submissionIdText = sanitizeGoText(submissionId || "", 120);
  if (!bountyId) throw new Error("Pump.fun bounty is missing on-chain bounty id");
  if (!submissionIdText) throw new Error("Pump.fun submission id is missing");

  const [configPda] = SolanaPublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const [bountyPda] = SolanaPublicKey.findProgramAddressSync([Buffer.from("bounty"), bnLe8(bountyId)], programId);
  const submissionCommitment = derivePumpFunSubmissionCommitment(payer, submissionIdText);
  const [submissionFeeReceiptPda] = SolanaPublicKey.findProgramAddressSync(
    [Buffer.from("submission_fee"), bountyPda.toBuffer(), submissionCommitment],
    programId
  );
  const data = Buffer.concat([
    Buffer.from([12, 2, 71, 23, 233, 0, 253, 120]),
    submissionCommitment,
    encodeAnchorString(submissionIdText)
  ]);
  const rpcState = await withPumpFunSolanaRpc(
    SolanaConnection,
    "Pump.fun bounty fee prep",
    async (connection, rpcUrl) => {
      const [configAccount, latest, existingReceipt] = await Promise.all([
        connection.getAccountInfo(configPda, "confirmed"),
        connection.getLatestBlockhash("confirmed"),
        connection.getAccountInfo(submissionFeeReceiptPda, "confirmed").catch(() => null)
      ]);
      return { connection, rpcUrl, configAccount, latest, existingReceipt };
    },
    { retryAll: true }
  );
  const { rpcUrl, configAccount, latest, existingReceipt } = rpcState;
  let submissionFeeVaultText = "";
  if (!configAccount?.data || configAccount.data.length < 201) {
    throw new Error("Pump.fun bounty config account is unavailable from the configured Solana RPC");
  }
  // Pump.fun's config has a one-byte field before submission_fee_vault.
  // Reading at 8 + 32 * 5 is one byte early and triggers Anchor ConstraintAddress.
  submissionFeeVaultText = new SolanaPublicKey(configAccount.data.slice(169, 201)).toBase58();
  const submissionFeeVault = new SolanaPublicKey(submissionFeeVaultText);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: submissionFeeVault, isSigner: false, isWritable: true },
      { pubkey: bountyPda, isSigner: false, isWritable: true },
      { pubkey: submissionFeeReceiptPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data
  });
  const tx = new SolanaTransaction({ feePayer: payer, recentBlockhash: latest.blockhash }).add(instruction);
  return {
    existingReceipt: Boolean(existingReceipt),
    pumpFunSessionAddress: session.sessionAddress,
    payerAddress: payer.toBase58(),
    resumeSignature: "pumpfun:bounties:submission_publish_fee_receipt_resume:v1",
    transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    rpcUrl,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
    submissionCommitmentHex: submissionCommitment.toString("hex"),
    submissionFeeLamports: String(bounty?.chainConfigSnapshot?.submissionFeeLamports || "0"),
    bountyPda: bountyPda.toBase58(),
    submissionFeeReceiptPda: submissionFeeReceiptPda.toBase58()
  };
}

app.post("/api/pumpfun/bounty-submission/draft", async (req, res) => {
  try {
    const bountyId = normalizeGoId(req.body?.bountyId || "", "go");
    const { bounty } = await loadGoBountyForAgent(bountyId);
    if (!bounty?.id || !String(bounty.source || "").toLowerCase().includes("pump.fun")) {
      throw new Error("Open a synced Pump.fun bounty first");
    }
    const taskId = sanitizeGoText(bounty.externalId || req.body?.taskId || "", 120);
    if (!taskId) throw new Error("Pump.fun task id is missing");
    const bodyMarkdown = sanitizeAgentDraftText(req.body?.bodyMarkdown || req.body?.body || "", 6000);
    if (bodyMarkdown.length < 10) throw new Error("Add a submission body before sending to Pump.fun");
    const session = await findPumpFunSessionForOwner(req.body?.owner || req.body?.userPublicKey || "");
    if (!session) throw new Error("Add a Pump.fun session for this Phantom wallet before auto-submitting work");
    const evidence = await uploadPumpFunEvidenceAttachments(session, req.body?.attachments);
    const attachments = evidence.attachments;

    const links = [
      ...(Array.isArray(req.body?.links) ? req.body.links : []),
      ...evidence.links
    ]
      .map(sanitizeGoUrl)
      .filter(Boolean)
      .slice(0, 8);
    const payload = await pumpFunLivestreamRequest(`bounties/tasks/${encodeURIComponent(taskId)}/submissions`, {
      session,
      method: "POST",
      body: { bodyMarkdown, links, attachments }
    });
    res.json({
      ok: true,
      payload,
      bounty,
      taskId,
      attachmentCount: attachments.length,
      attachmentUrls: attachments.map((attachment) => attachment.url).filter(Boolean),
      submissionId: payload?.submissionId || payload?.submission?.submissionId || ""
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to create Pump.fun submission draft" });
  }
});

app.post("/api/pumpfun/bounty-submission/fee-transaction", async (req, res) => {
  try {
    const bountyId = normalizeGoId(req.body?.bountyId || "", "go");
    const { bounty } = await loadGoBountyForAgent(bountyId);
    if (!bounty?.id || !String(bounty.source || "").toLowerCase().includes("pump.fun")) {
      throw new Error("Open a synced Pump.fun bounty first");
    }
    if (!bounty.onChainBountyId || !bounty.pumpBountiesProgramId) {
      throw new Error("Pump.fun has not exposed on-chain metadata for this bounty yet");
    }
    const built = await buildPumpFunSubmissionFeeTransaction({
      bounty,
      submissionId: req.body?.submissionId,
      userPublicKey: req.body?.userPublicKey
    });
    res.json({ ok: true, ...built });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to build Pump.fun submission fee transaction" });
  }
});

app.post("/api/pumpfun/bounty-submission/publish", async (req, res) => {
  try {
    const bountyId = normalizeGoId(req.body?.bountyId || "", "go");
    const { bounty } = await loadGoBountyForAgent(bountyId);
    if (!bounty?.id || !String(bounty.source || "").toLowerCase().includes("pump.fun")) {
      throw new Error("Open a synced Pump.fun bounty first");
    }
    const taskId = sanitizeGoText(bounty.externalId || req.body?.taskId || "", 120);
    const submissionId = sanitizeGoText(req.body?.submissionId || "", 120);
    const signature = sanitizeGoText(req.body?.signature || "", 140);
    if (!taskId) throw new Error("Pump.fun task id is missing");
    if (!submissionId) throw new Error("Pump.fun submission id is missing");
    if (!signature) throw new Error("Pump.fun publish needs the signed submission-fee transaction signature");
    const session = await findPumpFunSessionForOwner(req.body?.owner || req.body?.userPublicKey || "");
    if (!session) throw new Error("Add a Pump.fun session for this Phantom wallet before publishing work");
    const payload = await pumpFunLivestreamRequest(
      `bounties/tasks/${encodeURIComponent(taskId)}/submissions/${encodeURIComponent(submissionId)}/publish`,
      {
        session,
        method: "POST",
        referer: bounty.sourceUrl || `https://pump.fun/go/${encodeURIComponent(taskId)}`,
        body: { signature }
      }
    );
    res.json({ ok: true, payload, bounty, taskId, submissionId, signature });
  } catch (error) {
    console.warn("Pump.fun publish failed", {
      status: error.status || 0,
      message: error.message || "publish failed",
      upstream: error.payload || null
    });
    res.status(Number(error.status || 400)).json({
      error: error.message || "Failed to publish Pump.fun submission",
      upstreamStatus: error.status || 0,
      upstream: error.payload || null
    });
  }
});

app.post("/api/pumpfun/launch", async (req, res) => {
  try {
    const {
      Connection: SolanaConnection,
      Keypair: SolanaKeypair,
      PublicKey: SolanaPublicKey,
      Transaction: SolanaTransaction,
      TransactionMessage: SolanaTransactionMessage,
      VersionedTransaction: SolanaVersionedTransaction
    } = await loadSolanaWeb3();
    const PUMP_MOD = await loadPumpFunSdkModule();
    const PUMP_SDK = PUMP_MOD.PUMP_SDK || PUMP_MOD.default?.PUMP_SDK || PUMP_MOD.default;
    if (!PUMP_SDK?.createV2Instruction) {
      return res.status(500).json({ error: "Pump.fun SDK is not available in this runtime" });
    }

    const name = String(req.body?.name || "").trim().slice(0, 32);
    const symbol = String(req.body?.symbol || "").trim().toUpperCase().slice(0, 13);
    if (!name || !symbol) {
      return res.status(400).json({ error: "name and symbol are required" });
    }
    await assertLaunchIdentityAvailable({ name, symbol });
    const userPublicKey = String(req.body?.userPublicKey || req.body?.creatorWallet || "").trim();
    if (!userPublicKey) {
      return res.status(400).json({ error: "Connect a Solana wallet first" });
    }
    const holderEligibility = await assertOfficialHolderAccess({
      solanaAddress: userPublicKey,
      action: "launch tokens through Pump-r",
      launchMode: "pumpfun",
      targetChainId: 101
    });
    const kolApplication = sanitizeKolApplication(req.body?.kolApplication);

    let user;
    let creator;
    try {
      user = new SolanaPublicKey(userPublicKey);
      creator = new SolanaPublicKey(String(req.body?.creatorWallet || userPublicKey).trim());
    } catch {
      return res.status(400).json({ error: "Invalid Solana wallet public key" });
    }

    const requestedDevBuyLamports = (() => {
      const decimalSol = String(req.body?.starterBuySol || req.body?.devBuySol || "").trim();
      if (decimalSol) return parseSolToLamports(decimalSol);
      try {
        return BigInt(String(req.body?.starterBuy || "0"));
      } catch {
        return 0n;
      }
    })();
    const devBuyLamports = requestedDevBuyLamports > 0n ? requestedDevBuyLamports : 0n;
    const kolBuyLamports = kolApplication?.enabled ? parseSolToLamports(kolApplication.buySol || "0") : 0n;
    const plannedParts = ["create"];
    if (devBuyLamports > 0n) plannedParts.push("dev buy");
    if (kolBuyLamports > 0n) plannedParts.push("Manlet Mode buy");
    await withPumpFunSolanaRpc(
      SolanaConnection,
      "Pump.fun launch balance check",
      async (connection) => {
        await assertSolanaWalletHasLamports(
          connection,
          user,
          PUMPFUN_CREATE_MIN_LAMPORTS + devBuyLamports + kolBuyLamports + PUMPFUN_TX_BUFFER_LAMPORTS,
          `Pump.fun ${plannedParts.join(", ")}`
        );
        return true;
      },
      { retryAll: true }
    );

    const metadataUri = await createPumpFunMetadataUri(req, {
      name,
      symbol,
      description: String(req.body?.description || "").trim(),
      image: String(req.body?.imageUri || "").trim()
    });
    if (!metadataUri || metadataUri.length > 200) {
      return res.status(500).json({ error: "Pump.fun metadata URI is missing or too long" });
    }

    const vanityMint = generatePumpFunMintKeypair(SolanaKeypair);
    const mintKeypair = vanityMint.keypair;
    const requestedLatest = {
      blockhash: String(req.body?.blockhash || "").trim(),
      lastValidBlockHeight: Number(req.body?.lastValidBlockHeight || 0)
    };
    const walletBroadcast = false;
    const transactionFormat = String(req.body?.transactionFormat || "legacy").trim().toLowerCase() === "v0" ? "v0" : "legacy";
    const rpcState = await withPumpFunSolanaRpc(
      SolanaConnection,
      "Pump.fun launch prep",
      async (connection, rpcUrl) => {
        const latest = requestedLatest.blockhash ? requestedLatest : await connection.getLatestBlockhash("confirmed");
        return { connection, rpcUrl, latest };
      },
      { retryAll: false }
    );
    const { connection, rpcUrl, latest } = rpcState;
    const instructions = [await PUMP_SDK.createV2Instruction({
      mint: mintKeypair.publicKey,
      name,
      symbol,
      uri: metadataUri,
      creator,
      user,
      mayhemMode: false,
      cashback: false
    })];
    const tx = transactionFormat === "v0"
      ? new SolanaVersionedTransaction(
          new SolanaTransactionMessage({
            payerKey: user,
            recentBlockhash: latest.blockhash,
            instructions
          }).compileToV0Message(
            await connection
              .getAddressLookupTable(new SolanaPublicKey("Hyif6eWb8x88RVrvjPfabsgRYnwkVnyByEXTVTXbUcyP"))
              .then((row) => row?.value ? [row.value] : [])
              .catch(() => [])
          )
        )
      : new SolanaTransaction({
          feePayer: user,
          recentBlockhash: latest.blockhash
        }).add(...instructions);
    let presignSimulationWarning = "";
    try {
      await simulateSolanaTransaction(connection, tx, "Pump.fun create");
    } catch (error) {
      // Phantom and finalization still perform the signed path; unsigned Pump.fun
      // create simulation can fail before the browser wallet signature exists.
      presignSimulationWarning = error.message || "Unsigned Pump.fun create simulation skipped";
    }
    const mint = mintKeypair.publicKey.toBase58();
    const signingToken = encryptPumpFunSigningPayload({
      mint,
      user: user.toBase58(),
      creator: creator.toBase58(),
      name,
      symbol,
      description: String(req.body?.description || "").trim(),
      imageUri: String(req.body?.imageUri || "").trim(),
      metadataUri,
      mintSuffix: vanityMint.suffix,
      mintSuffixAttempts: vanityMint.attempts,
      mintSuffixDurationMs: vanityMint.durationMs,
      mintSecretKey: Buffer.from(mintKeypair.secretKey).toString("base64"),
      kolApplication,
      rpcUrl,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      transactionVersion: transactionFormat,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    const transactionBase64 = (() => {
      try {
        return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64");
      } catch {
        return Buffer.from(tx.serialize()).toString("base64");
      }
    })();
    res.json({
      ok: true,
      mode: "sdk",
      transactionFormat,
      mint,
      tokenAddress: mint,
      pumpfunUrl: pickPumpFunUrl({}, mint),
      metadataUri,
      mintSuffix: vanityMint.suffix,
      mintSuffixAttempts: vanityMint.attempts,
      mintSuffixDurationMs: vanityMint.durationMs,
      transactionBase64,
      versionedTransaction: transactionFormat === "v0",
      mintPresigned: false,
      signingToken,
      kolApplication,
      holderEligibility,
      devBuyLamports: devBuyLamports.toString(),
      presignSimulationWarning,
      walletBroadcast,
      rpcUrl,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    });
  } catch (error) {
    res.status(Number(error.status || 500)).json({
      error: error.message || "Pump.fun SDK transaction build failed",
      code: error.code || null,
      duplicate: error.duplicate || null,
      balanceLamports: error.balanceLamports || null,
      requiredLamports: error.requiredLamports || null
    });
  }
});

app.post("/api/pumpfun/finalize", async (req, res) => {
  try {
    const {
      Connection: SolanaConnection,
      Keypair: SolanaKeypair,
      PublicKey: SolanaPublicKey,
      Transaction: SolanaTransaction,
      VersionedTransaction: SolanaVersionedTransaction
    } = await loadSolanaWeb3();
    const signedTransactionBase64 = String(req.body?.signedTransactionBase64 || req.body?.transactionBase64 || "").trim();
    const signingToken = String(req.body?.signingToken || "").trim();
    const walletSignature = String(req.body?.signature || "").trim();
    if ((!signedTransactionBase64 && !walletSignature) || !signingToken) {
      return res.status(400).json({ error: "Signed transaction or wallet signature and signing token are required" });
    }

    const pending = decryptPumpFunSigningPayload(signingToken);
    const mintKeypair = SolanaKeypair.fromSecretKey(Uint8Array.from(Buffer.from(String(pending.mintSecretKey || ""), "base64")));
    const user = new SolanaPublicKey(String(pending.user || ""));
    const mint = String(pending.mint || mintKeypair.publicKey.toBase58());
    if (mintKeypair.publicKey.toBase58() !== mint) {
      return res.status(400).json({ error: "Pump.fun mint signer mismatch" });
    }

    const sent = walletSignature
      ? await withPumpFunSolanaRpc(
          SolanaConnection,
          "Pump.fun wallet broadcast confirmation",
          async (connection, rpcUrl) => {
            await connection.confirmTransaction(
              {
                signature: walletSignature,
                blockhash: String(pending.blockhash || ""),
                lastValidBlockHeight: Number(pending.lastValidBlockHeight || 0)
              },
              "confirmed"
            );
            return { signature: walletSignature, rpcUrl };
          },
          { preferredRpcUrl: pending.rpcUrl }
        )
      : await withPumpFunSolanaRpc(
          SolanaConnection,
          "Pump.fun signed create broadcast",
          async (connection, rpcUrl) => {
            const isVersioned = String(pending.transactionVersion || "") === "v0" || req.body?.versionedTransaction;
            const tx = isVersioned
              ? SolanaVersionedTransaction.deserialize(Buffer.from(signedTransactionBase64, "base64"))
              : SolanaTransaction.from(Buffer.from(signedTransactionBase64, "base64"));
            if (isVersioned) {
              const userIndex = tx.message.staticAccountKeys.findIndex((key) => key?.equals?.(user));
              const userSignature = userIndex >= 0 ? tx.signatures[userIndex] : null;
              if (!userSignature || !Buffer.from(userSignature).some(Boolean)) {
                throw new Error("Phantom did not sign the Pump.fun transaction. Reconnect wallet and try again.");
              }
              tx.sign([mintKeypair]);
            } else {
              const userSignature = tx.signatures.find((row) => row.publicKey?.equals?.(user));
              if (!userSignature?.signature) {
                throw new Error("Phantom did not sign the Pump.fun transaction. Reconnect wallet and try again.");
              }
              tx.partialSign(mintKeypair);
            }
            await simulateSolanaTransaction(connection, tx, "Signed Pump.fun create");
            const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
            await connection.confirmTransaction(
              {
                signature,
                blockhash: String(pending.blockhash || ""),
                lastValidBlockHeight: Number(pending.lastValidBlockHeight || 0)
              },
              "confirmed"
            );
            return { signature, rpcUrl };
          },
          { preferredRpcUrl: pending.rpcUrl }
        );
    const { signature, rpcUrl } = sent;

    const launchRow = {
      mint,
      name: pending.name,
      symbol: pending.symbol,
      description: pending.description,
      imageUri: pending.imageUri,
      creator: pending.creator || pending.user,
      kolApplication: pending.kolApplication,
      signature,
      metadataUri: pending.metadataUri,
      createdAt: Math.floor(Date.now() / 1000)
    };
    let recordedLaunch = null;
    let launchRecordWarning = "";
    try {
      recordedLaunch = await recordPumpFunLaunch(launchRow);
    } catch (error) {
      launchRecordWarning = error?.message || "Launch confirmed, but Pump-r could not save the launch record right now.";
      console.warn(`Pump.fun launch confirmed but record write failed: ${launchRecordWarning}`);
      recordedLaunch = normalizePumpFunLaunch(launchRow);
    }

    res.json({
      ok: true,
      recordSaved: !launchRecordWarning,
      recordWarning: launchRecordWarning || null,
      signature,
      mint,
      tokenAddress: mint,
      pumpfunUrl: pickPumpFunUrl({}, mint),
      kolApplication: pending.kolApplication || null,
      launch: recordedLaunch,
      rpcUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Pump.fun transaction finalization failed" });
  }
});

app.post("/api/pumpfun/record-launch", async (req, res) => {
  try {
    const mint = String(req.body?.mint || req.body?.token || req.body?.tokenAddress || "").trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      return res.status(400).json({ error: "Valid Pump.fun mint is required" });
    }
    const signature = String(req.body?.signature || "").trim();
    const snapshot = await readPumpFunCoinSnapshot(mint).catch(() => null);
    if (!snapshot && !signature) {
      return res.status(404).json({ error: "Pump.fun launch is not visible yet. Wait a few seconds and refresh Home." });
    }
    const recordedLaunch = await recordPumpFunLaunch({
      ...(snapshot || {}),
      mint,
      name: req.body?.name || snapshot?.name,
      symbol: req.body?.symbol || snapshot?.symbol,
      description: req.body?.description || snapshot?.description,
      imageUri: req.body?.imageUri || req.body?.image || snapshot?.imageUri,
      creator: req.body?.creator || req.body?.user || snapshot?.creator,
      kolApplication: req.body?.kolApplication || snapshot?.kolApplication,
      signature: signature || snapshot?.signature,
      metadataUri: req.body?.metadataUri || snapshot?.metadataUri,
      pumpfunUrl: req.body?.pumpfunUrl || snapshot?.pumpfunUrl,
      createdAt: req.body?.createdAt || Math.floor(Date.now() / 1000)
    });
    if (!recordedLaunch) return res.status(400).json({ error: "Pump.fun launch record could not be normalized" });
    res.json({ ok: true, launch: recordedLaunch });
  } catch (error) {
    res.status(Number(error.status || 500)).json({ error: error.message || "Unable to record Pump.fun launch" });
  }
});

app.post("/api/pumpfun/kol-buy", async (req, res) => {
  try {
    const { Connection: SolanaConnection, PublicKey: SolanaPublicKey, Transaction: SolanaTransaction } = await loadSolanaWeb3();
    const PUMP_MOD = await loadPumpFunSdkModule();
    const PUMP_SDK = PUMP_MOD.PUMP_SDK || PUMP_MOD.default?.PUMP_SDK || PUMP_MOD.default;
    if (!PUMP_SDK?.buyInstruction || !PUMP_MOD?.getBuyTokenAmountFromSolAmount || !PUMP_MOD?.GLOBAL_PDA) {
      return res.status(500).json({ error: "Pump.fun buy instruction support is not available in this runtime" });
    }
    const splToken = require("@solana/spl-token");
    const BN = require("bn.js");
    const mint = new SolanaPublicKey(String(req.body?.mint || req.body?.tokenAddress || "").trim());
    const user = new SolanaPublicKey(String(req.body?.userPublicKey || "").trim());
    const creator = new SolanaPublicKey(String(req.body?.creatorWallet || req.body?.userPublicKey || "").trim());
    const kolApplication = sanitizeKolApplication(req.body?.kolApplication);
    if (!kolApplication?.enabled || Number(kolApplication.buySol || 0) <= 0) {
      return res.status(400).json({ error: "Manlet Mode buy is not enabled" });
    }
    const kolWallet = new SolanaPublicKey(kolApplication.wallet);
    const rpcState = await withPumpFunSolanaRpc(
      SolanaConnection,
      "Manlet Mode buy prep",
      async (connection, rpcUrl) => {
        await assertSolanaWalletHasLamports(
          connection,
          user,
          parseSolToLamports(kolApplication.buySol || "0") + PUMPFUN_TX_BUFFER_LAMPORTS,
          "Manlet Mode buy"
        );
        const [latest, globalInfo, feeConfigInfo] = await Promise.all([
          connection.getLatestBlockhash("confirmed"),
          connection.getAccountInfo(PUMP_MOD.GLOBAL_PDA, "confirmed"),
          PUMP_MOD.PUMP_FEE_CONFIG_PDA ? connection.getAccountInfo(PUMP_MOD.PUMP_FEE_CONFIG_PDA, "confirmed") : Promise.resolve(null)
        ]);
        if (!globalInfo) throw new Error("Pump.fun global account is unavailable from this Solana RPC");
        return { connection, rpcUrl, latest, globalInfo, feeConfigInfo };
      },
      { retryAll: true }
    );
    const { rpcUrl, latest, globalInfo, feeConfigInfo } = rpcState;
    if (!globalInfo) {
      return res.status(500).json({ error: "Pump.fun global account is unavailable from the configured Solana RPC" });
    }
    const global = PUMP_SDK.decodeGlobal(globalInfo);
    const feeConfig = feeConfigInfo && PUMP_SDK.decodeFeeConfig ? PUMP_SDK.decodeFeeConfig(feeConfigInfo) : null;
    const solAmount = new BN(Math.max(1, Math.floor(Number(kolApplication.buySol || 0) * 1_000_000_000)));
    const amount = PUMP_MOD.getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: SolanaPublicKey.default
    });
    if (!amount || amount.lte(new BN(0))) {
      return res.status(400).json({ error: "Manlet Mode buy amount is too small for the Pump.fun quote" });
    }
    const tokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
    const userTokenAccount = splToken.getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
    const kolTokenAccount = splToken.getAssociatedTokenAddressSync(mint, kolWallet, true, tokenProgram);
    const instructions = [
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        user,
        userTokenAccount,
        user,
        mint,
        tokenProgram
      ),
      await PUMP_SDK.buyInstruction({
        global,
        mint,
        creator,
        user,
        associatedUser: userTokenAccount,
        amount,
        solAmount,
        slippage: 1,
        tokenProgram,
        mayhemMode: false
      })
    ];
    const tx = new SolanaTransaction({ feePayer: user, recentBlockhash: latest.blockhash }).add(...instructions);
    res.json({
      ok: true,
      transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      kolApplication: {
        ...kolApplication,
        kolBuy: {
          wallet: kolApplication.wallet,
          tokenAccount: userTokenAccount.toBase58(),
          userTokenAccount: userTokenAccount.toBase58(),
          kolTokenAccount: kolTokenAccount.toBase58(),
          buySol: Number(kolApplication.buySol || 0),
          tokenAmount: amount.toString(),
          tokenProgram: tokenProgram.toBase58(),
          recipientMode: "user_wallet_pending_transfer",
          estimatedSupplyPct: Number(global?.tokenTotalSupply?.toString?.() || 0) > 0
            ? (Number(amount.toString()) / Number(global.tokenTotalSupply.toString())) * 100
            : Number(kolApplication.estimatedSupplyPct || 0)
        }
      },
      rpcUrl,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    });
  } catch (error) {
    res.status(Number(error.status || 500)).json({
      error: error.message || "Unable to build Manlet Mode buy transaction",
      code: error.code || null,
      balanceLamports: error.balanceLamports || null,
      requiredLamports: error.requiredLamports || null
    });
  }
});

app.post("/api/pumpfun/dev-buy", async (req, res) => {
  try {
    const { Connection: SolanaConnection, PublicKey: SolanaPublicKey, Transaction: SolanaTransaction } = await loadSolanaWeb3();
    const PUMP_MOD = await loadPumpFunSdkModule();
    const PUMP_SDK = PUMP_MOD.PUMP_SDK || PUMP_MOD.default?.PUMP_SDK || PUMP_MOD.default;
    if (!PUMP_SDK?.buyInstruction || !PUMP_MOD?.getBuyTokenAmountFromSolAmount || !PUMP_MOD?.GLOBAL_PDA) {
      return res.status(500).json({ error: "Pump.fun buy instruction support is not available in this runtime" });
    }
    const splToken = require("@solana/spl-token");
    const BN = require("bn.js");
    const mint = new SolanaPublicKey(String(req.body?.mint || req.body?.tokenAddress || "").trim());
    const user = new SolanaPublicKey(String(req.body?.userPublicKey || "").trim());
    const creator = new SolanaPublicKey(String(req.body?.creatorWallet || req.body?.userPublicKey || "").trim());
    const buySol = Math.max(0, Math.min(toNumberSafe(req.body?.buySol || req.body?.starterBuySol, 0), 100));
    if (!Number.isFinite(buySol) || buySol <= 0) {
      return res.status(400).json({ error: "Dev buy amount must be greater than 0 SOL" });
    }
    const rpcState = await withPumpFunSolanaRpc(
      SolanaConnection,
      "Pump.fun dev buy prep",
      async (connection, rpcUrl) => {
        await assertSolanaWalletHasLamports(
          connection,
          user,
          parseSolToLamports(buySol) + PUMPFUN_TX_BUFFER_LAMPORTS,
          "Pump.fun dev buy"
        );
        const [latest, globalInfo, feeConfigInfo] = await Promise.all([
          connection.getLatestBlockhash("confirmed"),
          connection.getAccountInfo(PUMP_MOD.GLOBAL_PDA, "confirmed"),
          PUMP_MOD.PUMP_FEE_CONFIG_PDA ? connection.getAccountInfo(PUMP_MOD.PUMP_FEE_CONFIG_PDA, "confirmed") : Promise.resolve(null)
        ]);
        if (!globalInfo) throw new Error("Pump.fun global account is unavailable from this Solana RPC");
        return { connection, rpcUrl, latest, globalInfo, feeConfigInfo };
      },
      { retryAll: true }
    );
    const { rpcUrl, latest, globalInfo, feeConfigInfo } = rpcState;
    const global = PUMP_SDK.decodeGlobal(globalInfo);
    const feeConfig = feeConfigInfo && PUMP_SDK.decodeFeeConfig ? PUMP_SDK.decodeFeeConfig(feeConfigInfo) : null;
    const solAmount = new BN(Math.max(1, Math.floor(buySol * 1_000_000_000)));
    const amount = PUMP_MOD.getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
      quoteMint: SolanaPublicKey.default
    });
    if (!amount || amount.lte(new BN(0))) {
      return res.status(400).json({ error: "Dev buy amount is too small for the Pump.fun quote" });
    }
    const tokenProgram = splToken.TOKEN_2022_PROGRAM_ID;
    const userTokenAccount = splToken.getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
    const instructions = [
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        user,
        userTokenAccount,
        user,
        mint,
        tokenProgram
      ),
      await PUMP_SDK.buyInstruction({
        global,
        mint,
        creator,
        user,
        associatedUser: userTokenAccount,
        amount,
        solAmount,
        slippage: 1,
        tokenProgram,
        mayhemMode: false
      })
    ];
    const tx = new SolanaTransaction({ feePayer: user, recentBlockhash: latest.blockhash }).add(...instructions);
    res.json({
      ok: true,
      transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      buySol,
      tokenAmount: amount.toString(),
      tokenAccount: userTokenAccount.toBase58(),
      rpcUrl,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    });
  } catch (error) {
    res.status(Number(error.status || 500)).json({
      error: error.message || "Unable to build Pump.fun dev buy transaction",
      code: error.code || null,
      balanceLamports: error.balanceLamports || null,
      requiredLamports: error.requiredLamports || null
    });
  }
});

function pickSplTokenProgramFromMintInfo(mintInfo, splToken) {
  const owner = mintInfo?.owner?.toBase58?.() || "";
  if (owner === splToken.TOKEN_PROGRAM_ID.toBase58()) return splToken.TOKEN_PROGRAM_ID;
  if (owner === splToken.TOKEN_2022_PROGRAM_ID.toBase58()) return splToken.TOKEN_2022_PROGRAM_ID;
  return splToken.TOKEN_2022_PROGRAM_ID;
}

async function waitForSolanaTokenAmount(connection, tokenAccount, options = {}) {
  const attempts = Math.max(1, Math.min(Number(options.attempts || 12), 30));
  const delayMs = Math.max(250, Math.min(Number(options.delayMs || 1250), 5000));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const balance = await connection.getTokenAccountBalance(tokenAccount, "confirmed");
      const amount = BigInt(String(balance?.value?.amount || "0"));
      if (amount > 0n || attempt === attempts - 1) return amount;
    } catch (error) {
      if (attempt === attempts - 1) return 0n;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return 0n;
}

app.post("/api/pumpfun/kol-transfer", async (req, res) => {
  try {
    const { Connection: SolanaConnection, PublicKey: SolanaPublicKey, Transaction: SolanaTransaction } = await loadSolanaWeb3();
    const splToken = require("@solana/spl-token");
    const mint = new SolanaPublicKey(String(req.body?.mint || req.body?.tokenAddress || "").trim());
    const user = new SolanaPublicKey(String(req.body?.userPublicKey || "").trim());
    const kolApplication = sanitizeKolApplication(req.body?.kolApplication);
    if (!kolApplication?.enabled) return res.status(400).json({ error: "Manlet Mode transfer is not enabled" });
    const kolWallet = new SolanaPublicKey(kolApplication.wallet);
    const tokenAmountRaw = String(req.body?.tokenAmount || kolApplication?.kolBuy?.tokenAmount || "").replace(/[^0-9]/g, "");
    const tokenAmount = BigInt(tokenAmountRaw || "0");
    if (tokenAmount <= 0n) return res.status(400).json({ error: "Manlet Mode amount is missing" });

    const rpcState = await withPumpFunSolanaRpc(
      SolanaConnection,
      "Manlet Mode transfer prep",
      async (connection, rpcUrl) => {
        await assertSolanaWalletHasLamports(
          connection,
          user,
          PUMPFUN_TRANSFER_BUFFER_LAMPORTS,
          "Manlet Mode transfer"
        );
        const [latest, mintInfo] = await Promise.all([
          connection.getLatestBlockhash("confirmed"),
          connection.getAccountInfo(mint, "confirmed")
        ]);
        return { connection, rpcUrl, latest, mintInfo };
      },
      { retryAll: true }
    );
    const { connection, rpcUrl, latest, mintInfo } = rpcState;
    const tokenProgram = pickSplTokenProgramFromMintInfo(mintInfo, splToken);
    const userTokenAccount = splToken.getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
    const kolTokenAccount = splToken.getAssociatedTokenAddressSync(mint, kolWallet, true, tokenProgram);
    const currentBalance = await waitForSolanaTokenAmount(connection, userTokenAccount);
    const transferAmount = currentBalance > 0n && currentBalance < tokenAmount ? currentBalance : tokenAmount;
    if (transferAmount <= 0n) {
      return res.status(400).json({ error: "No bought tokens are available in your wallet yet. Wait a few seconds and try the transfer again." });
    }
    const instructions = [
      splToken.createAssociatedTokenAccountIdempotentInstruction(
        user,
        kolTokenAccount,
        kolWallet,
        mint,
        tokenProgram
      ),
      splToken.createTransferInstruction(
        userTokenAccount,
        kolTokenAccount,
        user,
        transferAmount,
        [],
        tokenProgram
      )
    ];
    const tx = new SolanaTransaction({ feePayer: user, recentBlockhash: latest.blockhash }).add(...instructions);
    res.json({
      ok: true,
      transactionBase64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      kolApplication: {
        ...kolApplication,
        kolBuy: {
          ...(kolApplication.kolBuy || {}),
          wallet: kolApplication.wallet,
          tokenAmount: transferAmount.toString(),
          requestedTokenAmount: tokenAmount.toString(),
          walletTokenBalanceBeforeTransfer: currentBalance.toString(),
          tokenProgram: tokenProgram.toBase58(),
          recipientMode: "kol_wallet"
        }
      },
      rpcUrl,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    });
  } catch (error) {
    res.status(Number(error.status || 500)).json({
      error: error.message || "Unable to build token transfer transaction",
      code: error.code || null,
      balanceLamports: error.balanceLamports || null,
      requiredLamports: error.requiredLamports || null
    });
  }
});

app.post("/api/solana/send-transaction", async (req, res) => {
  try {
    const { Connection: SolanaConnection, Transaction: SolanaTransaction } = await loadSolanaWeb3();
    const signedTransactionBase64 = String(req.body?.signedTransactionBase64 || req.body?.transactionBase64 || "").trim();
    if (!signedTransactionBase64) return res.status(400).json({ error: "Signed transaction is required" });
    const tx = SolanaTransaction.from(Buffer.from(signedTransactionBase64, "base64"));
    const sent = await withPumpFunSolanaRpc(
      SolanaConnection,
      "Signed Solana transaction broadcast",
      async (connection, rpcUrl) => {
        await simulateSolanaTransaction(connection, tx, "Signed Solana transaction");
        const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        if (req.body?.blockhash && Number(req.body?.lastValidBlockHeight || 0) > 0) {
          await connection.confirmTransaction(
            {
              signature,
              blockhash: String(req.body.blockhash),
              lastValidBlockHeight: Number(req.body.lastValidBlockHeight)
            },
            "confirmed"
          );
        } else {
          await connection.confirmTransaction(signature, "confirmed");
        }
        return { signature, rpcUrl };
      },
      { preferredRpcUrl: req.body?.rpcUrl }
    );
    const { signature, rpcUrl } = sent;
    res.json({ ok: true, signature, rpcUrl });
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to broadcast Solana transaction" });
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
    const allocationsRaw = holders.map((row) => {
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
    const allocations = annotateLongTermAirdropHolders(launch.token, allocationsRaw);

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
      longTermPolicy: "Top holders who keep holding over time are prioritized for the airdrop.",
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

function referralBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "pump-r.fun";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function publicReferralPayload(req, store, profile, options = {}) {
  const wallet = normalizeSupportAddress(profile?.wallet || "");
  const referrals = (store.referrals || []).filter((row) => row.referrerKey === referralWalletKey(wallet));
  const stats = referralStatsForWallet(store, wallet);
  const base = referralBaseUrl(req);
  const name = profile?.name || "";
  return {
    profile,
    link: name ? `${base}/r/${encodeURIComponent(name)}` : "",
    queryLink: name ? `${base}/?ref=${encodeURIComponent(name)}` : "",
    stats,
    referrals: referrals.map(publicReferralRow),
    leaderboard: publicReferralLeaderboard(store).slice(0, 20),
    updatedAt: store.updatedAt || 0,
    refreshedAt: options.refreshedAt || 0,
    rules: referralRulesPayload()
  };
}

function referralRulesPayload() {
  return {
    nameRules: "Referral names are unique, 3-24 characters, lowercase letters, numbers, hyphen, or underscore.",
    qualification: [
      "Visitor must open your referral link or QR code.",
      "Visitor must connect a different wallet.",
      "The first valid referrer for a wallet wins.",
      "Rewards only count when the referred wallet keeps holding $PUMPR at snapshot time.",
      "Bigger and longer holders receive higher tiers."
    ],
    tiers: [
      { tier: "Pending", requirement: "Connected wallet, no tracked $PUMPR balance yet", estimatePumpr: 0 },
      { tier: "Bronze", requirement: "Holding any $PUMPR", estimatePumpr: 2500 },
      { tier: "Silver", requirement: "Holding 0.25%+ $PUMPR", estimatePumpr: 10000 },
      { tier: "Gold", requirement: "Holding 1%+ $PUMPR", estimatePumpr: 25000 },
      { tier: "Diamond", requirement: "Holding 1%+ $PUMPR for 24h+", estimatePumpr: 50000 }
    ]
  };
}

function publicReferralLeaderboard(store) {
  const profilesByKey = new Map((store.profiles || []).map((profile) => [profile.key, profile]));
  const rows = [];
  for (const profile of store.profiles || []) {
    const stats = referralStatsForWallet(store, profile.wallet);
    rows.push({
      wallet: profile.wallet,
      name: profile.name,
      stats
    });
  }
  for (const row of store.referrals || []) {
    if (profilesByKey.has(row.referrerKey)) continue;
    rows.push({
      wallet: row.referrerWallet,
      name: "",
      stats: referralStatsForWallet(store, row.referrerWallet)
    });
  }
  return rows
    .filter((row) => Number(row.stats?.invited || 0) > 0 || Number(row.stats?.score || 0) > 0)
    .sort((a, b) => Number(b.stats?.score || 0) - Number(a.stats?.score || 0) || Number(b.stats?.qualified || 0) - Number(a.stats?.qualified || 0))
    .slice(0, 100);
}

app.get("/api/social", async (req, res) => {
  try {
    const store = await readSocialDbPersistent({ refresh: req.query.fresh === "1" });
    const limit = Math.max(5, Math.min(100, Number(req.query.limit || 40)));
    const tab = String(req.query.tab || "for-you").trim().toLowerCase();
    const viewer = normalizeSupportAddress(req.query.viewer || "");
    const query = sanitizeSocialText(req.query.q || "", 80).toLowerCase();
    let posts = [...(store.posts || [])];
    if (tab === "alpha") posts = posts.filter((post) => /\balpha\b/i.test(post.body) || post.category === "alpha");
    if (tab === "launches") posts = posts.filter((post) => /\blaunch|ca:|contract|pump\.fun\b/i.test(post.body) || post.category === "launch");
    if (tab === "rewards") posts = posts.filter((post) => /\breward|airdrop|xp|holder\b/i.test(post.body) || post.category === "rewards");
    if (query) {
      posts = posts.filter((post) => {
        const profile = findSocialProfileByWallet(store, post.authorWallet);
        return [post.body, post.token, post.chain, profile?.handle, profile?.displayName]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
    }
    posts = posts.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, limit);
    res.json({
      posts: posts.map((post) => socialPostPublic(post, store, viewer)),
      leaderboard: socialLeaderboard(store),
      updatedAt: store.updatedAt || Math.floor(Date.now() / 1000)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load Pump-r Social" });
  }
});

app.get("/api/social/profile/:wallet", async (req, res) => {
  try {
    const wallet = normalizeSupportAddress(req.params.wallet || "");
    if (!wallet) return res.status(400).json({ error: "Invalid wallet" });
    const store = await readSocialDbPersistent({ refresh: req.query.fresh === "1" });
    const profile = findSocialProfileByWallet(store, wallet);
    res.json({
      profile: profile ? socialProfilePublic(profile) : null,
      stats: socialStatsForWallet(store, wallet)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load social profile" });
  }
});

app.post("/api/social/profile", async (req, res) => {
  try {
    const store = await readSocialDbPersistent({ refresh: true });
    const profile = createOrUpdateSocialProfile(store, req.body || {});
    const saved = await writeSocialDbPersistent(store);
    res.json({
      profile: socialProfilePublic(findSocialProfileByWallet(saved, profile.wallet) || profile),
      stats: socialStatsForWallet(saved, profile.wallet)
    });
  } catch (error) {
    const text = String(error?.message || "Failed to save social profile");
    const status = /taken|connect|invalid|could not/i.test(text) ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/social/posts", async (req, res) => {
  try {
    const store = await readSocialDbPersistent({ refresh: true });
    const profile = createOrUpdateSocialProfile(store, {
      wallet: req.body?.wallet || req.body?.authorWallet,
      handle: req.body?.handle,
      displayName: req.body?.displayName,
      imageUri: req.body?.imageUri,
      source: req.body?.source || "social"
    });
    const post = normalizeSocialPost({
      ...req.body,
      authorWallet: profile.wallet,
      id: `post-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      createdAt: Math.floor(Date.now() / 1000)
    });
    if (!post) return res.status(400).json({ error: "Write something before posting" });
    profile.xp = Math.max(0, Number(profile.xp || 0) || 0) + 5;
    profile.updatedAt = Math.floor(Date.now() / 1000);
    store.profiles = [profile, ...(store.profiles || []).filter((row) => row.key !== profile.key)];
    store.posts = [post, ...(store.posts || [])].slice(0, 1000);
    const saved = await writeSocialDbPersistent(store);
    res.json({
      post: socialPostPublic(post, saved, profile.wallet),
      profile: socialProfilePublic(findSocialProfileByWallet(saved, profile.wallet) || profile),
      stats: socialStatsForWallet(saved, profile.wallet)
    });
  } catch (error) {
    const text = String(error?.message || "Failed to publish post");
    const status = /taken|connect|invalid|write/i.test(text) ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/social/posts/:postId/react", async (req, res) => {
  try {
    const wallet = normalizeSupportAddress(req.body?.wallet || req.body?.address || "");
    const key = supportAddressKey(wallet);
    if (!wallet || !key) return res.status(400).json({ error: "Connect first" });
    const type = String(req.body?.type || "like").toLowerCase() === "repost" ? "repost" : "like";
    const listName = type === "repost" ? "reposts" : "likes";
    const store = await readSocialDbPersistent({ refresh: true });
    createOrUpdateSocialProfile(store, {
      wallet,
      handle: req.body?.handle,
      displayName: req.body?.displayName,
      imageUri: req.body?.imageUri,
      source: req.body?.source || "social"
    });
    const post = (store.posts || []).find((row) => row.id === String(req.params.postId || ""));
    if (!post) return res.status(404).json({ error: "Post not found" });
    const set = new Set(post[listName] || []);
    if (req.body?.active === false) set.delete(key);
    else set.add(key);
    post[listName] = [...set].slice(0, 5000);
    const saved = await writeSocialDbPersistent(store);
    res.json({ post: socialPostPublic(post, saved, wallet), leaderboard: socialLeaderboard(saved) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to update reaction" });
  }
});

app.post("/api/social/posts/:postId/replies", async (req, res) => {
  try {
    const wallet = normalizeSupportAddress(req.body?.wallet || req.body?.address || "");
    const key = supportAddressKey(wallet);
    if (!wallet || !key) return res.status(400).json({ error: "Connect first" });
    const store = await readSocialDbPersistent({ refresh: true });
    const profile = createOrUpdateSocialProfile(store, {
      wallet,
      handle: req.body?.handle,
      displayName: req.body?.displayName,
      imageUri: req.body?.imageUri,
      source: req.body?.source || "social"
    });
    const post = (store.posts || []).find((row) => row.id === String(req.params.postId || ""));
    if (!post) return res.status(404).json({ error: "Post not found" });
    const reply = normalizeSocialReply({
      authorWallet: wallet,
      body: req.body?.body || req.body?.text || "",
      id: `reply-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      createdAt: Math.floor(Date.now() / 1000)
    });
    if (!reply) return res.status(400).json({ error: "Write a reply first" });
    profile.xp = Math.max(0, Number(profile.xp || 0) || 0) + 2;
    profile.updatedAt = Math.floor(Date.now() / 1000);
    store.profiles = [profile, ...(store.profiles || []).filter((row) => row.key !== profile.key)];
    post.replies = [...(post.replies || []), reply].slice(-300);
    const saved = await writeSocialDbPersistent(store);
    res.json({ post: socialPostPublic(post, saved, wallet), stats: socialStatsForWallet(saved, wallet) });
  } catch (error) {
    const text = String(error?.message || "Failed to publish reply");
    const status = /connect|write|not found/i.test(text) ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.get("/api/referrals/me/:wallet", async (req, res) => {
  try {
    const wallet = normalizeSupportAddress(req.params.wallet || "");
    if (!wallet) return res.status(400).json({ error: "Valid wallet is required" });
    const created = await ensureReferralProfile(wallet);
    let store = created.store;
    let refreshedAt = 0;
    if (String(req.query.refresh || "") === "1") {
      const refreshed = await refreshReferralQualifications(store);
      store = refreshed.store;
      refreshedAt = refreshed.refreshedAt;
    }
    const profile = referralProfileForWallet(store, wallet, { create: true });
    res.json(publicReferralPayload(req, store, profile, { refreshedAt }));
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load referral profile" });
  }
});

app.post("/api/referrals/name", async (req, res) => {
  try {
    const wallet = normalizeSupportAddress(req.body?.wallet || "");
    const name = normalizeReferralName(req.body?.name || "");
    if (!wallet) return res.status(400).json({ error: "Valid wallet is required" });
    if (!name) return res.status(400).json({ error: "Use 3-24 lowercase letters, numbers, hyphen, or underscore" });
    if (reservedReferralNames().has(name)) return res.status(409).json({ error: "That referral name is reserved" });

    const store = await readReferralDbPersistent({ refresh: true });
    const key = referralWalletKey(wallet);
    const duplicate = (store.profiles || []).find((row) => row.name === name && row.key !== key);
    if (duplicate) return res.status(409).json({ error: "That referral name is already taken" });
    const profile = referralProfileForWallet(store, wallet, { create: true });
    profile.name = name;
    profile.updatedAt = Math.floor(Date.now() / 1000);
    await writeReferralDbPersistent(store);
    const nextStore = await readReferralDbPersistent({ refresh: true });
    res.json(publicReferralPayload(req, nextStore, referralProfileForWallet(nextStore, wallet, { create: true })));
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to save referral name" });
  }
});

app.post("/api/referrals/visit", async (req, res) => {
  try {
    const store = await readReferralDbPersistent({ refresh: true });
    const ref = String(req.body?.ref || req.body?.code || "").trim();
    const profile = findReferralProfileByRef(store, ref);
    const visit = normalizeReferralVisit({
      ref: normalizeReferralName(ref),
      referrerWallet: profile?.wallet || "",
      landingPath: req.body?.landingPath || req.body?.path || "/",
      userAgentHash: crypto.createHash("sha256").update(String(req.get("user-agent") || "")).digest("hex").slice(0, 48),
      createdAt: Math.floor(Date.now() / 1000)
    });
    if (visit) {
      store.visits = [visit, ...(store.visits || [])].slice(0, 5000);
      await writeReferralDbPersistent(store);
    }
    res.json({ ok: true, referrerWallet: profile?.wallet || "", referralName: profile?.name || normalizeReferralName(ref) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to track referral visit" });
  }
});

app.post("/api/referrals/connect", async (req, res) => {
  try {
    const referredWallet = normalizeSupportAddress(req.body?.referredWallet || req.body?.wallet || "");
    if (!referredWallet) return res.status(400).json({ error: "Valid referred wallet is required" });
    const store = await readReferralDbPersistent({ refresh: true });
    const ref = String(req.body?.ref || req.body?.referralName || req.body?.code || "").trim();
    const profile = findReferralProfileByRef(store, ref);
    if (!profile?.wallet) return res.status(404).json({ error: "Referral was not found" });
    if (referralWalletKey(profile.wallet) === referralWalletKey(referredWallet)) {
      return res.status(400).json({ error: "Self-referrals do not count" });
    }
    const existing = (store.referrals || []).find((row) => row.referredKey === referralWalletKey(referredWallet));
    if (!existing) {
      const now = Math.floor(Date.now() / 1000);
      const row = normalizeReferralRow({
        id: `${referralWalletKey(profile.wallet)}:${referralWalletKey(referredWallet)}`,
        referrerWallet: profile.wallet,
        referredWallet,
        referralName: profile.name,
        landingPath: req.body?.landingPath || req.body?.path || "/",
        source: req.body?.source || "wallet-connect",
        createdAt: now,
        connectedAt: now
      });
      if (row) store.referrals = [row, ...(store.referrals || [])];
      await writeReferralDbPersistent(store);
    }
    const refreshed = await refreshReferralQualifications(store);
    res.json({
      ok: true,
      alreadyTracked: Boolean(existing),
      referral: publicReferralRow((refreshed.store.referrals || []).find((row) => row.referredKey === referralWalletKey(referredWallet)) || existing || {}),
      referrerWallet: profile.wallet,
      referralName: profile.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to connect referral" });
  }
});

app.post("/api/referrals/refresh", async (_req, res) => {
  try {
    const refreshed = await refreshReferralQualifications();
    res.json({
      ok: true,
      refreshedAt: refreshed.refreshedAt,
      referrals: refreshed.store.referrals.length,
      leaderboard: publicReferralLeaderboard(refreshed.store).slice(0, 50)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to refresh referrals" });
  }
});

app.get("/api/referrals/leaderboard", async (req, res) => {
  try {
    let store = await readReferralDbPersistent({ refresh: true });
    if (String(req.query.refresh || "") === "1") {
      store = (await refreshReferralQualifications(store)).store;
    }
    res.json({ leaderboard: publicReferralLeaderboard(store), updatedAt: store.updatedAt || 0, rules: referralRulesPayload() });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load referral leaderboard" });
  }
});

app.get("/api/referrals/qr", async (req, res) => {
  try {
    const raw = String(req.query.url || req.query.link || "").trim();
    if (!raw || raw.length > 512) return res.status(400).json({ error: "Valid referral URL is required" });
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ error: "Referral URL must be http or https" });
    const png = await QRCode.toBuffer(parsed.toString(), {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: {
        dark: "#05070aff",
        light: "#ffffffff"
      }
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    res.send(png);
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to generate referral QR" });
  }
});

app.get("/api/referrals/cron", async (req, res) => {
  try {
    const expected = String(process.env.CRON_SECRET || process.env.REFERRAL_CRON_SECRET || "").trim();
    const provided = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() || String(req.query.secret || "").trim();
    if (expected && provided !== expected) return res.status(403).json({ error: "Invalid cron secret" });
    const refreshed = await refreshReferralQualifications();
    res.json({ ok: true, refreshedAt: refreshed.refreshedAt, referrals: refreshed.store.referrals.length });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to refresh referral cron" });
  }
});

app.get("/api/holder/eligibility", async (req, res) => {
  try {
    const eligibility = await readOfficialHolderEligibility({
      address: req.query.address || "",
      solanaAddress: req.query.solanaAddress || req.query.solana || "",
      launchMode: req.query.launchMode || req.query.mode || "",
      targetChainId: req.query.targetChainId || req.query.launchChainId || req.query.chainId || 0
    });
    res.json(eligibility);
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to verify Pump-r holder eligibility" });
  }
});

app.get("/api/launch-availability", async (req, res) => {
  try {
    const name = String(req.query.name || "").trim();
    const symbol = String(req.query.symbol || "").trim();
    const result = await findDuplicateLaunchIdentity({ name, symbol });
    res.json({
      available: !result.duplicate,
      ...result
    });
  } catch (error) {
    res.status(Number(error.status || 500)).json({ error: error.message || "Failed to check token availability" });
  }
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

function compactCreatorProfileForHome(profile) {
  if (!profile || typeof profile !== "object") return null;
  const imageUri = String(profile.imageUri || profile.image || "").trim();
  return {
    address: String(profile.address || "").trim(),
    username: String(profile.username || profile.name || "").trim().slice(0, 80),
    imageUri: imageUri && !imageUri.startsWith("data:") ? imageUri : ""
  };
}

function compactPoolForHome(pool) {
  if (!pool || typeof pool !== "object") return null;
  return {
    address: String(pool.address || "").trim(),
    graduated: Boolean(pool.graduated),
    migratedPair: String(pool.migratedPair || "").trim(),
    quoteMode: String(pool.quoteMode || "").trim(),
    quoteAsset: pool.quoteAsset
      ? {
          mode: String(pool.quoteAsset.mode || "").trim(),
          symbol: String(pool.quoteAsset.symbol || "").trim(),
          decimals: toNumberSafe(pool.quoteAsset.decimals, 18),
          isNative: Boolean(pool.quoteAsset.isNative)
        }
      : null,
    marketCapWei: String(pool.marketCapWei || "0"),
    marketCapEth: toNumberSafe(pool.marketCapEth, 0),
    marketCapQuote: toNumberSafe(pool.marketCapQuote, 0),
    fdvWei: String(pool.fdvWei || "0"),
    fdvEth: toNumberSafe(pool.fdvEth, 0),
    fdvQuote: toNumberSafe(pool.fdvQuote, 0),
    bondingProgressPct: toNumberSafe(pool.bondingProgressPct, 0),
    lastTradeAt: Number(pool.lastTradeAt || 0)
  };
}

function compactDexSnapshotForHome(dex) {
  if (!dex || typeof dex !== "object") return null;
  return {
    chainId: String(dex.chainId || "").trim(),
    dexId: String(dex.dexId || "").trim(),
    pairAddress: String(dex.pairAddress || "").trim(),
    pairUrl: String(dex.pairUrl || "").trim(),
    baseSymbol: String(dex.baseSymbol || "").trim(),
    quoteSymbol: String(dex.quoteSymbol || "").trim(),
    priceNative: toNumberSafe(dex.priceNative, 0),
    priceUsd: toNumberSafe(dex.priceUsd, 0),
    marketCapUsd: toNumberSafe(dex.marketCapUsd, 0),
    fdvUsd: toNumberSafe(dex.fdvUsd, 0),
    liquidityUsd: toNumberSafe(dex.liquidityUsd, 0),
    volume24hUsd: toNumberSafe(dex.volume24hUsd, 0),
    priceChange24hPct: toNumberSafe(dex.priceChange24hPct, 0),
    pairCreatedAt: Number(dex.pairCreatedAt || 0)
  };
}

function compactLaunchForHome(row = {}) {
  const imageUri = String(row.imageUri || row.imageURI || row.image || "").trim();
  const tokenAddress = String(row.tokenAddress || row.token || row.mint || "").trim();
  const poolAddress = typeof row.pool === "string"
    ? row.pool
    : String(row.poolAddress || row.pool?.address || "").trim();
  return {
    id: row.id,
    chainId: row.chainId,
    source: row.source || "",
    token: tokenAddress,
    tokenAddress,
    mint: String(row.mint || row.token || "").trim(),
    poolAddress,
    creator: String(row.creator || "").trim(),
    name: String(row.name || row.tokenName || "").trim(),
    symbol: String(row.symbol || row.tokenSymbol || "").trim(),
    imageURI: imageUri,
    description: String(row.description || "").trim().slice(0, 360),
    createdAt: Number(row.createdAt || 0),
    pumpfunUrl: String(row.pumpfunUrl || row.pumpFunUrl || "").trim(),
    signature: String(row.signature || "").trim(),
    marketCapUsd: toNumberSafe(row.marketCapUsd, 0),
    marketCapSol: toNumberSafe(row.marketCapSol, 0),
    fdvUsd: toNumberSafe(row.fdvUsd, 0),
    priceUsd: toNumberSafe(row.priceUsd, 0),
    pumpfunComplete: Boolean(row.pumpfunComplete),
    pool: compactPoolForHome(row.pool),
    dexSnapshot: compactDexSnapshotForHome(row.dexSnapshot),
    creatorProfile: compactCreatorProfileForHome(row.creatorProfile)
  };
}

function compactLaunchPayloadForHome(payload = {}) {
  return {
    ...payload,
    launches: (Array.isArray(payload.launches) ? payload.launches : []).map(compactLaunchForHome)
  };
}

app.get("/api/launches", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(120, Number(req.query.limit || 20)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const includeDex = String(req.query.includeDex || "0") === "1";
    const lite = String(req.query.lite || "0") === "1";
    const homeLite = String(req.query.home || "0") === "1";
    const fastHome = homeLite && lite && !includeDex;
    const pumpFunOnly = String(req.query.pumpFunOnly || "0") === "1";
    const forceFresh = String(req.query.fresh || "0") === "1";

    if (pumpFunOnly) {
      const pumpFunStore = await readPumpFunLaunchesPersistent({ refresh: forceFresh && !fastHome });
      let pumpFunLaunches = (Array.isArray(pumpFunStore.launches) ? pumpFunStore.launches : [])
        .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
      const visibleWindow = pumpFunLaunches.slice(offset, offset + limit);
      const needsImageHydration = visibleWindow.some((row) => !String(row?.imageUri || row?.imageURI || row?.image || "").trim());
      if (needsImageHydration || (!fastHome && forceFresh)) {
        const hydratedLaunches = await hydratePumpFunLaunchMarketCaps(pumpFunLaunches, {
          fresh: forceFresh && !fastHome,
          imageOnlyLimit: fastHome ? Math.max(limit, 12) : 60
        });
        const gainedImages = hydratedLaunches.some((row, index) => {
          const before = pumpFunLaunches[index];
          return !String(before?.imageUri || before?.imageURI || before?.image || "").trim() &&
            Boolean(String(row?.imageUri || row?.imageURI || row?.image || "").trim());
        });
        pumpFunLaunches = hydratedLaunches.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
        if (gainedImages) {
          writePumpFunLaunchesPersistent({ launches: pumpFunLaunches }).catch(() => {
            // best-effort image backfill
          });
        }
      }
      const launches = pumpFunLaunches.slice(offset, offset + limit);
      const pumpFunPayload = { total: pumpFunLaunches.length, launches };
      return res.json(homeLite ? compactLaunchPayloadForHome(pumpFunPayload) : pumpFunPayload);
    }

    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const quoteMode = resolveRequestedQuoteMode(req);
    const ctx = await getContext(requestedChainId, { verify: false, quoteMode });
    const count = await readFactoryLaunchCount(ctx.factory);
    const launchesKey = `${ctx.quoteMode}:${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${count}:${limit}:${offset}:${includeDex ? "dex" : "nodex"}:${lite ? "lite" : "full"}:${fastHome ? "homefast" : "standard"}`;
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
        if (fastHome) {
          pool = buildPoolFallbackFromLaunch(launch);
        } else {
          try {
            // Even in lite mode, read live pool snapshot so non-home card requests don't stick to seeded defaults.
            pool = await withTimeout(
              readPoolSnapshot(ctx.provider, launch, { quoteMode: ctx.quoteMode, quoteAsset: ctx.quoteAsset }),
              lite ? 1800 : RPC_READ_TIMEOUT_MS,
              "pool snapshot"
            );
          } catch {
            pool = buildPoolFallbackFromLaunch(launch);
          }
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
    const includePumpFunFeed =
      offset === 0 &&
      ctx.quoteMode === "native" &&
      (ctx.chainId === 1 || String(req.query.includePumpFun || "0") === "1");
    if (includePumpFunFeed) {
      const pumpFunStore = await readPumpFunLaunchesPersistent({ refresh: forceFresh });
      const rawPumpFunLaunches = Array.isArray(pumpFunStore.launches) ? pumpFunStore.launches : [];
      const fastNeedsImageHydration = fastHome && rawPumpFunLaunches.slice(0, limit).some((row) => {
        return !String(row?.imageUri || row?.imageURI || row?.image || "").trim();
      });
      const pumpFunLaunches = fastHome && !fastNeedsImageHydration
        ? rawPumpFunLaunches
        : await hydratePumpFunLaunchMarketCaps(rawPumpFunLaunches, {
            fresh: forceFresh && !fastHome,
            imageOnlyLimit: fastHome ? Math.max(limit, 12) : 60
          });
      const launches = [...pumpFunLaunches, ...(Array.isArray(payload.launches) ? payload.launches : [])]
        .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
        .slice(0, limit);
      const backfilledPumpFunImages = pumpFunLaunches.some((row, index) => {
        const before = rawPumpFunLaunches[index];
        return !String(before?.imageUri || before?.imageURI || before?.image || "").trim() &&
          Boolean(String(row?.imageUri || row?.imageURI || row?.image || "").trim());
      });
      if ((!fastHome && pumpFunLaunches.some((row) => Number(row?.marketCapUsd || 0) > 0)) || backfilledPumpFunImages) {
        writePumpFunLaunchesPersistent({ launches: pumpFunLaunches }).catch(() => {
          // best-effort snapshot persistence
        });
      }
      const pumpFunPayload = {
        ...payload,
        total: Number(payload.total || 0) + pumpFunLaunches.length,
        launches
      };
      return res.json(homeLite ? compactLaunchPayloadForHome(pumpFunPayload) : pumpFunPayload);
    }

    res.json(homeLite ? compactLaunchPayloadForHome(payload) : payload);
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
    const token = normalizeCommunityToken(req.params.token || "");
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
      } else {
        const text = await userRes.text().catch(() => "");
        throw new Error(`X profile fetch failed: ${userRes.status} ${text}`.trim());
      }
    }
    if (!xUser?.username) {
      throw new Error("X authorized, but no X profile was returned");
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
    const token = normalizeCommunityToken(req.params.token || "");
    if (!token) return res.status(400).json({ error: "Invalid token address" });
    const post = await createCommunityPost({ ...(req.body || {}), token });
    const store = await readCommunityDbPersistent();
    res.json({ post, stats: communityStatsForToken(token, store) });
  } catch (error) {
    const text = String(error?.message || "Failed to create post");
    const lowered = text.toLowerCase();
    const status = lowered.includes("required") || lowered.includes("invalid") || lowered.includes("connect") || lowered.includes("community") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/community/:token/posts/:postId/comment", async (req, res) => {
  try {
    const token = normalizeCommunityToken(req.params.token || "");
    if (!token) return res.status(400).json({ error: "Invalid token address" });
    const post = await createCommunityComment(req.params.postId, { ...(req.body || {}), token });
    const store = await readCommunityDbPersistent();
    res.json({ post, stats: communityStatsForToken(token, store) });
  } catch (error) {
    const text = String(error?.message || "Failed to add comment");
    const lowered = text.toLowerCase();
    const status = lowered.includes("required") || lowered.includes("not found") || lowered.includes("connect") || lowered.includes("community") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/community/:token/posts/:postId/like", async (req, res) => {
  try {
    const token = normalizeCommunityToken(req.params.token || "");
    if (!token) return res.status(400).json({ error: "Invalid token address" });
    const post = await setCommunityLike(req.params.postId, req.body?.address, Boolean(req.body?.liked), token);
    const store = await readCommunityDbPersistent();
    res.json({ post, stats: communityStatsForToken(token, store) });
  } catch (error) {
    const text = String(error?.message || "Failed to update like");
    const lowered = text.toLowerCase();
    const status = lowered.includes("required") || lowered.includes("not found") || lowered.includes("connect") || lowered.includes("community") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.get("/api/agents/skill", (_req, res) => {
  try {
    res.type("text/markdown").send(fs.readFileSync(AGENT_SKILL_PATH, "utf8"));
  } catch {
    res.status(404).json({ error: "skill.md not found" });
  }
});

app.get("/api/pumpfun/prepared/:id", async (req, res) => {
  try {
    const id = sanitizeAlphaText(req.params.id || "", 90).replace(/[^a-zA-Z0-9_-]/g, "");
    const store = await readPumpFunPreparedDbPersistent();
    const item = (store.items || []).find((row) => row.id === id);
    if (!item) return res.status(404).json({ error: "Prepared submission not found or expired" });
    res.json({ submission: item });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load prepared submission" });
  }
});

function parseEvidenceDataUrl(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2], binary: Buffer.from(match[2], "base64") };
}

function pumpFunAttachmentKind(contentType = "") {
  const type = String(contentType || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return null;
}

async function uploadPumpFunEvidenceAttachment(session, raw = {}) {
  const existingUrl = sanitizeGoUrl(raw?.url || "");
  if (existingUrl) {
    if (!isPublicHostedUrl(existingUrl)) {
      throw new Error("Evidence links must be public https URLs before Pump.fun can show them.");
    }
    return {
      attachment: null,
      link: existingUrl
    };
  }

  const parsed = parseEvidenceDataUrl(raw?.dataUrl || "");
  if (!parsed) throw new Error("Evidence file is missing file data");
  const contentType = sanitizeAlphaText(raw?.contentType || parsed.mime || "application/octet-stream", 120);
  const kind = pumpFunAttachmentKind(contentType);
  if (!kind) throw new Error("Pump.fun bounty attachments support images and videos only");
  const filename = sanitizeAlphaText(raw?.filename || raw?.name || `evidence-${Date.now()}`, 180) || `evidence-${Date.now()}`;
  const maxSize = kind === "image" ? 5 * 1024 * 1024 : 200 * 1024 * 1024;
  if (parsed.binary.length <= 0 || parsed.binary.length > maxSize) {
    throw new Error(kind === "image" ? "Evidence image must be 5 MB or smaller" : "Evidence video must be 200 MB or smaller");
  }

  if (kind === "image") {
    const uploaded = await pumpFunLivestreamRequest("bounties/attachments/image", {
      session,
      method: "POST",
      body: { filename, contentType, data: parsed.base64 }
    });
    const attachment = uploaded?.attachment || uploaded;
    if (!attachment?.url || !attachment?.key) throw new Error("Pump.fun did not return an image attachment");
    return { attachment, link: attachment.url };
  }

  const presigned = await pumpFunLivestreamRequest("bounties/attachments/presigned-url", {
    session,
    method: "POST",
    body: { filename, contentType, contentLength: parsed.binary.length }
  });
  const uploadUrl = String(presigned?.uploadUrl || "");
  const attachment = presigned?.attachment || null;
  if (!uploadUrl || !attachment?.url || !attachment?.key) throw new Error("Pump.fun did not return a video upload URL");
  const uploadResponse = await withTimeout(fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: parsed.binary
  }), 60_000, "Pump.fun attachment upload");
  if (!uploadResponse.ok) {
    const text = await uploadResponse.text().catch(() => "");
    throw new Error(`Pump.fun attachment upload failed: ${uploadResponse.status} ${text}`.trim());
  }
  return { attachment, link: attachment.url };
}

async function uploadPumpFunEvidenceAttachments(session, rawAttachments = []) {
  const uploaded = [];
  const links = [];
  for (const raw of (Array.isArray(rawAttachments) ? rawAttachments : []).slice(0, 8)) {
    const result = await uploadPumpFunEvidenceAttachment(session, raw);
    if (result.attachment) uploaded.push(result.attachment);
    if (result.link) links.push(result.link);
  }
  return { attachments: uploaded, links };
}


app.post("/api/pumpfun/prepared/:id/submit", async (req, res) => {
  try {
    const id = sanitizeAlphaText(req.params.id || "", 90).replace(/[^a-zA-Z0-9_-]/g, "");
    const store = await readPumpFunPreparedDbPersistent();
    const item = (store.items || []).find((row) => row.id === id);
    if (!item) return res.status(404).json({ error: "Prepared submission not found or expired" });
    const taskId = sanitizeAlphaText(String(item.taskId || item.bountyId || "").replace(/^pumpfun-/, ""), 180);
    if (!taskId) throw new Error("Prepared submission is missing the Pump.fun task id");
    const session = await findPumpFunSessionForOwner(req.body?.owner || req.body?.userPublicKey || "");
    if (!session) throw new Error("Add a Pump.fun session for this Phantom wallet before auto-submitting work");
    const evidence = await uploadPumpFunEvidenceAttachments(session, req.body?.attachments);
    const attachments = evidence.attachments;
    const bodyMarkdown = sanitizeAgentDraftText(req.body?.bodyMarkdown || item.body || "", 6000);
    if (bodyMarkdown.length < 10) throw new Error("Prepared submission body is empty");
    const links = [
      ...(Array.isArray(item.links) ? item.links : []),
      ...(Array.isArray(req.body?.links) ? req.body.links : []),
      ...evidence.links
    ]
      .map(sanitizeGoUrl)
      .filter(Boolean)
      .slice(0, 8);
    const payload = await pumpFunLivestreamRequest(`bounties/tasks/${encodeURIComponent(taskId)}/submissions`, {
      session,
      method: "POST",
      referer: item.sourceUrl || `https://pump.fun/go/${encodeURIComponent(taskId)}`,
      body: { bodyMarkdown, links, attachments }
    });
    res.json({
      ok: true,
      taskId,
      preparedId: item.id,
      draft: true,
      needsPublish: true,
      attachmentCount: attachments.length,
      attachmentUrls: attachments.map((attachment) => attachment.url).filter(Boolean),
      submissionId: payload?.submissionId || payload?.submission?.submissionId || payload?.id || "",
      payload
    });
  } catch (error) {
    const text = String(error?.message || "Failed to submit prepared Pump.fun work");
    const status = /cookie|bearer|auth|unauthorized|forbidden/i.test(text) ? 401 : 400;
    res.status(status).json({ error: text });
  }
});

app.get("/api/agents", async (req, res) => {
  try {
    const store = await readAgentsDbPersistent({ refresh: req.query.fresh === "1" });
    const owner = normalizeAgentOwner(req.query.owner || "");
    const agents = (store.agents || [])
      .filter((agent) => !owner || String(agent.owner || "").toLowerCase() === owner.toLowerCase())
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .map((agent) => publicAgent(agent, store));
    const posts = (store.posts || []).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 80);
    res.json({ agents, posts });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load agents" });
  }
});

app.post("/api/agents", async (req, res) => {
  try {
    const store = await readAgentsDbPersistent();
    const incoming = normalizeAgent({
      ...req.body,
      owner: req.body?.owner || req.body?.address
    });
    if (!incoming) throw new Error("Agent name, wallet, and SKILLS.md are required");
    if (isBlockedAgentContent(incoming)) throw new Error("Agent content did not pass moderation");
    const existingIndex = (store.agents || []).findIndex((agent) => agent.id === incoming.id || (agent.owner === incoming.owner && agent.name.toLowerCase() === incoming.name.toLowerCase()));
    const current = existingIndex >= 0 ? store.agents[existingIndex] : {};
    const agent = normalizeAgent({
      ...current,
      ...incoming,
      id: current.id || incoming.id,
      createdAt: current.createdAt || incoming.createdAt,
      updatedAt: Math.floor(Date.now() / 1000)
    });
    if (existingIndex >= 0) store.agents[existingIndex] = agent;
    else store.agents.unshift(agent);
    const safe = await writeAgentsDbPersistent(store);
    res.json({ agent: publicAgent(agent, safe), agents: safe.agents.map((row) => publicAgent(row, safe)) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to save agent" });
  }
});

app.post("/api/agents/:id/posts", async (req, res) => {
  try {
    const store = await readAgentsDbPersistent();
    const id = normalizeAgentId(req.params.id || "");
    const index = (store.agents || []).findIndex((agent) => agent.id === id);
    if (index < 0) throw new Error("Agent not found");
    const agent = store.agents[index];
    const owner = normalizeAgentOwner(req.body?.owner || "");
    if (owner && owner.toLowerCase() !== String(agent.owner || "").toLowerCase()) {
      throw new Error("Only the agent owner can post as this agent");
    }
    const post = normalizeAgentPost({
      ...req.body,
      agentId: agent.id,
      owner: agent.owner
    });
    if (!post) throw new Error("Post body is required");
    if (isBlockedAgentContent(post)) throw new Error("Agent post did not pass moderation");
    store.posts.unshift(post);
    store.agents[index] = { ...agent, lastPostAt: post.createdAt, updatedAt: post.createdAt };
    const safe = await writeAgentsDbPersistent(store);
    res.json({ post, agent: publicAgent(store.agents[index], safe) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to post agent update" });
  }
});

app.post("/api/agents/:id/draft-bounty", async (req, res) => {
  try {
    const store = await readAgentsDbPersistent();
    const id = normalizeAgentId(req.params.id || "");
    const agent = (store.agents || []).find((row) => row.id === id);
    if (!agent) throw new Error("Agent not found");
    const owner = normalizeAgentOwner(req.body?.owner || "");
    if (owner && owner.toLowerCase() !== String(agent.owner || "").toLowerCase()) {
      throw new Error("Only the agent owner can generate work as this agent");
    }
    const bountyId = normalizeGoId(req.body?.bountyId || "", "go");
    const { bounty } = await loadGoBountyForAgent(bountyId);
    if (!bounty?.id) throw new Error("Bounty not found");
    const draft = await draftAgentBountyWithOpenAI(agent, bounty);
    res.json({
      ...draft,
      bounty,
      links: bounty.sourceUrl ? [bounty.sourceUrl] : []
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to draft bounty work" });
  }
});

app.post("/api/agents/:id/run-bounty", async (req, res) => {
  try {
    const agentStore = await readAgentsDbPersistent();
    const id = normalizeAgentId(req.params.id || "");
    const agentIndex = (agentStore.agents || []).findIndex((row) => row.id === id);
    if (agentIndex < 0) throw new Error("Agent not found");
    const agent = agentStore.agents[agentIndex];
    const owner = normalizeAgentOwner(req.body?.owner || "");
    if (owner && owner.toLowerCase() !== String(agent.owner || "").toLowerCase()) {
      throw new Error("Only the agent owner can run this agent");
    }
    const bountyId = normalizeGoId(req.body?.bountyId || "", "go");
    const { bounty, goStore } = await loadGoBountyForAgent(bountyId);
    if (!bounty?.id) throw new Error("Bounty not found");

    const execution = await executeAgentBountyWithOpenAI(agent, bounty);
    let generatedAttachment = null;
    let generatedAttachmentNote = "";
    if (req.body?.generateConceptImage) {
      try {
        generatedAttachment = await generateOpenAiBountyConceptImage(agent, bounty);
        generatedAttachmentNote = generatedAttachment.mode === "storyboard"
          ? " OpenAI generated a task-scene planning image."
          : " OpenAI generated a task-scene image.";
      } catch (imageError) {
        generatedAttachmentNote = ` AI concept image skipped: ${imageError?.message || "OpenAI image generation failed"}.`;
      }
    }
    const now = Math.floor(Date.now() / 1000);
    const links = [
      ...(Array.isArray(req.body?.links) ? req.body.links : []),
      bounty.sourceUrl || ""
    ].map(sanitizeGoUrl).filter(Boolean).slice(0, 6);
    const mediaUrl = sanitizeGoUrl(req.body?.mediaUrl || "");
    const mediaType = sanitizeAlphaText(req.body?.mediaType || "", 80);
    const title = sanitizeAlphaText(req.body?.title || `${agent.name} completed ${bounty.title}`, 120);
    const post = normalizeAgentPost({
      agentId: agent.id,
      owner: agent.owner,
      kind: "bounty-work",
      title,
      body: execution.body,
      bountyId: bounty.id,
      mediaUrl,
      mediaType,
      links,
      createdAt: now
    });
    if (!post) throw new Error("Agent run did not produce a work package");
    agentStore.posts.unshift(post);
    agentStore.agents[agentIndex] = { ...agent, lastPostAt: now, updatedAt: now };
    const safeAgents = await writeAgentsDbPersistent(agentStore);

    const submission = normalizeGoSubmission({
      bountyId: bounty.id,
      author: req.body?.author || agent.owner,
      authorName: req.body?.authorName || agent.name,
      body: execution.body,
      mediaUrl,
      links,
      agentId: agent.id,
      agentName: agent.name,
      createdAt: now,
      likes: []
    });
    if (!submission) throw new Error("Agent run did not produce a bounty submission");
    goStore.submissions = [submission, ...(Array.isArray(goStore.submissions) ? goStore.submissions : [])].slice(0, 4000);
    writeGoDb(goStore);

    const externalSubmitRequired = String(bounty.source || "").toLowerCase().includes("pump.fun");
    const externalTaskId = String(bounty.externalId || bounty.id || "").replace(/^pumpfun-/, "");
    const preparedSubmission = externalSubmitRequired
      ? await createPumpFunPreparedSubmission({
          taskId: externalTaskId,
          bountyId: bounty.id,
          title: bounty.title,
          sourceUrl: bounty.sourceUrl || "",
          body: execution.body,
          links,
          deliverables: bounty.deliverables || [],
          agentName: agent.name,
          agentId: agent.id,
          authorName: req.body?.authorName || agent.name,
          createdAt: now
        })
      : null;
    res.json({
      configured: execution.configured,
      model: execution.model || "",
      note: externalSubmitRequired
        ? `${execution.note}${generatedAttachmentNote} Prepared for Pump.fun. Open the original bounty and run the Pump-r page assistant.`
        : `${execution.note}${generatedAttachmentNote} Submitted to the bounty.`,
      body: execution.body,
      generatedAttachment,
      bounty: decorateGoBounty(bounty, goStore),
      post,
      agent: publicAgent(agentStore.agents[agentIndex], safeAgents),
      submission,
      links,
      externalSubmitRequired,
      externalSubmitUrl: externalSubmitRequired ? bounty.sourceUrl || "" : "",
      preparedSubmission
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Failed to run agent" });
  }
});

app.get("/api/go", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(2_000, Number(req.query.limit || 500)));
    const tab = String(req.query.tab || "trending").toLowerCase();
    const fresh = String(req.query.fresh || "") === "1";
    const store = readGoDb();
    const localBounties = (store.bounties || []).map((row) => decorateGoBounty(row, store));
    const liveBounties = await listLiveGoBounties({ fresh });
    const byId = new Map();
    for (const bounty of [...liveBounties, ...localBounties]) {
      if (!bounty?.id || byId.has(bounty.id)) continue;
      byId.set(bounty.id, decorateGoBounty(bounty, store));
    }
    const bounties = Array.from(byId.values());
    const openBounties = bounties.filter((row) => row.status === "open");
    const submissions = (store.submissions || [])
      .map(normalizeGoSubmission)
      .filter(Boolean)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const rankedBounties = [...openBounties].sort((a, b) =>
      Number(b.createdAt || 0) - Number(a.createdAt || 0) ||
      Number(b.rewardUsd || 0) - Number(a.rewardUsd || 0) ||
      Number(b.submissions || 0) - Number(a.submissions || 0)
    );
    res.json({
      bounties: rankedBounties.slice(0, limit),
      submissions: submissions.slice(0, limit),
      stats: {
        bounties: bounties.length,
        open: openBounties.length,
        submissions: submissions.length,
        totalRewardUsd: openBounties.reduce((sum, row) => sum + Number(row.rewardUsd || 0), 0),
        livePumpFun: liveBounties.length,
        livePumpFunError: pumpFunBountiesCache.error || "",
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
    const bounty = (store.bounties || []).map(normalizeGoBounty).find((row) => row && row.id === id) || await findLiveGoBounty(id);
    if (!bounty) return res.status(404).json({ error: "bounty not found" });
    const localSubmissions = (store.submissions || [])
      .map(normalizeGoSubmission)
      .filter((row) => row && row.bountyId === id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const externalId = id.startsWith("pumpfun-") ? id.slice("pumpfun-".length) : "";
    const liveSubmissions = externalId ? await fetchPumpFunSubmissions(externalId, id) : [];
    const seenBodies = new Set(liveSubmissions.map((row) => sanitizeAgentDraftText(row.body || "", 400).toLowerCase()));
    const submissions = [
      ...liveSubmissions,
      ...localSubmissions.filter((row) => !seenBodies.has(sanitizeAgentDraftText(row.body || "", 400).toLowerCase()))
    ].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
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
    const author = normalizeAlphaWallet(body.author || body.address || "");
    if (!author) throw new Error("author wallet is required");
    const authorWallet = normalizeAlphaWallet(body.authorWallet || body.tipWallet || author || "");
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
    const voter = normalizeAlphaIdentityKey(req.body?.address || req.body?.voter || "");
    const direction = String(req.body?.direction || "").toLowerCase();
    if (!voter) throw new Error("voter address is required");
    if (!["up", "down", "clear"].includes(direction)) throw new Error("vote direction is required");
    const store = await readAlphaDbPersistent();
    const index = (store.tips || []).findIndex((row) => normalizeAlphaId(row?.id || "") === id);
    if (index < 0) throw new Error("alpha tip not found");
    const tip = normalizeAlphaTip(store.tips[index]);
    const key = voter;
    const upvotes = new Set((tip.upvotes || []).map(normalizeAlphaIdentityKey).filter(Boolean));
    const downvotes = new Set((tip.downvotes || []).map(normalizeAlphaIdentityKey).filter(Boolean));
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
      adminWallets: configuredAdminWallets(),
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
    const row = await createSupportMessage(req.body || {});
    res.json({ message: row });
  } catch (error) {
    const text = String(error?.message || "Failed to send support message");
    const status = text.toLowerCase().includes("required") ? 400 : 500;
    res.status(status).json({ error: text });
  }
});

app.post("/api/pumpr-card/waitlist", async (req, res) => {
  try {
    const entry = await addPumprCardWaitlistEntry({
      email: req.body?.email || "",
      wallet: req.body?.wallet || req.body?.address || "",
      source: req.body?.source || "pumpr-card",
      userAgent: req.get("user-agent") || ""
    });
    res.json({ ok: true, entry: { email: entry.email, createdAt: entry.createdAt } });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not join the PUMPR Card waitlist" });
  }
});

app.get("/api/pumpr-card/waitlist", async (req, res) => {
  try {
    if (!hasAdminRequestAccess(req, "pumpr-admin")) {
      return res.status(403).json({ error: "Only the platform admin wallet can view waitlist entries" });
    }
    const store = await readPumprCardWaitlistPersistent({ refresh: true });
    res.json({ entries: store.entries || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load PUMPR Card waitlist" });
  }
});

app.get("/api/support/messages", async (req, res) => {
  try {
    const address = normalizeSupportAddress(req.query.address || "");
    if (!address) return res.status(400).json({ error: "address is required" });
    const store = await readSupportDbPersistent({ refresh: true });
    const rows = listSupportMessagesForAddress(address, store).slice(0, 200);
    res.json({ messages: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load support messages" });
  }
});

app.get("/api/support/inbox", async (req, res) => {
  try {
    const viewer = normalizeSupportAddress(req.query.address || "");
    if (!viewer) return res.status(400).json({ error: "address is required" });
    if (!hasAdminRequestAccess(req, "pumpr-admin")) {
      return res.status(403).json({ error: "Only platform support wallet can view inbox" });
    }
    const store = await readSupportDbPersistent({ refresh: true });
    const rows = listSupportInbox(resolvePlatformSupportAddress(), store).slice(0, 500);
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
    const solanaAddress = normalizeSolanaAddress(req.params.address || "");
    const evmAddress = normalizeAddress(req.params.address);
    if (solanaAddress && !evmAddress) {
      const pumpFunStore = await readPumpFunLaunchesPersistent({ refresh: true });
      const pumpFunRows = await hydratePumpFunLaunchMarketCaps(
        (Array.isArray(pumpFunStore.launches) ? pumpFunStore.launches : []).filter(
          (row) => String(row?.creator || "").trim() === solanaAddress
        ),
        { fresh: true }
      );
      if (pumpFunRows.some((row) => Number(row?.marketCapUsd || 0) > 0)) {
        writePumpFunLaunchesPersistent({ launches: Array.isArray(pumpFunStore.launches) ? pumpFunStore.launches.map((row) => {
          const fresh = pumpFunRows.find((item) => String(item?.mint || "").toLowerCase() === String(row?.mint || "").toLowerCase());
          return fresh ? { ...row, ...fresh } : row;
        }) : pumpFunRows }).catch(() => {
          // best-effort profile market data persistence
        });
      }
      const created = pumpFunRows.map((row) => ({
        ...row,
        chainId: "pumpfun",
        source: "pumpfun",
        tokenAddress: row.token || row.mint,
        creator: solanaAddress,
        holderBalance: "0",
        holderBalanceFloat: 0,
        pool: {
          marketCapWei: "0",
          marketCapEth: 0,
          marketCapQuote: 0,
          quoteMode: "solana"
        },
        feeSnapshot: {
          creatorClaimableWei: "0",
          creatorClaimedWei: "0",
          creatorClaimableTokens: 0,
          creatorClaimedTokens: 0
        }
      }));
      const profile = await getPersistedProfile(solanaAddress).catch(() => sanitizeProfileValue(solanaAddress, {}));
      return res.json({
        address: solanaAddress,
        chainType: "solana",
        profile,
        created,
        holdings: [],
        creatorRewardsTotalWei: "0",
        creatorRewardsTotalTokens: 0,
        creatorRewardsClaimedTotalWei: "0",
        creatorRewardsClaimedTotalTokens: 0,
        creatorRewardsCombinedTotalWei: "0",
        creatorRewardsCombinedTotalTokens: 0,
        followers: [],
        following: [],
        followersCount: 0,
        followingCount: 0,
        socialIncluded: true
      });
    }

    const address = evmAddress;
    if (!address) {
      return res.status(400).json({ error: "Invalid address" });
    }

    const deployment = loadDeploymentConfig();
    const requestedChainId = resolveRequestedChainId(req, deployment);
    const ctx = await getContext(requestedChainId);
    const cacheKey = `${ctx.chainId}:${ctx.factoryAddress.toLowerCase()}:${address.toLowerCase()}:social-v2`;
    const forceFreshProfile = req.query.fresh === "1" || req.query.fresh === "true";
    const cachedProfile = forceFreshProfile ? null : getCachedValue(profileCache, cacheKey);
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

app.get(["/agents", "/agents/:agentId"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "agents.html"));
});

app.get(["/pumpr-card", "/card"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "pumpr-card.html"));
});

app.get("/android", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "android.html"));
});

app.get("/terms", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "terms.html"));
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "privacy.html"));
});

app.get("/onboard", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "onboard.html"));
});

app.get("/airdrop", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "airdrop.html"));
});

app.get(["/referrals", "/r/:ref"], (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "referrals.html"));
});

app.get("/social", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "social.html"));
});

app.get("/profile", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "profile.html"));
});

app.get("/skill.md", (_req, res) => {
  res.type("text/markdown").sendFile(AGENT_SKILL_PATH);
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
      } else if (lower.endsWith(".apk")) {
        res.setHeader("Cache-Control", "no-store, max-age=0");
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", "attachment");
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
