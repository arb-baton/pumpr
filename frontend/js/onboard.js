const STORAGE_KEY = "Pump-r.onboard.v2";

const lessons = [
  {
    id: "market-structure",
    lane: "Market",
    title: "Read market cap before price",
    body: "Price alone is bait. Market cap tells you how big the coin already is, and how much room a move needs.",
    xp: 45,
    difficulty: "Beginner",
    quiz: "If two coins have the same price, are they always the same size?",
    answer: "No"
  },
  {
    id: "bonding-curve",
    lane: "Launch",
    title: "Bonding curve flow",
    body: "A curve lets people buy before DEX liquidity exists. The pool grows, the price moves, and graduation happens at the target.",
    xp: 55,
    difficulty: "Core",
    quiz: "Does the bonding curve price stay fixed?",
    answer: "No"
  },
  {
    id: "chart-reading",
    lane: "Trading",
    title: "Candles, volume, and fakeouts",
    body: "A green candle with no volume is weaker than a smaller candle with expanding buyers and higher lows.",
    xp: 55,
    difficulty: "Core",
    quiz: "Should you judge a move only by candle color?",
    answer: "No"
  },
  {
    id: "wallet-safety",
    lane: "Safety",
    title: "Wallet safety checklist",
    body: "Know what you are signing. Check the network, amount, contract, approval type, and whether the request makes sense.",
    xp: 60,
    difficulty: "Important",
    quiz: "Should you approve a transaction you do not understand?",
    answer: "No"
  },
  {
    id: "community-alpha",
    lane: "Social",
    title: "Community signal vs noise",
    body: "Strong communities make repeatable content, recruit new holders, and keep showing up after red candles.",
    xp: 45,
    difficulty: "Social",
    quiz: "Is hype always the same thing as community strength?",
    answer: "No"
  },
  {
    id: "chain-choice",
    lane: "Chains",
    title: "ETH, Base, Monad, Solana",
    body: "Each chain has a different speed, fee profile, user base, and culture. Pick the chain that matches the audience.",
    xp: 45,
    difficulty: "Builder",
    quiz: "Can the same meme launch differently across chains?",
    answer: "Yes"
  }
];

const demoCoins = [
  {
    id: "frog",
    name: "Frog Finance",
    symbol: "FROG",
    chain: "ETH",
    image: "/assets/pump-r-logo.png?v=20260608r",
    basePrice: 0.024,
    supply: 1000000000,
    move: 18.4,
    volume: 184200,
    holders: 1328,
    liquidity: 42800,
    story: "A chaotic green timeline coin with fast social rotation and a clean first-hour holder curve.",
    risk: "Early concentration is still high. Watch sells near the next local high.",
    seed: 4
  },
  {
    id: "toast",
    name: "Toast Cat",
    symbol: "TOAST",
    chain: "BASE",
    image: "/assets/pump-r-logo.png?v=20260608r",
    basePrice: 0.071,
    supply: 1000000000,
    move: -6.2,
    volume: 92100,
    holders: 864,
    liquidity: 31700,
    story: "Cute meme, fast Base crowd, and a low-fee trading loop for people learning entries.",
    risk: "Momentum cooled off. Needs a reclaim candle and better volume.",
    seed: 9
  },
  {
    id: "laser",
    name: "Laser Doge",
    symbol: "LASER",
    chain: "MONAD",
    image: "/assets/pump-r-logo.png?v=20260608r",
    basePrice: 0.018,
    supply: 1000000000,
    move: 31.7,
    volume: 267900,
    holders: 2190,
    liquidity: 58900,
    story: "Speculative Monad energy with a loud ticker, tight float, and very fast fake chart movement.",
    risk: "Big moves can unwind quickly. Practice position sizing before chasing.",
    seed: 13
  },
  {
    id: "byte",
    name: "Byte Banana",
    symbol: "BYTE",
    chain: "SOL",
    image: "/assets/pump-r-logo.png?v=20260608r",
    basePrice: 0.039,
    supply: 1000000000,
    move: 8.1,
    volume: 141400,
    holders: 1041,
    liquidity: 37200,
    story: "Solana-style speed, quick rotations, and a simple meme that normies understand fast.",
    risk: "Fast chain, fast exits. Do not mistake speed for safety.",
    seed: 18
  }
];

const memeTemplates = [
  "I came for the meme, stayed for the chart.",
  "The roadmap is simple: make the timeline laugh, then make it curious.",
  "Not financial advice, but the group chat just became a trading floor.",
  "First we learn. Then we simulate. Then we touch the real launchpad.",
  "A good meme should be funny in one second and explainable in one sentence."
];

const questDefs = [
  { id: "lesson1", title: "Complete one lesson", reward: "Learner badge", xp: 40, test: (s) => s.completedLessons.length >= 1 },
  { id: "lesson4", title: "Clear four lessons", reward: "Risk-aware badge", xp: 85, test: (s) => s.completedLessons.length >= 4 },
  { id: "trade3", title: "Make three simulator trades", reward: "Paper trader badge", xp: 70, test: (s) => s.demoTrades >= 3 },
  { id: "profit", title: "Reach $10.5K demo portfolio", reward: "Green candle badge", xp: 90, test: (s) => portfolioValue(s) >= 10500 },
  { id: "creator", title: "Generate a launch plan", reward: "Creator-ready badge", xp: 60, test: (s) => s.generatedMemes >= 1 },
  { id: "battle", title: "Vote in two meme battles", reward: "Community scout badge", xp: 60, test: (s) => s.battleVotes >= 2 }
];

const defaultState = {
  xp: 0,
  completedLessons: [],
  quizWins: [],
  claimedQuests: [],
  cash: 10000,
  holdings: {},
  demoTrades: 0,
  battleVotes: 0,
  generatedMemes: 0,
  activeTab: "play",
  selectedCoin: "frog",
  tradeSide: "buy",
  selectedTradeAmount: 500,
  selectedSellTokens: "",
  watchlist: ["frog"],
  quizFeedback: {},
  launchDraft: {
    chain: "ETH",
    mode: "native",
    name: "",
    symbol: "",
    description: "",
    supply: "1000000000",
    allocation: "0",
    starterBuy: "0",
    imageData: "",
    imageName: ""
  },
  practiceCoins: [],
  lastMeme: "",
  lastTweet: "",
  lastPlan: "",
  launchScore: 42,
  orders: []
};

