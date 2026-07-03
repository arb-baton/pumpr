import { api } from "./api.js?v=20260703launchmode";
import {
  FACTORY_ABI,
  TOKEN_ABI,
  connectSolanaWallet as connectSharedSolanaWallet,
  defaultUsername,
  ensureWalletChain,
  ethers,
  fetchEthUsdPrice,
  getPreferredChainId,
  hydrateFollowerCount,
  hydrateUserProfile,
  loadUserProfile,
  makeFallbackImage,
  makeFactoryContract,
  makePoolContract,
  parseUiError,
  saveUserProfile,
  sendTxWithFallback,
  setPreferredChainId,
  shortAddress,
  solanaWalletState,
  walletState
} from "./core.js?v=20260703sharedauth";
import { initTopbarWalletProfile, setAlert, showCopyToast } from "./ui.js?v=20260703sharedauth";
import { initCoinSearchOverlay } from "./searchModal.js?v=20260703sharedauth";
import { initSupportWidget } from "./support.js?v=20260703adminwallet";
import { KOL_LEADERBOARD } from "./kolData.js?v=20260703ansem";

const MIN_INITIAL_LIQUIDITY_ETH = 0;
const DEFAULT_TOKEN_TRADE_TAX_PCT = 0.5;
const MAX_TOKEN_TRADE_TAX_PCT = 10;
const HOME_LAUNCH_CACHE_KEY = "etherpump.launches.cache.v3";
const HOME_LAUNCH_CACHE_MAX_ITEMS = 120;
const DEFAULT_PUMPFUN_SUPPLY = 1_000_000_000;
const PUMPFUN_ESTIMATE_VIRTUAL_SOL = 30;

