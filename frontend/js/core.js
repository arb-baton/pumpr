import { ethers } from "../vendor/ethers.min.js?v=20260630local";

export { ethers };

export const FACTORY_ABI = [
  "event LaunchCreated(uint256 indexed launchId,address indexed creator,address indexed token,address pool,uint256 totalSupply,uint256 creatorAllocation,uint256 feeBps,uint256 graduationTargetEth,address dexRouter,address lpRecipient)",
  "function createLaunch(string name,string symbol,string imageURI,string description,uint256 totalSupply,uint256 creatorAllocationBps) payable returns (uint256 launchId,address tokenAddress,address poolAddress)",
  "function createLaunchInstant(string name,string symbol,string imageURI,string description,uint256 totalSupply,uint256 creatorAllocationBps) payable returns (uint256 launchId,address tokenAddress,address poolAddress)",
  "function getLaunchCount() view returns (uint256)",
  "function getLaunch(uint256 launchId) view returns ((address token,address pool,address creator,string name,string symbol,string imageURI,string description,uint256 totalSupply,uint256 creatorAllocation,uint256 createdAt))"
];

export const POOL_ABI = [
  "function buy(uint256 minTokensOut) payable returns (uint256 tokensOut)",
  "function buyWithQuote(uint256 quoteAmountIn,uint256 minTokensOut) returns (uint256 tokensOut)",
  "function sell(uint256 tokenAmountIn,uint256 minEthOut) returns (uint256 ethOut)",
  "function quoteBuy(uint256 ethAmountIn) view returns (uint256 tokensOut,uint256 feePaid)",
  "function quoteSell(uint256 tokenAmountIn) view returns (uint256 ethOut,uint256 feePaid)",
  "function quoteToken() view returns (address)"
];

export const TOKEN_ABI = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function creator() view returns (address)",
  "function creatorClaimable() view returns (uint256)",
  "function platformFeeRecipient() view returns (address)",
  "function platformClaimable() view returns (uint256)",
  "function claimCreatorFees() returns (uint256)",
  "function claimPlatformFees() returns (uint256)"
];

export const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256 amountIn,address[] calldata path) view returns (uint256[] memory amounts)",
  "function getAmountsIn(uint256 amountOut,address[] calldata path) view returns (uint256[] memory amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin,address[] calldata path,address to,uint256 deadline) payable returns (uint256[] memory amounts)",
  "function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] calldata path,address to,uint256 deadline) returns (uint256[] memory amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin,address[] calldata path,address to,uint256 deadline) payable",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] calldata path,address to,uint256 deadline)"
];

const state = {
  provider: null,
  signer: null,
  address: "",
  walletLabel: "",
  activeInjectedProvider: null,
  solanaProvider: null,
  solanaAddress: "",
  solanaWalletLabel: "",
  wallets: []
};

const walletListenersAttached = new WeakSet();
const eip6963Providers = new Map();
let eip6963Listening = false;
let eip6963Requested = false;
const providerIds = new WeakMap();
let providerIdCounter = 0;
const WALLET_SESSION_KEY = "etherpump.wallet.session.v1";
const SOCIAL_AUTH_SESSION_KEY = "pumpr.social.session.v1";
const SOCIAL_WALLET_STORE_KEY = "pumpr.social.wallets.v1";
const PROFILE_STORAGE_KEY = "etherpump.profile.v1";
const PROFILE_REMOTE_FRESH_KEY = "etherpump.profile.remotefresh.v1";
const PROFILE_FOLLOWERS_STORAGE_KEY = "etherpump.profile.followers.v1";
const ETH_USD_CACHE_KEY = "etherpump.ethusd.v1";
const CHAIN_PREFERENCE_KEY = "etherpump.chain.preferred.v1";
const ETH_USD_FALLBACK = 3000;
const ETH_USD_CACHE_TTL_MS = 5 * 60 * 1000;
const PROFILE_REMOTE_TTL_MS = 10 * 1000;
const PROFILE_FOLLOWERS_TTL_MS = 30 * 1000;
const PROFILE_IMAGE_URI_MAX_LENGTH = 2 * 1024 * 1024;
const profileInFlight = new Map();
const profileFollowersInFlight = new Map();
export const CHAIN_OPTIONS = {
  1: {
    chainId: 1,
    chainIdHex: "0x1",
    name: "Ethereum",
    shortName: "ETH",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://rpc.ankr.com/eth"],
    blockExplorerUrls: ["https://etherscan.io"]
  },
  8453: {
    chainId: 8453,
    chainIdHex: "0x2105",
    name: "Base",
    shortName: "BASE",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"]
  },
  143: {
    chainId: 143,
    chainIdHex: "0x8f",
    name: "Monad",
    shortName: "MONAD",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: ["https://rpc.monad.xyz"],
    blockExplorerUrls: ["https://monadvision.com"]
  },
  101: {
    chainId: 101,
    name: "Solana",
    shortName: "SOL",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    rpcUrls: ["https://sparkling-blue-sponge.solana-mainnet.quiknode.pro/1a7f99d93cb6940285e9a095de8fc546c3c76d35/"],
    blockExplorerUrls: ["https://solscan.io"]
  }
};

export function getPreferredChainId() {
  try {
    const raw = localStorage.getItem(CHAIN_PREFERENCE_KEY);
    const value = Number(raw || 0);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (Math.floor(value) === 101) return null;
    return Math.floor(value);
  } catch {
    return null;
  }
}

export function setPreferredChainId(chainId) {
  const value = Number(chainId || 0);
  if (!Number.isFinite(value) || value <= 0) return;
  try {
    localStorage.setItem(CHAIN_PREFERENCE_KEY, String(Math.floor(value)));
  } catch {
    // ignore storage write failures
  }
}

export function getChainOption(chainId) {
  return CHAIN_OPTIONS[Number(chainId || 0)] || null;
}

