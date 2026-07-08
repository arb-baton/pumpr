import { api } from "./api.js?v=20260708rhswap11";
import {
  ethers,
  connectSolanaWallet,
  parseUiError,
  restoreWalletFromSession,
  shortAddress,
  solanaWalletState,
  walletState
} from "./core.js?v=20260706mobileauth";
import { initTopbarWalletProfile, setAlert, showCopyToast } from "./ui.js?v=20260706mobileauth";

const RH_WALLET_STORE_KEY = "pumpr.robinhood.wallets.v1";

const ui = {
  signInBtn: document.getElementById("signInBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletSelect: document.getElementById("walletChoice"),
  walletLabel: document.getElementById("walletAddress"),
  form: document.getElementById("rhswapForm"),
  amount: document.getElementById("rhswapAmount"),
  targetToken: document.getElementById("rhswapTargetToken"),
  openTokenPicker: document.getElementById("rhswapOpenTokenPicker"),
  pasteToken: document.getElementById("rhswapPasteToken"),
  tokenModal: document.getElementById("rhswapTokenModal"),
  tokenSearch: document.getElementById("rhswapTokenSearch"),
  tokenClose: document.getElementById("rhswapTokenClose"),
  tokenResults: document.getElementById("rhswapTokenResults"),
  selectedSymbol: document.getElementById("rhswapSelectedSymbol"),
  selectedMeta: document.getElementById("rhswapSelectedMeta"),
  tokenIcon: document.getElementById("rhswapTokenIcon"),
  pumprPrice: document.getElementById("rhswapPumprPrice"),
  marketIcon: document.getElementById("rhswapMarketIcon"),
  marketSymbol: document.getElementById("rhswapMarketSymbol"),
  marketChain: document.getElementById("rhswapMarketChain"),
  marketPrice: document.getElementById("rhswapMarketPrice"),
  useGenerated: document.getElementById("rhswapUseGenerated"),
  useExisting: document.getElementById("rhswapUseExisting"),
  generatedPanel: document.getElementById("rhswapGeneratedPanel"),
  existingPanel: document.getElementById("rhswapExistingPanel"),
  generatedAddress: document.getElementById("rhswapGeneratedAddress"),
  generatedMeta: document.getElementById("rhswapGeneratedMeta"),
  generateWallet: document.getElementById("rhswapGenerateWallet"),
  exportWallet: document.getElementById("rhswapExportWallet"),
  recipient: document.getElementById("rhswapRecipient"),
  status: document.getElementById("rhswapStatus"),
  gateStatus: document.getElementById("rhswapGateStatus"),
  gateMeta: document.getElementById("rhswapGateMeta"),
  quoteBtn: document.getElementById("rhswapQuoteBtn"),
  grossUsd: document.getElementById("rhswapGrossUsd"),
  netUsd: document.getElementById("rhswapNetUsd"),
  receiveAmount: document.getElementById("rhswapReceiveAmount"),
  minReceive: document.getElementById("rhswapMinReceive"),
  fee: document.getElementById("rhswapFee"),
  gas: document.getElementById("rhswapGas"),
  gasModel: document.getElementById("rhswapGasModel"),
  route: document.getElementById("rhswapRoute"),
  requestBtn: document.getElementById("rhswapRequestBtn"),
  progress: document.getElementById("rhswapProgress"),
  progressIcon: document.getElementById("rhswapProgressIcon"),
  progressTitle: document.getElementById("rhswapProgressTitle"),
  progressText: document.getElementById("rhswapProgressText"),
  progressEta: document.getElementById("rhswapProgressEta"),
  progressFill: document.getElementById("rhswapProgressFill"),
  progressMeta: document.getElementById("rhswapProgressMeta"),
  cancelProgress: document.getElementById("rhswapCancelProgress"),
  history: document.getElementById("rhswapHistory"),
  refreshHistory: document.getElementById("rhswapRefreshHistory"),
  keyModal: document.getElementById("rhswapKeyModal"),
  keyClose: document.getElementById("rhswapKeyClose"),
  keyDone: document.getElementById("rhswapKeyDone"),
  keyCopy: document.getElementById("rhswapCopyKey"),
  privateKey: document.getElementById("rhswapPrivateKey")
};

const state = {
  mode: "generated",
  quote: null,
  eligibility: null,
  controls: null,
  selectedToken: null,
  tokenResults: [],
  tokenLookupTimer: null,
  quoteTimer: null,
  pollTimer: null,
  activeRequest: null,
  quoteSeq: 0,
  autoQuoteEnabled: true
};

const FEATURED_TOKENS = [
  {
    name: "Paste a Robinhood Chain token contract",
    symbol: "0x...",
    token: "",
    chainId: "robinhood",
    priceUsd: 0,
    liquidityUsd: 0,
    helper: "Search by CA to resolve live name and price"
  }
];

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatUsd(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2
  }).format(n);
}

function formatCompactUsd(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 0.0001) return "<$0.0001";
  if (n < 1) return `$${n.toPrecision(4)}`;
  return formatUsd(n);
}

function formatAmount(value, max = 6) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: Math.abs(n) >= 1000 ? 2 : max
  });
}

function formatPct(value, max = 4) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

function normalizeRequestStatus(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (["complete", "completed", "settled", "executed"].includes(raw)) return "completed";
  if (["fail", "failed", "rejected", "error"].includes(raw)) return "failed";
  if (["awaiting_treasury", "ready", "ready_for_settlement"].includes(raw)) return "awaiting_treasury";
  if (["awaiting_deposit_signature", "signing", "awaiting_signature"].includes(raw)) return "awaiting_deposit_signature";
  if (["deposit_submitted", "confirming_deposit"].includes(raw)) return "deposit_submitted";
  if (["deposit_confirmed", "executing"].includes(raw)) return raw;
  if (["validating", "quoted", "quote_locked"].includes(raw)) return "validating";
  return raw || "queued";
}

function statusLabel(value = "") {
  const status = normalizeRequestStatus(value);
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "awaiting_deposit_signature") return "Sign";
  if (status === "deposit_submitted") return "Confirming";
  if (status === "deposit_confirmed") return "Confirmed";
  if (status === "executing") return "Sending";
  if (status === "awaiting_treasury") return "Ready";
  if (status === "validating") return "Checking";
  return "Queued";
}

