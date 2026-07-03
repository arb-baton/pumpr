import { api } from "./api.js?v=20260702authsync";
import {
  connectSocialWallet,
  defaultUsername,
  ensureWalletChain,
  ethers,
  getChainOption,
  loadUserProfile,
  parseUiError,
  shortAddress,
  walletState
} from "./core.js?v=20260702authsync";
import { initTopbarWalletProfile, setAlert, setWalletLabel } from "./ui.js?v=20260702authsync";

const ALPHA_X_AUTH_KEY = "etherpump.alpha.xauth.v1";

const ui = {
  alert: document.getElementById("alert"),
  feed: document.getElementById("alphaFeed"),
  search: document.getElementById("alphaSearchInput"),
  tabs: Array.from(document.querySelectorAll("[data-alpha-filter]")),
  tipCount: document.getElementById("alphaTipCount"),
  projectCount: document.getElementById("alphaProjectCount"),
  unlockCount: document.getElementById("alphaUnlockCount"),
  hotProjects: document.getElementById("alphaHotProjects"),
  openSubmit: document.getElementById("alphaOpenSubmit"),
  submitModal: document.getElementById("alphaSubmitModal"),
  submitForm: document.getElementById("alphaSubmitForm"),
  submitClose: document.getElementById("alphaSubmitClose"),
  submitCancel: Array.from(document.querySelectorAll(".alphaSubmitCancel")),
  projectName: document.getElementById("alphaProjectName"),
  tokenSymbol: document.getElementById("alphaTokenSymbol"),
  chainId: document.getElementById("alphaChainId"),
  tokenAddress: document.getElementById("alphaTokenAddress"),
  title: document.getElementById("alphaTitle"),
  teaser: document.getElementById("alphaTeaser"),
  body: document.getElementById("alphaBody"),
  evidenceFile: document.getElementById("alphaEvidenceFile"),
  evidenceChoose: document.getElementById("alphaEvidenceChoose"),
  evidenceName: document.getElementById("alphaEvidenceName"),
  evidenceUrl: document.getElementById("alphaEvidenceUrl"),
  evidenceType: document.getElementById("alphaEvidenceType"),
  category: document.getElementById("alphaCategory"),
  confidence: document.getElementById("alphaConfidence"),
  authorWallet: document.getElementById("alphaAuthorWallet"),
  xStatus: document.getElementById("alphaXStatus"),
  connectX: document.getElementById("alphaConnectX"),
  tipModal: document.getElementById("alphaTipModal"),
  tipForm: document.getElementById("alphaTipForm"),
  tipClose: document.getElementById("alphaTipClose"),
  tipCancel: Array.from(document.querySelectorAll(".alphaTipCancel")),
  tipTitle: document.getElementById("alphaTipModalTitle"),
  tipMeta: document.getElementById("alphaTipModalMeta"),
  tipAmount: document.getElementById("alphaTipAmount"),
  signInBtn: document.getElementById("signInBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletSelect: document.getElementById("walletChoice"),
  walletLabel: document.getElementById("walletAddress"),
  profileNavSide: document.getElementById("profileNavSide")
};

const state = {
  tips: [],
  stats: {},
  query: "",
  filter: "all",
  activeTip: null,
  xProfile: null,
  walletControls: null,
  submitBusy: false,
  submitStatusEl: null
};

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function normalizeXProfile(value) {
  if (!value || typeof value !== "object") return null;
  const username = String(value.username || value.xHandle || "").replace(/^@+/, "").trim().slice(0, 32);
  if (!username && !value.authorized) return null;
  return {
    authorized: true,
    username,
    name: String(value.name || username || "X user").trim().slice(0, 80),
    image: String(value.image || value.profile_image_url || "").trim().slice(0, 1024),
    followers: Math.max(0, Number(value.followers || value.xFollowers || 0) || 0)
  };
}

function loadXAuth() {
  try {
    return normalizeXProfile(JSON.parse(localStorage.getItem(ALPHA_X_AUTH_KEY) || "{}"));
  } catch {
    return null;
  }
}

function saveXAuth(profile) {
  state.xProfile = normalizeXProfile(profile);
  try {
    if (state.xProfile) localStorage.setItem(ALPHA_X_AUTH_KEY, JSON.stringify({ ...state.xProfile, ts: Date.now() }));
    else localStorage.removeItem(ALPHA_X_AUTH_KEY);
  } catch {
    // ignore storage write failures
  }
  renderXStatus();
}

async function handleXOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("x") === "authorized") {
    const xUser = decodeBase64UrlJson(params.get("x_user")) || { authorized: true };
    saveXAuth(xUser);
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
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`);
    setAlert(ui.alert, "X connected");
  }
  if (params.get("x") === "failed" || params.get("x") === "expired") {
    const reason = params.get("reason") || "X authorization failed";
    params.delete("x");
    params.delete("reason");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    setAlert(ui.alert, reason, true);
  }
}

function xPayload() {
  const x = state.xProfile || {};
  return {
    xHandle: x.username || "",
    xName: x.name || "",
    xImage: x.image || "",
    xFollowers: x.followers || 0
  };
}

function xIntent(text) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  return url.toString();
}

function ago(tsSec) {
  const ts = Number(tsSec || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "now";
  const diff = Math.max(0, Date.now() - ts * 1000);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function compact(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return new Intl.NumberFormat("en-US", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 2 }).format(n);
}

function chainLabel(chainId) {
  const option = getChainOption(chainId);
  return option?.shortName || option?.name || `CHAIN ${chainId}`;
}

function nativeSymbol(chainId) {
  return getChainOption(chainId)?.nativeCurrency?.symbol || "ETH";
}

function tipChainIdForAlpha(tip) {
  return isSolanaChain(tip?.chainId) ? 1 : Number(tip?.chainId || 1);
}

function isSolanaChain(chainId) {
  return Number(chainId || 0) === 101;
}

function isLikelySolanaAddress(value = "") {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || "").trim());
}

function isValidTokenAddressForChain(value = "", chainId = 1) {
  return isSolanaChain(chainId) ? isLikelySolanaAddress(value) : ethers.isAddress(String(value || ""));
}

function tokenHref(tip) {
  if (isSolanaChain(tip.chainId)) {
    return `https://solscan.io/token/${encodeURIComponent(tip.tokenAddress)}`;
  }
  return `/token?address=${encodeURIComponent(tip.tokenAddress)}&chainId=${encodeURIComponent(String(tip.chainId || ""))}`;
}

