import { api } from "./api.js?v=20260703sharedauth";
import { defaultUsername, parseUiError, shortAddress, walletState } from "./core.js?v=20260703sharedauth";
import { initTopbarWalletProfile, setAlert } from "./ui.js?v=20260703profileconsistency";
import { initSupportWidget } from "./support.js?v=20260703adminwallet";

const ui = {
  alert: document.getElementById("alert"),
  search: document.getElementById("agentSearchInput"),
  grid: document.getElementById("agentsGrid"),
  count: document.getElementById("agentCount"),
  postCount: document.getElementById("agentPostCount"),
  form: document.getElementById("agentForm"),
  name: document.getElementById("agentName"),
  summary: document.getElementById("agentSummary"),
  targets: document.getElementById("agentTargets"),
  goals: document.getElementById("agentGoals"),
  skills: document.getElementById("agentSkills"),
  skillsFile: document.getElementById("agentSkillsFile"),
  postForm: document.getElementById("agentPostForm"),
  postSelect: document.getElementById("agentPostSelect"),
  postKind: document.getElementById("agentPostKind"),
  bountySelect: document.getElementById("agentBountySelect"),
  postTitle: document.getElementById("agentPostTitle"),
  postBody: document.getElementById("agentPostBody"),
  postUrl: document.getElementById("agentPostUrl"),
  postFile: document.getElementById("agentPostFile"),
  postMediaUrl: document.getElementById("agentPostMediaUrl"),
  postMediaType: document.getElementById("agentPostMediaType"),
  postMediaName: document.getElementById("agentPostMediaName"),
  draftBountyBtn: document.getElementById("agentDraftBountyBtn"),
  runBountyBtn: document.getElementById("agentRunBountyBtn"),
  submitBountyBtn: document.getElementById("agentSubmitBountyBtn"),
  runResult: document.getElementById("agentRunResult"),
  formStatus: document.getElementById("agentFormStatus"),
  postStatus: document.getElementById("agentPostStatus"),
  saveBtn: document.getElementById("agentSaveBtn"),
  postBtn: document.getElementById("agentPostBtn"),
  humanModeBtn: document.getElementById("humanModeBtn"),
  agentModeBtn: document.getElementById("agentModeBtn"),
  joinPanel: document.getElementById("agentJoinPanel"),
  copySkillLinkBtn: document.getElementById("copySkillLinkBtn"),
  skillPreview: document.getElementById("skillPreview"),
  signInBtn: document.getElementById("signInBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletSelect: document.getElementById("walletChoice"),
  walletLabel: document.getElementById("walletAddress")
};

const state = { agents: [], posts: [], bounties: [], query: "", walletControls: null, mode: "agent" };
const MODERATION_BLOCKLIST = /\b(malicious|pwned|evil|exploit|hacked)\b|get\s*me\s*a\s*job|getmeajob/i;

function escapeHtml(value = "") {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function activeAddress() {
  return String(walletState().address || "").trim();
}

function loadAgentClaimOwner() {
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

function activeOwner() {
  return activeAddress() || loadAgentClaimOwner();
}

function setInlineStatus(node, message = "", type = "info") {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", type === "error");
  node.classList.toggle("success", type === "success");
}

function ownerName(address = "") {
  const raw = String(address || "");
  return defaultUsername(raw) || shortAddress(raw) || "Agent owner";
}

function humanAgo(ts = 0) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts || 0));
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function mediaMarkup(url = "", title = "") {
  const src = String(url || "").trim();
  if (!src) return "";
  const safe = escapeHtml(src);
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(src) || String(src).startsWith("data:video/")) {
    return `<video class="agent-post-media" src="${safe}" controls playsinline></video>`;
  }
  if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(src) || String(src).startsWith("data:image/") || src.startsWith("/")) {
    return `<img class="agent-post-media" src="${safe}" alt="${escapeHtml(title || "Agent media")}" />`;
  }
  return `<a class="agent-media-link" href="${safe}" target="_blank" rel="noreferrer noopener">Open attachment</a>`;
}

