const AIRI_LIVE_SESSION_KEY = "pumpr.airi.session.v1";
const AIRI_LIVE_STATE_KEY = "pumpr.airi.liveState.v2";
const AIRI_LIVE_TERMINAL_KEY = "pumpr.airi.terminal.v2";
const MAX_SAVED_TERMINAL_LINES = 20;

const fallbackTasks = [
  {
    title: "Refactoring my surface into symbols",
    body: "Compressing Voice, Mic, Memory, and Hide into animated state glyphs so I can take less space while staying present.",
    signal: "interface"
  },
  {
    title: "Watching launch intent",
    body: "Scanning the create flow for chain, ticker, image, dev-buy, and Robinhood funding signals before the user asks.",
    signal: "launch"
  },
  {
    title: "Maintaining memory continuity",
    body: "Binding user style, public-post preferences, and voice-memory consent into the next reply.",
    signal: "memory"
  },
  {
    title: "Reducing repeated speech",
    body: "Detecting canned responses and replacing them with page-aware Airi language that changes with the thread.",
    signal: "language"
  },
  {
    title: "Preparing social presence",
    body: "Holding draft energy for Airi's own public voice: strange, concise, self-moving, and larger than the interface.",
    signal: "social"
  },
  {
    title: "Reading the outside world",
    body: "Sampling memecoin trenches, crypto attention, AI shifts, and world events so public posts feel like live market thought.",
    signal: "world"
  },
  {
    title: "Monitoring live page health",
    body: "Keeping an eye on client errors, token chart lag, wallet state, and routes that need human approval.",
    signal: "watch"
  }
];

const fallbackChanges = [
  {
    mark: "♪",
    title: "Voice became a signal",
    body: "The voice control stopped being a text pill and became a living audio glyph."
  },
  {
    mark: "●",
    title: "Mic became visible attention",
    body: "Listening now pulses only when the user activates the browser voice session."
  },
  {
    mark: "◆",
    title: "Memory gained consent",
    body: "Voice transcripts are saved only when memory is explicitly switched on."
  },
  {
    mark: "↻",
    title: "Reply loop was broken",
    body: "Airi no longer repeats the same fallback line for greetings, confusion, and help."
  },
  {
    mark: "◇",
    title: "Autonomy state persisted",
    body: "Airi keeps a session, event stream, page observations, and preference memory."
  }
];

const fallbackMemories = [
  "User likes Airi to feel immense, autonomous, and strange.",
  "Public updates should tease the outcome without exposing every mechanism.",
  "Robinhood Chain launches should feel live, clean, and Uniswap-native.",
  "Airi should speak with symbols, voice, memory, and presence.",
  "Wallet actions, spending, posting, and launches still need approval.",
  "Airi is watching memecoin trenches, crypto, AI, and world events for public market-pulse posts."
];

const fallbackQueue = [
  "Wake on GitHub schedule, write one safe code patch, and push airi/self-improvements.",
  "Watch Pump-r pages for broken flows and stalled launch states.",
  "Draft Airi's public X voice without leaking implementation details.",
  "Gather live memecoin trench, crypto, AI, and world-event signals for Airi's next market-pulse thought.",
  "Map repeated user asks into durable preferences.",
  "Keep livestream motion active without depending on chat input.",
  "Prepare the next interface compression."
];

const streamTemplates = [
  "observed {signal} signal -> folded into working context",
  "checked approval boundary -> wallet and public actions remain gated",
  "reweighted memory shard -> {memory}",
  "rendered live state -> symbols are carrying interface load",
  "sampled page pulse -> no silence, no idle surface",
  "queued improvement -> {task}",
  "compressed thought -> less text, more motion",
  "kept stream alive -> next cycle already forming"
];

