import { api } from "./api.js?v=20260710solbroadcast";
import { KOL_LEADERBOARD } from "./kolData.js?v=20260703ansem";
import {
  connectSolanaWallet,
  connectWallet,
  ensureWalletChain,
  ethers,
  FACTORY_ABI,
  makeFactoryContract,
  makePoolContract,
  makeFallbackImage,
  parseUiError,
  sendTxWithFallback,
  shortAddress,
  walletState
} from "./core.js?v=20260709previewtheme";

const ASSISTANT_HISTORY_KEY = "pumpr.assistant.history.v2";
const ASSISTANT_STATE_KEY = "pumpr.assistant.state.v1";
const ASSISTANT_PENDING_KEY = "pumpr.assistant.pending.v2";
const ASSISTANT_UPLOAD_KEY = "pumpr.assistant.upload.v2";
const ASSISTANT_LAUNCH_DRAFT_KEY = "pumpr.assistant.launchdraft.v2";
const WALLET_SESSION_KEY = "etherpump.wallet.session.v1";
const MAX_HISTORY = 18;
const DEFAULT_ASSISTANT_TOKEN_SUPPLY = 1_000_000_000;
const DEFAULT_ASSISTANT_TOKEN_TAX_PCT = 0.5;
const DEFAULT_ASSISTANT_PUMPFUN_SUPPLY = 1_000_000_000;
const PUMPFUN_ESTIMATE_VIRTUAL_SOL = 30;
const ASSISTANT_PUMPFUN_MAX_LAUNCH_ATTEMPTS = 1;
const ASSISTANT_HOME_LAUNCH_CACHE_KEY = "etherpump.launches.cache.v3";
const ASSISTANT_HOME_LAUNCH_CACHE_MAX_ITEMS = 120;
const ASSISTANT_MODEL_CANDIDATES = [
  { url: "/assets/assistant/rose.glb", type: "gltf" },
  { url: "/assets/assistant/rose.vrm", type: "gltf" },
  { url: "/assets/assistant/rose.vrm", type: "vrm" }
];
const ASSISTANT_THUMB_URL = "/assets/assistant/rose-thumb.png";
const ASSISTANT_PUBLIC_HOSTED_FALLBACK_IMAGE = "https://pump-r.fun/assets/pump-r-logo.png?v=20260609brand";

let assistantBooted = false;
let assistantDom = null;
let assistantState = {
  open: true,
  muted: false,
  listening: false,
  speaking: false,
  mood: "idle",
  x: null,
  y: null
};
let assistantHistory = [];
let assistantScene = null;
let recognition = null;
let recognitionActive = false;
let messageBusy = false;
let assistantUpload = null;
let assistantLaunchDraft = null;
let assistantVoice = null;
let assistantLayoutClampQueued = false;
let companionMotionState = null;
let companionReactionTimer = null;
let companionGestureTimer = null;
let companionGestureState = {
  kind: "idle",
  intensity: 0,
  until: 0
};

function safeParse(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function readSessionJson(key, fallback) {
  try {
    return safeParse(sessionStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore transient storage failures
  }
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore transient storage failures
  }
}

function clearAssistantTransientStorage() {
  const keys = [
    ASSISTANT_HISTORY_KEY,
    ASSISTANT_PENDING_KEY,
    ASSISTANT_UPLOAD_KEY,
    ASSISTANT_LAUNCH_DRAFT_KEY
  ];
  keys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore transient storage cleanup errors
    }
    removeSessionValue(key);
  });
}

function readStoredState() {
  const parsed = safeParse(localStorage.getItem(ASSISTANT_STATE_KEY), {});
  assistantState = {
    ...assistantState,
    ...parsed
  };
}

function persistState() {
  localStorage.setItem(ASSISTANT_STATE_KEY, JSON.stringify(assistantState));
}

function readHistory() {
  clearAssistantTransientStorage();
  assistantHistory = [];
}

function readAssistantUpload() {
  assistantUpload = null;
}

function persistAssistantUpload() {
  return;
}

function persistHistory() {
  return;
}

function readLaunchDraft() {
  assistantLaunchDraft = null;
}

function persistLaunchDraft() {
  return;
}

function addHistory(role, text) {
  const entry = {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    text: String(text || "").trim(),
    ts: Date.now()
  };
  assistantHistory.push(entry);
  assistantHistory = assistantHistory.slice(-MAX_HISTORY);
  persistHistory();
  renderHistory();
  return entry;
}

function readWalletSession() {
  const parsed = safeParse(localStorage.getItem(WALLET_SESSION_KEY), {});
  return {
    connected: Boolean(parsed?.connected),
    address: String(parsed?.address || "").trim(),
    choice: String(parsed?.choice || "").trim(),
    username: String(parsed?.username || "").trim()
  };
}

function currentPageName() {
  const path = String(location.pathname || "/").toLowerCase();
  if (path === "/" || path === "/home") return "home";
  if (path.startsWith("/create")) return "create";
  if (path.startsWith("/rh-swap") || path.startsWith("/swap") || path.startsWith("/robinhood-swap")) return "rh-swap";
  if (path.startsWith("/social")) return "social";
  if (path.startsWith("/profile")) return "profile";
  if (path.startsWith("/alpha")) return "alpha";
  if (path.startsWith("/go")) return "go";
  return path.replace(/^\//, "") || "home";
}

function collectPageContext() {
  const page = currentPageName();
  const context = { page };
  if (page === "create") {
    context.createDraft = {
      name: document.getElementById("name")?.value || "",
      symbol: document.getElementById("symbol")?.value || "",
      description: document.getElementById("description")?.value || "",
      website: document.getElementById("website")?.value || "",
      twitter: document.getElementById("twitter")?.value || "",
      telegram: document.getElementById("telegram")?.value || "",
      supply: document.getElementById("supply")?.value || "",
      directMode: document.getElementById("launchStyleDirectBtn")?.classList.contains("active") || false
    };
  } else if (page === "rh-swap") {
    context.swapDraft = {
      amount: document.getElementById("rhswapAmount")?.value || "",
      targetToken: document.getElementById("rhswapTargetToken")?.value || ""
    };
  } else if (page === "social") {
    context.socialDraft = {
      body: document.getElementById("socialPostBody")?.value || "",
      token: document.getElementById("socialPostToken")?.value || "",
      chain: document.getElementById("socialPostChain")?.value || ""
    };
  }
  if (assistantUpload?.url) {
    context.assistantAttachment = {
      name: assistantUpload.name || "",
      imageUrl: assistantUpload.url,
      type: assistantUpload.type || "image"
    };
  }
  if (assistantLaunchDraft?.type === "launch") {
    context.assistantLaunchDraft = assistantLaunchDraft;
  }
  return context;
}

function renderAssistantUpload() {
  if (!assistantDom?.uploadStatus || !assistantDom?.uploadRemove) return;
  if (assistantUpload?.url) {
    assistantDom.uploadStatus.hidden = false;
    assistantDom.uploadStatus.textContent = assistantUpload.name
      ? `Image ready: ${assistantUpload.name}`
      : "Image ready for launch";
    assistantDom.uploadStatus.title = assistantUpload.url;
    assistantDom.uploadRemove.hidden = false;
  } else {
    assistantDom.uploadStatus.hidden = true;
    assistantDom.uploadStatus.textContent = "";
    assistantDom.uploadStatus.removeAttribute("title");
    assistantDom.uploadRemove.hidden = true;
  }
}

function chainLabelForDraft(draft = {}) {
  if (draft?.chainLabel) return String(draft.chainLabel);
  if (draft?.launchMode === "pumpfun") return "Pump.fun";
  const chainId = Number(draft?.chainId || 0);
  if (chainId === 4663) return "Robinhood Chain";
  if (chainId === 8453) return "Base";
  if (chainId === 143) return "Monad";
  if (chainId === 1) return "Ethereum";
  return "Launch";
}

function clearLaunchDraft() {
  assistantLaunchDraft = null;
  persistLaunchDraft();
  renderLaunchDraft();
}

function applyAssistantImageToLaunchDraft(imageUrl) {
  if (assistantLaunchDraft?.type !== "launch") return;
  const nextImage = String(imageUrl || "").trim();
  if (!nextImage) return;
  const nextMissing = (Array.isArray(assistantLaunchDraft.missingFields) ? assistantLaunchDraft.missingFields : []).filter((field) => field !== "image");
  assistantLaunchDraft = {
    ...assistantLaunchDraft,
    image: nextImage,
    missingFields: nextMissing,
    complete: nextMissing.length === 0
  };
  persistLaunchDraft();
  renderLaunchDraft();
}

function removeAssistantImageFromLaunchDraft() {
  if (assistantLaunchDraft?.type !== "launch") return;
  assistantLaunchDraft = {
    ...assistantLaunchDraft,
    image: "",
    missingFields: Array.from(new Set([...(Array.isArray(assistantLaunchDraft.missingFields) ? assistantLaunchDraft.missingFields : []), "image"])),
    complete: false
  };
  persistLaunchDraft();
  renderLaunchDraft();
}

function syncLaunchDraftWithAttachment() {
  if (assistantUpload?.url) {
    applyAssistantImageToLaunchDraft(assistantUpload.url);
  }
}

function clearAssistantLaunchComposer() {
  clearLaunchDraft();
  clearAssistantUpload();
}

function assistantNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assistantFormatTokenAmount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4
  }).format(n);
}

function safeAssistantKolRows() {
  return Array.isArray(KOL_LEADERBOARD)
    ? KOL_LEADERBOARD.filter((row) => row?.name && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(row.wallet || "")))
    : [];
}

function assistantSelectedKol(draft = {}, mergedText = "") {
  const rows = safeAssistantKolRows();
  const walletHint = String(draft?.kolApplication?.wallet || "").trim();
  const matchedWallet = rows.find((row) => row.wallet === walletHint);
  if (matchedWallet) return matchedWallet;
  const lower = String(mergedText || "").toLowerCase();
  return rows.find((row) => {
    const name = String(row.name || "").trim().toLowerCase();
    return name && (lower.includes(` ${name} `) || lower.startsWith(`${name} `) || lower.endsWith(` ${name}`) || lower === name);
  }) || null;
}

function assistantEstimateKolBuy(solAmountInput = 0, totalSupplyInput = DEFAULT_ASSISTANT_PUMPFUN_SUPPLY) {
  const solAmount = Math.max(0, Number(solAmountInput || 0));
  const totalSupply = Math.max(1, Number(totalSupplyInput || DEFAULT_ASSISTANT_PUMPFUN_SUPPLY) || DEFAULT_ASSISTANT_PUMPFUN_SUPPLY);
  const estimatedTokens = solAmount > 0
    ? (solAmount / (PUMPFUN_ESTIMATE_VIRTUAL_SOL + solAmount)) * totalSupply
    : 0;
  const estimatedSupplyPct = totalSupply > 0 ? (estimatedTokens / totalSupply) * 100 : 0;
  return { estimatedTokens, estimatedSupplyPct };
}

