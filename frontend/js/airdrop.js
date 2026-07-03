import { api } from "./api.js?v=20260703holdingsrefresh";
import { parseUiError, shortAddress } from "./core.js?v=20260703sharedauth";
import { setAlert } from "./ui.js?v=20260703sharedauth";
import { KOL_LEADERBOARD } from "./kolData.js?v=20260703kol51";

const AIRDROP_HOLDER_REFRESH_MS = 30_000;
const COMPLETED_AIRDROP_URL = "/data/pumpr-airdrop-250k.json?v=20260703drop250k";
const KOL_SEED_AMOUNT = 5_000;
const KOL_BOOSTED_WALLETS = new Set([
  "GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52",
  "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o",
  "CUHBzSPSaNS3tArEtM3maSV6pNdJhHJFYZpurPPK9P7H",
  "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f"
]);

const ui = {
  officialTop: document.getElementById("airdropOfficialTop"),
  officialName: document.getElementById("airdropOfficialName"),
  officialMeta: document.getElementById("airdropOfficialMeta"),
  heroCopy: document.getElementById("airdropHeroCopy"),
  previewBtn: document.getElementById("airdropPreviewBtn"),
  status: document.getElementById("airdropStatus"),
  results: document.getElementById("airdropResults"),
  claimableStat: document.getElementById("airdropClaimableStat"),
  holderStat: document.getElementById("airdropHolderStat"),
  chainStat: document.getElementById("airdropChainStat"),
  alert: document.getElementById("alert")
};

let lastPayload = null;
let officialAirdrop = null;
let completedAirdrop = null;

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTokenAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 1 : 2)}K`;
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(3);
}

function formatHoldingAge(days = 0, snapshots = 0) {
  const d = Number(days || 0);
  const s = Math.max(0, Number(snapshots || 0));
  if (d >= 1) return `${d.toFixed(d >= 10 ? 0 : 1)}d / ${s} reads`;
  if (s > 1) return `${s} reads`;
  return "tracking";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function solscanTxUrl(signature = "") {
  return `https://solscan.io/tx/${encodeURIComponent(signature)}`;
}

function completedStatusLabel(status = "") {
  return status === "retained_by_dev_wallet_self_allocation" ? "Dev allocation retained" : "Sent";
}

function allocationCsv(payload = lastPayload) {
  const symbol = String(payload?.symbol || "TOKEN").toUpperCase();
  const rows = Array.isArray(payload?.allocations) ? payload.allocations : [];
  return ["address,allocation_token,token_symbol,holder_balance,holder_pct"]
    .concat(
      rows.map((row) =>
        [
          row.address,
          Number(row.allocationTokens || 0),
          symbol,
          Number(row.balanceTokens || 0),
          Number(row.holderPct || 0)
        ].join(",")
      )
    )
    .join("\n");
}

function setStats(payload = null) {
  if (completedAirdrop) {
    setCompletedStats();
    return;
  }
  const symbol = String(payload?.symbol || "TOKEN").toUpperCase();
  if (ui.claimableStat) ui.claimableStat.textContent = payload ? `${formatTokenAmount(payload.claimableTokens)} $${symbol}` : "0";
  if (ui.holderStat) ui.holderStat.textContent = payload ? String(payload.holderCount || 0) : "0";
  if (ui.chainStat) ui.chainStat.textContent = payload ? String(payload.chainName || "-") : "-";
}

function setCompletedStats() {
  if (!completedAirdrop) return;
  if (ui.claimableStat) ui.claimableStat.textContent = `${formatTokenAmount(completedAirdrop.totalAllocatedPumpr)} $PUMPR`;
  if (ui.holderStat) ui.holderStat.textContent = String(completedAirdrop.eligibleHolderCount || completedAirdrop.recipients?.length || 0);
  if (ui.chainStat) ui.chainStat.textContent = "SOL";
}

