const fs = require("fs");
const path = require("path");

const MINT = "C64Fr3nt6S9mmbehCS66Y1HYLnwBdMeUCdTimfmvpump";
const SYMBOL = "PUMPR";
const TOTAL_SUPPLY = 1_000_000_000;
const MIN_HOLDER_PCT = 0.5;
const DEFAULT_POOL = 1_000_000;
const TOP_HOLDERS_URL = `https://advanced-api-v2.pump.fun/coins/top-holders/${MINT}`;
const COIN_URL = `https://frontend-api-v3.pump.fun/coins/${MINT}`;

const outputDir = path.join(process.cwd(), "cache", "airdrops");

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatNumber(value, decimals = 6) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

function holdingHours(enteredAt, snapshotMs) {
  const entered = Number(enteredAt || 0);
  if (!entered) return 0;
  return Math.max(0, (snapshotMs / 1000 - entered) / 3600);
}

function previousRewardsByWallet(history) {
  const rewards = new Map();
  for (const drop of Array.isArray(history?.drops) ? history.drops : []) {
    for (const row of Array.isArray(drop?.recipients) ? drop.recipients : []) {
      const address = String(row?.address || "").trim();
      if (!address) continue;
      const previous = rewards.get(address) || { amountPumpr: 0, count: 0 };
      previous.amountPumpr += Number(row?.amountPumpr || 0) || 0;
      previous.count += 1;
      rewards.set(address, previous);
    }
  }
  return rewards;
}

