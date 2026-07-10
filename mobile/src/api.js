import Constants from "expo-constants";
import { demoCoins, alphaTips, bounties } from "./mockData";

const PROD_API_BASE = "https://pump-r.fun";

function normalizeApiBase(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return PROD_API_BASE;
  try {
    const parsed = new URL(raw);
    const isLocal =
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname.endsWith(".local");
    return !__DEV__ && isLocal ? PROD_API_BASE : raw;
  } catch {
    return PROD_API_BASE;
  }
}

const API_BASE = normalizeApiBase(process.env.EXPO_PUBLIC_API_BASE_URL || Constants?.expoConfig?.extra?.apiBaseUrl);

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) throw new Error(`Request failed ${res.status}`);
  return res.json();
}

function normalizeLaunch(row = {}) {
  const chainId = Number(row.chainId || 1);
  const chain = row.source === "pumpfun" || chainId === 101 ? "SOL" : chainId === 8453 ? "BASE" : chainId === 143 ? "MONAD" : "ETH";
  const mc = Number(row?.dexSnapshot?.marketCapUsd || row?.pool?.marketCapQuote || row?.pool?.marketCapEth || 0);
  return {
    id: String(row.token || row.mint || row.id || Math.random()),
    name: row.name || "Coin",
    symbol: row.symbol || "TOKEN",
    subtitle: row.description || row.creatorName || "live launch",
    mc: mc > 0 ? `$${mc >= 1000 ? `${(mc / 1000).toFixed(1)}K` : mc.toFixed(0)}` : "Syncing",
    change: row.source === "pumpfun" ? "+6.2%" : "+0.7%",
    multiple: row.source === "pumpfun" ? "8x" : "4x",
    chain,
    quote: String(row?.pool?.quoteAsset?.symbol || row.quoteMode || "").toUpperCase() === "USDC" ? "USDC" : "",
    image: row.imageUri || row.imageURI || row.image || `${API_BASE}/assets/pump-r-logo.png`,
    age: "now",
    description: row.description || "Pump-r launch",
    address: row.token || row.mint || "",
    holders: Number(row.holders || 0),
    externalUrl: row.pumpfunUrl || row.externalUrl || ""
  };
}

export async function loadHomeFeed() {
  try {
    const payload = await request("/api/launches?limit=40&offset=0&includeDex=1&lite=1&chainId=1");
    const launches = Array.isArray(payload.launches) ? payload.launches.map(normalizeLaunch) : [];
    return launches.length ? launches : demoCoins;
  } catch {
    return demoCoins;
  }
}

export async function loadAlpha() {
  try {
    const payload = await request("/api/alpha?limit=20");
    const tips = Array.isArray(payload.tips) ? payload.tips : [];
    return tips.map((tip) => ({
      id: tip.id,
      title: tip.title,
      project: tip.projectName,
      symbol: tip.tokenSymbol,
      chain: Number(tip.chainId) === 101 ? "SOL" : Number(tip.chainId) === 8453 ? "BASE" : Number(tip.chainId) === 143 ? "MONAD" : "ETH",
      score: Number(tip.upvotes || 0) - Number(tip.downvotes || 0),
      author: tip.xHandle ? `@${tip.xHandle}` : tip.authorName || "alpha",
      teaser: tip.teaser || tip.body || "",
      comments: Array.isArray(tip.comments) ? tip.comments.length : 0
    }));
  } catch {
    return alphaTips;
  }
}

export async function loadGo() {
  try {
    const payload = await request("/api/go");
    const rows = Array.isArray(payload.bounties) ? payload.bounties : [];
    return rows.length
      ? rows.map((row) => ({
          id: row.id,
          title: row.title,
          reward: `$${Number(row.rewardUsd || 0).toLocaleString()}`,
          token: `${row.tokenAmount || ""} ${row.tokenUnit || ""}`.trim(),
          status: String(row.status || "OPEN").toUpperCase(),
          subs: Array.isArray(row.submissions) ? row.submissions.length : Number(row.submissionCount || 0),
          left: "live",
          creator: row.creatorName || "creator"
        }))
      : bounties;
  } catch {
    return bounties;
  }
}

export { API_BASE };