function assistantNormalizeKolApplication(draft = {}) {
  const raw = draft?.kolApplication;
  if (!raw || typeof raw !== "object" || !raw.enabled) return null;
  const wallet = String(raw.wallet || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return null;
  const buySol = Math.max(0, assistantNumber(raw.buySol, 0));
  const estimatedTokens = Math.max(0, assistantNumber(raw.estimatedTokens, 0));
  const estimatedSupplyPct = Math.max(0, assistantNumber(raw.estimatedSupplyPct, 0));
  return {
    enabled: true,
    name: String(raw.name || "Selected wallet").trim().slice(0, 80),
    wallet,
    image: String(raw.image || "").trim().slice(0, 2048),
    buySol,
    estimatedTokens,
    estimatedSupplyPct
  };
}

function assistantRecomputeLaunchDraft(draft = {}) {
  const nextDraft = {
    ...draft,
    totalSupply: Math.max(1, assistantNumber(draft.totalSupply, DEFAULT_ASSISTANT_PUMPFUN_SUPPLY)),
    starterBuyEth: assistantNumber(draft.starterBuyEth, 0),
    pumpfunDevBuySol: assistantNumber(draft.pumpfunDevBuySol, 0)
  };
  const kolApplication = assistantNormalizeKolApplication(nextDraft);
  if (kolApplication?.enabled) {
    const estimate = assistantEstimateKolBuy(kolApplication.buySol, nextDraft.totalSupply);
    nextDraft.kolApplication = {
      ...kolApplication,
      estimatedTokens: estimate.estimatedTokens,
      estimatedSupplyPct: estimate.estimatedSupplyPct
    };
  } else {
    nextDraft.kolApplication = null;
  }

  const missing = [];
  if (!String(nextDraft.launchMode || "").trim()) missing.push("chain");
  if (!String(nextDraft.name || "").trim()) missing.push("coin name");
  if (!String(nextDraft.symbol || "").trim()) missing.push("ticker");
  if (nextDraft.launchMode === "pumpfun" && !String(nextDraft.image || "").trim()) missing.push("image");
  if (nextDraft.launchMode === "chain" && String(nextDraft.launchStyle || "").trim() === "direct" && !(nextDraft.starterBuyEth > 0)) {
    missing.push("direct launch liquidity");
  }
  if (nextDraft.launchMode === "pumpfun" && nextDraft.kolApplication?.enabled) {
    if (!String(nextDraft.kolApplication.wallet || "").trim()) missing.push("KOL wallet");
    if (!(Number(nextDraft.kolApplication.buySol || 0) > 0)) missing.push("KOL buy amount");
  }
  nextDraft.missingFields = missing;
  nextDraft.complete = missing.length === 0;
  return nextDraft;
}

function assistantSaveLaunchDraft(nextDraft = null) {
  assistantLaunchDraft = nextDraft && typeof nextDraft === "object"
    ? assistantRecomputeLaunchDraft(nextDraft)
    : null;
  persistLaunchDraft();
  renderLaunchDraft();
}

async function ensureAssistantHostedImage(imageValue = "", { requireHosted = false } = {}) {
  const raw = String(imageValue || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("data:image/")) return raw;
  if (!requireHosted && /^data:image\/svg\+xml/i.test(raw)) {
    return `${window.location.origin}/assets/pump-r-logo.png`;
  }
  const response = await postJson("/api/upload-image", { dataUrl: raw, requireHosted: Boolean(requireHosted) });
  const payload = response?.json || {};
  if (!response?.ok || !payload?.url) {
    const errorText = String(payload?.error || "Could not upload launch image.");
    const isLocalPumpfunFallback =
      requireHosted &&
      /^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(String(window.location.origin || "")) &&
      /public hosted image url|hosted image storage|localhost/i.test(errorText);
    if (isLocalPumpfunFallback) {
      setStatus("Local Pump.fun image upload cannot be public from localhost yet, so I am using the hosted Pump-r fallback image for this launch.", "thinking");
      return ASSISTANT_PUBLIC_HOSTED_FALLBACK_IMAGE;
    }
    if (!requireHosted) {
      return `${window.location.origin}/assets/pump-r-logo.png`;
    }
    throw new Error(errorText);
  }
  return String(payload.url || "").trim();
}

async function assistantLoadSolanaWeb3() {
  if (window.solanaWeb3?.Transaction && window.solanaWeb3?.Connection) return window.solanaWeb3;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-solana-web3="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/vendor/solana-web3.iife.min.js";
    script.async = true;
    script.dataset.solanaWeb3 = "true";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Solana web3 library"));
    document.head.appendChild(script);
  });
  if (!window.solanaWeb3?.Transaction) {
    throw new Error("Solana web3 library did not initialize");
  }
  return window.solanaWeb3;
}

function assistantBase64ToBytes(value = "") {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function assistantBytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function assistantDeserializeSolanaTransaction(solanaWeb3, transactionBase64, isVersioned = false) {
  const bytes = assistantBase64ToBytes(transactionBase64);
  if (isVersioned && solanaWeb3.VersionedTransaction) {
    return solanaWeb3.VersionedTransaction.deserialize(bytes);
  }
  try {
    return solanaWeb3.Transaction.from(bytes);
  } catch (legacyError) {
    if (solanaWeb3.VersionedTransaction) {
      try {
        return solanaWeb3.VersionedTransaction.deserialize(bytes);
      } catch {
        // preserve original error
      }
    }
    throw legacyError;
  }
}

function assistantSerializeSignedSolanaTransaction(transaction) {
  try {
    return assistantBytesToBase64(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
  } catch {
    return assistantBytesToBase64(transaction.serialize());
  }
}

function assistantIsSolanaBlockhashExpiredError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("block height exceeded") ||
    message.includes("blockhash not found") ||
    (message.includes("signature") && message.includes("expired"));
}

function assistantNormalizeSolanaSignature(result) {
  if (typeof result === "string") return result;
  if (typeof result?.signature === "string") return result.signature;
  if (typeof result?.txid === "string") return result.txid;
  return "";
}

function normalizeAssistantPumpFunHomeLaunch(row = {}) {
  const mint = String(row.mint || row.token || row.tokenAddress || "").trim();
  if (!mint) return null;
  const symbol = String(row.symbol || "").trim().replace(/^\$/, "").toUpperCase().slice(0, 13);
  return {
    id: String(row.id || mint),
    chainId: "pumpfun",
    source: "pumpfun",
    token: mint,
    tokenAddress: mint,
    mint,
    name: String(row.name || symbol || "Pump.fun token").trim().slice(0, 80),
    symbol: symbol || mint.slice(0, 6).toUpperCase(),
    description: String(row.description || "").trim().slice(0, 4000),
    imageUri: String(row.imageUri || row.image || "").trim().slice(0, 2048),
    creator: String(row.creator || row.user || "").trim(),
    pumpfunUrl: String(row.pumpfunUrl || row.url || `https://pump.fun/coin/${encodeURIComponent(mint)}`).trim(),
    signature: String(row.signature || "").trim(),
    metadataUri: String(row.metadataUri || "").trim(),
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function cacheAssistantPumpFunLaunchForHome(row = {}) {
  const normalized = normalizeAssistantPumpFunHomeLaunch(row);
  if (!normalized) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSISTANT_HOME_LAUNCH_CACHE_KEY) || "{}");
    const existing = Array.isArray(parsed?.launches) ? parsed.launches : [];
    const mintKey = normalized.mint.toLowerCase();
    const launches = [
      normalized,
      ...existing.filter((item) => String(item?.mint || item?.token || "").toLowerCase() !== mintKey)
    ]
      .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
      .slice(0, ASSISTANT_HOME_LAUNCH_CACHE_MAX_ITEMS);
    localStorage.setItem(
      ASSISTANT_HOME_LAUNCH_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        launches
      })
    );
  } catch {
    // best effort only
  }
}

function syncAssistantPumpFunLaunchRecord(row = {}) {
  const normalized = normalizeAssistantPumpFunHomeLaunch(row);
  if (!normalized || typeof api.pumpfunRecordLaunch !== "function") return;
  api.pumpfunRecordLaunch(normalized).catch(() => {
    // best effort only
  });
}

function assistantExtractLaunchCreated(receipt) {
  const iface = new ethers.Interface(FACTORY_ABI);
  for (const log of receipt?.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "LaunchCreated") {
        return {
          token: parsed.args.token,
          pool: parsed.args.pool,
          launchId: parsed.args.launchId
        };
      }
    } catch {
      // skip unrelated logs
    }
  }
  return null;
}