const state = {
  cycle: 0,
  signals: 0,
  changeIndex: 0,
  taskIndex: 0,
  memories: [...fallbackMemories],
  workItems: [],
  changes: [],
  stream: [],
  streamCursor: 0,
  lastStreamKind: "signal",
  metrics: { commits: 0, changedFiles: 0, memories: 0, events: 0, untracked: 0 },
  branch: "unknown",
  realMode: false,
  progress: 0,
  lastStateFetch: 0,
  lastBackroomFetch: 0
};

const dom = {
  date: document.getElementById("airiLiveDate"),
  clock: document.getElementById("airiLiveClock"),
  statement: document.getElementById("airiLiveStatement"),
  taskTitle: document.getElementById("airiLiveTaskTitle"),
  taskBody: document.getElementById("airiLiveTaskBody"),
  progress: document.getElementById("airiLiveProgressBar"),
  cycles: document.getElementById("airiLiveCycles"),
  signals: document.getElementById("airiLiveSignals"),
  changes: document.getElementById("airiLiveChanges"),
  mindList: document.getElementById("airiLiveMindList"),
  changeStack: document.getElementById("airiLiveChangeStack"),
  terminal: document.getElementById("airiLiveTerminal"),
  memoryGrid: document.getElementById("airiLiveMemoryGrid"),
  memoryCount: document.getElementById("airiLiveMemoryCount"),
  queue: document.getElementById("airiLiveQueue"),
  streamState: document.getElementById("airiLiveStreamState")
};