const ui = {
  walletSelect: document.getElementById("walletChoice"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletLabel: document.getElementById("walletAddress"),
  alert: document.getElementById("alert"),
  tokenSearchInput: document.getElementById("tokenSearchInput"),
  signInBtn: document.getElementById("signInBtn"),
  profileMenuBtn: document.getElementById("profileMenuBtn"),
  profileMenu: document.getElementById("profileMenu"),
  profileMenuName: document.getElementById("profileMenuName"),
  profileMenuNameLarge: document.getElementById("profileMenuNameLarge"),
  profileMenuMeta: document.getElementById("profileMenuMeta"),
  profileShareBtn: document.getElementById("profileShareBtn"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileAvatarLarge: document.getElementById("profileAvatarLarge"),
  walletHubBtn: document.getElementById("walletHubBtn"),
  walletHubMenu: document.getElementById("walletHubMenu"),
  walletHubBalance: document.getElementById("walletHubBalance"),
  walletHubBalanceLarge: document.getElementById("walletHubBalanceLarge"),
  walletHubNative: document.getElementById("walletHubNative"),
  walletHubAddressBtn: document.getElementById("walletHubAddressBtn"),
  walletHubDepositBtn: document.getElementById("walletHubDepositBtn"),
  walletHubTradeLink: document.getElementById("walletHubTradeLink"),
  walletHubBuyLink: document.getElementById("walletHubBuyLink"),
  walletHubHistoryLink: document.getElementById("walletHubHistoryLink"),
  depositModal: document.getElementById("depositModal"),
  depositCloseBtn: document.getElementById("depositCloseBtn"),
  depositCopyBtn: document.getElementById("depositCopyBtn"),
  depositAddressText: document.getElementById("depositAddressText"),
  depositQrImage: document.getElementById("depositQrImage"),
  profileNav: document.getElementById("profileNav"),
  profileNavSide: document.getElementById("profileNavSide"),
  editProfileBtn: document.getElementById("editProfileBtn"),
  menuLogoutBtn: document.getElementById("menuLogoutBtn"),
  netChip: document.getElementById("networkChip"),
  factoryChip: document.getElementById("factoryChip"),
  launchChainOptions: document.getElementById("launchChainOptions"),
  launchPumpVerseOptions: document.getElementById("launchPumpVerseOptions"),
  launchChainLabel: document.getElementById("launchChainLabel"),
  launchChainHint: document.getElementById("launchChainHint"),
  advancedDetails: document.querySelector(".create-advanced"),
  pumpfunOptions: null,
  pumpfunDevBuySol: null,
  kolApplicationCard: null,
  kolSendEnabled: null,
  kolToggleText: null,
  kolSelect: null,
  kolBuySol: null,
  kolSelectedAvatar: null,
  kolSelectedName: null,
  kolSelectedWallet: null,
  kolTokenEstimate: null,
  kolSupplyEstimate: null,
  kolRouteStatus: null,
  createForm: document.getElementById("createForm"),
  launchSubmitBtn: document.getElementById("launchSubmitBtn"),
  name: document.getElementById("name"),
  symbol: document.getElementById("symbol"),
  description: document.getElementById("description"),
  image: document.getElementById("image"),
  imageFile: document.getElementById("imageFile"),
  pickFileBtn: document.getElementById("pickFileBtn"),
  uploadDropzone: document.getElementById("uploadDropzone"),
  uploadPreviewImage: document.getElementById("uploadPreviewImage"),
  uploadMediaWrap: document.getElementById("uploadMediaWrap"),
  uploadCopy: document.getElementById("uploadCopy"),
  supply: document.getElementById("supply"),
  creatorBuyEth: document.getElementById("creatorBuyEth"),
  creatorAllocationPreviewWrap: document.getElementById("creatorAllocationPreviewWrap"),
  creatorAllocationPreview: document.getElementById("creatorAllocationPreview"),
  creatorAllocationTokens: document.getElementById("creatorAllocationTokens"),
  creatorAllocationHint: document.getElementById("creatorAllocationHint"),
  website: document.getElementById("website"),
  twitter: document.getElementById("twitter"),
  telegram: document.getElementById("telegram"),
  starterBuyLabel: document.getElementById("starterBuyLabel"),
  devBuyEth: document.getElementById("devBuyEth"),
  tradeTaxPct: document.getElementById("tradeTaxPct"),
  starterMcapLabel: document.getElementById("starterMcapLabel"),
  launchMcapUsd: document.getElementById("launchMcapUsd"),
  pumpfunCreatorWalletWrap: document.getElementById("pumpfunCreatorWalletWrap"),
  launchMathCard: document.getElementById("launchMathCard"),
  launchMathPrimary: document.getElementById("launchMathPrimary"),
  launchMathSecondary: document.getElementById("launchMathSecondary"),
  launchMathTertiary: document.getElementById("launchMathTertiary"),
  launchMathQuaternary: document.getElementById("launchMathQuaternary"),
  pumpfunCreatorWallet: document.getElementById("pumpfunCreatorWallet"),
  imagePreview: document.getElementById("imagePreview"),
  previewName: document.getElementById("previewName"),
  previewSymbol: document.getElementById("previewSymbol"),
  previewDescription: document.getElementById("previewDescription"),
  resultLink: document.getElementById("resultLink"),
  launchResultList: document.getElementById("launchResultList"),
  createdModal: document.getElementById("createdModal"),
  createdTokenName: document.getElementById("createdTokenName"),
  createdTokenAddress: document.getElementById("createdTokenAddress"),
  openTokenBtn: document.getElementById("openTokenBtn"),
  copyTokenBtn: document.getElementById("copyTokenBtn"),
  closeCreatedModal: document.getElementById("closeCreatedModal"),
  editProfileModal: document.getElementById("editProfileModal"),
  closeEditProfileModal: document.getElementById("closeEditProfileModal"),
  saveEditProfileBtn: document.getElementById("saveEditProfileBtn"),
  editUsername: document.getElementById("editUsername"),
  editBio: document.getElementById("editBio"),
  editAvatarPreview: document.getElementById("editAvatarPreview"),
  editAvatarFile: document.getElementById("editAvatarFile"),
  editAvatarPickBtn: document.getElementById("editAvatarPickBtn"),
  editAvatarRemoveBtn: document.getElementById("editAvatarRemoveBtn")
};

const MAX_IMAGE_BYTES = 900 * 1024;
const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const state = {
  config: null,
  selectedChainId: 1,
  selectedLaunchMode: "pumpfun",
  selectedQuoteMode: "native",
  selectedPumpVerseChains: [1, 8453],
  supportedChains: [],
  quoteLaunchOptions: [],
  ethUsd: 3000,
  lastPumpVerseDetails: null,
  lastPumpVerseResults: [],
  solanaWallet: null
};
const LAUNCH_CHAIN_CHOICES = [
  {
    mode: "pumpfun",
    name: "Pump.fun",
    shortName: "SOL",
    networkLabel: "Launch through Pump.fun",
    externalLaunch: true
  },
  { chainId: 1, name: "Ethereum", shortName: "ETH", networkLabel: "Mainnet" },
  { chainId: 8453, name: "Base", shortName: "BASE", networkLabel: "Mainnet" },
  { chainId: 143, name: "Monad", shortName: "MONAD", networkLabel: "Mainnet" },
  { chainId: 4663, name: "Robinhood Chain", shortName: "RH", networkLabel: "ETH gas" },
  {
    mode: "usdc:1",
    name: "Ethereum + USDC",
    shortName: "ETH + USDC",
    networkLabel: "USDC-paired bonding curve",
    requiredChains: [1],
    quoteMode: "usdc"
  },
  {
    mode: "pumpverse",
    name: "PumpVerse",
    shortName: "MULTI",
    networkLabel: "Choose chains",
    requiredMinChains: 2
  }
];
const PUMPVERSE_COMBO_CHOICES = [
  {
    mode: "pumpverse:1,8453",
    name: "ETH + BASE",
    shortName: "ETH + BASE",
    networkLabel: "Multiverse launch",
    requiredChains: [1, 8453]
  },
  {
    mode: "pumpverse:1,143",
    name: "ETH + MONAD",
    shortName: "ETH + MONAD",
    networkLabel: "Multiverse launch",
    requiredChains: [1, 143]
  },
  {
    mode: "pumpverse:8453,143",
    name: "BASE + MONAD",
    shortName: "BASE + MONAD",
    networkLabel: "Multiverse launch",
    requiredChains: [8453, 143]
  },
  {
    mode: "pumpverse:1,8453,143",
    name: "All three",
    shortName: "ETH + BASE + MONAD",
    networkLabel: "Multiverse launch",
    requiredChains: [1, 8453, 143]
  }
];

let pendingProfileImageUri = "";
let walletHub = null;
let walletControls = null;

function ensurePumpFunOptions() {
  if (ui.pumpfunOptions) return;
  const panel = document.createElement("div");
  panel.className = "create-pumpfun-options";
  panel.hidden = true;
  panel.innerHTML = `
    <label>
      Pump.fun dev wallet buy (SOL)
      <input id="pumpfunDevBuySol" type="number" step="any" min="0" placeholder="0" value="0" />
    </label>
    <p class="create-pumpfun-note">Optional initial buy from the connected Phantom/dev wallet in the same Pump.fun launch transaction.</p>
  `;
  ui.advancedDetails?.insertAdjacentElement("afterend", panel);
  ui.pumpfunOptions = panel;
  ui.pumpfunDevBuySol = panel.querySelector("#pumpfunDevBuySol");
  ensureKolSendOptions();
}

function ensureKolSendOptions() {
  if (ui.kolApplicationCard || !ui.pumpfunOptions) return;
  const panel = document.createElement("section");
  panel.id = "kolApplicationCard";
  panel.className = "kol-application-card";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="kol-application-head">
      <div>
        <p class="kol-eyebrow">Token send</p>
        <h3>Send tokens after launch</h3>
        <p class="kol-subcopy">Optional buy and transfer to a selected Solana wallet after the Pump.fun token is live.</p>
      </div>
      <label class="kol-toggle">
        <input id="kolSendEnabled" type="checkbox" />
        <span class="kol-switch" aria-hidden="true"></span>
        <span id="kolToggleText" class="kol-toggle-text">Off</span>
      </label>
    </div>
    <div class="kol-application-body">
      <div class="kol-preview">
        <img id="kolSelectedAvatar" alt="" src="/assets/pump-r-logo.png" />
        <div>
          <strong id="kolSelectedName">Select wallet</strong>
          <span id="kolSelectedWallet">Wallet -</span>
        </div>
      </div>
      <label>
        Wallet list
        <select id="kolSelect"></select>
      </label>
      <label>
        SOL buy amount
        <input id="kolBuySol" type="number" step="any" min="0" placeholder="0.05" value="0.05" />
      </label>
      <div class="kol-estimate-grid">
        <article>
          <span>Estimated tokens</span>
          <strong id="kolTokenEstimate">0 tokens</strong>
        </article>
        <article>
          <span>Estimated supply</span>
          <strong id="kolSupplyEstimate">0%</strong>
        </article>
      </div>
      <p id="kolRouteStatus" class="kol-route-status">Token send is off.</p>
    </div>
  `;
  ui.pumpfunOptions.insertAdjacentElement("afterend", panel);
  ui.kolApplicationCard = panel;
  ui.kolSendEnabled = panel.querySelector("#kolSendEnabled");
  ui.kolToggleText = panel.querySelector("#kolToggleText");
  ui.kolSelect = panel.querySelector("#kolSelect");
  ui.kolBuySol = panel.querySelector("#kolBuySol");
  ui.kolSelectedAvatar = panel.querySelector("#kolSelectedAvatar");
  ui.kolSelectedName = panel.querySelector("#kolSelectedName");
  ui.kolSelectedWallet = panel.querySelector("#kolSelectedWallet");
  ui.kolTokenEstimate = panel.querySelector("#kolTokenEstimate");
  ui.kolSupplyEstimate = panel.querySelector("#kolSupplyEstimate");
  ui.kolRouteStatus = panel.querySelector("#kolRouteStatus");
  setupKolApplicationControls();
}

function followerMetaText(count) {
  const numeric = Math.max(0, Number(count || 0));
  return `${numeric} ${numeric === 1 ? "follower" : "followers"}`;
}

function requiredMinLiquidityEth(address = walletState().address) {
  void address;
  return MIN_INITIAL_LIQUIDITY_ETH;
}

function formatHolderAccessMessage(eligibility = {}, action = "launch tokens") {
  const symbol = String(eligibility.symbol || "PUMPR").replace(/^\$/, "").toUpperCase();
  const chain = String(eligibility.chainShortName || eligibility.chainName || "configured chain");
  const held = Number(eligibility.balanceTokens || 0);
  const heldText = Number.isFinite(held) && held > 0
    ? held.toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "0";
  return `You hold ${heldText} $${symbol} on ${chain}. Hold any amount above 0 $${symbol} in this wallet to ${action}. 1%+ holders will also be eligible for later airdrops.`;
}

function currentLaunchContext() {
  return isPumpFunMode()
    ? { launchMode: "pumpfun", targetChainId: 101 }
    : { launchMode: "evm", targetChainId: Number(state.selectedChainId || state.config?.chainId || 1) };
}

async function ensurePumpRHolderAccess({ address = "", solanaAddress = "", action = "launch tokens", launchMode = "", targetChainId = 0 } = {}) {
  const context = launchMode || targetChainId ? { launchMode, targetChainId } : currentLaunchContext();
  const eligibility = await api.holderEligibility({ address, solanaAddress, ...context });
  if (eligibility?.required === false) return eligibility;
  if (!eligibility?.configured) {
    throw new Error("Official Pump-r token is not configured yet. Set PUMPR_TOKEN_ADDRESS and PUMPR_TOKEN_CHAIN_ID before enabling launches.");
  }
  if (eligibility.required !== false && !eligibility.eligibleToLaunch) {
    throw new Error(formatHolderAccessMessage(eligibility, action));
  }
  return eligibility;
}

function syncLiquidityInputMin() {
  if (!ui.devBuyEth) return;
  const minLiquidity = requiredMinLiquidityEth(walletState().address);
  ui.devBuyEth.min = String(minLiquidity);
  const current = parseNumberInput(ui.devBuyEth.value, 0);
  if (!Number.isFinite(current) || current < minLiquidity) {
    ui.devBuyEth.value = minLiquidity > 0 ? minLiquidity.toFixed(minLiquidity < 0.01 ? 4 : 1) : "0";
  }
}

function normalizeSupportedChains(config = state.config) {
  const rows = Array.isArray(config?.supportedChains) ? config.supportedChains : [];
  const map = new Map();
  for (const row of rows) {
    const chainId = Number(row?.chainId || 0);
    if (!Number.isFinite(chainId) || chainId <= 0 || !row?.factoryAddress) continue;
    map.set(chainId, {
      chainId,
      name: row.name || config?.chainName || `Chain ${chainId}`,
      shortName: row.shortName || config?.chainShortName || String(chainId),
      nativeCurrency: row.nativeCurrency || config?.nativeCurrency || "ETH",
      factoryAddress: row.factoryAddress
    });
  }
  if (config?.factoryAddress) {
    const chainId = Number(config.chainId || 1);
    map.set(chainId, {
      chainId,
      name: config.chainName || `Chain ${chainId}`,
      shortName: config.chainShortName || String(chainId),
      nativeCurrency: config.nativeCurrency || "ETH",
      factoryAddress: config.factoryAddress
    });
  }
  const chainRank = (chainId) => {
    const order = [1, 8453, 143, 4663, 101, 11155111, 31337];
    const index = order.indexOf(Number(chainId));
    return index >= 0 ? index : order.length + Number(chainId || 0);
  };
  return [...map.values()].sort((a, b) => chainRank(a.chainId) - chainRank(b.chainId));
}

function selectedChain() {
  return state.supportedChains.find((row) => Number(row.chainId) === Number(state.selectedChainId)) || state.supportedChains[0] || null;
}

function isPumpVerseMode() {
  return String(state.selectedLaunchMode || "").startsWith("pumpverse:");
}

function isPumpFunMode() {
  return String(state.selectedLaunchMode || "") === "pumpfun";
}

function selectedQuoteMode() {
  return state.selectedQuoteMode === "usdc" ? "usdc" : "native";
}

function selectedQuoteAsset() {
  if (state.config?.quoteAsset) return state.config.quoteAsset;
  return selectedQuoteMode() === "usdc"
    ? { mode: "usdc", symbol: "USDC", decimals: 6, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", isNative: false }
    : { mode: "native", symbol: "ETH", decimals: 18, address: ethers.ZeroAddress, isNative: true };
}

function configuredChainMap() {
  const map = new Map();
  for (const row of state.supportedChains) {
    const chainId = Number(row?.chainId || 0);
    if (!Number.isFinite(chainId) || chainId <= 0) continue;
    map.set(chainId, row);
  }
  return map;
}

function chainNameForId(chainId) {
  const n = Number(chainId || 0);
  if (n === 1) return "Ethereum";
  if (n === 8453) return "Base";
  if (n === 143) return "Monad";
  if (n === 4663) return "Robinhood Chain";
  if (n === 101) return "Solana";
  return `Chain ${n}`;
}

function chainShortNameForId(chainId) {
  const n = Number(chainId || 0);
  if (n === 1) return "ETH";
  if (n === 8453) return "BASE";
  if (n === 143) return "MONAD";
  if (n === 4663) return "RH";
  if (n === 101) return "SOL";
  return String(n);
}

function isRobinhoodChainSelected() {
  return Number(state.selectedChainId || 0) === 4663 && !isPumpFunMode() && !isPumpVerseMode() && selectedQuoteMode() === "native";
}

function isRobinhoodDirectLiquidityMode() {
  return isRobinhoodChainSelected();
}

function normalizePumpVerseChains(chains = state.selectedPumpVerseChains, { requireConfigured = true } = {}) {
  const supported = configuredChainMap();
  const unique = [];
  for (const value of chains) {
    const chainId = Number(value || 0);
    if (!Number.isFinite(chainId) || chainId <= 0 || unique.includes(chainId)) continue;
    if (requireConfigured && supported.size && !supported.has(chainId)) continue;
    unique.push(chainId);
  }
  return unique;
}

function pumpVerseModeForChains(chains = state.selectedPumpVerseChains) {
  const normalized = normalizePumpVerseChains(chains);
  return normalized.length >= 2 ? `pumpverse:${normalized.join(",")}` : "";
}

function parsePumpVerseMode(mode = state.selectedLaunchMode) {
  const text = String(mode || "");
  if (!text.startsWith("pumpverse:")) return [];
  return normalizePumpVerseChains(text.slice("pumpverse:".length).split(","), { requireConfigured: false });
}

function pumpVerseLabel(chains = state.selectedPumpVerseChains) {
  const normalized = normalizePumpVerseChains(chains);
  return normalized.map(chainNameForId).join(" + ");
}

function renderChainSelector() {
  const current = selectedChain();
  const supported = configuredChainMap();
  const quoteOptions = Array.isArray(state.quoteLaunchOptions) ? state.quoteLaunchOptions : [];
  const monadConfigured = supported.has(143);
  const configuredCount = supported.size;
  ensurePumpFunOptions();
  if (ui.advancedDetails) {
    ui.advancedDetails.hidden = isPumpFunMode();
    if (isPumpFunMode()) ui.advancedDetails.open = false;
  }
  if (ui.pumpfunOptions) ui.pumpfunOptions.hidden = !isPumpFunMode();
  if (ui.kolApplicationCard) ui.kolApplicationCard.hidden = !isPumpFunMode();
  if (ui.pumpfunCreatorWalletWrap) ui.pumpfunCreatorWalletWrap.hidden = !isPumpFunMode();
  ui.createForm?.classList.toggle("create-mode-solana", isPumpFunMode());
  ui.createForm?.classList.toggle("create-mode-evm", !isPumpFunMode());
  if (ui.starterBuyLabel) {
    ui.starterBuyLabel.textContent = isRobinhoodDirectLiquidityMode()
      ? "Direct Uniswap liquidity (ETH)"
      : "Optional starter buy (ETH)";
  }
  if (ui.starterMcapLabel) {
    ui.starterMcapLabel.textContent = isRobinhoodDirectLiquidityMode()
      ? "Direct Uniswap launch market cap estimate (USD)"
      : "Starter buy market cap estimate (USD)";
  }
  updateKolEstimate();
  if (ui.launchChainLabel) {
    ui.launchChainLabel.textContent = isPumpVerseMode()
      ? "PumpVerse"
      : selectedQuoteMode() === "usdc"
      ? "Ethereum + USDC"
      : current?.name || state.config?.chainName || "Ethereum";
  }
  if (ui.netChip && state.config) {
    ui.netChip.textContent = state.config.chainShortName || `Chain ${state.config.chainId}`;
  }
  if (ui.factoryChip && state.config?.factoryAddress) {
    ui.factoryChip.textContent = shortAddress(state.config.factoryAddress);
  }
  if (ui.launchChainHint) {
    ui.launchChainHint.textContent = isPumpFunMode()
      ? "Pump.fun launches require a Solana wallet, hosted image metadata, a valid ticker, and enough SOL for Pump.fun fees and network gas. After signing, you will be redirected to the Pump.fun coin page."
      : isPumpVerseMode()
      ? `PumpVerse launches the same token details on ${pumpVerseLabel()}. MetaMask will ask for separate confirmations.`
      : selectedQuoteMode() === "usdc"
      ? "USDC launches use a USDC-paired bonding curve. Buyers can still route from ETH through Uniswap after graduation."
      : Number(current?.chainId || state.selectedChainId) === 4663
      ? "Robinhood Chain uses ETH for gas. Add starter liquidity only after a DEX router is configured; LP is burned automatically. Keep it at 0 to launch as-is."
      : monadConfigured
      ? "Wallet will switch to the selected network before launch."
      : "Monad launches are ready once the Monad factory address is configured.";
  }
  if (ui.launchChainOptions) {
    ui.launchChainOptions.innerHTML = LAUNCH_CHAIN_CHOICES
      .map((choice) => {
        const mode = choice.mode || String(choice.chainId);
        const isPumpVerseParent = mode === "pumpverse";
        const isUsdcMode = choice.quoteMode === "usdc";
        const isExternalLaunch = Boolean(choice.externalLaunch);
        const requiredChains = Array.isArray(choice.requiredChains) ? choice.requiredChains : [choice.chainId];
        const enabled = isPumpVerseParent
          ? configuredCount >= Number(choice.requiredMinChains || 2)
          : isExternalLaunch
          ? true
          : isUsdcMode
          ? quoteOptions.some((row) => row.mode === "usdc" && Number(row.chainId) === 1 && row.factoryAddress)
          : requiredChains.every((chainId) => supported.has(Number(chainId)));
        const row = choice.chainId ? supported.get(choice.chainId) : null;
        const active = enabled && (isPumpVerseParent ? isPumpVerseMode() : String(mode) === String(state.selectedLaunchMode));
        const chainAttr = choice.chainId ? `data-chain-id="${choice.chainId}"` : "";
        const description = isPumpVerseParent
          ? "Choose two or three chains"
          : isExternalLaunch
          ? "Solana launch + Pump.fun redirect"
          : isUsdcMode
          ? `USDC pair${enabled ? "" : " - configure USDC factory"}`
          : `${row?.shortName || choice.shortName} ${choice.networkLabel}${enabled ? "" : " - configure factory"}`;
        return `
          <button class="create-chain-option${isPumpVerseParent ? " pumpverse" : ""}${active ? " active" : ""}${enabled ? "" : " disabled"}" type="button" ${chainAttr} data-launch-mode="${mode}" role="tab" aria-selected="${active ? "true" : "false"}" ${enabled ? "" : "disabled aria-disabled=\"true\""}>
            <strong>${row?.name || choice.name}</strong>
            <span>${description}</span>
          </button>
        `;
      })
      .join("");
  }
  if (!ui.launchPumpVerseOptions) return;
  ui.launchPumpVerseOptions.hidden = !isPumpVerseMode();
  if (!isPumpVerseMode()) {
    ui.launchPumpVerseOptions.innerHTML = "";
    return;
  }
  ui.launchPumpVerseOptions.innerHTML = PUMPVERSE_COMBO_CHOICES
    .map((choice) => {
      const enabled = choice.requiredChains.every((chainId) => supported.has(Number(chainId)));
      const active = enabled && String(choice.mode) === String(state.selectedLaunchMode);
      const missing = choice.requiredChains.filter((chainId) => !supported.has(Number(chainId))).map(chainShortNameForId);
      const detail = enabled ? "one guided flow" : `needs ${missing.join(" + ")} factory`;
      return `
        <button class="create-pumpverse-option${active ? " active" : ""}${enabled ? "" : " disabled"}" type="button" data-launch-mode="${choice.mode}" aria-pressed="${active ? "true" : "false"}" ${enabled ? "" : "disabled aria-disabled=\"true\""}>
          <strong>${choice.name}</strong>
          <span>${choice.shortName} ${detail}</span>
        </button>
      `;
    })
    .join("");
}

async function loadChainConfig(chainId = state.selectedChainId, quoteMode = selectedQuoteMode()) {
  const next = await api.config({ chainId, quote: quoteMode });
  state.config = next;
  state.selectedChainId = Number(next.chainId || chainId || 1);
  state.selectedQuoteMode = next.quoteMode || quoteMode || "native";
  state.supportedChains = normalizeSupportedChains(next);
  state.quoteLaunchOptions = Array.isArray(next.quoteLaunchOptions) ? next.quoteLaunchOptions : [];
  setPreferredChainId(state.selectedChainId);
  renderChainSelector();
  updateLaunchMath({ source: "liquidity" });
  return next;
}

async function selectLaunchChain(chainId) {
  const target = Number(chainId || 0);
  if (!Number.isFinite(target) || target <= 0) return;
  if (String(state.selectedLaunchMode) === String(target) && target === Number(state.selectedChainId)) return;
  if (!state.supportedChains.some((row) => Number(row.chainId) === target)) {
    setAlert(ui.alert, `${chainNameForId(target)} factory is not configured yet.`, true);
    return;
  }
  try {
    setAlert(ui.alert, `Loading ${chainNameForId(target)} launch settings...`);
    await loadChainConfig(target, "native");
    state.selectedQuoteMode = "native";
    state.selectedLaunchMode = String(target);
    renderChainSelector();
    const ws = walletState();
    if (ws.signer) {
      await ensureWalletChain(state.selectedChainId);
      await walletHub?.refresh();
    }
    setAlert(ui.alert, `${state.config.chainName || "Network"} selected for launch.`);
  } catch (err) {
    setAlert(ui.alert, parseUiError(err), true);
    await loadChainConfig(state.selectedChainId).catch(() => {});
  }
}

async function selectUsdcLaunchMode() {
  try {
    setAlert(ui.alert, "Loading Ethereum + USDC launch settings...");
    await loadChainConfig(1, "usdc");
    state.selectedChainId = 1;
    state.selectedQuoteMode = "usdc";
    state.selectedLaunchMode = "usdc:1";
    renderChainSelector();
    const ws = walletState();
    if (ws.signer) {
      await ensureWalletChain(1);
      await walletHub?.refresh();
    }
    setAlert(ui.alert, "Ethereum + USDC selected for launch.");
  } catch (err) {
    setAlert(ui.alert, parseUiError(err), true);
  }
}

function selectPumpFunLaunchMode() {
  state.selectedLaunchMode = "pumpfun";
  state.selectedQuoteMode = "native";
  renderChainSelector();
  updateProfileIdentity();
  walletControls?.refresh?.();
  setAlert(ui.alert, "Pump.fun launch selected. Sign in with Phantom or Solflare, then launch with the official Pump.fun SDK transaction.");
}

async function selectPumpVerseMode(mode) {
  const supported = configuredChainMap();
  let requested = parsePumpVerseMode(mode);
  if (!requested.length) {
    const current = normalizePumpVerseChains(state.selectedPumpVerseChains);
    const firstAvailable = PUMPVERSE_COMBO_CHOICES.find((choice) => choice.requiredChains.every((chainId) => supported.has(Number(chainId))));
    requested = current.length >= 2 ? current : firstAvailable?.requiredChains || [];
  }
  if (requested.length < 2) {
    setAlert(ui.alert, "PumpVerse needs at least two configured chains.", true);
    return;
  }
  const missing = requested.filter((chainId) => !supported.has(chainId));
  if (missing.length) {
    setAlert(ui.alert, `PumpVerse needs configured factories for ${missing.map(chainNameForId).join(", ")}.`, true);
    return;
  }
  state.selectedPumpVerseChains = requested;
  state.selectedChainId = requested[0];
  state.selectedLaunchMode = pumpVerseModeForChains(requested);
  await loadChainConfig(requested[0]);
  state.selectedPumpVerseChains = requested;
  state.selectedLaunchMode = pumpVerseModeForChains(requested);
  renderChainSelector();
  setAlert(ui.alert, `PumpVerse selected. One form will launch on ${pumpVerseLabel(requested)}.`);
}

function setAvatarNode(node, text, imageUri = "") {
  if (!node) return;
  if (imageUri) {
    node.textContent = "";
    node.classList.add("with-image");
    node.style.backgroundImage = `url("${imageUri}")`;
    return;
  }

  node.classList.remove("with-image");
  node.style.backgroundImage = "";
  node.textContent = text;
}

function updateEditAvatarPreview(text = "EP", imageUri = "") {
  setAvatarNode(ui.editAvatarPreview, text, imageUri);
}

function setProfileMenuOpen(open) {
  if (!ui.profileMenu || !ui.profileMenuBtn) return;
  ui.profileMenu.classList.toggle("open", open);
  ui.profileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function updateProfileIdentity() {
  const sharedSolana = solanaWalletState();
  const activeSolanaPublicKey = state.solanaWallet?.publicKey || sharedSolana.address || "";
  if (sharedSolana.provider && sharedSolana.address) {
    state.solanaWallet = { provider: sharedSolana.provider, publicKey: sharedSolana.address };
  } else if (!activeSolanaPublicKey) {
    state.solanaWallet = null;
  }
  const ws = walletState();
  const connected = Boolean(ws.signer && ws.address);
  const generatedAddress = String(ws.generatedWallet?.address || "");
  const profileAddress = ws.address || generatedAddress || activeSolanaPublicKey || "";
  if (ui.profileNavSide) ui.profileNavSide.href = profileAddress ? `/profile?address=${encodeURIComponent(profileAddress)}` : "/profile";

  if (ui.editProfileBtn) {
    ui.editProfileBtn.disabled = !connected;
    ui.editProfileBtn.style.opacity = connected ? "1" : "0.6";
    ui.editProfileBtn.style.cursor = connected ? "pointer" : "not-allowed";
  }
  if (connected) {
    const currentAddress = String(ws.address || "");
    hydrateFollowerCount(currentAddress).then((followersCount) => {
      const next = walletState();
      if (String(next.address || "").toLowerCase() !== currentAddress.toLowerCase()) return;
      if (ui.profileMenuMeta) {
        ui.profileMenuMeta.textContent = followerMetaText(followersCount);
      }
    }).catch(() => {
      // ignore follower-count hydration failures
    });
    hydrateUserProfile(currentAddress).then(() => {
      const next = walletState();
      if (String(next.address || "").toLowerCase() !== currentAddress.toLowerCase()) return;
      const fresh = loadUserProfile(currentAddress);
      if (fresh.username !== username || String(fresh.imageUri || "") !== String(imageUri || "")) {
        updateProfileIdentity();
      }
    }).catch(() => {
      // ignore profile hydration failures
    });
  }
}

function hideEditProfileModal() {
  if (!ui.editProfileModal) return;
  ui.editProfileModal.classList.remove("open");
  ui.editProfileModal.setAttribute("aria-hidden", "true");
}

async function openEditProfileModal() {
  const ws = walletState();
  if (!ws.address) {
    setAlert(ui.alert, "Connect wallet first", true);
    return;
  }

  await hydrateUserProfile(ws.address, { force: true });
  const profile = loadUserProfile(ws.address);
  if (ui.editUsername) ui.editUsername.value = profile.username || defaultUsername(ws.address);
  if (ui.editBio) ui.editBio.value = profile.bio || "";
  pendingProfileImageUri = String(profile.imageUri || "");
  updateEditAvatarPreview((profile.username || "EP").slice(0, 2).toUpperCase(), pendingProfileImageUri);
  ui.editProfileModal?.classList.add("open");
  ui.editProfileModal?.setAttribute("aria-hidden", "false");
}

function setupProfileMenu() {
  ui.editProfileBtn?.addEventListener("click", () => {
    if (ui.editProfileBtn.disabled) return;
    setProfileMenuOpen(false);
    openEditProfileModal();
  });

  ui.profileShareBtn?.addEventListener("click", async () => {
    const ws = walletState();
    if (!ws.address) return;
    const profileUrl = new URL(`/profile?address=${ws.address}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(profileUrl);
      showCopyToast("Profile link copied");
    } catch {
      setAlert(ui.alert, "Could not copy profile link", true);
    }
  });
}