function renderLaunchDraft() {
  if (!assistantDom?.launchDraft) return;
  if (!assistantLaunchDraft || assistantLaunchDraft.type !== "launch") {
    assistantDom.launchDraft.hidden = true;
    assistantDom.launchDraft.innerHTML = "";
    scheduleAssistantLayoutClamp();
    return;
  }

  const draft = assistantLaunchDraft;
  const missing = Array.isArray(draft.missingFields) ? draft.missingFields.filter(Boolean) : [];
  const complete = Boolean(draft.complete);
  const chain = chainLabelForDraft(draft);
  const title = draft.name || "Untitled launch";
  const symbol = draft.symbol ? `$${draft.symbol}` : "Ticker pending";
  const style = draft.launchStyle === "direct" ? "Direct Uniswap" : draft.launchStyle === "bonding" ? "Bonding curve" : "Style pending";
  const imageLine = draft.image ? "Image ready" : draft.launchMode === "pumpfun" ? "Pump.fun image needed" : "Image optional";
  const pumpfunDevBuy = assistantNumber(draft.pumpfunDevBuySol, 0);
  const kolApplication = assistantNormalizeKolApplication(draft);
  const optionBadges = [];
  if (draft.launchMode === "pumpfun" && pumpfunDevBuy > 0) {
    optionBadges.push(`Dev buy ${pumpfunDevBuy} SOL`);
  }
  if (kolApplication?.enabled) {
    optionBadges.push(`Manlet Mode ${kolApplication.name}`);
    if (kolApplication.buySol > 0) optionBadges.push(`${kolApplication.buySol} SOL to KOL`);
  }
  if (draft.launchMode === "chain" && assistantNumber(draft.starterBuyEth, 0) > 0) {
    optionBadges.push(`Starter buy ${assistantNumber(draft.starterBuyEth, 0)} ${draft.chainId === 143 ? "MON" : "ETH"}`);
  }
  const missingHtml = missing.length
    ? `<div class="pumpr-assistant-draft-missing">Still needed: ${escapeHtml(missing.join(", "))}</div>`
    : `<div class="pumpr-assistant-draft-good">Ready to launch</div>`;
  const optionsHtml = optionBadges.length
    ? `<div class="pumpr-assistant-draft-grid pumpr-assistant-draft-grid-secondary">${optionBadges.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  const pumpfunLaunchHintHtml = draft.launchMode === "pumpfun"
    ? `<div class="pumpr-assistant-draft-hint">Set your Dev buy and optional Manlet Mode below before you fire the launch. Leave them at 0 and No KOL send if you want a clean launch.</div>`
    : "";
  const kolSummaryHtml = kolApplication?.enabled
    ? `<div class="pumpr-assistant-draft-kol">
         <strong>Manlet Mode</strong>
         <span>${escapeHtml(kolApplication.name)} · ${escapeHtml(shortAddress(kolApplication.wallet))} · ${assistantFormatTokenAmount(kolApplication.estimatedTokens)} est. tokens (${Number(kolApplication.estimatedSupplyPct || 0).toFixed(4)}%)</span>
       </div>`
    : "";

  const pumpfunControlsHtml = draft.launchMode === "pumpfun"
    ? `
      <div class="pumpr-assistant-draft-form">
        <label class="pumpr-assistant-draft-field">
          <span>Dev buy (SOL)</span>
          <input class="pumpr-assistant-draft-input" data-launch-draft-field="pumpfunDevBuySol" type="number" min="0" step="0.001" value="${escapeHtml(String(pumpfunDevBuy || 0))}" placeholder="0.05" />
        </label>
        <label class="pumpr-assistant-draft-field">
          <span>Manlet Mode</span>
          <select class="pumpr-assistant-draft-input" data-launch-draft-field="kolWallet">
            <option value="">No KOL send</option>
            ${safeAssistantKolRows().map((row) => `
              <option value="${escapeHtml(String(row.wallet || ""))}" ${String(kolApplication?.wallet || "") === String(row.wallet || "") ? "selected" : ""}>
                ${escapeHtml(String(row.name || ""))}
              </option>
            `).join("")}
          </select>
        </label>
        <label class="pumpr-assistant-draft-field">
          <span>KOL buy (SOL)</span>
          <input class="pumpr-assistant-draft-input" data-launch-draft-field="kolBuySol" type="number" min="0" step="0.001" value="${escapeHtml(String(kolApplication?.buySol || 0))}" placeholder="0.05" ${kolApplication?.enabled ? "" : "disabled"} />
        </label>
      </div>
    `
    : "";

  assistantDom.launchDraft.hidden = false;
  assistantDom.launchDraft.innerHTML = `
    <div class="pumpr-assistant-draft-card ${complete ? "is-ready" : "is-missing"}">
      <div class="pumpr-assistant-draft-top">
        <div>
          <small>${escapeHtml(chain)}</small>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <span>${escapeHtml(symbol)}</span>
      </div>
      <div class="pumpr-assistant-draft-grid">
        <span>${escapeHtml(style)}</span>
        <span>${escapeHtml(imageLine)}</span>
      </div>
      ${optionsHtml}
      ${pumpfunLaunchHintHtml}
      ${pumpfunControlsHtml}
      ${kolSummaryHtml}
      ${missingHtml}
      <div class="pumpr-assistant-draft-actions">
        <button class="pumpr-assistant-draft-btn" data-launch-draft-action="launch" type="button" ${complete ? "" : "disabled"}>Launch now</button>
        <button class="pumpr-assistant-draft-btn is-ghost" data-launch-draft-action="clear" type="button">Clear</button>
      </div>
    </div>
  `;

  assistantDom.launchDraft
    .querySelector('[data-launch-draft-action="launch"]')
    ?.addEventListener("click", async () => {
      const liveDraft = assistantLaunchDraft && assistantLaunchDraft.type === "launch" ? assistantLaunchDraft : draft;
      const isPumpFunDraft = String(liveDraft?.launchMode || "") === "pumpfun";
      const devBuyValue = Math.max(0, assistantNumber(liveDraft?.pumpfunDevBuySol, 0));
      const liveKol = assistantNormalizeKolApplication(liveDraft);
      const hasKolSend = Boolean(liveKol?.enabled && String(liveKol.wallet || "").trim());
      if (isPumpFunDraft && !liveDraft?.optionsReviewed && devBuyValue <= 0 && !hasKolSend) {
        const reviewedDraft = { ...liveDraft, optionsReviewed: true };
        assistantSaveLaunchDraft(reviewedDraft);
        addHistory(
          "assistant",
          "Before I fire this Pump.fun launch, you can set Dev buy and Manlet Mode right in the draft card. Leave them at 0 and No KOL send if you want a clean launch, then hit Launch now again."
        );
        setStatus("Launch options are ready below. Tap Launch now again when you are happy with them.", "thinking");
        return;
      }
      try {
        await launchAssistantDraft(liveDraft);
      } catch {
        // launchAssistantDraft already surfaced the user-facing error
      }
    });
  assistantDom.launchDraft
    .querySelectorAll("[data-launch-draft-field]")
    ?.forEach((field) => {
      field.addEventListener("change", (event) => {
        if (!assistantLaunchDraft || assistantLaunchDraft.type !== "launch") return;
        const target = event.currentTarget;
        const key = String(target?.dataset?.launchDraftField || "").trim();
        const nextDraft = { ...assistantLaunchDraft };
        if (key === "pumpfunDevBuySol") {
          nextDraft.pumpfunDevBuySol = Math.max(0, assistantNumber(target.value, 0));
          nextDraft.optionsReviewed = true;
        } else if (key === "kolWallet") {
          const wallet = String(target.value || "").trim();
          const row = safeAssistantKolRows().find((item) => String(item.wallet || "") === wallet) || null;
          nextDraft.kolApplication = row
            ? {
                enabled: true,
                name: String(row.name || "Selected wallet").trim(),
                wallet: String(row.wallet || "").trim(),
                image: String(row.image || "").trim(),
                buySol: Math.max(0, assistantNumber(nextDraft?.kolApplication?.buySol, 0.05))
              }
            : null;
          nextDraft.optionsReviewed = true;
        } else if (key === "kolBuySol") {
          const existing = assistantNormalizeKolApplication(nextDraft);
          if (existing) {
            nextDraft.kolApplication = {
              ...existing,
              buySol: Math.max(0, assistantNumber(target.value, 0))
            };
          }
          nextDraft.optionsReviewed = true;
        }
        assistantSaveLaunchDraft(nextDraft);
      });
    });
  assistantDom.launchDraft
    .querySelector('[data-launch-draft-action="clear"]')
    ?.addEventListener("click", () => {
      clearLaunchDraft();
      setStatus("Launch draft cleared.", "idle");
    });
  scheduleAssistantLayoutClamp();
}

function clearAssistantUpload() {
  const removedUrl = assistantUpload?.url ? String(assistantUpload.url) : "";
  assistantUpload = null;
  persistAssistantUpload();
  if (
    assistantLaunchDraft?.type === "launch" &&
    removedUrl &&
    String(assistantLaunchDraft.image || "") === removedUrl
  ) {
    removeAssistantImageFromLaunchDraft();
  }
  if (assistantDom?.uploadInput) assistantDom.uploadInput.value = "";
  renderAssistantUpload();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

async function uploadAssistantImage(file) {
  if (!file) return;
  if (!/^image\//i.test(String(file.type || ""))) throw new Error("Choose an image file.");
  if (Number(file.size || 0) > 900 * 1024) throw new Error("Keep the image under 900 KB.");
  setStatus("Uploading your launch image...", "thinking");
  const previousUpload = assistantUpload ? { ...assistantUpload } : null;
  const previousDraft = assistantLaunchDraft ? JSON.parse(JSON.stringify(assistantLaunchDraft)) : null;
  const dataUrl = await readFileAsDataUrl(file);
  assistantUpload = {
    name: String(file.name || "launch-image").trim().slice(0, 120),
    url: dataUrl,
    type: "image"
  };
  persistAssistantUpload();
  renderAssistantUpload();
  applyAssistantImageToLaunchDraft(dataUrl);
  const response = await postJson("/api/upload-image", { dataUrl, requireHosted: true });
  const payload = response?.json || {};
  if (!response?.ok || !payload?.url) {
    const errorText = String(payload?.error || "Could not upload image.");
    const isLocalDraftOnly =
      /^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(String(window.location.origin || "")) &&
      /public hosted image url|hosted image storage/i.test(errorText);
    if (!isLocalDraftOnly) {
      assistantUpload = previousUpload;
      persistAssistantUpload();
      if (previousDraft) {
        assistantLaunchDraft = previousDraft;
        persistLaunchDraft();
        renderLaunchDraft();
      } else if (assistantLaunchDraft?.type === "launch") {
        removeAssistantImageFromLaunchDraft();
      }
      renderAssistantUpload();
      throw new Error(errorText);
    }
    setStatus("Image attached to the draft. For a real Pump.fun launch, hosted storage still needs to work on the live domain.", "thinking");
    return;
  }
  assistantUpload = {
    name: String(file.name || "launch-image").trim().slice(0, 120),
    url: String(payload.url || "").trim().slice(0, 2048),
    type: "image"
  };
  persistAssistantUpload();
  renderAssistantUpload();
  applyAssistantImageToLaunchDraft(assistantUpload.url);
  setStatus("Image attached. Now tell me the name, ticker, and chain.", "happy");
}

function setStatus(text, tone = "idle") {
  if (!assistantDom) return;
  const nextTone = tone && tone !== "idle" ? tone : inferMoodFromText(text, tone || "idle");
  assistantDom.status.textContent = text || "";
  assistantDom.root.dataset.mood = nextTone || "idle";
  assistantState.mood = nextTone || "idle";
  persistState();
  if (assistantScene?.setMood) assistantScene.setMood(assistantState.mood, assistantState.speaking);
  setCompanionReaction(text || "Ready.", nextTone || "idle", 2200);
  scheduleAssistantLayoutClamp();
}

function setSpeaking(isSpeaking) {
  assistantState.speaking = Boolean(isSpeaking);
  assistantDom?.root.classList.toggle("is-speaking", assistantState.speaking);
  if (assistantScene?.setMood) assistantScene.setMood(assistantState.mood, assistantState.speaking);
}

function renderHistory() {
  if (!assistantDom) return;
  assistantDom.log.innerHTML = assistantHistory
    .map((entry) => {
      const roleLabel = entry.role === "assistant" ? "Airi" : "You";
      return `
        <article class="pumpr-assistant-msg ${entry.role}">
          <span class="pumpr-assistant-msg-role">${roleLabel}</span>
          <p>${formatAssistantMessageHtml(entry.text)}</p>
        </article>
      `;
    })
    .join("");
  assistantDom.log.scrollTop = assistantDom.log.scrollHeight;
  scheduleAssistantLayoutClamp();
}

function renderQuickReplies(items = []) {
  if (!assistantDom) return;
  const replies = (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  assistantDom.quickReplies.innerHTML = replies
    .map((label) => `<button class="pumpr-assistant-quick" type="button">${escapeHtml(label)}</button>`)
    .join("");
  assistantDom.quickReplies.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const label = String(button.textContent || "").trim();
      if (/^launch now$/i.test(label) && assistantLaunchDraft?.type === "launch") {
        renderLaunchDraft();
        assistantDom.launchDraft?.scrollIntoView({ behavior: "smooth", block: "center" });
        setStatus("Draft is ready. Tap the green Launch now button in the card when you want Phantom to open.", "thinking");
        return;
      }
      assistantDom.input.value = label;
      submitPrompt(label);
    });
  });
  scheduleAssistantLayoutClamp();
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAssistantMessageHtml(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(
    /(https?:\/\/[^\s<]+)/gi,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`
  );
}

function togglePanel(forceOpen) {
  const next = typeof forceOpen === "boolean" ? forceOpen : !assistantState.open;
  assistantState.open = next;
  assistantDom?.root.classList.toggle("collapsed", !next);
  persistState();
  if (next) {
    window.requestAnimationFrame(() => {
      clampWindowPosition();
      window.requestAnimationFrame(() => clampWindowPosition());
    });
  }
}

function scheduleAssistantLayoutClamp() {
  if (assistantLayoutClampQueued) return;
  assistantLayoutClampQueued = true;
  window.requestAnimationFrame(() => {
    assistantLayoutClampQueued = false;
    clampWindowPosition();
  });
}

function clampWindowPosition() {
  if (!assistantDom) return;
  const margin = 18;
  const panelRect = assistantDom.panel?.getBoundingClientRect?.();
  const rect = panelRect && panelRect.width > 0 && panelRect.height > 0
    ? panelRect
    : assistantDom.root.getBoundingClientRect();
  const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
  const x = Math.min(Math.max(Number(assistantState.x ?? maxX), margin), maxX);
  const y = Math.min(Math.max(Number(assistantState.y ?? maxY), margin), maxY);
  assistantState.x = x;
  assistantState.y = y;
  assistantDom.root.style.left = `${x}px`;
  assistantDom.root.style.top = `${y}px`;
}

