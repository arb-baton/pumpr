import { api } from "./api.js?v=20260703sharedauth";
import {
  connectSocialWallet,
  defaultUsername,
  hydrateUserProfiles,
  loadUserProfile,
  resolveCoinImage,
  shortAddress,
  walletState
} from "./core.js?v=20260703sharedauth";
import { initTopbarWalletProfile, setAlert, showCopyToast } from "./ui.js?v=20260703profileconsistency";
import { initCoinSearchOverlay } from "./searchModal.js?v=20260703sharedauth";

const X_AUTH_KEY = "Pump-r.community.xauth.v2";

const ui = {
  alert: document.getElementById("alert"),
  layout: document.getElementById("communityLayout"),
  tokenSearchInput: document.getElementById("tokenSearchInput"),
  image: document.getElementById("communityImage"),
  cover: document.getElementById("communityCover"),
  title: document.getElementById("communityTitle"),
  meta: document.getElementById("communityMeta"),
  shareBtn: document.getElementById("communityShareBtn"),
  composer: document.getElementById("communityComposer"),
  composerKicker: document.getElementById("composerKicker"),
  xStep: document.getElementById("communityXStep"),
  holdStep: document.getElementById("communityHoldStep"),
  xIdentityPill: document.getElementById("xIdentityPill"),
  connectXBtn: document.getElementById("connectXBtn"),
  xProfileCard: document.getElementById("xProfileCard"),
  composerWalletBtn: document.getElementById("composerWalletBtn"),
  postInput: document.getElementById("communityPostInput"),
  charCount: document.getElementById("communityCharCount"),
  shareToXCheck: document.getElementById("shareToXCheck"),
  publishBtn: document.getElementById("publishPostBtn"),
  feed: document.getElementById("communityFeed"),
  statPosts: document.getElementById("statPosts"),
  statPosts24h: document.getElementById("statPosts24h"),
  statMembers: document.getElementById("statMembers"),
  communitySideTitle: document.getElementById("communitySideTitle"),
  topCommunitiesList: document.getElementById("topCommunitiesList"),
  topMembersList: document.getElementById("topMembersList"),
  netChip: document.getElementById("networkChip"),
  factoryChip: document.getElementById("factoryChip"),
  profileNavSide: document.getElementById("profileNavSide"),
  walletSelect: document.getElementById("walletChoice"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletLabel: document.getElementById("walletAddress"),
  signInBtn: document.getElementById("signInBtn"),
  tabs: Array.from(document.querySelectorAll("[data-community-tab]"))
};

const state = {
  token: "",
  launch: null,
  posts: [],
  globalPosts: [],
  topCommunities: [],
  stats: null,
  launchesByToken: new Map(),
  xProfile: loadXAuth(),
  activeTab: "top",
  walletControls: null,
  refreshing: false
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function truncateCharacters(value, max) {
  return Array.from(String(value || "").trim()).slice(0, max).join("");
}

function repairMojibakeText(value) {
  const text = String(value || "");
  if (!/[ÃÂâãçðï][\u0080-\u00ff\u2018-\u201e\u2020-\u2026\u2030\u20ac]/.test(text)) return text;
  const win1252 = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
    [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
    [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
    [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
    [0x017e, 0x9e], [0x0178, 0x9f]
  ]);
  const bytes = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (win1252.has(code)) bytes.push(win1252.get(code));
    else if (code <= 0xff) bytes.push(code);
    else return text;
  }
  try {
    const fixed = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes));
    return fixed && fixed !== text ? fixed : text;
  } catch {
    return text;
  }
}

function loadXAuth() {
  try {
    const parsed = JSON.parse(localStorage.getItem(X_AUTH_KEY) || "{}");
    return normalizeXProfile(parsed);
  } catch {
    return null;
  }
}

function normalizeXProfile(value) {
  if (!value || typeof value !== "object") return null;
  const username = String(value.username || value.xHandle || "").replace(/^@+/, "").trim().slice(0, 32);
  if (!username && !value.authorized) return null;
  const name = repairMojibakeText(value.name || username || "X user");
  return {
    authorized: true,
    username,
    name: truncateCharacters(name, 80),
    image: String(value.image || value.profile_image_url || "").trim().slice(0, 1024),
    followers: Math.max(0, Number(value.followers || value.xFollowers || 0) || 0)
  };
}

function decodeBase64UrlJson(value) {
  try {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return null;
  }
}