function setupEditProfileModal() {
  ui.closeEditProfileModal?.addEventListener("click", hideEditProfileModal);
  ui.editProfileModal?.addEventListener("click", (event) => {
    if (event.target === ui.editProfileModal) {
      hideEditProfileModal();
    }
  });

  ui.editAvatarPickBtn?.addEventListener("click", () => {
    ui.editAvatarFile?.click();
  });

  ui.editAvatarRemoveBtn?.addEventListener("click", () => {
    pendingProfileImageUri = "";
    const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
    updateEditAvatarPreview(text || "EP", "");
    if (ui.editAvatarFile) {
      ui.editAvatarFile.value = "";
    }
  });

  ui.editAvatarFile?.addEventListener("change", async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) throw new Error("Pick a valid image file");
      if (file.size > MAX_PROFILE_IMAGE_BYTES) throw new Error("Profile image too large. Keep it under 2 MB.");

      const dataUrl = await readFileAsDataUrl(file);
      setAlert(ui.alert, "Uploading profile image...");
      try {
        const uploaded = await api.uploadImage(dataUrl);
        pendingProfileImageUri = uploaded.url || dataUrl;
      } catch {
        pendingProfileImageUri = dataUrl;
      }
      const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
      updateEditAvatarPreview(text || "EP", pendingProfileImageUri);
      setAlert(ui.alert, "Profile image uploaded");
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    }
  });

  ui.editUsername?.addEventListener("input", () => {
    const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
    updateEditAvatarPreview(text || "EP", pendingProfileImageUri);
  });

  ui.saveEditProfileBtn?.addEventListener("click", async () => {
    const ws = walletState();
    if (!ws.address) {
      setAlert(ui.alert, "Connect wallet first", true);
      return;
    }

    const username = String(ui.editUsername?.value || "").trim();
    const bio = String(ui.editBio?.value || "").trim();

    if (!username) {
      setAlert(ui.alert, "Username is required", true);
      return;
    }

    const saved = await saveUserProfile(ws.address, { username, bio, imageUri: pendingProfileImageUri });
    updateProfileIdentity();
    hideEditProfileModal();
    if (saved?.synced) {
      setAlert(ui.alert, "Profile updated");
    } else {
      setAlert(ui.alert, "Profile saved locally, but cloud sync failed. Check backend env/API.", true);
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function showImagePreview(src) {
  if (!ui.imagePreview) return;
  if (!src) {
    ui.imagePreview.style.display = "none";
    ui.imagePreview.removeAttribute("src");
    return;
  }
  ui.imagePreview.src = src;
  ui.imagePreview.style.display = "block";
}

function showUploadBoxPreview(src) {
  if (!ui.uploadPreviewImage || !ui.uploadMediaWrap || !ui.uploadCopy) return;
  if (!src) {
    ui.uploadPreviewImage.removeAttribute("src");
    ui.uploadPreviewImage.style.display = "none";
    ui.uploadMediaWrap.classList.remove("active");
    ui.uploadCopy.style.display = "grid";
    return;
  }

  ui.uploadPreviewImage.src = src;
  ui.uploadPreviewImage.style.display = "block";
  ui.uploadMediaWrap.classList.add("active");
  ui.uploadCopy.style.display = "none";
}

function parseNumberInput(value, fallback = 0) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function deriveCreatorAllocationPct(liquidityEth, creatorBuyEth) {
  const safeLiquidityEth = Math.max(0, liquidityEth);
  const safeCreatorBuyEth = Math.max(0, creatorBuyEth);
  if (safeLiquidityEth <= 0) return safeCreatorBuyEth;
  const totalEth = safeLiquidityEth + safeCreatorBuyEth;
  if (totalEth <= 0) return 0;
  return (safeCreatorBuyEth / totalEth) * 100;
}

function getLaunchEconomics(
  liquidityEthInput = parseNumberInput(ui.devBuyEth?.value, 0),
  creatorBuyEthInput = parseNumberInput(ui.creatorBuyEth?.value, 0)
) {
  const totalSupply = parseNumberInput(ui.supply?.value, 0);
  const liquidityEth = Math.max(0, liquidityEthInput);
  const creatorBuyEth = Math.max(0, creatorBuyEthInput);
  const creatorPct = creatorBuyEth;
  const ethUsd = Number.isFinite(state.ethUsd) && state.ethUsd > 0 ? state.ethUsd : 3000;
  const quote = selectedQuoteAsset();
  const quoteSymbol = quote.symbol || "ETH";
  const quoteUsd = selectedQuoteMode() === "usdc" ? 1 : ethUsd;

  const creatorFraction = Math.min(Math.max(creatorPct / 100, 0), 0.9999);
  const poolFraction = Math.max(0.0001, 1 - creatorFraction);
  const poolTokens = totalSupply * poolFraction;
  const mcapMultiplier = poolTokens > 0 ? totalSupply / poolTokens : 0;

  const marketCapEth = liquidityEth > 0 ? liquidityEth * mcapMultiplier : 0;
  const marketCapUsd = marketCapEth * quoteUsd;
  const oneEthMcapUsd = mcapMultiplier * quoteUsd;
  const minLiquidityEth = requiredMinLiquidityEth(walletState().address);
  const minTargetMcapUsd = minLiquidityEth * mcapMultiplier * ethUsd;
  return {
    totalSupply,
    creatorPct,
    creatorBuyEth,
    poolFraction,
    poolTokens,
    mcapMultiplier,
    liquidityEth,
    marketCapEth,
    marketCapUsd,
    oneEthMcapUsd,
    quoteSymbol,
    minLiquidityEth,
    minTargetMcapUsd
  };
}

function updateLaunchMath({ source = "liquidity" } = {}) {
  if (!ui.launchMathCard) return;
  const economicsFromLiquidity = getLaunchEconomics(parseNumberInput(ui.devBuyEth?.value, 0));
  const targetMcapUsdInput = parseNumberInput(ui.launchMcapUsd?.value, 0);
  const robinhoodDirect = isRobinhoodDirectLiquidityMode();

  if (source === "target" && targetMcapUsdInput > 0 && economicsFromLiquidity.mcapMultiplier > 0) {
    const requiredLiquidityEthRaw = (targetMcapUsdInput / Math.max(state.ethUsd, 1)) / economicsFromLiquidity.mcapMultiplier;
    const requiredLiquidityEth = Math.max(requiredMinLiquidityEth(walletState().address), requiredLiquidityEthRaw);
    if (Number.isFinite(requiredLiquidityEth) && requiredLiquidityEth >= 0) {
      ui.devBuyEth.value = requiredLiquidityEth.toFixed(6);
    }
  }

  const economics = getLaunchEconomics(parseNumberInput(ui.devBuyEth?.value, 0));
  if (source === "liquidity" && ui.launchMcapUsd) {
    const nextTarget = economics.marketCapUsd > 0 ? economics.marketCapUsd : 0;
    ui.launchMcapUsd.value = nextTarget.toFixed(2);
  }

  const creatorWithinCap = economics.creatorPct <= 20;
  const meetsMin = economics.minLiquidityEth <= 0 || economics.marketCapUsd >= economics.minTargetMcapUsd;
  ui.launchMathCard.classList.toggle("invalid", !meetsMin || !creatorWithinCap);

  if (ui.launchMathPrimary) {
    ui.launchMathPrimary.textContent =
      economics.liquidityEth > 0
        ? robinhoodDirect
          ? `Direct Uniswap launch estimate: ${formatUsd(economics.marketCapUsd)} (~${economics.marketCapEth.toFixed(4)} ${economics.quoteSymbol} paired as starter liquidity)`
          : `Optional starter buy market cap: ${formatUsd(economics.marketCapUsd)} (~${economics.marketCapEth.toFixed(4)} ${economics.quoteSymbol})`
        : robinhoodDirect
        ? "0 ETH launches as a Pump-r bonding curve first."
        : "Bonding curve starts at the configured virtual reserve price.";
  }
  if (ui.launchMathSecondary) {
    ui.launchMathSecondary.textContent = robinhoodDirect
      ? "Enter ETH here to skip the bonding curve and launch directly on Robinhood Uniswap V2 with burned LP."
      : "Launches stay on the bonding curve until the graduation target is reached.";
  }
  if (ui.launchMathTertiary) {
    ui.launchMathTertiary.textContent =
      economics.liquidityEth > 0
        ? robinhoodDirect
          ? "Starter liquidity is added to Uniswap and LP tokens are burned automatically."
          : "Starter buy is sent as the first pool buy after launch."
        : robinhoodDirect
        ? "No direct Uniswap liquidity selected."
        : "No starter buy selected.";
  }
  if (ui.launchMathQuaternary) {
    ui.launchMathQuaternary.textContent = robinhoodDirect
      ? `At your settings, 1 ${economics.quoteSymbol} direct Uniswap liquidity estimates ${formatUsd(economics.oneEthMcapUsd)} market cap`
      : `At your settings, 1 ${economics.quoteSymbol} starter buy estimates ${formatUsd(economics.oneEthMcapUsd)} market cap`;
  }
  if (ui.creatorAllocationPreview) {
    const symbol = String(ui.symbol?.value || "TOKEN").trim().toUpperCase() || "TOKEN";
    const creatorTokens = economics.totalSupply * (economics.creatorPct / 100);
    ui.creatorAllocationPreview.textContent = `${economics.creatorPct.toFixed(2)}% of total supply`;
    if (ui.creatorAllocationTokens) {
      ui.creatorAllocationTokens.textContent = `${formatTokenAmount(creatorTokens)} ${symbol}`;
    }
    if (ui.creatorAllocationHint) {
      ui.creatorAllocationHint.textContent = creatorWithinCap
        ? "Creator allocation stays at or below 20%."
        : "Too high: keep creator allocation at or below 20%.";
    }
    ui.creatorAllocationPreviewWrap?.classList.toggle("invalid", !creatorWithinCap);
  }
}

function formatUsd(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  if (n >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(n);
}

function formatTokenAmount(value) {
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

function safeKolRows() {
  return Array.isArray(KOL_LEADERBOARD)
    ? KOL_LEADERBOARD.filter((row) => row?.name && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(row.wallet || "")))
    : [];
}

function selectedKol() {
  const rows = safeKolRows();
  const wallet = String(ui.kolSelect?.value || rows[0]?.wallet || "").trim();
  return rows.find((row) => row.wallet === wallet) || rows[0] || null;
}

function estimateKolBuy(solAmountInput = parseNumberInput(ui.kolBuySol?.value, 0)) {
  const solAmount = Math.max(0, Number(solAmountInput || 0));
  const totalSupply = Math.max(1, parseNumberInput(ui.supply?.value, DEFAULT_PUMPFUN_SUPPLY) || DEFAULT_PUMPFUN_SUPPLY);
  const tokens = solAmount > 0
    ? (solAmount / (PUMPFUN_ESTIMATE_VIRTUAL_SOL + solAmount)) * totalSupply
    : 0;
  const supplyPct = totalSupply > 0 ? (tokens / totalSupply) * 100 : 0;
  return { solAmount, totalSupply, tokens, supplyPct };
}

function updateKolEstimate() {
  const enabled = Boolean(ui.kolSendEnabled?.checked);
  const kol = selectedKol();
  const quote = estimateKolBuy();
  ui.kolApplicationCard?.classList.toggle("enabled", enabled);
  if (ui.kolToggleText) {
    ui.kolToggleText.textContent = enabled ? "On" : "Off";
  }
  if (ui.kolSelectedAvatar) {
    ui.kolSelectedAvatar.src = kol?.image || "/assets/pump-r-logo.png";
  }
  if (ui.kolSelectedName) {
    ui.kolSelectedName.textContent = kol?.name || "Select wallet";
  }
  if (ui.kolSelectedWallet) {
    ui.kolSelectedWallet.textContent = kol?.wallet ? shortAddress(kol.wallet) : "Wallet -";
    ui.kolSelectedWallet.title = kol?.wallet || "";
  }
  if (ui.kolTokenEstimate) {
    ui.kolTokenEstimate.textContent = `${formatTokenAmount(quote.tokens)} tokens`;
  }
  if (ui.kolSupplyEstimate) {
    ui.kolSupplyEstimate.textContent = `${quote.supplyPct.toFixed(4)}%`;
  }
  if (ui.kolRouteStatus) {
    ui.kolRouteStatus.textContent = enabled
      ? `Launch will buy ${quote.solAmount.toFixed(3)} SOL and send about ${formatTokenAmount(quote.tokens)} tokens to ${kol?.name || "the selected wallet"}.`
      : "Token send is off.";
  }
}

function setupKolApplicationControls() {
  if (!ui.kolSelect) return;
  const rows = safeKolRows();
  ui.kolSelect.innerHTML = rows
    .map((row, index) => `<option value="${escapeHtml(row.wallet)}">${index + 1}. ${escapeHtml(row.name)} - ${escapeHtml(shortAddress(row.wallet))}</option>`)
    .join("");
  ui.kolSendEnabled?.addEventListener("change", updateKolEstimate);
  ui.kolSelect.addEventListener("change", updateKolEstimate);
  ui.kolBuySol?.addEventListener("input", updateKolEstimate);
  ui.supply?.addEventListener("input", updateKolEstimate);
  updateKolEstimate();
}

function readKolApplication() {
  if (!ui.kolSendEnabled?.checked) return null;
  const kol = selectedKol();
  if (!kol?.wallet) return null;
  const quote = estimateKolBuy();
  return {
    enabled: true,
    name: kol.name,
    wallet: kol.wallet,
    image: kol.image || "",
    buySol: quote.solAmount,
    estimatedTokens: quote.tokens,
    estimatedSupplyPct: quote.supplyPct
  };
}

function formatEthAmount(valueWei) {
  const value = Number(ethers.formatEther(valueWei || 0n));
  if (!Number.isFinite(value) || value <= 0) return "0 ETH";
  if (value < 0.0001) return `${value.toFixed(6)} ETH`;
  if (value < 1) return `${value.toFixed(4)} ETH`;
  return `${value.toFixed(3)} ETH`;
}

async function assertLaunchBalance({ launchFeeWei, starterBuyEth }) {
  const ws = walletState();
  if (!ws.provider || !ws.address) return;
  const balance = await ws.provider.getBalance(ws.address);
  const required = launchFeeWei + starterBuyEth;
  if (balance < required) {
    const extraLabel = isRobinhoodDirectLiquidityMode() ? " and direct Uniswap liquidity" : " and starter buy";
    throw new Error(
      `Not enough ${state.config?.chainName || "network"} ETH. Need about ${formatEthAmount(required)} for launch fee${starterBuyEth > 0n ? extraLabel : ""}; wallet has ${formatEthAmount(balance)}.`
    );
  }
}

function updatePreview() {
  const name = ui.name.value.trim() || "Your Coin";
  const symbol = ui.symbol.value.trim().toUpperCase() || "TICKER";
  const description = ui.description.value.trim() || "Your coin description appears here.";

  ui.previewName.textContent = name;
  ui.previewSymbol.textContent = `$${symbol}`;
  ui.previewDescription.textContent = description;

  const explicitImage = ui.image.value.trim();
  const src = explicitImage || makeFallbackImage(name, symbol);
  showImagePreview(src);
  showUploadBoxPreview(explicitImage);
}

function composeDescription() {
  const base = ui.description.value.trim();
  const socials = [];
  const website = ui.website.value.trim();
  const twitter = ui.twitter.value.trim();
  const telegram = ui.telegram.value.trim();

  if (website) socials.push(`Website: ${website}`);
  if (twitter) socials.push(`Twitter: ${twitter}`);
  if (telegram) socials.push(`Telegram: ${telegram}`);

  return [base, socials.join(" | ")].filter(Boolean).join("\n");
}

async function uploadSelectedFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) throw new Error("Pick a valid image file");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image too large. Keep it under 900 KB.");

  const dataUrl = await readFileAsDataUrl(file);
  setAlert(ui.alert, "Uploading image...");
  const uploaded = await api.uploadImage(dataUrl);
  ui.image.value = uploaded.url;
  updatePreview();
  setAlert(ui.alert, "Image uploaded");
}

function setupFormEnhancements() {
  const onInput = () => {
    updatePreview();
  };

  ui.name.addEventListener("input", onInput);
  ui.symbol.addEventListener("input", onInput);
  ui.symbol.addEventListener("input", () => updateLaunchMath({ source: "liquidity" }));
  ui.description.addEventListener("input", onInput);
  ui.image.addEventListener("input", onInput);
  ui.supply?.addEventListener("input", () => updateLaunchMath({ source: "liquidity" }));
  ui.creatorBuyEth?.addEventListener("input", () => updateLaunchMath({ source: "liquidity" }));
  ui.devBuyEth?.addEventListener("input", () => updateLaunchMath({ source: "liquidity" }));
  ui.tradeTaxPct?.addEventListener("input", () => updateLaunchMath({ source: "liquidity" }));
  ui.launchMcapUsd?.addEventListener("input", () => updateLaunchMath({ source: "target" }));
  ui.pickFileBtn?.addEventListener("click", () => {
    ui.imageFile?.click();
  });

  const activateDrop = (active) => {
    ui.uploadDropzone?.classList.toggle("drag-active", active);
  };
  const prevent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ui.uploadDropzone?.addEventListener("dragenter", (event) => {
    prevent(event);
    activateDrop(true);
  });
  ui.uploadDropzone?.addEventListener("dragover", (event) => {
    prevent(event);
    activateDrop(true);
  });
  ui.uploadDropzone?.addEventListener("dragleave", (event) => {
    prevent(event);
    activateDrop(false);
  });
  ui.uploadDropzone?.addEventListener("drop", async (event) => {
    try {
      prevent(event);
      activateDrop(false);
      const file = event.dataTransfer?.files?.[0];
      await uploadSelectedFile(file);
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    }
  });

  ui.imageFile.addEventListener("change", async (event) => {
    try {
      const file = event.target.files?.[0];
      await uploadSelectedFile(file);
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    }
  });
}

function extractLaunchCreated(receipt) {
  const iface = new ethers.Interface(FACTORY_ABI);
  for (const log of receipt.logs || []) {
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function chainLabel(chainId) {
  const n = Number(chainId || 0);
  return chainNameForId(n);
}

function setSubmitting(active, label = "") {
  if (!ui.launchSubmitBtn) return;
  ui.launchSubmitBtn.disabled = Boolean(active);
  ui.launchSubmitBtn.textContent = active ? label || "Launching..." : "Launch coin";
}

function renderLaunchResults(results = []) {
  if (!ui.launchResultList) return;
  const rows = results.filter(Boolean);
  if (!rows.length) {
    ui.launchResultList.innerHTML = "";
    return;
  }
  ui.launchResultList.innerHTML = rows
    .map((row) => {
      const ok = Boolean(row.ok && row.token);
      const isPumpFun = String(row.chainId || "") === "pumpfun";
      const label = isPumpFun ? "Pump.fun" : chainLabel(row.chainId);
      const href = ok
        ? isPumpFun
          ? row.pumpfunUrl || `https://pump.fun/coin/${encodeURIComponent(row.token)}`
          : `/token?token=${encodeURIComponent(row.token)}&chainId=${encodeURIComponent(String(row.chainId))}`
        : "#";
      const body = ok
        ? `<a href="${href}">Open ${escapeHtml(label)} token ${escapeHtml(shortAddress(row.token))}</a>`
        : `<span>${escapeHtml(row.error || "Launch failed")}</span><button class="btn-ghost small" type="button" data-retry-chain="${escapeHtml(row.chainId)}">Retry</button>`;
      return `
        <div class="create-result-row ${ok ? "success" : "error"}">
          <strong>${escapeHtml(label)}</strong>
          ${body}
        </div>
      `;
    })
    .join("");
}

function confirmRobinhoodLiquidityChoice(details = {}) {
  if (!isRobinhoodChainSelected() || BigInt(details.starterBuyEth || 0n) > 0n) return true;
  const launchAsIs = window.confirm(
    "Robinhood Chain launch has 0 direct Uniswap liquidity selected.\n\nChoose OK to launch as a bonding curve first.\nChoose Cancel to add ETH for direct Uniswap liquidity with burned LP."
  );
  if (launchAsIs) return true;
  if (ui.advancedDetails) {
    ui.advancedDetails.hidden = false;
    ui.advancedDetails.open = true;
  }
  ui.devBuyEth?.focus?.();
  setAlert(ui.alert, "Add direct Uniswap liquidity, then launch again. Leave it at 0 only if you want Robinhood Chain to start as a bonding curve.");
  return false;
}

function hideCreatedModal() {
  if (!ui.createdModal) return;
  ui.createdModal.classList.remove("open");
  ui.createdModal.setAttribute("aria-hidden", "true");
}

function showCreatedModal({ name, symbol, token, chainId = state.selectedChainId, quoteMode = selectedQuoteMode() }) {
  if (!ui.createdModal || !token) return;
  ui.createdTokenName.textContent = `${name} ($${symbol})`;
  ui.createdTokenAddress.textContent = token;
  ui.openTokenBtn.href = `/token?token=${token}&chainId=${chainId}${quoteMode === "usdc" ? "&quote=usdc" : ""}`;
  ui.createdModal.classList.add("open");
  ui.createdModal.setAttribute("aria-hidden", "false");
}

function setupCreatedModal() {
  ui.closeCreatedModal?.addEventListener("click", hideCreatedModal);
  ui.createdModal?.addEventListener("click", (event) => {
    if (event.target === ui.createdModal) {
      hideCreatedModal();
    }
  });
  ui.copyTokenBtn?.addEventListener("click", async () => {
    try {
      const value = ui.createdTokenAddress?.textContent || "";
      if (!value || value === "-") return;
      await navigator.clipboard.writeText(value);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(ui.alert, "Could not copy address", true);
    }
  });
}

async function prepareLaunchDetails() {
  const name = ui.name.value.trim();
  const symbol = ui.symbol.value.trim().toUpperCase();
  const totalSupplyInput = ui.supply.value.trim();
  const creatorAllocationPct = parseNumberInput(ui.creatorBuyEth?.value, 0);
  let imageUri = ui.image.value.trim();
  const description = composeDescription();
  const initialLiquidityEthInput = ui.devBuyEth.value.trim();
  const tokenTradeTaxPct = parseNumberInput(ui.tradeTaxPct?.value, DEFAULT_TOKEN_TRADE_TAX_PCT);
  const pumpfunDevBuySol = parseNumberInput(ui.pumpfunDevBuySol?.value, 0);
  const kolApplication = isPumpFunMode() ? readKolApplication() : null;

  if (!name || !symbol) throw new Error("Coin name and ticker are required");
  if (isPumpFunMode()) {
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
      throw new Error("Pump.fun tickers must be 2-10 letters/numbers.");
    }
    if (!ui.image.value.trim()) {
      throw new Error("Pump.fun launches require an uploaded image before launch.");
    }
    if (!Number.isFinite(pumpfunDevBuySol) || pumpfunDevBuySol < 0) {
      throw new Error("Pump.fun dev wallet buy must be 0 SOL or higher.");
    }
    if (ui.kolSendEnabled?.checked) {
      if (!kolApplication?.wallet) {
        throw new Error("Select a valid Solana wallet before enabling token send.");
      }
      if (!Number.isFinite(Number(kolApplication.buySol)) || Number(kolApplication.buySol) <= 0) {
        throw new Error("Token send needs a SOL buy amount above 0.");
      }
    }
  }
  if (!Number.isFinite(creatorAllocationPct) || creatorAllocationPct < 0) {
    throw new Error("Creator allocation must be 0 or higher");
  }
  if (creatorAllocationPct > 20) {
    throw new Error("Creator allocation must be 20% or lower.");
  }
  if (!Number.isFinite(tokenTradeTaxPct) || tokenTradeTaxPct < 0 || tokenTradeTaxPct > MAX_TOKEN_TRADE_TAX_PCT) {
    throw new Error(`Token trade tax must be between 0% and ${MAX_TOKEN_TRADE_TAX_PCT}%.`);
  }

  if (!imageUri) {
    imageUri = makeFallbackImage(name, symbol);
  }

  if (imageUri.startsWith("data:image/")) {
    const uploaded = await api.uploadImage(imageUri, { requireHosted: isPumpFunMode() });
    imageUri = uploaded.url;
    ui.image.value = imageUri;
  }

  if (imageUri.startsWith("data:image/")) {
    if (isPumpFunMode()) {
      throw new Error("Pump.fun needs a hosted image URL. Upload failed, so retry the image upload before launching.");
    }
    imageUri = `${window.location.origin}/assets/pump-r-logo.png`;
    ui.image.value = imageUri;
    setAlert(
      ui.alert,
      "Image upload returned inline data. Using hosted fallback image to avoid gas-estimation failure."
    );
  }

  return {
    name,
    symbol,
    imageUri,
    description,
    totalSupply: ethers.parseUnits(totalSupplyInput, 18),
    creatorBps: BigInt(Math.round(creatorAllocationPct * 100)),
    tokenTradeFeeBps: BigInt(Math.round(tokenTradeTaxPct * 100)),
    starterBuyEth: ethers.parseUnits(initialLiquidityEthInput || "0", selectedQuoteAsset().decimals || 18),
    pumpfunDevBuySol,
    pumpfunDevBuyLamports: ethers.parseUnits(String(pumpfunDevBuySol || 0), 9),
    pumpfunCreatorWallet: ui.pumpfunCreatorWallet?.value?.trim?.() || "",
    kolApplication
  };
}

async function ensureLaunchIdentityAvailable(details = {}) {
  const result = await api.launchAvailability({
    name: details.name,
    symbol: details.symbol
  });
  if (result?.available !== false && !result?.duplicate) return result;
  const existing = result?.existing || {};
  const field = result?.field === "name" ? "name" : "ticker";
  const taken = existing.symbol ? `$${existing.symbol}` : existing.name || "an existing token";
  throw new Error(`A token with this ${field} already exists (${taken}). Pick a different token name and ticker.`);
}

async function launchOnChain(chainId, details, { showModal = true, quoteMode = selectedQuoteMode() } = {}) {
  const target = Number(chainId || 0);
  await loadChainConfig(target, quoteMode);
  state.selectedChainId = Number(state.config?.chainId || target);
  await ensureWalletChain(state.selectedChainId);
  await walletHub?.refresh();
  await ensurePumpRHolderAccess({
    address: walletState().address,
    action: "launch tokens through Pump-r",
    launchMode: "evm",
    targetChainId: state.selectedChainId
  });

  const factory = makeFactoryContract(state.config.factoryAddress);
  const launchFeeWei = BigInt(state.config?.deployment?.launchFeeWei || "0");
  const dexRouter = String(state.config?.deployment?.dexRouter || ethers.ZeroAddress);
  const hasDexRouter = dexRouter && dexRouter.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
  const useTaxLaunch = Number(state.selectedChainId || 0) === 4663 && selectedQuoteMode() === "native";
  if (useTaxLaunch && details.starterBuyEth > 0n && !hasDexRouter) {
    throw new Error("Robinhood direct Uniswap liquidity needs a DEX router configured first. Set liquidity to 0 to launch as a bonding curve.");
  }
  const useInstantLiquidity = useTaxLaunch && hasDexRouter && details.starterBuyEth > 0n;
  const totalValue = launchFeeWei + (useInstantLiquidity ? details.starterBuyEth : 0n);
  const launchMethodName = useTaxLaunch
    ? useInstantLiquidity
      ? "createLaunchInstantWithTax"
      : "createLaunchWithTax"
    : "createLaunch";
  const launchMethod = factory[launchMethodName];
  const launchArgs = useTaxLaunch
    ? [
        details.name,
        details.symbol,
        details.imageUri,
        details.description,
        details.totalSupply,
        details.creatorBps,
        details.tokenTradeFeeBps
      ]
    : [
        details.name,
        details.symbol,
        details.imageUri,
        details.description,
        details.totalSupply,
        details.creatorBps
      ];
  await assertLaunchBalance({ launchFeeWei, starterBuyEth: selectedQuoteMode() === "usdc" ? 0n : details.starterBuyEth });

  const simulated = await launchMethod.staticCall(...launchArgs, { value: totalValue });

  const chainName = selectedQuoteMode() === "usdc" ? "Ethereum + USDC" : state.config.chainName || chainLabel(state.selectedChainId);
  if (launchFeeWei > 0n) {
    const launchFeeEth = Number(ethers.formatEther(launchFeeWei)).toFixed(6);
    setAlert(
      ui.alert,
      useInstantLiquidity
        ? `Creating ${chainName} launch with burned starter LP (launch fee ${launchFeeEth} ETH)...`
        : `Creating bonding-curve launch on ${chainName} (launch fee ${launchFeeEth} ETH)...`
    );
  } else {
    setAlert(ui.alert, useInstantLiquidity ? `Creating ${chainName} launch with burned starter LP...` : `Creating bonding-curve launch on ${chainName}...`);
  }

  const tx = await sendTxWithFallback({
    label: useInstantLiquidity ? `Create ${chainName} Burned LP Launch` : `Create ${chainName} Bonding Launch`,
    populatedTx: launchMethod.populateTransaction(...launchArgs, { value: totalValue }),
    walletNativeSend: () => launchMethod(...launchArgs, { value: totalValue })
  });

  const receipt = await tx.wait();
  const launchInfo = extractLaunchCreated(receipt) || {
    launchId: simulated?.[0],
    token: simulated?.[1],
    pool: simulated?.[2]
  };

  if (!useInstantLiquidity && details.starterBuyEth > 0n && launchInfo?.pool) {
    setAlert(ui.alert, `${chainName} launch created. Sending starter buy on bonding curve...`);
    const pool = makePoolContract(launchInfo.pool);
    const quoted = await pool.quoteBuy(details.starterBuyEth);
    const quotedTokens = BigInt(quoted?.[0] || 0n);
    const minTokensOut = quotedTokens > 0n ? (quotedTokens * 97n) / 100n : 0n;
    let buyTx;
    if (selectedQuoteMode() === "usdc") {
      const ws = walletState();
      const quote = selectedQuoteAsset();
      const usdc = new ethers.Contract(quote.address, TOKEN_ABI, ws.signer);
      const allowance = await usdc.allowance(ws.address, launchInfo.pool);
      if (allowance < details.starterBuyEth) {
        setAlert(ui.alert, "Approving USDC starter buy...");
        const approveTx = await sendTxWithFallback({
          label: "Approve USDC Starter Buy",
          populatedTx: usdc.approve.populateTransaction(launchInfo.pool, ethers.MaxUint256),
          walletNativeSend: () => usdc.approve(launchInfo.pool, ethers.MaxUint256)
        });
        await approveTx.wait();
      }
      buyTx = await sendTxWithFallback({
        label: `${chainName} Starter USDC Buy`,
        populatedTx: pool.buyWithQuote.populateTransaction(details.starterBuyEth, minTokensOut),
        walletNativeSend: () => pool.buyWithQuote(details.starterBuyEth, minTokensOut)
      });
    } else {
      buyTx = await sendTxWithFallback({
        label: `${chainName} Starter Bonding Buy`,
        populatedTx: pool.buy.populateTransaction(minTokensOut, { value: details.starterBuyEth }),
        walletNativeSend: () => pool.buy(minTokensOut, { value: details.starterBuyEth })
      });
    }
    await buyTx.wait();
  }

  if (launchInfo?.token) {
    const quoteQuery = selectedQuoteMode() === "usdc" ? "&quote=usdc" : "";
    ui.resultLink.href = `/token?token=${launchInfo.token}&chainId=${state.selectedChainId}${quoteQuery}`;
    ui.resultLink.textContent = `Open ${chainName} ${shortAddress(launchInfo.token)} token page`;
    ui.resultLink.style.display = "inline-block";
    if (showModal) {
      showCreatedModal({ name: details.name, symbol: details.symbol, token: launchInfo.token, chainId: state.selectedChainId, quoteMode: selectedQuoteMode() });
    }
  }

  return {
    ok: true,
    chainId: state.selectedChainId,
    quoteMode: selectedQuoteMode(),
    token: launchInfo?.token || "",
    pool: launchInfo?.pool || "",
    launchId: launchInfo?.launchId
  };
}

async function loadSolanaWeb3() {
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

async function connectSolanaWallet(options = {}) {
  const existing = solanaWalletState();
  const forceSignIn = Boolean(options?.requirePrompt || options?.requireSignature);
  const wallet = existing?.provider && existing?.address && !forceSignIn
    ? existing
    : await connectSharedSolanaWallet({
      requirePrompt: true,
      requireSignature: Boolean(options?.requireSignature)
    });
  const text = wallet?.address || wallet?.publicKey || "";
  if (!wallet?.provider || !text) throw new Error("Solana wallet did not return a public key");
  state.solanaWallet = { provider: wallet.provider, publicKey: text };
  updateProfileIdentity();
  await walletControls?.refresh?.();
  return { provider: wallet.provider, publicKey: text };
}

function base64ToBytes(value = "") {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function normalizePumpFunHomeLaunch(row = {}) {
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
    kolApplication: row.kolApplication && typeof row.kolApplication === "object" ? row.kolApplication : null,
    kolBuySignature: String(row.kolBuySignature || "").trim(),
    kolTransferSignature: String(row.kolTransferSignature || "").trim(),
    pumpfunUrl: String(row.pumpfunUrl || row.url || `https://pump.fun/coin/${encodeURIComponent(mint)}`).trim(),
    signature: String(row.signature || "").trim(),
    metadataUri: String(row.metadataUri || "").trim(),
    createdAt: Number(row.createdAt || Math.floor(Date.now() / 1000))
  };
}

function cachePumpFunLaunchForHome(row = {}) {
  const normalized = normalizePumpFunHomeLaunch(row);
  if (!normalized) return;
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_LAUNCH_CACHE_KEY) || "{}");
    const existing = Array.isArray(parsed?.launches) ? parsed.launches : [];
    const mintKey = normalized.mint.toLowerCase();
    const launches = [
      normalized,
      ...existing.filter((item) => String(item?.mint || item?.token || "").toLowerCase() !== mintKey)
    ]
      .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
      .slice(0, HOME_LAUNCH_CACHE_MAX_ITEMS);
    localStorage.setItem(
      HOME_LAUNCH_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        launches
      })
    );
  } catch {
    // Home will still pick the launch up from the server feed when persistence syncs.
  }
}