function parseChainIdValue(value) {
  if (typeof value === "string" && value.startsWith("0x")) return Number.parseInt(value, 16);
  return Number(value || 0);
}

async function readInjectedChainId(provider = state.activeInjectedProvider) {
  if (!provider?.request) return null;
  const raw = await provider.request({ method: "eth_chainId" });
  const chainId = parseChainIdValue(raw);
  return Number.isFinite(chainId) && chainId > 0 ? chainId : null;
}

async function rebuildWalletProvider() {
  if (!state.activeInjectedProvider) return;
  state.provider = new ethers.BrowserProvider(state.activeInjectedProvider);
  if (state.address) {
    state.signer = await state.provider.getSigner(state.address);
  }
}

export async function ensureWalletChain(chainId) {
  const target = Number(chainId || 0);
  if (!Number.isFinite(target) || target <= 0) return;
  if (target === 101) {
    return;
  }
  const option = getChainOption(target);
  const injected = state.activeInjectedProvider;
  if (!injected?.request) {
    setPreferredChainId(target);
    return;
  }

  const current = await readInjectedChainId(injected).catch(() => null);
  if (current === target) {
    setPreferredChainId(target);
    await rebuildWalletProvider();
    return;
  }

  const chainIdHex = option?.chainIdHex || ethers.toQuantity(target);
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }]
    });
  } catch (error) {
    if (Number(error?.code) !== 4902 || !option) throw error;
    await injected.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: option.name,
          nativeCurrency: option.nativeCurrency,
          rpcUrls: option.rpcUrls,
          blockExplorerUrls: option.blockExplorerUrls
        }
      ]
    });
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }]
    });
  }

  setPreferredChainId(target);
  await new Promise((resolve) => setTimeout(resolve, 150));
  await rebuildWalletProvider();
}

async function syncPreferredChainIdFromProvider(provider) {
  if (!provider) return null;
  try {
    const chainHex = await provider.send("eth_chainId", []);
    const chainId = Number.parseInt(String(chainHex || "0"), 16);
    if (Number.isFinite(chainId) && chainId > 0) {
      setPreferredChainId(chainId);
      return chainId;
    }
  } catch {
    // fallback below
  }

  try {
    const network = await provider.getNetwork();
    const chainId = Number(network?.chainId || 0);
    if (Number.isFinite(chainId) && chainId > 0) {
      setPreferredChainId(chainId);
      return chainId;
    }
  } catch {
    // ignore
  }
  return null;
}

function loadWalletSession() {
  try {
    const raw = localStorage.getItem(WALLET_SESSION_KEY);
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") return { connected: false, choice: "", address: "", type: "evm" };
    const choice = typeof parsed.choice === "string" ? parsed.choice : "";
    const type = parsed.type === "solana" || choice === "phantom" ? "solana" : parsed.type === "social" || choice === "social" ? "social" : "evm";
    const address = type === "solana" || type === "social"
      ? String(parsed.address || "").trim()
      : normalizeProfileAddress(parsed.address || "");
    return { connected: Boolean(parsed.connected), choice, address, type };
  } catch {
    return { connected: false, choice: "", address: "", type: "evm" };
  }
}

function saveWalletSession(partial = {}) {
  const prev = loadWalletSession();
  const type =
    partial.type === "solana" || (partial.choice === "phantom" && partial.address)
      ? "solana"
      : partial.type === "social" || partial.choice === "social"
        ? "social"
        : partial.type === "evm"
          ? "evm"
          : prev.type || "evm";
  const next = {
    connected: typeof partial.connected === "boolean" ? partial.connected : prev.connected,
    choice: typeof partial.choice === "string" ? partial.choice : prev.choice || "",
    type,
    address:
      typeof partial.address === "string"
        ? type === "solana" || type === "social"
          ? partial.address.trim()
          : normalizeProfileAddress(partial.address)
        : prev.address || ""
  };
  try {
    localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage write failures
  }
}

function readSocialAuthSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOCIAL_AUTH_SESSION_KEY) || "{}");
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeSocialIdentity(parsed);
  } catch {
    return null;
  }
}