function completedAirdropHtml() {
  const rows = Array.isArray(completedAirdrop?.recipients) ? completedAirdrop.recipients : [];
  if (!completedAirdrop || !rows.length) return "";
  const executed = formatDateTime(completedAirdrop.executedAt);
  const amount = formatTokenAmount(completedAirdrop.amountPerHolderPumpr);
  const total = formatTokenAmount(completedAirdrop.totalAllocatedPumpr);
  const source = completedAirdrop.source || {};
  const txLinks = (completedAirdrop.txSignatures || [])
    .map((signature, index) => `<a href="${solscanTxUrl(signature)}" target="_blank" rel="noopener noreferrer">Batch ${index + 1}</a>`)
    .join("");
  return `
    <article class="panel-card airdrop-plan-card airdrop-completed-card">
      <div class="airdrop-plan-head">
        <div>
          <small>Completed drop</small>
          <h2>${escapeHtml(completedAirdrop.title || "PUMPR loyal holder airdrop")} <span>250K each</span></h2>
          <p>Paid to launch-day holders from the Pump.fun holder list who kept holding at least 1% through the live Solana cross-check. Executed ${escapeHtml(executed)}.</p>
        </div>
        <div class="airdrop-plan-actions airdrop-tx-links">
          ${source.primaryUrl ? `<a href="${escapeHtml(source.primaryUrl)}" target="_blank" rel="noopener noreferrer">Pump.fun</a>` : ""}
          ${txLinks}
        </div>
      </div>
      <div class="airdrop-kpi-grid">
        <span><b>${escapeHtml(total)} $PUMPR</b><small>Total allocated</small></span>
        <span><b>${escapeHtml(String(completedAirdrop.eligibleHolderCount || rows.length))}</b><small>Eligible holders</small></span>
        <span><b>${escapeHtml(amount)} $PUMPR</b><small>Per holder</small></span>
      </div>
      <div class="airdrop-source-note">
        <strong>${escapeHtml(source.primary || "Pump.fun holder list")}</strong>
        <span>${escapeHtml(source.crossCheck || "Cross-checked against live Solana holder accounts.")}</span>
      </div>
      <div class="airdrop-holder-table airdrop-completed-table">
        <div class="airdrop-table-head">
          <span>#</span>
          <span>Holder</span>
          <span>Received</span>
          <span>Share</span>
          <span>Holding since</span>
          <span>Proof</span>
        </div>
        ${rows
          .map((row, index) => {
            const tx = row.signature
              ? `<a href="${solscanTxUrl(row.signature)}" target="_blank" rel="noopener noreferrer">Solscan</a>`
              : `<span>${escapeHtml(completedStatusLabel(row.status))}</span>`;
            const pct = Number(row.holderPctAtSnapshot || 0).toFixed(2);
            return `
              <div class="airdrop-table-row">
                <span class="airdrop-rank">${index + 1}</span>
                <span class="airdrop-holder-address">${escapeHtml(shortAddress(row.address))}</span>
                <strong>${escapeHtml(formatTokenAmount(row.amountPumpr || 0))} $PUMPR</strong>
                <span>${escapeHtml(pct)}%</span>
                <span>${escapeHtml(row.holdingSinceEt || "-")}</span>
                <span>${tx}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function kolHoldingAmount(wallet = "") {
  return KOL_BOOSTED_WALLETS.has(wallet) ? 15_000 : KOL_SEED_AMOUNT;
}

function renderKolSeedHtml() {
  const rows = Array.isArray(KOL_LEADERBOARD) ? KOL_LEADERBOARD : [];
  if (!rows.length) return "";
  const totalHolding = rows.length;
  const totalSent = rows.reduce((sum, row) => sum + kolHoldingAmount(row.wallet), 0);
  return `
    <article class="panel-card airdrop-kol-card">
      <div class="airdrop-plan-head airdrop-kol-head">
        <div>
          <small>KOL seeding</small>
          <h2>PUMPR is now in KOL wallets</h2>
          <p>Visual tracker for the latest KOL wallet seeding. Each card shows the profile image, holding status, amount, and a copyable wallet.</p>
        </div>
        <div class="airdrop-kol-summary" aria-label="KOL distribution summary">
          <span><b>${escapeHtml(formatTokenAmount(totalSent))}</b><small>$PUMPR sent</small></span>
          <span><b>${escapeHtml(String(totalHolding))}</b><small>holding</small></span>
        </div>
      </div>
      <div class="airdrop-kol-grid">
        ${rows
          .map((row) => {
            const amount = kolHoldingAmount(row.wallet);
            return `
              <article class="airdrop-kol-tile" title="${escapeHtml(row.name || "KOL")} is holding $PUMPR">
                <div class="airdrop-kol-avatar-wrap">
                  <img src="${escapeHtml(row.image || "/assets/pump-r-logo.png")}" alt="${escapeHtml(row.name || "KOL")}" loading="lazy" />
                  <span class="airdrop-kol-live-dot" aria-hidden="true"></span>
                </div>
                <div class="airdrop-kol-meta">
                  <strong>${escapeHtml(row.name || "KOL")}</strong>
                  <span>Holding</span>
                  <button class="airdrop-kol-wallet-copy" type="button" data-wallet="${escapeHtml(row.wallet || "")}" aria-label="Copy ${escapeHtml(row.name || "KOL")} wallet">
                    ${escapeHtml(shortAddress(row.wallet || ""))}
                  </button>
                </div>
                <div class="airdrop-kol-holding">
                  <span>${escapeHtml(formatTokenAmount(amount))}</span>
                  <small>$PUMPR</small>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function flashKolCopyButton(button, label = "Copied") {
  if (!button) return;
  const original = button.dataset.originalLabel || button.textContent.trim();
  button.dataset.originalLabel = original;
  button.textContent = label;
  button.classList.add("copied");
  window.clearTimeout(button._kolCopyTimer);
  button._kolCopyTimer = window.setTimeout(() => {
    button.textContent = button.dataset.originalLabel || original;
    button.classList.remove("copied");
  }, 1400);
}

async function copyKolWallet(wallet = "", button = null) {
  const value = String(wallet || "").trim();
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      throw new Error("Clipboard API unavailable");
    }
    flashKolCopyButton(button, "Copied");
    setAlert(ui.alert, "KOL wallet copied");
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.focus();
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (copied) {
      flashKolCopyButton(button, "Copied");
      setAlert(ui.alert, "KOL wallet copied");
      return;
    }
    showKolWalletCopyBox(value);
    flashKolCopyButton(button, "Copied");
    setAlert(ui.alert, "KOL wallet copied");
  }
}