async function launchPumpFun(details) {
  const { provider, publicKey } = await connectSolanaWallet();
  await ensurePumpRHolderAccess({
    solanaAddress: publicKey,
    action: "launch tokens through Pump-r",
    launchMode: "pumpfun",
    targetChainId: 101
  });
  const solanaWeb3 = await loadSolanaWeb3();
  setAlert(
    ui.alert,
    details.kolApplication?.enabled
      ? `Preparing Pump.fun launch with token send for ${details.kolApplication.name}.`
      : "Preparing official Pump.fun SDK transaction..."
  );
  const payload = await api.pumpfunLaunch({
    name: details.name,
    symbol: details.symbol,
    description: details.description,
    imageUri: details.imageUri,
    totalSupply: details.totalSupply?.toString?.() || String(details.totalSupply || ""),
    creatorBps: details.creatorBps?.toString?.() || String(details.creatorBps || "0"),
    starterBuy: details.pumpfunDevBuyLamports?.toString?.() || "0",
    starterBuySol: String(details.pumpfunDevBuySol || 0),
    creatorWallet: details.pumpfunCreatorWallet || publicKey,
    userPublicKey: publicKey,
    source: "Pump-r",
    kolApplication: details.kolApplication || null
  });
  const mint = String(payload?.mint || payload?.tokenAddress || payload?.token || "");
  const pumpfunUrl = String(payload?.pumpfunUrl || payload?.url || (mint ? `https://pump.fun/coin/${mint}` : ""));
  const transactionBase64 = String(payload?.transactionBase64 || "");
  const signingToken = String(payload?.signingToken || "");
  if (!mint || !pumpfunUrl || !transactionBase64 || !signingToken) throw new Error("Pump.fun SDK did not return a complete transaction.");

  setAlert(ui.alert, "Open Phantom to sign first. Pump-r will add the mint signature after your approval, simulate the transaction, then broadcast through the configured Solana RPC.");
  const transaction = solanaWeb3.Transaction.from(base64ToBytes(transactionBase64));
  let signature = "";
  let kolBuySignature = "";
  let kolTransferSignature = "";
  let kolApplication = details.kolApplication || null;
  let finalizedLaunch = null;
  if (typeof provider.signTransaction === "function") {
    const signed = await provider.signTransaction(transaction);
    setAlert(ui.alert, "Finalizing Pump.fun launch with the mint signature...");
    const finalized = await api.pumpfunFinalize({
      signingToken,
      signedTransactionBase64: bytesToBase64(signed.serialize({ requireAllSignatures: false, verifySignatures: false }))
    });
    signature = String(finalized?.signature || "");
    finalizedLaunch = finalized?.launch || null;
    if (details.kolApplication?.enabled && Number(details.kolApplication.buySol || 0) > 0) {
      setAlert(ui.alert, `Open Phantom again to buy ${details.kolApplication.buySol} SOL for the token send. Pump-r will transfer those tokens to ${details.kolApplication.name} next.`);
      const kolPayload = await api.pumpfunKolBuy({
        mint,
        creatorWallet: details.pumpfunCreatorWallet || publicKey,
        userPublicKey: publicKey,
        kolApplication: details.kolApplication
      });
      const kolTransactionBase64 = String(kolPayload?.transactionBase64 || "");
      if (!kolTransactionBase64) throw new Error("Token send buy transaction was not returned.");
      const kolTransaction = solanaWeb3.Transaction.from(base64ToBytes(kolTransactionBase64));
      const signedKol = await provider.signTransaction(kolTransaction);
      setAlert(ui.alert, "Broadcasting token buy before the KOL transfer...");
      const kolSent = await api.solanaSendTransaction({
        signedTransactionBase64: bytesToBase64(signedKol.serialize({ requireAllSignatures: false, verifySignatures: false })),
        rpcUrl: kolPayload.rpcUrl,
        blockhash: kolPayload.blockhash,
        lastValidBlockHeight: kolPayload.lastValidBlockHeight
      });
      kolBuySignature = String(kolSent?.signature || "");
      kolApplication = kolPayload.kolApplication || details.kolApplication;
      if (String(kolApplication?.kolBuy?.recipientMode || "") === "kol_wallet_direct") {
        setAlert(ui.alert, `Token send completed directly to ${details.kolApplication.name}.`);
      } else {
        setAlert(ui.alert, `Open Phantom once more to transfer the token allocation to ${details.kolApplication.name}.`);
        const transferPayload = await api.pumpfunKolTransfer({
          mint,
          userPublicKey: publicKey,
          tokenAmount: kolApplication?.kolBuy?.tokenAmount || "",
          kolApplication
        });
        const transferTransactionBase64 = String(transferPayload?.transactionBase64 || "");
        if (!transferTransactionBase64) throw new Error("Token transfer transaction was not returned.");
        const transferTransaction = solanaWeb3.Transaction.from(base64ToBytes(transferTransactionBase64));
        const signedTransfer = await provider.signTransaction(transferTransaction);
        setAlert(ui.alert, "Broadcasting token transfer...");
        const transferSent = await api.solanaSendTransaction({
          signedTransactionBase64: bytesToBase64(signedTransfer.serialize({ requireAllSignatures: false, verifySignatures: false })),
          rpcUrl: transferPayload.rpcUrl,
          blockhash: transferPayload.blockhash,
          lastValidBlockHeight: transferPayload.lastValidBlockHeight
        });
        kolTransferSignature = String(transferSent?.signature || "");
        kolApplication = transferPayload.kolApplication || kolApplication;
      }
    }
    cachePumpFunLaunchForHome({
      ...(finalizedLaunch || {}),
      mint,
      name: details.name,
      symbol: details.symbol,
      description: details.description,
      imageUri: details.imageUri,
      creator: publicKey,
      kolApplication,
      kolBuySignature,
      kolTransferSignature,
      pumpfunUrl,
      signature,
      metadataUri: payload?.metadataUri,
      createdAt: Math.floor(Date.now() / 1000)
    });
  } else {
    throw new Error("Your Solana wallet does not support transaction signing in this browser.");
  }

  renderLaunchResults([
    {
      ok: true,
      chainId: "pumpfun",
      token: mint || pumpfunUrl,
      pumpfunUrl
    }
  ]);
  ui.resultLink.href = pumpfunUrl || `https://pump.fun/coin/${encodeURIComponent(mint)}`;
  ui.resultLink.textContent = "Open Pump.fun token page";
  ui.resultLink.style.display = "inline-block";
  setAlert(ui.alert, `Pump.fun transaction sent${signature ? ` (${shortAddress(signature)})` : ""}${kolBuySignature ? `; token buy completed (${shortAddress(kolBuySignature)})` : ""}${kolTransferSignature ? `; token transfer sent (${shortAddress(kolTransferSignature)})` : ""}. Redirecting...`);
  window.setTimeout(() => {
    window.location.href = ui.resultLink.href;
  }, 900);
  return { ...payload, signature, kolBuySignature, kolTransferSignature };
}

