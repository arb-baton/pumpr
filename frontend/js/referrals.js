import { api } from "./api.js?v=20260703referrals";
import { shortAddress, solanaWalletState, walletState } from "./core.js?v=20260703sharedauth";
import { initTopbarWalletProfile, setAlert, showCopyToast } from "./ui.js?v=20260703profileconsistency";

const REFERRAL_PENDING_KEY = "pumpr.referral.pending.v1";
const REFRESH_MS = 45_000;

const ui = {
  signInBtn: document.getElementById("signInBtn"),
  heroTier: document.getElementById("referralHeroTier"),
  heroQualified: document.getElementById("referralHeroQualified"),
  heroReward: document.getElementById("referralHeroReward"),
  refreshBtn: document.getElementById("referralRefreshBtn"),
  nameInput: document.getElementById("referralNameInput"),
  nameSaveBtn: document.getElementById("referralNameSaveBtn"),
  linkBtn: document.getElementById("referralLinkBtn"),
  qrWrap: document.getElementById("referralQrWrap"),
  qrImage: document.getElementById("referralQrImage"),
  qrMeta: document.getElementById("referralQrMeta"),
  status: document.getElementById("referralStatus"),
  tierName: document.getElementById("referralTierName"),
  tierCopy: document.getElementById("referralTierCopy"),
  scoreValue: document.getElementById("referralScoreValue"),
  invited: document.getElementById("referralInvited"),
  holding: document.getElementById("referralHolding"),
  gold: document.getElementById("referralGold"),
  rows: document.getElementById("referralRows"),
  leaderboard: document.getElementById("referralLeaderboard"),
  updatedAt: document.getElementById("referralUpdatedAt"),
  rules: document.getElementById("referralRules")
};

let currentPayload = null;
let walletControls = null;
let refreshTimer = null;
let backgroundRefreshTimer = null;
let renderedQrLink = "";

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function connectedReferralWallet() {
  const ws = walletState();
  const sol = solanaWalletState();
  return ws.generatedWallet?.address || sol.address || ws.solanaAddress || ws.address || "";
}

function formatAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatAge(seconds = 0) {
  const s = Math.max(0, Number(seconds || 0));
  if (s >= 86400) return `${(s / 86400).toFixed(s >= 864000 ? 0 : 1)}d`;
  if (s >= 3600) return `${(s / 3600).toFixed(1)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return "tracking";
}

function formatDate(ts = 0) {
  const n = Number(ts || 0);
  if (!n) return "-";
  return new Date(n * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function referralTierFromStats(stats = {}) {
  if (Number(stats.goldOrBetter || 0) >= 3 || Number(stats.score || 0) >= 1000) return "Diamond";
  if (Number(stats.goldOrBetter || 0) >= 1 || Number(stats.score || 0) >= 300) return "Gold";
  if (Number(stats.qualified || 0) >= 2 || Number(stats.score || 0) >= 120) return "Silver";
  if (Number(stats.qualified || 0) >= 1 || Number(stats.score || 0) > 0) return "Bronze";
  return "Pending";
}

function normalizePendingRef(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    const ref = String(parsed.ref || "").trim().toLowerCase();
    const ts = Number(parsed.ts || 0);
    if (!ref || !ts || Date.now() - ts > 7 * 86400 * 1000) return null;
    return {
      ref,
      landingPath: String(parsed.landingPath || "/").slice(0, 240),
      ts
    };
  } catch {
    return null;
  }
}

function pendingReferral() {
  try {
    return normalizePendingRef(localStorage.getItem(REFERRAL_PENDING_KEY));
  } catch {
    return null;
  }
}

async function trackPendingReferral() {
  const pending = pendingReferral();
  const wallet = connectedReferralWallet();
  if (!pending || !wallet) return null;
  try {
    const payload = await api.referralConnect({
      ref: pending.ref,
      referredWallet: wallet,
      landingPath: pending.landingPath,
      source: "auto-wallet-connect"
    });
    try {
      localStorage.removeItem(REFERRAL_PENDING_KEY);
    } catch {
      // ignore
    }
    return payload;
  } catch (error) {
    setAlert(ui.status, error.message || "Referral link was not connected yet", true);
    return null;
  }
}

function renderQr(link = "") {
  if (!ui.qrImage) return;
  if (ui.qrWrap) ui.qrWrap.hidden = !link;
  if (!link) {
    ui.qrImage.removeAttribute("src");
    renderedQrLink = "";
    return;
  }
  if (renderedQrLink === link && ui.qrImage.getAttribute("src")) {
    if (ui.qrWrap) ui.qrWrap.hidden = false;
    return;
  }
  renderedQrLink = link;
  ui.qrImage.onload = () => {
    if (ui.qrWrap) ui.qrWrap.hidden = false;
  };
  ui.qrImage.onerror = () => {
    if (ui.qrWrap) ui.qrWrap.hidden = true;
    setAlert(ui.status, "QR could not be generated. Use the referral link instead.", true);
  };
  ui.qrImage.src = `/api/referrals/qr?url=${encodeURIComponent(link)}`;
}

function renderRules(payload = currentPayload) {
  const tiers = payload?.rules?.tiers || [];
  if (!ui.rules) return;
  ui.rules.innerHTML = tiers.length
    ? tiers
        .map(
          (tier) => `
            <span>
              <b>${escapeHtml(tier.tier)}</b>
              <em>${escapeHtml(tier.requirement)}</em>
              <small>${escapeHtml(formatAmount(tier.estimatePumpr || 0))} $PUMPR estimate</small>
            </span>
          `
        )
        .join("")
    : "";
}

function renderRows(rows = []) {
  if (!ui.rows) return;
  if (!rows.length) {
    ui.rows.className = "referral-table-empty";
    ui.rows.textContent = "No connected referral wallets yet.";
    return;
  }
  ui.rows.className = "referral-table";
  ui.rows.innerHTML = `
    <div class="referral-table-head">
      <span>Wallet</span><span>Tier</span><span>Holding</span><span>Reward</span>
    </div>
    ${rows
      .map(
        (row) => `
          <div class="referral-table-row">
            <span><button class="referral-copy-wallet" type="button" data-wallet="${escapeHtml(row.referredWallet || "")}">${escapeHtml(shortAddress(row.referredWallet || ""))}</button><small>${escapeHtml(formatDate(row.connectedAt))}</small></span>
            <strong class="referral-tier-pill tier-${escapeHtml(String(row.tier || "pending").toLowerCase())}">${escapeHtml(row.tier || "Pending")}</strong>
            <span>${escapeHtml(formatAmount(row.balanceTokens || 0))} $PUMPR<small>${Number(row.holderPct || 0).toFixed(3)}% / ${escapeHtml(formatAge(row.holdingSeconds || 0))}</small></span>
            <span>${escapeHtml(formatAmount(row.rewardEstimatePumpr || 0))}<small>${escapeHtml(String(row.status || "checking"))}</small></span>
          </div>
        `
      )
      .join("")}
  `;
}

function renderLeaderboard(rows = []) {
  if (!ui.leaderboard) return;
  ui.leaderboard.innerHTML = rows.length
    ? rows
        .slice(0, 10)
        .map(
          (row, index) => `
            <div class="referral-leaderboard-row">
              <span>${index + 1}</span>
              <strong>${escapeHtml(row.name || shortAddress(row.wallet || ""))}</strong>
              <em>${escapeHtml(String(row.stats?.qualified || 0))} qualified</em>
              <b>${escapeHtml(String(row.stats?.score || 0))}</b>
            </div>
          `
        )
        .join("")
    : `<div class="referral-table-empty">Leaderboard starts after referrals qualify.</div>`;
}

function render(payload = currentPayload) {
  const wallet = connectedReferralWallet();
  if (!payload || !wallet) {
    if (ui.heroTier) ui.heroTier.textContent = "Connect";
    if (ui.tierName) ui.tierName.textContent = "Not connected";
    if (ui.tierCopy) ui.tierCopy.textContent = "Connect a wallet to generate a unique referral name, link, and QR.";
    renderQr("");
    renderRows([]);
    renderLeaderboard([]);
    renderRules(payload);
    return;
  }

  const stats = payload.stats || {};
  const tier = referralTierFromStats(stats);
  const reward = Number(stats.rewardEstimatePumpr || 0);
  const link = payload.link || payload.queryLink || "";
  if (ui.heroTier) ui.heroTier.textContent = tier;
  if (ui.heroQualified) ui.heroQualified.textContent = String(stats.qualified || 0);
  if (ui.heroReward) ui.heroReward.textContent = formatAmount(reward);
  if (ui.nameInput) ui.nameInput.value = payload.profile?.name || "";
  if (ui.linkBtn) ui.linkBtn.textContent = link || "Referral link unavailable";
  if (ui.qrMeta) ui.qrMeta.textContent = link ? payload.profile?.name || "Ready to share" : "QR appears after sign in.";
  if (ui.tierName) ui.tierName.textContent = `${tier} referrer`;
  if (ui.tierCopy) ui.tierCopy.textContent = `${stats.qualified || 0} qualified wallets, ${stats.holding || 0} holding, ${formatAmount(reward)} $PUMPR estimated for future referral airdrops.`;
  if (ui.scoreValue) ui.scoreValue.textContent = String(stats.score || 0);
  if (ui.invited) ui.invited.textContent = String(stats.invited || 0);
  if (ui.holding) ui.holding.textContent = String(stats.holding || 0);
  if (ui.gold) ui.gold.textContent = String(stats.goldOrBetter || 0);
  if (ui.updatedAt) ui.updatedAt.textContent = payload.updatedAt ? `Updated ${formatDate(payload.updatedAt)}` : "-";
  renderRows(payload.referrals || []);
  renderLeaderboard(payload.leaderboard || []);
  renderRules(payload);
  renderQr(link);
}

function scheduleBackgroundRefresh(delay = 900) {
  if (backgroundRefreshTimer) return;
  backgroundRefreshTimer = window.setTimeout(async () => {
    backgroundRefreshTimer = null;
    if (!connectedReferralWallet()) return;
    await refresh({ silent: true, refresh: true, background: false });
  }, delay);
}

async function refresh(options = {}) {
  const wallet = connectedReferralWallet();
  if (!wallet) {
    currentPayload = null;
    render();
    return null;
  }
  const shouldRefreshLive = options.refresh === true;
  if (ui.refreshBtn && !options.silent) ui.refreshBtn.disabled = true;
  try {
    await trackPendingReferral();
    currentPayload = await api.referralMe(wallet, { refresh: shouldRefreshLive });
    render(currentPayload);
    if (!shouldRefreshLive && options.background !== false) scheduleBackgroundRefresh();
    setAlert(ui.status, options.silent ? "" : shouldRefreshLive ? "Referral data refreshed." : "Referral link loaded.");
    return currentPayload;
  } catch (error) {
    setAlert(ui.status, error.message || "Could not load referrals", true);
    return null;
  } finally {
    if (ui.refreshBtn && !options.silent) ui.refreshBtn.disabled = false;
  }
}

async function saveName() {
  const wallet = connectedReferralWallet();
  const name = String(ui.nameInput?.value || "").trim();
  if (!wallet) {
    setAlert(ui.status, "Connect wallet before editing your referral name.", true);
    return;
  }
  if (ui.nameSaveBtn) ui.nameSaveBtn.disabled = true;
  try {
    currentPayload = await api.saveReferralName({ wallet, name });
    render(currentPayload);
    setAlert(ui.status, "Referral name saved.");
  } catch (error) {
    setAlert(ui.status, error.message || "Could not save referral name", true);
  } finally {
    if (ui.nameSaveBtn) ui.nameSaveBtn.disabled = false;
  }
}

async function copyLink() {
  const link = currentPayload?.link || currentPayload?.queryLink || "";
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    showCopyToast("Referral link copied");
  } catch {
    setAlert(ui.status, "Could not copy referral link", true);
  }
}

function bind() {
  ui.refreshBtn?.addEventListener("click", () => refresh({ refresh: true }));
  ui.nameSaveBtn?.addEventListener("click", saveName);
  ui.nameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveName();
  });
  ui.linkBtn?.addEventListener("click", copyLink);
  ui.rows?.addEventListener("click", async (event) => {
    const button = event.target.closest?.(".referral-copy-wallet");
    if (!button) return;
    const wallet = button.dataset.wallet || "";
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet).catch(() => null);
    showCopyToast("Wallet copied");
  });
}

async function init() {
  bind();
  walletControls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    alertEl: ui.status,
    onChange: () => refresh({ silent: true, refresh: false })
  });
  await walletControls?.ready?.catch(() => null);
  await refresh({ silent: true, refresh: false });
  refreshTimer = window.setInterval(() => refresh({ silent: true, refresh: true }), REFRESH_MS);
}

window.addEventListener("beforeunload", () => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  if (backgroundRefreshTimer) window.clearTimeout(backgroundRefreshTimer);
});

init().catch((error) => setAlert(ui.status, error.message || "Referral page failed to load", true));