function tokenLinkTarget(tip) {
  return isSolanaChain(tip.chainId) ? ` target="_blank" rel="noreferrer noopener"` : "";
}

function isImageEvidence(type = "", url = "") {
  return String(type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(String(url || ""));
}

function renderEvidence(tip) {
  const url = String(tip.evidenceUrl || "").trim();
  if (!url) return "";
  const label = isImageEvidence(tip.evidenceType, url) ? "Evidence image" : "Evidence file";
  return `
    <a class="alpha-evidence-card" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">
      ${isImageEvidence(tip.evidenceType, url)
        ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />`
        : `<span class="alpha-evidence-file-icon">FILE</span>`}
      <b>${escapeHtml(label)}</b>
      <small>Open proof</small>
    </a>
  `;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

function authorName(tip) {
  return tip?.xHandle ? `@${tip.xHandle}` : tip?.authorName || defaultUsername(tip?.author || tip?.authorWallet || "");
}

function openModal(el) {
  if (!el) return;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
}

function closeModal(el) {
  if (!el) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

function ensureSubmitStatus() {
  if (state.submitStatusEl) return state.submitStatusEl;
  if (!ui.submitForm) return null;
  const node = document.createElement("p");
  node.className = "alpha-submit-status";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  Object.assign(node.style, {
    display: "none",
    margin: "0",
    padding: "0.7rem 0.85rem",
    borderRadius: "12px",
    border: "1px solid rgba(124, 136, 170, 0.34)",
    background: "rgba(20, 27, 42, 0.88)",
    color: "#dce5ff",
    fontWeight: "700"
  });
  const actions = ui.submitForm.querySelector(".go-modal-actions");
  if (actions) actions.insertAdjacentElement("beforebegin", node);
  else ui.submitForm.appendChild(node);
  state.submitStatusEl = node;
  return node;
}

function setSubmitStatus(message = "", isError = false) {
  const node = ensureSubmitStatus();
  if (!node) return;
  node.textContent = message;
  node.style.display = message ? "block" : "none";
  node.style.borderColor = isError ? "rgba(255, 126, 126, 0.58)" : "rgba(111, 238, 159, 0.45)";
  node.style.background = isError ? "rgba(82, 23, 32, 0.82)" : "rgba(20, 43, 33, 0.82)";
  node.style.color = isError ? "#ffd3d3" : "#d8ffe7";
}

function setSubmitBusy(busy, message = "") {
  state.submitBusy = Boolean(busy);
  const submit = ui.submitForm?.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = state.submitBusy;
    submit.textContent = state.submitBusy ? "Publishing..." : "Publish alpha";
  }
  if (message) setSubmitStatus(message, false);
}

function showSubmitValidationMessage() {
  const invalid = ui.submitForm?.querySelector(":invalid");
  if (!invalid) return false;
  const label = invalid.closest("label")?.childNodes?.[0]?.textContent?.trim?.() || "Required field";
  const message = invalid.validationMessage || `${label} is required`;
  setSubmitStatus(`${label}: ${message}`, true);
  invalid.scrollIntoView({ block: "center", behavior: "smooth" });
  window.setTimeout(() => invalid.focus?.({ preventScroll: true }), 120);
  return true;
}

function filteredTips() {
  const q = state.query.toLowerCase();
  return state.tips
    .filter((tip) => {
      if (state.filter === "high" && tip.confidence !== "high") return false;
      if (state.filter === "tipped" && Number(tip.tipCount || 0) <= 0) return false;
      const haystack = `${tip.title} ${tip.projectName} ${tip.tokenSymbol} ${tip.tokenAddress} ${tip.teaser} ${tip.category} ${tip.body}`.toLowerCase();
      return !q || haystack.includes(q);
    })
    .sort((a, b) => {
      if (state.filter === "new") return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      const bScore = Number(b.upvotes || 0) * 3 - Number(b.downvotes || 0) + Number(b.comments?.length || 0) * 2 + Number(b.tipCount || 0) * 5 + Number(b.createdAt || 0) / 1_000_000;
      const aScore = Number(a.upvotes || 0) * 3 - Number(a.downvotes || 0) + Number(a.comments?.length || 0) * 2 + Number(a.tipCount || 0) * 5 + Number(a.createdAt || 0) / 1_000_000;
      return bScore - aScore;
    });
}

function renderXStatus() {
  if (!ui.xStatus) return;
  const x = state.xProfile;
  ui.xStatus.textContent = x?.username ? `Posting as @${x.username}` : "Connect X to publish or comment";
  ui.xStatus.classList.toggle("connected", Boolean(x?.username));
}

function renderStats() {
  const stats = state.stats || {};
  if (ui.tipCount) ui.tipCount.textContent = compact(stats.tips || state.tips.length);
  if (ui.projectCount) ui.projectCount.textContent = compact(stats.projects || 0);
  if (ui.unlockCount) ui.unlockCount.textContent = compact(stats.ratings || stats.unlocks || 0);
  const hot = Array.isArray(stats.hotProjects) ? stats.hotProjects : [];
  if (!ui.hotProjects) return;
  ui.hotProjects.innerHTML = hot.length
    ? hot
        .map((tip, index) => `
          <button class="alpha-hot-row" type="button" data-scroll-alpha="${escapeHtml(tip.id)}">
            <span>${index + 1}</span>
            <b>$${escapeHtml(tip.tokenSymbol || "TOKEN")}</b>
            <small>${escapeHtml(tip.projectName || tip.title || "Project")} - ${compact(tip.upvotes || 0)} up</small>
          </button>
        `)
        .join("")
    : `<div class="go-rank-empty">No alpha yet.</div>`;
}

function renderComments(tip) {
  const comments = Array.isArray(tip.comments) ? tip.comments.slice(-3) : [];
  return `
    <div class="alpha-comments">
      ${comments.length ? comments.map((comment) => `
        <div class="alpha-comment">
          <b>${escapeHtml(comment.xHandle ? `@${comment.xHandle}` : defaultUsername(comment.author || ""))}</b>
          <span>${escapeHtml(comment.body)}</span>
        </div>
      `).join("") : `<span class="alpha-comment-empty">No comments yet.</span>`}
      <form class="alpha-comment-form" data-alpha-comment-form="${escapeHtml(tip.id)}">
        <input maxlength="260" placeholder="Add a comment..." />
        <button class="btn-ghost" type="submit">Comment</button>
      </form>
    </div>
  `;
}

function renderTipCard(tip) {
  const symbol = tip.tokenSymbol || "TOKEN";
  const score = Number(tip.upvotes || 0) - Number(tip.downvotes || 0);
  const xAvatar = tip.xImage
    ? `<img src="${escapeHtml(tip.xImage)}" alt="" />`
    : `<span>${escapeHtml((tip.xHandle || symbol || "A").slice(0, 2).toUpperCase())}</span>`;
  const shareText = `${tip.title}\n\n${tip.teaser || tip.body || ""}\n\n${window.location.origin}/alpha/${encodeURIComponent(tip.id)}`;
  return `
    <article class="alpha-card unlocked alpha-pro-card" id="alpha-${escapeHtml(tip.id)}">
      <div class="alpha-card-topline">
        <span class="alpha-chain-pill">${escapeHtml(chainLabel(tip.chainId))}</span>
        <span class="alpha-confidence ${escapeHtml(tip.confidence || "medium")}">${escapeHtml(tip.confidence || "medium")} conviction</span>
      </div>
      <div class="alpha-card-head">
        <div class="alpha-card-title-wrap">
          <span class="alpha-kicker">${escapeHtml(tip.category || "Intel")} alpha</span>
          <h2>${escapeHtml(tip.title)}</h2>
          <p>${escapeHtml(tip.teaser || "High-signal alpha tip.")}</p>
        </div>
        <div class="alpha-score-badge">
          <b>${score >= 0 ? "+" : ""}${compact(score)}</b>
          <span>score</span>
        </div>
      </div>
      <div class="alpha-meta-grid">
        <div class="alpha-token-row">
          <span class="alpha-token-icon">${escapeHtml(symbol.slice(0, 2) || "A")}</span>
          <div>
            <b>${escapeHtml(tip.projectName || `$${symbol}`)}</b>
            <small>$${escapeHtml(symbol)} token thesis</small>
          </div>
        </div>
        <a class="alpha-contract-chip" href="${escapeHtml(tokenHref(tip))}"${tokenLinkTarget(tip)}>
          <span>contract</span>
          <b>${escapeHtml(shortAddress(tip.tokenAddress))}</b>
        </a>
      </div>
      <div class="alpha-author-strip">
        <div class="alpha-x-avatar">${xAvatar}</div>
        <div>
          <b>${escapeHtml(authorName(tip))}</b>
          <span>${compact(tip.xFollowers || 0)} X followers - ${escapeHtml(ago(tip.createdAt))}</span>
        </div>
      </div>
      <div class="alpha-body">${escapeHtml(tip.body || "").replace(/\n/g, "<br />")}</div>
      ${renderEvidence(tip)}
      <div class="alpha-card-foot">
        <span>👍 ${compact(tip.upvotes || 0)}</span>
        <span>👎 ${compact(tip.downvotes || 0)}</span>
        <span>💬 ${compact(tip.comments?.length || 0)}</span>
        <span>💸 ${compact(tip.tipCount || 0)} tips</span>
      </div>
      <div class="alpha-card-actions">
        <button class="btn-ghost alpha-vote-btn" type="button" data-alpha-vote="up" data-alpha-id="${escapeHtml(tip.id)}">👍 Bullish</button>
        <button class="btn-ghost alpha-vote-btn" type="button" data-alpha-vote="down" data-alpha-id="${escapeHtml(tip.id)}">👎 Fade</button>
        <button class="btn-primary alpha-tip-cta" type="button" data-alpha-tip="${escapeHtml(tip.id)}">💸 Tip author</button>
        <a class="btn-ghost alpha-share-x" href="${escapeHtml(xIntent(shareText))}" target="_blank" rel="noreferrer noopener">Share on X</a>
      </div>
      ${renderComments(tip)}
    </article>
  `;
}

function renderFeed() {
  const tips = filteredTips();
  if (!ui.feed) return;
  ui.feed.innerHTML = tips.length
    ? tips.map(renderTipCard).join("")
    : `<div class="panel-card alpha-empty"><h3>No alpha yet</h3><p>Connect X and submit the first contract-linked alpha tip for this feed.</p></div>`;
  renderStats();
}

function activeWalletAddress() {
  const ws = walletState();
  return String(ws.address || ws.solanaAddress || "").trim();
}

function hasActiveWallet() {
  return Boolean(activeWalletAddress());
}

function isValidTipWallet(value = "") {
  const text = String(value || "").trim();
  return ethers.isAddress(text) || isLikelySolanaAddress(text);
}

function updateProfileLinks() {
  const ws = walletState();
  const address = activeWalletAddress();
  const evmConnected = Boolean(ws.signer && ws.address);
  const connected = Boolean(address);
  if (ui.profileNavSide) ui.profileNavSide.href = evmConnected ? `/profile?address=${ws.address}` : "/profile";
  if (ui.signInBtn) ui.signInBtn.textContent = connected ? shortAddress(address) : "Sign in";
  if (ui.walletLabel) setWalletLabel(ui.walletLabel);
}

async function initWallet() {
  state.walletControls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    walletSelect: ui.walletSelect,
    walletLabel: ui.walletLabel,
    alertEl: ui.alert,
    onChange: updateProfileLinks
  });
  updateProfileLinks();
}

async function ensureConnected() {
  if (hasActiveWallet()) return { ...walletState(), address: activeWalletAddress() };
  await state.walletControls?.connect();
  const ws = walletState();
  const address = activeWalletAddress();
  if (!address) throw new Error("Connect wallet first");
  return { ...ws, address };
}

async function ensureEvmConnected() {
  const ws = walletState();
  if (ws.signer && ws.address) return ws;
  await state.walletControls?.connect();
  const next = walletState();
  if (!next.signer || !next.address) throw new Error("Connect an EVM wallet to send tips");
  return next;
}

async function ensureXConnected() {
  if (state.xProfile?.username) return state.xProfile;
  throw new Error("Connect X first");
}

async function loadAlpha() {
  const payload = await api.alpha(100);
  state.tips = Array.isArray(payload.tips) ? payload.tips : [];
  state.stats = payload.stats || {};
  renderFeed();
}

function fillSubmitDefaults() {
  const address = activeWalletAddress();
  if (ui.authorWallet && !ui.authorWallet.value && address) ui.authorWallet.value = address;
}

function requestXAuthorization() {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
  window.location.href = `/api/x/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
}