async function launchPumpVerse(details) {
  const targets = normalizePumpVerseChains(state.selectedPumpVerseChains);
  if (targets.length < 2) {
    throw new Error("Select at least two configured chains for PumpVerse.");
  }
  const results = [];
  state.lastPumpVerseDetails = details;
  state.lastPumpVerseResults = results;
  renderLaunchResults(results);

  for (const chainId of targets) {
    try {
      setSubmitting(true, `Launching ${chainLabel(chainId)}...`);
      setAlert(ui.alert, `PumpVerse: launching on ${chainLabel(chainId)}...`);
      const result = await launchOnChain(chainId, details, { showModal: false, quoteMode: "native" });
      results.push(result);
      state.lastPumpVerseResults = [...results];
      renderLaunchResults(results);
    } catch (error) {
      results.push({ ok: false, chainId, error: parseUiError(error) });
      state.lastPumpVerseResults = [...results];
      renderLaunchResults(results);
    }
  }

  const successes = results.filter((row) => row.ok);
  const failures = results.filter((row) => !row.ok);
  if (successes.length) {
    ui.resultLink.href = `/token?token=${successes[0].token}&chainId=${successes[0].chainId}`;
    ui.resultLink.textContent = `Open ${chainLabel(successes[0].chainId)} ${shortAddress(successes[0].token)} token page`;
    ui.resultLink.style.display = "inline-block";
  }
  if (failures.length) {
    setAlert(
      ui.alert,
      `PumpVerse partially completed: ${successes.length}/${targets.length} launched. ${chainLabel(failures[0].chainId)} failed: ${failures[0].error}`,
      true
    );
    return results;
  }
  setAlert(ui.alert, `PumpVerse launch complete on ${pumpVerseLabel(targets)}.`);
  return results;
}