function initCompanionMotion() {
  if (!assistantDom?.companion) return;
  const companionWidth = () => assistantDom?.companion?.offsetWidth || 226;
  const companionHeight = () => assistantDom?.companion?.offsetHeight || 314;
  const dockX = () => Math.max(20, window.innerWidth - companionWidth() - 18);
  const dockY = () => Math.max(20, window.innerHeight - companionHeight() - 24);
  const clampTarget = (value, min, max) => Math.min(Math.max(value, min), max);

  companionMotionState = {
    x: dockX(),
    y: dockY(),
    targetX: dockX(),
    targetY: dockY(),
    driftAt: 0,
    dragging: false,
    lookingX: 0,
    lookingY: 0
  };

  const setDockTarget = () => {
    if (!companionMotionState) return;
    companionMotionState.targetX = dockX();
    companionMotionState.targetY = dockY();
  };

  const nudgeToPoint = (clientX, clientY) => {
    if (!assistantDom?.companion || !companionMotionState) return;
    const rect = assistantDom.companion.getBoundingClientRect();
    const targetX = clampTarget(clientX - rect.width * 0.5, 18, Math.max(18, window.innerWidth - rect.width - 18));
    const targetY = clampTarget(clientY - rect.height * 0.6, 18, Math.max(18, window.innerHeight - rect.height - 18));
    companionMotionState.targetX = targetX;
    companionMotionState.targetY = targetY;
    companionMotionState.driftAt = Date.now();
    setCompanionGesture("wave", 0.48, 1200);
  };

  let dragStartX = 0;
  let dragStartY = 0;
  let dragMoved = false;

  assistantDom.companion.addEventListener("pointerdown", (event) => {
    if (!companionMotionState) return;
    companionMotionState.dragging = true;
    dragMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    assistantDom.companion.setPointerCapture?.(event.pointerId);
    setCompanionGesture("focus", 0.6, 1600);
  });

  assistantDom.companion.addEventListener("pointermove", (event) => {
    if (!companionMotionState?.dragging) return;
    const delta = Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY);
    if (delta > 6) dragMoved = true;
    nudgeToPoint(event.clientX, event.clientY);
  });

  assistantDom.companion.addEventListener("pointerup", (event) => {
    if (!companionMotionState) return;
    companionMotionState.dragging = false;
    assistantDom.companion.releasePointerCapture?.(event.pointerId);
    if (!dragMoved) {
      togglePanel(true);
      setCompanionReaction("I am here. Ask me anything.", "happy", 1600);
      return;
    }
    setCompanionReaction("Nice spot. I will hang here.", "happy", 1500);
  });

  assistantDom.companion.addEventListener("pointercancel", () => {
    if (companionMotionState) companionMotionState.dragging = false;
  });

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pumpr-assistant-shell")) return;
      if (target.closest("button,a,[role='button'],input,textarea,select,label")) return;
      nudgeToPoint(event.clientX, event.clientY);
      setCompanionReaction("On my way.", "happy", 1200);
    },
    true
  );

  const animateCompanion = () => {
    if (!assistantDom?.companion || !companionMotionState) return;
    const now = Date.now();
    if (!companionMotionState.dragging && now - companionMotionState.driftAt > 2600) {
      companionMotionState.driftAt = now;
      companionMotionState.targetX = dockX() + Math.sin(now / 1000) * 6;
      companionMotionState.targetY = dockY() + Math.cos(now / 1200) * 8;
    }
    companionMotionState.x += (companionMotionState.targetX - companionMotionState.x) * 0.11;
    companionMotionState.y += (companionMotionState.targetY - companionMotionState.y) * 0.11;
    companionMotionState.lookingX += (((companionMotionState.targetX - companionMotionState.x) / 120) - companionMotionState.lookingX) * 0.08;
    companionMotionState.lookingY += (((companionMotionState.targetY - companionMotionState.y) / 120) - companionMotionState.lookingY) * 0.08;
    assistantDom.companion.style.setProperty("--look-x", companionMotionState.lookingX.toFixed(3));
    assistantDom.companion.style.setProperty("--look-y", companionMotionState.lookingY.toFixed(3));
    assistantDom.companion.style.transform = `translate3d(${companionMotionState.x}px, ${companionMotionState.y}px, 0)`;
    requestAnimationFrame(animateCompanion);
  };

  window.addEventListener("blur", setDockTarget);
  window.addEventListener("resize", setDockTarget);
  animateCompanion();
}

function setCompanionGesture(kind = "idle", intensity = 0.45, ttl = 1600) {
  companionGestureState = {
    kind,
    intensity,
    until: Date.now() + ttl
  };
  if (assistantDom?.companion) {
    assistantDom.companion.dataset.gesture = kind;
    assistantDom.companion.style.setProperty("--gesture-strength", String(intensity));
  }
  if (companionGestureTimer) clearTimeout(companionGestureTimer);
  if (kind !== "idle") {
    companionGestureTimer = setTimeout(() => {
      companionGestureState = {
        kind: "idle",
        intensity: 0,
        until: 0
      };
      if (assistantDom?.companion) {
        assistantDom.companion.dataset.gesture = "idle";
        assistantDom.companion.style.setProperty("--gesture-strength", "0");
      }
    }, ttl);
  }
}

function gestureForReaction(text, tone = "idle") {
  const lower = String(text || "").toLowerCase();
  if (tone === "warning" || lower.includes("error") || lower.includes("failed")) {
    return { kind: "concern", intensity: 0.8, ttl: 2600 };
  }
  if (tone === "thinking" || lower.includes("swap") || lower.includes("bridge") || lower.includes("typing")) {
    return { kind: "thinking", intensity: 0.62, ttl: 2100 };
  }
  if (tone === "excited" || lower.includes("launch") || lower.includes("create") || lower.includes("go")) {
    return { kind: "cheer", intensity: 0.9, ttl: 2400 };
  }
  if (lower.includes("save") || lower.includes("submit") || lower.includes("publish")) {
    return { kind: "focus", intensity: 0.72, ttl: 2000 };
  }
  return { kind: "wave", intensity: 0.52, ttl: 1700 };
}

function inferMoodFromText(text, fallback = "idle") {
  const lower = String(text || "").toLowerCase();
  if (!lower) return fallback || "idle";
  if (/(stuck|broken|error|failed|blocked|panic|worried|irritat|angry|mad|wtf)/.test(lower)) return "warning";
  if (/(confused|thinking|wonder|curious|how|why|can you|should we|maybe)/.test(lower)) return "thinking";
  if (/(love|thanks|nice|great|awesome|cute|perfect|yay|lets go|banger|good)/.test(lower)) return "excited";
  if (/(sad|tired|bad|ugh|annoyed|sorry|stress)/.test(lower)) return "happy";
  return fallback || "idle";
}

function setCompanionReaction(text, tone = "idle", ttl = 1800) {
  if (!assistantDom?.reaction || !text) return;
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (!normalized) return;
  assistantDom.reaction.textContent = normalized.slice(0, 96);
  assistantDom.reaction.dataset.tone = tone || "idle";
  assistantDom.companion.classList.add("is-reacting");
  const gesture = gestureForReaction(normalized, tone);
  setCompanionGesture(gesture.kind, gesture.intensity, Math.max(ttl, gesture.ttl));
  if (companionReactionTimer) clearTimeout(companionReactionTimer);
  companionReactionTimer = setTimeout(() => {
    assistantDom?.companion?.classList.remove("is-reacting");
  }, ttl);
}

function bindPageReactions() {
  if (!assistantDom) return;

  const labelFor = (element) => {
    const raw = element?.getAttribute?.("aria-label")
      || element?.textContent
      || element?.value
      || element?.placeholder
      || "";
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 48);
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const interactive = target.closest("button,a,[role='button'],label,.pill-btn,.nav-link");
    if (!interactive) return;
    const label = labelFor(interactive);
    if (!label) return;
    const lower = label.toLowerCase();
    if (lower.includes("launch") || lower.includes("create")) {
      setCompanionReaction(`Lining up ${label}.`, "excited", 2200);
      return;
    }
    if (lower.includes("swap") || lower.includes("bridge")) {
      setCompanionReaction(`Routing ${label}.`, "thinking", 2200);
      return;
    }
    if (lower.includes("save") || lower.includes("publish") || lower.includes("submit")) {
      setCompanionReaction(`Sending ${label}.`, "thinking", 2100);
      return;
    }
    if (lower.includes("wallet") || lower.includes("sign") || lower.includes("connect")) {
      setCompanionReaction(`Waiting on ${label}.`, "thinking", 2200);
      return;
    }
    setCompanionReaction(`Opening ${label}.`, "happy", 1500);
  }, true);

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const label = labelFor(target);
    setCompanionReaction(label ? `Editing ${label}.` : "Updating your draft.", "thinking", 1200);
  }, true);

  document.addEventListener("submit", () => {
    setCompanionReaction("Working on it now.", "thinking", 2200);
  }, true);

  document.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const interactive = target.closest("button,a,[role='button']");
    if (!interactive || interactive.closest(".pumpr-assistant-shell")) return;
    const label = labelFor(interactive);
    if (!label) return;
    assistantDom.companion?.style.setProperty("--attention-label", `"${label}"`);
  }, true);
}

function initDrag(handle) {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMove = (event) => {
    if (!dragging) return;
    assistantState.x = event.clientX - offsetX;
    assistantState.y = event.clientY - offsetY;
    clampWindowPosition();
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    persistState();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, input, textarea")) return;
    dragging = true;
    const rect = assistantDom.root.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

function supportsVoice() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function initVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    assistantDom.mic.disabled = true;
    assistantDom.mic.title = "Voice input is not available in this browser.";
    return;
  }
  recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognitionActive = true;
    assistantState.listening = true;
    assistantDom.root.classList.add("is-listening");
    setStatus("Listening...", "thinking");
  };
  recognition.onend = () => {
    recognitionActive = false;
    assistantState.listening = false;
    assistantDom.root.classList.remove("is-listening");
    if (!messageBusy) setStatus("Ask me to launch, swap, post, or guide the page.", assistantState.mood || "idle");
  };
  recognition.onerror = (event) => {
    setStatus(`Voice input error: ${event.error || "unknown"}`, "warning");
  };
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || [])
      .map((result) => result?.[0]?.transcript || "")
      .join(" ")
      .trim();
    assistantDom.input.value = transcript;
    if (event.results?.[event.resultIndex]?.isFinal && transcript) {
      submitPrompt(transcript);
    }
  };

  assistantDom.mic.addEventListener("click", () => {
    if (!recognition) return;
    if (recognitionActive) {
      recognition.stop();
      return;
    }
    recognition.start();
  });
}

function speakReply(text) {
  if (assistantState.muted || !("speechSynthesis" in window)) return;
  const line = String(text || "").trim();
  if (!line) return;
  const utterance = new SpeechSynthesisUtterance(line);
  const voice = pickAssistantVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = assistantState.mood === "excited" ? 1.08 : 1;
  utterance.pitch = 1.24;
  utterance.onstart = () => setSpeaking(true);
  utterance.onend = () => setSpeaking(false);
  utterance.onerror = () => setSpeaking(false);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function pickAssistantVoice() {
  if (!("speechSynthesis" in window)) return null;
  if (assistantVoice) return assistantVoice;
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices.length) return null;
  const femaleHints = [
    "female",
    "woman",
    "girl",
    "zira",
    "aria",
    "ava",
    "samantha",
    "victoria",
    "karen",
    "allison",
    "susan",
    "moira",
    "serena",
    "google uk english female",
    "google us english"
  ];
  const englishVoices = voices.filter((voice) => String(voice.lang || "").toLowerCase().startsWith("en"));
  const searchPool = englishVoices.length ? englishVoices : voices;
  const preferred = searchPool.find((voice) => {
    const label = `${String(voice.name || "")} ${String(voice.voiceURI || "")}`.toLowerCase();
    return femaleHints.some((hint) => label.includes(hint));
  });
  assistantVoice = preferred || searchPool[0] || voices[0] || null;
  return assistantVoice;
}