async function submitAlpha(event) {
  event.preventDefault();
  if (state.submitBusy) return;
  if (ui.submitForm && !ui.submitForm.checkValidity()) {
    showSubmitValidationMessage();
    ui.submitForm.reportValidity?.();
    return;
  }
  setSubmitBusy(true, "Publishing alpha...");
  try {
    const ws = await ensureConnected();
    await ensureXConnected();
    const authorWallet = String(ui.authorWallet?.value || ws.address || "").trim();
    const chainId = Number(ui.chainId.value || 1);
    if (!isValidTokenAddressForChain(String(ui.tokenAddress?.value || ""), chainId)) {
      throw new Error(isSolanaChain(chainId) ? "Enter a valid Solana token mint address" : "Enter a valid token contract address");
    }
    if (!isValidTipWallet(authorWallet)) throw new Error("Enter a valid tip wallet address");
    let evidenceUrl = String(ui.evidenceUrl?.value || "").trim();
    let evidenceType = String(ui.evidenceType?.value || "").trim();
    const evidenceFile = ui.evidenceFile?.files?.[0] || null;
    if (evidenceFile && !evidenceUrl) {
      if (evidenceFile.size > 2 * 1024 * 1024) throw new Error("Evidence file must be 2 MB or smaller");
      setSubmitStatus("Uploading alpha evidence...", false);
      setAlert(ui.alert, "Uploading alpha evidence...");
      const upload = await api.uploadFile(await fileToDataUrl(evidenceFile));
      evidenceUrl = upload?.url || "";
      evidenceType = upload?.mime || evidenceFile.type || "";
    }
    await api.createAlphaTip({
      projectName: ui.projectName.value,
      tokenSymbol: ui.tokenSymbol.value,
      tokenAddress: ui.tokenAddress.value,
      chainId,
      title: ui.title.value,
      teaser: ui.teaser.value,
      body: ui.body.value,
      evidenceUrl,
      evidenceType,
      category: ui.category.value || "Intel",
      confidence: ui.confidence.value || "medium",
      author: ws.address,
      authorName: state.xProfile?.username || "",
      authorWallet,
      ...xPayload()
    });
    setSubmitStatus("", false);
    closeModal(ui.submitModal);
    ui.submitForm.reset();
    if (ui.evidenceName) ui.evidenceName.textContent = "No evidence selected";
    renderXStatus();
    await loadAlpha();
    setAlert(ui.alert, "Alpha published");
  } finally {
    setSubmitBusy(false);
  }
}