function isTerminalStatus(value = "") {
  return ["completed", "failed", "awaiting_treasury"].includes(normalizeRequestStatus(value));
}

function isCompletedStatus(value = "") {
  return normalizeRequestStatus(value) === "completed";
}

function cleanTxHash(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9]/g, "");
}

function cleanEvmTxHash(value = "") {
  const raw = String(value || "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(raw) ? raw : "";
}

function robinhoodTxUrl(value = "") {
  const tx = cleanEvmTxHash(value);
  return tx ? `https://robinhoodchain.blockscout.com/tx/${tx}` : "";
}

function solscanTxUrl(value = "") {
  const tx = cleanTxHash(value);
  return tx ? `https://solscan.io/tx/${tx}` : "";
}

function progressTitleFor(row = {}) {
  const status = normalizeRequestStatus(row.status);
  const directRoute = String(row.routeProvider || "").toLowerCase() === "lifi-direct";
  if (status === "completed") return "Swap completed";
  if (status === "failed") return "Swap needs attention";
  if (status === "awaiting_deposit_signature") return directRoute ? "Sign PUMPR swap" : "Sign PUMPR deposit";
  if (status === "deposit_submitted") return directRoute ? "Submitting route" : "Confirming deposit";
  if (status === "deposit_confirmed") return "Deposit confirmed";
  if (status === "executing") return directRoute ? "Routing RH token" : "Sending RH token";
  if (status === "awaiting_treasury") return "Ready for treasury execution";
  if (status === "validating") return "Validating swap";
  return "Swap queued";
}

function progressMetaFor(row = {}) {
  const status = normalizeRequestStatus(row.status);
  const id = row.id || row.quoteId || "";
  const directRoute = String(row.routeProvider || "").toLowerCase() === "lifi-direct";
  if (status === "completed") {
    if (row.destinationTx) return `Robinhood transaction: ${shortAddress(row.destinationTx)}`;
    if (row.executionTx) return `Route transaction: ${shortAddress(row.executionTx)}`;
    return "Completed. Tokens were sent to the destination wallet.";
  }
  if (status === "failed") return row.error || "This request stopped before execution.";
  if (status === "awaiting_deposit_signature") {
    return row.solanaGasSponsored
      ? "Dev wallet can back SOL gas only. Phantom signs the PUMPR deposit from your wallet."
      : "Phantom will ask your connected wallet to sign the PUMPR deposit.";
  }
  if (status === "deposit_submitted") {
    if (directRoute) return row.depositSignature ? `User-wallet route: ${shortAddress(row.depositSignature)}` : "Waiting for Solana route confirmation.";
    return row.depositSignature ? `Solana deposit: ${shortAddress(row.depositSignature)}` : "Waiting for Solana confirmation.";
  }
  if (status === "deposit_confirmed") return "PUMPR deposit confirmed. RH payout is next.";
  if (status === "executing") return directRoute ? "LI.FI is routing your signed wallet swap to Robinhood Chain." : "Treasury is sending the selected Robinhood Chain token.";
  if (status === "awaiting_treasury") return `Request ${id ? shortAddress(id) : "is"} is ready. Settlement executor still needs to send the RH tokens.`;
  return `Request ${id ? shortAddress(id) : "is"} is being checked. Keep this page open for live updates.`;
}

function progressMetaHtml(row = {}) {
  const status = normalizeRequestStatus(row.status);
  const text = progressMetaFor(row);
  if (status !== "completed") return escapeHtml(text);
  const rhUrl = robinhoodTxUrl(row.destinationTx || "");
  const routeUrl = solscanTxUrl(row.executionTx || row.bridgeTx || "");
  const links = [];
  if (rhUrl) {
    links.push(`<a href="${escapeHtml(rhUrl)}" target="_blank" rel="noopener noreferrer">Robinhood explorer</a>`);
  }
  if (routeUrl) {
    links.push(`<a href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer">Route tx</a>`);
  }
  return `${escapeHtml(text)}${links.length ? ` <span class="rhswap-tx-links">${links.join(" ")}</span>` : ""}`;
}

function renderProgress(row = null, options = {}) {
  if (!ui.progress) return;
  const active = row || state.activeRequest;
  if (!active && !options.force) {
    ui.progress.hidden = true;
    return;
  }
  const status = normalizeRequestStatus(active?.status || options.status || "validating");
  const pct = Math.max(5, Math.min(100, Number(active?.progressPct ?? options.progressPct ?? 16) || 16));
  const eta = Number(active?.estimatedSeconds ?? options.estimatedSeconds ?? 15);
  ui.progress.hidden = false;
  ui.progress.classList.toggle("is-complete", status === "completed");
  ui.progress.classList.toggle("is-failed", status === "failed");
  if (ui.progressTitle) ui.progressTitle.textContent = options.title || progressTitleFor(active || { status });
  if (ui.progressText) ui.progressText.textContent = active?.statusMessage || options.text || "Quote and wallet are being checked.";
  if (ui.progressEta) {
    ui.progressEta.textContent = status === "completed" ? "Done" : status === "failed" ? "Stopped" : eta > 0 ? `~${eta}s` : "Live";
  }
  if (ui.progressFill) ui.progressFill.style.width = `${pct}%`;
  if (ui.progressMeta) ui.progressMeta.innerHTML = progressMetaHtml(active || { status });
  const order = ["awaiting_deposit_signature", "deposit_submitted", "executing", "completed"];
  const activeIndex = Math.max(0, order.indexOf(status));
  document.querySelectorAll("[data-rhswap-step]").forEach((step) => {
    const index = order.indexOf(step.dataset.rhswapStep || "");
    step.classList.toggle("is-active", index === activeIndex);
    step.classList.toggle("is-done", index >= 0 && index < activeIndex);
  });
}

function resetActiveSwap(message = "Ready for a new swap.") {
  stopPolling();
  state.activeRequest = null;
  if (ui.progress) ui.progress.hidden = true;
  setAlert(ui.status, message);
  renderQuote();
}

function stopPolling() {
  window.clearTimeout(state.pollTimer);
  state.pollTimer = null;
}

function swapGateNumbers(payload = {}) {
  const minPct = Number(payload.swapMinHolderPct ?? payload.minHolderPct ?? 0.1) || 0.1;
  const holderPct = Math.max(0, Number(payload.holderPct || 0) || 0);
  const balanceTokens = Math.max(0, Number(payload.balanceTokens || 0) || 0);
  let supplyTokens = Math.max(0, Number(payload.supplyTokens || 0) || 0);
  try {
    const supplyRaw = BigInt(String(payload.supplyRaw || "0"));
    const balanceRaw = BigInt(String(payload.balanceRaw || "0"));
    if ((!Number.isFinite(supplyTokens) || supplyTokens <= 0) && supplyRaw > 0n && balanceRaw > 0n && balanceTokens > 0) {
      supplyTokens = balanceTokens * (Number(supplyRaw) / Number(balanceRaw));
    }
  } catch {
    supplyTokens = 0;
  }
  if (!Number.isFinite(supplyTokens) || supplyTokens <= 0) {
    supplyTokens = holderPct > 0 ? (balanceTokens * 100) / holderPct : 0;
  }
  const requiredTokens = supplyTokens > 0 ? supplyTokens * (minPct / 100) : 0;
  const shortfallTokens = Math.max(0, requiredTokens - balanceTokens);
  return { minPct, holderPct, balanceTokens, supplyTokens, requiredTokens, shortfallTokens };
}

function tokenLetter(symbol = "RH") {
  return String(symbol || "RH").replace(/^\$/, "").slice(0, 2).toUpperCase() || "RH";
}

function safeImageUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function tokenAvatarMarkup(token = {}, fallback = "RH") {
  const imageUrl = safeImageUrl(token?.imageUrl || token?.logoURI || token?.logoUrl || "");
  const letters = tokenLetter(token?.symbol || fallback);
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${escapeHtml(letters)}'))" />`;
  }
  return escapeHtml(letters);
}