function showKolWalletCopyBox(wallet = "") {
  const value = String(wallet || "").trim();
  if (!value) return;
  let box = document.getElementById("kolWalletCopyBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "kolWalletCopyBox";
    box.className = "kol-wallet-copy-box";
    box.innerHTML = `
      <div>
        <small>Wallet</small>
        <input id="kolWalletCopyInput" readonly />
      </div>
      <button id="kolWalletCopyClose" type="button" aria-label="Close wallet copy box">Close</button>
    `;
    document.body.appendChild(box);
    box.querySelector("#kolWalletCopyClose")?.addEventListener("click", () => box.remove());
  }
  const input = box.querySelector("#kolWalletCopyInput");
  if (input) {
    input.value = value;
    input.focus();
    input.select();
  }
}

function renderEmpty(message = "The official Pumpfun Remastered mint is locked here. Current top holders are tracked over time so loyal holders can qualify for airdrops.", title = "Long-term holder tracking") {
  if (!ui.results) return;
  ui.results.innerHTML = `
    ${completedAirdropHtml()}
    ${renderKolSeedHtml()}
    <article class="panel-card airdrop-empty-state">
      <span class="airdrop-empty-icon">0x</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
  if (completedAirdrop) setCompletedStats();
  else setStats(null);
}

function renderPreview(payload) {
  lastPayload = payload;
  setStats(payload);
  const allocations = Array.isArray(payload?.allocations) ? payload.allocations : [];
  const symbol = String(payload?.symbol || "TOKEN").toUpperCase();
  const claimable = formatTokenAmount(payload?.claimableTokens || 0);
  const isSolana = Number(payload?.chainId || 0) === 101;
  const tokenUrl = isSolana
    ? `https://pump.fun/coin/${encodeURIComponent(payload?.token || "")}`
    : `/token?token=${encodeURIComponent(payload?.token || "")}&chainId=${encodeURIComponent(String(payload?.chainId || 1))}`;

  if (!allocations.length) {
    renderEmpty("No eligible holders were found yet. Try again after buys or sells have happened.");
    return;
  }

  ui.results.innerHTML = `
    ${completedAirdropHtml()}
    ${renderKolSeedHtml()}
    <article class="panel-card airdrop-plan-card">
      <div class="airdrop-plan-head">
        <div>
          <small>Step 2</small>
          <h2>${escapeHtml(payload?.name || "Token")} <span>$${escapeHtml(symbol)}</span></h2>
          <p>${escapeHtml(payload?.longTermPolicy || "Top holders who keep holding over time are prioritized for the airdrop.")}</p>
        </div>
        <div class="airdrop-plan-actions">
          <a class="btn-ghost" href="${tokenUrl}" ${isSolana ? 'target="_blank" rel="noopener noreferrer"' : ""}>Open token</a>
          <button id="airdropCopyCsv" class="btn-primary" type="button">Copy payout CSV</button>
        </div>
      </div>
      <div class="airdrop-kpi-grid">
        <span><b>${escapeHtml(claimable)} $${escapeHtml(symbol)}</b><small>${isSolana ? "Tracked rewards" : "Creator rewards"}</small></span>
        <span><b>${escapeHtml(String(payload.holderCount || allocations.length))}</b><small>Tracked holders</small></span>
        <span><b>${escapeHtml(shortAddress(payload.creator || ""))}</b><small>Creator</small></span>
      </div>
      <div class="airdrop-holder-table">
        <div class="airdrop-table-head">
          <span>#</span>
          <span>Holder</span>
          <span>Balance</span>
          <span>Share</span>
          <span>Holding</span>
          <span>Airdrop</span>
        </div>
        ${allocations
          .map((row, index) => {
            const allocation = formatTokenAmount(row.allocationTokens || 0);
            const balance = formatTokenAmount(row.balanceTokens || 0);
            const pct = Number(row.holderPct || 0).toFixed(2);
            const holding = formatHoldingAge(row.holdingDays || 0, row.snapshotsHeld || 0);
            return `
              <div class="airdrop-table-row">
                <span class="airdrop-rank">${index + 1}</span>
                <span class="airdrop-holder-address">${escapeHtml(shortAddress(row.address))}</span>
                <span>${escapeHtml(balance)} $${escapeHtml(symbol)}</span>
                <span>${escapeHtml(pct)}%</span>
                <span>${escapeHtml(holding)}</span>
                <strong>${escapeHtml(allocation)} $${escapeHtml(symbol)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;

  document.getElementById("airdropCopyCsv")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(allocationCsv(payload));
      setAlert(ui.alert, "Payout CSV copied");
    } catch {
      setAlert(ui.alert, "Could not copy payout CSV", true);
    }
  });
}

