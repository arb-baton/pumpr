import { api } from "./api.js?v=20260703holdingsrefresh";
import { parseUiError, shortAddress } from "./core.js?v=20260706mobileauth";
import { initTopbarWalletProfile, setAlert } from "./ui.js?v=20260706mobileauth";
import { KOL_LEADERBOARD } from "./kolData.js?v=20260703kol51";

const AIRDROP_HOLDER_REFRESH_MS = 30_000;
const AIRDROP_HISTORY_URL = "/data/pumpr-airdrops.json?v=20260712live0p5ready";
const COMPLETED_AIRDROP_URL = "/data/pumpr-airdrop-250k.json?v=20260703drop250k";
const OUTREACH_AIRDROP_URL = "/data/pumpr-outreach-airdrops.json?v=20260706ansemtop100";
const KOL_SEED_AMOUNT = 5_000;
const KOL_BOOSTED_WALLETS = new Set([
  "GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52",
  "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o",
  "CUHBzSPSaNS3tArEtM3maSV6pNdJhHJFYZpurPPK9P7H",
  "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f"
]);
const KOL_X_HANDLES = new Map([
  ["GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52", "blknoiz06"],
  ["CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", "Cented7"],
  ["CUHBzSPSaNS3tArEtM3maSV6pNdJhHJFYZpurPPK9P7H", "samsrepx"],
  ["2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", "Cupseyy"],
  ["86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD", "Publixplayz"],
  ["EaVboaPxFCYanjoNWdkxTbPvt57nhXGu5i6m9m6ZS2kK", "cladzsol"],
  ["8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6", "CookerFlips"],
  ["7mHqL9GzGnbsYLoHLDzB7FiHAZbND2CZCJYFvU9PU1d3", "Kimbazxz"],
  ["4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9", "notdecu"],
  ["xyzfhxfy8NhfeNG3Um3WaUvFXzNuHkrhrZMD8dsStB6", "oh_gasp"],
  ["69z4qTgQ5DBRTJvnQzx2h8jZhNsv5UgADotEwwKUm2JS", "thekryptoking_"],
  ["8nqtxpFpuXwfXG4pBLsDkkuMMPK9FjSkBMCn542HiM3v", "dovvvv7"],
  ["6TAHDM5Tod7dBTZdYQxzgJZKxxPfiNV9udPHMiUNumyK", "Blueycryp"],
  ["6S8GezkxYUfZy9JPtYnanbcZTMB87Wjt1qx3c6ELajKC", "nyhrox"],
  ["AstaWuJuQiAS3AfqmM3xZxrJhkkZNXtW4VyaGQfqV6JL", "astaso1"],
  ["YvEsBWpHK5PJ6Q8m4YrocwKeWys1NG67pbgi73UPnuX", "GucciArchives"],
  ["8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR", "casino616"],
  ["5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg", "Humanevolvd"],
  ["BTf4A2exGK9BCVDNzy65b9dUzXgMqB4weVkvTMFQsadd", "Kevsznx"],
  ["5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij", "slingoorio"],
  ["2hN82SXLUffhG3vxpezRmae1sGrCBMqHHBDxjmjpagqk", "lyftical"],
  ["BXNiM7pqt9Ld3b2Hc8iT3mA5bSwoe9CRrtkSUs15SLWN", "absolquant"],
  ["5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG", "Yennii56"],
  ["EP5mvfhGv6x1XR33Fd8eioiYjtRXAawafPmkz9xBpDvG", "Zemrics"],
  ["JAunzNqs3bVBcWDjDxfq9rgLzJMCadNXoaCgfzLGMtYs", "Penguzxbt"],
  ["4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu", "CryptoRilsio"],
  ["8MaVa9kdt3NW4Q5HyNAm1X5LbR8PQRVDc1W8NMVK88D5", "daumenxyz"],
  ["J23qr98GjGJJqKq9CBEnyRhHbmkaVxtTJNNxKu597wsA", "gr3gor14n"],
  ["Fi2hrxExy6TJnKcbPtQpo6iZzX9SUVbB9mDw6d29NgCn", "quantgz"],
  ["SAALE2x3sn51EyahJyqD6913L3GqHZdZo3egUdMayQp", "Crypt0Pirate_"],
  ["CAPn1yH4oSywsxGU456jfgTrSSUidf9jgeAnHceNUJdw", "himothy"],
  ["ardinRsN1mNYVeoJWTBsWeYeXvuR9UUDGMsCDKpb6AT", "trunoest"],
  ["UxuuMeyX2pZPHmGZ2w3Q8MysvExCAquMtvEfqp2etvm", "pandoraflips"],
  ["7bsTkeWcSPG6nzsbXucxV89YUULoSExNJdX2WqfLHwZ4", "bigwarzeth"],
  ["DZAa55HwXgv5hStwaTEJGXZz1DhHejvpb7Yr762urXam", "ohzarke"],
  ["5vg7he5HibvsAW86wfiuP6jw7VwKmUAnP6P93mVCdpJu", "blixze"],
  ["J9TYAsWWidbrcZybmLSfrLzryANf4CgJBLdvwdGuC8MB", "johnsoncooks101"],
  ["4DdrfiDHpmx55i4SPssxVzS9ZaKLb8qr45NKY9Er9nNh", "TheMisterFrog"],
  ["57rXqaQsvgyBKwebP2StfqQeCBjBS4jsrZFJN5aU2V9b", "ramonos"],
  ["39q2g5tTQn9n7KnuapzwS2smSx3NGYqBoea11tBjsGEt", "Walta61"],
  ["DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm", "Ga__ke"],
  ["Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt", "theonomix"],
  ["4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk", "jijo_exe"],
  ["iPUp3qkm39ycMGbywWFMUyvaDhiiPGXeWXaDtmHNe6C", "ArcNikolas"],
  ["4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU", "XScharo"],
  ["FqojC24nUn3x6oMQC2ypBHmtH7rFAnKS6DvwsJoCMaiv", "CoCoCookerr"],
  ["F8WtsrLzexRkjv11b1sgA3Qj7E889RGYa1jFLGoPwKTB", "kayz_ce"],
  ["GNrmKZCxYyNiSUsjduwwPJzhed3LATjciiKVuSGrsHEC", "Giann2K"],
  ["4nwfXw7n98jEQn93VWY7Cuf1jnn1scHXuXCPGVYS9k6T", "FrostBallin"],
  ["gangJEP5geDHjPVRhDS5dTF5e6GtRvtNogMEEVs91RV", "Qavecc"],
  ["B799XD2RtgkxYRvv5Q9CFnSpVifrsJErWz6MpvBdYFdR", "guidustyy"]
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
  signInBtn: document.getElementById("signInBtn"),
  alert: document.getElementById("alert")
};

let lastPayload = null;
let officialAirdrop = null;
let completedAirdrop = null;
let airdropHistory = [];
let outreachDrops = [];

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
  if (status === "retained_by_dev_wallet_self_allocation") return "Dev allocation retained";
  if (status === "ready_to_send") return "Ready";
  if (status === "pending" || status === "queued") return "Queued";
  return "Sent";
}