function normalizeEvmAddress(value = "") {
  try {
    return ethers.getAddress(String(value || "").trim());
  } catch {
    return "";
  }
}

async function loadSolanaWeb3() {
  if (window.solanaWeb3?.Transaction) return window.solanaWeb3;
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
  if (!window.solanaWeb3?.Transaction) throw new Error("Solana web3 library did not initialize");
  return window.solanaWeb3;
}

function base64ToBytes(value = "") {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes = new Uint8Array()) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(Number(byte || 0));
  return btoa(binary);
}

function serializeSignedSolanaTransaction(transaction) {
  try {
    return bytesToBase64(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
  } catch {
    return bytesToBase64(transaction.serialize());
  }
}

function deserializeSolanaTransaction(solanaWeb3, bytes) {
  try {
    return solanaWeb3.Transaction.from(bytes);
  } catch (legacyError) {
    if (solanaWeb3.VersionedTransaction) {
      try {
        return solanaWeb3.VersionedTransaction.deserialize(bytes);
      } catch {
        // Keep the original parser error for clearer wallet/debug messages.
      }
    }
    throw legacyError;
  }
}

function signGeneratedSolanaTransaction(transaction, keypair) {
  if (transaction?.version !== undefined && typeof transaction.sign === "function") {
    transaction.sign([keypair]);
    return serializeSignedSolanaTransaction(transaction);
  }
  if (typeof transaction.partialSign === "function") {
    transaction.partialSign(keypair);
    return serializeSignedSolanaTransaction(transaction);
  }
  throw new Error("This Solana transaction format is not supported by the generated wallet.");
}

async function signSolanaTransactionBase64(transactionBase64 = "") {
  const wallet = solanaWalletState();
  const provider = wallet.provider || (await connectSolanaWallet({ requirePrompt: true }))?.provider;
  if (!provider) throw new Error("Connect Phantom or a generated Solana wallet first.");
  const solanaWeb3 = await loadSolanaWeb3();
  const transaction = deserializeSolanaTransaction(solanaWeb3, base64ToBytes(transactionBase64));
  if (provider.keypair) {
    return signGeneratedSolanaTransaction(transaction, provider.keypair);
  }
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This Solana wallet cannot sign transactions. Use Phantom for real swaps.");
  }
  const signed = await provider.signTransaction(transaction);
  return serializeSignedSolanaTransaction(signed);
}

function connectedSolanaAddress() {
  const ws = walletState();
  const sol = solanaWalletState();
  return String(ws.generatedWallet?.address || ws.solanaAddress || sol.address || "").trim();
}

function readWalletStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RH_WALLET_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeWalletStore(store = {}) {
  try {
    localStorage.setItem(RH_WALLET_STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("pumpr:rhWalletChanged"));
  } catch {
    // Ignore storage failures.
  }
}

function walletKey() {
  return connectedSolanaAddress() || "guest";
}

function getSavedDestination() {
  const store = readWalletStore();
  return store[walletKey()] || null;
}

function saveDestination(row = {}) {
  const key = walletKey();
  if (!key || key === "guest") throw new Error("Connect a Solana wallet before saving a Robinhood wallet.");
  const store = readWalletStore();
  store[key] = {
    ...store[key],
    ...row,
    ownerSolana: key,
    updatedAt: Date.now()
  };
  writeWalletStore(store);
  return store[key];
}

function renderDestination() {
  const saved = getSavedDestination();
  const hasGenerated = Boolean(saved?.type === "generated" && saved.address && saved.privateKey);
  if (ui.generatedAddress) {
    ui.generatedAddress.textContent = hasGenerated ? saved.address : "No wallet generated yet";
  }
  if (ui.generatedMeta) {
    ui.generatedMeta.textContent = hasGenerated
      ? `Saved to this profile - ${shortAddress(saved.address)}`
      : "Create a fresh wallet for this profile.";
  }
  if (ui.exportWallet) ui.exportWallet.disabled = !hasGenerated;
  if (ui.recipient && saved?.type === "existing" && saved.address) {
    ui.recipient.value = saved.address;
  }
}

function activeRecipient() {
  if (state.mode === "generated") {
    const saved = getSavedDestination();
    return saved?.type === "generated" ? normalizeEvmAddress(saved.address) : "";
  }
  return normalizeEvmAddress(ui.recipient?.value || "");
}