function allocationFor(row, totalWeight, poolTokens) {
  if (!totalWeight || !poolTokens) return 0;
  return Math.floor((poolTokens * row.weightScore) / totalWeight);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PumpR-Live-Airdrop-List/1.0"
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function main() {
  const poolTokens = Math.max(0, Number(process.env.PUMPR_AIRDROP_POOL_TOKENS || DEFAULT_POOL) || DEFAULT_POOL);
  const snapshotAt = new Date();
  const snapshotMs = snapshotAt.getTime();
  const thresholdTokens = (TOTAL_SUPPLY * MIN_HOLDER_PCT) / 100;

  const [holdersPayload, coinPayload] = await Promise.all([fetchJson(TOP_HOLDERS_URL), fetchJson(COIN_URL).catch(() => ({}))]);
  const historyPath = path.join(process.cwd(), "frontend", "data", "pumpr-airdrops.json");
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, "utf8")) : {};
  const previousRewards = previousRewardsByWallet(history);
  const bondingCurve = String(coinPayload?.bonding_curve || "").trim();
  const associatedBondingCurve = String(coinPayload?.associated_bonding_curve || "").trim();
  const creator = String(coinPayload?.creator || "").trim();
  const poolAddress = String(coinPayload?.pool_address || "").trim();

  const excluded = [];
  const eligible = [];
  for (const [index, holder] of (holdersPayload?.topHolders || []).entries()) {
    const address = String(holder?.address || "").trim();
    const balancePumpr = Number(holder?.amount || 0);
    const holderPct = (balancePumpr / TOTAL_SUPPLY) * 100;
    const reasons = [];
    if (!address) reasons.push("missing address");
    if (address === bondingCurve) reasons.push("bonding curve");
    if (address === associatedBondingCurve) reasons.push("associated bonding curve");
    if (address === poolAddress) reasons.push("pool address");
    if (address === creator || holder?.isDev) reasons.push("dev wallet");
    if (holder?.isBundler) reasons.push("bundler flag");
    if (holderPct < MIN_HOLDER_PCT || balancePumpr < thresholdTokens) reasons.push("below 0.5%");

    const previous = previousRewards.get(address) || { amountPumpr: 0, count: 0 };
    const hours = holdingHours(holder?.enteredAt, snapshotMs);
    const days = hours / 24;
    const holdingMultiplier = hours >= 48 ? 1.4 : hours >= 24 ? 1.2 : hours >= 6 ? 1 : 0.75;
    const riskMultiplier = holder?.isSniper ? 0.5 : 1;
    const previousMultiplier = previous.amountPumpr >= 500_000 ? 0.65 : previous.amountPumpr >= 250_000 ? 0.8 : 1;
    const weightScore = holderPct * holdingMultiplier * riskMultiplier * previousMultiplier;
    const row = {
      rank: index + 1,
      address,
      balancePumpr,
      holderPct,
      enteredAt: Number(holder?.enteredAt || 0) || 0,
      holdingHours: hours,
      holdingDays: days,
      isDev: Boolean(holder?.isDev || address === creator),
      isSniper: Boolean(holder?.isSniper),
      isBundler: Boolean(holder?.isBundler),
      fundingSource: holder?.fundingSource || null,
      previousAirdropCount: previous.count,
      previousAirdropPumpr: previous.amountPumpr,
      holdingMultiplier,
      riskMultiplier,
      previousMultiplier,
      weightScore
    };
    if (reasons.length) excluded.push({ ...row, excludedReason: reasons.join(", ") });
    else eligible.push(row);
  }

  const totalWeight = eligible.reduce((sum, row) => sum + row.weightScore, 0);
  let allocated = 0;
  const recipients = eligible.map((row, index) => {
    const amountPumpr = allocationFor(row, totalWeight, poolTokens);
    allocated += amountPumpr;
    return {
      index: index + 1,
      ...row,
      amountPumpr
    };
  });
  if (recipients.length && allocated !== poolTokens) {
    recipients[0].amountPumpr += poolTokens - allocated;
  }

  const summary = {
    title: "PUMPR current live 0.5%+ holder airdrop list",
    mint: MINT,
    symbol: SYMBOL,
    snapshotAt: snapshotAt.toISOString(),
    source: {
      holdersApiUrl: TOP_HOLDERS_URL,
      coinApiUrl: COIN_URL,
      rule: "Current live non-dev holders with at least 0.5% PUMPR at snapshot. Bonding curve, associated bonding curve, pool address, dev wallet, bundler flags, and below-threshold wallets are excluded."
    },
    totalSupply: TOTAL_SUPPLY,
    thresholdPct: MIN_HOLDER_PCT,
    thresholdPumpr: thresholdTokens,
    airdropPoolPumpr: poolTokens,
    eligibleHolderCount: recipients.length,
    excludedCount: excluded.length,
    totalEligibleBalancePumpr: recipients.reduce((sum, row) => sum + row.balancePumpr, 0),
    totalAllocatedPumpr: recipients.reduce((sum, row) => sum + row.amountPumpr, 0),
    bondingCurve,
    associatedBondingCurve,
    poolAddress,
    creator,
    recipients,
    excluded
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = snapshotAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const base = `pumpr-live-0p5-airdrop-${stamp}`;
  const jsonPath = path.join(outputDir, `${base}.json`);
  const csvPath = path.join(outputDir, `${base}.csv`);
  const sendCsvPath = path.join(outputDir, `${base}-send.csv`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const csvRows = [
    ["index", "rank", "address", "amountPumpr", "balancePumpr", "holderPct", "holdingHours", "previousAirdropCount", "previousAirdropPumpr", "isSniper", "fundingSourceType", "fundingSourceName"],
    ...recipients.map((row) => [
      row.index,
      row.rank,
      row.address,
      row.amountPumpr,
      formatNumber(row.balancePumpr, 6),
      formatNumber(row.holderPct, 6),
      formatNumber(row.holdingHours, 3),
      row.previousAirdropCount,
      formatNumber(row.previousAirdropPumpr, 6),
      row.isSniper,
      row.fundingSource?.funderType || "",
      row.fundingSource?.funderName || ""
    ])
  ];
  fs.writeFileSync(csvPath, `${csvRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);

  const sendRows = [["address", "amountPumpr"], ...recipients.map((row) => [row.address, row.amountPumpr])];
  fs.writeFileSync(sendCsvPath, `${sendRows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`);

  console.log(JSON.stringify({
    snapshotAt: summary.snapshotAt,
    eligibleHolderCount: summary.eligibleHolderCount,
    excludedCount: summary.excludedCount,
    totalAllocatedPumpr: summary.totalAllocatedPumpr,
    thresholdPumpr: summary.thresholdPumpr,
    jsonPath,
    csvPath,
    sendCsvPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