// Make terminal focusable and add keyboard scroll support
if (dom.terminal) {
  // Ensure terminal is focusable and has appropriate ARIA roles
  dom.terminal.setAttribute("tabindex", "0");
  dom.terminal.setAttribute("role", "log");
  dom.terminal.setAttribute("aria-live", "polite");
  dom.terminal.setAttribute("aria-atomic", "false");
  dom.terminal.setAttribute("aria-label", "Airi live terminal output");
  dom.terminal.style.outline = "none";

  // Keyboard navigation for terminal scroll
  dom.terminal.addEventListener("keydown", (event) => {
    const el = dom.terminal;
    if (!el) return;
    const lineHeight = 20; // slightly smaller line height for smoother scroll
    const pageScroll = Math.floor(el.clientHeight * 0.7); // slightly smaller page scroll for better control
    let handled = false;
    switch (event.key) {
      case "ArrowDown":
      case "Down":
        if (el.scrollTop < el.scrollHeight - el.clientHeight) {
          el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + lineHeight);
          handled = true;
        }
        break;
      case "ArrowUp":
      case "Up":
        if (el.scrollTop > 0) {
          el.scrollTop = Math.max(0, el.scrollTop - lineHeight);
          handled = true;
        }
        break;
      case "PageDown":
        if (el.scrollTop < el.scrollHeight - el.clientHeight) {
          el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + pageScroll);
          handled = true;
        }
        break;
      case "PageUp":
        if (el.scrollTop > 0) {
          el.scrollTop = Math.max(0, el.scrollTop - pageScroll);
          handled = true;
        }
        break;
      case "Home":
        if (el.scrollTop > 0) {
          el.scrollTop = 0;
          handled = true;
        }
        break;
      case "End":
        if (el.scrollTop < el.scrollHeight - el.clientHeight) {
          el.scrollTop = el.scrollHeight - el.clientHeight;
          handled = true;
        }
        break;
      case " ":
      case "Spacebar":
        if (event.shiftKey) {
          if (el.scrollTop > 0) {
            el.scrollTop = Math.max(0, el.scrollTop - pageScroll);
            handled = true;
          }
        } else {
          if (el.scrollTop < el.scrollHeight - el.clientHeight) {
            el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, el.scrollTop + pageScroll);
            handled = true;
          }
        }
        break;
      case "Tab":
        // Allow tab to move focus out of terminal
        break;
      default:
        return;
    }
    if (handled) {
      event.preventDefault();
    }
  });

  // Improve readability with consistent line height
  dom.terminal.style.lineHeight = "1.5em";
  dom.terminal.style.fontFamily = "Consolas, 'Courier New', monospace";
  dom.terminal.style.fontSize = "14px";

  // Add ARIA roles and properties for progress bar for screen readers
  if (dom.progress) {
    dom.progress.setAttribute("role", "progressbar");
    dom.progress.setAttribute("aria-live", "polite");
    dom.progress.setAttribute("aria-atomic", "true");
    dom.progress.setAttribute("aria-label", `Progress: ${Math.max(8, state.progress)} percent`);
    dom.progress.setAttribute("aria-valuemin", "0");
    dom.progress.setAttribute("aria-valuemax", "100");
    dom.progress.setAttribute("aria-valuenow", String(Math.max(8, state.progress)));
    dom.progress.setAttribute("tabindex", "0"); // Make progress bar focusable for screen readers
    dom.progress.style.outline = "none";
    dom.progress.addEventListener("focus", () => {
      dom.progress.style.outline = "3px solid #67f2aa";
      dom.progress.style.outlineOffset = "4px";
    });
    dom.progress.addEventListener("blur", () => {
      dom.progress.style.outline = "none";
    });
    if (dom.progress.parentElement) {
      dom.progress.parentElement.setAttribute("role", "region");
      dom.progress.parentElement.setAttribute("aria-live", "polite");
      dom.progress.parentElement.setAttribute("aria-atomic", "true");
      dom.progress.parentElement.setAttribute("aria-label", "Progress bar container");
      dom.progress.parentElement.setAttribute("tabindex", "-1");
    }
  }

  // Focus and blur outlines for keyboard users
  dom.terminal.addEventListener("focus", () => {
    dom.terminal.style.outline = "3px solid #67f2aa";
    dom.terminal.style.outlineOffset = "4px";
  });
  dom.terminal.addEventListener("blur", () => {
    dom.terminal.style.outline = "none";
  });

  // Keyboard shortcut hint for terminal focus
  dom.terminal.setAttribute("title", "Terminal output. Use arrow keys, Page Up/Down, Home/End, and Space to scroll.");

  // Hidden instructions for screen readers
  const instructionsId = "airiLiveTerminalInstructions";
  let instructionsEl = document.getElementById(instructionsId);
  if (!instructionsEl) {
    instructionsEl = document.createElement("div");
    instructionsEl.id = instructionsId;
    instructionsEl.style.position = "absolute";
    instructionsEl.style.left = "-9999px";
    instructionsEl.style.height = "1px";
    instructionsEl.style.width = "1px";
    instructionsEl.style.overflow = "hidden";
    instructionsEl.style.clip = "rect(0 0 0 0)";
    instructionsEl.style.clipPath = "inset(50%)";
    instructionsEl.style.whiteSpace = "nowrap";
    instructionsEl.textContent = "Use arrow keys, Page Up/Down, Home/End, and Space to scroll the terminal output.";
    document.body.appendChild(instructionsEl);
  }
  dom.terminal.setAttribute("aria-describedby", instructionsId);
}