function saveXAuth(profile) {
  state.xProfile = normalizeXProfile(profile);
  try {
    if (state.xProfile) {
      localStorage.setItem(X_AUTH_KEY, JSON.stringify({ ...state.xProfile, ts: Date.now() }));
    } else {
      localStorage.removeItem(X_AUTH_KEY);
    }
  } catch {
    // ignore
  }
  renderGates();
}

function tokenFromUrl() {
  const pathMatch = window.location.pathname.match(/\/communities\/([^/?#]+)/);
  if (pathMatch?.[1]) return pathMatch[1];
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || params.get("ca") || "";
}

function humanAgo(unix) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000) - Number(unix || 0));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function profileHref(address) {
  return address ? `/profile?address=${encodeURIComponent(address)}` : "/profile";
}

function tokenHref(token) {
  return token ? `/token?token=${encodeURIComponent(token)}` : "/";
}

function communityHref(token) {
  return token ? `/communities/${encodeURIComponent(token)}` : "/communities";
}

function isLikelySolanaAddress(value = "") {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || "").trim());
}

function isEvmAddress(value = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function activeWalletAddress() {
  const ws = walletState();
  return String(ws.address || ws.solanaAddress || "").trim();
}

function activeWalletType() {
  const ws = walletState();
  if (ws.signer && ws.address) return "evm";
  if (ws.solanaAddress) return "solana";
  return "";
}

function isPumpFunLaunch(launch = {}) {
  const chainMarker = String(launch?.chainId || "").toLowerCase();
  const externalUrl = String(launch?.pumpfunUrl || launch?.pumpFunUrl || launch?.externalUrl || launch?.url || "").trim();
  return chainMarker === "pumpfun" || Number(launch?.chainId || 0) === 101 || launch?.source === "pumpfun" || externalUrl.includes("pump.fun/coin/");
}

function currentCommunityChainType() {
  if (!state.token) return "";
  if (isPumpFunLaunch(state.launch)) return "solana";
  if (isEvmAddress(state.token)) return "evm";
  if (isLikelySolanaAddress(state.token)) return "solana";
  return "evm";
}

function walletMatchesCommunity() {
  const walletType = activeWalletType();
  const communityType = currentCommunityChainType();
  return Boolean(walletType && communityType && walletType === communityType);
}

function walletRequirementText() {
  const communityType = currentCommunityChainType();
  if (communityType === "solana") return "Connect Phantom for this Pump.fun community";
  if (communityType === "evm") return "Connect an EVM wallet for this EVM community";
  return "Connect your wallet";
}

function xIntent(text) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  return url.toString();
}

function currentTokenPosts() {
  return state.token ? state.posts : state.globalPosts;
}

function tokenMetaFor(token) {
  const key = String(token || "").toLowerCase();
  return state.launchesByToken.get(key) || (state.launch && String(state.launch.token || "").toLowerCase() === key ? state.launch : null);
}

function authorLabel(address, xHandle = "") {
  if (xHandle) return `@${xHandle}`;
  const profile = loadUserProfile(address);
  return profile.username || defaultUsername(address) || shortAddress(address);
}