function openTipModal(id) {
  const tip = state.tips.find((row) => row.id === id);
  if (!tip?.id) throw new Error("Alpha tip not found");
  state.activeTip = tip;
  const tipChainId = tipChainIdForAlpha(tip);
  if (ui.tipTitle) ui.tipTitle.textContent = `Tip ${authorName(tip)}`;
  if (ui.tipMeta) {
    ui.tipMeta.textContent = isSolanaChain(tip.chainId)
      ? `This is a Solana token tip. Rewards send ${nativeSymbol(tipChainId)} on ${chainLabel(tipChainId)} to ${shortAddress(tip.authorWallet)}.`
      : `Sends ${nativeSymbol(tipChainId)} on ${chainLabel(tipChainId)} to ${shortAddress(tip.authorWallet)}.`;
  }
  if (ui.tipAmount) ui.tipAmount.value = ui.tipAmount.value || "0.001";
  openModal(ui.tipModal);
}

async function sendTip(event) {
  event.preventDefault();
  const tip = state.activeTip;
  if (!tip?.id) return;
  const ws = await ensureEvmConnected();
  const amount = String(ui.tipAmount?.value || "").trim();
  const tipChainId = tipChainIdForAlpha(tip);
  if (!(Number(amount) > 0)) throw new Error("Enter a tip amount");
  if (!ethers.isAddress(tip.authorWallet)) throw new Error("This author has a Solana tip wallet. Connect an EVM wallet only for EVM tip wallets.");
  await ensureWalletChain(tipChainId);
  setAlert(ui.alert, `Sending ${amount} ${nativeSymbol(tipChainId)} tip...`);
  const tx = await walletState().signer.sendTransaction({
    to: tip.authorWallet,
    value: ethers.parseEther(amount)
  });
  await tx.wait();
  await api.recordAlphaTip(tip.id, {
    from: ws.address,
    txHash: tx.hash,
    amount,
    chainId: tipChainId
  });
  closeModal(ui.tipModal);
  await loadAlpha();
  setAlert(ui.alert, "Tip sent");
}