function ensureGeneratedDestination() {
  const existing = activeRecipient();
  if (existing) return existing;
  if (state.mode !== "generated") return "";
  if (!connectedSolanaAddress()) throw new Error("Connect a Solana wallet first.");
  const wallet = ethers.Wallet.createRandom();
  saveDestination({
    type: "generated",
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || "",
    createdAt: Date.now()
  });
  renderDestination();
  window.dispatchEvent(new CustomEvent("pumpr:rhWalletChanged"));
  return wallet.address;
}

function canSubmitDestination() {
  if (activeRecipient()) return true;
  return state.mode === "generated" && Boolean(connectedSolanaAddress());
}

function setMode(mode) {
  state.mode = mode === "existing" ? "existing" : "generated";
  ui.useGenerated?.classList.toggle("active", state.mode === "generated");
  ui.useExisting?.classList.toggle("active", state.mode === "existing");
  if (ui.generatedPanel) ui.generatedPanel.hidden = state.mode !== "generated";
  if (ui.existingPanel) ui.existingPanel.hidden = state.mode !== "existing";
  state.quote = null;
  renderQuote();
}

function renderQuote() {
  const quote = state.quote;
  const gateLocked = state.eligibility && state.eligibility.eligibleForSwap === false;
  const requestActive = state.activeRequest && !isTerminalStatus(state.activeRequest.status);
  const hasReceiveValue = Boolean(
    quote &&
      Number(quote.netUsd || 0) > 0 &&
      Number(quote.minimumTargetTokens || quote.estimatedTargetTokens || 0) > 0
  );
  if (ui.requestBtn) {
    const destinationReady = canSubmitDestination();
    ui.requestBtn.disabled = requestActive || gateLocked || !quote || !destinationReady || !hasReceiveValue;
    ui.requestBtn.title = !quote
      ? "Get a live quote first."
      : !destinationReady
      ? (state.mode === "existing" ? "Enter a valid Robinhood Chain receive wallet." : "Connect a Solana wallet first.")
      : !hasReceiveValue
      ? "Increase the PUMPR amount so the received token amount is above zero after fees and gas."
      : "";
  }
  if (ui.quoteBtn) ui.quoteBtn.disabled = Boolean(gateLocked);
  if (!quote) {
    if (ui.grossUsd) ui.grossUsd.textContent = "$0.00";
    if (ui.netUsd) ui.netUsd.textContent = "$0.00";
    if (ui.receiveAmount) ui.receiveAmount.textContent = "-";
    if (ui.minReceive) ui.minReceive.textContent = "-";
    if (ui.fee) ui.fee.textContent = "-";
    if (ui.gas) ui.gas.textContent = "-";
    if (ui.gasModel) ui.gasModel.textContent = "Powered by $PUMPR";
    if (ui.route) ui.route.textContent = "PUMPR -> RH token";
    if (ui.pumprPrice) ui.pumprPrice.textContent = "Live";
    return;
  }
  const symbol = quote?.target?.symbol || "TOKEN";
  const solanaSponsored = Boolean(quote?.gasModel?.solanaGasSponsored);
  if (ui.grossUsd) ui.grossUsd.textContent = formatUsd(quote.grossUsd);
  if (ui.netUsd) ui.netUsd.textContent = formatUsd(quote.netUsd);
  if (ui.receiveAmount) ui.receiveAmount.textContent = `${formatAmount(quote.estimatedTargetTokens)} ${symbol}`;
  if (ui.minReceive) ui.minReceive.textContent = `${formatAmount(quote.minimumTargetTokens)} ${symbol}`;
  if (ui.fee) ui.fee.textContent = `${Number(quote?.fees?.feeBps || 0) / 100}% (${formatUsd(quote?.fees?.platformFeeUsd || 0)})`;
  if (ui.gas) ui.gas.textContent = `${formatUsd(quote?.fees?.gasUsd || 0)} deducted`;
  if (ui.gasModel) {
    ui.gasModel.textContent = solanaSponsored
      ? "$PUMPR route + sponsored SOL gas"
      : "$PUMPR route; tiny SOL needed";
  }
  if (ui.route) ui.route.textContent = `$PUMPR -> ${symbol} on ${quote?.target?.expectedChain || "Robinhood"}`;
  if (ui.pumprPrice) ui.pumprPrice.textContent = formatCompactUsd(quote?.pumpr?.priceUsd || 0);
  setSelectedToken(quote.target, { silent: true });
}

function setGate(payload = null, error = "") {
  state.eligibility = payload;
  if (error) {
    if (ui.gateStatus) ui.gateStatus.textContent = "Locked";
    if (ui.gateMeta) ui.gateMeta.textContent = error;
    ui.gateMeta?.classList.add("rhswap-gate-locked");
    if (ui.quoteBtn) ui.quoteBtn.disabled = false;
    if (ui.requestBtn) ui.requestBtn.disabled = true;
    return;
  }
  if (!payload) {
    if (ui.gateStatus) ui.gateStatus.textContent = "Connect wallet";
    if (ui.gateMeta) ui.gateMeta.textContent = "0.1% $PUMPR minimum";
    ui.gateMeta?.classList.remove("rhswap-gate-locked", "rhswap-gate-unlocked");
    if (ui.quoteBtn) ui.quoteBtn.disabled = false;
    return;
  }
  const gate = swapGateNumbers(payload);
  const symbol = payload.symbol || "PUMPR";
  const unlocked = Boolean(payload.eligibleForSwap);
  if (ui.gateStatus) ui.gateStatus.textContent = unlocked
    ? (payload.rhSwapTestBypass ? "Unlocked for testing" : "Unlocked")
    : `Locked - need ${formatPct(gate.minPct, 4)}%`;
  if (ui.gateMeta) {
    ui.gateMeta.classList.toggle("rhswap-gate-locked", !unlocked);
    ui.gateMeta.classList.toggle("rhswap-gate-unlocked", unlocked);
    ui.gateMeta.textContent = unlocked
      ? `${formatPct(gate.holderPct, 4)}% held - ${formatAmount(gate.balanceTokens, 2)} $${symbol}. ${payload.rhSwapTestBypass ? "Test wallet bypass is enabled for this wallet." : "Swap unlocked."}`
      : `Hold at least ${formatPct(gate.minPct, 4)}% of $${symbol} supply to use this feature. You hold ${formatPct(gate.holderPct, 4)}% (${formatAmount(gate.balanceTokens, 2)} $${symbol}). Need about ${formatAmount(gate.requiredTokens, 2)} $${symbol}${gate.shortfallTokens > 0 ? `, add ${formatAmount(gate.shortfallTokens, 2)} more` : ""}.`;
  }
  if (ui.quoteBtn) ui.quoteBtn.disabled = !unlocked;
  if (ui.requestBtn && !unlocked) ui.requestBtn.disabled = true;
}