function findButtonByText(labels = []) {
  const lookups = labels.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  const candidates = [...document.querySelectorAll("button, a[role='button'], .btn-primary, .btn-ghost")];
  return (
    candidates.find((node) => {
      const text = String(node.textContent || "").trim().toLowerCase();
      return lookups.some((label) => text === label || text.includes(label));
    }) || null
  );
}

function clickSignIn() {
  return (
    document.getElementById("walletConnectBtn") ||
    document.getElementById("connectWalletBtn") ||
    document.querySelector("[data-wallet-connect]") ||
    document.querySelector(".wallet-connect-btn") ||
    findButtonByText(["sign in", "connect", "connect wallet"])
  );
}

function setValue(element, value) {
  if (!element) return;
  element.focus();
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickElement(element) {
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.click();
  return true;
}

function postJson(url, payload) {
  if (typeof window.fetch === "function") {
    return window.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      json: await response.json().catch(() => ({}))
    }));
  }

  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        const status = Number(xhr.status || 0);
        const body = safeParse(xhr.responseText, {});
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: body
        });
      };
      xhr.onerror = () => reject(new Error("Assistant request failed."));
      xhr.send(JSON.stringify(payload || {}));
    } catch (error) {
      reject(error);
    }
  });
}

function queuePendingActions(path, actions) {
  localStorage.setItem(
    ASSISTANT_PENDING_KEY,
    JSON.stringify({
      path,
      actions,
      ts: Date.now()
    })
  );
}

function readPendingActions() {
  const parsed = safeParse(localStorage.getItem(ASSISTANT_PENDING_KEY), null);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

function clearPendingActions() {
  localStorage.removeItem(ASSISTANT_PENDING_KEY);
}

function applyCreatePayload(payload = {}, attempt = 0) {
  setValue(document.getElementById("name"), payload.name || "");
  setValue(document.getElementById("symbol"), payload.symbol || "");
  setValue(document.getElementById("description"), payload.description || "");
  setValue(document.getElementById("website"), payload.website || "");
  setValue(document.getElementById("twitter"), payload.twitter || "");
  setValue(document.getElementById("telegram"), payload.telegram || "");
  if (payload.totalSupply != null) setValue(document.getElementById("supply"), String(payload.totalSupply));
  if (payload.creatorAllocationPct != null) setValue(document.getElementById("creatorBuyEth"), String(payload.creatorAllocationPct));
  if (payload.starterBuyEth != null) setValue(document.getElementById("devBuyEth"), String(payload.starterBuyEth));
  if (payload.devBuyEth != null && payload.starterBuyEth == null) setValue(document.getElementById("devBuyEth"), String(payload.devBuyEth));
  if (payload.pumpfunDevBuySol != null) setValue(document.getElementById("pumpfunDevBuySol"), String(payload.pumpfunDevBuySol));
  if (payload.tradeTaxPct != null) setValue(document.getElementById("tradeTaxPct"), String(payload.tradeTaxPct));
  if (payload.bridgeSolAmount != null) setValue(document.getElementById("rhBridgeAmount"), String(payload.bridgeSolAmount));
  if (payload.pumpfunCreatorWallet) setValue(document.getElementById("pumpfunCreatorWallet"), payload.pumpfunCreatorWallet);
  if (payload.image) setValue(document.getElementById("image"), payload.image);

  let shouldRetry = false;
  const modeValue = String(payload.launchMode || "").trim();
  if (modeValue && modeValue !== "chain") {
    const modeButton = document.querySelector(`#launchChainOptions [data-launch-mode="${String(payload.launchMode)}"]`);
    if (modeButton) {
      clickElement(modeButton);
    } else {
      shouldRetry = true;
    }
  } else if (payload.chainId) {
    const chainButton = document.querySelector(`#launchChainOptions [data-chain-id="${String(payload.chainId)}"]`);
    if (chainButton) {
      clickElement(chainButton);
    } else {
      shouldRetry = true;
    }
  }

  window.setTimeout(() => {
    if (payload.launchStyle === "direct") {
      const directButton = document.getElementById("launchStyleDirectBtn");
      if (directButton) {
        clickElement(directButton);
      } else {
        shouldRetry = true;
      }
    } else if (payload.launchStyle === "bonding") {
      const bondingButton = document.getElementById("launchStyleBondingBtn");
      if (bondingButton) {
        clickElement(bondingButton);
      } else {
        shouldRetry = true;
      }
    }

    if (shouldRetry && attempt < 6) {
      window.setTimeout(() => applyCreatePayload(payload, attempt + 1), 300);
    }
  }, 220);
}

function applyRhSwapPayload(payload = {}, attempt = 0) {
  const amountField = document.getElementById("rhswapAmount");
  const tokenField = document.getElementById("rhswapTargetToken");
  if (payload.amountPumpr != null && amountField) setValue(amountField, String(payload.amountPumpr));
  if (payload.targetToken && tokenField) {
    setValue(tokenField, String(payload.targetToken));
  }
  window.setTimeout(() => {
    clickElement(document.getElementById("rhswapQuoteBtn"));
    const amountMissing = payload.amountPumpr != null && String(document.getElementById("rhswapAmount")?.value || "") !== String(payload.amountPumpr);
    const tokenMissing = payload.targetToken && String(document.getElementById("rhswapTargetToken")?.value || "").toLowerCase() !== String(payload.targetToken).toLowerCase();
    if ((amountMissing || tokenMissing) && attempt < 6) {
      window.setTimeout(() => applyRhSwapPayload(payload, attempt + 1), 280);
    }
  }, 220);
}

function applySocialPayload(payload = {}) {
  if (payload.body != null) setValue(document.getElementById("socialPostBody"), String(payload.body));
  if (payload.token != null) setValue(document.getElementById("socialPostToken"), String(payload.token));
  if (payload.chain != null) setValue(document.getElementById("socialPostChain"), String(payload.chain));
}

async function prepareAssistantLaunchDetails(draft = {}) {
  const launchMode = String(draft.launchMode || "").trim();
  const chainId = Number(draft.chainId || 0);
  const name = String(draft.name || "").trim().slice(0, 32);
  const symbol = String(draft.symbol || "").trim().toUpperCase().slice(0, 13);
  const description = String(draft.description || "").trim();
  const creatorAllocationPct = assistantNumber(draft.creatorAllocationPct, 0);
  const starterBuy = assistantNumber(draft.starterBuyEth ?? draft.pumpfunDevBuySol, 0);
  const pumpfunDevBuySol = Math.max(0, assistantNumber(draft.pumpfunDevBuySol, 0));
  const launchStyle = String(draft.launchStyle || "").trim();
  const kolApplication = assistantNormalizeKolApplication(draft);
  let image = String(draft.image || assistantUpload?.url || "").trim();

  if (!launchMode) throw new Error("Pick a chain first.");
  if (!name) throw new Error("Coin name is still missing.");
  if (!symbol) throw new Error("Ticker is still missing.");
  if (launchMode === "pumpfun" && !image) throw new Error("Pump.fun needs an image before launch.");
  if (launchMode === "chain" && launchStyle === "direct" && !(starterBuy > 0)) {
    throw new Error("Direct Uniswap launch needs liquidity before it can start.");
  }
  if (!image && launchMode !== "pumpfun") {
    image = makeFallbackImage(name, symbol);
  }
  image = await ensureAssistantHostedImage(image, { requireHosted: launchMode === "pumpfun" });
  if (image.startsWith("data:image/")) {
    if (launchMode === "pumpfun") {
      throw new Error("Pump.fun needs a hosted image URL before launch.");
    }
    image = `${window.location.origin}/assets/pump-r-logo.png`;
  }

  const availability = await api.launchAvailability({ name, symbol });
  if (availability?.available === false || availability?.duplicate) {
    const existing = availability?.existing || {};
    const field = availability?.field === "name" ? "name" : "ticker";
    const taken = existing.symbol ? `$${existing.symbol}` : existing.name || "an existing token";
    throw new Error(`A token with this ${field} already exists (${taken}). Pick a different token name and ticker.`);
  }

  return {
    ...draft,
    launchMode,
    chainId,
    name,
    symbol,
    description,
    image,
    creatorAllocationPct,
    starterBuyValue: starterBuy,
    pumpfunDevBuySolValue: pumpfunDevBuySol,
    kolApplicationValue: kolApplication,
    launchStyle,
    totalSupplyValue: assistantNumber(draft.totalSupply, DEFAULT_ASSISTANT_TOKEN_SUPPLY)
  };
}

async function assistantSendPumpFunSignedTransaction(provider, solanaWeb3, payload = {}, label = "transaction") {
  const transactionBase64 = String(payload?.transactionBase64 || "").trim();
  if (!transactionBase64) throw new Error(`${label} transaction was not returned.`);
  const transaction = assistantDeserializeSolanaTransaction(solanaWeb3, transactionBase64, Boolean(payload?.versionedTransaction));
  setStatus(`Open Phantom and sign the ${label}.`, "excited");
  const signed = await provider.signTransaction(transaction);
  setStatus(`Broadcasting the ${label}...`, "thinking");
  const sent = await api.solanaSendTransaction({
    signedTransactionBase64: assistantSerializeSignedSolanaTransaction(signed),
    rpcUrl: payload?.rpcUrl,
    blockhash: payload?.blockhash,
    lastValidBlockHeight: payload?.lastValidBlockHeight
  });
  return String(sent?.signature || "");
}

async function assistantRetrySignedPumpFunStep({ provider, solanaWeb3, label, buildPayload, onPayload = null }) {
  const payload = await buildPayload();
  if (typeof onPayload === "function") onPayload(payload);
  try {
    const signature = await assistantSendPumpFunSignedTransaction(provider, solanaWeb3, payload, label);
    return { signature, payload };
  } catch (error) {
    if (assistantIsSolanaBlockhashExpiredError(error)) {
      throw new Error(`The ${label} signature window expired before broadcast. Tap Launch now again for a fresh request.`);
    }
    throw error;
  }
}

async function launchPumpFunFromAssistant(draft = {}) {
  const details = await prepareAssistantLaunchDetails({ ...draft, launchMode: "pumpfun" });
  const { provider, publicKey } = await connectSolanaWallet();
  const solanaWeb3 = await assistantLoadSolanaWeb3();
  let payload = null;
  let mint = "";
  let pumpfunUrl = "";
  let signature = "";
  let devBuySignature = "";
  let kolBuySignature = "";
  let kolTransferSignature = "";
  let kolApplication = details.kolApplicationValue || null;
  let finalizedLaunch = null;
  addHistory("assistant", "Preparing your Pump.fun launch transaction...");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    setStatus(
      attempt > 0
        ? "The last Pump.fun tx expired. Rebuilding a fresh one now..."
        : "Preparing the Pump.fun launch here in chat...",
      "thinking"
    );
    payload = await api.pumpfunLaunch({
      name: details.name,
      symbol: details.symbol,
      description: details.description,
      imageUri: details.image,
      totalSupply: ethers.parseUnits(String(details.totalSupplyValue || DEFAULT_ASSISTANT_TOKEN_SUPPLY), 18).toString(),
      creatorBps: String(BigInt(Math.round(details.creatorAllocationPct * 100))),
      starterBuy: details.pumpfunDevBuySolValue > 0 ? ethers.parseUnits(String(details.pumpfunDevBuySolValue), 9).toString() : "0",
      starterBuySol: String(details.pumpfunDevBuySolValue || 0),
      creatorWallet: publicKey,
      userPublicKey: publicKey,
      source: "Pump-r Assistant",
      walletBroadcast: false,
      transactionFormat: "legacy",
      kolApplication: kolApplication || null
    });

    mint = String(payload?.mint || payload?.tokenAddress || payload?.token || "");
    pumpfunUrl = String(payload?.pumpfunUrl || payload?.url || (mint ? `https://pump.fun/coin/${mint}` : ""));
    const transactionBase64 = String(payload?.transactionBase64 || "");
    const signingToken = String(payload?.signingToken || "");
    if (!mint || !pumpfunUrl || !transactionBase64 || !signingToken) {
      throw new Error("Pump.fun SDK did not return a complete launch transaction.");
    }

    const useWalletBroadcast = Boolean(payload?.walletBroadcast) && typeof provider.signAndSendTransaction === "function";
    addHistory(
      "assistant",
      attempt > 0
        ? "Fresh Pump.fun transaction rebuilt. Phantom should open once more for a clean signature."
        : "Pump.fun transaction is ready. Phantom should open once for the launch signature."
    );
    setStatus(
      useWalletBroadcast
        ? "Open Phantom and sign/send the Pump.fun launch."
        : "Open Phantom and sign the Pump.fun launch.",
      "excited"
    );
    const transaction = assistantDeserializeSolanaTransaction(solanaWeb3, transactionBase64, Boolean(payload?.versionedTransaction));
    const signedOrSent = useWalletBroadcast
      ? await provider.signAndSendTransaction(transaction)
      : await provider.signTransaction(transaction);

    try {
      addHistory("assistant", "Signature received. Broadcasting and waiting for Pump.fun confirmation...");
      setStatus("Finalizing the Pump.fun launch...", "thinking");
      const walletSignature = useWalletBroadcast ? assistantNormalizeSolanaSignature(signedOrSent) : "";
      if (useWalletBroadcast && !walletSignature) {
        throw new Error("Phantom did not return a transaction signature.");
      }
      const finalized = await api.pumpfunFinalize({
        signingToken,
        signature: walletSignature,
        versionedTransaction: Boolean(payload?.versionedTransaction),
        signedTransactionBase64: useWalletBroadcast
          ? ""
          : assistantSerializeSignedSolanaTransaction(signedOrSent)
      });
      signature = String(finalized?.signature || "");
      finalizedLaunch = finalized?.launch || null;
      break;
    } catch (error) {
      if (attempt === 0 && assistantIsSolanaBlockhashExpiredError(error)) {
        addHistory("assistant", "That Pump.fun signature expired before broadcast. Rebuilding a fresh transaction now.");
        continue;
      }
      throw error;
    }
  }

  try {
    const launchRow = {
      ...(finalizedLaunch || {}),
      mint,
      name: details.name,
      symbol: details.symbol,
      description: details.description,
      imageUri: details.image,
      creator: publicKey,
      kolApplication,
      devBuySignature,
      kolBuySignature,
      kolTransferSignature,
      pumpfunUrl,
      signature,
      metadataUri: payload?.metadataUri,
      createdAt: Number(finalizedLaunch?.createdAt || Math.floor(Date.now() / 1000))
    };

    if (details.pumpfunDevBuySolValue > 0) {
      addHistory("assistant", `Token is live. Opening Phantom for the ${details.pumpfunDevBuySolValue} SOL Dev buy.`);
      const devBuyResult = await assistantRetrySignedPumpFunStep({
        provider,
        solanaWeb3,
        label: `dev buy of ${details.pumpfunDevBuySolValue} SOL`,
        buildPayload: () => api.pumpfunDevBuy({
          mint,
          creatorWallet: publicKey,
          userPublicKey: publicKey,
          buySol: String(details.pumpfunDevBuySolValue || 0)
        })
      });
      devBuySignature = String(devBuyResult.signature || "");
      launchRow.devBuySignature = devBuySignature;
    }

    if (kolApplication?.enabled && Number(kolApplication.buySol || 0) > 0) {
      addHistory("assistant", `Opening Phantom for Manlet Mode buy to ${kolApplication.name}.`);
      const kolResult = await assistantRetrySignedPumpFunStep({
        provider,
        solanaWeb3,
        label: `Manlet Mode buy for ${kolApplication.name}`,
        buildPayload: () => api.pumpfunKolBuy({
          mint,
          creatorWallet: publicKey,
          userPublicKey: publicKey,
          kolApplication
        }),
        onPayload: (nextPayload) => {
          kolApplication = nextPayload?.kolApplication || kolApplication;
          launchRow.kolApplication = kolApplication;
        }
      });
      kolBuySignature = String(kolResult.signature || "");
      launchRow.kolApplication = kolApplication;
      launchRow.kolBuySignature = kolBuySignature;
      if (String(kolApplication?.kolBuy?.recipientMode || "") !== "kol_wallet_direct") {
        addHistory("assistant", `Opening Phantom one more time to transfer the bought allocation to ${kolApplication.name}.`);
        const transferResult = await assistantRetrySignedPumpFunStep({
          provider,
          solanaWeb3,
          label: `Manlet Mode transfer to ${kolApplication.name}`,
          buildPayload: () => api.pumpfunKolTransfer({
            mint,
            userPublicKey: publicKey,
            tokenAmount: kolApplication?.kolBuy?.tokenAmount || "",
            kolApplication
          }),
          onPayload: (nextPayload) => {
            kolApplication = nextPayload?.kolApplication || kolApplication;
            launchRow.kolApplication = kolApplication;
          }
        });
        kolTransferSignature = String(transferResult.signature || "");
        launchRow.kolApplication = kolApplication;
        launchRow.kolTransferSignature = kolTransferSignature;
      }
    }

    cacheAssistantPumpFunLaunchForHome(launchRow);
    syncAssistantPumpFunLaunchRecord(launchRow);
    return {
      chainLabel: "Pump.fun",
      token: mint,
      url: pumpfunUrl,
      signature
    };
  } catch (error) {
    if (assistantIsSolanaBlockhashExpiredError(error)) {
      throw new Error("The Pump.fun signature window expired before broadcast. Nothing was launched yet. Tap Launch now again for a fresh transaction.");
    }
    throw error;
  }
}