function readJsonLocalStorage(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function recoverSavedSocialIdentity() {
  const keys = [
    SOCIAL_AUTH_SESSION_KEY,
    "etherpump.alpha.xauth.v1",
    "etherpump.go.xauth.v1",
    "Pump-r.community.xauth.v2"
  ];
  for (const key of keys) {
    const parsed = readJsonLocalStorage(key);
    const identity = normalizeSocialIdentity({
      type: parsed?.type || "x",
      id: parsed?.id || parsed?.userId || "",
      username: parsed?.username || parsed?.xHandle || "",
      name: parsed?.name || parsed?.displayName || parsed?.username || parsed?.xHandle || "",
      image: parsed?.image || parsed?.profileImageUrl || parsed?.avatar || "",
      followers: parsed?.followers || parsed?.followersCount || 0
    });
    if (identity?.socialKey) return identity;
  }
  return null;
}

function saveSocialAuthSession(value = {}) {
  const identity = normalizeSocialIdentity(value);
  if (!identity) return null;
  const next = { ...identity, createdAt: Date.now() };
  try {
    localStorage.setItem(SOCIAL_AUTH_SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore storage write failures
  }
  return next;
}

function clearSocialAuthSession() {
  try {
    localStorage.removeItem(SOCIAL_AUTH_SESSION_KEY);
  } catch {
    // ignore storage failures
  }
}

function normalizeSocialIdentity(value = {}) {
  const type = String(value.type || "").toLowerCase();
  if (type === "email") {
    const email = String(value.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return {
      type: "email",
      id: email,
      email,
      name: String(value.name || email.split("@")[0] || "Email user").trim().slice(0, 80),
      image: "",
      socialKey: `email:${email}`
    };
  }
  if (type === "x") {
    const username = String(value.username || "").trim().replace(/^@+/, "");
    const id = String(value.id || username || "").trim();
    if (!id && !username) return null;
    const key = id || username.toLowerCase();
    return {
      type: "x",
      id,
      username,
      name: String(value.name || (username ? `@${username}` : "X user")).trim().slice(0, 80),
      image: String(value.image || "").trim().slice(0, 1024),
      followers: Math.max(0, Number(value.followers || 0) || 0),
      socialKey: `x:${key.toLowerCase()}`
    };
  }
  return null;
}

function readSocialWalletStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOCIAL_WALLET_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function findSocialWalletRowByAddress(address = "") {
  const target = String(address || "").trim();
  if (!target) return null;
  const store = readSocialWalletStore();
  for (const row of Object.values(store)) {
    if (String(row?.address || "").trim() === target && row?.secretKeyBase64) return row;
  }
  return null;
}

function findSocialWalletRowByIdentity(identity = {}) {
  if (!identity?.socialKey) return null;
  const store = readSocialWalletStore();
  if (store[identity.socialKey]?.secretKeyBase64) return store[identity.socialKey];
  const username = String(identity.username || "").trim().toLowerCase();
  const email = String(identity.email || "").trim().toLowerCase();
  for (const row of Object.values(store)) {
    const rowIdentity = normalizeSocialIdentity(row?.identity || {}) || row?.identity || {};
    if (!row?.secretKeyBase64) continue;
    if (email && String(rowIdentity.email || "").trim().toLowerCase() === email) return row;
    if (username && String(rowIdentity.username || "").trim().toLowerCase() === username) return row;
  }
  return null;
}

function writeSocialWalletStore(store = {}) {
  try {
    localStorage.setItem(SOCIAL_WALLET_STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage failures
  }
}

function socialWalletLabel(identity = {}) {
  return identity.type === "x" ? "X Wallet" : identity.type === "email" ? "Email Wallet" : "App Wallet";
}

async function loadSolanaWeb3ForGeneratedWallet() {
  if (window.solanaWeb3?.Keypair) return window.solanaWeb3;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-solana-web3="true"]');
    if (existing) {
      if (window.solanaWeb3?.Keypair) {
        resolve();
        return;
      }
      existing.remove();
    }
    const script = document.createElement("script");
    script.src = "/vendor/solana-web3.iife.min.js";
    script.async = true;
    script.dataset.solanaWeb3 = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Solana wallet library"));
    document.head.appendChild(script);
  });
  if (!window.solanaWeb3?.Keypair) throw new Error("Solana wallet library did not initialize");
  return window.solanaWeb3;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(Number(byte || 0));
  return btoa(binary);
}

function base64ToBytes(value = "") {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes = new Uint8Array()) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = Number(byte || 0);
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) out += BASE58_ALPHABET[digits[i]];
  return out || BASE58_ALPHABET[0];
}

async function activateGeneratedWallet(row = {}) {
  if (!row?.secretKeyBase64) return null;
  const solanaWeb3 = await loadSolanaWeb3ForGeneratedWallet();
  const keypair = solanaWeb3.Keypair.fromSecretKey(base64ToBytes(row.secretKeyBase64));
  const publicKey = keypair.publicKey.toBase58();
  state.provider = null;
  state.signer = null;
  state.address = "";
  state.walletLabel = socialWalletLabel(row.identity || {});
  state.activeInjectedProvider = null;
  state.solanaProvider = {
    isGeneratedPumprWallet: true,
    publicKey: keypair.publicKey,
    keypair
  };
  state.solanaAddress = publicKey;
  state.solanaWalletLabel = state.walletLabel;
  saveWalletSession({ connected: true, choice: "social", type: "social", address: publicKey });
  window.dispatchEvent(new CustomEvent("etherpump:walletChanged", { detail: walletState() }));
  return { ...walletState(), socialWallet: publicSocialWalletInfo(row) };
}

function publicSocialWalletInfo(row = {}) {
  const identity = normalizeSocialIdentity(row.identity || {}) || row.identity || {};
  return {
    address: String(row.address || "").trim(),
    label: socialWalletLabel(identity),
    chainType: "solana",
    type: identity.type || "social",
    name: identity.name || "",
    email: identity.email || "",
    username: identity.username || "",
    image: identity.image || "",
    createdAt: Number(row.createdAt || 0) || 0
  };
}

export async function connectSocialWallet(identityInput = {}) {
  const identity = saveSocialAuthSession(identityInput);
  if (!identity?.socialKey) throw new Error("Social login did not return a usable identity");
  const store = readSocialWalletStore();
  let row = store[identity.socialKey];
  if (!row?.secretKeyBase64) {
    const solanaWeb3 = await loadSolanaWeb3ForGeneratedWallet();
    const keypair = solanaWeb3.Keypair.generate();
    row = {
      address: keypair.publicKey.toBase58(),
      secretKeyBase64: bytesToBase64(keypair.secretKey),
      identity,
      createdAt: Date.now()
    };
  } else {
    row = { ...row, identity, address: String(row.address || "").trim() };
  }
  store[identity.socialKey] = row;
  if (identity.type === "x" && identity.username) {
    store[`x:${identity.username.toLowerCase()}`] = row;
  }
  writeSocialWalletStore(store);
  return await activateGeneratedWallet(row);
}

export function getGeneratedWalletInfo() {
  const session = readSocialAuthSession();
  if (!session?.socialKey) return null;
  const row = findSocialWalletRowByIdentity(session) || findSocialWalletRowByAddress(state.solanaAddress);
  if (!row?.secretKeyBase64) return null;
  const info = publicSocialWalletInfo(row);
  return info.address && info.address === String(state.solanaAddress || "") ? info : null;
}

export function exportGeneratedWalletPrivateKey() {
  const session = readSocialAuthSession();
  if (!session?.socialKey) throw new Error("No generated X/email wallet is connected");
  const row = findSocialWalletRowByIdentity(session) || findSocialWalletRowByAddress(state.solanaAddress);
  if (!row?.secretKeyBase64) throw new Error("No generated Solana wallet private key was found for this login");
  const address = String(row.address || "").trim();
  if (!state.solanaAddress || address !== state.solanaAddress) {
    throw new Error("Connect the generated X/email wallet before exporting its private key");
  }
  return base58Encode(base64ToBytes(row.secretKeyBase64));
}

