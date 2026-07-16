const state = { assets: [], protocols: [], protocolCategory: "All", sort: "marketCap", category: "All", query: "", page: 1, pageSize: 12, selected: null, points: [] };
const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function compact(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(Number(value || 0));
}
function price(value) {
  const n = Number(value || 0);
  if (n >= 1) return money.format(n);
  if (n >= .01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(4)}`;
}
function pct(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function classifyAsset(asset = {}) {
  const text = `${asset.id || ""} ${asset.name || ""} ${asset.symbol || ""}`.toLowerCase();
  const groups = {
    "Tokenized stocks": ["tesla", "nvidia", "apple", "amazon", "microsoft", "coinbase", "sp500", "s&p", "stock", "equity", "xstock"],
    "Real estate": ["real-estate", "realty", "property", "landshare", "parcl", "lofty", "estate"],
    "Private credit": ["heloc", "credit", "invoice", "centrifuge", "maple", "goldfinch", "clearpool"],
    Commodities: ["gold", "silver", "platinum", "commodity", "oil", "uranium", "paxg", "xaut"],
    Treasuries: ["treasury", "t-bill", "tbill", "buidl", "usyc", "usdy", "ousg", "ustb", "eutbl", "money-market", "benji"],
    "Stable assets": ["stablecoin", "stable", "usd0", "usual-usd", "mountain-protocol", "ondo-dollar"]
  };
  for (const [category, needles] of Object.entries(groups)) {
    if (needles.some((needle) => text.includes(needle))) return category;
  }
  return "Infrastructure";
}

function classifyProtocol(asset = {}) {
  const text = `${asset.slug || asset.id || ""} ${asset.name || ""}`.toLowerCase();
  if (["realt-tokens", "lofty", "estate-protocol", "realtyx", "landshare", "reental"].some((word) => text.includes(word))) return "Real estate";
  if (["gold", "silver", "paxos", "commodity"].some((word) => text.includes(word))) return "Commodities";
  if (["credit", "maple", "goldfinch", "centrifuge", "hastra", "reinsurance"].some((word) => text.includes(word))) return "Private credit";
  if (["stock", "equity", "global-markets"].some((word) => text.includes(word))) return "Tokenized stocks";
  if (["stable", "usdtb", "usd0", "usual"].some((word) => text.includes(word))) return "Stable assets";
  if (["treasury", "buidl", "usyc", "yield-assets", "spiko", "benji", "ustb", "wisdomtree", "anemoy"].some((word) => text.includes(word))) return "Treasuries";
  return "Other RWA";
}

function sparkline(values, positive) {
  const points = values.filter(Number.isFinite);
  if (points.length < 2) return "";
  const width = 105, height = 32, min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const path = points.map((v, i) => `${i ? "L" : "M"}${(i / (points.length - 1) * width).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`).join(" ");
  const color = positive ? "#9bea70" : "#ff6c6c";
  return `<svg class="rwa-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.7" vector-effect="non-scaling-stroke"/></svg>`;
}

function render() {
  const query = state.query.toLowerCase();
  const combined = [
    ...state.assets.map((asset) => ({ ...asset, kind: "market", value: asset.marketCap, secondary: asset.volume24h })),
    ...state.protocols.map((protocol) => ({ ...protocol, kind: "protocol", image: protocol.logo, symbol: "PROTOCOL", price: null, change24h: protocol.change1d, sparkline: [], value: protocol.tvl, secondary: protocol.apy }))
  ];
  const rows = combined.filter((asset) => {
    const matchesCategory = state.category === "All" || asset.category === state.category;
    const matchesQuery = !query || asset.name.toLowerCase().includes(query) || String(asset.symbol || "").toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });
  rows.sort((a, b) => {
    if (state.sort === "marketCap") return Number(b.value || 0) - Number(a.value || 0);
    if (state.sort === "volume24h") return Number(b.secondary || 0) - Number(a.secondary || 0);
    return Number(b.change24h || 0) - Number(a.change24h || 0);
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
  state.page = Math.min(state.page, pageCount);
  const start = (state.page - 1) * state.pageSize;
  const visibleRows = rows.slice(start, start + state.pageSize);
  $("rwaEmpty").hidden = rows.length > 0;
  $("rwaRows").innerHTML = visibleRows.map((asset, index) => `<tr data-id="${escapeHtml(asset.id)}" data-kind="${asset.kind}">
    <td><div class="rwa-asset"><span class="rwa-rank">${start + index + 1}</span><img src="${escapeHtml(asset.image)}" alt="" loading="lazy"><div><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.kind === "protocol" ? (asset.chains || []).slice(0, 2).join(" · ") || "RWA protocol" : asset.symbol)}</small></div></div></td>
    <td><span class="rwa-category-badge">${escapeHtml(asset.category || "Infrastructure")}</span><small class="rwa-row-source">${asset.kind === "protocol" ? "DeFiLlama" : "CoinGecko"}</small></td><td><strong>${asset.kind === "protocol" ? "—" : price(asset.price)}</strong></td>
    <td class="rwa-change ${asset.change24h >= 0 ? "rwa-up" : "rwa-down"}">${pct(asset.change24h)}</td>
    <td>${asset.kind === "protocol" ? '<span class="rwa-no-chart">TVL</span>' : sparkline(asset.sparkline, asset.change7d >= 0)}</td>
    <td><small class="rwa-value-label">${asset.kind === "protocol" ? "TVL" : "MARKET CAP"}</small>${compact(asset.value)}</td><td>${asset.kind === "protocol" ? (asset.apy == null ? "—" : `${Number(asset.apy).toFixed(2)}% APY`) : compact(asset.volume24h)}</td></tr>`).join("");
  $("rwaRows").querySelectorAll("tr[data-id]").forEach((row) => row.addEventListener("click", () => {
    if (row.dataset.kind === "market") return openChart(row.dataset.id);
    const protocol = state.protocols.find((item) => item.id === row.dataset.id);
    if (protocol?.url) window.open(protocol.url, "_blank", "noopener,noreferrer");
  }));
  $("rwaPagination").hidden = rows.length === 0;
  $("rwaPageInfo").textContent = rows.length ? `Showing ${start + 1}–${Math.min(start + state.pageSize, rows.length)} of ${rows.length} entries` : "Showing 0 entries";
  $("rwaPageNumber").textContent = `${state.page} / ${pageCount}`;
  $("rwaPagePrev").disabled = state.page <= 1;
  $("rwaPageNext").disabled = state.page >= pageCount;
}

function updateCategoryCounts() {
  const counts = [...state.assets, ...state.protocols].reduce((result, row) => {
    result[row.category] = (result[row.category] || 0) + 1;
    return result;
  }, {});
  $("rwaCategories").querySelectorAll("button[data-category]").forEach((button) => {
    const category = button.dataset.category;
    button.querySelector("span").textContent = String(category === "All" ? state.assets.length + state.protocols.length : counts[category] || 0);
  });
}

async function loadProtocols() {
  try {
    const response = await fetch("/api/rwa/protocols");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("backend-route-missing");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load protocols");
    state.protocols = payload.protocols || [];
    updateCategoryCounts();
    render();
  } catch (_backendError) {
    try {
      const response = await fetch("https://api.llama.fi/protocols");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      const all = (Array.isArray(rows) ? rows : []).filter((row) => String(row.category || "").toUpperCase() === "RWA" && Number(row.tvl || 0) > 0).map((row) => ({
        id: String(row.slug || ""), name: String(row.name || ""), category: classifyProtocol(row), tvl: Number(row.tvl || 0),
        change1d: Number(row.change_1d || 0), chains: Array.isArray(row.chains) ? row.chains.slice(0, 5) : [],
        url: String(row.url || ""), logo: String(row.logo || ""), apy: null, source: "DefiLlama"
      })).sort((a, b) => b.tvl - a.tvl);
      state.protocols = all.slice(0, 80);
      for (const row of all) if (["Real estate", "Stable assets"].includes(row.category) && !state.protocols.some((item) => item.id === row.id)) state.protocols.push(row);
      updateCategoryCounts();
      render();
    } catch (error) {
      console.warn("Unable to reach DeFiLlama", error);
    }
  }
}

async function loadMarkets(fresh = false) {
  $("rwaRefresh").disabled = true;
  try {
    const response = await fetch(`/api/rwa/markets?limit=100${fresh ? "&fresh=1" : ""}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load market");
    state.assets = (payload.assets || []).map((asset) => ({ ...asset, category: asset.category || classifyAsset(asset) }));
    updateCategoryCounts();
    $("rwaMarketCap").textContent = compact(payload.stats?.marketCap);
    $("rwaVolume").textContent = compact(payload.stats?.volume24h);
    $("rwaTracked").textContent = String(payload.stats?.tracked || 0);
    $("rwaGainers").textContent = `${payload.stats?.gainers || 0} / ${payload.stats?.tracked || 0}`;
    $("rwaUpdated").textContent = `Updated ${new Date(payload.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    render();
  } catch (error) {
    $("rwaRows").innerHTML = `<tr><td colspan="7"><div class="rwa-loading">${escapeHtml(error.message)}. Add COINGECKO_DEMO_API_KEY to .env if the public API is rate limited.</div></td></tr>`;
  } finally { $("rwaRefresh").disabled = false; }
}

function chartSize(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr)); canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  return { width: rect.width, height: rect.height, dpr };
}
function drawChart(points) {
  const canvas = $("rwaChartCanvas"), ctx = canvas.getContext("2d"), { width, height, dpr } = chartSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  if (points.length < 2) return;
  const pad = { x: 8, y: 20 }, values = points.map((p) => p[1]), min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  state.plot = points.map(([time, value], i) => ({ time, value, x: pad.x + i / (points.length - 1) * (width - pad.x * 2), y: pad.y + (1 - (value - min) / range) * (height - pad.y * 2) }));
  ctx.strokeStyle = "#252b24"; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) { const y = i * height / 5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, "rgba(155,234,112,.28)"); gradient.addColorStop(1, "rgba(155,234,112,0)");
  ctx.beginPath(); state.plot.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.lineTo(state.plot.at(-1).x, height); ctx.lineTo(state.plot[0].x, height); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); state.plot.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = "#9bea70"; ctx.lineWidth = 2; ctx.stroke();
}
async function loadChart(days) {
  $("rwaChartLoading").hidden = false;
  try { const response = await fetch(`/api/rwa/chart/${encodeURIComponent(state.selected.id)}?days=${days}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); state.points = data.prices || []; drawChart(state.points); }
  catch (error) { $("rwaChartLoading").textContent = error.message || "Chart unavailable"; return; }
  $("rwaChartLoading").hidden = true;
}
function openChart(id) {
  const asset = state.assets.find((item) => item.id === id); if (!asset) return; state.selected = asset;
  $("rwaChartImage").src = asset.image; $("rwaChartSymbol").textContent = asset.symbol; $("rwaChartTitle").textContent = asset.name; $("rwaChartPrice").textContent = price(asset.price); $("rwaChartChange").textContent = pct(asset.change24h); $("rwaChartChange").className = asset.change24h >= 0 ? "rwa-up" : "rwa-down";
  $("rwaChartModal").setAttribute("aria-hidden", "false"); loadChart(7);
}
function closeChart() { $("rwaChartModal").setAttribute("aria-hidden", "true"); state.selected = null; }