async function retryPumpVerseChain(chainId) {
  const details = state.lastPumpVerseDetails;
  const target = Number(chainId || 0);
  if (!details || !target) {
    setAlert(ui.alert, "No PumpVerse launch details available to retry.", true);
    return;
  }
  try {
    setSubmitting(true, `Retrying ${chainLabel(target)}...`);
    setAlert(ui.alert, `Retrying PumpVerse launch on ${chainLabel(target)}...`);
    const result = await launchOnChain(target, details, { showModal: false, quoteMode: "native" });
    const existing = Array.isArray(state.lastPumpVerseResults) ? state.lastPumpVerseResults : [];
    const next = existing.filter((row) => Number(row.chainId) !== target).concat(result).sort((a, b) => Number(a.chainId) - Number(b.chainId));
    state.lastPumpVerseResults = next;
    renderLaunchResults(next);
    setAlert(ui.alert, `${chainLabel(target)} retry succeeded.`);
  } catch (error) {
    const existing = Array.isArray(state.lastPumpVerseResults) ? state.lastPumpVerseResults : [];
    const failed = { ok: false, chainId: target, error: parseUiError(error) };
    const next = existing.filter((row) => Number(row.chainId) !== target).concat(failed).sort((a, b) => Number(a.chainId) - Number(b.chainId));
    state.lastPumpVerseResults = next;
    renderLaunchResults(next);
    setAlert(ui.alert, `${chainLabel(target)} retry failed: ${failed.error}`, true);
  } finally {
    setSubmitting(false);
  }
}