export function getSavedWalletChoice() {
  return loadWalletSession().choice || "";
}

export function saveWalletChoice(choice = "") {
  saveWalletSession({ choice: String(choice || "") });
}

export function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEth(weiLike, max = 6) {
  const n = Number(ethers.formatUnits(weiLike, 18));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function formatToken(amountLike, decimals = 18, max = 2) {
  const n = Number(ethers.formatUnits(amountLike, decimals));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function formatCompactUsd(value, maxFractionDigits = 1) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "$0";
  const abs = Math.abs(numeric);
  const fractionDigits = abs >= 100 ? 0 : maxFractionDigits;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: fractionDigits
  }).format(numeric);
}

export function ethToUsd(ethLike, ethUsd = ETH_USD_FALLBACK) {
  const eth = Number(ethLike || 0);
  const usd = eth * Number(ethUsd || ETH_USD_FALLBACK);
  return Number.isFinite(usd) ? usd : 0;
}

export function weiToUsd(weiLike, ethUsd = ETH_USD_FALLBACK) {
  const eth = Number(ethers.formatUnits(weiLike || "0", 18));
  return ethToUsd(eth, ethUsd);
}

function readEthUsdCache() {
  try {
    const raw = localStorage.getItem(ETH_USD_CACHE_KEY);
    const parsed = JSON.parse(raw || "{}");
    const price = Number(parsed?.price || 0);
    const ts = Number(parsed?.ts || 0);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) return null;
    return { price, ts };
  } catch {
    return null;
  }
}

function saveEthUsdCache(price) {
  try {
    localStorage.setItem(ETH_USD_CACHE_KEY, JSON.stringify({ price, ts: Date.now() }));
  } catch {
    // ignore cache write failure
  }
}

export async function fetchEthUsdPrice(force = false) {
  const cached = readEthUsdCache();
  if (!force && cached && Date.now() - cached.ts < ETH_USD_CACHE_TTL_MS) {
    return cached.price;
  }

  const sources = [
    async () => {
      const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", { cache: "no-store" });
      if (!res.ok) throw new Error("coinbase failed");
      const json = await res.json();
      const price = Number(json?.data?.amount || 0);
      if (!Number.isFinite(price) || price <= 0) throw new Error("coinbase invalid");
      return price;
    },
    async () => {
      const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", { cache: "no-store" });
      if (!res.ok) throw new Error("coingecko failed");
      const json = await res.json();
      const price = Number(json?.ethereum?.usd || 0);
      if (!Number.isFinite(price) || price <= 0) throw new Error("coingecko invalid");
      return price;
    }
  ];

  for (const source of sources) {
    try {
      const price = await source();
      saveEthUsdCache(price);
      return price;
    } catch {
      // try next provider
    }
  }

  if (cached?.price) return cached.price;
  return ETH_USD_FALLBACK;
}

export function parseUiError(err) {
  const msg =
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.reason ||
    err?.message ||
    "Unknown error";

  const clean = msg.replace("execution reverted: ", "");
  const low = clean.toLowerCase();

  if (low.includes("insufficient funds")) {
    return "Insufficient ETH for launch fee + liquidity + gas.";
  }
  if (low.includes("insufficient eth for fee+liquidity")) {
    return "Not enough ETH for launch fee plus initial liquidity.";
  }
  if (low.includes("missing revert data")) {
    return "Wallet could not estimate this transaction. Try a smaller trade or retry.";
  }

  return clean;
}

function sanitizeTokenSymbol(symbol = "") {
  const text = String(symbol || "").trim().toUpperCase();
  if (!text) return "ETH";
  return text.slice(0, 6);
}