function dropIsReady(drop = completedAirdrop) {
  return ["ready_to_send", "queued", "pending"].includes(String(drop?.status || "").toLowerCase());
}

function completedDropTag(drop = completedAirdrop) {
  if (!drop) return "";
  if (drop.badge) return String(drop.badge);
  if (dropIsReady(drop)) return "Ready";
  if (Array.isArray(drop.tiers) && drop.tiers.length) return "Tiered";
  const amount = Number(drop.amountPerHolderPumpr || 0);
  return amount > 0 ? `${formatTokenAmount(amount)} each` : "Completed";
}

function completedDropSummary(drop = completedAirdrop) {
  if (!drop) return "";
  return (
    drop.summary ||
    drop.source?.rule ||
    "Paid current 0.5%+ holders from the Pump.fun holder list and live Solana holder cross-check."
  );
}

function completedDropHistoryControl() {
  if (!Array.isArray(airdropHistory) || airdropHistory.length <= 1) return "";
  const activeId = String(completedAirdrop?.id || "");
  return `
    <label class="airdrop-history-picker">
      <span>Drop history</span>
      <select id="airdropHistorySelect" aria-label="Select airdrop history">
        ${airdropHistory
          .map((drop) => {
            const id = String(drop.id || drop.executedAt || drop.title || "");
            const label = String(drop.badge || drop.title || "Completed drop");
            return `<option value="${escapeHtml(id)}" ${id === activeId ? "selected" : ""}>${escapeHtml(label)}</option>`;
          })
          .join("")}
      </select>
    </label>
  `;
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
  if (ui.chainStat) ui.chainStat.textContent = dropIsReady(completedAirdrop) ? "READY" : "SOL";
}