async function refreshGate() {
  const solanaAddress = connectedSolanaAddress();
  if (!solanaAddress) {
    setGate(null);
    return null;
  }
  try {
    const holder = await api.rhSwapEligibility(solanaAddress);
    setGate(holder);
    return holder;
  } catch (error) {
    setGate(null, parseUiError(error));
    return null;
  }
}

function showKeyModal(privateKey = "") {
  if (!ui.keyModal || !ui.privateKey) return;
  ui.privateKey.value = privateKey;
  ui.keyModal.classList.add("open");
  ui.keyModal.setAttribute("aria-hidden", "false");
  ui.privateKey.focus();
  ui.privateKey.select();
}

function hideKeyModal() {
  if (!ui.keyModal || !ui.privateKey) return;
  ui.keyModal.classList.remove("open");
  ui.keyModal.setAttribute("aria-hidden", "true");
  ui.privateKey.value = "";
}

function selectedTokenAddress() {
  return normalizeEvmAddress(ui.targetToken?.value || state.selectedToken?.token || "");
}

function currentAmountPumpr() {
  return Number(String(ui.amount?.value || "").replace(/,/g, "").trim());
}

function canAutoQuote() {
  return Boolean(
    state.autoQuoteEnabled &&
      connectedSolanaAddress() &&
      selectedTokenAddress() &&
      Number.isFinite(currentAmountPumpr()) &&
      currentAmountPumpr() > 0 &&
      state.eligibility &&
      state.eligibility.eligibleForSwap !== false
  );
}

function scheduleAutoQuote(reason = "input") {
  window.clearTimeout(state.quoteTimer);
  state.quote = null;
  renderQuote();
  if (!canAutoQuote()) return;
  state.quoteTimer = window.setTimeout(() => {
    quoteSwap({ requireRecipient: false, silent: true, source: reason }).catch((error) => {
      state.quote = null;
      renderQuote();
      setAlert(ui.status, parseUiError(error), true);
    });
  }, 520);
}

function setSelectedToken(token = {}, options = {}) {
  const address = normalizeEvmAddress(token?.token || token?.address || ui.targetToken?.value || "");
  const symbol = String(token?.symbol || (address ? "TOKEN" : "Select token")).replace(/^\$/, "").toUpperCase();
  const name = String(token?.name || token?.helper || (address ? "Robinhood Chain token" : "Paste or search a token contract"));
  state.selectedToken = address
    ? {
        ...token,
        token: address,
        symbol,
        name
      }
    : null;
  if (ui.targetToken && address) ui.targetToken.value = address;
  if (ui.selectedSymbol) ui.selectedSymbol.textContent = address ? symbol : "Select token";
  if (ui.selectedMeta) {
    ui.selectedMeta.textContent = address
      ? `${name} - ${shortAddress(address)}${token?.chainId ? ` - ${token.chainId}` : ""}`
      : "Paste or search a Robinhood Chain token contract.";
  }
  const letters = tokenLetter(address ? symbol : "RH");
  if (ui.tokenIcon) ui.tokenIcon.innerHTML = tokenAvatarMarkup(address ? state.selectedToken : {}, letters);
  if (ui.marketIcon) ui.marketIcon.innerHTML = tokenAvatarMarkup(address ? state.selectedToken : {}, letters);
  if (ui.marketSymbol) ui.marketSymbol.textContent = address ? symbol : "Robinhood token";
  if (ui.marketChain) ui.marketChain.textContent = address ? `${name} - ${shortAddress(address)}` : "Waiting for CA";
  if (ui.marketPrice) ui.marketPrice.textContent = address ? formatCompactUsd(token?.priceUsd || 0) : "-";
  if (!options.silent) {
    scheduleAutoQuote("token");
  }
}

function tokenRow(token = {}, index = 0) {
  const address = normalizeEvmAddress(token.token || token.address || "");
  const symbol = String(token.symbol || "TOKEN").replace(/^\$/, "").toUpperCase();
  const name = String(token.name || token.helper || "Robinhood Chain token");
  const disabled = !address;
  return `
    <button class="rhswap-token-result${disabled ? " is-helper" : ""}" type="button" data-token-index="${index}" ${disabled ? "disabled" : ""}>
      <span class="rhswap-token-letter">${tokenAvatarMarkup(token, symbol)}</span>
      <span>
        <strong>${escapeHtml(symbol)}</strong>
        <small>${escapeHtml(name)}${address ? ` - ${escapeHtml(shortAddress(address))}` : ""}</small>
      </span>
      <em>${escapeHtml(formatCompactUsd(token.priceUsd || 0))}</em>
    </button>
  `;
}

function renderTokenResults(tokens = FEATURED_TOKENS, message = "") {
  if (!ui.tokenResults) return;
  state.tokenResults = Array.isArray(tokens) ? tokens : [];
  const rows = tokens.length ? tokens.map(tokenRow).join("") : "";
  ui.tokenResults.innerHTML = `
    ${message ? `<p class="rhswap-token-message">${escapeHtml(message)}</p>` : ""}
    ${rows}
  `;
}

function openTokenModal() {
  if (!ui.tokenModal) return;
  ui.tokenModal.classList.add("open");
  ui.tokenModal.setAttribute("aria-hidden", "false");
  renderTokenResults(FEATURED_TOKENS);
  window.setTimeout(() => ui.tokenSearch?.focus(), 20);
}

function closeTokenModal() {
  if (!ui.tokenModal) return;
  ui.tokenModal.classList.remove("open");
  ui.tokenModal.setAttribute("aria-hidden", "true");
}