function stringToHue(input = "") {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function makeFallbackImage(name = "", symbol = "") {
  const label = sanitizeTokenSymbol(symbol || name);
  const seed = stringToHue(`${name}:${symbol}`);
  const hue = 244 + (seed % 18);
  const hue2 = 256 + (seed % 20);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='hsl(${hue} 86% 74%)'/>
        <stop offset='100%' stop-color='hsl(${hue2} 64% 56%)'/>
      </linearGradient>
    </defs>
    <rect width='400' height='400' fill='#120b22'/>
    <circle cx='320' cy='78' r='120' fill='url(#g)' opacity='0.84'/>
    <circle cx='80' cy='340' r='145' fill='url(#g)' opacity='0.76'/>
    <rect x='24' y='24' width='352' height='352' rx='36' fill='none' stroke='rgba(255,255,255,.28)' stroke-width='2'/>
    <text x='200' y='222' text-anchor='middle' fill='white' font-family='Arial' font-size='66' font-weight='700'>${label}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PUMPR_BRAND_IMAGE = "/assets/pump-r-logo.png?v=20260609brand";

function isPumpVerseBrandCoin(coin = {}) {
  const name = String(coin?.name || "").toLowerCase();
  const symbol = String(coin?.symbol || coin?.tokenSymbol || "").toLowerCase();
  return name.includes("pumpverse") || symbol.includes("pumpverse") || symbol === "pumpr";
}

export function resolveCoinImage(coin) {
  if (isPumpVerseBrandCoin(coin)) return PUMPR_BRAND_IMAGE;
  const raw = String(coin?.imageURI || coin?.imageUri || coin?.image || "").trim();
  if (raw) {
    try {
      const parsed = new URL(raw, window.location.origin);
      const isLocalHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      const isStaticAsset = parsed.pathname.startsWith("/uploads/") || parsed.pathname.startsWith("/assets/");
      if (isLocalHost && isStaticAsset) {
        return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // Keep raw image URL fallback.
    }
    return raw;
  }
  return makeFallbackImage(coin?.name || "", coin?.symbol || "");
}

function ensureEip6963Discovery() {
  if (typeof window === "undefined") return;
  if (!eip6963Listening) {
    window.addEventListener("eip6963:announceProvider", (event) => {
      const provider = event?.detail?.provider;
      if (!provider) return;
      const info = event?.detail?.info || {};
      eip6963Providers.set(provider, { provider, info });
    });
    eip6963Listening = true;
  }
  if (!eip6963Requested) {
    eip6963Requested = true;
    try {
      window.dispatchEvent(new Event("eip6963:requestProvider"));
    } catch {
      // ignore
    }
  }
}

function getProviderLocalId(provider) {
  if (!provider) return "unknown";
  const existing = providerIds.get(provider);
  if (existing) return existing;
  providerIdCounter += 1;
  const next = `p${providerIdCounter}`;
  providerIds.set(provider, next);
  return next;
}

function getWalletMeta(injected, info = null) {
  const infoName = String(info?.name || "").trim();
  const hint = `${String(info?.rdns || "")} ${infoName}`.toLowerCase();
  const providerLocalId = getProviderLocalId(injected);
  const infoIdRaw = String(info?.uuid || info?.rdns || infoName || "").trim().toLowerCase();
  const infoId = infoIdRaw.replace(/[^a-z0-9._:-]/g, "-");
  const mk = (key, label) => ({
    id: `${key}:${infoId || providerLocalId}`,
    key,
    label,
    provider: injected
  });

  if (!injected) return mk("unknown", infoName || "Unknown");
  if (hint.includes("phantom") || injected.isPhantom) {
    return mk("phantom", infoName || "Phantom");
  }
  if (injected.isRabby || hint.includes("rabby")) {
    return mk("rabby", infoName || "Rabby");
  }
  if (injected.isMetaMask || hint.includes("metamask")) {
    return mk("metamask", infoName || "MetaMask");
  }
  if (injected.isCoinbaseWallet || hint.includes("coinbase")) {
    return mk("coinbase", infoName || "Coinbase");
  }
  return mk("injected", infoName || "Injected");
}

export function discoverWallets() {
  ensureEip6963Discovery();

  const providers = [];
  for (const row of eip6963Providers.values()) {
    providers.push({ provider: row.provider, info: row.info || null });
  }

  const root = window.ethereum;
  if (root) {
    const injected = Array.isArray(root.providers) && root.providers.length ? root.providers : [root];
    for (const provider of injected) {
      providers.push({ provider, info: null });
    }
  }

  if (!providers.length) {
    state.wallets = [];
    return [];
  }

  const seen = new Set();
  const list = [];

  for (const entry of providers) {
    const provider = entry?.provider;
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    list.push(getWalletMeta(provider, entry?.info || null));
  }

  state.wallets = list;
  return list;
}

export function populateWalletSelect(selectEl) {
  if (!selectEl) return;

  const wallets = discoverWallets();
  const prev = selectEl.value || getSavedWalletChoice() || "metamask";
  const options = [];

  const has = new Set();
  for (const wallet of wallets) {
    if (wallet.key === "metamask" && !has.has("metamask")) {
      options.push({ value: "metamask", label: "MetaMask" });
      has.add("metamask");
      continue;
    }
    if (wallet.key === "rabby" && !has.has("rabby")) {
      options.push({ value: "rabby", label: "Rabby" });
      has.add("rabby");
      continue;
    }
    if (wallet.key === "coinbase" && !has.has("coinbase")) {
      options.push({ value: "coinbase", label: "Coinbase" });
      has.add("coinbase");
    }
  }

  selectEl.innerHTML = options.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("");

  const values = new Set(options.map((opt) => opt.value));
  if (!values.size) {
    selectEl.innerHTML = `<option value="">No wallet detected</option>`;
    selectEl.value = "";
  } else if (values.has(prev)) {
    selectEl.value = prev;
  } else if (values.has("metamask")) {
    selectEl.value = "metamask";
  } else {
    selectEl.value = options[0].value;
  }
}

function resolveWallet(choice = "metamask") {
  const wallets = discoverWallets();
  if (!wallets.length) return null;
  if (!choice) return wallets[0];
  const byId = wallets.find((w) => w.id === choice);
  if (byId) return byId;
  const byKey = wallets.find((w) => w.key === choice);
  if (byKey) return byKey;
  const keyFromComposite = String(choice).split(":")[0];
  if (keyFromComposite) {
    const byParsedKey = wallets.find((w) => w.key === keyFromComposite);
    if (byParsedKey) return byParsedKey;
  }
  return wallets[0];
}

export async function connectWallet(choice = "", options = {}) {
  const silent = Boolean(options?.silent);
  const wallet = resolveWallet(choice || "");
  if (!wallet?.provider) {
    throw new Error("No injected wallet detected.");
  }

  if (!state.provider || state.activeInjectedProvider !== wallet.provider) {
    state.provider = new ethers.BrowserProvider(wallet.provider);
    state.activeInjectedProvider = wallet.provider;
    state.signer = null;
    state.address = "";
    state.walletLabel = wallet.label;
  }

  if (!silent && wallet.key === "metamask" && wallet.provider.request) {
    try {
      await wallet.provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }]
      });
    } catch {
      // optional
    }
  }

  const method = silent ? "eth_accounts" : "eth_requestAccounts";
  const accounts = await state.provider.send(method, []);
  if (!Array.isArray(accounts) || accounts.length === 0) {
    if (silent) return null;
    throw new Error("No wallet account selected");
  }

  state.address = ethers.getAddress(accounts[0]);
  state.signer = await state.provider.getSigner(state.address);
  state.walletLabel = wallet.label;
  await syncPreferredChainIdFromProvider(state.provider);

  if (!walletListenersAttached.has(wallet.provider)) {
    wallet.provider.on?.("accountsChanged", () => window.location.reload());
    wallet.provider.on?.("chainChanged", (nextChain) => {
      const parsed = parseChainIdValue(nextChain);
      if (Number.isFinite(parsed) && parsed > 0) {
        setPreferredChainId(parsed);
        window.dispatchEvent(
          new CustomEvent("etherpump:chainChanged", {
            detail: { chainId: parsed }
          })
        );
      }
    });
    walletListenersAttached.add(wallet.provider);
  }

  // Persist stable wallet key across page reloads; provider IDs may vary by session.
  if (!silent) {
    saveWalletSession({ connected: true, choice: wallet.key, type: "evm", address: state.address });
  }

  return { ...state };
}

