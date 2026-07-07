import { api } from "./api.js?v=20260703sharedauth";
import {
  connectSocialWallet,
  defaultUsername,
  connectSolanaWallet,
  ensureWalletChain,
  ethers,
  getChainOption,
  loadUserProfile,
  parseUiError,
  shortAddress,
  solanaWalletState,
  walletState
} from "./core.js?v=20260706mobileauth";
import { initTopbarWalletProfile, setAlert } from "./ui.js?v=20260706mobileauth";
import { initSupportWidget } from "./support.js?v=20260703adminwallet";

const ui = {
  alert: document.getElementById("alert"),
  feed: document.getElementById("goFeed"),
  tabs: Array.from(document.querySelectorAll("[data-go-tab]")),
  search: document.getElementById("goSearchInput"),
  listView: document.getElementById("goListView"),
  detailView: document.getElementById("goDetailView"),
  trendingCount: document.getElementById("goTrendingCount"),
  rewardTotal: document.getElementById("goRewardTotal"),
  rewardBreakdown: document.getElementById("goRewardBreakdown"),
  highestList: document.getElementById("goHighestList"),
  earnersList: document.getElementById("goEarnersList"),
  spendersList: document.getElementById("goSpendersList"),
  deliverablesCard: document.getElementById("goDeliverablesCard"),
  deliverables: document.getElementById("goDeliverables"),
  submitWorkBtn: document.getElementById("goSubmitWorkBtn"),
  externalSubmitBtn: document.getElementById("goExternalSubmitBtn"),
  agentSubmitBox: document.getElementById("goAgentSubmitBox"),
  agentSelect: document.getElementById("goAgentSelect"),
  runAgentBtn: document.getElementById("goRunAgentBtn"),
  agentSubmitStatus: document.getElementById("goAgentSubmitStatus"),
  pumpFunBridgeBox: document.getElementById("goPumpFunBridgeBox"),
  pumpFunBridgeBookmarklet: document.getElementById("goPumpFunBridgeBookmarklet"),
  pumpFunBridgeCopy: document.getElementById("goPumpFunBridgeCopy"),
  pumpFunBridgeOpen: document.getElementById("goPumpFunBridgeOpen"),
  pumpFunBridgeId: document.getElementById("goPumpFunBridgeId"),
  pumpFunSessionBox: document.getElementById("goPumpFunSessionBox"),
  pumpFunSessionStatus: document.getElementById("goPumpFunSessionStatus"),
  pumpFunAuthToken: document.getElementById("goPumpFunAuthToken"),
  pumpFunCookie: document.getElementById("goPumpFunCookie"),
  pumpFunSessionMsg: document.getElementById("goPumpFunSessionMsg"),
  savePumpFunSession: document.getElementById("goSavePumpFunSession"),
  clearPumpFunSession: document.getElementById("goClearPumpFunSession"),
  createBountyBtn: document.getElementById("goCreateBountyBtn") || document.getElementById("goCreateTaskBtn"),
  bountyModal: document.getElementById("goBountyModal") || document.getElementById("goTaskModal"),
  bountyClose: document.getElementById("goBountyClose") || document.getElementById("goTaskClose"),
  bountyCancelBtns: Array.from(document.querySelectorAll(".goBountyCancel, .goTaskCancel")),
  bountyForm: document.getElementById("goBountyForm") || document.getElementById("goTaskForm"),
  bountyTitle: document.getElementById("goBountyTitle") || document.getElementById("goTaskTitle"),
  bountyDescription: document.getElementById("goBountyDescription") || document.getElementById("goTaskDescription"),
  bountyDeliverables: document.getElementById("goBountyDeliverables") || document.getElementById("goTaskDeliverables"),
  bountyReward: document.getElementById("goBountyReward") || document.getElementById("goTaskReward"),
  bountyToken: document.getElementById("goBountyToken") || document.getElementById("goTaskToken"),
  bountyImage: document.getElementById("goBountyImage") || document.getElementById("goTaskImage"),
  bountyFeature: document.getElementById("goBountyFeature") || document.getElementById("goTaskFeature"),
  bountyDays: document.getElementById("goBountyDays") || document.getElementById("goTaskDays"),
  bountyTokenAmount: document.getElementById("goBountyTokenAmount") || document.getElementById("goTaskTokenAmount"),
  escrowStatus: document.getElementById("goEscrowStatus"),
  detailsStep: document.getElementById("goDetailsStep"),
  rewardsStep: document.getElementById("goRewardsStep"),
  stepDetails: document.getElementById("goStepDetails"),
  stepRewards: document.getElementById("goStepRewards"),
  continueRewardsBtn: document.getElementById("goContinueRewardsBtn"),
  confirmLegal: document.getElementById("goConfirmLegal"),
  confirmSpecific: document.getElementById("goConfirmSpecific"),
  submitModal: document.getElementById("goSubmitModal"),
  submitClose: document.getElementById("goSubmitClose"),
  submitForm: document.getElementById("goSubmitForm"),
  submitBody: document.getElementById("goSubmitBody"),
  submitMedia: document.getElementById("goSubmitMedia"),
  submitLinks: document.getElementById("goSubmitLinks"),
  submitFile: document.getElementById("goSubmitFile"),
  submitChooseFile: document.getElementById("goSubmitChooseFile"),
  submitFileName: document.getElementById("goSubmitFileName"),
  agentEvidenceFile: document.getElementById("goAgentEvidenceFile"),
  agentEvidenceChoose: document.getElementById("goAgentEvidenceChoose"),
  agentEvidenceName: document.getElementById("goAgentEvidenceName"),
  agentGenerateImage: document.getElementById("goAgentGenerateImage"),
  submitAgree: document.getElementById("goSubmitAgree"),
  submitIdentity: document.getElementById("goSubmitIdentity"),
  submitBountyName: document.getElementById("goSubmitTaskName"),
  submitAddLink: document.getElementById("goSubmitAddLink"),
  detailCrumb: document.getElementById("goDetailCrumb"),
  detailStatus: document.getElementById("goDetailStatus"),
  detailTitle: document.getElementById("goDetailTitle"),
  detailAvatar: document.getElementById("goDetailAvatar"),
  detailCreator: document.getElementById("goDetailCreator"),
  detailPosted: document.getElementById("goDetailPosted"),
  detailDescription: document.getElementById("goDetailDescription"),
  detailMediaCard: document.getElementById("goDetailMediaCard"),
  detailMedia: document.getElementById("goDetailMedia"),
  submissionCount: document.getElementById("goSubmissionCount"),
  submissionList: document.getElementById("goSubmissionList"),
  signInBtn: document.getElementById("signInBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletSelect: document.getElementById("walletChoice"),
  walletLabel: document.getElementById("walletAddress"),
  profileNavSide: document.getElementById("profileNavSide")
};

const GO_DRAFT_KEY = "etherpump.go.bountyDraft.v1";
const GO_X_AUTH_KEY = "etherpump.go.xauth.v1";
const GO_LIST_LIMIT = 500;
const GO_REFRESH_INTERVAL_MS = 30_000;

const state = {
  tab: "trending",
  query: "",
  bounties: [],
  submissions: [],
  stats: {},
  goConfig: { payoutChains: [] },
  activeBounty: null,
  activeSubmissions: [],
  agents: [],
  preparedPumpFunSubmission: null,
  pumpFunSession: null,
  walletControls: null,
  loadingList: false,
  refreshTimer: null
};

const GO_ESCROW_ABI = [
  "function fund(bytes32 bountyId) payable",
  "function release(bytes32 bountyId,address winner)"
];

function base64UrlDecode(value = "") {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = text.padEnd(text.length + ((4 - text.length % 4) % 4), "=");
  return decodeURIComponent(
    Array.from(atob(padded), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")
  );
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(base64UrlDecode(value));
  } catch {
    return null;
  }
}

function readXAuth() {
  try {
    return JSON.parse(localStorage.getItem(GO_X_AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function saveXAuth(profile) {
  const safe = profile && typeof profile === "object" ? { ...profile, authorized: true } : { authorized: true };
  localStorage.setItem(GO_X_AUTH_KEY, JSON.stringify(safe));
  return safe;
}

function hasXAuth() {
  const auth = readXAuth();
  return Boolean(auth?.authorized || auth?.username);
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
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", next);
    return true;
  }
  if (params.get("x") === "failed" || params.get("x") === "expired") {
    const reason = params.get("reason") || "X authorization failed";
    params.delete("x");
    params.delete("reason");
    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    setAlert(ui.alert, reason, true);
  }
  return false;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: n >= 10000 ? "compact" : "standard",
    maximumFractionDigits: n >= 1000 ? 0 : 2
  }).format(n);
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

function timeLeft(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h left`;
  if (hrs > 0) return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}

function avatarText(name = "") {
  return String(name || "EP").replace(/^@/, "").slice(0, 2).toUpperCase() || "EP";
}

function currentIdentity() {
  const ws = walletState();
  const address = ws.address || "";
  const profile = address ? loadUserProfile(address) : null;
  const name = profile?.username || (address ? defaultUsername(address) : "guest");
  return { address, name };
}

function localAgentOwner() {
  try {
    const key = "pumpr.agent.claimOwner.v1";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const random = crypto?.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, "0")).join("") : String(Date.now().toString(36));
    const owner = `agent-claim-${random}`;
    localStorage.setItem(key, owner);
    return owner;
  } catch {
    return `agent-claim-${Date.now().toString(36)}`;
  }
}

function activeAgentOwner() {
  return String(walletState().address || "").trim() || localAgentOwner();
}

function activePumpFunOwner() {
  return String(solanaWalletState().address || walletState().solanaAddress || "").trim();
}

function setAgentSubmitStatus(message = "", type = "info", action = null) {
  if (!ui.agentSubmitStatus) return;
  ui.agentSubmitStatus.textContent = message;
  if (action?.href) {
    const link = document.createElement("a");
    link.href = action.href;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = action.label || "Open on Pump.fun";
    link.className = "go-agent-status-link";
    ui.agentSubmitStatus.append(document.createElement("br"), link);
  }
  ui.agentSubmitStatus.classList.toggle("success", type === "success");
  ui.agentSubmitStatus.classList.toggle("error", type === "error");
}

function latestSubmissionText() {
  const latest = (state.activeSubmissions || [])
    .filter((row) => row && row.bountyId === state.activeBounty?.id)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
  if (!latest) return "";
  const links = Array.isArray(latest.links) && latest.links.length ? `\n\nProof / links:\n${latest.links.join("\n")}` : "";
  return `${latest.body || ""}${links}`.trim();
}

function latestSubmission() {
  return (state.activeSubmissions || [])
    .filter((row) => row && row.bountyId === state.activeBounty?.id)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null;
}

async function copyText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

async function uploadEvidenceAttachment(file) {
  if (!file) return null;
  const dataUrl = await readFileAsDataUrl(file);
  const upload = await api.uploadFile(dataUrl);
  const url = String(upload?.publicUrl || upload?.url || "").trim();
  if (!url) throw new Error("Evidence image uploaded, but no URL was returned");
  return {
    url,
    name: String(file.name || "evidence").slice(0, 160),
    type: String(upload?.mime || file.type || "application/octet-stream").slice(0, 120)
  };
}

async function currentSubmitAttachments(generatedAttachment = null) {
  const attachments = [];
  const file = ui.agentEvidenceFile?.files?.[0] || ui.submitFile?.files?.[0] || null;
  if (file) {
    setAgentSubmitStatus(`Uploading evidence file ${file.name || "attachment"} to Pump.fun...`);
    attachments.push({
      filename: String(file.name || "evidence").slice(0, 180),
      contentType: String(file.type || "application/octet-stream").slice(0, 120),
      size: Number(file.size || 0),
      dataUrl: await readFileAsDataUrl(file)
    });
  } else if (generatedAttachment?.dataUrl) {
    const generatedMode = "task-scene image";
    setAgentSubmitStatus(`Uploading OpenAI generated ${generatedMode} to Pump.fun...`);
    attachments.push({
      filename: String(generatedAttachment.filename || "pumpr-task-scene.png").slice(0, 180),
      contentType: String(generatedAttachment.contentType || "image/png").slice(0, 120),
      size: Number(generatedAttachment.size || 0),
      dataUrl: String(generatedAttachment.dataUrl || "")
    });
  }
  const existingMediaUrl = String(ui.submitMedia?.value || "").trim();
  if (existingMediaUrl) {
    attachments.push({ url: existingMediaUrl, filename: "Evidence link", contentType: "text/uri-list" });
  }
  return attachments.slice(0, 8);
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
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setPumpFunSessionMessage(message = "", tone = "") {
  if (!ui.pumpFunSessionMsg) return;
  ui.pumpFunSessionMsg.textContent = message;
  ui.pumpFunSessionMsg.classList.toggle("success", tone === "success");
  ui.pumpFunSessionMsg.classList.toggle("error", tone === "error");
}

function renderPumpFunSession(session = state.pumpFunSession) {
  const configured = Boolean(session?.configured);
  if (ui.pumpFunSessionStatus) {
    ui.pumpFunSessionStatus.textContent = configured
      ? `Ready for ${shortAddress(session.sessionAddress || session.owner || "")}`
      : "Required before auto-submit";
  }
  if (ui.runAgentBtn && state.activeBounty?.source === "Pump.fun") {
    ui.runAgentBtn.textContent = configured ? "Run agent & auto submit" : "Add Pump.fun session first";
    ui.runAgentBtn.classList.toggle("is-disabled-soft", !configured);
  }
}

async function refreshPumpFunSession(owner = activePumpFunOwner()) {
  const address = String(owner || "").trim();
  if (!address) {
    state.pumpFunSession = { configured: false };
    renderPumpFunSession();
    return state.pumpFunSession;
  }
  state.pumpFunSession = await api.pumpfunSession(address).catch(() => ({ configured: false }));
  renderPumpFunSession();
  return state.pumpFunSession;
}

async function requirePumpFunSession() {
  const owner = activePumpFunOwner();
  if (!owner) throw new Error("Connect Phantom Solana before using Pump.fun auto-submit");
  const session = await refreshPumpFunSession(owner);
  if (!session?.configured) {
    throw new Error("Add your Pump.fun session key for this Phantom wallet before auto-submitting work");
  }
  return session;
}

async function waitForPumpFunSubmissionReceipt({ bountyId, submissionId, publicKey, resumeSignature }) {
  let latest = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await delay(1200 + attempt * 450);
    latest = await api.pumpfunBountyFeeTransaction({ bountyId, submissionId, userPublicKey: publicKey, owner: publicKey });
    if (latest?.existingReceipt) return latest;
    setAgentSubmitStatus(`Waiting for Pump.fun fee receipt... ${attempt + 1}/8`);
  }
  return latest || { resumeSignature };
}

async function connectSolanaForPumpFun(options = {}) {
  await ensureWalletChain(101);
  let solana = solanaWalletState();
  if (!solana?.provider || !solana?.address || options.requireSignature) {
    solana = await connectSolanaWallet({
      forcePrompt: true,
      requireSignature: Boolean(options.requireSignature)
    });
  }
  if (!solana?.provider || !solana?.address) throw new Error("Connect Phantom Solana before publishing to Pump.fun");
  if (typeof solana.provider.signTransaction !== "function") {
    throw new Error("Phantom did not expose transaction signing");
  }
  return { provider: solana.provider, publicKey: solana.address };
}

async function publishPumpFunSubmission(submissionId = "") {
  const bountyId = state.activeBounty?.id || "";
  if (!bountyId || !submissionId) throw new Error("Pump.fun publish is missing bounty or submission id");
  const { provider, publicKey } = await connectSolanaForPumpFun();
  const solanaWeb3 = await loadSolanaWeb3();
  setAgentSubmitStatus("Open Phantom to sign the Pump.fun submission fee...");
  await requirePumpFunSession();
  const fee = await api.pumpfunBountyFeeTransaction({ bountyId, submissionId, userPublicKey: publicKey, owner: publicKey });
  if (fee?.existingReceipt && fee?.resumeSignature) {
    setAgentSubmitStatus("Pump.fun fee receipt already exists. Resuming publish...");
    return api.pumpfunBountyPublish({ bountyId, submissionId, signature: fee.resumeSignature, owner: publicKey, userPublicKey: publicKey });
  }
  const transactionBase64 = String(fee?.transactionBase64 || "");
  if (!transactionBase64) throw new Error("Pump.fun did not return a submission-fee transaction");
  const transaction = solanaWeb3.Transaction.from(base64ToBytes(transactionBase64));
  const signed = await provider.signTransaction(transaction);
  setAgentSubmitStatus("Broadcasting the signed Pump.fun submission fee...");
  const sent = await api.solanaSendTransaction({
    signedTransactionBase64: bytesToBase64(signed.serialize({ requireAllSignatures: false, verifySignatures: false })),
    rpcUrl: fee.rpcUrl,
    blockhash: fee.blockhash,
    lastValidBlockHeight: fee.lastValidBlockHeight
  });
  const signature = String(sent?.signature || "");
  if (!signature) throw new Error("Solana transaction did not return a signature");
  const receipt = await waitForPumpFunSubmissionReceipt({
    bountyId,
    submissionId,
    publicKey,
    resumeSignature: fee.resumeSignature
  });
  if (!receipt?.existingReceipt) {
    throw new Error("Pump.fun fee transaction confirmed, but the submission fee receipt is not visible yet. Wait a few seconds and run submit again.");
  }
  setAgentSubmitStatus("Publishing the submission on Pump.fun...");
  try {
    return await api.pumpfunBountyPublish({ bountyId, submissionId, signature, owner: publicKey, userPublicKey: publicKey });
  } catch (error) {
    const message = String(error?.message || "");
    const resumeSignature = String(receipt?.resumeSignature || fee?.resumeSignature || "");
    if (resumeSignature && message.includes("SUBMISSION_FEE_RECEIPT_MISSING")) {
      setAgentSubmitStatus("Pump.fun is still catching up. Retrying publish from existing fee receipt...");
      await delay(1800);
      return api.pumpfunBountyPublish({ bountyId, submissionId, signature: resumeSignature, owner: publicKey, userPublicKey: publicKey });
    }
    throw error;
  }
}

function preparedPumpFunText(prepared = state.preparedPumpFunSubmission) {
  const body = String(prepared?.body || "").trim();
  const links = Array.isArray(prepared?.links) ? prepared.links.map((link) => String(link || "").trim()).filter(Boolean) : [];
  return [body, links.length ? `Links:\n${links.map((link) => `- ${link}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
}

function isPumpFunBounty(bounty = state.activeBounty) {
  return String(bounty?.source || "").toLowerCase().includes("pump.fun")
    || String(bounty?.sourceUrl || "").toLowerCase().includes("pump.fun")
    || String(bounty?.id || "").toLowerCase().startsWith("pumpfun-");
}

function renderPumpFunBridge(prepared = null, sourceUrl = "") {
  state.preparedPumpFunSubmission = prepared || null;
  if (!ui.pumpFunBridgeBox) return;
  const hasPrepared = Boolean(prepared?.id);
  ui.pumpFunBridgeBox.hidden = !hasPrepared;
  if (!hasPrepared) return;
  if (ui.pumpFunBridgeBookmarklet) {
    ui.pumpFunBridgeBookmarklet.href = "#";
    ui.pumpFunBridgeBookmarklet.title = "Copy the AI-generated Pump.fun submission";
  }
  if (ui.pumpFunBridgeId) {
    ui.pumpFunBridgeId.textContent = prepared?.id
      ? `Prepared submission ${prepared.id}`
      : "Copy/open fallback is available if direct submit fails.";
  }
  if (ui.pumpFunBridgeOpen) {
    ui.pumpFunBridgeOpen.dataset.sourceUrl = sourceUrl || prepared.sourceUrl || "";
  }
}

function renderAgentSelect() {
  if (!ui.agentSelect) return;
  ui.agentSelect.innerHTML = state.agents.length
    ? state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("")
    : `<option value="">Create an agent first</option>`;
}

async function loadAgentsForSubmit() {
  const payload = await api.agents().catch(() => ({ agents: [] }));
  state.agents = Array.isArray(payload.agents) ? payload.agents : [];
  renderAgentSelect();
}

function payoutChain(chainId) {
  const id = Number(chainId || 0);
  return (state.goConfig?.payoutChains || []).find((row) => Number(row.chainId) === id) || null;
}

function payoutLabel(chainId) {
  const configured = payoutChain(chainId);
  const option = getChainOption(chainId);
  const name = configured?.name || option?.name || `Chain ${chainId}`;
  const symbol = configured?.nativeCurrency || option?.nativeCurrency?.symbol || "ETH";
  return `${name} ${symbol}`;
}

function selectedPayoutChain() {
  const chainId = Number(ui.bountyToken?.value || 1);
  const config = payoutChain(chainId);
  if (!config?.enabled || !config?.escrowAddress) {
    throw new Error(`${payoutLabel(chainId)} escrow is not configured yet`);
  }
  return config;
}

function makeBountyId(title = "") {
  const slug = String(title || "bounty").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 44);
  const rand = Math.random().toString(36).slice(2, 8);
  return `go-${slug || "bounty"}-${Date.now().toString(36)}-${rand}`;
}

function openModal(node) {
  if (!node) return;
  node.classList.add("open");
  node.setAttribute("aria-hidden", "false");
}

function closeModal(node) {
  if (!node) return;
  node.classList.remove("open");
  node.setAttribute("aria-hidden", "true");
}

function setBountyStep(step = "details") {
  const rewards = step === "rewards";
  if (ui.detailsStep) ui.detailsStep.hidden = rewards;
  if (ui.rewardsStep) ui.rewardsStep.hidden = !rewards;
  ui.stepDetails?.classList.toggle("active", !rewards);
  ui.stepDetails?.classList.toggle("done", rewards);
  ui.stepRewards?.classList.toggle("active", rewards);
}

function bountyDraftFromForm() {
  return {
    title: ui.bountyTitle?.value || "",
    description: ui.bountyDescription?.value || "",
    deliverables: ui.bountyDeliverables?.value || "",
    imageUri: ui.bountyImage?.value || "",
    feature: ui.bountyFeature?.value || "",
    days: ui.bountyDays?.value || "7",
    rewardUsd: ui.bountyReward?.value || "50",
    payoutChainId: ui.bountyToken?.value || "1",
    tokenAmount: ui.bountyTokenAmount?.value || "0.05",
    confirmLegal: Boolean(ui.confirmLegal?.checked),
    confirmSpecific: Boolean(ui.confirmSpecific?.checked)
  };
}

function saveBountyDraft() {
  localStorage.setItem(GO_DRAFT_KEY, JSON.stringify(bountyDraftFromForm()));
}

function restoreBountyDraft() {
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(GO_DRAFT_KEY) || "null");
  } catch {
    draft = null;
  }
  if (!draft) return false;
  if (ui.bountyTitle) ui.bountyTitle.value = draft.title || "";
  if (ui.bountyDescription) ui.bountyDescription.value = draft.description || "";
  if (ui.bountyDeliverables) ui.bountyDeliverables.value = draft.deliverables || "";
  if (ui.bountyImage) ui.bountyImage.value = draft.imageUri || "";
  if (ui.bountyFeature) ui.bountyFeature.value = draft.feature || "";
  if (ui.bountyDays) ui.bountyDays.value = draft.days || "7";
  if (ui.bountyReward) ui.bountyReward.value = draft.rewardUsd || "50";
  if (ui.bountyToken) ui.bountyToken.value = draft.payoutChainId || draft.tokenSymbol || "1";
  if (ui.bountyTokenAmount) ui.bountyTokenAmount.value = draft.tokenAmount || "0.05";
  if (ui.confirmLegal) ui.confirmLegal.checked = Boolean(draft.confirmLegal);
  if (ui.confirmSpecific) ui.confirmSpecific.checked = Boolean(draft.confirmSpecific);
  return true;
}

function renderPayoutOptions() {
  if (!ui.bountyToken) return;
  const chains = state.goConfig?.payoutChains?.length ? state.goConfig.payoutChains : [
    { chainId: 1, name: "Ethereum", nativeCurrency: "ETH", enabled: false },
    { chainId: 8453, name: "Base", nativeCurrency: "ETH", enabled: false },
    { chainId: 143, name: "Monad", nativeCurrency: "MON", enabled: false },
    { chainId: 101, name: "Solana", nativeCurrency: "SOL", enabled: false }
  ];
  const previous = ui.bountyToken.value || "1";
  ui.bountyToken.innerHTML = chains
    .map((row) => {
      const disabled = row.enabled ? "" : "disabled";
      const suffix = row.enabled ? "" : " - escrow not configured";
      return `<option value="${row.chainId}" ${disabled}>${escapeHtml(row.name)} ${escapeHtml(row.nativeCurrency)}${suffix}</option>`;
    })
    .join("");
  const values = new Set(chains.filter((row) => row.enabled).map((row) => String(row.chainId)));
  ui.bountyToken.value = values.has(previous) ? previous : values.values().next().value || "1";
  updateEscrowStatus();
}

function updateEscrowStatus() {
  if (!ui.escrowStatus) return;
  const chainId = Number(ui.bountyToken?.value || 1);
  const config = payoutChain(chainId);
  if (config?.enabled) {
    ui.escrowStatus.textContent = `${payoutLabel(chainId)} escrow is ready. Publishing will lock funds on-chain.`;
  } else {
    ui.escrowStatus.textContent = `${payoutLabel(chainId)} escrow is not configured yet.`;
  }
}

function validateDetailsStep() {
  if (!ui.bountyTitle.value.trim()) throw new Error("Title is required");
  if (!ui.bountyDescription.value.trim()) throw new Error("Summary is required");
  if (!ui.bountyDeliverables.value.trim()) throw new Error("Add at least one deliverable");
  if (!ui.confirmLegal.checked || !ui.confirmSpecific.checked) {
    throw new Error("Confirm the bounty requirements before continuing");
  }
}

function requestXAuthorization() {
  saveBountyDraft();
  const returnTo = `${window.location.pathname}${window.location.search || ""}#create-bounty`;
  window.location.href = `/api/x/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
}

function mediaMarkup(url, title = "") {
  const src = String(url || "").trim();
  if (!src) return "";
  if (!isMediaUrl(src)) return "";
  const isVideo = /\.(mp4|webm|ogg)(\?|#|$)/i.test(src);
  if (isVideo) {
    return `<video class="go-card-media" src="${escapeHtml(src)}" controls playsinline></video>`;
  }
  return `<img class="go-card-media" src="${escapeHtml(src)}" alt="${escapeHtml(String(title || "GO media").slice(0, 120))}" loading="lazy" />`;
}

function linksMarkup(links = []) {
  const safeLinks = (Array.isArray(links) ? links : [])
    .map((row) => String(row || "").trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!safeLinks.length) return "";
  return `
    <div class="go-submission-links">
      ${safeLinks
        .map((link) => `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer noopener">${escapeHtml(link)}</a>`)
        .join("")}
    </div>
  `;
}

function isMediaUrl(url = "") {
  const text = String(url || "").trim();
  return /\.(png|jpe?g|webp|gif|mp4|webm|mov|ogg)(\?|#|$)/i.test(text) || /\/bounties\/.+\/[^/?#]+$/i.test(text);
}

function firstMediaUrl(value = {}) {
  const direct = String(value.mediaUrl || "").trim();
  if (direct && isMediaUrl(direct)) return direct;
  const links = Array.isArray(value.links) ? value.links : [];
  return links.map((row) => String(row || "").trim()).find(isMediaUrl) || "";
}

function bodyWithoutRawLinks(text = "") {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactSubmissionBody(text = "") {
  return bodyWithoutRawLinks(text)
    .replace(/\s+/g, " ")
    .replace(/\s+(Summary:|Work completed:|Proof \/ links:|Deliverables matched:)/g, "\n\n$1")
    .trim();
}

function splitSubmissionSections(text = "") {
  const source = compactSubmissionBody(text);
  const labels = [
    "Submission for:",
    "Summary:",
    "Work completed:",
    "Proof / links:",
    "Deliverables matched:",
  ];
  const pattern = new RegExp(`(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const pieces = source.split(pattern).filter((part) => part.trim());
  const sections = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const part = pieces[index].trim();
    if (labels.includes(part)) {
      sections.push({ label: part.replace(/:$/, ""), value: String(pieces[index + 1] || "").trim() });
      index += 1;
    } else if (part) {
      sections.push({ label: "", value: part });
    }
  }
  return sections.filter((section) => section.value).slice(0, 10);
}

function formatSubmissionSectionValue(label = "", value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  const listy = /^(Work completed|Deliverables matched|Proof \/ links|AI-generated)/i.test(label);
  if (listy) {
    const rows = clean
      .replace(/\s+-\s+/g, "\n- ")
      .replace(/\s+(\d+\.)\s+/g, "\n$1 ")
      .split(/\n+/)
      .map((row) => row.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (rows.length > 1) {
      return `<ul>${rows.map((row) => `<li>${escapeHtml(row.replace(/^[-â€¢]\s*/, "").replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ul>`;
    }
  }
  return `<p>${escapeHtml(clean)}</p>`;
}

function submissionBodyMarkup(body = "") {
  const sections = splitSubmissionSections(body);
  if (!sections.length) return `<p>${escapeHtml(compactSubmissionBody(body))}</p>`;
  return `
    <div class="go-submission-body">
      ${sections.map((section) => `
        <section class="${section.label ? "" : "is-plain"}">
          ${section.label ? `<h4>${escapeHtml(section.label)}</h4>` : ""}
          ${formatSubmissionSectionValue(section.label, section.value)}
        </section>
      `).join("")}
    </div>
  `;
}

function bountyCard(bounty) {
  const href = `/go/${encodeURIComponent(bounty.id)}`;
  const creatorLabel = bounty.creatorName || shortAddress(bounty.creatorSolana || bounty.creator);
  return `
    <article class="go-card go-bounty-card" data-bounty-id="${escapeHtml(bounty.id)}">
      ${mediaMarkup(bounty.imageUri, bounty.title)}
      <div class="go-card-body">
        <div class="go-card-top">
          <span class="go-status-pill">${escapeHtml(bounty.status || "open")}</span>
          <span class="go-token-pill">$${escapeHtml(bounty.tokenSymbol || "TOKEN")} MC</span>
          ${bounty.source ? `<span class="go-source-pill">${escapeHtml(bounty.source)}</span>` : ""}
        </div>
        <a class="go-card-title" href="${href}">${escapeHtml(bounty.title)}</a>
        <p>${escapeHtml(bounty.description || "")}</p>
        <div class="go-card-author"><span class="go-avatar">${avatarText(creatorLabel)}</span><b>${escapeHtml(creatorLabel)}</b></div>
        <div class="go-card-bottom">
          <strong>${money(bounty.rewardUsd)}</strong>
          <span>${escapeHtml(String(bounty.tokenAmount || ""))} ${escapeHtml(bounty.tokenUnit || "")}</span>
        </div>
        <div class="go-progress"><span></span></div>
        <div class="go-card-meta"><span>${timeLeft(bounty.secondsLeft)}</span><span>${Number(bounty.submissions || 0)} subs.</span></div>
      </div>
    </article>
  `;
}

function submissionCard(submission) {
  const bounty = state.bounties.find((row) => row.id === submission.bountyId);
  const authorLabel = submission.agentName || submission.authorName || shortAddress(submission.author);
  const visibleLinks = (Array.isArray(submission.links) ? submission.links : []).filter((link) => !isMediaUrl(link));
  const mediaUrl = firstMediaUrl(submission);
  return `
    <article class="go-card go-submission-card go-feed-submission">
      <div class="go-card-body">
        <div class="go-submission-head">
          <span class="go-avatar">${avatarText(authorLabel)}</span>
          <div>
            <b>${escapeHtml(authorLabel)}</b>
            <small>${submission.agentId ? "Agent submission" : "Submission"} Â· ${ago(submission.createdAt)}</small>
          </div>
          <span class="go-status-pill blue">Submission</span>
        </div>
        ${bounty ? `<div class="go-submission-target">TO ${escapeHtml(bounty.title.slice(0, 44))}</div>` : ""}
        ${submissionBodyMarkup(submission.body)}
        ${mediaMarkup(mediaUrl, bounty?.title || submission.body)}
        ${linksMarkup(visibleLinks)}
        <div class="go-card-meta"><span>${submission.agentId ? escapeHtml(submission.agentId) : shortAddress(submission.author)}</span><span>â™¡ ${(submission.likes || []).length}</span></div>
      </div>
    </article>
  `;
}

function filteredBounties() {
  const q = state.query.toLowerCase();
  return state.bounties.filter((row) => !q || `${row.title} ${row.description} ${row.tokenSymbol} ${row.source || ""} ${row.coinAddress || ""}`.toLowerCase().includes(q));
}

function richTextMarkup(text = "") {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, 24);
  if (!paragraphs.length) return "";
  return paragraphs.map((row) => `<p>${escapeHtml(row).replace(/\n/g, "<br />")}</p>`).join("");
}

function filteredSubmissions() {
  const q = state.query.toLowerCase();
  return state.submissions.filter((row) => !q || `${row.body} ${row.authorName}`.toLowerCase().includes(q));
}

function renderList() {
  const isSubmissions = state.tab === "submissions";
  const rows = isSubmissions ? filteredSubmissions() : filteredBounties();
  ui.feed.innerHTML = rows.length
    ? rows.map((row) => (isSubmissions ? submissionCard(row) : bountyCard(row))).join("")
    : `<article class="panel-card go-empty">Nothing here yet.</article>`;
  ui.tabs.forEach((button) => button.classList.toggle("active", button.dataset.goTab === state.tab));
  if (ui.trendingCount) ui.trendingCount.textContent = String(state.bounties.length || 0);
}

function buildPeopleRanking(rows = [], keyName = "name") {
  return [...rows]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .slice(0, 6)
    .map(
      (row, index) => `
        <a class="go-person-rank-row" href="${escapeHtml(row.href || "/go")}">
          <span>${index + 1}</span>
          <b>${escapeHtml(row[keyName] || "Guest")}</b>
          <strong>${money(row.value)}</strong>
        </a>
      `
    )
    .join("");
}

function renderHighestOpen(rows = []) {
  const list = rows.slice(0, 6);
  if (!list.length) return `<div class="go-rank-empty">No open bounties yet.</div>`;
  const [top, ...rest] = list;
  return `
    <a class="go-top-bounty-card" href="/go/${encodeURIComponent(top.id)}">
      <div class="go-top-bounty-label"><span>1</span><b>Top open bounty</b></div>
      <strong>${money(top.rewardUsd)}</strong>
      <h4>${escapeHtml(top.title)}</h4>
      <p>$${escapeHtml(top.tokenSymbol || "TOKEN")} Â· ${timeLeft(top.secondsLeft)} Â· ${Number(top.submissions || 0)} subs</p>
    </a>
    ${rest
      .map(
        (row, index) => `
          <a class="go-rank-row" href="/go/${encodeURIComponent(row.id)}">
            <span>${index + 2}</span>
            <b>${escapeHtml(row.title)}</b>
            <strong>${money(row.rewardUsd)}</strong>
          </a>
        `
      )
      .join("")}
  `;
}

function renderSide() {
  const stats = state.stats || {};
  ui.rewardTotal.textContent = money(stats.totalRewardUsd || 0);
  const liveCount = Number(stats.livePumpFun || 0);
  const liveError = String(stats.livePumpFunError || "");
  ui.rewardBreakdown.textContent = liveCount
    ? `${Number(stats.open || 0)} open bounties - ${liveCount} live from Pump.fun`
    : liveError
      ? `${Number(stats.open || 0)} open bounties - Pump.fun sync paused`
      : `${Number(stats.open || 0)} open bounties`;
  const highestOpen = Array.isArray(stats.highestOpen) ? stats.highestOpen : [];
  if (ui.highestList) ui.highestList.innerHTML = renderHighestOpen(highestOpen);

  const bountyById = new Map(state.bounties.map((row) => [row.id, row]));
  const earners = new Map();
  for (const submission of state.submissions || []) {
    const bounty = bountyById.get(submission.bountyId);
    const value = Math.max(0, Number(bounty?.rewardUsd || 0));
    const key = String(submission.author || submission.authorName || "guest").toLowerCase();
    const current = earners.get(key) || {
      name: submission.authorName || shortAddress(submission.author) || "Guest",
      value: 0,
      href: bounty ? `/go/${encodeURIComponent(bounty.id)}` : "/go"
    };
    current.value += value;
    earners.set(key, current);
  }

  const spenders = new Map();
  for (const bounty of state.bounties || []) {
    const key = String(bounty.creator || bounty.creatorSolana || bounty.creatorName || "guest").toLowerCase();
    const current = spenders.get(key) || {
      name: bounty.creatorName || shortAddress(bounty.creatorSolana || bounty.creator) || "Guest",
      value: 0,
      href: `/go/${encodeURIComponent(bounty.id)}`
    };
    current.value += Math.max(0, Number(bounty.rewardUsd || 0));
    spenders.set(key, current);
  }

  if (ui.earnersList) {
    ui.earnersList.innerHTML = earners.size
      ? buildPeopleRanking([...earners.values()])
      : `<div class="go-rank-empty">No earners yet.</div>`;
  }
  if (ui.spendersList) {
    ui.spendersList.innerHTML = spenders.size
      ? buildPeopleRanking([...spenders.values()])
      : `<div class="go-rank-empty">No spenders yet.</div>`;
  }
}

function renderDetail() {
  const bounty = state.activeBounty;
  if (!bounty) return;
  ui.listView.hidden = true;
  ui.detailView.hidden = false;
  ui.submitWorkBtn.hidden = false;
  const isPumpFun = isPumpFunBounty(bounty);
  ui.submitWorkBtn.textContent = isPumpFun ? "Submit to Pump.fun" : "Submit work";
  if (ui.externalSubmitBtn) {
    ui.externalSubmitBtn.hidden = !bounty.sourceUrl;
    ui.externalSubmitBtn.textContent = isPumpFun ? "Copy work & open Pump.fun" : "Open original bounty";
  }
  if (ui.agentSubmitBox) ui.agentSubmitBox.hidden = false;
  renderPumpFunBridge(null);
  ui.deliverablesCard.hidden = false;
  ui.detailCrumb.textContent = bounty.title;
  ui.detailStatus.textContent = bounty.status || "open";
  ui.detailTitle.textContent = bounty.title;
  const creatorLabel = bounty.creatorName || shortAddress(bounty.creatorSolana || bounty.creator);
  ui.detailAvatar.textContent = avatarText(creatorLabel);
  ui.detailCreator.textContent = creatorLabel;
  ui.detailPosted.textContent = `Posted ${ago(bounty.createdAt)}`;
  if (ui.detailMediaCard && ui.detailMedia) {
    const hasMedia = Boolean(bounty.imageUri);
    ui.detailMediaCard.hidden = !hasMedia;
    if (hasMedia) {
      ui.detailMedia.src = bounty.imageUri;
      ui.detailMedia.alt = bounty.title || "Bounty media";
      ui.detailMedia.hidden = false;
    } else {
      ui.detailMedia.removeAttribute("src");
      ui.detailMedia.hidden = true;
    }
  }
  ui.detailDescription.innerHTML = `${richTextMarkup(bounty.description || "") || "<p>No description provided.</p>"}${bounty.sourceUrl ? `<p><a class="go-external-link" href="${escapeHtml(bounty.sourceUrl)}" target="_blank" rel="noreferrer noopener">Open original ${escapeHtml(bounty.source || "bounty")}</a></p>` : ""}`;
  ui.submissionCount.textContent = String(state.activeSubmissions.length || 0);
  ui.rewardTotal.textContent = money(bounty.rewardUsd);
  ui.rewardBreakdown.textContent = `${bounty.tokenAmount || 0} ${bounty.tokenUnit || ""} - ${payoutLabel(bounty.payoutChainId)} - ${bounty.escrowStatus || "unfunded"}`;
  ui.deliverables.innerHTML = (bounty.deliverables || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  ui.submissionList.innerHTML = state.activeSubmissions.length
    ? state.activeSubmissions.map(submissionCard).join("")
    : `<article class="panel-card go-empty">No submissions yet.</article>`;
  renderReleaseControls();
  loadAgentsForSubmit().catch(() => {
    state.agents = [];
    renderAgentSelect();
    setAgentSubmitStatus("Could not load agents. Open Agents to create one.", "error");
  });
  refreshPumpFunSession(activePumpFunOwner()).catch(() => {
    state.pumpFunSession = { configured: false };
    renderPumpFunSession();
  });
}

function renderReleaseControls() {
  const bounty = state.activeBounty;
  const ws = walletState();
  const canRelease =
    bounty?.escrowStatus === "funded" &&
    bounty?.status === "open" &&
    ws.address &&
    bounty.creator &&
    String(ws.address).toLowerCase() === String(bounty.creator).toLowerCase();
  if (!canRelease || !ui.submissionList) return;
  const cards = Array.from(ui.submissionList.querySelectorAll(".go-submission-card .go-card-body"));
  cards.forEach((card, index) => {
    const submission = state.activeSubmissions[index];
    if (!submission?.author || submission.author === ethers.ZeroAddress) return;
    const button = document.createElement("button");
    button.className = "btn-primary go-release-btn";
    button.type = "button";
    button.dataset.releaseSubmission = submission.id;
    button.dataset.winner = submission.author;
    button.textContent = "Release escrow";
    card.appendChild(button);
  });
}

async function releaseSubmission(submissionId, winnerAddress) {
  if (!state.activeBounty?.id) return;
  if (!winnerAddress || winnerAddress === ethers.ZeroAddress) throw new Error("Winner must have a connected wallet submission");
  await ensureWalletChain(Number(state.activeBounty.payoutChainId || 1));
  const ws = walletState();
  if (!ws.signer) throw new Error("Connect creator wallet first");
  const escrow = new ethers.Contract(state.activeBounty.escrowAddress, GO_ESCROW_ABI, ws.signer);
  setAlert(ui.alert, "Releasing escrow to winner...");
  const tx = await escrow.release(ethers.id(state.activeBounty.id), winnerAddress);
  await tx.wait();
  await api.releaseGoBounty(state.activeBounty.id, {
    releaseTxHash: tx.hash,
    winnerSubmissionId: submissionId,
    winnerAddress
  });
  await loadDetail(state.activeBounty.id);
  setAlert(ui.alert, "Escrow released");
}

function updateSubmitModalCopy() {
  const identity = currentIdentity();
  if (ui.submitBountyName) ui.submitBountyName.textContent = state.activeBounty?.title || "Bounty submission";
  if (ui.submitIdentity) {
    const isPumpFun = isPumpFunBounty();
    ui.submitIdentity.innerHTML = isPumpFun
      ? `Submitting to Pump.fun as ${escapeHtml(identity.name)}<br />Pump.fun may require a Phantom signature for the submission fee.`
      : `Submitting as ${escapeHtml(identity.name)}<br />No submission fee. Network fees may still apply.`;
  }
}

async function loadList(options = {}) {
  if (state.loadingList) return;
  state.loadingList = true;
  try {
    if (!state.goConfig?.payoutChains?.length) {
      state.goConfig = await api.goConfig().catch(() => ({ payoutChains: [] }));
      renderPayoutOptions();
    }
    const fresh = options.fresh ?? state.bounties.length === 0;
    const payload = await api.go(state.tab, GO_LIST_LIMIT, { fresh });
    state.bounties = Array.isArray(payload.bounties) ? payload.bounties : [];
    state.submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
    state.stats = payload.stats || {};
    renderList();
    renderSide();
  } finally {
    state.loadingList = false;
  }
}

async function loadDetail(id) {
  const payload = await api.goBounty(id);
  state.activeBounty = payload.bounty;
  state.activeSubmissions = Array.isArray(payload.submissions) ? payload.submissions : [];
  renderDetail();
}

function pathBountyId() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "go" && parts[1] ? decodeURIComponent(parts[1]) : "";
}

function updateProfileLinks() {
  const ws = walletState();
  const connected = Boolean(ws.signer && ws.address);
  if (ui.profileNavSide) ui.profileNavSide.href = connected ? `/profile?address=${ws.address}` : "/profile";
}

async function initWallet() {
  ui.signInBtn?.addEventListener("click", async (event) => {
    if (!isPumpFunBounty()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const { publicKey } = await connectSolanaForPumpFun({ requireSignature: true });
      setAlert(ui.alert, `Phantom connected: ${shortAddress(publicKey)}`);
      await refreshPumpFunSession(publicKey);
    } catch (error) {
      setAlert(ui.alert, parseUiError(error), true);
    }
  }, { capture: true });

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

async function submitBounty(event) {
  event.preventDefault();
  try {
    const identity = currentIdentity();
    if (!walletState().signer || !identity.address) throw new Error("Connect wallet before funding escrow");
    const draft = bountyDraftFromForm();
    const payout = selectedPayoutChain();
    const amount = ethers.parseEther(String(draft.tokenAmount || "0"));
    if (amount <= 0n) throw new Error("Enter an escrow amount greater than 0");
    const bountyId = makeBountyId(draft.title);
    await ensureWalletChain(Number(payout.chainId));
    const ws = walletState();
    const escrow = new ethers.Contract(payout.escrowAddress, GO_ESCROW_ABI, ws.signer);
    setAlert(ui.alert, `Funding ${payoutLabel(payout.chainId)} escrow...`);
    const tx = await escrow.fund(ethers.id(bountyId), { value: amount });
    setAlert(ui.alert, "Waiting for escrow funding confirmation...");
    await tx.wait();
    const payload = await api.createGoBounty({
      id: bountyId,
      title: draft.title,
      description: draft.description,
      deliverables: draft.deliverables.split("\n"),
      rewardUsd: Number(draft.rewardUsd || 0),
      tokenSymbol: payout.nativeCurrency,
      tokenAmount: Number(draft.tokenAmount || 0),
      tokenUnit: payout.nativeCurrency,
      payoutChainId: payout.chainId,
      escrowAddress: payout.escrowAddress,
      escrowTxHash: tx.hash,
      imageUri: draft.imageUri,
      days: Number(draft.days || 7),
      creator: identity.address,
      creatorName: identity.name
    });
    localStorage.removeItem(GO_DRAFT_KEY);
    closeModal(ui.bountyModal);
    window.history.pushState({}, "", `/go/${encodeURIComponent(payload.bounty.id)}`);
    await loadDetail(payload.bounty.id);
    setAlert(ui.alert, "Bounty created");
  } catch (error) {
    setAlert(ui.alert, parseUiError(error), true);
  }
}

async function currentManualSubmitAttachments() {
  const attachments = [];
  const file = ui.submitFile?.files?.[0] || null;
  if (file) {
    setAlert(ui.alert, `Uploading evidence file ${file.name || "attachment"} to Pump.fun...`);
    attachments.push({
      filename: String(file.name || "evidence").slice(0, 180),
      contentType: String(file.type || "application/octet-stream").slice(0, 120),
      size: Number(file.size || 0),
      dataUrl: await readFileAsDataUrl(file)
    });
  }
  const existingMediaUrl = String(ui.submitMedia?.value || "").trim();
  if (existingMediaUrl) {
    attachments.push({ url: existingMediaUrl, filename: "Evidence link", contentType: "text/uri-list" });
  }
  return attachments.slice(0, 8);
}

async function submitPumpFunManualWork({ bodyMarkdown, links }) {
  const { publicKey } = await connectSolanaForPumpFun();
  await requirePumpFunSession();
  const attachments = await currentManualSubmitAttachments();
  const draft = await api.pumpfunBountyDraft({
    bountyId: state.activeBounty.id,
    bodyMarkdown,
    links,
    owner: publicKey,
    userPublicKey: publicKey,
    attachments
  });
  if (attachments.some((attachment) => attachment.dataUrl) && !Number(draft?.attachmentCount || 0)) {
    throw new Error("Pump.fun accepted the submission text but did not attach the selected file. Try a PNG/JPG/WebP/GIF under 5 MB or an MP4/WebM/MOV under 200 MB.");
  }
  const submissionId = String(draft?.submissionId || draft?.payload?.submissionId || draft?.payload?.submission?.submissionId || draft?.payload?.id || "");
  if (!submissionId) throw new Error("Pump.fun created a draft but did not return a submission id");
  const published = await publishPumpFunSubmission(submissionId);
  const pumpFunLink = String(published?.bounty?.sourceUrl || state.activeBounty?.sourceUrl || "");
  return {
    submissionId,
    attachmentCount: Number(draft?.attachmentCount || 0),
    pumpFunLink
  };
}

async function submitWork(event) {
  event.preventDefault();
  if (!state.activeBounty?.id) return;
  try {
    if (!ui.submitAgree?.checked) throw new Error("Agree to the submission terms before submitting");
    const bodyMarkdown = String(ui.submitBody?.value || "").trim();
    if (bodyMarkdown.length < 10) throw new Error("Add a submission description before submitting");
    const links = String(ui.submitLinks?.value || "")
      .split(/\s+/)
      .map((row) => row.trim())
      .filter(Boolean);

    const isPumpFun = isPumpFunBounty();
    if (isPumpFun) {
      ui.submitForm?.querySelector('button[type="submit"]')?.setAttribute("disabled", "disabled");
      setAlert(ui.alert, "Submitting to Pump.fun through Pump-r...");
      const result = await submitPumpFunManualWork({ bodyMarkdown, links });
      closeModal(ui.submitModal);
      ui.submitForm.reset();
      if (ui.submitFileName) ui.submitFileName.textContent = "No file selected";
      await loadDetail(state.activeBounty.id);
      const attachedText = result.attachmentCount ? ` with ${result.attachmentCount} evidence file${result.attachmentCount === 1 ? "" : "s"}` : "";
      const linkAction = result.pumpFunLink ? { href: result.pumpFunLink, label: "Open on Pump.fun" } : null;
      setAgentSubmitStatus(`Manual submission published to Pump.fun${attachedText} (${result.submissionId}).`, "success", linkAction);
      setAlert(ui.alert, `Manual submission published to Pump.fun${attachedText}.`);
      return;
    }

    const identity = currentIdentity();
    let mediaUrl = String(ui.submitMedia?.value || "").trim();
    const file = ui.submitFile?.files?.[0] || null;
    if (file && !mediaUrl) {
      const upload = await uploadEvidenceAttachment(file);
      mediaUrl = upload?.url || "";
    }
    await api.submitGoWork(state.activeBounty.id, {
      body: bodyMarkdown,
      mediaUrl,
      links,
      author: identity.address,
      authorName: identity.name
    });
    closeModal(ui.submitModal);
    ui.submitForm.reset();
    if (ui.submitFileName) ui.submitFileName.textContent = "No file selected";
    await loadDetail(state.activeBounty.id);
    setAlert(ui.alert, "Submission posted");
  } catch (error) {
    setAlert(ui.alert, parseUiError(error), true);
  } finally {
    ui.submitForm?.querySelector('button[type="submit"]')?.removeAttribute("disabled");
  }
}

async function runAgentSubmit() {
  if (!state.activeBounty?.id) throw new Error("Open a bounty first");
  const agentId = String(ui.agentSelect?.value || "");
  if (!agentId) throw new Error("Create or select an agent first");
  const agent = state.agents.find((row) => row.id === agentId);
  if (!agent) throw new Error("Selected agent was not found");
  ui.runAgentBtn?.setAttribute("disabled", "disabled");
  setAgentSubmitStatus("Running agent on full bounty brief...");
  try {
    const identity = currentIdentity();
    const result = await api.agentRunBounty(agent.id, {
      owner: agent.owner || activeAgentOwner(),
      bountyId: state.activeBounty.id,
      author: identity.address,
      authorName: agent.name,
      generateConceptImage: Boolean(ui.agentGenerateImage?.checked) && !(ui.agentEvidenceFile?.files?.[0] || ui.submitFile?.files?.[0])
    });
    await loadDetail(state.activeBounty.id);
    if (result?.externalSubmitRequired) {
      const prepared = result.preparedSubmission || null;
      renderPumpFunBridge(prepared, result.externalSubmitUrl || "");
      if (!prepared?.id) throw new Error("Agent prepared the work, but no Pump.fun submit id was returned");
      const requestedGeneratedImage = Boolean(ui.agentGenerateImage?.checked) && !(ui.agentEvidenceFile?.files?.[0] || ui.submitFile?.files?.[0]);
      if (requestedGeneratedImage && !result?.generatedAttachment?.dataUrl) {
        throw new Error(result?.note || "OpenAI did not generate an attachable task-scene image. Choose an evidence file or turn off AI image generation.");
      }
      setAgentSubmitStatus("Submitting to Pump.fun with the configured server session...");
      try {
        const { publicKey } = await connectSolanaForPumpFun();
        await requirePumpFunSession();
        const attachments = await currentSubmitAttachments(result?.generatedAttachment || null);
        const direct = await api.pumpfunPreparedSubmit(prepared.id, { owner: publicKey, userPublicKey: publicKey, attachments });
        if (attachments.some((attachment) => attachment.dataUrl) && !Number(direct?.attachmentCount || 0)) {
          throw new Error("Pump.fun accepted the submission text but did not attach the selected file. Try a PNG/JPG/WebP/GIF under 5 MB or an MP4/WebM/MOV under 200 MB.");
        }
        const attachedText = Number(direct?.attachmentCount || 0) ? ` with ${Number(direct.attachmentCount)} evidence file${Number(direct.attachmentCount) === 1 ? "" : "s"}` : "";
        const suffix = direct?.submissionId ? ` (${direct.submissionId})` : "";
        const submissionId = String(direct?.submissionId || "");
        if (!submissionId) throw new Error("Pump.fun created a draft but did not return a submission id");
        const published = await publishPumpFunSubmission(submissionId);
        const pumpFunLink = String(published?.bounty?.sourceUrl || state.activeBounty?.sourceUrl || result.externalSubmitUrl || prepared.sourceUrl || "");
        await loadDetail(state.activeBounty.id);
        setAgentSubmitStatus(`Published to Pump.fun${attachedText}${suffix}.`, "success", pumpFunLink ? { href: pumpFunLink, label: "Open on Pump.fun" } : null);
        setAlert(ui.alert, pumpFunLink ? `Agent work published to Pump.fun${attachedText}. Link is shown in the submit panel.` : `Agent work published to Pump.fun${attachedText}.`);
      } catch (submitError) {
        const copied = await copyText(preparedPumpFunText(prepared) || result.body || "");
        const fallback = copied ? "AI work copied as fallback." : "Copy fallback failed; use Copy again below.";
        const message = `${parseUiError(submitError)}. Drafts are only visible to your Pump.fun session until Phantom signs the publish step. ${fallback}`;
        setAgentSubmitStatus(message, "error");
        setAlert(ui.alert, message, true);
      }
    } else {
      setAgentSubmitStatus(`${result?.note || "Agent run complete."} Submitted to bounty.`, "success");
      setAlert(ui.alert, "Agent work submitted");
    }
  } catch (error) {
    const message = parseUiError(error);
    setAgentSubmitStatus(message, "error");
    setAlert(ui.alert, message, true);
  } finally {
    ui.runAgentBtn?.removeAttribute("disabled");
  }
}

async function openExternalSubmit() {
  const bounty = state.activeBounty;
  if (!bounty?.sourceUrl) throw new Error("Original bounty link is not available");
  if (isPumpFunBounty(bounty)) {
    await submitDirectToPumpFun();
    return;
  }
  const body = String(ui.submitBody?.value || "").trim() || latestSubmissionText();
  const links = String(ui.submitLinks?.value || "").trim();
  const copied = await copyText([body, links].filter(Boolean).join("\n\n"));
  window.open(bounty.sourceUrl, "_blank", "noopener,noreferrer");
  setAlert(ui.alert, copied ? "Submission text copied. Paste it into Pump.fun." : "Opened original bounty");
}

async function submitDirectToPumpFun(options = {}) {
  const openFallback = options.openFallback !== false;
  const bounty = state.activeBounty;
  if (!bounty?.id) throw new Error("Open a Pump.fun bounty first");
  const latest = latestSubmission();
  const bodyMarkdown = String(ui.submitBody?.value || "").trim() || latestSubmissionText();
  if (!bodyMarkdown || bodyMarkdown.length < 10) {
    throw new Error("Submit work here or run an agent first, then open Pump.fun");
  }
  const links = [
    ...(String(ui.submitLinks?.value || "").split(/\s+/).map((row) => row.trim()).filter(Boolean)),
    ...(Array.isArray(latest?.links) ? latest.links : [])
  ].filter(Boolean).slice(0, 8);
  ui.externalSubmitBtn?.setAttribute("disabled", "disabled");
  try {
    const copied = await copyText([bodyMarkdown, ...links].filter(Boolean).join("\n\n"));
    if (openFallback && bounty.sourceUrl) {
      window.open(bounty.sourceUrl, "_blank", "noopener,noreferrer");
    }
    const message = copied
      ? "Agent work copied. Paste it into Pump.fun with your logged-in Pump.fun session."
      : "Open Pump.fun and paste the generated work into the submission form.";
    setAlert(ui.alert, message);
    setAgentSubmitStatus(message, "info");
    return { copied, opened: Boolean(openFallback && bounty.sourceUrl) };
  } finally {
    ui.externalSubmitBtn?.removeAttribute("disabled");
  }
}

function startGoLiveRefresh() {
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  const refresh = async () => {
    if (document.hidden) return;
    try {
      const activeId = state.activeBounty?.id || "";
      await loadList({ fresh: true });
      if (activeId) await loadDetail(activeId);
    } catch {
      // Keep background refresh quiet; the next manual action will surface errors.
    }
  };
  state.refreshTimer = window.setInterval(refresh, GO_REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}

async function init() {
  const xReturned = await handleXOAuthReturn();
  await initWallet();
  initSupportWidget({ alertEl: ui.alert });
  ui.tabs.forEach((button) => {
    button.addEventListener("click", async () => {
      state.tab = button.dataset.goTab || "trending";
      await loadList().catch((error) => setAlert(ui.alert, parseUiError(error), true));
    });
  });
  ui.search?.addEventListener("input", () => {
    state.query = ui.search.value.trim();
    if (!state.activeBounty) renderList();
  });
  ui.createBountyBtn?.addEventListener("click", () => {
    restoreBountyDraft();
    setBountyStep("details");
    openModal(ui.bountyModal);
  });
  ui.continueRewardsBtn?.addEventListener("click", () => {
    try {
      validateDetailsStep();
      saveBountyDraft();
      if (!hasXAuth()) {
        setAlert(ui.alert, "Authorize X to continue your bounty.");
        requestXAuthorization();
        return;
      }
      setBountyStep("rewards");
    } catch (error) {
      setAlert(ui.alert, parseUiError(error), true);
    }
  });
  ui.submitWorkBtn?.addEventListener("click", () => {
    updateSubmitModalCopy();
    openModal(ui.submitModal);
  });
  ui.externalSubmitBtn?.addEventListener("click", () => {
    openExternalSubmit().catch((error) => setAlert(ui.alert, parseUiError(error), true));
  });
  ui.savePumpFunSession?.addEventListener("click", async () => {
    try {
      const { publicKey } = await connectSolanaForPumpFun();
      const authToken = String(ui.pumpFunAuthToken?.value || "").trim();
      const cookieInput = String(ui.pumpFunCookie?.value || "").trim();
      const cookie = cookieInput || (authToken ? `auth_token=${authToken}` : "");
      const saved = await api.savePumpfunSession({ owner: publicKey, bearer: authToken, cookie });
      state.pumpFunSession = saved;
      renderPumpFunSession(saved);
      if (ui.pumpFunAuthToken) ui.pumpFunAuthToken.value = "";
      if (ui.pumpFunCookie) ui.pumpFunCookie.value = "";
      setPumpFunSessionMessage("Pump.fun session saved for this Phantom wallet.", "success");
    } catch (error) {
      setPumpFunSessionMessage(parseUiError(error), "error");
    }
  });
  ui.clearPumpFunSession?.addEventListener("click", async () => {
    try {
      const { publicKey } = await connectSolanaForPumpFun();
      state.pumpFunSession = await api.clearPumpfunSession(publicKey);
      renderPumpFunSession(state.pumpFunSession);
      setPumpFunSessionMessage("Pump.fun session cleared for this wallet.", "success");
    } catch (error) {
      setPumpFunSessionMessage(parseUiError(error), "error");
    }
  });
  ui.runAgentBtn?.addEventListener("click", runAgentSubmit);
  ui.pumpFunBridgeCopy?.addEventListener("click", async () => {
    const copied = await copyText(preparedPumpFunText());
    setAgentSubmitStatus(copied ? "AI submission copied. Paste it into Pump.fun's Description field." : "Could not copy AI submission.", copied ? "success" : "error");
  });
  ui.pumpFunBridgeBookmarklet?.addEventListener("click", async (event) => {
    event.preventDefault();
    const copied = await copyText(preparedPumpFunText());
    setAgentSubmitStatus(
      copied ? "AI submission copied. Paste it into Pump.fun's Description field." : "Could not copy AI submission.",
      copied ? "success" : "error"
    );
  });
  ui.pumpFunBridgeOpen?.addEventListener("click", () => {
    const url = ui.pumpFunBridgeOpen?.dataset.sourceUrl || state.preparedPumpFunSubmission?.sourceUrl || state.activeBounty?.sourceUrl || "";
    if (!url) {
      setAgentSubmitStatus("Pump.fun link is not available for this bounty.", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  });
  ui.submitChooseFile?.addEventListener("click", () => ui.submitFile?.click());
  ui.submitFile?.addEventListener("change", () => {
    const file = ui.submitFile?.files?.[0] || null;
    if (ui.submitFileName) ui.submitFileName.textContent = file?.name || "No file selected";
  });
  ui.agentEvidenceChoose?.addEventListener("click", () => ui.agentEvidenceFile?.click());
  ui.agentEvidenceFile?.addEventListener("change", () => {
    const file = ui.agentEvidenceFile?.files?.[0] || null;
    if (ui.agentEvidenceName) ui.agentEvidenceName.textContent = file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "No evidence file selected";
  });
  ui.submitAddLink?.addEventListener("click", () => ui.submitLinks?.focus());
  ui.bountyToken?.addEventListener("change", updateEscrowStatus);
  ui.submissionList?.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-release-submission]");
    if (!trigger) return;
    try {
      await releaseSubmission(trigger.dataset.releaseSubmission || "", trigger.dataset.winner || "");
    } catch (error) {
      setAlert(ui.alert, parseUiError(error), true);
    }
  });
  ui.bountyClose?.addEventListener("click", () => closeModal(ui.bountyModal));
  ui.bountyCancelBtns.forEach((button) => button.addEventListener("click", () => closeModal(ui.bountyModal)));
  ui.submitClose?.addEventListener("click", () => closeModal(ui.submitModal));
  ui.bountyForm?.addEventListener("submit", submitBounty);
  ui.submitForm?.addEventListener("submit", submitWork);

  const id = pathBountyId();
  try {
    if (id) {
      await loadList();
      await loadDetail(id);
    } else {
      await loadList();
    }
    startGoLiveRefresh();
    if ((xReturned || window.location.hash === "#create-bounty") && restoreBountyDraft()) {
      setBountyStep(hasXAuth() ? "rewards" : "details");
      openModal(ui.bountyModal);
    }
  } catch (error) {
    setAlert(ui.alert, parseUiError(error), true);
  }
}

init().catch((error) => setAlert(ui.alert, parseUiError(error), true));
