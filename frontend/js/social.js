import { api } from "./api.js?v=20260705socialbeta";
import {
  hydrateUserProfile,
  loadUserProfile,
  saveUserProfile,
  shortAddress,
  solanaWalletState,
  walletState
} from "./core.js?v=20260706mobileauth";
import { initTopbarWalletProfile, showCopyToast } from "./ui.js?v=20260706mobileauth";

const REFRESH_MS = 40_000;
const BOOKMARK_KEY = "pumpr.social.bookmarks.v1";

const ui = {
  signInBtn: document.getElementById("signInBtn"),
  topComposeBtn: document.getElementById("socialComposeTopBtn"),
  leftComposeBtn: document.getElementById("socialLeftComposeBtn"),
  search: document.getElementById("socialSearchInput"),
  navButtons: [...document.querySelectorAll("[data-social-view]")],
  tabWrap: document.getElementById("socialTabs"),
  tabs: [...document.querySelectorAll("[data-social-tab]")],
  timelineKicker: document.getElementById("socialTimelineKicker"),
  timelineTitle: document.getElementById("socialTimelineTitle"),
  timelineSub: document.getElementById("socialTimelineSub"),
  refreshBtn: document.getElementById("socialRefreshBtn"),
  composer: document.getElementById("socialComposer"),
  avatar: document.getElementById("socialComposerAvatar"),
  meAvatar: document.getElementById("socialMeAvatar"),
  meName: document.getElementById("socialMeName"),
  meHandle: document.getElementById("socialMeHandle"),
  walletCopyBtn: document.getElementById("socialWalletCopyBtn"),
  myTier: document.getElementById("socialMyTier"),
  myXp: document.getElementById("socialMyXp"),
  myPosts: document.getElementById("socialMyPosts"),
  body: document.getElementById("socialPostBody"),
  token: document.getElementById("socialPostToken"),
  chain: document.getElementById("socialPostChain"),
  media: document.getElementById("socialPostMedia"),
  mediaFile: document.getElementById("socialPostMediaFile"),
  mediaPreview: document.getElementById("socialPostMediaPreview"),
  mediaPreviewFrame: document.querySelector("#socialPostMediaPreview .socialx-media-preview-frame"),
  mediaName: document.getElementById("socialPostMediaName"),
  mediaHint: document.getElementById("socialPostMediaHint"),
  mediaRemoveBtn: document.getElementById("socialPostMediaRemoveBtn"),
  postBtn: document.getElementById("socialPostBtn"),
  postStatus: document.getElementById("socialPostStatus"),
  editProfileBtn: document.getElementById("socialEditProfileBtn"),
  profileOverlay: document.getElementById("socialProfileOverlay"),
  profileCloseBtn: document.getElementById("socialProfileCloseBtn"),
  handleInput: document.getElementById("socialHandleInput"),
  displayInput: document.getElementById("socialDisplayInput"),
  imageInput: document.getElementById("socialImageInput"),
  imagePreview: document.getElementById("socialProfileImagePreview"),
  imageFile: document.getElementById("socialProfileImageFile"),
  imageRemoveBtn: document.getElementById("socialProfileImageRemoveBtn"),
  bioInput: document.getElementById("socialBioInput"),
  profileSaveBtn: document.getElementById("socialProfileSaveBtn"),
  profileStatus: document.getElementById("socialProfileStatus"),
  feed: document.getElementById("socialFeed"),
  trends: document.getElementById("socialTrends"),
  leaderboard: document.getElementById("socialLeaderboard"),
  threadOverlay: document.getElementById("socialThreadOverlay"),
  threadCloseBtn: document.getElementById("socialThreadCloseBtn"),
  threadContent: document.getElementById("socialThreadContent"),
  threadReplyInput: document.getElementById("socialThreadReplyInput"),
  threadReplyBtn: document.getElementById("socialThreadReplyBtn")
};

let activeView = "feed";
let activeTab = "for-you";
let feedPayload = { posts: [], leaderboard: [] };
let currentSocialProfile = null;
let currentStats = null;
let walletControls = null;
let refreshTimer = null;
let searchTimer = null;
let openThreadId = "";
let pendingImageUri = "";
let pendingPostMediaUri = "";

const TAB_COPY = {
  "for-you": {
    kicker: "Pump-r Social beta",
    title: "Home feed",
    sub: "Crypto-native feed for launches, alpha, holder updates, and creator rewards.",
    empty: "No posts yet. Be early and make the first one."
  },
  launches: {
    kicker: "Launch radar",
    title: "Launch feed",
    sub: "New Pump-r launches, contract posts, creator updates, and migration notes.",
    empty: "No launch posts yet. Launch a token or post a contract update."
  },
  alpha: {
    kicker: "Alpha desk",
    title: "Alpha feed",
    sub: "Signals, watchlists, holder flow, and useful on-chain notes from the community.",
    empty: "No alpha posts yet. Drop the kind of signal people will screenshot later."
  },
  rewards: {
    kicker: "Reward stream",
    title: "Rewards feed",
    sub: "Airdrops, XP events, holder rewards, referrals, and creator reward updates.",
    empty: "No reward posts yet. Reward updates will show here."
  }
};

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function connectedWallet() {
  const ws = walletState();
  const sol = solanaWalletState();
  return ws.generatedWallet?.address || sol.address || ws.solanaAddress || ws.address || "";
}