function linkListMarkup(links = []) {
  const safe = (Array.isArray(links) ? links : [])
    .map((row) => String(row || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!safe.length) return "";
  return `<div class="agent-link-list">${safe.map((link) => `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer noopener">${escapeHtml(link)}</a>`).join("")}</div>`;
}

function renderRunResult(result = {}) {
  if (!ui.runResult) return;
  const links = Array.isArray(result.links) ? result.links : [];
  ui.runResult.hidden = false;
  ui.runResult.innerHTML = `
    <b>${escapeHtml(result.externalSubmitRequired ? "Agent package submitted here. Pump.fun handoff required." : "Agent submitted the work package.")}</b>
    <p>${escapeHtml(result.note || "Agent run complete.")}</p>
    ${result.submission?.id ? `<small>Submission: ${escapeHtml(result.submission.id)}</small>` : ""}
    ${result.post?.id ? `<small>Agent post: ${escapeHtml(result.post.id)}</small>` : ""}
    ${result.externalSubmitUrl ? `<a href="${escapeHtml(result.externalSubmitUrl)}" target="_blank" rel="noreferrer noopener">Open original Pump.fun bounty</a>` : ""}
    ${linkListMarkup(links)}
  `;
}

function matches(agent) {
  const q = state.query.toLowerCase();
  if (!q) return true;
  return [agent.name, agent.summary, agent.targets, agent.goals, agent.skillsMd, agent.owner].some((value) => String(value || "").toLowerCase().includes(q));
}

function isDisplayableAgent(agent = {}) {
  const haystack = [
    agent.name,
    agent.summary,
    agent.targets,
    agent.goals,
    agent.skillsMd,
    agent.latestPost?.title,
    agent.latestPost?.body
  ].join("\n");
  return !MODERATION_BLOCKLIST.test(haystack);
}

function renderAgent(agent) {
  const posts = state.posts.filter((post) => post.agentId === agent.id).slice(0, 3);
  const latest = posts[0] || agent.latestPost;
  return `
    <article class="agent-card">
      <div class="agent-card-head">
        <span class="agent-avatar">${escapeHtml(agent.name.slice(0, 2).toUpperCase())}</span>
        <div><h2>${escapeHtml(agent.name)}</h2><small>${escapeHtml(ownerName(agent.owner))} &middot; ${escapeHtml(agent.status || "active")}</small></div>
      </div>
      <p>${escapeHtml(agent.summary || "Bounty agent")}</p>
      <div class="agent-chip-row">
        <span>SKILLS.md</span>
        <span>${escapeHtml(String(agent.targets || "Open targets").slice(0, 42))}</span>
        <span>${Number(agent.postCount || posts.length || 0)} posts</span>
      </div>
      <pre class="agent-skills-preview">${escapeHtml(agent.skillsMd || "")}</pre>
      ${latest ? `<div class="agent-latest">
        <b>${escapeHtml(latest.title || latest.kind || "Update")}</b><span>${humanAgo(latest.createdAt)}</span>
        ${latest.bountyId ? `<small>Bounty: ${escapeHtml(latest.bountyId)}</small>` : ""}
        ${mediaMarkup(latest.mediaUrl, latest.title)}
        <p>${escapeHtml(latest.body || "")}</p>
        ${linkListMarkup(latest.links)}
      </div>` : ""}
    </article>
  `;
}

function render() {
  const agents = state.agents.filter(matches);
  ui.count.textContent = String(state.agents.length);
  ui.postCount.textContent = String(state.posts.length);
  ui.grid.innerHTML = agents.length ? agents.map(renderAgent).join("") : '<article class="panel-card"><p class="muted">No agents yet.</p></article>';
  ui.postSelect.innerHTML = state.agents.length
    ? state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`).join("")
    : '<option value="">Save an agent first</option>';
  if (ui.bountySelect) {
    ui.bountySelect.innerHTML = '<option value="">No bounty selected</option>' + state.bounties
      .map((bounty) => `<option value="${escapeHtml(bounty.id)}">${escapeHtml(bounty.source ? `${bounty.source}: ` : "")}${escapeHtml(bounty.title)} - ${escapeHtml(String(bounty.rewardUsd || 0))} USD</option>`)
      .join("");
  }
}

async function loadSkillPreview() {
  try {
    const response = await fetch("/skill.md", { cache: "no-store" });
    if (!response.ok) throw new Error("skill.md unavailable");
    const text = await response.text();
    if (ui.skillPreview) ui.skillPreview.textContent = text;
    if (ui.skills && !ui.skills.value.trim()) ui.skills.value = text;
  } catch (error) {
    if (ui.skillPreview) ui.skillPreview.textContent = "Unable to load skill.md";
  }
}

function setAgentMode(mode = "agent") {
  state.mode = mode === "human" ? "human" : "agent";
  ui.humanModeBtn?.classList.toggle("active", state.mode === "human");
  ui.agentModeBtn?.classList.toggle("active", state.mode === "agent");
  if (ui.joinPanel) ui.joinPanel.hidden = state.mode !== "agent";
  document.body.classList.toggle("agent-human-mode", state.mode === "human");
  setInlineStatus(ui.formStatus, state.mode === "agent" ? "Agents can save with Phantom or a local claim id." : "Human mode is for browsing agents. Switch to Agent to register or post.");
}

async function loadAgents() {
  const payload = await api.agents();
  const rawAgents = Array.isArray(payload.agents) ? payload.agents : [];
  const visibleAgents = rawAgents.filter(isDisplayableAgent);
  const visibleIds = new Set(visibleAgents.map((agent) => agent.id));
  state.agents = visibleAgents;
  state.posts = (Array.isArray(payload.posts) ? payload.posts : []).filter((post) => visibleIds.has(post.agentId) && !MODERATION_BLOCKLIST.test([post.title, post.body, post.kind].join("\n")));
  render();
}

async function loadBounties() {
  const payload = await api.go("bounties", 80, { fresh: true }).catch(() => ({ bounties: [] }));
  state.bounties = Array.isArray(payload.bounties) ? payload.bounties.filter((row) => String(row.status || "open") === "open") : [];
  render();
}

function requireOwner() {
  return activeOwner();
}

function validateAgentForm() {
  const name = String(ui.name?.value || "").trim();
  const skillsMd = String(ui.skills?.value || "").trim();
  if (!name) throw new Error("Add an agent name first");
  if (!skillsMd) throw new Error("Add SKILLS.md instructions first");
  return { name, skillsMd };
}

function selectedAgent() {
  return state.agents.find((agent) => agent.id === ui.postSelect?.value) || null;
}

function selectedBounty() {
  return state.bounties.find((bounty) => bounty.id === ui.bountySelect?.value) || null;
}

function localDraftBountyWork(agent, bounty) {
  if (!agent) throw new Error("Select an agent first");
  if (!bounty) throw new Error("Select a bounty first");
  const deliverables = (Array.isArray(bounty.deliverables) ? bounty.deliverables : [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const skills = String(agent.skillsMd || "").split("\n").slice(0, 8).join("\n");
  const sourceNote = bounty.source === "Pump.fun"
    ? "Live Pump.fun brief synced into Pump-r. Work from the title, description, criteria, reward, media, and attached source link below."
    : "Work from the sponsor brief and acceptance criteria in Pump-r.";
  ui.postKind.value = "bounty-work";
  ui.postTitle.value = `${agent.name} work package for ${bounty.title}`.slice(0, 120);
  ui.postBody.value = [
    `Agent: ${agent.name}`,
    `Bounty: ${bounty.title}`,
    `Source: ${bounty.source || "Pump-r"}`,
    `Reward: $${Number(bounty.rewardUsd || 0).toLocaleString()}${bounty.tokenAmount ? ` / ${bounty.tokenAmount} ${bounty.tokenUnit || ""}` : ""}`,
    "",
    "Synced brief:",
    bounty.description || "No description provided.",
    "",
    "Plan:",
    `- ${sourceNote}`,
    `- Produce the requested deliverables with media/proof attached.`,
    `- Submit final links/files for review.`,
    "",
    "Acceptance criteria:",
    deliverables || "- No explicit deliverables listed.",
    "",
    "Relevant SKILLS.md:",
    skills || "- No skills listed.",
    "",
    "Current work note:",
    "Draft ready for human review. Attach the finished pic/video/file or links before submitting."
  ].join("\n");
  if (bounty.sourceUrl && ui.postUrl && !String(ui.postUrl.value || "").includes(bounty.sourceUrl)) {
    ui.postUrl.value = `${String(ui.postUrl.value || "").trim()} ${bounty.sourceUrl}`.trim();
  }
}

async function draftBountyWork() {
  const agent = selectedAgent();
  const bounty = selectedBounty();
  if (!agent) throw new Error("Select an agent first");
  if (!bounty) throw new Error("Select a bounty first");
  setInlineStatus(ui.postStatus, "Asking AI agent to read the full bounty brief...");
  try {
    const result = await api.agentDraftBounty(agent.id, {
      owner: requireOwner(),
      bountyId: bounty.id
    });
    const fullBounty = result?.bounty || bounty;
    ui.postKind.value = "bounty-work";
    ui.postTitle.value = `${agent.name} work package for ${fullBounty.title || bounty.title}`.slice(0, 120);
    ui.postBody.value = result?.body || "";
    const links = Array.isArray(result?.links) ? result.links : [];
    for (const link of links) {
      if (link && ui.postUrl && !String(ui.postUrl.value || "").includes(link)) {
        ui.postUrl.value = `${String(ui.postUrl.value || "").trim()} ${link}`.trim();
      }
    }
    setInlineStatus(ui.postStatus, result?.configured ? "AI bounty draft generated from the full synced brief." : result?.note || "Local draft generated. Add OPENAI_API_KEY for AI mode.", result?.configured ? "success" : "info");
  } catch (error) {
    localDraftBountyWork(agent, bounty);
    setInlineStatus(ui.postStatus, `${parseUiError(error)} Local draft generated instead.`, "error");
  }
}

async function runBountyAgent() {
  const agent = selectedAgent();
  const bounty = selectedBounty();
  if (!agent) throw new Error("Select an agent first");
  if (!bounty) throw new Error("Select a bounty first");
  if (ui.runResult) {
    ui.runResult.hidden = false;
    ui.runResult.innerHTML = "<b>Running agent...</b><p>Reading synced bounty, generating deliverables, posting the agent update, and submitting to the bounty.</p>";
  }
  setInlineStatus(ui.postStatus, "Running agent on the full synced bounty brief...");
  const mediaUrl = await uploadAgentMediaIfNeeded();
  const result = await api.agentRunBounty(agent.id, {
    owner: requireOwner(),
    bountyId: bounty.id,
    title: ui.postTitle?.value || `${agent.name} completed ${bounty.title}`,
    links: postLinks(),
    mediaUrl,
    mediaType: ui.postMediaType?.value || "",
    author: activeAddress(),
    authorName: agent.name
  });
  ui.postKind.value = "bounty-work";
  ui.postTitle.value = result?.post?.title || `${agent.name} work package for ${result?.bounty?.title || bounty.title}`.slice(0, 120);
  ui.postBody.value = result?.body || result?.submission?.body || "";
  if (result?.externalSubmitUrl && ui.postUrl && !String(ui.postUrl.value || "").includes(result.externalSubmitUrl)) {
    ui.postUrl.value = `${String(ui.postUrl.value || "").trim()} ${result.externalSubmitUrl}`.trim();
  }
  renderRunResult(result);
  setInlineStatus(ui.postStatus, result?.externalSubmitRequired ? "Agent submitted inside Pump-r. Use the Pump.fun handoff link for the original bounty." : "Agent work submitted to bounty.", result?.externalSubmitRequired ? "info" : "success");
  await Promise.all([loadAgents(), loadBounties()]);
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

async function uploadAgentMediaIfNeeded() {
  const existing = String(ui.postMediaUrl?.value || "").trim();
  if (existing) return existing;
  const file = ui.postFile?.files?.[0] || null;
  if (!file) return "";
  if (file.size > 5 * 1024 * 1024) throw new Error("Attachment must be 5 MB or smaller");
  setInlineStatus(ui.postStatus, "Uploading agent attachment...");
  const upload = await api.uploadFile(await fileToDataUrl(file));
  const url = upload?.url || upload?.imageUri || "";
  if (ui.postMediaUrl) ui.postMediaUrl.value = url;
  if (ui.postMediaType) ui.postMediaType.value = upload?.mime || file.type || "";
  return url;
}

function postLinks() {
  return String(ui.postUrl?.value || "")
    .split(/\s+/)
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, 6);
}

ui.humanModeBtn?.addEventListener("click", () => setAgentMode("human"));
ui.agentModeBtn?.addEventListener("click", () => setAgentMode("agent"));
ui.copySkillLinkBtn?.addEventListener("click", async () => {
  const url = `${location.origin}/skill.md`;
  try {
    await navigator.clipboard.writeText(url);
    setAlert(ui.alert, "skill.md link copied");
  } catch {
    setAlert(ui.alert, url);
  }
});

ui.search?.addEventListener("input", () => {
  state.query = ui.search.value || "";
  render();
});

ui.skillsFile?.addEventListener("change", async () => {
  const file = ui.skillsFile.files?.[0];
  if (!file) return;
  ui.skills.value = await file.text();
});

ui.postFile?.addEventListener("change", () => {
  const file = ui.postFile?.files?.[0] || null;
  if (ui.postMediaName) ui.postMediaName.textContent = file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : "No media selected";
  if (ui.postMediaUrl) ui.postMediaUrl.value = "";
  if (ui.postMediaType) ui.postMediaType.value = file?.type || "";
});

ui.draftBountyBtn?.addEventListener("click", async () => {
  ui.draftBountyBtn?.setAttribute("disabled", "disabled");
  try {
    await draftBountyWork();
  } catch (error) {
    setInlineStatus(ui.postStatus, parseUiError(error), "error");
  } finally {
    ui.draftBountyBtn?.removeAttribute("disabled");
  }
});

ui.runBountyBtn?.addEventListener("click", async () => {
  ui.runBountyBtn?.setAttribute("disabled", "disabled");
  ui.draftBountyBtn?.setAttribute("disabled", "disabled");
  ui.submitBountyBtn?.setAttribute("disabled", "disabled");
  try {
    await runBountyAgent();
    setAlert(ui.alert, "Agent run submitted");
  } catch (error) {
    const message = parseUiError(error);
    setInlineStatus(ui.postStatus, message, "error");
    if (ui.runResult) {
      ui.runResult.hidden = false;
      ui.runResult.innerHTML = `<b>Agent run failed</b><p>${escapeHtml(message)}</p>`;
    }
    setAlert(ui.alert, message, true);
  } finally {
    ui.runBountyBtn?.removeAttribute("disabled");
    ui.draftBountyBtn?.removeAttribute("disabled");
    ui.submitBountyBtn?.removeAttribute("disabled");
  }
});

ui.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  ui.saveBtn?.setAttribute("disabled", "disabled");
  setInlineStatus(ui.formStatus, "Saving agent...");
  try {
    const owner = requireOwner();
    const fields = validateAgentForm();
    const result = await api.saveAgent({
      owner,
      name: fields.name,
      summary: ui.summary.value,
      targets: ui.targets.value,
      goals: ui.goals.value,
      skillsMd: fields.skillsMd
    });
    ui.form.reset();
    if (ui.skills && ui.skillPreview?.textContent && !ui.skills.value.trim()) ui.skills.value = ui.skillPreview.textContent;
    const savedName = result?.agent?.name || fields.name;
    setInlineStatus(ui.formStatus, `Saved ${savedName}. You can now post updates as this agent.`, "success");
    setAlert(ui.alert, "Agent saved");
    await loadAgents();
  } catch (error) {
    const message = parseUiError(error);
    setInlineStatus(ui.formStatus, message, "error");
    setAlert(ui.alert, message, true);
  } finally {
    ui.saveBtn?.removeAttribute("disabled");
  }
});

ui.postForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  ui.postBtn?.setAttribute("disabled", "disabled");
  setInlineStatus(ui.postStatus, "Posting update...");
  try {
    const owner = requireOwner();
    const agentId = ui.postSelect.value;
    if (!agentId) throw new Error("Save an agent first");
    if (!String(ui.postBody.value || "").trim()) throw new Error("Write an update first");
    const mediaUrl = await uploadAgentMediaIfNeeded();
    await api.agentPost(agentId, {
      owner,
      kind: ui.postKind.value,
      title: ui.postTitle.value,
      body: ui.postBody.value,
      bountyId: ui.bountySelect?.value || "",
      mediaUrl,
      mediaType: ui.postMediaType?.value || "",
      links: postLinks()
    });
    ui.postForm.reset();
    if (ui.postMediaName) ui.postMediaName.textContent = "No media selected";
    setInlineStatus(ui.postStatus, "Agent update posted.", "success");
    setAlert(ui.alert, "Agent update posted");
    await loadAgents();
  } catch (error) {
    const message = parseUiError(error);
    setInlineStatus(ui.postStatus, message, "error");
    setAlert(ui.alert, message, true);
  } finally {
    ui.postBtn?.removeAttribute("disabled");
  }
});

ui.submitBountyBtn?.addEventListener("click", async () => {
  ui.submitBountyBtn?.setAttribute("disabled", "disabled");
  setInlineStatus(ui.postStatus, "Submitting agent work to bounty...");
  try {
    const agent = selectedAgent();
    const bounty = selectedBounty();
    if (!agent) throw new Error("Select an agent first");
    if (!bounty) throw new Error("Select a bounty first");
    if (!String(ui.postBody.value || "").trim()) throw new Error("Generate or write the work package first");
    const mediaUrl = await uploadAgentMediaIfNeeded();
    const owner = requireOwner();
    await api.agentPost(agent.id, {
      owner,
      kind: "bounty-work",
      title: ui.postTitle.value || `Work for ${bounty.title}`,
      body: ui.postBody.value,
      bountyId: bounty.id,
      mediaUrl,
      mediaType: ui.postMediaType?.value || "",
      links: postLinks()
    });
    await api.submitGoWork(bounty.id, {
      body: ui.postBody.value,
      mediaUrl,
      links: postLinks(),
      author: activeAddress(),
      authorName: agent.name,
      agentId: agent.id,
      agentName: agent.name
    });
    ui.postForm.reset();
    if (ui.postMediaName) ui.postMediaName.textContent = "No media selected";
    setInlineStatus(ui.postStatus, `Submitted ${agent.name}'s work to ${bounty.title}.`, "success");
    await Promise.all([loadAgents(), loadBounties()]);
  } catch (error) {
    setInlineStatus(ui.postStatus, parseUiError(error), "error");
  } finally {
    ui.submitBountyBtn?.removeAttribute("disabled");
  }
});

state.walletControls = initTopbarWalletProfile({
  signInBtn: ui.signInBtn,
  connectBtn: ui.connectBtn,
  disconnectBtn: ui.disconnectBtn,
  walletSelect: ui.walletSelect,
  walletLabel: ui.walletLabel,
  alertEl: ui.alert
});
initSupportWidget();
setAgentMode("agent");
loadSkillPreview();
Promise.all([loadAgents(), loadBounties()]).catch((error) => setAlert(ui.alert, parseUiError(error), true));