function solanaPublicKeyText(value) {
  return String(value?.toBase58?.() || value || "").trim();
}

export function getSolanaProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return window.phantom?.solana || window.solana || null;
}

export function solanaWalletState() {
  return {
    provider: state.solanaProvider,
    address: state.solanaAddress,
    publicKey: state.solanaAddress,
    walletLabel: state.solanaWalletLabel,
    chainType: state.solanaAddress ? "solana" : ""
  };
}

async function signSolanaLoginMessage(provider, publicKey) {
  if (typeof provider?.signMessage !== "function") {
    throw new Error("Phantom did not expose message signing. Unlock Phantom and try again.");
  }
  const message = [
    "Sign in to Pump-r.fun",
    `Wallet: ${publicKey}`,
    `Origin: ${window.location.origin}`,
    `Time: ${new Date().toISOString()}`
  ].join("\n");
  const encoded = new TextEncoder().encode(message);
  await provider.signMessage(encoded, "utf8");
}

export async function connectSolanaWallet(options = {}) {
  const silent = Boolean(options?.silent);
  const requirePrompt = Boolean(options?.requirePrompt || options?.forcePrompt);
  const requireSignature = Boolean(options?.requireSignature);
  const provider = getSolanaProvider();
  if (!provider?.connect) {
    if (silent) return null;
    throw new Error("Install or enable Phantom with a Solana account before using Pump.fun.");
  }

  let response = null;
  try {
    if (!silent && requirePrompt) {
      try {
        await provider.disconnect?.();
      } catch {
        // optional wallet API
      }
      state.solanaProvider = null;
      state.solanaAddress = "";
      state.solanaWalletLabel = "";
    }
    response = await provider.connect(silent ? { onlyIfTrusted: true } : undefined);
  } catch (error) {
    if (silent) return null;
    throw error;
  }

  const publicKey = solanaPublicKeyText(response?.publicKey || provider.publicKey);
  if (!publicKey) {
    if (silent) return null;
    throw new Error("No Solana wallet selected");
  }

  state.solanaProvider = provider;
  state.solanaAddress = publicKey;
  state.solanaWalletLabel = provider.isPhantom ? "Phantom" : "Solana wallet";
  if (!silent && requireSignature) {
    try {
      await signSolanaLoginMessage(provider, publicKey);
    } catch (error) {
      try {
        await provider.disconnect?.();
      } catch {
        // optional wallet API
      }
      state.solanaProvider = null;
      state.solanaAddress = "";
      state.solanaWalletLabel = "";
      throw error;
    }
  }
  if (!silent) {
    saveWalletSession({ connected: true, choice: "phantom", type: "solana", address: publicKey });
  }

  if (!walletListenersAttached.has(provider)) {
    provider.on?.("accountChanged", (publicKeyValue) => {
      state.solanaAddress = solanaPublicKeyText(publicKeyValue || provider.publicKey);
      window.dispatchEvent(new CustomEvent("etherpump:solanaWalletChanged", { detail: solanaWalletState() }));
    });
    provider.on?.("disconnect", () => {
      state.solanaProvider = null;
      state.solanaAddress = "";
      state.solanaWalletLabel = "";
      window.dispatchEvent(new CustomEvent("etherpump:solanaWalletChanged", { detail: solanaWalletState() }));
    });
    walletListenersAttached.add(provider);
  }

  return solanaWalletState();
}

export function disconnectSolanaWallet() {
  try {
    state.solanaProvider?.disconnect?.();
  } catch {
    // optional wallet API
  }
  state.solanaProvider = null;
  state.solanaAddress = "";
  state.solanaWalletLabel = "";
  window.dispatchEvent(new CustomEvent("etherpump:solanaWalletChanged", { detail: solanaWalletState() }));
}

export function disconnectWallet() {
  state.provider = null;
  state.signer = null;
  state.address = "";
  state.walletLabel = "";
  state.activeInjectedProvider = null;
  disconnectSolanaWallet();
  clearSocialAuthSession();
  saveWalletSession({ connected: false, choice: "", type: "evm", address: "" });
  window.dispatchEvent(new CustomEvent("etherpump:walletChanged", { detail: walletState() }));
}

export async function restoreWalletFromSession(choice = "") {
  const session = loadWalletSession();
  if (!session.connected) {
    return null;
  }

  const target = choice || session.choice || "metamask";
  if (session.type === "social" || target === "social") {
    const social = readSocialAuthSession() || recoverSavedSocialIdentity();
    if (!social?.socialKey) {
      disconnectWallet();
      return null;
    }
    const row = findSocialWalletRowByIdentity(social) || findSocialWalletRowByAddress(session.address);
    if (!row?.secretKeyBase64) {
      disconnectWallet();
      return null;
    }
    saveSocialAuthSession(social);
    return await activateGeneratedWallet({ ...row, identity: social });
  }
  if (session.type === "solana" || target === "phantom") {
    const restored = await connectSolanaWallet({ silent: true });
    if (!restored?.provider || !restored?.address) {
      disconnectWallet();
      return null;
    }
    return { ...walletState(), ...restored, chainType: "solana" };
  }
  const restored = await connectWallet(target, { silent: true });
  if (!restored?.signer || !restored?.address) {
    disconnectWallet();
    return null;
  }
  return restored;
}