function normalizeHandle(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

function connectedIdentity() {
  const wallet = connectedWallet();
  const ws = walletState();
  const generated = ws.generatedWallet || {};
  const local = wallet ? loadUserProfile(wallet) : {};
  const username = local?.username || generated.name || generated.username || generated.xUsername || "";
  return {
    wallet,
    handle: normalizeHandle(currentSocialProfile?.handle || username || shortAddress(wallet || "")),
    displayName: currentSocialProfile?.displayName || local?.username || generated.name || generated.username || shortAddress(wallet || ""),
    bio: currentSocialProfile?.bio || local?.bio || "",
    imageUri: local?.imageUri || currentSocialProfile?.imageUri || generated.image || "",
    source: generated.type || (ws.address ? "wallet" : "social"),
    xUsername: generated.username || generated.xUsername || ""
  };
}

function mergedSocialIdentity(profile = currentSocialProfile) {
  const identity = connectedIdentity();
  const wallet = identity.wallet;
  const local = wallet ? loadUserProfile(wallet) : {};
  const social = profile || {};
  return {
    ...identity,
    ...social,
    handle: normalizeHandle(social.handle || identity.handle || shortAddress(wallet || "")),
    displayName: social.displayName || identity.displayName || shortAddress(wallet || ""),
    bio: social.bio || identity.bio || "",
    imageUri: local?.imageUri || social.imageUri || identity.imageUri || ""
  };
}

function initials(name = "") {
  const cleaned = String(name || "PR").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return cleaned.slice(0, 2).toUpperCase() || "PR";
}

function formatNumber(value = 0) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.floor(n).toLocaleString();
}

function formatAge(ts = 0) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts || 0));
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return "now";
}

function status(el, text = "", tone = "") {
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
}

function setButtonBusy(button, busy, text = "") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent || "";
    button.textContent = text || "Working...";
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
  button.disabled = Boolean(busy);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

async function uploadProfileImage(file) {
  if (!file) return;
  if (!/^image\//i.test(file.type || "")) {
    status(ui.profileStatus, "Choose an image file.", "warn");
    return;
  }
  if (file.size > 2.5 * 1024 * 1024) {
    status(ui.profileStatus, "Image is too large. Use something under 2.5 MB.", "warn");
    return;
  }
  status(ui.profileStatus, "Uploading profile image...", "");
  try {
    const dataUrl = await fileToDataUrl(file);
    renderImagePreview(dataUrl, ui.displayInput?.value || "PR");
    const uploaded = await api.uploadImage(dataUrl);
    pendingImageUri = uploaded?.url || uploaded?.imageUrl || uploaded?.imageUri || dataUrl;
    if (ui.imageInput) ui.imageInput.value = pendingImageUri;
    renderImagePreview(pendingImageUri, ui.displayInput?.value || "PR");
    status(ui.profileStatus, "Image ready. Save profile to apply it.", "ok");
  } catch (error) {
    status(ui.profileStatus, error.message || "Could not upload image.", "error");
  } finally {
    if (ui.imageFile) ui.imageFile.value = "";
  }
}

function renderPostMediaPreview(uri = "", name = "") {
  if (!ui.mediaPreview || !ui.mediaPreviewFrame) return;
  const src = String(uri || "").trim();
  const label = name || (src ? "Media ready" : "");
  ui.mediaPreview.hidden = !src;
  ui.mediaPreviewFrame.innerHTML = "";
  if (!src) {
    if (ui.mediaName) ui.mediaName.textContent = "";
    if (ui.mediaHint) ui.mediaHint.textContent = "";
    return;
  }
  const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(src) || /^data:video\//i.test(src);
  if (isVideo) {
    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.controls = true;
    ui.mediaPreviewFrame.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "Post media preview";
    ui.mediaPreviewFrame.appendChild(img);
  }
  if (ui.mediaName) ui.mediaName.textContent = label;
  if (ui.mediaHint) ui.mediaHint.textContent = src.startsWith("data:") ? "Local preview ready." : "This will attach to your post.";
}

async function uploadPostMedia(file) {
  if (!file) return;
  const kind = String(file.type || "");
  if (!/^image\//i.test(kind)) {
    status(ui.postStatus, "Choose an image file.", "warn");
    return;
  }
  if (file.size > 1024 * 1024) {
    status(ui.postStatus, "Image is too large. Use something under 1 MB.", "warn");
    return;
  }
  status(ui.postStatus, "Uploading media...", "");
  try {
    const dataUrl = await fileToDataUrl(file);
    renderPostMediaPreview(dataUrl, file.name || "Local media");
    const uploaded = await api.uploadImage(dataUrl);
    pendingPostMediaUri = uploaded?.url || uploaded?.imageUrl || uploaded?.imageUri || dataUrl;
    if (ui.media) ui.media.value = pendingPostMediaUri;
    renderPostMediaPreview(pendingPostMediaUri, file.name || "Media ready");
    status(ui.postStatus, "Media ready. Hit Post when your take is ready.", "ok");
  } catch (error) {
    status(ui.postStatus, error.message || "Could not upload media.", "error");
  } finally {
    if (ui.mediaFile) ui.mediaFile.value = "";
  }
}

function bookmarkSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]").filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveBookmarks(set) {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...set].slice(0, 500)));
  } catch {
    // ignore storage failures
  }
}

function avatarHtml(profile = {}, className = "socialx-avatar") {
  const name = profile.displayName || profile.handle || "PR";
  if (profile.imageUri) {
    return `<img class="${className}" src="${escapeHtml(profile.imageUri)}" alt="${escapeHtml(name)}" />`;
  }
  return `<div class="${className}">${escapeHtml(initials(name))}</div>`;
}