$("rwaSearch").addEventListener("input", (event) => { state.query = event.target.value.trim(); state.page = 1; render(); });
$("rwaTabs").addEventListener("click", (event) => { const button = event.target.closest("button[data-sort]"); if (!button) return; state.sort = button.dataset.sort; state.page = 1; $("rwaTabs").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button)); render(); });
$("rwaCategories").addEventListener("click", (event) => { const button = event.target.closest("button[data-category]"); if (!button) return; state.category = button.dataset.category; state.protocolCategory = state.category; state.page = 1; $("rwaCategories").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button)); render(); });
$("rwaPagePrev").addEventListener("click", () => { if (state.page > 1) { state.page -= 1; render(); document.querySelector(".rwa-board")?.scrollIntoView({ behavior: "smooth", block: "start" }); } });
$("rwaPageNext").addEventListener("click", () => { state.page += 1; render(); document.querySelector(".rwa-board")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
$("rwaRefresh").addEventListener("click", () => loadMarkets(true));
$("rwaChartClose").addEventListener("click", closeChart); $("rwaChartModal").addEventListener("click", (event) => { if (event.target === $("rwaChartModal")) closeChart(); });
$("rwaRange").addEventListener("click", (event) => { const button = event.target.closest("button[data-days]"); if (!button || !state.selected) return; $("rwaRange").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button)); loadChart(button.dataset.days); });
$("rwaChartCanvas").addEventListener("mousemove", (event) => { if (!state.plot?.length) return; const rect = event.target.getBoundingClientRect(), x = event.clientX - rect.left; const point = state.plot.reduce((best, item) => Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best); const tip = $("rwaTooltip"); tip.hidden = false; tip.innerHTML = `<strong>${price(point.value)}</strong><br>${new Date(point.time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric" })}`; tip.style.left = `${Math.min(rect.width - 100, Math.max(5, point.x + 10))}px`; tip.style.top = `${Math.max(5, point.y - 42)}px`; });
$("rwaChartCanvas").addEventListener("mouseleave", () => { $("rwaTooltip").hidden = true; });
window.addEventListener("resize", () => { if (state.points.length) drawChart(state.points); }); window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeChart(); });
loadMarkets();
loadProtocols();