async function launchEvmFromAssistant(draft = {}) {
  const details = await prepareAssistantLaunchDetails(draft);
  const chainId = Number(details.chainId || 0);
  if (!chainId || details.launchMode !== "chain") {
    throw new Error("Pick an EVM chain before launching.");
  }

  let ws = walletState();
  if (!ws?.signer) {
    const session = readWalletSession();
    await connectWallet(session.choice || "", { silent: false });
    ws = walletState();
  }
  if (!ws?.signer) {
    throw new Error("Connect an EVM wallet first.");
  }

  setStatus(`Switching your wallet to ${chainLabelForDraft(details)}...`, "thinking");
  await ensureWalletChain(chainId);
  const config = await api.config({ chainId, quote: "native" });
  const factory = makeFactoryContract(config.factoryAddress);
  const launchFeeWei = BigInt(config?.deployment?.launchFeeWei || "0");
  const dexRouter = String(config?.deployment?.dexRouter || ethers.ZeroAddress);
  const hasDexRouter = dexRouter && dexRouter.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
  const useTaxLaunch = chainId === 4663;
  const directLiquidityMode = details.launchStyle === "direct";
  const liveDexCurveMode = chainId === 4663 && details.launchStyle !== "direct";
  const starterBuyEth = ethers.parseUnits(String(details.starterBuyValue || 0), 18);
  if (directLiquidityMode && starterBuyEth > 0n && !hasDexRouter) {
    throw new Error(`${chainLabelForDraft(details)} direct launch mode needs a DEX router configured first.`);
  }
  if (liveDexCurveMode && !hasDexRouter) {
    throw new Error(`${chainLabelForDraft(details)} Uniswap bonding mode needs a DEX router configured first.`);
  }
  if (liveDexCurveMode && starterBuyEth <= 0n) {
    throw new Error(`${chainLabelForDraft(details)} Uniswap bonding mode needs launch liquidity entered first so the pair can open live on launch.`);
  }
  const useInstantLiquidity = directLiquidityMode && hasDexRouter && starterBuyEth > 0n;
  const useLiveDexCurve = liveDexCurveMode && hasDexRouter && starterBuyEth > 0n;
  const totalValue = launchFeeWei + (useInstantLiquidity || useLiveDexCurve ? starterBuyEth : 0n);
  const totalSupply = ethers.parseUnits(String(details.totalSupplyValue || DEFAULT_ASSISTANT_TOKEN_SUPPLY), 18);
  const creatorBps = BigInt(Math.round(details.creatorAllocationPct * 100));
  const tokenTradeFeeBps = BigInt(Math.round(DEFAULT_ASSISTANT_TOKEN_TAX_PCT * 100));
  const launchMethodName = useInstantLiquidity
    ? useTaxLaunch ? "createLaunchInstantWithTax" : "createLaunchInstant"
    : useLiveDexCurve
    ? useTaxLaunch ? "createLaunchLiveDexCurveWithTax" : "createLaunchLiveDexCurve"
    : useTaxLaunch ? "createLaunchWithTax" : "createLaunch";
  const launchArgs = useTaxLaunch
    ? [details.name, details.symbol, details.image, details.description, totalSupply, creatorBps, tokenTradeFeeBps]
    : [details.name, details.symbol, details.image, details.description, totalSupply, creatorBps];
  const launchMethod = factory[launchMethodName];

  setStatus(
    useLiveDexCurve
      ? `Open your wallet to launch a live Uniswap bonding curve on ${chainLabelForDraft(details)}...`
      : `Open your wallet to launch on ${chainLabelForDraft(details)}...`,
    "excited"
  );
  const simulated = await launchMethod.staticCall(...launchArgs, { value: totalValue });
  const tx = await sendTxWithFallback({
    label: `Assistant ${chainLabelForDraft(details)} launch`,
    populatedTx: launchMethod.populateTransaction(...launchArgs, { value: totalValue }),
    walletNativeSend: () => launchMethod(...launchArgs, { value: totalValue })
  });
  const receipt = await tx.wait();
  const launchInfo = assistantExtractLaunchCreated(receipt) || {
    launchId: simulated?.[0],
    token: simulated?.[1],
    pool: simulated?.[2]
  };

  if (!useInstantLiquidity && !useLiveDexCurve && starterBuyEth > 0n && launchInfo?.pool) {
    setStatus("Launch created. Running the starter buy...", "thinking");
    const pool = makePoolContract(launchInfo.pool);
    const quoted = await pool.quoteBuy(starterBuyEth);
    const quotedTokens = BigInt(quoted?.[0] || 0n);
    const minTokensOut = quotedTokens > 0n ? (quotedTokens * 97n) / 100n : 0n;
    const buyTx = await sendTxWithFallback({
      label: `${chainLabelForDraft(details)} assistant starter buy`,
      populatedTx: pool.buy.populateTransaction(minTokensOut, { value: starterBuyEth }),
      walletNativeSend: () => pool.buy(minTokensOut, { value: starterBuyEth })
    });
    await buyTx.wait();
  }

  return {
    chainLabel: chainLabelForDraft(details),
    token: String(launchInfo?.token || ""),
    url: launchInfo?.token
      ? `/token?token=${encodeURIComponent(String(launchInfo.token))}&chainId=${encodeURIComponent(String(chainId))}`
      : "",
    signature: String(tx?.hash || "")
  };
}

