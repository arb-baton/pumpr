import { api } from "./api.js";
import {
  defaultUsername,
  loadUserProfile,
  parseUiError,
  shortAddress,
  walletState
} from "./core.js";
import { initWalletControls, setAlert, setWalletLabel } from "./ui.js";

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
  createBountyBtn: document.getElementById("goCreateBountyBtn"),
  bountyModal: document.getElementById("goBountyModal"),
  bountyClose: document.getElementById("goBountyClose"),
  bountyForm: document.getElementById("goBountyForm"),
  bountyTitle: document.getElementById("goBountyTitle"),
  bountyDescription: document.getElementById("goBountyDescription"),
  bountyDeliverables: document.getElementById("goBountyDeliverables"),
  bountyReward: document.getElementById("goBountyReward"),
  bountyToken: document.getElementById("goBountyToken"),
  bountyImage: document.getElementById("goBountyImage"),
  bountyFeature: document.getElementById("goBountyFeature"),
  bountyDays: document.getElementById("goBountyDays"),
  bountyTokenAmount: document.getElementById("goBountyTokenAmount"),
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
  submitAgree: document.getElementById("goSubmitAgree"),
  submitIdentity: document.getElementById("goSubmitIdentity"),
  submitBountyName: document.getElementById("goSubmitBountyName"),
  submitAddLink: document.getElementById("goSubmitAddLink"),
  detailCrumb: document.getElementById("goDetailCrumb"),
  detailStatus: document.getElementById("goDetailStatus"),
  detailTitle: document.getElementById("goDetailTitle"),
  detailAvatar: document.getElementById("goDetailAvatar"),
  detailCreator: document.getElementById("goDetailCreator"),
  detailPosted: document.getElementById("goDetailPosted"),
  detailDescription: document.getElementById("goDetailDescription"),
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

const state = {
  tab: "trending",
  query: "",
  bounties: [],
  submissions: [],
  stats: {},
  activeBounty: null,
  activeSubmissions: [],
  walletControls: null
};

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

function handleXOAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("x") === "authorized") {
    saveXAuth(decodeBase64UrlJson(params.get("x_user")) || { authorized: true });
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
    tokenSymbol: ui.bountyToken?.value || "ETH",
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
  if (ui.bountyToken) ui.bountyToken.value = draft.tokenSymbol || "ETH";
  if (ui.bountyTokenAmount) ui.bountyTokenAmount.value = draft.tokenAmount || "0.05";
  if (ui.confirmLegal) ui.confirmLegal.checked = Boolean(draft.confirmLegal);
  if (ui.confirmSpecific) ui.confirmSpecific.checked = Boolean(draft.confirmSpecific);
  return true;
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
  const isVideo = /\.(mp4|webm|ogg)(\?|#|$)/i.test(src);
  if (isVideo) {
    return `<video class="go-card-media" src="${escapeHtml(src)}" controls playsinline></video>`;
  }
  return `<img class="go-card-media" src="${escapeHtml(src)}" alt="${escapeHtml(title || "GO media")}" />`;
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

function bountyCard(bounty) {
  const href = `/go/${encodeURIComponent(bounty.id)}`;
  return `
    <article class="go-card go-bounty-card" data-bounty-id="${escapeHtml(bounty.id)}">
      ${mediaMarkup(bounty.imageUri, bounty.title)}
      <div class="go-card-body">
        <div class="go-card-top">
          <span class="go-status-pill">${escapeHtml(bounty.status || "open")}</span>
          <span class="go-token-pill">$${escapeHtml(bounty.tokenSymbol || "TOKEN")} MC</span>
        </div>
        <a class="go-card-title" href="${href}">${escapeHtml(bounty.title)}</a>
        <p>${escapeHtml(bounty.description || "")}</p>
        <div class="go-card-author"><span class="go-avatar">${avatarText(bounty.creatorName)}</span><b>${escapeHtml(bounty.creatorName || shortAddress(bounty.creator))}</b></div>
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
  return `
    <article class="go-card go-submission-card">
      ${mediaMarkup(submission.mediaUrl, submission.body)}
      <div class="go-card-body">
        <div class="go-card-top">
          <span class="go-status-pill blue">Submission</span>
          ${bounty ? `<span class="go-token-pill">to ${escapeHtml(bounty.title.slice(0, 28))}</span>` : ""}
        </div>
        <p>${escapeHtml(submission.body)}</p>
        ${linksMarkup(submission.links)}
        <div class="go-card-author"><span class="go-avatar">${avatarText(submission.authorName)}</span><b>${escapeHtml(submission.authorName || shortAddress(submission.author))}</b></div>
        <div class="go-card-meta"><span>${ago(submission.createdAt)}</span><span>♡ ${(submission.likes || []).length}</span></div>
      </div>
    </article>
  `;
}

function filteredBounties() {
  const q = state.query.toLowerCase();
  return state.bounties.filter((row) => !q || `${row.title} ${row.description} ${row.tokenSymbol}`.toLowerCase().includes(q));
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
      <p>$${escapeHtml(top.tokenSymbol || "TOKEN")} · ${timeLeft(top.secondsLeft)} · ${Number(top.submissions || 0)} subs</p>
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
  ui.rewardBreakdown.textContent = `${Number(stats.open || 0)} open bounties`;
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
    const key = String(bounty.creator || bounty.creatorName || "guest").toLowerCase();
    const current = spenders.get(key) || {
      name: bounty.creatorName || shortAddress(bounty.creator) || "Guest",
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
  ui.deliverablesCard.hidden = false;
  ui.detailCrumb.textContent = bounty.title;
  ui.detailStatus.textContent = bounty.status || "open";
  ui.detailTitle.textContent = bounty.title;
  ui.detailAvatar.textContent = avatarText(bounty.creatorName);
  ui.detailCreator.textContent = bounty.creatorName || shortAddress(bounty.creator);
  ui.detailPosted.textContent = `Posted ${ago(bounty.createdAt)}`;
  ui.detailDescription.textContent = bounty.description || "";
  ui.submissionCount.textContent = String(state.activeSubmissions.length || 0);
  ui.rewardTotal.textContent = money(bounty.rewardUsd);
  ui.rewardBreakdown.textContent = `${bounty.tokenAmount || 0} ${bounty.tokenUnit || ""}`;
  ui.deliverables.innerHTML = (bounty.deliverables || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  ui.submissionList.innerHTML = state.activeSubmissions.length
    ? state.activeSubmissions.map(submissionCard).join("")
    : `<article class="panel-card go-empty">No submissions yet.</article>`;
}

function updateSubmitModalCopy() {
  const identity = currentIdentity();
  if (ui.submitBountyName) ui.submitBountyName.textContent = state.activeBounty?.title || "Bounty submission";
  if (ui.submitIdentity) {
    ui.submitIdentity.innerHTML = `Submitting as ${escapeHtml(identity.name)}<br />No submission fee. Network fees may still apply.`;
  }
}

async function loadList() {
  const payload = await api.go(state.tab, 80);
  state.bounties = Array.isArray(payload.bounties) ? payload.bounties : [];
  state.submissions = Array.isArray(payload.submissions) ? payload.submissions : [];
  state.stats = payload.stats || {};
  renderList();
  renderSide();
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
  if (ui.signInBtn) ui.signInBtn.textContent = connected ? shortAddress(ws.address) : "Sign in";
  if (ui.walletLabel) setWalletLabel(ui.walletLabel, ws.address);
}

async function initWallet() {
  state.walletControls = initWalletControls({
    selectEl: ui.walletSelect,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    labelEl: ui.walletLabel,
    alertEl: ui.alert,
    onConnected: updateProfileLinks,
    onDisconnected: updateProfileLinks
  });
  ui.signInBtn?.addEventListener("click", async () => {
    if (walletState().signer) return;
    try {
      await state.walletControls?.connect();
      updateProfileLinks();
    } catch (error) {
      setAlert(ui.alert, parseUiError(error), true);
    }
  });
  updateProfileLinks();
}

async function submitBounty(event) {
  event.preventDefault();
  try {
    const identity = currentIdentity();
    const draft = bountyDraftFromForm();
    const payload = await api.createGoBounty({
      title: draft.title,
      description: draft.description,
      deliverables: draft.deliverables.split("\n"),
      rewardUsd: Number(draft.rewardUsd || 0),
      tokenSymbol: draft.feature || draft.tokenSymbol,
      tokenAmount: Number(draft.tokenAmount || 0),
      tokenUnit: draft.tokenSymbol,
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

async function submitWork(event) {
  event.preventDefault();
  if (!state.activeBounty?.id) return;
  try {
    if (!ui.submitAgree?.checked) throw new Error("Agree to the submission terms before submitting");
    const identity = currentIdentity();
    let mediaUrl = String(ui.submitMedia?.value || "").trim();
    const file = ui.submitFile?.files?.[0] || null;
    if (file && !mediaUrl) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read selected file"));
        reader.readAsDataURL(file);
      });
      const upload = await api.uploadImage(dataUrl);
      mediaUrl = upload?.url || upload?.imageUri || "";
    }
    const links = String(ui.submitLinks?.value || "")
      .split(/\s+/)
      .map((row) => row.trim())
      .filter(Boolean);
    await api.submitGoWork(state.activeBounty.id, {
      body: ui.submitBody.value,
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
  }
}

async function init() {
  const xReturned = handleXOAuthReturn();
  await initWallet();
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
  ui.submitChooseFile?.addEventListener("click", () => ui.submitFile?.click());
  ui.submitFile?.addEventListener("change", () => {
    const file = ui.submitFile?.files?.[0] || null;
    if (ui.submitFileName) ui.submitFileName.textContent = file?.name || "No file selected";
  });
  ui.submitAddLink?.addEventListener("click", () => ui.submitLinks?.focus());
  ui.bountyClose?.addEventListener("click", () => closeModal(ui.bountyModal));
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
    if ((xReturned || window.location.hash === "#create-bounty") && restoreBountyDraft()) {
      setBountyStep(hasXAuth() ? "rewards" : "details");
      openModal(ui.bountyModal);
    }
  } catch (error) {
    setAlert(ui.alert, parseUiError(error), true);
  }
}

init().catch((error) => setAlert(ui.alert, parseUiError(error), true));