function setAvatar(el, identity = {}) {
  if (!el) return;
  const name = identity.displayName || identity.handle || "PR";
  if (identity.imageUri) {
    el.style.backgroundImage = `url("${String(identity.imageUri).replaceAll('"', "%22")}")`;
    el.textContent = "";
  } else {
    el.style.backgroundImage = "";
    el.textContent = initials(name);
  }
}

function renderImagePreview(uri = "", fallbackName = "") {
  if (!ui.imagePreview) return;
  if (uri) {
    ui.imagePreview.style.backgroundImage = `url("${String(uri).replaceAll('"', "%22")}")`;
    ui.imagePreview.textContent = "";
  } else {
    ui.imagePreview.style.backgroundImage = "";
    ui.imagePreview.textContent = initials(fallbackName || ui.displayInput?.value || "PR");
  }
}

function updateIdentityUi() {
  const wallet = connectedWallet();
  const identity = mergedSocialIdentity();
  const name = identity.displayName || "Pump-r Social";
  const handle = identity.handle || "connect";
  if (ui.meName) ui.meName.textContent = name;
  if (ui.meHandle) ui.meHandle.textContent = wallet ? `@${handle}` : "@connect";
  if (ui.walletCopyBtn) ui.walletCopyBtn.textContent = wallet ? shortAddress(wallet) : "Connect to copy wallet";
  if (ui.myTier) ui.myTier.textContent = currentStats?.tier || (wallet ? "New" : "Connect");
  if (ui.myXp) ui.myXp.textContent = formatNumber(currentStats?.xp || 0);
  if (ui.myPosts) ui.myPosts.textContent = formatNumber(currentStats?.posts || 0);
  setAvatar(ui.avatar, identity);
  setAvatar(ui.meAvatar, identity);
  if (ui.handleInput && !ui.handleInput.value) ui.handleInput.value = normalizeHandle(handle);
  if (ui.displayInput && !ui.displayInput.value) ui.displayInput.value = name;
  if (ui.bioInput && !ui.bioInput.value) ui.bioInput.value = identity.bio || "";
}

async function ensureConnected() {
  const wallet = connectedWallet();
  if (wallet) return wallet;
  status(ui.postStatus, "Connect with Phantom, X, email, or EVM wallet first.", "warn");
  await walletControls?.connect?.();
  await walletControls?.refresh?.();
  return connectedWallet();
}

function openProfileEditor() {
  const identity = mergedSocialIdentity();
  pendingImageUri = identity.imageUri || "";
  if (ui.handleInput) ui.handleInput.value = currentSocialProfile?.handle || identity.handle || "";
  if (ui.displayInput) ui.displayInput.value = currentSocialProfile?.displayName || identity.displayName || "";
  if (ui.imageInput) ui.imageInput.value = pendingImageUri || "";
  if (ui.bioInput) ui.bioInput.value = currentSocialProfile?.bio || identity.bio || "";
  renderImagePreview(pendingImageUri, identity.displayName);
  if (ui.profileOverlay) ui.profileOverlay.hidden = false;
}

function closeProfileEditor() {
  if (ui.profileOverlay) ui.profileOverlay.hidden = true;
}

async function loadMySocialProfile({ fresh = false } = {}) {
  const wallet = connectedWallet();
  if (!wallet) {
    currentSocialProfile = null;
    currentStats = null;
    updateIdentityUi();
    return null;
  }
  try {
    await hydrateUserProfile(wallet, { force: false }).catch(() => null);
    const payload = await api.socialProfile(wallet, { fresh });
    const local = loadUserProfile(wallet);
    currentSocialProfile = payload.profile
      ? { ...payload.profile, imageUri: payload.profile.imageUri || local?.imageUri || "" }
      : null;
    currentStats = payload.stats || null;
  } catch (error) {
    status(ui.profileStatus, error.message || "Could not load social profile yet.", "warn");
  } finally {
    updateIdentityUi();
  }
  return currentSocialProfile;
}

async function saveSocialProfile() {
  const wallet = await ensureConnected();
  if (!wallet) return;
  const handle = normalizeHandle(ui.handleInput?.value || "");
  if (!handle || handle.length < 3) {
    status(ui.profileStatus, "Use at least 3 letters or numbers for your social name.", "warn");
    return;
  }
  const identity = mergedSocialIdentity();
  const body = {
    ...identity,
    wallet,
    handle,
    displayName: ui.displayInput?.value || identity.displayName || handle,
    bio: ui.bioInput?.value || "",
    imageUri: pendingImageUri || ui.imageInput?.value || loadUserProfile(wallet)?.imageUri || identity.imageUri || ""
  };
  setButtonBusy(ui.profileSaveBtn, true, "Saving...");
  status(ui.profileStatus, "Saving profile...", "");
  try {
    const payload = await api.saveSocialProfile(body);
    currentSocialProfile = payload.profile
      ? { ...payload.profile, imageUri: payload.profile.imageUri || body.imageUri || "" }
      : null;
    currentStats = payload.stats || null;
    await saveUserProfile(wallet, {
      username: body.displayName,
      bio: body.bio,
      imageUri: body.imageUri || loadUserProfile(wallet)?.imageUri || ""
    }).catch(() => null);
    status(ui.profileStatus, `Saved @${currentSocialProfile?.handle || handle}.`, "ok");
    showCopyToast?.("Social profile saved");
    closeProfileEditor();
    updateIdentityUi();
    await loadFeed({ fresh: true });
    await walletControls?.refresh?.();
  } catch (error) {
    status(ui.profileStatus, error.message || "Could not save profile.", "error");
  } finally {
    setButtonBusy(ui.profileSaveBtn, false);
  }
}