export function walletState() {
  const generatedWallet = getGeneratedWalletInfo();
  return {
    ...state,
    generatedWallet,
    chainType: state.solanaAddress && !state.signer ? "solana" : state.signer ? "evm" : "",
    publicKey: state.solanaAddress || state.address
  };
}

export function defaultUsername(address) {
  if (!address) return "Guest";
  return `eth_${String(address).slice(2, 8).toLowerCase()}`;
}

function loadProfilesStore() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore corrupt local profile cache
  }
  return {};
}

function saveProfilesStore(store) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage write failures
  }
}

function loadProfileFreshStore() {
  try {
    const raw = localStorage.getItem(PROFILE_REMOTE_FRESH_KEY);
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore corrupt timestamp cache
  }
  return {};
}

function saveProfileFreshStore(store) {
  try {
    localStorage.setItem(PROFILE_REMOTE_FRESH_KEY, JSON.stringify(store));
  } catch {
    // ignore storage write failures
  }
}

function loadProfileFollowersStore() {
  try {
    const raw = localStorage.getItem(PROFILE_FOLLOWERS_STORAGE_KEY);
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore corrupt follower count cache
  }
  return {};
}

function saveProfileFollowersStore(store) {
  try {
    localStorage.setItem(PROFILE_FOLLOWERS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage write failures
  }
}

function cacheFollowerCount(address, count) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return;
  const numeric = Number(count);
  if (!Number.isFinite(numeric) || numeric < 0) return;
  const store = loadProfileFollowersStore();
  store[normalized.toLowerCase()] = { count: Math.floor(numeric), ts: Date.now() };
  saveProfileFollowersStore(store);
}

function readFollowerCountEntry(address) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return null;
  const store = loadProfileFollowersStore();
  const row = store[normalized.toLowerCase()];
  if (!row || typeof row !== "object") return null;
  const count = Number(row.count);
  const ts = Number(row.ts);
  if (!Number.isFinite(count) || count < 0 || !Number.isFinite(ts) || ts <= 0) return null;
  return { count: Math.floor(count), ts };
}

function isFollowerCountFresh(address, ttlMs = PROFILE_FOLLOWERS_TTL_MS) {
  const row = readFollowerCountEntry(address);
  if (!row) return false;
  return Date.now() - row.ts < ttlMs;
}

export function loadCachedFollowerCount(address) {
  const row = readFollowerCountEntry(address);
  return row ? row.count : null;
}

function normalizeProfileAddress(address) {
  try {
    return ethers.getAddress(String(address || "").trim());
  } catch {
    return "";
  }
}

function normalizeProfileValue(address, value = {}) {
  const normalized = normalizeProfileAddress(address);
  const username = String(value.username || "").trim();
  const bio = String(value.bio || "").trim();
  const imageUri = String(value.imageUri || "").trim();
  return {
    address: normalized,
    username: username || defaultUsername(normalized),
    bio: bio.slice(0, 500),
    imageUri: imageUri.slice(0, PROFILE_IMAGE_URI_MAX_LENGTH)
  };
}

function markProfileFresh(address) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return;
  const store = loadProfileFreshStore();
  store[normalized.toLowerCase()] = Date.now();
  saveProfileFreshStore(store);
}

function isProfileFresh(address, ttlMs = PROFILE_REMOTE_TTL_MS) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return false;
  const store = loadProfileFreshStore();
  const freshAt = Number(store[normalized.toLowerCase()] || 0);
  if (!Number.isFinite(freshAt) || freshAt <= 0) return false;
  return Date.now() - freshAt < ttlMs;
}

