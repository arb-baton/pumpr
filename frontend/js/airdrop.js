import { api } from "./api.js?v=20260630local";
import { parseUiError, shortAddress } from "./core.js?v=20260630local";
import { setAlert } from "./ui.js?v=20260630local";

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
  const symbol = String(payload?.symbol || "TOKEN").toUpperCase();
  if (ui.claimableStat) ui.claimableStat.textContent = payload ? `${formatTokenAmount(payload.claimableTokens)} $${symbol}` : "0";
  if (ui.holderStat) ui.holderStat.textContent = payload ? String(payload.holderCount || 0) : "0";
  if (ui.chainStat) ui.chainStat.textContent = payload ? String(payload.chainName || "-") : "-";
}

function renderEmpty(message = "Once the official Pump-r token launches, this page will show the top holders receiving creator-reward drops. No random token contracts are checked here.", title = "Airdrop not live yet") {
  if (!ui.results) return;
  ui.results.innerHTML = `
    <article class="panel-card airdrop-empty-state">
      <span class="airdrop-empty-icon">0x</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
  setStats(null);
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
    <article class="panel-card airdrop-plan-card">
      <div class="airdrop-plan-head">
        <div>
          <small>Step 2</small>
          <h2>${escapeHtml(payload?.name || "Token")} <span>$${escapeHtml(symbol)}</span></h2>
          <p>${escapeHtml(payload?.chainName || "Chain")} holders ranked for the official Pump-r reward drop${isSolana ? " from top Solana token accounts." : " from creator rewards."}</p>
        </div>
        <div class="airdrop-plan-actions">
          <a class="btn-ghost" href="${tokenUrl}" ${isSolana ? 'target="_blank" rel="noopener noreferrer"' : ""}>Open token</a>
          <button id="airdropCopyCsv" class="btn-primary" type="button">Copy payout CSV</button>
        </div>
      </div>
      <div class="airdrop-kpi-grid">
        <span><b>${escapeHtml(claimable)} $${escapeHtml(symbol)}</b><small>${isSolana ? "Tracked rewards" : "Creator rewards"}</small></span>
        <span><b>${escapeHtml(String(payload.holderCount || allocations.length))}</b><small>Eligible holders</small></span>
        <span><b>${escapeHtml(shortAddress(payload.creator || ""))}</b><small>Creator</small></span>
      </div>
      <div class="airdrop-holder-table">
        <div class="airdrop-table-head">
          <span>#</span>
          <span>Holder</span>
          <span>Balance</span>
          <span>Share</span>
          <span>Airdrop</span>
        </div>
        ${allocations
          .map((row, index) => {
            const allocation = formatTokenAmount(row.allocationTokens || 0);
            const balance = formatTokenAmount(row.balanceTokens || 0);
            const pct = Number(row.holderPct || 0).toFixed(2);
            return `
              <div class="airdrop-table-row">
                <span class="airdrop-rank">${index + 1}</span>
                <span class="airdrop-holder-address">${escapeHtml(shortAddress(row.address))}</span>
                <span>${escapeHtml(balance)} $${escapeHtml(symbol)}</span>
                <span>${escapeHtml(pct)}%</span>
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

async function previewAirdrop() {
  if (!officialAirdrop?.configured) {
    renderEmpty(
      "The official Pump-r airdrop token is not configured yet. After launch, set AIRDROP_TOKEN_ADDRESS and AIRDROP_CHAIN_ID so this page can show the top holders.",
      "Official token not configured"
    );
    setAlert(ui.alert, "Official airdrop token is not configured yet.", true);
    return;
  }
  try {
    ui.previewBtn.disabled = true;
    ui.previewBtn.textContent = "Reading holders...";
    ui.status.textContent = `Reading top ${officialAirdrop.chainShortName || officialAirdrop.chainName || ""} holders for the official token...`;
    const payload = await api.airdropPreview({ limit: 30 });
    renderPreview(payload);
    ui.status.textContent = "Official holder reward preview is ready.";
  } catch (err) {
    renderEmpty(parseUiError(err), "Airdrop preview unavailable");
    ui.status.textContent = parseUiError(err);
    setAlert(ui.alert, parseUiError(err), true);
  } finally {
    ui.previewBtn.disabled = false;
    ui.previewBtn.textContent = "Preview split";
  }
}

function renderOfficialAirdrop(config) {
  officialAirdrop = config || null;
  const configured = Boolean(config?.configured);
  const symbol = String(config?.symbol || "Pump-r").replace(/^\$/, "").toUpperCase();
  const chain = String(config?.chainShortName || config?.chainName || "-").toUpperCase();
  const token = String(config?.token || "");
  if (ui.officialTop) ui.officialTop.textContent = configured ? `$${symbol} holder rewards` : "Official holder rewards";
  if (ui.officialName) ui.officialName.textContent = configured ? `$${symbol} official airdrop` : "Official Pump-r token";
  if (ui.officialMeta) {
    ui.officialMeta.textContent = configured
      ? `${chain} - ${shortAddress(token)} - top holders receive creator-reward drops`
      : "Not live yet. The official token address will be locked here after launch.";
  }
  if (ui.heroCopy) ui.heroCopy.textContent = config?.message || ui.heroCopy.textContent;
  if (ui.status) ui.status.textContent = configured ? "Official token locked. Ready to read top holders." : "Official airdrop token not configured yet.";
  if (ui.previewBtn) ui.previewBtn.disabled = !configured;
  if (!configured) {
    renderEmpty(
      "After the official Pump-r token launches, this page will automatically show the top holders eligible for creator-reward drops. Users cannot paste other contracts here.",
      "Official token not configured"
    );
  }
}

async function init() {
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
}

init();