async function publishPost() {
  const wallet = await ensureConnected();
  if (!wallet) return;
  if (!currentSocialProfile) {
    openProfileEditor();
    status(ui.postStatus, "Claim a unique social name once, then your posts can earn XP.", "warn");
    return;
  }
  const text = String(ui.body?.value || "").trim();
  if (!text) {
    status(ui.postStatus, "Write a post first.", "warn");
    return;
  }
  const identity = mergedSocialIdentity();
  setButtonBusy(ui.postBtn, true, "Posting...");
  status(ui.postStatus, "Publishing to Pump-r Social...", "");
  try {
    const payload = await api.socialPost({
      wallet,
      handle: currentSocialProfile.handle || identity.handle,
      displayName: currentSocialProfile.displayName || identity.displayName,
      imageUri: identity.imageUri || currentSocialProfile?.imageUri || "",
      body: text,
      token: ui.token?.value || "",
      chain: ui.chain?.value || "SOL",
      mediaUrl: pendingPostMediaUri || ui.media?.value || "",
      source: identity.source || "social"
    });
    currentSocialProfile = payload.profile
      ? { ...payload.profile, imageUri: payload.profile.imageUri || identity.imageUri || "" }
      : currentSocialProfile;
    currentStats = payload.stats || currentStats;
    ui.body.value = "";
    ui.media.value = "";
    pendingPostMediaUri = "";
    renderPostMediaPreview("");
    status(ui.postStatus, "+5 XP. Post is live.", "ok");
    updateIdentityUi();
    setView("feed");
    await loadFeed({ fresh: true });
  } catch (error) {
    status(ui.postStatus, error.message || "Could not publish post.", "error");
  } finally {
    setButtonBusy(ui.postBtn, false);
  }
}

function posts() {
  return Array.isArray(feedPayload.posts) ? feedPayload.posts : [];
}

function postMatchesTab(post = {}, tab = activeTab) {
  const body = String(post.body || "").toLowerCase();
  const category = String(post.category || "").toLowerCase();
  const tags = (post.tags?.contracts || []).join(" ");
  const haystack = `${body} ${category} ${tags}`;
  if (tab !== "for-you" && ["announcement", "post"].includes(category)) {
    if (tab === "launches") return /\bcontract\b|\bca:\b|\bpump\.fun\b|\bmint\b|[1-9A-HJ-NP-Za-km-z]{32,44}/i.test(haystack);
    if (tab === "alpha") return /\bsignal\b|\bwatch(?:list)?\b|\bwallet flow\b|\bentry\b|\bchart\b|\bthesis\b/i.test(haystack);
    if (tab === "rewards") return /\bairdrop\b|\bpayout\b|\breward sent\b|\breward paid\b/i.test(haystack);
  }
  if (tab === "launches") return category === "launch" || /\bcontract\b|\bca:\b|\bpump\.fun\b|\bmint\b|[1-9A-HJ-NP-Za-km-z]{32,44}/i.test(haystack);
  if (tab === "alpha") return category === "alpha" || /\balpha\b|\bsignal\b|\bwatch(?:list)?\b|\bwallet\b|\bflow\b|\bentry\b|\bchart\b|\bthesis\b/i.test(haystack);
  if (tab === "rewards") return category === "rewards" || /\breward(?:s|ed)?\b|\bairdrop\b|\bxp\b|\bholder\b|\breferral\b|\bpayout\b|\bearn\b/i.test(haystack);
  return true;
}

function visiblePosts() {
  if (activeView !== "feed") return posts();
  return posts().filter((post) => postMatchesTab(post, activeTab));
}

function myKey() {
  const wallet = connectedWallet();
  return wallet ? wallet.toLowerCase() : "";
}

function isMine(post = {}) {
  const wallet = connectedWallet();
  return wallet && String(post.author?.wallet || "").toLowerCase() === wallet.toLowerCase();
}