async function lookupToken(rawValue = "") {
  const query = String(rawValue || "").trim();
  const token = normalizeEvmAddress(query);
  if (!query) {
    renderTokenResults(FEATURED_TOKENS);
    return;
  }
  renderTokenResults([], "Searching live token data...");
  try {
    if (token) {
      const payload = await api.rhSwapToken(token);
      const meta = payload?.token || {};
      setSelectedToken(meta);
      renderTokenResults([meta], meta.chainMatched === false ? "Found a token, but confirm it is on Robinhood Chain before settlement." : "Live token found.");
      return;
    }
    const payload = await api.rhSwapSearch(query, 12);
    const rows = Array.isArray(payload?.tokens) ? payload.tokens : [];
    if (!rows.length) {
      renderTokenResults([], `No live tokens found for "${query}". Try the contract address.`);
      return;
    }
    renderTokenResults(
      rows,
      rows.some((row) => row.chainMatched) ? "Live token matches found." : "Showing closest live matches. Confirm the token is on Robinhood Chain before settlement."
    );
  } catch (error) {
    renderTokenResults([], parseUiError(error));
  }
}

function renderHistoryRows(rows = []) {
  if (!ui.history) return;
  if (!rows.length) {
    ui.history.innerHTML = `<p class="muted">No Robinhood swap requests yet.</p>`;
    return;
  }
  ui.history.innerHTML = rows
    .slice(0, 25)
    .map((row) => {
      const symbol = row.targetSymbol || "TOKEN";
      const status = normalizeRequestStatus(row.status);
      const pillClass = status === "completed" ? "is-completed" : status === "failed" ? "is-failed" : "is-pending";
      const timeLabel = row.createdAt ? new Date(Number(row.createdAt || 0) * 1000).toLocaleString() : "just now";
      const rhUrl = robinhoodTxUrl(row.destinationTx || "");
      const routeUrl = solscanTxUrl(row.executionTx || row.bridgeTx || "");
      const txLinks = [
        rhUrl ? `<a href="${escapeHtml(rhUrl)}" target="_blank" rel="noopener noreferrer">Robinhood tx</a>` : "",
        routeUrl ? `<a href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener noreferrer">Route tx</a>` : ""
      ].filter(Boolean).join("");
      return `
        <article class="rhswap-history-row">
          <div class="rhswap-history-main">
            <div class="rhswap-history-line">
              <strong>${escapeHtml(formatAmount(row.amountPumpr, 2))} $PUMPR -> ${escapeHtml(formatAmount(row.estimatedTargetTokens, 6))} ${escapeHtml(symbol)}</strong>
              <em class="rhswap-status-pill ${pillClass}">${escapeHtml(statusLabel(status))}</em>
            </div>
            <span>${escapeHtml(shortAddress(row.recipient || ""))} - ${escapeHtml(row.stage || row.statusMessage || "Swap queue")} - ${escapeHtml(timeLabel)}</span>
            ${txLinks ? `<div class="rhswap-history-links">${txLinks}</div>` : ""}
          </div>
          <b>${escapeHtml(formatUsd(row.netUsd || 0))}</b>
        </article>
      `;
    })
    .join("");
}

async function loadHistory() {
  const solanaAddress = connectedSolanaAddress();
  const saved = getSavedDestination();
  const wallet = solanaAddress || saved?.address || "";
  if (!wallet) {
    renderHistoryRows([]);
    return;
  }
  try {
    const payload = await api.rhSwapRequests(wallet);
    const rows = Array.isArray(payload?.requests) ? payload.requests : [];
    renderHistoryRows(rows);
    const recentLive = rows.find((row) => {
      const age = Math.floor(Date.now() / 1000) - Number(row.createdAt || 0);
      const status = normalizeRequestStatus(row.status);
      return age < 15 * 60 && !["completed", "failed", "awaiting_deposit_signature"].includes(status);
    });
    if (!state.activeRequest && recentLive) {
      state.activeRequest = recentLive;
      renderProgress(recentLive);
      if (!isTerminalStatus(recentLive.status)) startRequestPolling(recentLive.id);
    }
  } catch (error) {
    if (ui.history) ui.history.innerHTML = `<p class="muted">${escapeHtml(parseUiError(error))}</p>`;
  }
}

async function pollRequestStatus(id, options = {}) {
  const requestId = String(id || "").trim();
  if (!requestId) return null;
  const wallet = connectedSolanaAddress() || activeRecipient() || "";
  const payload = await api.rhSwapRequestStatus(requestId, wallet);
  const request = payload?.request || null;
  if (!request) return null;
  state.activeRequest = request;
  renderProgress(request);
  await loadHistory();
  if (isCompletedStatus(request.status)) {
    setAlert(ui.status, `Swap completed: ${formatAmount(request.estimatedTargetTokens, 6)} ${request.targetSymbol || "TOKEN"} sent to ${shortAddress(request.recipient || "")}.`);
  } else if (normalizeRequestStatus(request.status) === "failed") {
    setAlert(ui.status, request.statusMessage || request.error || "Swap failed before execution.", true);
  } else if (normalizeRequestStatus(request.status) === "awaiting_treasury") {
    setAlert(ui.status, `Swap request ready: ${request.id}. Waiting for treasury executor; no tokens moved yet.`);
  } else if (!options.silent) {
    setAlert(ui.status, `${request.stage || "Swap queue"}: ${request.statusMessage || "Checking live status..."}`);
  }
  return request;
}

function startRequestPolling(id) {
  stopPolling();
  const requestId = String(id || "").trim();
  if (!requestId) return;
  let pollCount = 0;
  const tick = async () => {
    pollCount += 1;
    try {
      const request = await pollRequestStatus(requestId, { silent: pollCount > 1 });
      const status = normalizeRequestStatus(request?.status);
      if (status === "completed" || status === "failed" || status === "awaiting_treasury") {
        stopPolling();
        renderQuote();
        return;
      }
    } catch (error) {
      setAlert(ui.status, parseUiError(error), true);
      if (pollCount > 4) {
        stopPolling();
        return;
      }
    }
    const delay = pollCount < 6 ? 1500 : pollCount < 16 ? 3000 : 6000;
    state.pollTimer = window.setTimeout(tick, delay);
  };
  state.pollTimer = window.setTimeout(tick, 900);
}

