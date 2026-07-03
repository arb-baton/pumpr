import { api } from "./api.js?v=20260703adminwallet";
import { restoreWalletFromSession, walletState } from "./core.js?v=20260703sharedauth";

const form = document.getElementById("pumprCardWaitlistForm");
const emailInput = document.getElementById("pumprCardEmail");
const statusEl = document.getElementById("pumprCardStatus");
const adminPanel = document.getElementById("pumprCardAdminPanel");
const adminRefresh = document.getElementById("pumprCardAdminRefresh");
const waitlistCount = document.getElementById("pumprCardWaitlistCount");
const waitlistEntries = document.getElementById("pumprCardWaitlistEntries");
const supportCount = document.getElementById("pumprCardSupportCount");
const supportEntries = document.getElementById("pumprCardSupportEntries");
const ADMIN_AUTH_SCOPE = "pumpr-admin";
let adminProofCache = null;

function setStatus(message = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", Boolean(isError));
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAddress(value = "") {
  const text = String(value || "").trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(text)) return text;
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : "";
}

function addressKey(value = "") {
  const normalized = normalizeAddress(value);
  if (!normalized) return "";
  return /^0x[a-fA-F0-9]{40}$/.test(normalized) ? normalized.toLowerCase() : normalized;
}

function buildAdminAuthMessage(wallet, issuedAt) {
  return [`Pump-r admin access`, `Wallet: ${wallet}`, `Scope: ${ADMIN_AUTH_SCOPE}`, `Issued At: ${issuedAt}`].join("\n");
}

function bytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let out = "";
  for (let i = 0; i < arr.length; i += 1) out += String.fromCharCode(arr[i]);
  return btoa(out);
}

async function getAdminProof(address) {
  const normalized = normalizeAddress(address);
  const key = addressKey(normalized);
  const now = Date.now();
  if (adminProofCache?.key === key && Date.parse(adminProofCache.issuedAt || "") > now - 10 * 60 * 1000) {
    return adminProofCache.proof;
  }
  const ws = walletState() || {};
  const provider = ws.solanaProvider || ws.provider;
  if (!normalized || !provider?.signMessage) throw new Error("Connect the admin Phantom wallet to view admin data.");
  const issuedAt = new Date().toISOString();
  const adminMessage = buildAdminAuthMessage(normalized, issuedAt);
  const signed = await provider.signMessage(new TextEncoder().encode(adminMessage), "utf8");
  const signature = signed?.signature || signed;
  const proof = {
    adminWallet: normalized,
    adminMessage,
    adminSignature: bytesToBase64(signature)
  };
  adminProofCache = { key, issuedAt, proof };
  return proof;
}

function shortAddress(value = "") {
  const text = String(value || "").trim();
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function formatTime(unixSeconds) {
  const ts = Number(unixSeconds || 0) * 1000;
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(ts));
}

function activeWalletAddress() {
  const ws = walletState();
  return normalizeAddress(ws.solanaAddress || ws.address || ws.publicKey || "");
}

function isAdminWallet(address, config = {}) {
  const key = addressKey(address);
  if (!key) return false;
  const platformKey = addressKey(config.platformAddress || "");
  const adminWallets = Array.isArray(config.adminWallets) ? config.adminWallets : [];
  return platformKey === key || adminWallets.some((wallet) => addressKey(wallet) === key);
}

function setAdminLoading() {
  if (waitlistEntries) waitlistEntries.innerHTML = `<p class="muted">Loading waitlist...</p>`;
  if (supportEntries) supportEntries.innerHTML = `<p class="muted">Loading support inbox...</p>`;
}

function renderWaitlist(entries = []) {
  if (waitlistCount) waitlistCount.textContent = String(entries.length);
  if (!waitlistEntries) return;
  waitlistEntries.innerHTML = entries.length
    ? entries
        .slice(0, 80)
        .map(
          (entry) => `
            <div class="pumpr-card-admin-row">
              <div>
                <strong>${escapeHtml(entry.email || "No email")}</strong>
                <span>${escapeHtml(entry.wallet ? shortAddress(entry.wallet) : "No wallet attached")}</span>
              </div>
              <em>${escapeHtml(formatTime(entry.createdAt))}</em>
            </div>
          `
        )
        .join("")
    : `<p class="muted">No PUMPR Card waitlist signups yet.</p>`;
}

function renderSupport(messages = []) {
  if (supportCount) supportCount.textContent = String(messages.length);
  if (!supportEntries) return;
  supportEntries.innerHTML = messages.length
    ? messages
        .slice(0, 80)
        .map(
          (message) => `
            <div class="pumpr-card-admin-row">
              <div>
                <strong>${escapeHtml(message.subject || "Support request")}</strong>
                <span>${escapeHtml(shortAddress(message.fromAddress || ""))} - ${escapeHtml((message.body || "").slice(0, 92))}</span>
              </div>
              <em>${escapeHtml(formatTime(message.createdAt))}</em>
            </div>
          `
        )
        .join("")
    : `<p class="muted">No support messages yet.</p>`;
}

async function loadAdminPanel() {
  if (!adminPanel) return;
  const address = activeWalletAddress();
  let config = {};
  try {
    config = await api.supportConfig();
  } catch {
    config = {};
  }
  const admin = isAdminWallet(address, config);
  adminPanel.hidden = !admin;
  if (!admin) return;

  setAdminLoading();
  try {
    const proof = await getAdminProof(address);
    const [waitlistPayload, supportPayload] = await Promise.all([
      api.pumprCardWaitlistEntries(address, proof),
      api.supportInbox(address, proof)
    ]);
    renderWaitlist(Array.isArray(waitlistPayload?.entries) ? waitlistPayload.entries : []);
    renderSupport(Array.isArray(supportPayload?.messages) ? supportPayload.messages : []);
  } catch (error) {
    if (waitlistEntries) waitlistEntries.innerHTML = `<p class="muted error">${escapeHtml(error?.message || "Admin data unavailable")}</p>`;
    if (supportEntries) supportEntries.innerHTML = `<p class="muted error">${escapeHtml(error?.message || "Admin data unavailable")}</p>`;
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = String(emailInput?.value || "").trim();
  if (!email) {
    setStatus("Enter your email to join the PUMPR Card waitlist.", true);
    return;
  }
  const submitBtn = form.querySelector('button[type="submit"]');
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Joining...";
    }
    setStatus("Saving your spot...");
    await api.pumprCardWaitlist({
      email,
      wallet: activeWalletAddress(),
      source: "pumpr-card-page"
    });
    form.reset();
    setStatus("You're on the PUMPR Card waitlist. Watch your inbox for early access updates.");
  } catch (error) {
    setStatus(error?.message || "Could not join the waitlist. Try again.", true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Join waitlist";
    }
  }
});

adminRefresh?.addEventListener("click", () => {
  loadAdminPanel().catch(() => {});
});

window.addEventListener("etherpump:walletChanged", () => loadAdminPanel().catch(() => {}));
window.addEventListener("etherpump:solanaWalletChanged", () => loadAdminPanel().catch(() => {}));

restoreWalletFromSession("")
  .catch(() => null)
  .finally(() => loadAdminPanel().catch(() => {}));