function formatFollowers(value) {
  const count = Math.max(0, Number(value || 0) || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return count.toLocaleString();
}

function fallbackAvatar(seed = "") {
  const text = encodeURIComponent(String(seed || "X").slice(0, 2).toUpperCase() || "X");
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23141a22'/%3E%3Ccircle cx='48' cy='48' r='45' fill='none' stroke='%2358e595' stroke-width='4'/%3E%3Ctext x='48' y='57' text-anchor='middle' font-family='Arial,sans-serif' font-size='28' font-weight='700' fill='%23f5fff9'%3E${text}%3C/text%3E%3C/svg%3E`;
}

function xProfilePayload() {
  const profile = state.xProfile || {};
  return {
    xHandle: profile.username || "",
    xName: profile.name || "",
    xImage: profile.image || "",
    xFollowers: profile.followers || 0
  };
}

function coinPill(post) {
  const launch = tokenMetaFor(post.token);
  const symbol = String(launch?.symbol || "coin").toUpperCase();
  return `<a class="community-coin-pill" href="${communityHref(post.token)}">$${escapeHtml(symbol)}</a>`;
}

function renderGates() {
  const address = activeWalletAddress();
  const connected = Boolean(address);
  const walletAllowed = walletMatchesCommunity();
  const xConnected = Boolean(state.xProfile?.authorized && state.xProfile?.username);
  if (ui.signInBtn) ui.signInBtn.textContent = connected ? shortAddress(address) : "Sign in";
  if (ui.profileNavSide) ui.profileNavSide.href = activeWalletType() === "evm" && address ? `/profile?address=${address}` : "/profile";
  if (ui.xIdentityPill) {
    ui.xIdentityPill.textContent = xConnected ? `@${state.xProfile.username}` : "X disconnected";
    ui.xIdentityPill.classList.toggle("connected", xConnected);
  }
  if (ui.connectXBtn) ui.connectXBtn.textContent = xConnected ? "Reconnect X" : "Connect X";
  if (ui.composerWalletBtn) {
    ui.composerWalletBtn.hidden = Boolean(connected && (!state.token || walletAllowed));
    ui.composerWalletBtn.textContent = connected && !walletAllowed ? walletRequirementText() : "Connect wallet";
  }
  if (ui.xStep) ui.xStep.classList.toggle("complete", xConnected);
  if (ui.holdStep) {
    ui.holdStep.textContent = connected && walletAllowed ? "Wallet connected" : walletRequirementText();
    ui.holdStep.classList.toggle("complete", connected && walletAllowed);
  }
  if (ui.xProfileCard) {
    ui.xProfileCard.hidden = !xConnected;
    if (xConnected) {
      const src = state.xProfile.image || fallbackAvatar(state.xProfile.username);
      ui.xProfileCard.innerHTML = `
        <img src="${escapeHtml(src)}" alt="" />
        <span>
          <strong>${escapeHtml(state.xProfile.name || `@${state.xProfile.username}`)}</strong>
          <small>Posting as @${escapeHtml(state.xProfile.username)} · ${formatFollowers(state.xProfile.followers)} followers</small>
        </span>
      `;
    }
  }
  const canPost = Boolean(state.token && connected && walletAllowed && xConnected);
  if (ui.postInput) ui.postInput.disabled = !canPost;
  if (ui.publishBtn) ui.publishBtn.disabled = !canPost;
}

function renderShell() {
  const tokenMode = Boolean(state.token);
  ui.layout?.classList.toggle("community-token", tokenMode);
  ui.layout?.classList.toggle("community-global", !tokenMode);
  ui.composer?.classList.toggle("is-hidden", !tokenMode);
  ui.shareBtn?.classList.toggle("is-hidden", !tokenMode);
  if (ui.communitySideTitle) ui.communitySideTitle.textContent = tokenMode ? "Community stats" : "Top communities";

  const launch = state.launch;
  const symbol = String(launch?.symbol || "coin").toUpperCase();
  const name = String(launch?.name || "Coin communities");
  const image = launch ? resolveCoinImage(launch) : "/assets/pump-r-logo.png?v=20260609brand";
  if (ui.image) ui.image.src = image;
  if (ui.cover) {
    ui.cover.style.backgroundImage = tokenMode
      ? `linear-gradient(180deg, rgba(8,10,18,0.08), rgba(8,10,18,0.82)), url("${image}")`
      : "linear-gradient(110deg, rgba(12,16,25,0.98), rgba(26,48,38,0.82))";
  }
  if (ui.title) ui.title.textContent = tokenMode ? `${name} community` : "Coin communities";
  if (ui.meta) {
    ui.meta.textContent = tokenMode
      ? String(launch?.description || `${symbol} holders and traders are posting here.`)
      : "Latest posts from every coin community, in one timeline.";
  }
  if (ui.composerKicker) ui.composerKicker.textContent = `Post in $${symbol}`;
  renderGates();
}

function renderStats() {
  const tokenMode = Boolean(state.token);
  const stats = state.stats || {};
  if (ui.statPosts) ui.statPosts.textContent = String(tokenMode ? stats.posts || 0 : state.globalPosts.length || 0);
  if (ui.statPosts24h) ui.statPosts24h.textContent = String(tokenMode ? stats.posts24h || 0 : state.topCommunities.length || 0);
  if (ui.statMembers) ui.statMembers.textContent = String(tokenMode ? stats.members || 0 : countGlobalMembers());
}

function countGlobalMembers() {
  const members = new Set();
  for (const post of state.globalPosts) {
    if (post.author) members.add(String(post.author).toLowerCase());
    for (const comment of post.comments || []) {
      if (comment.author) members.add(String(comment.author).toLowerCase());
    }
  }
  return members.size;
}

function buildFallbackGlobalPosts(launches = []) {
  return launches.slice(0, 12).map((launch, index) => ({
    id: `fallback-${launch.token || index}`,
    token: launch.token,
    author: launch.creator || "",
    xHandle: "",
    body: String(launch.description || `${launch.name || "Token"} community is now live.`).slice(0, 240),
    createdAt: Number(launch.createdAt || Math.floor(Date.now() / 1000) - index * 1800),
    likes: [],
    comments: []
  }));
}

function sortedPosts() {
  const rows = [...currentTokenPosts()];
  if (state.activeTab === "recent") {
    return rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }
  if (state.activeTab === "media") {
    return rows.filter((post) => /https?:\/\/|data:image|\.png|\.jpg|\.gif|\.webp/i.test(String(post.body || "")));
  }
  return rows.sort((a, b) => {
    const bScore = (b.likes?.length || 0) + (b.comments?.length || 0) * 2;
    const aScore = (a.likes?.length || 0) + (a.comments?.length || 0) * 2;
    return bScore - aScore || Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
}

function postCard(post) {
  const address = activeWalletAddress();
  const likeKey = activeWalletType() === "evm" ? address.toLowerCase() : address;
  const liked = likeKey && (post.likes || []).includes(likeKey);
  const comments = (post.comments || []).map((comment) => `
    <div class="community-comment">
      <img src="${escapeHtml(comment.xImage || fallbackAvatar(comment.xHandle || comment.author))}" alt="" />
      <a href="${profileHref(comment.author)}">${escapeHtml(authorLabel(comment.author, comment.xHandle))}</a>
      <span>${escapeHtml(comment.body)}</span>
    </div>
  `).join("");
  const shareText = `${post.body}\n\n${window.location.origin}${communityHref(post.token || state.token)}`;
  const avatar = post.xImage || fallbackAvatar(post.xHandle || post.author);
  return `
    <article class="panel-card community-post" data-post-id="${escapeHtml(post.id)}" data-token="${escapeHtml(post.token || state.token)}">
      <div class="community-post-head">
        <img class="community-post-avatar" src="${escapeHtml(avatar)}" alt="" />
        <div class="community-author-line">
          <a href="${profileHref(post.author)}">${escapeHtml(authorLabel(post.author, post.xHandle))}</a>
          ${post.xHandle ? "<span>X</span>" : ""}
          <span>${formatFollowers(post.xFollowers)} followers</span>
          <span>${coinPill(post)}</span>
          <span>${humanAgo(post.createdAt)}</span>
        </div>
      </div>
      <p>${escapeHtml(post.body)}</p>
      <div class="community-post-actions">
        <button class="${liked ? "active" : ""}" type="button" data-action="like">♡ ${(post.likes || []).length}</button>
        <button type="button" data-action="comment">▢ ${(post.comments || []).length}</button>
        <a href="${xIntent(shareText)}" target="_blank" rel="noreferrer noopener">Share</a>
      </div>
      <div class="community-comments">${comments}</div>
      ${state.token ? `
        <form class="community-comment-form">
          <input maxlength="180" placeholder="Comment..." />
          <button type="submit">Comment</button>
        </form>
      ` : ""}
    </article>
  `;
}

function renderFeed() {
  if (!ui.feed) return;
  const rows = sortedPosts();
  if (!rows.length) {
    ui.feed.innerHTML = `<article class="panel-card community-empty">${state.token ? "No posts yet. Connect wallet and X to start this community." : "No community posts yet."}</article>`;
    return;
  }
  ui.feed.innerHTML = rows.map(postCard).join("");
}

function renderTopCommunities() {
  if (!ui.topCommunitiesList) return;
  ui.topCommunitiesList.hidden = Boolean(state.token);
  if (state.token) {
    ui.topCommunitiesList.innerHTML = "";
    return;
  }
  const rows = state.topCommunities.length
    ? state.topCommunities
    : [...state.launchesByToken.values()].slice(0, 6).map((launch, index) => ({
        token: launch.token,
        posts: 0,
        members: 0,
        score: 0,
        rank: index + 1
      }));
  if (!rows.length) {
    ui.topCommunitiesList.innerHTML = `<p class="muted">No communities yet.</p>`;
    return;
  }
  ui.topCommunitiesList.innerHTML = rows.slice(0, 8).map((row, index) => {
    const launch = tokenMetaFor(row.token);
    const symbol = String(launch?.symbol || "coin").toUpperCase();
    const name = String(launch?.name || symbol);
    const image = launch ? resolveCoinImage(launch) : "/assets/pump-r-logo.png?v=20260609brand";
    return `
      <a class="community-top-row" href="${communityHref(row.token)}">
        <span class="community-rank">${index + 1}</span>
        <img src="${escapeHtml(image)}" alt="" />
        <span><strong>$${escapeHtml(symbol)}</strong><small>${escapeHtml(name)} · ${Number(row.posts || 0)} posts</small></span>
        <b>+${Math.max(1, Number(row.score || row.posts || index + 1)).toLocaleString()}%</b>
      </a>
    `;
  }).join("");
}

function renderMembers() {
  if (!ui.topMembersList) return;
  ui.topMembersList.closest(".tokenpf-side-card")?.classList.toggle("is-hidden", !state.token);
  if (!state.token) return;
  const counts = new Map();
  for (const post of state.posts) {
    const key = String(post.author || "").toLowerCase();
    if (key) counts.set(key, {
      address: post.author,
      xHandle: post.xHandle,
      xName: post.xName,
      xImage: post.xImage,
      xFollowers: post.xFollowers,
      count: (counts.get(key)?.count || 0) + 1
    });
    for (const comment of post.comments || []) {
      const commentKey = String(comment.author || "").toLowerCase();
      if (commentKey) counts.set(commentKey, {
        address: comment.author,
        xHandle: comment.xHandle,
        xName: comment.xName,
        xImage: comment.xImage,
        xFollowers: comment.xFollowers,
        count: (counts.get(commentKey)?.count || 0) + 1
      });
    }
  }
  const rows = [...counts.values()].sort((a, b) => Number(b.xFollowers || 0) - Number(a.xFollowers || 0) || b.count - a.count).slice(0, 8);
  ui.topMembersList.innerHTML = rows.length
    ? rows.map((row, index) => `
        <a class="community-member-row" href="${profileHref(row.address)}">
          <b>${index + 1}</b>
          <img src="${escapeHtml(row.xImage || fallbackAvatar(row.xHandle || row.address))}" alt="" />
          <span><strong>${escapeHtml(authorLabel(row.address, row.xHandle))}</strong><small>X ${formatFollowers(row.xFollowers)} · ${row.count} posts</small></span>
        </a>
      `).join("")
    : `<p class="muted">No community members yet.</p>`;
}

async function hydrateLaunchMeta(tokens = []) {
  const missing = [...new Set(tokens.map((token) => String(token || "")).filter(Boolean))]
    .filter((token) => !state.launchesByToken.has(token.toLowerCase()))
    .slice(0, 30);
  const solanaMissing = missing.filter((token) => isLikelySolanaAddress(token) && !isEvmAddress(token));
  if (solanaMissing.length) {
    try {
      const payload = await api.launches(120, 0, { lite: true, includeDex: false, includePumpFun: true, fresh: true });
      const launches = Array.isArray(payload?.launches) ? payload.launches : [];
      for (const launch of launches) {
        if (launch?.token) state.launchesByToken.set(String(launch.token).toLowerCase(), launch);
      }
    } catch {
      // fall through to generic Solana community labels
    }
  }
  await Promise.all(missing.filter((token) => isEvmAddress(token)).map(async (token) => {
    try {
      const payload = await api.token(token, { lite: true });
      if (payload?.launch?.token) state.launchesByToken.set(String(payload.launch.token).toLowerCase(), payload.launch);
    } catch {
      // ignore unavailable tokens
    }
  }));
}

async function loadGlobalCommunities() {
  const [communityPayload, launchesPayload] = await Promise.all([
    api.communities(80),
    api.launches(48, 0, { lite: true, includeDex: true, includePumpFun: true }).catch(() => ({ launches: [] }))
  ]);
  const launches = Array.isArray(launchesPayload?.launches) ? launchesPayload.launches.filter((row) => row?.token) : [];
  for (const launch of launches) state.launchesByToken.set(String(launch.token).toLowerCase(), launch);
  state.topCommunities = Array.isArray(communityPayload.topCommunities) ? communityPayload.topCommunities : [];
  state.globalPosts = Array.isArray(communityPayload.posts) && communityPayload.posts.length
    ? communityPayload.posts
    : buildFallbackGlobalPosts(launches);
  await hydrateLaunchMeta(state.globalPosts.map((post) => post.token));
  const authorAddresses = [...new Set(state.globalPosts.flatMap((post) => [post.author, ...(post.comments || []).map((comment) => comment.author)]).filter(Boolean))];
  await hydrateUserProfiles(authorAddresses).catch(() => {});
}

async function loadTokenCommunity() {
  const isSolanaToken = isLikelySolanaAddress(state.token) && !isEvmAddress(state.token);
  const [tokenPayload, communityPayload] = await Promise.all([
    isSolanaToken
      ? api.launches(120, 0, { lite: true, includeDex: false, includePumpFun: true, fresh: true }).catch(() => null)
      : api.token(state.token, { lite: true }).catch(() => null),
    api.community(state.token, 80)
  ]);
  state.launch = isSolanaToken
    ? (Array.isArray(tokenPayload?.launches) ? tokenPayload.launches : []).find((launch) => String(launch?.token || "").toLowerCase() === String(state.token).toLowerCase()) || {
        token: state.token,
        tokenAddress: state.token,
        chainId: "pumpfun",
        source: "pumpfun",
        symbol: String(state.token).slice(0, 6).toUpperCase(),
        name: "Pump.fun token",
        description: "Pump.fun community"
      }
    : tokenPayload?.launch || null;
  if (state.launch?.token) state.launchesByToken.set(String(state.launch.token).toLowerCase(), state.launch);
  state.posts = Array.isArray(communityPayload.posts) ? communityPayload.posts : [];
  state.stats = communityPayload.stats || null;
  const authorAddresses = [...new Set(state.posts.flatMap((post) => [post.author, ...(post.comments || []).map((comment) => comment.author)]).filter(Boolean))];
  await hydrateUserProfiles(authorAddresses).catch(() => {});
}

async function refreshCommunity({ silent = false } = {}) {
  if (state.refreshing) return;
  state.refreshing = true;
  try {
    state.token = tokenFromUrl();
    if (state.token) await loadTokenCommunity();
    else await loadGlobalCommunities();
    renderShell();
    renderStats();
    renderTopCommunities();
    renderMembers();
    renderFeed();
  } catch (error) {
    if (!silent) throw error;
    console.warn("[communities] live refresh failed", error);
  } finally {
    state.refreshing = false;
  }
}

async function loadPage() {
  await refreshCommunity();
}

function scheduleLiveRefresh(delay = 0) {
  window.setTimeout(() => {
    if (document.hidden) return;
    refreshCommunity({ silent: true });
  }, Math.max(0, Number(delay || 0)));
}

function startXOAuth() {
  const address = activeWalletAddress();
  if (!address) {
    setAlert(ui.alert, "Connect wallet before authorizing X", true);
    state.walletControls?.connect();
    return;
  }
  if (state.token && !walletMatchesCommunity()) {
    setAlert(ui.alert, walletRequirementText(), true);
    return;
  }
  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/api/x/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
}

async function publishPost() {
  const address = activeWalletAddress();
  const body = String(ui.postInput?.value || "").trim();
  if (!state.token) throw new Error("Open a token community first");
  if (!address) throw new Error("Connect wallet first");
  if (!walletMatchesCommunity()) throw new Error(walletRequirementText());
  if (!state.xProfile?.username) throw new Error("Authorize X first");
  if (!body) throw new Error("Write a post first");
  const payload = await api.communityPost(state.token, {
    author: address,
    ...xProfilePayload(),
    body
  });
  if (ui.shareToXCheck?.checked) {
    window.open(xIntent(`${body}\n\n${window.location.origin}${communityHref(state.token)}`), "_blank", "noopener,noreferrer");
  }
  ui.postInput.value = "";
  updateCharCount();
  state.posts = [payload.post, ...state.posts.filter((post) => post.id !== payload.post.id)];
  state.stats = payload.stats;
  renderStats();
  renderMembers();
  renderFeed();
  scheduleLiveRefresh(350);
}

function updateCharCount() {
  if (ui.charCount && ui.postInput) ui.charCount.textContent = `${ui.postInput.value.length}/280`;
}

function setupEvents() {
  ui.composerWalletBtn?.addEventListener("click", () => state.walletControls?.connect());
  ui.connectXBtn?.addEventListener("click", startXOAuth);
  ui.postInput?.addEventListener("input", updateCharCount);
  ui.publishBtn?.addEventListener("click", () => publishPost().catch((err) => setAlert(ui.alert, err.message, true)));
  for (const button of ui.tabs) {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.communityTab || "top";
      for (const row of ui.tabs) row.classList.toggle("active", row === button);
      renderFeed();
    });
  }
  ui.feed?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action='like']");
    if (!button) return;
    const postEl = event.target.closest("[data-post-id]");
    const address = activeWalletAddress();
    if (!address) {
      setAlert(ui.alert, "Connect wallet first", true);
      return;
    }
    const token = postEl?.dataset?.token || state.token;
    const previousToken = state.token;
    const previousLaunch = state.launch;
    if (!state.token && token) {
      state.token = token;
      state.launch = tokenMetaFor(token);
    }
    const allowed = walletMatchesCommunity();
    state.token = previousToken;
    state.launch = previousLaunch;
    if (!allowed) {
      setAlert(ui.alert, isLikelySolanaAddress(token) && !isEvmAddress(token) ? "Connect Phantom for this Pump.fun community" : "Connect an EVM wallet for this EVM community", true);
      return;
    }
    const postId = postEl?.dataset?.postId || "";
    const source = state.token ? state.posts : state.globalPosts;
    const current = source.find((post) => post.id === postId);
    const likeKey = activeWalletType() === "evm" ? address.toLowerCase() : address;
    const liked = !(current?.likes || []).includes(likeKey);
    const payload = await api.communityLike(token, postId, address, liked);
    const replace = (post) => post.id === payload.post.id ? payload.post : post;
    if (state.token) state.posts = state.posts.map(replace);
    else state.globalPosts = state.globalPosts.map(replace);
    state.stats = payload.stats;
    renderStats();
    renderFeed();
    scheduleLiveRefresh(350);
  });
  ui.feed?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target.closest(".community-comment-form");
    const postEl = event.target.closest("[data-post-id]");
    const address = activeWalletAddress();
    if (!address) {
      setAlert(ui.alert, "Connect wallet first", true);
      return;
    }
    if (!walletMatchesCommunity()) {
      setAlert(ui.alert, walletRequirementText(), true);
      return;
    }
    if (!state.xProfile?.username) {
      setAlert(ui.alert, "Authorize X first", true);
      return;
    }
    const input = form?.querySelector("input");
    const body = String(input?.value || "").trim();
    if (!body) return;
    const payload = await api.communityComment(state.token, postEl?.dataset?.postId || "", {
      author: address,
      ...xProfilePayload(),
      body
    });
    if (input) input.value = "";
    state.posts = state.posts.map((post) => post.id === payload.post.id ? payload.post : post);
    state.stats = payload.stats;
    renderStats();
    renderMembers();
    renderFeed();
    scheduleLiveRefresh(350);
  });
  ui.shareBtn?.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showCopyToast("Community link copied");
    } catch {
      window.open(xIntent(url), "_blank", "noopener,noreferrer");
    }
  });
}

