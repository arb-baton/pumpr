import { getPreferredChainId } from "./core.js?v=20260703sharedauth";

function withPreferredChain(path) {
  const chainId = getPreferredChainId();
  if (!chainId) return path;
  if (/[?&](chainId|allChains)=/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}chainId=${chainId}`;
}

export async function apiGet(path) {
  const target = withPreferredChain(path);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 25000);
  const res = await fetch(target, { cache: "no-store", signal: ctrl.signal }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export async function apiPost(path, body) {
  const target = withPreferredChain(path);
  const ctrl = new AbortController();
  const timeoutMs = path.startsWith("/api/pumpfun/") || path.startsWith("/api/agents/") ? 60000 : 15000;
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    signal: ctrl.signal
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const payload = await res.json();
      message = payload.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export async function apiDelete(path) {
  const target = withPreferredChain(path);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(target, {
    method: "DELETE",
    signal: ctrl.signal
  }).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const payload = await res.json();
      message = payload.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export const api = {
  health: () => apiGet("/api/health"),
  config: (options = {}) => {
    const chainId = Number(options.chainId || 0);
    const params = new URLSearchParams();
    if (chainId > 0) params.set("chainId", String(Math.floor(chainId)));
    if (options.quote) params.set("quote", String(options.quote));
    const qs = params.toString();
    return apiGet(`/api/config${qs ? `?${qs}` : ""}`);
  },
  stats: () => apiGet("/api/stats"),
  launches: (limit = 20, offset = 0, options = {}) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      includeDex: options.includeDex === false ? "0" : "1"
    });
    if (options.lite) params.set("lite", "1");
    if (options.fresh) params.set("fresh", "1");
    if (options.includePumpFun) params.set("includePumpFun", "1");
    if (options.allChains) params.set("allChains", "1");
    if (options.home) params.set("home", "1");
    if (options.pumpFunOnly) params.set("pumpFunOnly", "1");
    if (Number.isFinite(Number(options.chainId))) params.set("chainId", String(Math.floor(Number(options.chainId))));
    if (options.quote) params.set("quote", String(options.quote));
    return apiGet(`/api/launches?${params.toString()}`);
  },
  token: (tokenAddress, options = {}) => {
    const params = new URLSearchParams();
    if (options.fresh) params.set("fresh", "1");
    if (options.lite) params.set("lite", "1");
    if (Number.isFinite(Number(options.launchId))) params.set("launchId", String(Math.floor(Number(options.launchId))));
    if (Number.isFinite(Number(options.chainId))) params.set("chainId", String(Math.floor(Number(options.chainId))));
    if (options.quote) params.set("quote", String(options.quote));
    const qs = params.toString();
    return apiGet(`/api/token/${tokenAddress}${qs ? `?${qs}` : ""}`);
  },
  profile: (address, options = {}) => {
    const params = new URLSearchParams();
    if (options.includeSocial) params.set("includeSocial", "1");
    if (options.fresh) params.set("fresh", "1");
    const qs = params.toString();
    return apiGet(`/api/profile/${encodeURIComponent(String(address || ""))}${qs ? `?${qs}` : ""}`);
  },
  userProfile: (address) => apiGet(`/api/user-profile/${address}`),
  userProfiles: (addresses = []) => apiPost("/api/user-profiles", { addresses }),
  saveUserProfile: (address, body = {}) => apiPost(`/api/user-profile/${address}`, body),
  followState: (viewer, target) =>
    apiGet(`/api/follow/state?viewer=${encodeURIComponent(String(viewer || ""))}&target=${encodeURIComponent(String(target || ""))}`),
  setFollow: (viewer, target, follow) =>
    apiPost("/api/follow", {
      viewer,
      target,
      follow: Boolean(follow)
    }),
  communities: (limit = 80) => apiGet(`/api/communities?limit=${encodeURIComponent(String(limit || 80))}`),
  community: (token, limit = 60) =>
    apiGet(`/api/community/${encodeURIComponent(String(token || ""))}?limit=${encodeURIComponent(String(limit || 60))}`),
  communityPost: (token, body = {}) => apiPost(`/api/community/${encodeURIComponent(String(token || ""))}/post`, body),
  communityComment: (token, postId, body = {}) =>
    apiPost(
      `/api/community/${encodeURIComponent(String(token || ""))}/posts/${encodeURIComponent(String(postId || ""))}/comment`,
      body
    ),
  communityLike: (token, postId, address, liked) =>
    apiPost(`/api/community/${encodeURIComponent(String(token || ""))}/posts/${encodeURIComponent(String(postId || ""))}/like`, {
      address,
      liked: Boolean(liked)
    }),
  go: (tab = "trending", limit = 80, options = {}) => {
    const params = new URLSearchParams({
      tab: String(tab || "trending"),
      limit: String(limit || 80)
    });
    if (options.fresh) params.set("fresh", "1");
    return apiGet(`/api/go?${params.toString()}`);
  },
  goConfig: () => apiGet("/api/go/config"),
  goBounty: (id) => apiGet(`/api/go/bounties/${encodeURIComponent(String(id || ""))}`),
  createGoBounty: (body = {}) => apiPost("/api/go/bounties", body),
  submitGoWork: (id, body = {}) => apiPost(`/api/go/bounties/${encodeURIComponent(String(id || ""))}/submissions`, body),
  releaseGoBounty: (id, body = {}) => apiPost(`/api/go/bounties/${encodeURIComponent(String(id || ""))}/release`, body),
  agents: (owner = "") => apiGet(`/api/agents${owner ? `?owner=${encodeURIComponent(String(owner))}` : ""}`),
  saveAgent: (body = {}) => apiPost("/api/agents", body),
  agentPost: (id, body = {}) => apiPost(`/api/agents/${encodeURIComponent(String(id || ""))}/posts`, body),
  agentDraftBounty: (id, body = {}) => apiPost(`/api/agents/${encodeURIComponent(String(id || ""))}/draft-bounty`, body),
  agentRunBounty: (id, body = {}) => apiPost(`/api/agents/${encodeURIComponent(String(id || ""))}/run-bounty`, body),
  alpha: (limit = 80) => apiGet(`/api/alpha?limit=${encodeURIComponent(String(limit || 80))}`),
  alphaTip: (id, viewer = "") => {
    const params = new URLSearchParams();
    if (viewer) params.set("viewer", String(viewer));
    const qs = params.toString();
    return apiGet(`/api/alpha/${encodeURIComponent(String(id || ""))}${qs ? `?${qs}` : ""}`);
  },
  createAlphaTip: (body = {}) => apiPost("/api/alpha", body),
  voteAlphaTip: (id, body = {}) => apiPost(`/api/alpha/${encodeURIComponent(String(id || ""))}/vote`, body),
  commentAlphaTip: (id, body = {}) => apiPost(`/api/alpha/${encodeURIComponent(String(id || ""))}/comment`, body),
  recordAlphaTip: (id, body = {}) => apiPost(`/api/alpha/${encodeURIComponent(String(id || ""))}/tip`, body),
  pumprCardWaitlist: (body = {}) => apiPost("/api/pumpr-card/waitlist", body),
  supportConfig: () => apiGet("/api/support/config"),
  supportMessages: (address) => apiGet(`/api/support/messages?address=${encodeURIComponent(String(address || ""))}`),
  supportInbox: (address) => apiGet(`/api/support/inbox?address=${encodeURIComponent(String(address || ""))}`),
  sendSupportMessage: (body = {}) => apiPost("/api/support/message", body),
  pumpfunCoin: (mint) => apiGet(`/api/pumpfun/coin/${encodeURIComponent(String(mint || ""))}`),
  launchAvailability: (options = {}) => {
    const params = new URLSearchParams();
    if (options.name) params.set("name", String(options.name));
    if (options.symbol) params.set("symbol", String(options.symbol));
    return apiGet(`/api/launch-availability?${params.toString()}`);
  },
  pumpfunLaunch: (body = {}) => apiPost("/api/pumpfun/launch", body),
  pumpfunFinalize: (body = {}) => apiPost("/api/pumpfun/finalize", body),
  pumpfunKolBuy: (body = {}) => apiPost("/api/pumpfun/kol-buy", body),
  pumpfunKolTransfer: (body = {}) => apiPost("/api/pumpfun/kol-transfer", body),
  pumpfunSession: (owner) => apiGet(`/api/pumpfun/session/${encodeURIComponent(String(owner || ""))}`),
  savePumpfunSession: (body = {}) => apiPost("/api/pumpfun/session", body),
  clearPumpfunSession: (owner) => apiDelete(`/api/pumpfun/session/${encodeURIComponent(String(owner || ""))}`),
  pumpfunBountyDraft: (body = {}) => apiPost("/api/pumpfun/bounty-submission/draft", body),
  pumpfunBountyFeeTransaction: (body = {}) => apiPost("/api/pumpfun/bounty-submission/fee-transaction", body),
  pumpfunBountyPublish: (body = {}) => apiPost("/api/pumpfun/bounty-submission/publish", body),
  pumpfunPreparedSubmit: (id, body = {}) => apiPost(`/api/pumpfun/prepared/${encodeURIComponent(String(id || ""))}/submit`, body),
  solanaSendTransaction: (body = {}) => apiPost("/api/solana/send-transaction", body),
  officialAirdrop: () => apiGet("/api/airdrop/official"),
  holderEligibility: (options = {}) => {
    const params = new URLSearchParams();
    if (options.address) params.set("address", String(options.address));
    if (options.solanaAddress) params.set("solanaAddress", String(options.solanaAddress));
    if (options.launchMode) params.set("launchMode", String(options.launchMode));
    if (Number.isFinite(Number(options.targetChainId))) params.set("targetChainId", String(Math.floor(Number(options.targetChainId))));
    return apiGet(`/api/holder/eligibility?${params.toString()}`);
  },
  airdropPreview: (options = {}) => {
    const params = new URLSearchParams();
    if (options.token) params.set("token", String(options.token));
    if (Number.isFinite(Number(options.chainId))) params.set("chainId", String(Math.floor(Number(options.chainId))));
    if (options.quote) params.set("quote", String(options.quote));
    if (Number.isFinite(Number(options.limit))) params.set("limit", String(Math.floor(Number(options.limit))));
    if (options.fresh) params.set("fresh", "1");
    return apiGet(`/api/airdrop/preview?${params.toString()}`);
  },
  uploadImage: (dataUrl, options = {}) => apiPost("/api/upload-image", { dataUrl, ...options }),
  uploadFile: (dataUrl) => apiPost("/api/upload-file", { dataUrl })
};