function withPreferredChain(path) {
  const chainId = getPreferredChainId();
  if (!chainId) return path;
  if (/[?&]chainId=/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}chainId=${chainId}`;
}

async function profileApiGet(path) {
  const res = await fetch(withPreferredChain(path), { cache: "no-store" });
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

async function profileApiPost(path, body) {
  const res = await fetch(withPreferredChain(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const payload = await res.json();
      message = payload.error || message;
    } catch {
      // ignore parse failures
    }
    throw new Error(message);
  }
  return res.json();
}

function cacheProfileLocal(address, value = {}) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return { username: "Guest", bio: "", imageUri: "", address: "" };
  const store = loadProfilesStore();
  const key = normalized.toLowerCase();
  const next = normalizeProfileValue(normalized, value);
  store[key] = {
    username: next.username,
    bio: next.bio,
    imageUri: next.imageUri
  };
  saveProfilesStore(store);
  markProfileFresh(normalized);
  return next;
}

function mergeProfileValues(address, localValue = {}, remoteValue = {}) {
  const normalized = normalizeProfileAddress(address);
  const local = normalizeProfileValue(normalized, localValue || {});
  const remote = normalizeProfileValue(normalized, remoteValue || {});
  const fallbackName = defaultUsername(normalized);

  const localHasCustomName = String(local.username || "") !== fallbackName;
  const remoteHasCustomName = String(remote.username || "") !== fallbackName;

  const username = remoteHasCustomName
    ? remote.username
    : localHasCustomName
      ? local.username
      : remote.username || local.username || fallbackName;
  const bio = String(remote.bio || "").trim() ? remote.bio : local.bio;
  const imageUri = String(remote.imageUri || "").trim() ? remote.imageUri : local.imageUri;

  return normalizeProfileValue(normalized, { username, bio, imageUri });
}

export function loadUserProfile(address) {
  if (!address) return { username: "Guest", bio: "", imageUri: "", address: "" };
  const store = loadProfilesStore();
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return { username: defaultUsername(address), bio: "", imageUri: "", address: "" };
  const key = normalized.toLowerCase();
  const row = store[key] || {};
  return normalizeProfileValue(normalized, row);
}

export async function hydrateFollowerCount(address, options = {}) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return 0;

  const force = Boolean(options?.force);
  if (!force && isFollowerCountFresh(normalized)) {
    return loadCachedFollowerCount(normalized) ?? 0;
  }

  const key = normalized.toLowerCase();
  if (profileFollowersInFlight.has(key)) {
    return profileFollowersInFlight.get(key);
  }

  const task = (async () => {
    try {
      const payload = await profileApiGet(
        `/api/follow/state?viewer=${encodeURIComponent(normalized)}&target=${encodeURIComponent(normalized)}`
      );
      const count = Number(payload?.followersCount || 0);
      cacheFollowerCount(normalized, count);
      return loadCachedFollowerCount(normalized) ?? 0;
    } catch {
      return loadCachedFollowerCount(normalized) ?? 0;
    } finally {
      profileFollowersInFlight.delete(key);
    }
  })();

  profileFollowersInFlight.set(key, task);
  return task;
}

export async function hydrateUserProfile(address, options = {}) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return loadUserProfile(address);
  const force = Boolean(options?.force);
  if (!force && isProfileFresh(normalized)) {
    return loadUserProfile(normalized);
  }
  const key = normalized.toLowerCase();
  if (profileInFlight.has(key)) {
    return profileInFlight.get(key);
  }
  const task = (async () => {
    try {
      const local = loadUserProfile(normalized);
      const remote = await profileApiGet(`/api/user-profile/${normalized}`);
      cacheProfileLocal(normalized, mergeProfileValues(normalized, local, remote || {}));
      return loadUserProfile(normalized);
    } catch {
      return loadUserProfile(normalized);
    } finally {
      profileInFlight.delete(key);
    }
  })();
  profileInFlight.set(key, task);
  return task;
}

export async function hydrateUserProfiles(addresses = [], options = {}) {
  const force = Boolean(options?.force);
  const deduped = [...new Set((Array.isArray(addresses) ? addresses : []).map((row) => normalizeProfileAddress(row)).filter(Boolean))];
  if (!deduped.length) return {};

  const targets = force ? deduped : deduped.filter((address) => !isProfileFresh(address));
  if (targets.length) {
    try {
      const payload = await profileApiPost("/api/user-profiles", { addresses: targets });
      const rows = payload?.profiles && typeof payload.profiles === "object" ? payload.profiles : {};
      for (const [key, value] of Object.entries(rows)) {
        const local = loadUserProfile(key);
        cacheProfileLocal(key, mergeProfileValues(key, local, value || {}));
      }
      for (const missed of targets) {
        if (!rows[missed.toLowerCase()]) {
          markProfileFresh(missed);
        }
      }
    } catch {
      await Promise.allSettled(targets.map((address) => hydrateUserProfile(address, { force: true })));
    }
  }

  const out = {};
  for (const address of deduped) {
    out[address.toLowerCase()] = loadUserProfile(address);
  }
  return out;
}

export async function saveUserProfile(address, value = {}) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) return { username: "Guest", bio: "", imageUri: "", address: "", synced: false };
  const existing = loadUserProfile(normalized);
  const local = cacheProfileLocal(normalized, {
    username: value.username ?? existing.username,
    bio: value.bio ?? existing.bio,
    imageUri: value.imageUri ?? existing.imageUri
  });
  try {
    const remote = await profileApiPost(`/api/user-profile/${normalized}`, local);
    const next = cacheProfileLocal(normalized, remote || local);
    return { ...next, synced: true };
  } catch (error) {
    return {
      ...local,
      synced: false,
      error: String(error?.message || "Profile sync failed")
    };
  }
}

async function getPendingNonce() {
  if (!state.signer || !state.provider) {
    throw new Error("Wallet not connected");
  }

  const address = state.address || (await state.signer.getAddress());

  if (state.activeInjectedProvider?.request) {
    try {
      const hex = await state.activeInjectedProvider.request({
        method: "eth_getTransactionCount",
        params: [address, "pending"]
      });
      if (typeof hex === "string" && hex.startsWith("0x")) {
        return Number(BigInt(hex));
      }
    } catch {
      // fallback below
    }
  }

  return state.provider.getTransactionCount(address, "pending");
}

function cleanTx(raw) {
  const tx = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (v !== undefined && v !== null) tx[k] = v;
  }
  return tx;
}

export async function sendTxWithFallback({ populatedTx, walletNativeSend, label = "Transaction" }) {
  if (!state.signer || !state.provider) {
    throw new Error("Wallet not connected");
  }

  try {
    const txRaw = await populatedTx;
    const tx = cleanTx(txRaw);
    tx.nonce = await getPendingNonce();

    if (tx.gasLimit === undefined) {
      try {
        const gas = await state.signer.estimateGas(tx);
        tx.gasLimit = (gas * 120n) / 100n;
      } catch {
        // wallet can estimate
      }
    }

    return await state.signer.sendTransaction(cleanTx(tx));
  } catch (err) {
    const text = parseUiError(err).toLowerCase();
    const mm = (state.walletLabel || "").toLowerCase().includes("metamask");
    const fallbackEligible = mm && (
      text.includes("missing revert data") ||
      text.includes("internal json-rpc error") ||
      text.includes("could not coalesce error")
    );

    if (!fallbackEligible || !walletNativeSend) {
      throw err;
    }

    return walletNativeSend();
  }
}

export function makeFactoryContract(factoryAddress) {
  if (!state.signer) {
    throw new Error("Connect wallet first");
  }
  return new ethers.Contract(factoryAddress, FACTORY_ABI, state.signer);
}

export function makePoolContract(poolAddress) {
  if (!state.signer) {
    throw new Error("Connect wallet first");
  }
  return new ethers.Contract(poolAddress, POOL_ABI, state.signer);
}

export function makeTokenContract(tokenAddress) {
  if (!state.signer) {
    throw new Error("Connect wallet first");
  }
  return new ethers.Contract(tokenAddress, TOKEN_ABI, state.signer);
}

export function makeRouterContract(routerAddress) {
  if (!state.signer) {
    throw new Error("Connect wallet first");
  }
  return new ethers.Contract(routerAddress, ROUTER_ABI, state.signer);
}