async function onCreate(event) {
  event.preventDefault();

  try {
    setSubmitting(true, isPumpFunMode() ? "Launching on Pump.fun..." : isPumpVerseMode() ? "Launching PumpVerse..." : "Launching...");
    renderLaunchResults([]);
    if (ui.resultLink) {
      ui.resultLink.style.display = "none";
      ui.resultLink.removeAttribute("href");
      ui.resultLink.textContent = "";
    }

    const details = await prepareLaunchDetails();
    setSubmitting(true, "Checking token name and ticker...");
    await ensureLaunchIdentityAvailable(details);
    if (!isPumpFunMode() && !isPumpVerseMode() && !confirmRobinhoodLiquidityChoice(details)) {
      return;
    }
    if (isPumpFunMode()) {
      await launchPumpFun(details);
    } else if (isPumpVerseMode()) {
      const ws = walletState();
      if (!ws.signer) throw new Error("Connect wallet first");
      const results = await launchPumpVerse(details);
      if (results.some((row) => !row.ok)) {
        return;
      }
    } else {
      const ws = walletState();
      if (!ws.signer) throw new Error("Connect wallet first");
      await loadChainConfig(state.selectedChainId);
      state.selectedLaunchMode = String(state.selectedChainId);
      const result = await launchOnChain(state.selectedChainId, details, { showModal: true });
      renderLaunchResults([result]);
      const isRobinhood = Number(state.selectedChainId || 0) === 4663 && selectedQuoteMode() === "native";
      setAlert(
        ui.alert,
        isRobinhood && details.starterBuyEth > 0n
          ? "Robinhood Uniswap launch created with burned LP"
          : details.starterBuyEth > 0n
          ? "Bonding-curve launch created with starter buy"
          : "Bonding-curve launch created"
      );
    }

    if (!isPumpFunMode()) {
      ui.createForm.reset();
      updatePreview();
      updateLaunchMath({ source: "liquidity" });
    }
  } catch (err) {
    setAlert(ui.alert, parseUiError(err), true);
  } finally {
    setSubmitting(false);
  }
}