async function voteAlpha(id, direction) {
  const ws = await ensureConnected();
  const payload = await api.voteAlphaTip(id, { address: ws.address, direction });
  state.tips = state.tips.map((tip) => (tip.id === payload.tip.id ? payload.tip : tip));
  state.stats = payload.stats || state.stats;
  renderFeed();
}

async function commentAlpha(form) {
  const ws = await ensureConnected();
  await ensureXConnected();
  const id = form?.dataset?.alphaCommentForm || "";
  const input = form?.querySelector("input");
  const body = String(input?.value || "").trim();
  if (!body) return;
  const payload = await api.commentAlphaTip(id, { author: ws.address, body, ...xPayload() });
  state.tips = state.tips.map((tip) => (tip.id === payload.tip.id ? payload.tip : tip));
  state.stats = payload.stats || state.stats;
  renderFeed();
}

function bindEvents() {
  ui.search?.addEventListener("input", () => {
    state.query = ui.search.value.trim();
    renderFeed();
  });
  ui.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.alphaFilter || "all";
      ui.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      renderFeed();
    });
  });
  ui.connectX?.addEventListener("click", requestXAuthorization);
  ui.openSubmit?.addEventListener("click", async () => {
    if (!state.xProfile?.username) {
      requestXAuthorization();
      return;
    }
    await ensureConnected();
    fillSubmitDefaults();
    setSubmitStatus("", false);
    openModal(ui.submitModal);
  });
  ui.submitClose?.addEventListener("click", () => {
    setSubmitStatus("", false);
    closeModal(ui.submitModal);
  });
  ui.submitCancel.forEach((button) => button.addEventListener("click", () => {
    setSubmitStatus("", false);
    closeModal(ui.submitModal);
  }));
  ui.evidenceChoose?.addEventListener("click", () => ui.evidenceFile?.click());
  ui.evidenceFile?.addEventListener("change", () => {
    const file = ui.evidenceFile?.files?.[0] || null;
    if (ui.evidenceName) ui.evidenceName.textContent = file ? `${file.name} (${compact(file.size)} bytes)` : "No evidence selected";
    if (ui.evidenceUrl) ui.evidenceUrl.value = "";
    if (ui.evidenceType) ui.evidenceType.value = file?.type || "";
  });
  ui.submitForm?.addEventListener("invalid", (event) => {
    event.preventDefault();
    showSubmitValidationMessage();
  }, true);
  ui.submitForm?.addEventListener("submit", (event) => {
    submitAlpha(event).catch((error) => {
      const message = parseUiError(error);
      setSubmitStatus(message, true);
      setAlert(ui.alert, message, true);
    });
  });
  ui.tipClose?.addEventListener("click", () => closeModal(ui.tipModal));
  ui.tipCancel.forEach((button) => button.addEventListener("click", () => closeModal(ui.tipModal)));
  ui.tipForm?.addEventListener("submit", (event) => {
    sendTip(event).catch((error) => setAlert(ui.alert, parseUiError(error), true));
  });
  document.querySelectorAll("[data-tip-amount]").forEach((button) => {
    button.addEventListener("click", () => {
      if (ui.tipAmount) ui.tipAmount.value = button.dataset.tipAmount || "0.001";
    });
  });
  ui.feed?.addEventListener("click", async (event) => {
    const vote = event.target.closest("[data-alpha-vote]");
    if (vote) {
      voteAlpha(vote.dataset.alphaId || "", vote.dataset.alphaVote || "").catch((error) => setAlert(ui.alert, parseUiError(error), true));
      return;
    }
    const tip = event.target.closest("[data-alpha-tip]");
    if (tip) {
      try {
        openTipModal(tip.dataset.alphaTip || "");
      } catch (error) {
        setAlert(ui.alert, parseUiError(error), true);
      }
    }
  });
  ui.feed?.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-alpha-comment-form]");
    if (!form) return;
    event.preventDefault();
    commentAlpha(form).catch((error) => {
      if (String(error?.message || "").includes("Connect X")) requestXAuthorization();
      else setAlert(ui.alert, parseUiError(error), true);
    });
  });
  ui.hotProjects?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-scroll-alpha]");
    if (!row) return;
    document.getElementById(`alpha-${row.dataset.scrollAlpha}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

async function init() {
  state.xProfile = loadXAuth();
  await handleXOAuthReturn();
  renderXStatus();
  await initWallet();
  bindEvents();
  await loadAlpha();
}

init().catch((error) => setAlert(ui.alert, parseUiError(error), true));