async function launchAssistantDraft(draft = {}, options = {}) {
  const nextDraft = draft && typeof draft === "object" ? { ...(assistantLaunchDraft || {}), ...draft } : assistantLaunchDraft;
  if (!nextDraft || nextDraft.type !== "launch") {
    throw new Error("There is no active launch draft yet.");
  }
  const force = Boolean(options?.force);
  if (messageBusy && !force) return;
  messageBusy = true;
  try {
    assistantSaveLaunchDraft(nextDraft);
    const result = nextDraft.launchMode === "pumpfun"
      ? await launchPumpFunFromAssistant(nextDraft)
      : await launchEvmFromAssistant(nextDraft);
    clearAssistantLaunchComposer();
    const tokenLink = result?.url
      ? /^https?:\/\//i.test(String(result.url))
        ? result.url
        : new URL(String(result.url), window.location.origin).toString()
      : "";
    addHistory(
      "assistant",
      tokenLink
        ? `Launch complete on ${result.chainLabel}. Token: ${shortAddress(result.token)}. Open it here: ${tokenLink}`
        : `Launch complete on ${result.chainLabel}. Token: ${shortAddress(result.token)}.`
    );
    setStatus(`${result.chainLabel} launch complete.`, "celebrate");
  } catch (error) {
    const message = parseUiError(error);
    addHistory("assistant", `Launch stopped: ${message}`);
    if (/user rejected the request|user rejected request|rejected the request/i.test(message)) {
      setStatus("Phantom request canceled. Nothing was signed. Adjust the draft or tap Launch now again when you are ready.", "warning");
    } else {
      setStatus(message, "warning");
    }
    throw error;
  } finally {
    messageBusy = false;
  }
}

async function applyAction(action = {}) {
  const type = String(action.type || "").trim();
  const payload = action.payload && typeof action.payload === "object" ? action.payload : {};

  if (!type) return;

  if (type === "open_page" && action.path) {
    const nextPath = String(action.path).trim();
    if (nextPath && nextPath !== location.pathname) {
      location.href = nextPath;
    }
    return;
  }

  if (type === "fill_create_form") {
    if (currentPageName() !== "create") {
      queuePendingActions("/create", [action]);
      location.href = "/create";
      return;
    }
    applyCreatePayload(payload);
    setStatus("Create form lined up.", "happy");
    return;
  }

  if (type === "submit_create") {
    if (currentPageName() !== "create") {
      queuePendingActions("/create", [action]);
      location.href = "/create";
      return;
    }
    clickElement(document.getElementById("launchSubmitBtn"));
    setStatus("Launch button pressed. Your wallet will still confirm.", "excited");
    return;
  }

  if (type === "assistant_launch_draft") {
    const nextDraft = payload && typeof payload === "object"
      ? { ...(assistantLaunchDraft || {}), ...payload, launchArmed: true }
      : assistantLaunchDraft;
    assistantSaveLaunchDraft(nextDraft);
    assistantDom.launchDraft?.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("Draft is armed. Review the options in the card, then tap the green Launch now button to open Phantom.", "thinking");
    return;
  }

  if (type === "fill_rh_swap") {
    if (currentPageName() !== "rh-swap") {
      queuePendingActions("/rh-swap", [action]);
      location.href = "/rh-swap";
      return;
    }
    applyRhSwapPayload(payload);
    setStatus("RH swap draft is ready.", "thinking");
    return;
  }

  if (type === "submit_rh_swap") {
    if (currentPageName() !== "rh-swap") {
      queuePendingActions("/rh-swap", [action]);
      location.href = "/rh-swap";
      return;
    }
    clickElement(document.getElementById("rhswapRequestBtn"));
    setStatus("Swap submitted from the page flow.", "excited");
    return;
  }

  if (type === "fill_social_post") {
    if (currentPageName() !== "social") {
      queuePendingActions("/social", [action]);
      location.href = "/social";
      return;
    }
    applySocialPayload(payload);
    setStatus("Post draft filled in.", "happy");
    return;
  }

  if (type === "submit_social_post") {
    if (currentPageName() !== "social") {
      queuePendingActions("/social", [action]);
      location.href = "/social";
      return;
    }
    clickElement(document.getElementById("socialPostBtn"));
    setStatus("Social post submitted.", "celebrate");
    return;
  }

  if (type === "click") {
    const target = String(action.target || "").trim();
    let node = null;
    if (target === "signIn" || target === "connect") {
      node = clickSignIn();
    } else if (target === "editProfile") {
      node =
        document.getElementById("socialEditProfileBtn") ||
        document.getElementById("editProfileBtn") ||
        findButtonByText(["edit profile", "view profile"]);
    }
    if (node) clickElement(node);
    return;
  }

  if (type === "focus") {
    const target = String(action.target || "").trim();
    const selectorMap = {
      launch: "#createForm",
      swap: ".rhswap-shell, .rhswap-main, .rhswap-panel",
      social: ".socialx-compose-card, .socialx-feed",
      profile: ".profile-page, .profile-main, #profileRoot"
    };
    const node = document.querySelector(selectorMap[target] || "");
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function applyActions(actions = []) {
  const list = Array.isArray(actions) ? actions : [];
  for (let index = 0; index < list.length; index += 1) {
    const action = list[index];
    if (String(action?.type || "").trim() === "open_page" && action?.path) {
      const targetPath = String(action.path).trim();
      const remaining = list.slice(index + 1);
      if (remaining.length && targetPath && targetPath !== location.pathname) {
        queuePendingActions(targetPath, remaining);
        location.href = targetPath;
        return;
      }
    }
    try {
      await applyAction(action);
    } catch {
      // Keep the assistant resilient if one action fails.
    }
  }
}

async function runPendingActions() {
  const pending = readPendingActions();
  if (!pending?.path || pending.path !== location.pathname) return;
  clearPendingActions();
  await applyActions(Array.isArray(pending.actions) ? pending.actions : []);
}

async function submitPrompt(rawText) {
  const message = String(rawText || assistantDom?.input?.value || "").trim();
  if (!message || messageBusy) return;
  messageBusy = true;
  assistantDom.input.value = "";
  addHistory("user", message);
  setStatus("Thinking through the flow...", inferMoodFromText(message, "thinking"));

  try {
    const response = await postJson("/api/assistant/respond", {
      message,
      page: currentPageName(),
      pathname: location.pathname,
      wallet: readWalletSession(),
      context: collectPageContext(),
      attachment: assistantUpload?.url
        ? {
            name: assistantUpload.name || "",
            imageUrl: assistantUpload.url,
            type: assistantUpload.type || "image"
          }
        : null,
      history: assistantHistory.map((entry) => ({ role: entry.role, text: entry.text })),
      selectedText: window.getSelection?.()?.toString?.() || ""
    });
    const payload = response.json || {};
    const reply = String(payload.reply || "I hit a rough edge, but I can still guide the page manually.").trim();
    if (payload?.draft && typeof payload.draft === "object") {
      assistantLaunchDraft = assistantRecomputeLaunchDraft(payload.draft);
      syncLaunchDraftWithAttachment();
      persistLaunchDraft();
      renderLaunchDraft();
    } else if (payload?.draft === null && assistantLaunchDraft) {
      clearLaunchDraft();
    }
    addHistory("assistant", reply);
    renderQuickReplies(payload.quickReplies || []);
    setStatus(payload.followUp || "Ready for the next step.", payload.mood || inferMoodFromText(reply, "idle"));
    if (payload.warning) {
      addHistory("assistant", `Heads up: ${String(payload.warning)}`);
    }
    if (Array.isArray(payload.actions) && payload.actions.length) {
      await applyActions(payload.actions);
    }
    speakReply(reply);
  } catch (error) {
    addHistory("assistant", "I could not reach the live assistant route, but I am still here. Try again or tell me the next step plainly.");
    setStatus(error?.message || "Assistant request failed.", "warning");
  } finally {
    messageBusy = false;
  }
}

function buildAssistantDom() {
  const root = document.createElement("section");
  root.className = "pumpr-assistant-shell";
  root.dataset.mood = assistantState.mood || "idle";
  root.innerHTML = `
    <button class="pumpr-assistant-companion" type="button" aria-label="Open Pump-r assistant">
      <span class="pumpr-assistant-companion-reaction">Ready to help.</span>
      <span class="pumpr-assistant-companion-ring"></span>
      <img class="pumpr-assistant-companion-poster" src="${ASSISTANT_THUMB_URL}" alt="" />
      <canvas class="pumpr-assistant-companion-canvas" width="240" height="240" aria-label="Pump-r mascot"></canvas>
      <span class="pumpr-assistant-companion-label">Airi</span>
    </button>
    <button class="pumpr-assistant-peek" type="button" aria-label="Open Pump-r assistant">
      <span class="pumpr-assistant-peek-dot"></span>
      <span>Open copilot</span>
    </button>
    <div class="pumpr-assistant-panel">
      <header class="pumpr-assistant-head">
        <div class="pumpr-assistant-title-wrap">
          <small>AI Copilot</small>
          <strong>Pump-r Airi</strong>
        </div>
        <div class="pumpr-assistant-head-actions">
          <button class="pumpr-assistant-head-btn" data-assistant-action="mute" type="button" title="Mute voice">Voice</button>
          <button class="pumpr-assistant-head-btn" data-assistant-action="mic" type="button" title="Talk to Airi">Mic</button>
          <button class="pumpr-assistant-head-btn" data-assistant-action="toggle" type="button" title="Collapse assistant">Hide</button>
        </div>
      </header>
      <div class="pumpr-assistant-stage">
        <div class="pumpr-assistant-avatar-card">
          <img class="pumpr-assistant-portrait" src="${ASSISTANT_THUMB_URL}" alt="Pump-r anime mascot" />
          <div class="pumpr-assistant-avatar-glow"></div>
          <div class="pumpr-assistant-avatar-chip">Live 3D copilot</div>
        </div>
        <div class="pumpr-assistant-stage-copy">
          <small>Voice + emotions + actions</small>
          <h3>Launch, swap, or get guided live.</h3>
          <p>Airi is your on-page 3D copilot. She reacts to your flow, can be moved around, and helps with launches, swaps, and page actions without breaking the vibe.</p>
          <p class="pumpr-assistant-status">Ready.</p>
        </div>
      </div>
      <div class="pumpr-assistant-launch-draft" hidden></div>
      <div class="pumpr-assistant-log"></div>
      <div class="pumpr-assistant-quick-replies"></div>
      <form class="pumpr-assistant-composer">
        <button class="pumpr-assistant-attach" type="button">Image</button>
        <input class="pumpr-assistant-input" type="text" maxlength="400" placeholder="Try: set up an ETH launch with direct Uniswap" />
        <button class="pumpr-assistant-send" type="submit">Send</button>
        <div class="pumpr-assistant-upload-row">
          <span class="pumpr-assistant-upload-status" hidden></span>
          <button class="pumpr-assistant-upload-remove" type="button" hidden>Clear</button>
        </div>
        <input class="pumpr-assistant-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
      </form>
    </div>
  `;
  document.body.appendChild(root);

  const dom = {
    root,
    companion: root.querySelector(".pumpr-assistant-companion"),
    reaction: root.querySelector(".pumpr-assistant-companion-reaction"),
    peek: root.querySelector(".pumpr-assistant-peek"),
    panel: root.querySelector(".pumpr-assistant-panel"),
    status: root.querySelector(".pumpr-assistant-status"),
    launchDraft: root.querySelector(".pumpr-assistant-launch-draft"),
    log: root.querySelector(".pumpr-assistant-log"),
    quickReplies: root.querySelector(".pumpr-assistant-quick-replies"),
    input: root.querySelector(".pumpr-assistant-input"),
    form: root.querySelector(".pumpr-assistant-composer"),
    uploadBtn: root.querySelector(".pumpr-assistant-attach"),
    uploadInput: root.querySelector(".pumpr-assistant-upload-input"),
    uploadStatus: root.querySelector(".pumpr-assistant-upload-status"),
    uploadRemove: root.querySelector(".pumpr-assistant-upload-remove"),
    mic: root.querySelector('[data-assistant-action="mic"]'),
    mute: root.querySelector('[data-assistant-action="mute"]'),
    toggle: root.querySelector('[data-assistant-action="toggle"]'),
    canvas: root.querySelector(".pumpr-assistant-companion-canvas"),
    head: root.querySelector(".pumpr-assistant-head")
  };

  dom.peek.addEventListener("click", () => togglePanel(true));
  dom.toggle.addEventListener("click", () => togglePanel(false));
  dom.mute.addEventListener("click", () => {
    assistantState.muted = !assistantState.muted;
    dom.root.classList.toggle("is-muted", assistantState.muted);
    dom.mute.textContent = assistantState.muted ? "Muted" : "Voice";
    persistState();
    if (assistantState.muted && "speechSynthesis" in window) window.speechSynthesis.cancel();
  });
  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitPrompt(dom.input.value);
  });
  dom.uploadBtn?.addEventListener("click", () => dom.uploadInput?.click());
  dom.uploadInput?.addEventListener("change", async (event) => {
    try {
      const file = event.target?.files?.[0];
      await uploadAssistantImage(file);
    } catch (error) {
      setStatus(error?.message || "Could not attach image.", "warning");
    }
  });
  dom.uploadRemove?.addEventListener("click", () => {
    clearAssistantUpload();
    setStatus("Attached image cleared.", "idle");
  });
  initDrag(dom.head);
  assistantDom = dom;
  renderAssistantUpload();
  renderLaunchDraft();
}