async function init() {
  try {
    state.ethUsd = await fetchEthUsdPrice();
  } catch {
    state.ethUsd = 3000;
  }

  await loadChainConfig(getPreferredChainId() || state.selectedChainId);

  const syncWalletUi = async () => {
    const sharedSolana = solanaWalletState();
    state.solanaWallet = sharedSolana.provider && sharedSolana.address
      ? { provider: sharedSolana.provider, publicKey: sharedSolana.address }
      : null;
    const ws = walletState();
    if (ws.signer && !isPumpFunMode()) {
      await ensureWalletChain(state.selectedChainId).catch((err) => setAlert(ui.alert, parseUiError(err), true));
    }
    updateProfileIdentity();
    setProfileMenuOpen(false);
    syncLiquidityInputMin();
    updateLaunchMath({ source: "liquidity" });
    await walletHub?.refresh();
  };

  walletControls = initTopbarWalletProfile({
    signInBtn: ui.signInBtn,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    walletSelect: ui.walletSelect,
    walletLabel: ui.walletLabel,
    alertEl: ui.alert,
    onChange: syncWalletUi
  });
  walletHub = walletControls?.walletHub || null;

  ui.launchChainOptions?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-launch-mode], [data-chain-id]");
    if (!button) return;
    if (String(button.dataset.launchMode || "") === "pumpverse") {
      selectPumpVerseMode("pumpverse");
      return;
    }
    if (String(button.dataset.launchMode || "").startsWith("pumpverse:")) {
      selectPumpVerseMode(button.dataset.launchMode);
      return;
    }
    if (String(button.dataset.launchMode || "") === "usdc:1") {
      selectUsdcLaunchMode();
      return;
    }
    if (String(button.dataset.launchMode || "") === "pumpfun") {
      selectPumpFunLaunchMode();
      return;
    }
    selectLaunchChain(button.dataset.chainId);
  });

  ui.launchPumpVerseOptions?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-launch-mode]");
    if (!button) return;
    if (String(button.dataset.launchMode || "").startsWith("pumpverse:")) {
      selectPumpVerseMode(button.dataset.launchMode);
      return;
    }
  });

  ui.launchResultList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-retry-chain]");
    if (!button) return;
    retryPumpVerseChain(button.dataset.retryChain);
  });

  const handleChainChanged = (event) => {
    const nextChainId = Number(event?.detail?.chainId || 0);
    if (!Number.isFinite(nextChainId) || nextChainId <= 0) return;
    const supported = state.supportedChains.some((row) => Number(row.chainId) === nextChainId);
    if (supported) {
      loadChainConfig(nextChainId).catch((err) => setAlert(ui.alert, parseUiError(err), true));
    }
  };
  window.addEventListener("etherpump:chainChanged", handleChainChanged);
  window.addEventListener("Pump-r:chainChanged", handleChainChanged);

  setupProfileMenu();
  setupEditProfileModal();
  initSupportWidget({ alertEl: ui.alert });
  setupFormEnhancements();
  setupCreatedModal();
  initCoinSearchOverlay({ triggerInputs: [ui.tokenSearchInput] });
  updatePreview();
  syncLiquidityInputMin();
  updateLaunchMath({ source: "liquidity" });
  updateProfileIdentity();
  ui.createForm.addEventListener("submit", onCreate);
}

init().catch((err) => {
  setAlert(ui.alert, parseUiError(err), true);
});