async function quoteSwap(options = {}) {
  const requireRecipient = options.requireRecipient === true;
  const silent = options.silent === true;
  const seq = ++state.quoteSeq;
  const solanaAddress = connectedSolanaAddress();
  if (!solanaAddress) throw new Error("Sign in with a Solana wallet first.");
  const recipient = activeRecipient();
  if (requireRecipient && state.mode === "generated" && !recipient) throw new Error("Generate a Robinhood wallet first.");
  if (requireRecipient && state.mode === "existing" && !recipient) throw new Error("Enter a valid Robinhood Chain wallet.");
  const targetToken = selectedTokenAddress();
  if (!targetToken) throw new Error("Enter a valid Robinhood Chain token contract.");
  const amountPumpr = String(ui.amount?.value || "").trim();
  if (!Number.isFinite(currentAmountPumpr()) || currentAmountPumpr() <= 0) throw new Error("Enter a PUMPR amount to swap.");
  if (silent) setAlert(ui.status, "Updating quote...");
  const quote = await api.rhSwapQuote({
    solanaAddress,
    recipient,
    amountPumpr,
    targetToken
  });
  if (seq !== state.quoteSeq) return state.quote;
  state.quote = quote;
  setGate(quote.holderEligibility);
  setSelectedToken(quote.target, { silent: true });
  renderQuote();
  if (silent) {
    const warnings = state.quote?.warnings?.length ? ` ${state.quote.warnings[0]}` : "";
    if (Number(state.quote?.netUsd || 0) <= 0 || Number(state.quote?.minimumTargetTokens || 0) <= 0) {
      setAlert(ui.status, "Amount is too small after fee and RH gas reserve. Try a larger PUMPR amount.", true);
    } else {
      setAlert(ui.status, `Live quote updated.${warnings}`);
    }
  }
  return quote;
}

async function createSwapRequest() {
  if (state.mode === "generated" && !activeRecipient()) {
    const generated = ensureGeneratedDestination();
    setAlert(ui.status, `Generated Robinhood receive wallet ${shortAddress(generated)}. Preparing swap...`);
  }
  if (!state.quote) await quoteSwap({ requireRecipient: true });
  if (Number(state.quote?.netUsd || 0) <= 0 || Number(state.quote?.minimumTargetTokens || 0) <= 0) {
    throw new Error("Amount is too small after platform fee and Robinhood gas reserve. Increase the PUMPR amount before submitting.");
  }
  const recipient = activeRecipient();
  if (!recipient) throw new Error("Choose a Robinhood destination wallet first.");
  if (state.mode === "existing") {
    saveDestination({ type: "existing", address: recipient });
  }
  renderProgress({
    status: "awaiting_deposit_signature",
    progressPct: 16,
    estimatedSeconds: 30,
    statusMessage: "Preparing the user-wallet PUMPR swap transaction."
  }, { force: true });
  const prepared = await api.rhSwapPrepare({
    solanaAddress: connectedSolanaAddress(),
    recipient,
    recipientType: state.mode,
    amountPumpr: ui.amount?.value || "",
    targetToken: ui.targetToken?.value || "",
    note: "Real Robinhood Chain swap"
  });
  state.quote = prepared.quote || state.quote;
  state.activeRequest = prepared.request || null;
  renderProgress(state.activeRequest || {
    status: "awaiting_deposit_signature",
    progressPct: 18,
    estimatedSeconds: 30,
    solanaGasSponsored: Boolean(prepared.deposit?.solanaGasSponsored || prepared.quote?.gasModel?.solanaGasSponsored),
    statusMessage: prepared.deposit?.directRoute
      ? "Open Phantom and sign the PUMPR swap from your connected wallet."
      : prepared.deposit?.solanaGasSponsored || prepared.quote?.gasModel?.solanaGasSponsored
        ? "Open Phantom and sign the PUMPR deposit. Pump-r is sponsoring Solana gas."
        : "Open Phantom and sign the PUMPR deposit. This wallet may need a tiny SOL network fee."
  });
  renderQuote();
  await loadHistory();
  if (!prepared.transactionBase64) throw new Error("Backend did not return a Solana swap transaction.");
  setAlert(
    ui.status,
    prepared.deposit?.directRoute
      ? "Open Phantom to sign the PUMPR swap from your wallet. Dev wallet only backs SOL gas if needed."
      : prepared.deposit?.solanaGasSponsored || prepared.quote?.gasModel?.solanaGasSponsored
      ? "Open Phantom to sign the PUMPR deposit. Pump-r sponsors Solana gas; RH gas is reserved from the PUMPR quote."
      : "Open Phantom to sign the PUMPR deposit. RH gas is reserved from the quote; this wallet pays the tiny Solana network fee."
  );
  const signedTransactionBase64 = await signSolanaTransactionBase64(prepared.transactionBase64);
  renderProgress({
    ...(prepared.request || {}),
    status: "deposit_submitted",
    progressPct: 34,
    estimatedSeconds: 18,
    statusMessage: prepared.deposit?.directRoute ? "Broadcasting user-wallet PUMPR swap..." : "Broadcasting Solana PUMPR deposit..."
  }, { force: true });
  const sent = await api.solanaSendTransaction({ signedTransactionBase64 });
  const depositSignature = String(sent?.signature || sent?.txid || "");
  if (!depositSignature) throw new Error(`${prepared.deposit?.directRoute ? "Solana swap route" : "Solana deposit"} broadcast did not return a signature.`);
  state.activeRequest = {
    ...(prepared.request || {}),
    depositSignature,
    status: "deposit_submitted",
    progressPct: 42,
    estimatedSeconds: 15,
    statusMessage: prepared.deposit?.directRoute ? "PUMPR swap broadcast. Waiting for Robinhood delivery." : "PUMPR deposit broadcast. Waiting for confirmation."
  };
  renderProgress(state.activeRequest);
  setAlert(ui.status, `${prepared.deposit?.directRoute ? "Swap" : "Deposit"} sent: ${shortAddress(depositSignature)}. Tracking Robinhood delivery...`);
  const settled = await api.rhSwapSettle({
    id: prepared.request?.id,
    depositSignature
  });
  state.activeRequest = settled.request || state.activeRequest;
  renderProgress(state.activeRequest);
  renderQuote();
  await loadHistory();
  return settled;
}