async function initThreeAvatar() {
  if (!assistantDom?.canvas) return;
  try {
    const THREE = await import("https://esm.sh/three@0.180.0");
    const { GLTFLoader } = await import("https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js");
    const { VRMLoaderPlugin } = await import("https://esm.sh/@pixiv/three-vrm@3.5.5?deps=three@0.180.0");

    const renderer = new THREE.WebGLRenderer({
      canvas: assistantDom.canvas,
      alpha: true,
      antialias: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(assistantDom.canvas.clientWidth || 240, assistantDom.canvas.clientHeight || 240, false);
    renderer.setClearColor(0x000000, 0);
    renderer.sortObjects = true;

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.08, 5.05);

    const ambient = new THREE.HemisphereLight(0xf5f9ff, 0x080b13, 1.95);
    const key = new THREE.DirectionalLight(0xffffff, 2.25);
    key.position.set(2.2, 4.6, 3.6);
    const rim = new THREE.PointLight(0x78ffd5, 16, 18, 2);
    rim.position.set(-2.4, 2.8, 2.6);
    const fill = new THREE.PointLight(0x9d7aff, 10, 16, 2);
    fill.position.set(2.6, 1.3, 1.8);
    scene.add(ambient, key, rim, fill);

    async function loadCandidate(candidate) {
      const loader = new GLTFLoader();
      if (candidate.type === "vrm") {
        loader.register((parser) => new VRMLoaderPlugin(parser));
      }
      const gltf = await new Promise((resolve, reject) => {
        loader.load(candidate.url, resolve, undefined, reject);
      });
      if (candidate.type === "vrm") {
        const vrm = gltf.userData.vrm;
        if (!vrm) throw new Error("VRM model did not load.");
        return {
          type: "vrm",
          root: vrm.scene,
          vrm,
          animations: []
        };
      }
      return {
        type: "gltf",
        root: gltf.scene,
        gltf,
        animations: Array.isArray(gltf.animations) ? gltf.animations : []
      };
    }

    let loadedAvatar = null;
    let lastError = null;
    for (const candidate of ASSISTANT_MODEL_CANDIDATES) {
      try {
        loadedAvatar = await loadCandidate(candidate);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!loadedAvatar?.root) throw lastError || new Error("Assistant avatar failed to load.");
    const avatarRoot = loadedAvatar.root;
    const vrm = loadedAvatar.vrm || null;
    scene.add(avatarRoot);
    avatarRoot.rotation.y = Math.PI;
    avatarRoot.position.set(0, -1.26, 0);
    avatarRoot.scale.setScalar(0.98);
    camera.lookAt(0, 0.44, 0);
    assistantDom.root.classList.add("assistant-3d-ready");

    let mixer = null;
    let idleAction = null;
    if (!vrm && loadedAvatar.animations?.length) {
      mixer = new THREE.AnimationMixer(avatarRoot);
      idleAction = mixer.clipAction(loadedAvatar.animations[0]);
      idleAction?.play();
    }

    let mood = assistantState.mood || "idle";
    let speaking = false;
    let start = performance.now();

    const moodColors = {
      idle: 0x67f2aa,
      happy: 0x7ef7d5,
      thinking: 0x72d6ff,
      excited: 0xff8db7,
      warning: 0xff6d9e,
      celebrate: 0xffd86b
    };

    function setMood(nextMood, nextSpeaking) {
      mood = nextMood || mood;
      speaking = Boolean(nextSpeaking);
      const hue = moodColors[mood] || moodColors.idle;
      rim.color.setHex(hue);
      fill.color.setHex(hue === moodColors.warning ? 0xffa3bd : 0x9d7aff);
    }

    function resize() {
      const width = assistantDom.canvas.clientWidth || 240;
      const height = assistantDom.canvas.clientHeight || 240;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    const renderFrame = () => {
      const elapsed = (performance.now() - start) / 1000;
      const activeGesture =
        companionGestureState.until > Date.now()
          ? companionGestureState
          : { kind: "idle", intensity: 0, until: 0 };
      const gestureStrength = activeGesture.intensity || 0;
      const idleBob = Math.sin(elapsed * 1.8) * 0.03;
      const bob = idleBob + Math.sin(elapsed * 4.8) * 0.016 * gestureStrength;
      const sway = Math.sin(elapsed * 0.9) * 0.09;
      const lean = Math.sin(elapsed * 1.25) * 0.04;
      const glanceX = Math.sin(elapsed * 0.46) * 0.18;
      const glanceY = Math.cos(elapsed * 0.32) * 0.08;
      let gestureNeckY = 0;
      let gestureNeckX = 0;
      let leftArmZ = 0.06 + Math.sin(elapsed * 1.4) * 0.04;
      let rightArmZ = -0.06 - Math.sin(elapsed * 1.4) * 0.04;
      let sceneTilt = 0;
      let bodyShiftX = 0;
      let happyValue = mood === "excited" ? 0.24 : 0.08;
      let relaxedValue = mood === "idle" ? 0.13 : 0.04;

      if (activeGesture.kind === "wave") {
        rightArmZ = -0.2 - Math.sin(elapsed * 5.6) * 0.3 * Math.max(gestureStrength, 0.4);
        gestureNeckY = 0.12;
        happyValue = 0.2;
      } else if (activeGesture.kind === "thinking") {
        gestureNeckY = -0.14;
        gestureNeckX = 0.08;
        leftArmZ = 0.18;
        sceneTilt = -0.08;
        bodyShiftX = -0.03;
        relaxedValue = 0.16;
      } else if (activeGesture.kind === "cheer") {
        leftArmZ = 0.42 + Math.sin(elapsed * 7.2) * 0.14;
        rightArmZ = -0.42 - Math.sin(elapsed * 7.2) * 0.14;
        gestureNeckY = 0.16;
        sceneTilt = Math.sin(elapsed * 5) * 0.04;
        happyValue = 0.34;
      } else if (activeGesture.kind === "focus") {
        gestureNeckX = 0.04;
        leftArmZ = 0.12;
        rightArmZ = -0.12;
        bodyShiftX = 0.02;
      } else if (activeGesture.kind === "concern") {
        gestureNeckY = -0.06;
        gestureNeckX = -0.1;
        leftArmZ = 0.12;
        rightArmZ = -0.18;
        sceneTilt = -0.05;
      }

      const lookX = Number(assistantDom.companion?.style.getPropertyValue("--look-x") || "0") || 0;
      const lookY = Number(assistantDom.companion?.style.getPropertyValue("--look-y") || "0") || 0;
      avatarRoot.position.y = -1.26 + bob;
      avatarRoot.position.x = bodyShiftX;
      avatarRoot.rotation.y = Math.PI + sway + sceneTilt + lookX * 0.18;
      avatarRoot.rotation.x = lookY * 0.06;

      if (vrm) {
        const neck = vrm.humanoid?.getNormalizedBoneNode("neck");
        if (neck) {
          neck.rotation.y = gestureNeckY + glanceX * 0.4 + lookX * 0.24;
          neck.rotation.x = gestureNeckX + glanceY * 0.18 + lean + lookY * 0.15;
        }

        const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
        const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
        if (leftUpperArm) leftUpperArm.rotation.z = leftArmZ;
        if (rightUpperArm) rightUpperArm.rotation.z = rightArmZ;

        if (vrm.expressionManager) {
          try {
            const blinkValue = Math.abs(Math.sin(elapsed * 0.48 + 0.7)) > 0.988 ? 1 : 0;
            const aaValue = speaking ? 0.22 + (Math.sin(elapsed * 11) + 1) * 0.18 : 0.02;
            vrm.expressionManager.setValue("blink", blinkValue);
            vrm.expressionManager.setValue("happy", happyValue);
            vrm.expressionManager.setValue("relaxed", relaxedValue);
            vrm.expressionManager.setValue("aa", aaValue);
          } catch {
            // Some third-party VRMs ship partial expression sets; keep rendering anyway.
          }
        }

        vrm.update(1 / 60);
      } else if (mixer) {
        mixer.update(1 / 60);
        if (idleAction) {
          idleAction.setEffectiveTimeScale(0.95 + Math.sin(elapsed * 0.6) * 0.05);
        }
        const shoulderTilt = Math.sin(elapsed * 1.2) * 0.04 + gestureStrength * 0.06;
        avatarRoot.rotation.z = shoulderTilt;
      }

      renderer.render(scene, camera);
      requestAnimationFrame(renderFrame);
    };

    resize();
    window.addEventListener("resize", resize);
    setMood(assistantState.mood || "idle", assistantState.speaking);
    renderFrame();

    assistantScene = { setMood };
  } catch (error) {
    window.__pumprAssistantAvatarError = String(error?.message || error || "unknown avatar error");
    console.warn("Pump-r Airi avatar fallback enabled.", error);
    assistantDom.root.classList.add("assistant-3d-fallback");
  }
}

function ensureWelcomeMessage() {
  if (assistantHistory.length) {
    renderHistory();
    renderQuickReplies(["Launch a token", "Set up RH Swap", "Draft a social post", "Open profile"]);
    return;
  }
  addHistory(
    "assistant",
    "Hey, I am Pump-r Airi. I am your live 3D copilot, I react to how you move through the app, and I can help with launches, swaps, social posts, and on-page guidance."
  );
  renderQuickReplies(["Launch a token", "Open RH Swap", "Draft a social post", "Edit my profile"]);
}

export function initPumprAssistant() {
  if (assistantBooted) return;
  assistantBooted = true;
  readStoredState();
  readHistory();
  readAssistantUpload();
  readLaunchDraft();
  buildAssistantDom();
  togglePanel(Boolean(assistantState.open));
  clampWindowPosition();
  initCompanionMotion();
  bindPageReactions();
  ensureWelcomeMessage();
  setStatus("Ready to guide the page.", assistantState.mood || "idle");
  initVoice();
  initThreeAvatar();
  runPendingActions();

  if ("speechSynthesis" in window && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => {
      assistantVoice = null;
      pickAssistantVoice();
    };
    pickAssistantVoice();
  }

  window.addEventListener("resize", clampWindowPosition);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && assistantState.open) togglePanel(false);
  });
}