async function previewAirdrop(options = {}) {
  const silent = Boolean(options.silent);
  if (!officialAirdrop?.configured) {
    renderEmpty(
      "The official Pumpfun Remastered mint is not configured yet. After launch, set AIRDROP_TOKEN_ADDRESS and AIRDROP_CHAIN_ID so this page can show top long-term holders.",
      "Official token not configured"
    );
    if (!silent) setAlert(ui.alert, "Official airdrop token is not configured yet.", true);
    return;
  }
  try {
    if (!silent) {
      ui.previewBtn.disabled = true;
      ui.previewBtn.textContent = "Reading holders...";
      ui.status.textContent = `Reading top ${officialAirdrop.chainShortName || officialAirdrop.chainName || ""} holders and updating long-term holder tracking...`;
    }
    const payload = await api.airdropPreview({ limit: 30, fresh: true });
    renderPreview(payload);
    ui.status.textContent = silent ? "Holder list refreshed." : "Long-term holder reward preview is ready.";
  } catch (err) {
    if (!silent) {
      renderEmpty(parseUiError(err), "Airdrop preview unavailable");
      ui.status.textContent = parseUiError(err);
      setAlert(ui.alert, parseUiError(err), true);
    }
  } finally {
    if (!silent) {
      ui.previewBtn.disabled = false;
      ui.previewBtn.textContent = "Preview split";
    }
  }
}