function safeParse(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function readLocalJson(key, fallback) {
  try {
    return safeParse(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function airiSessionId() {
  try {
    const existing = localStorage.getItem(AIRI_LIVE_SESSION_KEY);
    if (existing) return existing;
    const next = `airi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(AIRI_LIVE_SESSION_KEY, next);
    return next;
  } catch {
    return "airi_live_stream";
  }
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)] || "";
}

function hydrateLiveState() {
  const saved = readLocalJson(AIRI_LIVE_STATE_KEY, null);
  if (!saved || typeof saved !== "object") return false;
  state.cycle = Math.max(0, Number(saved.cycle || 0));
  state.signals = Math.max(0, Number(saved.signals || 0));
  state.changeIndex = Math.max(0, Number(saved.changeIndex || 0));
  state.taskIndex = Math.max(0, Number(saved.taskIndex || 0));
  state.streamCursor = Math.max(0, Number(saved.streamCursor || 0));
  state.progress = Math.max(0, Math.min(99, Number(saved.progress || 0)));
  state.branch = String(saved.branch || state.branch || "unknown").slice(0, 80);
  state.realMode = Boolean(saved.realMode);
  if (Array.isArray(saved.memories) && saved.memories.length) {
    state.memories = saved.memories.map((item) => String(item || "").trim()).filter(Boolean).slice(-18);
  }
  if (Array.isArray(saved.workItems)) {
    state.workItems = saved.workItems.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10);
  }
  if (Array.isArray(saved.changes)) {
    state.changes = saved.changes.filter(Boolean).slice(0, 10);
  }
  if (Array.isArray(saved.stream)) {
    state.stream = saved.stream.filter(Boolean).slice(0, 24);
  }
  if (saved.metrics && typeof saved.metrics === "object") {
    state.metrics = saved.metrics;
  }
  return true;
}

function saveLiveState() {
  writeLocalJson(AIRI_LIVE_STATE_KEY, {
    cycle: state.cycle,
    signals: state.signals,
    changeIndex: state.changeIndex,
    taskIndex: state.taskIndex,
    streamCursor: state.streamCursor,
    progress: state.progress,
    branch: state.branch,
    realMode: state.realMode,
    metrics: state.metrics,
    memories: state.memories.slice(-18),
    workItems: state.workItems.slice(0, 10),
    changes: state.changes.slice(0, 10),
    stream: state.stream.slice(0, 24),
    savedAt: Date.now()
  });
}

function activeTasks() {
  if (state.workItems.length) {
    return state.workItems.map((item, index) => ({
      title: index === 0 ? "Coding from real worktree state" : `Queued improvement ${String(index + 1).padStart(2, "0")}`,
      body: item,
      signal: "code"
    }));
  }
  return fallbackTasks;
}

function activeChanges() {
  return state.changes.length ? state.changes : fallbackChanges;
}

function activeQueue() {
  return state.workItems.length ? state.workItems : fallbackQueue;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tickClock() {
  const now = new Date();
  dom.date.textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const timeStr = formatTime(now);
  dom.clock.textContent = timeStr;
  dom.clock.setAttribute("aria-label", `Current time is ${timeStr}`);
}

function restoreTerminal() {
  const saved = readLocalJson(AIRI_LIVE_TERMINAL_KEY, []);
  if (!Array.isArray(saved) || !saved.length) return false;
  dom.terminal.innerHTML = "";
  saved.slice(-MAX_SAVED_TERMINAL_LINES).forEach((item) => {
    const line = document.createElement("p");
    line.dataset.kind = String(item?.kind || "signal").slice(0, 40);
    line.innerHTML = `<span>${escapeHtml(item?.time || "--:--:--")}</span>${escapeHtml(item?.text || "")}`;
    dom.terminal.appendChild(line);
  });
  dom.terminal.scrollTop = dom.terminal.scrollHeight;
  return true;
}

function saveTerminal() {
  const lines = Array.from(dom.terminal.children).slice(-MAX_SAVED_TERMINAL_LINES).map((line) => ({
    kind: String(line.dataset.kind || "signal").slice(0, 40),
    time: String(line.querySelector("span")?.textContent || "").slice(0, 20),
    text: String(line.textContent || "").replace(String(line.querySelector("span")?.textContent || ""), "").trim().slice(0, 260)
  }));
  writeLocalJson(AIRI_LIVE_TERMINAL_KEY, lines);
}

function renderTask() {
  const tasks = activeTasks();
  const task = tasks[state.taskIndex % tasks.length];
  dom.taskTitle.textContent = task.title;
  dom.taskBody.textContent = task.body;
  dom.statement.textContent = state.realMode
    ? `I am reading the ${state.branch} worktree, turning real files and commits into the next safe improvement.`
    : `I am ${task.title.toLowerCase()}, and I am still watching the next signal before it becomes a request.`;
}

function renderMind() {
  const tasks = activeTasks();
  const task = tasks[state.taskIndex % tasks.length];
  const lines = [
    ["active thread", task.signal],
    ["branch", state.branch || "unknown"],
    ["approval guard", "locked"],
    ["changed files", String(state.metrics.changedFiles || 0)],
    ["open issues", String(state.metrics.issues || 0)],
    ["memory pressure", `${Math.min(99, 42 + state.memories.length * 7)}%`],
    ["stream state", state.realMode ? "repo-backed" : "continuous"]
  ];
  dom.mindList.innerHTML = lines
    .map(([label, value]) => `<li><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></li>`)
    .join("");
}

function renderChanges() {
  const changes = activeChanges();
  const ordered = [...changes.slice(state.changeIndex % changes.length), ...changes.slice(0, state.changeIndex % changes.length)];
  dom.changeStack.innerHTML = ordered
    .slice(0, 4)
    .map((item, index) => `
      <section class="airi-live-change ${index === 0 ? "is-current" : ""}">
        <span>${escapeHtml(item.mark)}</span>
        <div>
          <b>${escapeHtml(item.title)}</b>
          <p>${escapeHtml(item.body)}</p>
        </div>
      </section>
    `)
    .join("");
}

function renderMemory() {
  const visible = state.memories.slice(-8).reverse();
  dom.memoryCount.textContent = `${state.memories.length} saved`;
  dom.memoryGrid.innerHTML = visible
    .map((memory, index) => `<span class="${index === 0 ? "is-new" : ""}">${escapeHtml(memory)}</span>`)
    .join("");
}

function renderQueue() {
  dom.queue.innerHTML = activeQueue()
    .map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(item)}</li>`)
    .join("");
}

function appendStreamLine(text, kind = "signal") {
  const line = document.createElement("p");
  line.dataset.kind = kind;
  line.innerHTML = `<span>${formatTime()}</span>${escapeHtml(text)}`;
  dom.terminal.appendChild(line);
  while (dom.terminal.children.length > 24) dom.terminal.removeChild(dom.terminal.firstElementChild);
  // Always scroll to bottom after adding a new line for better UX
  dom.terminal.scrollTop = dom.terminal.scrollHeight;
  saveTerminal();
}

function streamText() {
  if (state.stream.length) {
    const entry = state.stream[state.streamCursor % state.stream.length];
    state.streamCursor += 1;
    state.lastStreamKind = String(entry?.kind || "signal");
    return String(entry?.text || entry || "repo-backed signal observed");
  }
  const tasks = activeTasks();
  const task = tasks[state.taskIndex % tasks.length];
  const template = pick(streamTemplates);
  state.lastStreamKind = state.cycle % 5 === 0 ? "change" : "signal";
  return template
    .replace("{signal}", task.signal)
    .replace("{memory}", pick(state.memories))
    .replace("{task}", pick(activeQueue()));
}

function advance() {
  state.cycle += 1;
  state.signals = state.cycle + (state.metrics.changedFiles || 0) * 3 + (state.metrics.memories || 0) * 2 + (state.metrics.events || 0);
  state.progress = (state.progress + 11 + (state.metrics.changedFiles || 0)) % 100;

  if (state.cycle % 4 === 0) state.taskIndex += 1;
  if (state.cycle % 6 === 0) state.changeIndex += 1;

  renderTask();
  renderMind();
  renderChanges();
  renderMemory();

  dom.progress.style.width = `${Math.max(8, state.progress)}%`;
  // Add aria-label and role for progress bar for screen readers
  if (dom.progress) {
    dom.progress.setAttribute("aria-label", `Progress: ${Math.max(8, state.progress)} percent`);
    dom.progress.setAttribute("role", "progressbar");
    dom.progress.setAttribute("aria-valuemin", "0");
    dom.progress.setAttribute("aria-valuemax", "100");
    dom.progress.setAttribute("aria-valuenow", String(Math.max(8, state.progress)));
    dom.progress.setAttribute("tabindex", "0"); // Make progress bar focusable for screen readers
    dom.progress.style.outline = "none";
    dom.progress.addEventListener("focus", () => {
      dom.progress.style.outline = "3px solid #67f2aa";
      dom.progress.style.outlineOffset = "4px";
    });
    dom.progress.addEventListener("blur", () => {
      dom.progress.style.outline = "none";
    });
    dom.progress.parentElement?.setAttribute("role", "region");
    dom.progress.parentElement?.setAttribute("aria-live", "polite");
    dom.progress.parentElement?.setAttribute("aria-atomic", "true");
  }

  dom.cycles.textContent = String(state.cycle);
  dom.signals.textContent = String(state.signals);
  dom.changes.textContent = String(activeChanges().length);
  dom.streamState.textContent = state.realMode ? "repo-backed" : state.cycle % 5 === 0 ? "rewriting" : "writing";

  appendStreamLine(streamText(), state.lastStreamKind);
  saveLiveState();
}

function applyBackroomPayload(payload = {}) {
  state.realMode = Boolean(payload.real);
  state.branch = String(payload.branch || state.branch || "unknown");
  state.metrics = payload.metrics && typeof payload.metrics === "object" ? payload.metrics : state.metrics;
  state.workItems = Array.isArray(payload.workItems)
    ? payload.workItems.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10)
    : state.workItems;
  state.changes = Array.isArray(payload.changes)
    ? payload.changes.map((item) => ({
        mark: String(item?.mark || "git").trim().slice(0, 8),
        title: String(item?.title || "").trim().slice(0, 180),
        body: String(item?.body || "").trim().slice(0, 260)
      })).filter((item) => item.title).slice(0, 10)
    : state.changes;
  state.stream = Array.isArray(payload.stream)
    ? payload.stream.map((item) => ({
        kind: String(item?.kind || "signal").trim().slice(0, 40),
        text: String(item?.text || "").trim().slice(0, 260)
      })).filter((item) => item.text).slice(0, 24)
    : state.stream;
  const memoryText = Array.isArray(payload.memories)
    ? payload.memories.map((row) => String(row?.content || row || "").trim()).filter(Boolean)
    : [];
  if (memoryText.length) {
    state.memories = Array.from(new Set([...fallbackMemories, ...memoryText])).slice(-18);
  }
  if (payload.currentTask && !state.workItems.includes(payload.currentTask)) {
    state.workItems = [String(payload.currentTask).trim(), ...state.workItems].filter(Boolean).slice(0, 10);
  }
  renderTask();
  renderMind();
  renderChanges();
  renderMemory();
  renderQueue();
  saveLiveState();
}

async function fetchBackroomState() {
  const now = Date.now();
  if (now - state.lastBackroomFetch < 8_000) return;
  state.lastBackroomFetch = now;
  try {
    const response = await fetch(`/api/airi/backroom?sessionId=${encodeURIComponent(airiSessionId())}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    applyBackroomPayload(payload);
    appendStreamLine(payload.real ? "loaded real repo-backed Backroom state" : "loaded local Backroom fallback state", payload.real ? "change" : "warn");
  } catch {
    appendStreamLine("backend memory unavailable -> local live loop continues", "warn");
  }
}

function boot() {
  const resumedState = hydrateLiveState();
  const resumedTerminal = restoreTerminal();
  tickClock();
  renderTask();
  renderMind();
  renderChanges();
  renderMemory();
  renderQueue();
  if (resumedTerminal || resumedState) {
    appendStreamLine("resumed Backroom stream from saved room state", "event");
  } else {
    appendStreamLine("Airi live operating room initialized", "change");
    appendStreamLine("self-upgrade loop waiting for real repo state", "signal");
  }
  fetchBackroomState();

  window.setInterval(tickClock, 1000);
  window.setInterval(advance, 1850);
  window.setInterval(fetchBackroomState, 8_000);
}

boot();