async function init() {
  state.xProfile = loadXAuth();
  const params = new URLSearchParams(window.location.search);
  if (params.get("x") === "authorized") {
    const xUser = decodeBase64UrlJson(params.get("x_user"));
    saveXAuth(xUser || { authorized: true });
    if (xUser?.username || xUser?.id) {
      await connectSocialWallet({
        type: "x",
        id: String(xUser.id || ""),
        username: String(xUser.username || ""),
        name: String(xUser.name || xUser.username || "X user"),
        image: String(xUser.image || ""),
        followers: Math.max(0, Number(xUser.followers || 0) || 0)
      });
    }
    params.delete("x");
    params.delete("x_user");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }
  renderGates();
  updateCharCount();
  setupEvents();
  state.walletControls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    walletSelect: ui.walletSelect,
    walletLabel: ui.walletLabel,
    alertEl: ui.alert,
    onChange: renderGates
  });
  initCoinSearchOverlay({ triggerInputs: [ui.tokenSearchInput] });
  try {
    const cfg = await api.config();
    if (ui.netChip) ui.netChip.textContent = `Chain ${cfg.chainId}`;
    if (ui.factoryChip) ui.factoryChip.textContent = shortAddress(cfg.factoryAddress);
  } catch {
    // keep default chips
  }
  await loadPage();
  window.setInterval(() => {
    if (!document.hidden) refreshCommunity({ silent: true });
  }, 8000);
}

init().catch((err) => {
  console.error("[communities] init failed", err);
  setAlert(ui.alert, err.message || "Community failed to load", true);
  renderShell();
  renderFeed();
});