function completedAirdropHtml() {
  const rows = Array.isArray(completedAirdrop?.recipients) ? completedAirdrop.recipients : [];
  if (!completedAirdrop || !rows.length) return "";
  const executed = formatDateTime(completedAirdrop.executedAt);
  const maxTierAmount = Array.isArray(completedAirdrop.tiers)
    ? Math.max(0, ...completedAirdrop.tiers.map((tier) => Number(tier.amountPumpr || 0)))
    : 0;
  const weightedSummaryAmount = Number(completedAirdrop.summaryAmountPumpr || 0);
  const amount = weightedSummaryAmount
    ? formatTokenAmount(weightedSummaryAmount)
    : completedAirdrop.amountPerHolderPumpr
      ? formatTokenAmount(completedAirdrop.amountPerHolderPumpr)
      : formatTokenAmount(maxTierAmount);
  const perHolderLabel = completedAirdrop.summaryAmountLabel || (completedAirdrop.amountPerHolderPumpr ? "Per holder" : "Max per holder");
  const total = formatTokenAmount(completedAirdrop.totalAllocatedPumpr);
  const source = completedAirdrop.source || {};
  const isReady = dropIsReady(completedAirdrop);
  const eventTime = formatDateTime(isReady ? completedAirdrop.preparedAt || completedAirdrop.snapshotAt : completedAirdrop.executedAt);
  const stateLabel = isReady ? "Ready to send" : "Completed drop";
  const timeVerb = isReady ? "Prepared" : "Executed";
  const receivedLabel = isReady ? "Planned" : "Received";
  const proofLabel = isReady ? "Status" : "Proof";
  const totalLabel = isReady ? "Planned allocation" : "Total allocated";
  const txLinks = (completedAirdrop.txSignatures || [])
    .map((signature, index) => `<a href="${solscanTxUrl(signature)}" target="_blank" rel="noopener noreferrer">Batch ${index + 1}</a>`)
    .join("");
  const proofControls = txLinks
    ? `
      <details class="airdrop-proof-menu">
        <summary>Proof txs</summary>
        <div class="airdrop-tx-links">${txLinks}</div>
      </details>
    `
    : `<span class="airdrop-proof-pending">${isReady ? "Awaiting send" : "No proof yet"}</span>`;
  const tierRows = Array.isArray(completedAirdrop.tiers) && completedAirdrop.tiers.length
    ? `
      <div class="airdrop-tier-row">
        ${completedAirdrop.tiers
          .map((tier) => {
            const tierAmount = tier.amountLabel || `${formatTokenAmount(tier.amountPumpr || 0)} $PUMPR`;
            return `<span><b>${escapeHtml(tier.label || "")}</b>${escapeHtml(tierAmount)} x ${escapeHtml(String(tier.holderCount || 0))}</span>`;
          })
          .join("")}
      </div>
    `
    : "";
  return `
    <article class="panel-card airdrop-plan-card airdrop-completed-card">
      <div class="airdrop-plan-head">
        <div>
          <small>${escapeHtml(stateLabel)}</small>
          <h2>${escapeHtml(completedAirdrop.title || "PUMPR current 0.5%+ holder airdrop")} <span>${escapeHtml(completedDropTag(completedAirdrop))}</span></h2>
          <p>${escapeHtml(completedDropSummary(completedAirdrop))} ${escapeHtml(timeVerb)} ${escapeHtml(eventTime || executed)}.</p>
        </div>
        <div class="airdrop-plan-actions">
          ${completedDropHistoryControl()}
          ${source.primaryUrl ? `<a href="${escapeHtml(source.primaryUrl)}" target="_blank" rel="noopener noreferrer">Pump.fun</a>` : ""}
          ${proofControls}
        </div>
      </div>
      <div class="airdrop-kpi-grid">
        <span><b>${escapeHtml(total)} $PUMPR</b><small>${escapeHtml(totalLabel)}</small></span>
        <span><b>${escapeHtml(String(completedAirdrop.eligibleHolderCount || rows.length))}</b><small>Eligible holders</small></span>
        <span><b>${escapeHtml(amount)} $PUMPR</b><small>${escapeHtml(perHolderLabel)}</small></span>
      </div>
      ${tierRows}
      <div class="airdrop-source-note">
        <strong>${escapeHtml(source.primary || "Pump.fun holder list")}</strong>
        <span>${escapeHtml(source.crossCheck || "Cross-checked against live Solana holder accounts.")}</span>
      </div>
      <div class="airdrop-holder-table airdrop-completed-table">
        <div class="airdrop-table-head">
          <span>#</span>
          <span>Holder</span>
          <span>${escapeHtml(receivedLabel)}</span>
          <span>Share</span>
          <span>Holding since</span>
          <span>${escapeHtml(proofLabel)}</span>
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

function outreachAirdropsHtml() {
  const drops = Array.isArray(outreachDrops) ? outreachDrops : [];
  if (!drops.length) return "";
  return drops
    .map((drop) => {
      const rows = Array.isArray(drop.recipients) ? drop.recipients : [];
      if (!rows.length) return "";
      const executed = formatDateTime(drop.executedAt);
      const token = drop.sourceToken || {};
      const tokenSymbol = String(token.symbol || "TOKEN").toUpperCase();
      const total = formatTokenAmount(drop.totalAllocatedPumpr || 0);
      const receivedLabel = drop.amountRangeLabel || `${formatTokenAmount(drop.amountPerHolderPumpr || 0)} $PUMPR`;
      const txLinks = (drop.txSignatures || [])
        .map((signature, index) => `<a href="${solscanTxUrl(signature)}" target="_blank" rel="noopener noreferrer">Batch ${index + 1}</a>`)
        .join("");
      const excludedCount = Array.isArray(drop.excluded) ? drop.excluded.length : 0;
      return `
        <article class="panel-card airdrop-plan-card airdrop-outreach-card">
          <div class="airdrop-plan-head">
            <div>
              <small>Community outreach</small>
              <h2>${escapeHtml(drop.title || "Holder outreach")} <span>${escapeHtml(drop.badge || tokenSymbol)}</span></h2>
              <p>${escapeHtml(drop.source?.rule || "Small PUMPR outreach drop sent to an external holder list.")} Executed ${escapeHtml(executed)}.</p>
            </div>
            <div class="airdrop-plan-actions">
              ${drop.source?.primaryUrl ? `<a href="${escapeHtml(drop.source.primaryUrl)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(tokenSymbol)}</a>` : ""}
              <details class="airdrop-proof-menu">
                <summary>Proof txs</summary>
                <div class="airdrop-tx-links">${txLinks}</div>
              </details>
            </div>
          </div>
          <div class="airdrop-kpi-grid">
            <span><b>${escapeHtml(total)} $PUMPR</b><small>Total sent</small></span>
            <span><b>${escapeHtml(String(drop.eligibleHolderCount || rows.length))}</b><small>Wallets paid</small></span>
            <span><b>${escapeHtml(receivedLabel)}</b><small>${escapeHtml(drop.amountSummaryLabel || "Each wallet")}</small></span>
          </div>
          <div class="airdrop-source-note airdrop-outreach-note">
            <strong>${escapeHtml(drop.source?.primary || `${tokenSymbol} holder list`)}</strong>
            <span>${escapeHtml(drop.source?.crossCheck || "Finalized Solscan proof is attached.")}</span>
            ${excludedCount ? `<em>${escapeHtml(String(excludedCount))} off-curve addresses excluded</em>` : ""}
          </div>
          <div class="airdrop-holder-table airdrop-outreach-table">
            <div class="airdrop-table-head">
              <span>#</span>
              <span>Holder</span>
              <span>${escapeHtml(tokenSymbol)} held</span>
              <span>Share</span>
              <span>Received</span>
              <span>Proof</span>
            </div>
            ${rows
              .map((row, index) => {
                const tx = row.signature
                  ? `<a href="${solscanTxUrl(row.signature)}" target="_blank" rel="noopener noreferrer">Solscan</a>`
                  : `<span>${escapeHtml(completedStatusLabel(row.status))}</span>`;
                const pct = Number(row.ansemPct || 0).toFixed(Number(row.ansemPct || 0) >= 1 ? 2 : 3);
                return `
                  <div class="airdrop-table-row">
                    <span class="airdrop-rank">${escapeHtml(String(row.sourceRank || index + 1))}</span>
                    <span class="airdrop-holder-address">${escapeHtml(shortAddress(row.address))}</span>
                    <span>${escapeHtml(formatTokenAmount(row.ansemAmount || 0))} $${escapeHtml(tokenSymbol)}</span>
                    <span>${escapeHtml(pct)}%</span>
                    <strong>${escapeHtml(formatTokenAmount(row.amountPumpr || 0))} $PUMPR</strong>
                    <span>${tx}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
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
            const xHandle = KOL_X_HANDLES.get(row.wallet);
            const xLink = xHandle ? `https://x.com/${encodeURIComponent(xHandle)}` : "";
            return `
              <article class="airdrop-kol-tile" title="${escapeHtml(row.name || "KOL")} is holding $PUMPR">
                <div class="airdrop-kol-avatar-wrap">
                  <img src="${escapeHtml(row.image || "/assets/pump-r-logo.png")}" alt="${escapeHtml(row.name || "KOL")}" loading="lazy" />
                  <span class="airdrop-kol-live-dot" aria-hidden="true"></span>
                </div>
                <div class="airdrop-kol-meta">
                  <strong>${escapeHtml(row.name || "KOL")}</strong>
                  <span>Holding</span>
                  ${
                    xHandle
                      ? `<a class="airdrop-kol-social" href="${escapeHtml(xLink)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(xHandle)}</a>`
                      : ""
                  }
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

function bindAirdropHistoryControls() {
  const select = document.getElementById("airdropHistorySelect");
  if (!select) return;
  select.addEventListener("change", () => {
    const next = airdropHistory.find((drop) => String(drop.id || drop.executedAt || drop.title || "") === select.value);
    if (!next) return;
    completedAirdrop = next;
    if (lastPayload) renderPreview(lastPayload);
    else renderEmpty(
      "Live holder tracking is loading. The selected completed drop is shown above.",
      "Live holder tracking"
    );
    setCompletedStats();
  });
}

function renderEmpty(message = "The official Pumpfun Remastered mint is locked here. Only current live non-dev holders at or above 0.5% of supply qualify at snapshot.", title = "Current 0.5%+ holder tracking") {
  if (!ui.results) return;
  ui.results.innerHTML = `
    ${completedAirdropHtml()}
    ${outreachAirdropsHtml()}
    ${renderKolSeedHtml()}
    <article class="panel-card airdrop-empty-state">
      <span class="airdrop-empty-icon">0x</span>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
  bindAirdropHistoryControls();
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
    ${outreachAirdropsHtml()}
    ${renderKolSeedHtml()}
    <article class="panel-card airdrop-plan-card">
      <div class="airdrop-plan-head">
        <div>
          <small>Step 2</small>
          <h2>${escapeHtml(payload?.name || "Token")} <span>$${escapeHtml(symbol)}</span></h2>
          <p>${escapeHtml(payload?.longTermPolicy || "Current live non-dev holders with at least 0.5% of supply at snapshot are eligible for this airdrop.")}</p>
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
  bindAirdropHistoryControls();
}

async function previewAirdrop(options = {}) {
  const silent = Boolean(options.silent);
  if (!officialAirdrop?.configured) {
    renderEmpty(
      "The official Pumpfun Remastered mint is not configured yet. After launch, set AIRDROP_TOKEN_ADDRESS and AIRDROP_CHAIN_ID so this page can show current 0.5%+ holders.",
      "Official token not configured"
    );
    if (!silent) setAlert(ui.alert, "Official airdrop token is not configured yet.", true);
    return;
  }
  try {
    if (!silent) {
      ui.previewBtn.disabled = true;
      ui.previewBtn.textContent = "Reading holders...";
      ui.status.textContent = `Reading live ${officialAirdrop.chainShortName || officialAirdrop.chainName || ""} holders and updating 0.5%+ eligibility...`;
    }
    const payload = await api.airdropPreview({ limit: 30, fresh: true });
    renderPreview(payload);
    ui.status.textContent = silent ? "Holder list refreshed." : "Current 0.5%+ holder reward preview is ready.";
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
  if (ui.officialTop) ui.officialTop.textContent = configured ? `$${symbol} current 0.5%+ holder rewards` : "Official holder rewards";
  if (ui.officialName) ui.officialName.textContent = configured ? `${config?.name || "Pumpfun Remastered"} airdrop` : "Official Pumpfun Remastered token";
  if (ui.officialMeta) {
    ui.officialMeta.textContent = configured
      ? `${chain} - ${shortAddress(token)} - current live 0.5%+ holders qualify at snapshot`
      : "The official Pump.fun mint will be locked here after launch.";
  }
  if (ui.heroCopy) ui.heroCopy.textContent = config?.message || ui.heroCopy.textContent;
  if (ui.status) ui.status.textContent = configured ? "Official mint locked. Ready to track current 0.5%+ holders." : "Official airdrop token not configured yet.";
  if (ui.previewBtn) ui.previewBtn.disabled = !configured;
  if (!configured) {
    renderEmpty(
      "The official Pumpfun Remastered mint is locked here. Only current live non-dev holders at or above 0.5% of supply qualify at snapshot.",
      "Current 0.5%+ holder tracking"
    );
  }
}

async function loadCompletedAirdrop() {
  try {
    try {
      const outreachResponse = await fetch(OUTREACH_AIRDROP_URL, { cache: "no-store" });
      if (outreachResponse.ok) {
        const outreach = await outreachResponse.json();
        outreachDrops = Array.isArray(outreach?.drops) ? outreach.drops.filter((drop) => Array.isArray(drop?.recipients) && drop.recipients.length) : [];
      }
    } catch {
      outreachDrops = [];
    }
    const response = await fetch(AIRDROP_HISTORY_URL, { cache: "no-store" });
    if (response.ok) {
      const history = await response.json();
      airdropHistory = Array.isArray(history?.drops) ? history.drops.filter((drop) => Array.isArray(drop?.recipients) && drop.recipients.length) : [];
      const activeId = String(history?.activeDropId || "");
      completedAirdrop = airdropHistory.find((drop) => String(drop.id || "") === activeId) || airdropHistory[0] || null;
    }
    if (!completedAirdrop) {
      const fallback = await fetch(COMPLETED_AIRDROP_URL, { cache: "no-store" });
      if (!fallback.ok) return;
      completedAirdrop = await fallback.json();
      airdropHistory = [completedAirdrop];
    }
    setCompletedStats();
    renderEmpty(
      "Live holder tracking is loading. The selected Pump.fun-verified holder drop is shown above.",
      "Live holder tracking"
    );
  } catch {
    completedAirdrop = null;
  }
}

async function init() {
  const walletControls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    alertEl: ui.alert
  });
  await walletControls?.ready?.catch(() => null);

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