function trendRows() {
  const map = new Map();
  for (const post of visiblePosts()) {
    const tags = [...(post.tags?.cashtags || []), post.token].filter(Boolean);
    for (const tag of tags) {
      const key = String(tag).trim().toUpperCase();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  if (!map.size) {
    map.set("$PUMPR", 2);
    map.set("$SOL", 1);
    map.set("LAUNCHES", 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function renderTrends() {
  if (!ui.trends) return;
  ui.trends.innerHTML = trendRows()
    .map(([tag, count], index) => `
      <button type="button" data-trend="${escapeHtml(tag)}">
        <span>${index + 1}</span>
        <strong>${escapeHtml(tag)}</strong>
        <small>${formatNumber(count)} posts</small>
      </button>
    `)
    .join("");
}

function renderLeaderboard(rows = []) {
  if (!ui.leaderboard) return;
  if (!rows.length) {
    ui.leaderboard.innerHTML = `<div class="socialx-empty small">No creators yet.</div>`;
    return;
  }
  ui.leaderboard.innerHTML = rows
    .slice(0, 10)
    .map((row, index) => {
      const profile = row.profile || {};
      const stats = row.stats || {};
      return `
        <button class="socialx-leader-row" type="button" data-profile-wallet="${escapeHtml(profile.wallet || "")}">
          <span>${index + 1}</span>
          ${avatarHtml(profile, "socialx-avatar mini")}
          <div>
            <strong>${escapeHtml(profile.displayName || profile.handle || "PUMPR")}</strong>
            <small>@${escapeHtml(profile.handle || "pumpr")} - ${escapeHtml(stats.tier || "New")}</small>
          </div>
          <b>${formatNumber(stats.xp || 0)} XP</b>
        </button>
      `;
    })
    .join("");
}

function renderTags(post = {}) {
  const tags = post.tags || {};
  const values = [...(tags.cashtags || []), ...(tags.contracts || []).map((row) => `${row.slice(0, 4)}...${row.slice(-4)}`)];
  if (post.token && !values.includes(post.token)) values.unshift(post.token);
  return values.length ? `<div class="socialx-tags">${values.map((row) => `<span>${escapeHtml(row)}</span>`).join("")}</div>` : "";
}

function renderReplies(post = {}, expanded = false) {
  const replies = Array.isArray(post.replies) ? post.replies : [];
  if (!replies.length) return "";
  const shown = expanded ? replies : replies.slice(-3);
  return `
    <div class="socialx-replies">
      ${shown.map((reply) => {
        const author = reply.author || {};
        return `
          <div class="socialx-reply">
            ${avatarHtml(author, "socialx-avatar tiny")}
            <p><strong>@${escapeHtml(author.handle || shortAddress(reply.authorWallet || ""))}</strong> ${escapeHtml(reply.body || "")}</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function postMetrics(post = {}) {
  const stats = post.stats || {};
  return {
    likes: Number(stats.likes || 0),
    reposts: Number(stats.reposts || 0),
    replies: Number(stats.replies || 0),
    reach: Number(stats.likes || 0) * 9 + Number(stats.reposts || 0) * 21 + Number(stats.replies || 0) * 13 + 42
  };
}

function renderPost(post = {}, options = {}) {
  const author = post.author || {};
  const name = author.displayName || author.handle || "Pump-r user";
  const handle = author.handle || shortAddress(author.wallet || "");
  const liked = post.viewer?.liked;
  const reposted = post.viewer?.reposted;
  const bookmarked = bookmarkSet().has(post.id);
  const metrics = postMetrics(post);
  return `
    <article class="socialx-post ${options.featured ? "featured" : ""}" data-post-id="${escapeHtml(post.id || "")}">
      <div class="socialx-post-main">
        ${avatarHtml(author)}
        <div class="socialx-post-body">
          <div class="socialx-post-head">
            <button type="button" data-social-action="profile">
              <strong>${escapeHtml(name)}</strong>
              <small>@${escapeHtml(handle)} - ${formatAge(post.createdAt)}</small>
            </button>
            <span>${escapeHtml(post.chain || "SOL")}</span>
          </div>
          <p data-social-action="thread" data-user-content>${escapeHtml(post.body || "")}</p>
          ${renderTags(post)}
          ${post.mediaUrl ? `<img class="socialx-post-media" src="${escapeHtml(post.mediaUrl)}" alt="Post media" />` : ""}
          <div class="socialx-metrics">
            <span>${formatNumber(metrics.reach)} reach</span>
            <span>${escapeHtml(post.category || "post")}</span>
            ${isMine(post) ? "<span>Your post</span>" : ""}
          </div>
          <div class="socialx-actions">
            <button class="${liked ? "active" : ""}" type="button" data-social-action="like">Like <b>${formatNumber(metrics.likes)}</b></button>
            <button class="${reposted ? "active" : ""}" type="button" data-social-action="repost">Repost <b>${formatNumber(metrics.reposts)}</b></button>
            <button type="button" data-social-action="thread">Comments <b>${formatNumber(metrics.replies)}</b></button>
            <button class="${bookmarked ? "active" : ""}" type="button" data-social-action="bookmark">Save</button>
            <button type="button" data-social-action="copy">Share</button>
          </div>
          ${renderReplies(post, options.expanded)}
        </div>
      </div>
    </article>
  `;
}

function renderProfileView() {
  const wallet = connectedWallet();
  if (!wallet) {
    return `<div class="socialx-empty">Sign in with X, email, Phantom, or EVM wallet to build your Pump-r Social profile.</div>`;
  }
  const identity = mergedSocialIdentity();
  const profile = identity;
  const authored = posts().filter(isMine);
  const replied = posts().filter((post) => (post.replies || []).some((reply) => String(reply.authorWallet || "").toLowerCase() === wallet.toLowerCase()));
  return `
    <section class="socialx-profile-view">
      <div class="socialx-profile-banner"></div>
      <div class="socialx-profile-top">
        ${avatarHtml(profile, "socialx-avatar huge")}
        <button class="btn-ghost" type="button" data-social-action="edit-profile">Edit profile</button>
      </div>
      <h2>${escapeHtml(profile.displayName || "Pump-r user")}</h2>
      <span>@${escapeHtml(profile.handle || identity.handle || "connect")}</span>
      <p>${escapeHtml(profile.bio || "No bio yet. Probably bullish in silence.")}</p>
      <div class="socialx-profile-stats">
        <span><b>${formatNumber(currentStats?.xp || 0)}</b><small>XP</small></span>
        <span><b>${escapeHtml(currentStats?.tier || "New")}</b><small>tier</small></span>
        <span><b>${formatNumber(authored.length)}</b><small>posts</small></span>
        <span><b>${formatNumber(replied.length)}</b><small>threads</small></span>
      </div>
      <div class="socialx-section-label">Your posts</div>
      ${authored.length ? authored.map((post) => renderPost(post)).join("") : `<div class="socialx-empty">No posts yet. The timeline is waiting.</div>`}
    </section>
  `;
}

function renderNotifications() {
  const wallet = connectedWallet();
  if (!wallet) return `<div class="socialx-empty">Connect to see likes, replies, reposts, and XP events.</div>`;
  const mine = posts().filter(isMine);
  const events = [];
  for (const post of mine) {
    const stats = post.stats || {};
    if (stats.likes) events.push({ type: "Likes", text: `${stats.likes} people liked your post`, post });
    if (stats.reposts) events.push({ type: "Reposts", text: `${stats.reposts} reposted your post`, post });
    for (const reply of post.replies || []) {
      if (String(reply.authorWallet || "").toLowerCase() !== wallet.toLowerCase()) {
        events.push({ type: "Reply", text: `${reply.author?.displayName || reply.author?.handle || "Someone"} replied: ${reply.body}`, post });
      }
    }
  }
  if (currentStats?.xp) events.unshift({ type: "XP", text: `You have ${formatNumber(currentStats.xp)} social XP and ${currentStats.tier || "New"} tier.`, post: null });
  if (!events.length) return `<div class="socialx-empty">No notifications yet. Post something worth arguing about politely.</div>`;
  return `
    <div class="socialx-notifications">
      ${events.slice(0, 30).map((event) => `
        <button type="button" ${event.post ? `data-open-post="${escapeHtml(event.post.id)}"` : ""}>
          <span>${escapeHtml(event.type)}</span>
          <strong>${escapeHtml(event.text)}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function renderRewardsView() {
  const xp = Number(currentStats?.xp || 0);
  const next = xp < 25 ? 25 : xp < 120 ? 120 : xp < 350 ? 350 : xp < 1000 ? 1000 : xp + 500;
  const pct = Math.min(100, Math.round((xp / next) * 100));
  return `
    <section class="socialx-rewards-view">
      <div class="socialx-reward-hero">
        <small>Reward engine beta</small>
        <h2>Make social activity measurable</h2>
        <p>XP is not a final token payout. It is a clean signal that can be used later for airdrops, referral bonuses, community campaigns, and creator rewards.</p>
        <div class="socialx-progress"><span style="width:${pct}%"></span></div>
        <strong>${formatNumber(xp)} / ${formatNumber(next)} XP to next tier</strong>
      </div>
      <div class="socialx-mission-grid">
        ${[
          ["Claim profile", "+20 XP", Boolean(currentSocialProfile)],
          ["Publish useful post", "+5 XP each", posts().some(isMine)],
          ["Reply in threads", "+2 XP each", Number(currentStats?.repliesWritten || 0) > 0],
          ["Earn likes", "+1 XP each", Number(currentStats?.likesReceived || 0) > 0],
          ["Launch from Pump-r", "future multiplier", false],
          ["Hold $PUMPR", "future multiplier", false]
        ].map(([name, reward, done]) => `
          <div class="${done ? "done" : ""}">
            <span>${done ? "Done" : "Open"}</span>
            <strong>${name}</strong>
            <small>${reward}</small>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderExploreView() {
  const tagHtml = trendRows().map(([tag, count]) => `
    <button type="button" data-trend="${escapeHtml(tag)}">
      <strong>${escapeHtml(tag)}</strong>
      <span>${formatNumber(count)} posts</span>
    </button>
  `).join("");
  return `
    <section class="socialx-explore-view">
      <div class="socialx-section-label">Trending now</div>
      <div class="socialx-explore-tags">${tagHtml}</div>
      <div class="socialx-section-label">Live posts</div>
      ${visiblePosts().map((post) => renderPost(post)).join("") || `<div class="socialx-empty">Nothing is trending yet.</div>`}
    </section>
  `;
}

function renderFeed() {
  if (!ui.feed) return;
  if (activeView === "profile") {
    ui.feed.innerHTML = renderProfileView();
    return;
  }
  if (activeView === "notifications") {
    ui.feed.innerHTML = renderNotifications();
    return;
  }
  if (activeView === "rewards") {
    ui.feed.innerHTML = renderRewardsView();
    return;
  }
  if (activeView === "explore") {
    ui.feed.innerHTML = renderExploreView();
    return;
  }
  const rows = visiblePosts();
  const copy = TAB_COPY[activeTab] || TAB_COPY["for-you"];
  ui.feed.innerHTML = rows.length
    ? rows.map((post) => renderPost(post)).join("")
    : `<div class="socialx-empty">${escapeHtml(copy.empty)}</div>`;
}

function renderChrome() {
  const tabCopy = TAB_COPY[activeTab] || TAB_COPY["for-you"];
  const config = {
    feed: [tabCopy.kicker, tabCopy.title, tabCopy.sub],
    explore: ["Discovery", "Explore", "Find trending cashtags, launches, and creator conversations."],
    notifications: ["Activity", "Notifications", "Likes, replies, reposts, and reward events tied to your profile."],
    profile: ["Identity", "Profile", "Your posts, XP, rewards tier, and wallet-linked social identity."],
    rewards: ["Reward engine", "Rewards", "Beta XP missions that can plug into future airdrops and creator rewards."]
  }[activeView] || [];
  if (ui.timelineKicker) ui.timelineKicker.textContent = config[0] || "";
  if (ui.timelineTitle) ui.timelineTitle.textContent = config[1] || "";
  if (ui.timelineSub) ui.timelineSub.textContent = config[2] || "";
  if (ui.tabWrap) ui.tabWrap.style.display = activeView === "feed" ? "flex" : "none";
  if (ui.composer) ui.composer.style.display = ["feed", "explore"].includes(activeView) ? "grid" : "none";
  ui.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.socialView === activeView));
  const notify = notificationsCount();
  const notifyBadge = document.getElementById("socialNotifyBadge");
  if (notifyBadge) notifyBadge.textContent = String(notify);
}

function notificationsCount() {
  const wallet = connectedWallet();
  if (!wallet) return 0;
  return posts()
    .filter(isMine)
    .reduce((sum, post) => sum + Number(post.stats?.likes || 0) + Number(post.stats?.reposts || 0) + Number(post.stats?.replies || 0), 0);
}

function replacePost(nextPost) {
  if (!nextPost?.id) return;
  feedPayload.posts = posts().map((post) => (post.id === nextPost.id ? nextPost : post));
  if (openThreadId === nextPost.id) renderThread(nextPost.id);
  renderFeed();
  renderTrends();
}

async function loadFeed({ fresh = false } = {}) {
  const viewer = connectedWallet();
  try {
    if (ui.feed && activeView === "feed") {
      ui.feed.innerHTML = `<div class="socialx-empty">Loading ${escapeHtml((TAB_COPY[activeTab] || TAB_COPY["for-you"]).title.toLowerCase())}...</div>`;
    }
    feedPayload = await api.socialFeed({
      tab: activeTab,
      viewer,
      query: ui.search?.value || "",
      limit: 80,
      fresh
    });
    renderChrome();
    renderFeed();
    renderTrends();
    renderLeaderboard(feedPayload.leaderboard || []);
  } catch (error) {
    if (ui.feed) ui.feed.innerHTML = `<div class="socialx-empty">Could not load Social beta: ${escapeHtml(error.message || "try again")}</div>`;
  }
}

function setView(view) {
  activeView = view || "feed";
  renderChrome();
  renderFeed();
}

async function reactToPost(postId, type, active) {
  const wallet = await ensureConnected();
  if (!wallet) return;
  const identity = mergedSocialIdentity();
  try {
    const payload = await api.socialReact(postId, {
      wallet,
      type,
      active,
      handle: currentSocialProfile?.handle || identity.handle,
      displayName: currentSocialProfile?.displayName || identity.displayName,
      imageUri: identity.imageUri || currentSocialProfile?.imageUri || "",
      source: identity.source || "social"
    });
    replacePost(payload.post);
    renderLeaderboard(payload.leaderboard || feedPayload.leaderboard || []);
  } catch (error) {
    status(ui.postStatus, error.message || "Reaction failed.", "error");
  }
}

async function sendReply(postId, text) {
  const body = String(text || "").trim();
  if (!body) return;
  const wallet = await ensureConnected();
  if (!wallet) return;
  const identity = mergedSocialIdentity();
  try {
    const payload = await api.socialReply(postId, {
      wallet,
      body,
      handle: currentSocialProfile?.handle || identity.handle,
      displayName: currentSocialProfile?.displayName || identity.displayName,
      imageUri: identity.imageUri || currentSocialProfile?.imageUri || "",
      source: identity.source || "social"
    });
    currentStats = payload.stats || currentStats;
    replacePost(payload.post);
    updateIdentityUi();
    status(ui.postStatus, "+2 XP. Reply posted.", "ok");
  } catch (error) {
    status(ui.postStatus, error.message || "Reply failed.", "error");
  }
}

function postById(id) {
  return posts().find((post) => post.id === id) || null;
}

function renderThread(postId) {
  const post = postById(postId);
  if (!post || !ui.threadContent) return;
  openThreadId = postId;
  ui.threadContent.innerHTML = `
    ${renderPost(post, { featured: true, expanded: true })}
    <div class="socialx-section-label">Replies</div>
    ${post.replies?.length ? renderReplies(post, true) : `<div class="socialx-empty small">No replies yet. Say the quiet alpha out loud.</div>`}
  `;
}

function openThread(postId) {
  renderThread(postId);
  if (ui.threadOverlay) ui.threadOverlay.hidden = false;
  ui.threadReplyInput?.focus();
}

function closeThread() {
  openThreadId = "";
  if (ui.threadOverlay) ui.threadOverlay.hidden = true;
  if (ui.threadReplyInput) ui.threadReplyInput.value = "";
}

function toggleBookmark(postId) {
  const set = bookmarkSet();
  if (set.has(postId)) set.delete(postId);
  else set.add(postId);
  saveBookmarks(set);
  renderFeed();
  if (openThreadId) renderThread(openThreadId);
  showCopyToast?.(set.has(postId) ? "Saved post" : "Removed bookmark");
}

function handlePostAction(action, postId, postEl) {
  if (!postId && action !== "edit-profile") return;
  if (action === "like") {
    const button = postEl?.querySelector('[data-social-action="like"]');
    reactToPost(postId, "like", !button?.classList.contains("active"));
    return;
  }
  if (action === "repost") {
    const button = postEl?.querySelector('[data-social-action="repost"]');
    reactToPost(postId, "repost", !button?.classList.contains("active"));
    return;
  }
  if (action === "thread") {
    openThread(postId);
    return;
  }
  if (action === "bookmark") {
    toggleBookmark(postId);
    return;
  }
  if (action === "copy") {
    navigator.clipboard?.writeText(`${location.origin}/social#${postId}`).catch(() => null);
    showCopyToast?.("Post link copied");
    return;
  }
  if (action === "edit-profile") openProfileEditor();
}

function bindEvents() {
  ui.editProfileBtn?.addEventListener("click", openProfileEditor);
  ui.profileCloseBtn?.addEventListener("click", closeProfileEditor);
  ui.profileOverlay?.addEventListener("click", (event) => {
    if (event.target === ui.profileOverlay) closeProfileEditor();
  });
  ui.imageFile?.addEventListener("change", () => uploadProfileImage(ui.imageFile?.files?.[0] || null));
  ui.imageInput?.addEventListener("input", () => {
    pendingImageUri = String(ui.imageInput.value || "").trim();
    renderImagePreview(pendingImageUri, ui.displayInput?.value || "PR");
  });
  ui.imageRemoveBtn?.addEventListener("click", () => {
    pendingImageUri = "";
    if (ui.imageInput) ui.imageInput.value = "";
    renderImagePreview("", ui.displayInput?.value || "PR");
    status(ui.profileStatus, "Image removed. Save profile to apply it.", "warn");
  });
  ui.displayInput?.addEventListener("input", () => {
    if (!pendingImageUri) renderImagePreview("", ui.displayInput.value || "PR");
  });
  ui.profileSaveBtn?.addEventListener("click", saveSocialProfile);
  ui.mediaFile?.addEventListener("change", () => uploadPostMedia(ui.mediaFile?.files?.[0] || null));
  ui.media?.addEventListener("input", () => {
    pendingPostMediaUri = String(ui.media.value || "").trim();
    renderPostMediaPreview(pendingPostMediaUri, pendingPostMediaUri ? "Linked media" : "");
  });
  ui.mediaRemoveBtn?.addEventListener("click", () => {
    pendingPostMediaUri = "";
    if (ui.media) ui.media.value = "";
    renderPostMediaPreview("");
    status(ui.postStatus, "Media removed.", "warn");
  });
  ui.postBtn?.addEventListener("click", publishPost);
  ui.topComposeBtn?.addEventListener("click", () => {
    setView("feed");
    ui.body?.focus();
  });
  ui.leftComposeBtn?.addEventListener("click", () => {
    setView("feed");
    ui.body?.focus();
  });
  ui.walletCopyBtn?.addEventListener("click", () => {
    const wallet = connectedWallet();
    if (!wallet) {
      walletControls?.connect?.();
      return;
    }
    navigator.clipboard?.writeText(wallet).catch(() => null);
    showCopyToast?.("Wallet copied");
  });
  ui.refreshBtn?.addEventListener("click", async () => {
    await loadMySocialProfile({ fresh: true });
    await loadFeed({ fresh: true });
  });
  ui.navButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.socialView || "feed"));
  });
  ui.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.socialTab || "for-you";
      activeView = "feed";
      ui.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      renderChrome();
      renderFeed();
      loadFeed({ fresh: false });
    });
  });
  ui.search?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (ui.search.value.trim()) setView("explore");
      loadFeed({ fresh: false });
    }, 250);
  });
  document.addEventListener("click", (event) => {
    const trend = event.target.closest("[data-trend]");
    if (trend) {
      ui.search.value = trend.dataset.trend || "";
      setView("explore");
      loadFeed({ fresh: false });
      return;
    }
    const openPost = event.target.closest("[data-open-post]");
    if (openPost) {
      openThread(openPost.dataset.openPost || "");
      return;
    }
    const actionBtn = event.target.closest("[data-social-action]");
    if (!actionBtn) return;
    const postEl = actionBtn.closest("[data-post-id]");
    handlePostAction(actionBtn.dataset.socialAction, postEl?.dataset.postId || "", postEl);
  });
  ui.threadCloseBtn?.addEventListener("click", closeThread);
  ui.threadOverlay?.addEventListener("click", (event) => {
    if (event.target === ui.threadOverlay) closeThread();
  });
  ui.threadReplyBtn?.addEventListener("click", async () => {
    await sendReply(openThreadId, ui.threadReplyInput?.value || "");
    if (ui.threadReplyInput) ui.threadReplyInput.value = "";
  });
  ui.threadReplyInput?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendReply(openThreadId, ui.threadReplyInput?.value || "");
      ui.threadReplyInput.value = "";
    }
  });

  window.addEventListener("pumpr:profile-updated", (event) => {
    const wallet = connectedWallet();
    const profile = event.detail || {};
    if (!wallet || String(profile.address || "").toLowerCase() !== wallet.toLowerCase()) return;
    if (currentSocialProfile) {
      currentSocialProfile = {
        ...currentSocialProfile,
        displayName: currentSocialProfile.displayName || profile.username,
        bio: currentSocialProfile.bio || profile.bio,
        imageUri: profile.imageUri || currentSocialProfile.imageUri || ""
      };
    }
    updateIdentityUi();
    renderFeed();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== "etherpump.profile.v1") return;
    updateIdentityUi();
    renderFeed();
  });
}

async function init() {
  walletControls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    onChange: async () => {
      await loadMySocialProfile({ fresh: false });
      await loadFeed({ fresh: false });
    }
  });
  bindEvents();
  await loadMySocialProfile({ fresh: false });
  await loadFeed({ fresh: false });
  if (location.hash?.startsWith("#post-")) {
    openThread(location.hash.slice(1));
  }
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadFeed({ fresh: false }), REFRESH_MS);
}

init();