const ui = {
  panel: document.getElementById("onboardPanel"),
  tabs: Array.from(document.querySelectorAll("[data-onboard-tab]")),
  level: document.getElementById("onboardLevel"),
  xp: document.getElementById("onboardXp"),
  xpBar: document.getElementById("onboardXpBar"),
  rank: document.getElementById("onboardRank"),
  cash: document.getElementById("onboardCash"),
  nextQuest: document.getElementById("onboardNextQuest"),
  nextQuestCopy: document.getElementById("onboardNextQuestCopy"),
  badges: document.getElementById("onboardBadgeList"),
  alert: document.getElementById("alert")
};

let state = loadState();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      ...defaultState,
      ...parsed,
      completedLessons: Array.isArray(parsed.completedLessons) ? parsed.completedLessons : [],
      quizWins: Array.isArray(parsed.quizWins) ? parsed.quizWins : [],
      claimedQuests: Array.isArray(parsed.claimedQuests) ? parsed.claimedQuests : [],
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : defaultState.watchlist,
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      holdings: parsed.holdings && typeof parsed.holdings === "object" ? parsed.holdings : {},
      quizFeedback: parsed.quizFeedback && typeof parsed.quizFeedback === "object" ? parsed.quizFeedback : {},
      launchDraft: parsed.launchDraft && typeof parsed.launchDraft === "object" ? { ...defaultState.launchDraft, ...parsed.launchDraft } : { ...defaultState.launchDraft },
      practiceCoins: Array.isArray(parsed.practiceCoins) ? parsed.practiceCoins : []
    };
  } catch {
    return { ...defaultState, holdings: {}, orders: [], quizFeedback: {}, launchDraft: { ...defaultState.launchDraft }, practiceCoins: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore local storage failures
  }
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value, digits = 2) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function compact(value, prefix = "") {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return `${prefix}0`;
  return `${prefix}${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

function selectedCoin() {
  return allCoins().find((coin) => coin.id === state.selectedCoin) || allCoins()[0] || demoCoins[0];
}

function allCoins() {
  return [...state.practiceCoins, ...demoCoins];
}

function coinPrice(coin = selectedCoin()) {
  const held = Number(state.holdings[coin.id] || 0);
  const pressure = Math.min(0.18, held / 600000);
  return coin.basePrice * (1 + pressure + state.demoTrades * 0.002);
}

function coinMarketCap(coin = selectedCoin()) {
  return coinPrice(coin) * coin.supply;
}

function portfolioValue(source = state) {
  const coins = source === state ? allCoins() : [...(source.practiceCoins || []), ...demoCoins];
  return coins.reduce((sum, coin) => {
    const held = Number(source.holdings?.[coin.id] || 0);
    return sum + held * coinPrice(coin);
  }, Number(source.cash || 0));
}

function addXp(amount, reason = "") {
  const n = Math.max(0, Number(amount || 0) || 0);
  if (!n) return;
  state.xp += n;
  setNotice(`+${n} XP${reason ? ` - ${reason}` : ""}`);
  saveState();
}

function setNotice(text, error = false) {
  if (!ui.alert) return;
  ui.alert.textContent = text;
  ui.alert.classList.toggle("error", Boolean(error));
}

function levelInfo() {
  const level = Math.max(1, Math.floor(state.xp / 160) + 1);
  const current = state.xp % 160;
  const ranks = ["Normie recruit", "Meme learner", "Chart apprentice", "Launch scout", "Creator ready", "Community insider"];
  return { level, current, pct: Math.min(100, (current / 160) * 100), rank: ranks[Math.min(ranks.length - 1, level - 1)] };
}

function badgeList() {
  const out = [];
  if (state.completedLessons.length >= 1) out.push("Learner");
  if (state.completedLessons.length >= 4) out.push("Risk aware");
  if (state.demoTrades >= 3) out.push("Paper trader");
  if (portfolioValue() >= 10500) out.push("Green candle");
  if (state.generatedMemes >= 1) out.push("Meme maker");
  if (state.battleVotes >= 2) out.push("Community scout");
  if (state.xp >= 480) out.push("Creator ready");
  return out;
}

function syncChrome() {
  const info = levelInfo();
  ui.level.textContent = String(info.level);
  ui.xp.textContent = `${state.xp} XP`;
  ui.xpBar.style.width = `${info.pct}%`;
  ui.rank.textContent = info.rank;
  ui.cash.textContent = money(state.cash);
  const next = questDefs.find((quest) => !state.claimedQuests.includes(quest.id));
  ui.nextQuest.textContent = next?.title || "All quests cleared";
  ui.nextQuestCopy.textContent = next ? `${next.reward}. Complete it to claim ${next.xp} XP.` : "You are ready for real trading and launches.";
  const badges = badgeList();
  ui.badges.innerHTML = badges.length ? badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("") : `<span>Start learning</span>`;
  ui.tabs.forEach((button) => button.classList.toggle("active", button.dataset.onboardTab === state.activeTab));
}

function makeCandles(coin = selectedCoin()) {
  const candles = [];
  let price = coin.basePrice * (0.72 + coin.seed * 0.01);
  const coinOrders = state.orders.filter((order) => order.coinId === coin.id || order.symbol === coin.symbol);
  for (let i = 0; i < 48; i += 1) {
    const wave = Math.sin((i + coin.seed) / 3.2) * 0.035;
    const pulse = Math.cos((i + coin.seed) / 5.7) * 0.025;
    const trend = coin.move >= 0 ? i * 0.0018 : -i * 0.0006;
    const flowOrder = coinOrders[i - (48 - coinOrders.length)];
    const flow = flowOrder ? (flowOrder.side === "Buy" ? 0.06 : -0.05) * Math.min(1.8, Number(flowOrder.usd || 0) / 500) : 0;
    const open = price;
    const close = Math.max(0.001, open * (1 + wave + pulse + trend / 10 + flow));
    const high = Math.max(open, close) * (1 + 0.03 + ((i + coin.seed) % 5) * 0.006);
    const low = Math.min(open, close) * (1 - 0.025 - ((i + 2) % 4) * 0.005);
    const volume = 18 + ((i * coin.seed) % 46) + (close > open ? 18 : 0) + (flowOrder ? Math.min(58, Number(flowOrder.usd || 0) / 16) : 0);
    candles.push({ open, close, high, low, volume, side: flowOrder?.side || "" });
    price = close;
  }
  return candles;
}

function renderChart(coin = selectedCoin()) {
  const candles = makeCandles(coin);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const span = Math.max(0.000001, max - min);
  const bubbleIndexes = candles
    .map((candle, index) => (candle.side ? index : -1))
    .filter((index) => index >= 0);
  const fallbackIndexes = [10, 18, 29, 34, 39, 43];
  const bubbles = candles
    .filter((_, index) => (bubbleIndexes.length ? bubbleIndexes : fallbackIndexes).includes(index))
    .map((candle, bubbleIndex) => {
      const left = (candles.indexOf(candle) / Math.max(1, candles.length - 1)) * 100;
      const top = ((max - candle.high) / span) * 100 - 4;
      const side = candle.side ? candle.side.toLowerCase() : bubbleIndex % 3 === 1 ? "sell" : "buy";
      return `<span class="onboard-trade-bubble ${side}" style="left:${left.toFixed(2)}%;top:${Math.max(4, top).toFixed(2)}%">${side === "buy" ? "B" : "S"}</span>`;
    })
    .join("");
  return `
    <div class="onboard-chart-grid" aria-hidden="true">
      ${candles
        .map((candle) => {
          const green = candle.close >= candle.open;
          const top = ((max - candle.high) / span) * 100;
          const wickHeight = Math.max(8, ((candle.high - candle.low) / span) * 100);
          const bodyTop = ((max - Math.max(candle.open, candle.close)) / span) * 100;
          const bodyHeight = Math.max(4, (Math.abs(candle.close - candle.open) / span) * 100);
          return `
            <span class="onboard-candle ${green ? "green" : "red"}">
              <i style="top:${top.toFixed(2)}%;height:${wickHeight.toFixed(2)}%"></i>
              <b style="top:${bodyTop.toFixed(2)}%;height:${bodyHeight.toFixed(2)}%"></b>
              <em style="height:${Math.min(38, candle.volume).toFixed(2)}%"></em>
            </span>
          `;
        })
        .join("")}
      ${bubbles}
    </div>
  `;
}

function renderCoinStrip() {
  return `
    <div class="onboard-coin-strip">
      ${allCoins()
        .map((coin) => {
          const active = coin.id === state.selectedCoin;
          const watched = state.watchlist.includes(coin.id);
          return `
            <button class="${active ? "active" : ""}" type="button" data-select-coin="${escapeHtml(coin.id)}">
              <span>${watched ? "*" : String(allCoins().indexOf(coin) + 1)}</span>
              <b>${escapeHtml(coin.name)}</b>
              <small>${escapeHtml(coin.practice ? "PRACTICE" : coin.chain)} ${coin.move >= 0 ? "+" : ""}${coin.move.toFixed(1)}%</small>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderTokenProfile(coin = selectedCoin()) {
  const held = Number(state.holdings[coin.id] || 0);
  const mc = coinMarketCap(coin);
  const watched = state.watchlist.includes(coin.id);
  return `
    <section class="onboard-token-profile">
      <div class="onboard-token-head">
        <img src="${escapeHtml(coin.image)}" alt="" />
        <div>
          <small>${escapeHtml(coin.chain)} SIMULATOR</small>
          <h2>${escapeHtml(coin.name)}</h2>
          <p>$${escapeHtml(coin.symbol)} - fake market cap ${compact(mc, "$")}</p>
        </div>
        <button class="btn-ghost" type="button" data-watch-coin="${escapeHtml(coin.id)}">${watched ? "Watching" : "Watch"}</button>
      </div>
      <div class="onboard-chart-head">
        <div>
          <small>Market cap</small>
          <strong>${compact(mc, "$")}</strong>
          <span class="${coin.move >= 0 ? "green" : "red"}">${coin.move >= 0 ? "+" : ""}${coin.move.toFixed(1)}% 24h</span>
        </div>
        <div class="onboard-chart-tabs"><span>1H</span><span class="active">24H</span><span>Price/MC</span><span>Demo</span></div>
      </div>
      ${renderChart(coin)}
      <div class="onboard-token-metrics">
        <span><b>${money(coinPrice(coin), 4)}</b><small>Price</small></span>
        <span><b>${compact(coin.volume, "$")}</b><small>Volume</small></span>
        <span><b>${compact(coin.liquidity, "$")}</b><small>Liquidity</small></span>
        <span><b>${compact(coin.holders)}</b><small>Holders</small></span>
        <span><b>${held.toFixed(2)}</b><small>Your tokens</small></span>
      </div>
    </section>
  `;
}

function renderPracticeTradePanel(coin = selectedCoin()) {
  const price = coinPrice(coin);
  const held = Number(state.holdings[coin.id] || 0);
  const side = state.tradeSide === "sell" ? "sell" : "buy";
  const selectedAmount = Math.max(10, Number(state.selectedTradeAmount || 500) || 500);
  const selectedSellTokens = Math.max(0, Number(state.selectedSellTokens || 0) || 0);
  const sellableUsd = held * price;
  const sellTokens = side === "sell" ? Math.min(held, selectedSellTokens || held * 0.25) : 0;
  const executedUsd = side === "sell" ? sellTokens * price : selectedAmount;
  const receiveLine =
    side === "sell"
      ? `${money(executedUsd)} practice cash`
      : `${(selectedAmount / price).toFixed(2)} ${escapeHtml(coin.symbol)}`;
  const buyOptions = [100, 500, 1000, 2500];
  const sellOptions = [25, 50, 75, 100];
  return `
    <aside class="onboard-tokenpf-side">
      <article class="tokenpf-trade-card onboard-tokenpf-trade">
        <div class="tokenpf-buy-sell-tabs">
          <button class="${side === "buy" ? "active" : ""}" type="button" data-trade-side="buy">Buy</button>
          <button class="sell ${side === "sell" ? "active" : ""}" type="button" data-trade-side="sell">Sell</button>
        </div>
        <div class="tokenpf-primary-amount">
          <b>${side === "sell" ? `${sellTokens.toFixed(2)} ${escapeHtml(coin.symbol)}` : money(selectedAmount, 2)}</b>
          <span>${side === "sell" ? money(executedUsd) : escapeHtml(coin.chain)}</span>
        </div>
        <p class="tokenpf-approx-line">Practice cash ${money(state.cash)} - holding ${held.toFixed(2)} / ${compact(coin.supply)} ${escapeHtml(coin.symbol)}</p>
        <div class="tokenpf-trade-quick ${side === "sell" ? "tokenpf-trade-quick-token" : ""}">
          ${side === "sell"
            ? sellOptions.map((pct) => `<button class="${Math.abs(sellTokens - held * (pct / 100)) < 0.000001 ? "active" : ""}" type="button" data-select-sell-percent="${pct}">${pct}%</button>`).join("")
            : buyOptions.map((amount) => `<button class="${selectedAmount === amount ? "active" : ""}" type="button" data-select-trade-amount="${amount}">$${amount >= 1000 ? `${amount / 1000}K` : amount}</button>`).join("")}
        </div>
        <div class="tokenpf-trade-fields">
          <label class="tokenpf-trade-field-label">${side === "sell" ? "Sell amount (tokens)" : "Buy amount (practice USD)"}</label>
          <input class="tokenpf-trade-input" value="${side === "sell" ? (state.selectedSellTokens || sellTokens.toFixed(2)) : selectedAmount}" inputmode="decimal" data-practice-trade-input="${side}" />
          <label class="tokenpf-trade-field-label">You receive</label>
          <input class="tokenpf-trade-input" value="${receiveLine}" readonly />
        </div>
        <button class="btn-primary onboard-wide ${side === "sell" ? "btn-danger" : ""}" type="button" data-execute-practice-trade="${escapeHtml(coin.id)}">${side === "sell" ? "Practice sell" : "Practice buy"}</button>
        <p class="tokenpf-turbo-row">No wallet - simulator only</p>
      </article>
      <article class="tokenpf-side-card onboard-tokenpf-card">
        <div class="tokenpf-side-head"><h3>Bonding curve</h3><span>Practice</span></div>
        <div class="bonding-line"><div style="width:${Math.min(96, 18 + state.demoTrades * 6)}%"></div></div>
        <p>${compact(Math.min(75000, coin.volume + state.demoTrades * 2400), "$")} raised before simulated graduation. Supply stays fixed at ${compact(coin.supply)}.</p>
      </article>
      <article class="tokenpf-side-card onboard-tokenpf-card">
        <div class="tokenpf-side-head"><h3>Top holders</h3><span>Demo</span></div>
        ${["you", "paperWhale", "chartStudent", "riskDesk"].map((name, index) => `<div class="tokenpf-holder-row"><b>${index + 1}. ${name}</b><span>${compact(Math.max(held / (index + 1), 12000 - index * 1800))}</span></div>`).join("")}
      </article>
    </aside>
  `;
}

function renderPracticeTrades(coin = selectedCoin()) {
  const rows = state.orders
    .filter((order) => order.coinId === coin.id || order.symbol === coin.symbol)
    .slice(-14)
    .reverse();
  const seeded = rows.length
    ? rows
    : [
        { side: "Buy", symbol: coin.symbol, usd: 420, tokens: 420 / coinPrice(coin), account: "paperWhale", time: "4m" },
        { side: "Buy", symbol: coin.symbol, usd: 180, tokens: 180 / coinPrice(coin), account: "chartStudent", time: "8m" },
        { side: "Sell", symbol: coin.symbol, usd: 90, tokens: 90 / coinPrice(coin), account: "riskDesk", time: "13m" }
      ];
  return `
    <article class="tokenpf-trades onboard-tokenpf-trades">
      <div class="tokenpf-side-head">
        <h3>Transactions</h3>
        <span>${seeded.length} practice txs</span>
      </div>
      <div class="onboard-tx-table">
        <div class="onboard-tx-head"><span>Type</span><span>Amount</span><span>Tokens</span><span>User</span><span>Age</span></div>
        ${seeded
          .map((order) => `
            <div class="onboard-tx-row">
              <span class="badge ${String(order.side).toLowerCase()}">${escapeHtml(order.side)}</span>
              <b>${money(order.usd)}</b>
              <span>${compact(order.tokens || Number(order.usd || 0) / coinPrice(coin))} ${escapeHtml(order.symbol)}</span>
              <span>${escapeHtml(order.account || "you")}</span>
              <small>${escapeHtml(order.time || "just now")}</small>
            </div>
          `)
          .join("")}
      </div>
    </article>
  `;
}

function renderLearn() {
  const completed = state.completedLessons.length;
  ui.panel.innerHTML = `
    <section class="onboard-board">
      <div class="onboard-section-head">
        <small>Learn board</small>
        <h2>Guided crypto lessons with decisions, XP, and readiness scoring</h2>
        <p>New users should learn how market cap, curves, charts, safety, community, and chains work before making real trades.</p>
      </div>
      <div class="onboard-learning-map">
        ${lessons
          .map((lesson, index) => {
            const done = state.completedLessons.includes(lesson.id);
            const quizDone = state.quizWins.includes(lesson.id);
            const feedback = state.quizFeedback[lesson.id];
            return `
              <article class="onboard-module ${done ? "complete" : ""}">
                <div class="onboard-module-index">${index + 1}</div>
                <div>
                  <small>${escapeHtml(lesson.lane)} - ${escapeHtml(lesson.difficulty)} - ${lesson.xp} XP</small>
                  <h3>${escapeHtml(lesson.title)}</h3>
                  <p>${escapeHtml(lesson.body)}</p>
                  <div class="onboard-quiz-box">
                    <span>${escapeHtml(lesson.quiz)}</span>
                    <button class="btn-ghost" type="button" data-quiz="${escapeHtml(lesson.id)}" data-answer="Yes">Yes</button>
                    <button class="btn-ghost" type="button" data-quiz="${escapeHtml(lesson.id)}" data-answer="No">No</button>
                  </div>
                  ${
                    feedback
                      ? `<div class="onboard-quiz-feedback ${feedback.correct ? "correct" : "wrong"}">
                          <b>${feedback.correct ? "Correct" : "Try again"}</b>
                          <span>${escapeHtml(feedback.message)}</span>
                        </div>`
                      : ""
                  }
                </div>
                <button class="${done ? "btn-ghost" : "btn-primary"}" type="button" data-complete-lesson="${escapeHtml(lesson.id)}">${done ? quizDone ? "Mastered" : "Lesson done" : "Complete"}</button>
              </article>
            `;
          })
          .join("")}
      </div>
      <div class="onboard-readiness-row">
        <span><b>${completed}/6</b><small>Modules cleared</small></span>
        <span><b>${state.quizWins.length}</b><small>Quiz wins</small></span>
        <span><b>${Math.min(100, completed * 14 + state.quizWins.length * 6)}%</b><small>Readiness</small></span>
      </div>
    </section>
  `;
}

function renderPlay() {
  const coin = selectedCoin();
  ui.panel.innerHTML = `
    <section class="onboard-board onboard-play-board">
      <div class="onboard-section-head">
        <small>Practice token profile</small>
        <h2>Trade a fake launch with the same layout as the real token page</h2>
        <p>Use the buy/sell panel, chart, bonding curve, holders, and transaction table without sending any wallet transaction.</p>
      </div>
      ${renderCoinStrip()}
      <div class="onboard-tokenpf-layout">
        <div class="onboard-tokenpf-main">
          ${renderTokenProfile(coin)}
          ${renderPracticeTrades(coin)}
          <article class="tokenpf-terminal onboard-tokenpf-notes">
            <small>Practice notes</small>
            <a href="/create">What to watch on this token</a>
            <p>${escapeHtml(coin.story)}</p>
            <p><b>Risk:</b> ${escapeHtml(coin.risk)}</p>
          </article>
        </div>
        ${renderPracticeTradePanel(coin)}
      </div>
    </section>
  `;
}

function renderCreate() {
  const draft = state.launchDraft;
  const name = draft.name || "Practice coin";
  const symbol = (draft.symbol || "PRACTICE").toUpperCase();
  const image = draft.imageData || "/assets/pump-r-logo.png?v=20260608r";
  const modeLabel = draft.mode === "pumpverse" ? "PumpVerse multi-chain" : draft.mode === "usdc" ? "USDC pair" : "Native pair";
  const readiness = Math.min(
    100,
    25 +
      (draft.name ? 12 : 0) +
      (draft.symbol ? 12 : 0) +
      (draft.description ? 10 : 0) +
      (draft.imageData ? 16 : 0) +
      (Number(draft.starterBuy || 0) > 0 ? 8 : 0) +
      state.completedLessons.length * 4 +
      state.demoTrades * 2
  );
  ui.panel.innerHTML = `
    <section class="onboard-board onboard-create-board">
      <div class="onboard-section-head">
        <small>Create simulator</small>
        <h2>Practice the real launch flow before paying gas</h2>
        <p>This mirrors the launchpad flow: choose chain and launch model, upload media, fill token details, tune economics, then review the token card.</p>
      </div>
      <div class="onboard-launch-grid">
        <form class="onboard-launch-form" id="onboardLaunchForm">
          <div class="onboard-launch-block">
            <div class="onboard-launch-head"><span>Deploy on</span><strong>${escapeHtml(draft.chain)}</strong></div>
            <div class="onboard-launch-options">
              ${["ETH", "BASE", "MONAD", "SOL"].map((chain) => `<button class="${draft.chain === chain ? "active" : ""}" type="button" data-draft-chain="${chain}"><b>${chain}</b><small>${chain === "ETH" ? "Mainnet" : chain === "SOL" ? "Solana" : `${chain} mainnet`}</small></button>`).join("")}
            </div>
          </div>

          <div class="onboard-launch-block">
            <div class="onboard-launch-head"><span>Launch model</span><strong>${escapeHtml(modeLabel)}</strong></div>
            <div class="onboard-launch-options model">
              <button class="${draft.mode === "native" ? "active" : ""}" type="button" data-draft-mode="native"><b>Native</b><small>Buy with chain gas token</small></button>
              <button class="${draft.mode === "usdc" ? "active" : ""}" type="button" data-draft-mode="usdc"><b>USDC pair</b><small>Stable quote practice</small></button>
              <button class="${draft.mode === "pumpverse" ? "active" : ""}" type="button" data-draft-mode="pumpverse"><b>PumpVerse</b><small>Multi-chain launch rehearsal</small></button>
            </div>
          </div>

          <div class="onboard-form-grid two">
            <label>Coin name<input data-draft-field="name" value="${escapeHtml(draft.name)}" placeholder="Name your coin" /></label>
            <label>Ticker<input data-draft-field="symbol" value="${escapeHtml(draft.symbol)}" placeholder="DOGE" /></label>
          </div>
          <label>Description<textarea data-draft-field="description" placeholder="Write a short description">${escapeHtml(draft.description)}</textarea></label>

          <div class="onboard-upload-zone">
            <div class="onboard-upload-preview">${draft.imageData ? `<img src="${escapeHtml(draft.imageData)}" alt="" />` : `<span>Upload</span>`}</div>
            <div>
              <h3>Select video or image to upload</h3>
              <p>Practice the real media step with a local preview. Images are stored only in this browser for onboarding.</p>
              <button class="btn-primary small" type="button" id="onboardPickFileBtn">Select file</button>
              <input id="onboardImageFile" type="file" accept="image/*,video/*" hidden />
              <small>${draft.imageName ? escapeHtml(draft.imageName) : "No media selected"}</small>
            </div>
          </div>

          <details class="onboard-advanced-fields" open>
            <summary>Token economics and advanced fields</summary>
            <div class="onboard-form-grid two">
              <label>Total supply<input value="1000000000" inputmode="numeric" readonly /></label>
              <label>Creator allocation (%)<input data-draft-field="allocation" value="${escapeHtml(draft.allocation)}" inputmode="decimal" /></label>
            </div>
            <label>Optional starter buy<input data-draft-field="starterBuy" value="${escapeHtml(draft.starterBuy)}" inputmode="decimal" /></label>
            <div class="onboard-bonding-note">
              <b>Bonding curve practice</b>
              <span>Starter buys raise the simulated first candle and improve the previewed market cap, but this page never sends a transaction.</span>
            </div>
          </details>

          <button class="btn-primary onboard-wide" type="button" id="onboardPracticeLaunchBtn">Create practice coin</button>
        </form>

        <aside class="onboard-launch-preview">
          <article class="onboard-preview-card">
            <div class="onboard-preview-art"><img src="${escapeHtml(image)}" alt="" /></div>
            <div class="onboard-preview-body">
              <div><h3>${escapeHtml(name)}</h3><span>$${escapeHtml(symbol)}</span></div>
              <strong>${compact((readiness + 20) * 1280, "$")} MC</strong>
              <p>${escapeHtml(draft.description || "Your coin description appears here.")}</p>
              <div class="onboard-preview-pills"><span>${escapeHtml(draft.chain)}</span><span>${escapeHtml(modeLabel)}</span><span>${readiness}% ready</span></div>
            </div>
          </article>
          <div class="onboard-launch-checks">
            <h3>Launch readiness</h3>
            <span class="${draft.name ? "done" : ""}">Coin name</span>
            <span class="${draft.symbol ? "done" : ""}">Ticker</span>
            <span class="${draft.imageData ? "done" : ""}">Media upload</span>
            <span class="${draft.description ? "done" : ""}">Description</span>
            <span class="${state.completedLessons.length >= 3 ? "done" : ""}">3 lessons complete</span>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderCompete() {
  const battles = [
    { id: "frog-vs-toast", left: "Frog chart comeback", right: "Toast Cat dip buy", score: "62 - 38" },
    { id: "safety-run", left: "Find the risky contract", right: "Find the strong community", score: "49 - 51" }
  ];
  ui.panel.innerHTML = `
    <section class="onboard-board">
      <div class="onboard-section-head">
        <small>Compete</small>
        <h2>Quests, meme battles, and leaderboard pressure</h2>
        <p>People learn faster when the app gives them missions, feedback, status, and a reason to come back.</p>
      </div>
      <div class="onboard-compete-grid">
        <div class="onboard-quest-list">
          ${questDefs
            .map((quest) => {
              const complete = quest.test(state);
              const claimed = state.claimedQuests.includes(quest.id);
              return `
                <article class="onboard-quest ${complete ? "complete" : ""}">
                  <div>
                    <small>${quest.reward} - ${quest.xp} XP</small>
                    <h3>${escapeHtml(quest.title)}</h3>
                    <p>${claimed ? "Reward claimed" : complete ? "Ready to claim" : "Keep progressing"}</p>
                  </div>
                  <button class="${complete && !claimed ? "btn-primary" : "btn-ghost"}" type="button" data-claim-quest="${quest.id}" ${complete && !claimed ? "" : "disabled"}>${claimed ? "Claimed" : "Claim"}</button>
                </article>
              `;
            })
            .join("")}
        </div>
        <div class="onboard-battle-stack">
          ${battles
            .map((battle) => `
              <article class="onboard-battle-card">
                <div>
                  <small>Live battle - ${escapeHtml(battle.score)}</small>
                  <h3>${escapeHtml(battle.left)} vs ${escapeHtml(battle.right)}</h3>
                  <p>Vote to train your taste for narrative, timing, and community energy.</p>
                </div>
                <button class="btn-primary" type="button" data-battle-vote="${escapeHtml(battle.id)}">${escapeHtml(battle.left)}</button>
                <button class="btn-ghost" type="button" data-battle-vote="${escapeHtml(battle.id)}">${escapeHtml(battle.right)}</button>
              </article>
            `)
            .join("")}
          <article class="onboard-leaderboard">
            <h3>Leaderboard</h3>
            ${["alphaPilot", "chartSchool", "memeSmith", "you"].map((name, index) => `<span><b>${index + 1}</b>${escapeHtml(name)}<em>${compact(840 - index * 126)} XP</em></span>`).join("")}
          </article>
        </div>
      </div>
    </section>
  `;
}

function renderBelong() {
  const badges = badgeList();
  const info = levelInfo();
  const zones = [
    { label: "Safety gate", value: Math.min(100, state.quizWins.length * 18), copy: "Quiz wins and transaction awareness" },
    { label: "Chart room", value: Math.min(100, state.demoTrades * 14), copy: "Simulator trades and order-flow practice" },
    { label: "Launch desk", value: Math.min(100, state.generatedMemes * 30 + (state.launchDraft.imageData ? 20 : 0)), copy: "Create flow readiness and media upload" },
    { label: "Community floor", value: Math.min(100, state.battleVotes * 20 + badges.length * 8), copy: "Battles, quests, and badge collection" }
  ];
  ui.panel.innerHTML = `
    <section class="onboard-board">
      <div class="onboard-section-head">
        <small>Belong</small>
        <h2>Progression map, unlocks, squads, and launch readiness</h2>
        <p>A normie should feel like they are leveling into the market, not reading a boring guide. This is the game layer around onboarding.</p>
      </div>
      <div class="onboard-game-hero">
        <div class="onboard-player-card">
          <div class="onboard-profile-avatar">EP</div>
          <div>
            <small>${escapeHtml(info.rank)}</small>
            <h3>Pump-r Rookie</h3>
            <p>Level ${info.level} - ${state.xp} XP - ${badges.length} badges - ${state.watchlist.length} watched coins</p>
          </div>
        </div>
        <div class="onboard-unlock-card">
          <small>Next unlock</small>
          <h3>${state.xp >= 480 ? "Creator league access" : state.demoTrades >= 3 ? "Launch desk challenge" : "Trading room badge"}</h3>
          <p>${state.xp >= 480 ? "You are ready for advanced creator quests." : "Clear more simulator actions to unlock the next room."}</p>
        </div>
      </div>
      <div class="onboard-zone-map">
        ${zones
          .map(
            (zone, index) => `
              <article class="onboard-zone-card ${zone.value >= 70 ? "unlocked" : ""}">
                <div class="onboard-zone-orb">${index + 1}</div>
                <div>
                  <small>${zone.value >= 70 ? "Unlocked" : "In progress"}</small>
                  <h3>${escapeHtml(zone.label)}</h3>
                  <p>${escapeHtml(zone.copy)}</p>
                  <div class="onboard-zone-meter"><i style="width:${zone.value}%"></i></div>
                </div>
                <strong>${zone.value}%</strong>
              </article>
            `
          )
          .join("")}
      </div>
      <div class="onboard-belong-grid">
        <article class="onboard-squad-card">
          <small>Badge inventory</small>
          <h3>Collected status</h3>
          <div class="onboard-badge-list">${badges.length ? badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("") : "<span>No badges yet</span>"}</div>
        </article>
        <article class="onboard-squad-card">
          <small>Squad queue</small>
          <h3>First-cycle builders</h3>
          <p>Finish the map to qualify for leaderboard quests, creator tournaments, and real launchpad prompts.</p>
        </article>
      </div>
    </section>
  `;
}

function render() {
  syncChrome();
  if (state.activeTab === "learn") renderLearn();
  else if (state.activeTab === "create") renderCreate();
  else if (state.activeTab === "compete") renderCompete();
  else if (state.activeTab === "belong") renderBelong();
  else renderPlay();
  syncChrome();
}

function completeLesson(id) {
  const lesson = lessons.find((row) => row.id === id);
  if (!lesson || state.completedLessons.includes(id)) return;
  state.completedLessons.push(id);
  addXp(lesson.xp, "lesson complete");
  saveState();
  render();
}

function answerQuiz(id, answer) {
  const lesson = lessons.find((row) => row.id === id);
  if (!lesson) return;
  if (lesson.answer !== answer) {
    state.quizFeedback[id] = {
      correct: false,
      message: `The better answer is ${lesson.answer}. ${lesson.body}`
    };
    saveState();
    render();
    return;
  }
  if (!state.quizWins.includes(id)) {
    state.quizWins.push(id);
    state.quizFeedback[id] = {
      correct: true,
      message: `${lesson.answer} is right. ${lesson.body}`
    };
    addXp(20, "quiz win");
  } else {
    state.quizFeedback[id] = {
      correct: true,
      message: "You already cleared this one."
    };
  }
  saveState();
  render();
}

function tradeDemo(id, side, size = 500) {
  const coin = allCoins().find((row) => row.id === id);
  if (!coin) return;
  const price = coinPrice(coin);
  let usd = 0;
  let tokens = 0;
  if (side === "buy") {
    const spend = Math.min(Number(size || 500), state.cash);
    if (spend <= 0) return setNotice("Demo cash is empty. Sell something first.", true);
    state.cash -= spend;
    tokens = spend / price;
    state.holdings[id] = Number(state.holdings[id] || 0) + tokens;
    usd = spend;
  } else {
    const held = Number(state.holdings[id] || 0);
    if (held <= 0) return setNotice("You do not hold this demo coin yet.", true);
    const requestedTokens = Math.max(0, Number(size || 0) || 0);
    const sellAmount = Math.min(held, requestedTokens || held * 0.25);
    if (sellAmount <= 0) return setNotice("Select a sell amount first.", true);
    state.holdings[id] = held - sellAmount;
    tokens = sellAmount;
    usd = sellAmount * price;
    state.cash += usd;
  }
  coin.volume = Number(coin.volume || 0) + usd;
  coin.holders = Math.max(Number(coin.holders || 0), 1 + Math.floor(Number(coin.volume || 0) / 12000));
  coin.move = Number(coin.move || 0) + (side === "buy" ? Math.min(9, usd / 180) : -Math.min(7, usd / 220));
  if (coin.practice) {
    state.practiceCoins = state.practiceCoins.map((row) => (row.id === coin.id ? coin : row));
  }
  state.demoTrades += 1;
  state.orders.push({ side: side === "buy" ? "Buy" : "Sell", coinId: coin.id, symbol: coin.symbol, usd, tokens, account: "you", time: "just now" });
  state.orders = state.orders.slice(-60);
  if (state.demoTrades === 1) addXp(30, "first demo trade");
  saveState();
  render();
}

function generateIdea() {
  createPracticeCoin();
}

function createPracticeCoin() {
  const draft = state.launchDraft;
  const name = String(draft.name || "").trim();
  const symbol = String(draft.symbol || "").trim().replace(/[^a-z0-9]/gi, "").slice(0, 12).toUpperCase();
  if (!name || !symbol) {
    setNotice("Add a coin name and ticker first.", true);
    return;
  }
  const id = `practice-${Date.now()}`;
  const starter = Math.max(0, Number(draft.starterBuy || 0) || 0);
  const supply = 1000000000;
  const coin = {
    id,
    name,
    symbol,
    chain: String(draft.chain || "ETH").toUpperCase(),
    image: draft.imageData || "/assets/pump-r-logo.png?v=20260608r",
    basePrice: Math.max(0.000001, 0.000018 + starter * 0.000012),
    supply,
    move: starter > 0 ? 12.4 + starter * 4 : 2.8,
    volume: 2400 + starter * 18000,
    holders: starter > 0 ? 12 : 1,
    liquidity: 1200 + starter * 12000,
    story: draft.description || "A practice launch created from the onboarding flow.",
    risk: "Practice only. No wallet transaction was sent.",
    seed: 22 + state.practiceCoins.length * 5,
    practice: true,
    mode: draft.mode
  };
  state.practiceCoins.unshift(coin);
  state.practiceCoins = state.practiceCoins.slice(0, 8);
  state.selectedCoin = id;
  state.activeTab = "play";
  if (!state.watchlist.includes(id)) state.watchlist.unshift(id);
  if (starter > 0) {
    const usd = starter * 3000;
    state.cash = Math.max(0, state.cash - usd);
    state.holdings[id] = Number(state.holdings[id] || 0) + usd / coin.basePrice;
    state.orders.push({
      side: "Buy",
      coinId: id,
      symbol,
      usd,
      tokens: usd / coin.basePrice,
      account: "you",
      time: "launch"
    });
  }
  state.orders.push({
    side: "Buy",
    coinId: id,
    symbol,
    usd: 250,
    tokens: 250 / coin.basePrice,
    account: "paperWhale",
    time: "just now"
  });
  state.orders.push({
    side: "Buy",
    coinId: id,
    symbol,
    usd: 110,
    tokens: 110 / coin.basePrice,
    account: "chartStudent",
    time: "just now"
  });
  state.orders = state.orders.slice(-40);
  state.demoTrades += starter > 0 ? 1 : 0;
  state.generatedMemes += 1;
  state.launchScore = Math.min(100, state.launchScore + 12);
  state.lastPlan = `${name} was created as a practice token. Use the Play tab to buy, sell, and watch simulated tx flow move the chart.`;
  addXp(35, "practice coin created");
  saveState();
  render();
}

function updateDraftField(field, value) {
  if (!Object.hasOwn(state.launchDraft, field)) return;
  state.launchDraft[field] = String(value || "");
  saveState();
}

function setDraftChain(chain) {
  state.launchDraft.chain = String(chain || "ETH");
  if (state.launchDraft.chain === "SOL" && state.launchDraft.mode === "usdc") {
    state.launchDraft.mode = "native";
  }
  saveState();
  render();
}

function setDraftMode(mode) {
  state.launchDraft.mode = String(mode || "native");
  saveState();
  render();
}

function readDraftFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setNotice("For the practice preview, use an image file.", true);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    state.launchDraft.imageData = String(reader.result || "");
    state.launchDraft.imageName = file.name || "uploaded image";
    saveState();
    render();
  };
  reader.readAsDataURL(file);
}

function claimQuest(id) {
  const quest = questDefs.find((row) => row.id === id);
  if (!quest || state.claimedQuests.includes(id) || !quest.test(state)) return;
  state.claimedQuests.push(id);
  addXp(quest.xp, "quest claimed");
  saveState();
  render();
}

function voteBattle() {
  state.battleVotes += 1;
  if (state.battleVotes <= 2) addXp(25, "battle vote");
  saveState();
  render();
}

function toggleWatch(id) {
  if (state.watchlist.includes(id)) {
    state.watchlist = state.watchlist.filter((coinId) => coinId !== id);
  } else {
    state.watchlist.push(id);
  }
  saveState();
  render();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.onboardTab) {
    state.activeTab = target.dataset.onboardTab;
    saveState();
    render();
  } else if (target.dataset.selectCoin) {
    state.selectedCoin = target.dataset.selectCoin;
    saveState();
    render();
  } else if (target.dataset.watchCoin) {
    toggleWatch(target.dataset.watchCoin);
  } else if (target.dataset.completeLesson) {
    completeLesson(target.dataset.completeLesson);
  } else if (target.dataset.quiz) {
    answerQuiz(target.dataset.quiz, target.dataset.answer || "");
  } else if (target.dataset.tradeSide) {
    state.tradeSide = target.dataset.tradeSide === "sell" ? "sell" : "buy";
    if (state.tradeSide === "sell" && !state.selectedSellTokens) {
      const coin = selectedCoin();
      state.selectedSellTokens = String((Number(state.holdings[coin.id] || 0) * 0.25).toFixed(2));
    }
    saveState();
    render();
  } else if (target.dataset.selectTradeAmount) {
    state.selectedTradeAmount = Math.max(10, Number(target.dataset.selectTradeAmount || 500) || 500);
    saveState();
    render();
  } else if (target.dataset.selectSellPercent) {
    const coin = selectedCoin();
    const pct = Math.max(0, Math.min(100, Number(target.dataset.selectSellPercent || 0) || 0));
    state.selectedSellTokens = String((Number(state.holdings[coin.id] || 0) * (pct / 100)).toFixed(2));
    saveState();
    render();
  } else if (target.dataset.executePracticeTrade) {
    const coin = selectedCoin();
    tradeDemo(
      target.dataset.executePracticeTrade,
      state.tradeSide === "sell" ? "sell" : "buy",
      state.tradeSide === "sell" ? Number(state.selectedSellTokens || 0) || Number(state.holdings[coin.id] || 0) * 0.25 : state.selectedTradeAmount || 500
    );
  } else if (target.dataset.buyDemo) {
    tradeDemo(target.dataset.buyDemo, "buy", target.dataset.size || 500);
  } else if (target.dataset.sellDemo) {
    tradeDemo(target.dataset.sellDemo, "sell");
  } else if (target.dataset.draftChain) {
    setDraftChain(target.dataset.draftChain);
  } else if (target.dataset.draftMode) {
    setDraftMode(target.dataset.draftMode);
  } else if (target.id === "onboardPickFileBtn") {
    document.getElementById("onboardImageFile")?.click();
  } else if (target.id === "onboardPracticeLaunchBtn") {
    generateIdea();
  } else if (target.id === "onboardGenerateBtn") {
    generateIdea();
  } else if (target.dataset.claimQuest) {
    claimQuest(target.dataset.claimQuest);
  } else if (target.dataset.battleVote) {
    voteBattle();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset?.draftField) {
    updateDraftField(target.dataset.draftField, target.value);
  } else if (target.dataset?.practiceTradeInput === "buy") {
    state.selectedTradeAmount = Math.max(1, Number(target.value || 0) || 0);
    saveState();
  } else if (target.dataset?.practiceTradeInput === "sell") {
    state.selectedSellTokens = String(Math.max(0, Number(target.value || 0) || 0));
    saveState();
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.id === "onboardImageFile") {
    readDraftFile(target.files?.[0]);
  }
});

render();