function bindEvents() {
  ui.openTokenPicker?.addEventListener("click", openTokenModal);
  ui.pasteToken?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (ui.targetToken) ui.targetToken.value = String(text || "").trim();
      openTokenModal();
      if (ui.tokenSearch) ui.tokenSearch.value = String(text || "").trim();
      await lookupToken(text);
    } catch {
      openTokenModal();
      setAlert(ui.status, "Paste the token contract into the search box.", true);
    }
  });
  ui.tokenClose?.addEventListener("click", closeTokenModal);
  ui.tokenModal?.addEventListener("click", (event) => {
    if (event.target === ui.tokenModal) closeTokenModal();
  });
  ui.tokenSearch?.addEventListener("input", () => {
    window.clearTimeout(state.tokenLookupTimer);
    const value = ui.tokenSearch.value;
    state.tokenLookupTimer = window.setTimeout(() => lookupToken(value), 260);
  });
  ui.tokenResults?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-token-index]");
    if (!button || button.disabled) return;
    const token = state.tokenResults[Number(button.dataset.tokenIndex || -1)] || {};
    setSelectedToken(token);
    closeTokenModal();
  });
  ui.targetToken?.addEventListener("input", () => {
    const address = normalizeEvmAddress(ui.targetToken.value);
    if (!address) {
      setSelectedToken({}, { silent: true });
      scheduleAutoQuote("token-clear");
      return;
    }
    window.clearTimeout(state.tokenLookupTimer);
    state.tokenLookupTimer = window.setTimeout(() => lookupToken(address).then(() => scheduleAutoQuote("token-address")), 260);
  });
  ui.useGenerated?.addEventListener("click", () => setMode("generated"));
  ui.useExisting?.addEventListener("click", () => setMode("existing"));
  ui.generateWallet?.addEventListener("click", () => {
    try {
      if (!connectedSolanaAddress()) throw new Error("Connect a Solana wallet first.");
      const wallet = ethers.Wallet.createRandom();
      saveDestination({
        type: "generated",
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic?.phrase || "",
        createdAt: Date.now()
      });
      renderDestination();
      setAlert(ui.status, `Generated Robinhood wallet ${shortAddress(wallet.address)}`);
      scheduleAutoQuote("generated-wallet");
    } catch (error) {
      setAlert(ui.status, parseUiError(error), true);
    }
  });
  ui.exportWallet?.addEventListener("click", () => {
    const saved = getSavedDestination();
    if (!saved?.privateKey) {
      setAlert(ui.status, "No generated Robinhood wallet found", true);
      return;
    }
    showKeyModal(saved.privateKey);
  });
  ui.keyClose?.addEventListener("click", hideKeyModal);
  ui.keyDone?.addEventListener("click", hideKeyModal);
  ui.keyModal?.addEventListener("click", (event) => {
    if (event.target === ui.keyModal) hideKeyModal();
  });
  ui.keyCopy?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(ui.privateKey?.value || ""));
      showCopyToast("Private key copied");
    } catch {
      setAlert(ui.status, "Could not copy private key", true);
    }
  });
  ui.recipient?.addEventListener("input", () => {
    scheduleAutoQuote("recipient");
  });
  ui.amount?.addEventListener("input", () => {
    scheduleAutoQuote("amount");
  });
  ui.form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setAlert(ui.status, "Fetching live quote...");
      await quoteSwap({ requireRecipient: false });
      const warnings = state.quote?.warnings?.length ? ` ${state.quote.warnings[0]}` : "";
      if (Number(state.quote?.netUsd || 0) <= 0 || Number(state.quote?.minimumTargetTokens || 0) <= 0) {
        setAlert(ui.status, "Amount is too small after fee and RH gas reserve. Try a larger PUMPR amount.", true);
      } else {
        setAlert(ui.status, `Quote ready.${warnings}`);
      }
    } catch (error) {
      state.quote = null;
      renderQuote();
      setAlert(ui.status, parseUiError(error), true);
    }
  });
  ui.requestBtn?.addEventListener("click", async () => {
    try {
      ui.requestBtn.disabled = true;
      renderProgress({ status: "awaiting_deposit_signature", progressPct: 12, estimatedSeconds: 30, statusMessage: "Building real user-wallet PUMPR swap transaction." }, { force: true });
      setAlert(ui.status, "Preparing real swap...");
      const payload = await createSwapRequest();
      const request = payload?.request || {};
      if (isCompletedStatus(request.status)) {
        setAlert(ui.status, `Swap completed. ${formatAmount(request.estimatedTargetTokens, 6)} ${request.targetSymbol || "TOKEN"} sent to ${shortAddress(request.recipient || "")}.`);
      } else {
        setAlert(ui.status, `${request.stage || "Swap status"}: ${request.statusMessage || "Tracking live status now."}`);
        startRequestPolling(request.id);
      }
    } catch (error) {
      state.activeRequest = null;
      renderProgress({ status: "failed", progressPct: 32, estimatedSeconds: 0, statusMessage: parseUiError(error), error: parseUiError(error) }, { force: true });
      setAlert(ui.status, parseUiError(error), true);
    } finally {
      renderQuote();
    }
  });
  ui.cancelProgress?.addEventListener("click", () => {
    resetActiveSwap("Canceled the old signing prompt. You can refresh the quote or submit a new swap.");
  });
  ui.refreshHistory?.addEventListener("click", () => loadHistory().catch(() => {}));
  window.addEventListener("etherpump:walletChanged", () => syncWallet().catch(() => {}));
  window.addEventListener("etherpump:solanaWalletChanged", () => syncWallet().catch(() => {}));
  window.addEventListener("pumpr:rhWalletChanged", renderDestination);
}

async function syncWallet() {
  renderDestination();
  await refreshGate();
  scheduleAutoQuote("wallet");
  await loadHistory();
}

async function init() {
  state.controls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    walletSelect: ui.walletSelect,
    walletLabel: ui.walletLabel,
    alertEl: ui.status,
    onChange: syncWallet
  });
  bindEvents();
  setMode("generated");
  await restoreWalletFromSession("").catch(() => null);
  await state.controls?.ready?.catch(() => null);
  await syncWallet();
}

init().catch((error) => {
  setAlert(ui.status, parseUiError(error), true);
});