function renderOfficialAirdrop(config) {
  officialAirdrop = config || null;
  const configured = Boolean(config?.configured);
  const symbol = String(config?.symbol || "Pump-r").replace(/^\$/, "").toUpperCase();
  const chain = String(config?.chainShortName || config?.chainName || "-").toUpperCase();
  const token = String(config?.token || "");
  if (ui.officialTop) ui.officialTop.textContent = configured ? `$${symbol} loyal holder rewards` : "Official holder rewards";
  if (ui.officialName) ui.officialName.textContent = configured ? `${config?.name || "Pumpfun Remastered"} airdrop` : "Official Pumpfun Remastered token";
  if (ui.officialMeta) {
    ui.officialMeta.textContent = configured
      ? `${chain} - ${shortAddress(token)} - top long-term holders are prioritized`
      : "The official Pump.fun mint will be locked here after launch.";
  }
  if (ui.heroCopy) ui.heroCopy.textContent = config?.message || ui.heroCopy.textContent;
  if (ui.status) ui.status.textContent = configured ? "Official mint locked. Ready to track long-term top holders." : "Official airdrop token not configured yet.";
  if (ui.previewBtn) ui.previewBtn.disabled = !configured;
  if (!configured) {
    renderEmpty(
      "The official Pumpfun Remastered mint is locked here. Current top holders are tracked over time so loyal holders can qualify for airdrops.",
      "Long-term holder tracking"
    );
  }
}

async function loadCompletedAirdrop() {
  try {
    const response = await fetch(COMPLETED_AIRDROP_URL, { cache: "no-store" });
    if (!response.ok) return;
    completedAirdrop = await response.json();
    setCompletedStats();
    renderEmpty(
      "Live holder tracking is loading. The completed Pump.fun-verified 250K holder drop is shown above.",
      "Live holder tracking"
    );
  } catch {
    completedAirdrop = null;
  }
}

async function init() {
  await loadCompletedAirdrop();
  try {
    const config = await api.officialAirdrop();
    renderOfficialAirdrop(config);
    if (config?.configured) previewAirdrop();
  } catch (err) {
    renderOfficialAirdrop({ configured: false });
    renderEmpty(parseUiError(err), "Airdrop config unavailable");
    setAlert(ui.alert, parseUiError(err), true);
  }
  ui.previewBtn?.addEventListener("click", previewAirdrop);
  ui.results?.addEventListener("click", (event) => {
    const button = event.target.closest?.(".airdrop-kol-wallet-copy");
    if (!button) return;
    copyKolWallet(button.dataset.wallet, button);
  });
  setInterval(() => {
    if (document.visibilityState === "hidden" || !officialAirdrop?.configured) return;
    previewAirdrop({ silent: true }).catch(() => {
      // ignore background holder refresh failures
    });
  }, AIRDROP_HOLDER_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !officialAirdrop?.configured) return;
    previewAirdrop({ silent: true }).catch(() => {
      // ignore foreground holder refresh failures
    });
  });
}

init();
