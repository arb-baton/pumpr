import { api } from "./api.js?v=20260709evmsolrail1";
import {
  FACTORY_ABI,
  POOL_ABI,
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
} from "./core.js?v=20260709previewtheme";
import { initTopbarWalletProfile, setAlert, showCopyToast } from "./ui.js?v=20260706mobileauth";
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
const RH_WALLET_STORE_KEY = "pumpr.robinhood.wallets.v1";
const SOL_FUNDED_EVM_LAUNCH_CHAIN_IDS = new Set([1, 8453, 143, 4663]);

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
  launchStyleCard: document.getElementById("launchStyleCard"),
  launchStyleBondingBtn: document.getElementById("launchStyleBondingBtn"),
  launchStyleDirectBtn: document.getElementById("launchStyleDirectBtn"),
  launchStyleHint: document.getElementById("launchStyleHint"),
  advancedDetails: document.querySelector(".create-advanced"),
  pumpfunOptions: null,
  rhSolBridgeCard: null,
  rhBridgeAmount: null,
  rhBridgeRecipient: null,
  rhBridgeQuoteBtn: null,
  rhBridgeSubmitBtn: null,
  rhBridgeStatus: null,
  rhBridgePreview: null,
  rhBridgeProgress: null,
  rhBridgeTxLink: null,
  rhBridgeEyebrow: null,
  rhBridgeTitle: null,
  rhBridgeBody: null,
  rhBridgeAmountLabel: null,
  rhBridgeRecipientLabel: null,
  rhAttachedHeading: null,
  rhAttachedAutoLabel: null,
  rhAttachedWallet: null,
  rhAttachedWalletMeta: null,
  rhAttachedGenerateBtn: null,
  rhAttachedExportBtn: null,
  rhAttachedAutoLaunch: null,
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
  solanaWallet: null,
  launchStyleByChain: {
    1: "bonding",
    8453: "bonding",
    143: "bonding",
    4663: "bonding"
  },
  rhBridge: {
    quote: null,
    signature: "",
    statusTimer: null
  }
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

function ensureRhSolBridgeOptions() {
  if (ui.rhSolBridgeCard) return;
  const panel = document.createElement("section");
  panel.id = "rhSolBridgeCard";
  panel.className = "rh-sol-bridge-card";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="rh-sol-bridge-head">
      <div>
        <p id="rhBridgeEyebrow" class="rh-sol-bridge-eyebrow">Robinhood Chain rail</p>
        <h3 id="rhBridgeTitle">Launch from SOL</h3>
        <p id="rhBridgeBody">Bridge SOL into your Robinhood Chain wallet, then launch or trade on RH without leaving Pump-r.</p>
      </div>
      <span class="rh-sol-bridge-badge">beta</span>
    </div>
    <div class="rh-sol-bridge-grid">
      <label>
        <span id="rhBridgeAmountLabel">SOL to use if RH funding is needed</span>
        <input id="rhBridgeAmount" type="number" step="any" min="0.05" placeholder="0.1" value="0.1" />
      </label>
      <label>
        <span id="rhBridgeRecipientLabel">Robinhood receive wallet</span>
        <input id="rhBridgeRecipient" type="text" placeholder="0x... RH Chain wallet" autocomplete="off" />
      </label>
    </div>
    <div class="rh-sol-bridge-attached">
      <div>
        <span id="rhAttachedHeading">Attached RH launch wallet</span>
        <strong id="rhAttachedWallet">Auto wallet ready on launch</strong>
        <small id="rhAttachedWalletMeta">Pump-r will create one wallet for this Solana profile when you launch.</small>
      </div>
      <div class="rh-sol-bridge-attached-actions">
        <button id="rhAttachedGenerateBtn" class="btn-ghost" type="button">Attach wallet</button>
        <button id="rhAttachedExportBtn" class="btn-ghost" type="button" disabled>Export key</button>
      </div>
    </div>
    <label class="rh-sol-bridge-auto">
      <input id="rhAttachedAutoLaunch" type="checkbox" checked />
      <span id="rhAttachedAutoLabel">Use attached launch wallet to launch automatically after it is funded</span>
    </label>
    <div id="rhBridgePreview" class="rh-sol-bridge-preview">
      <article>
        <span>Estimated receive</span>
        <strong>-</strong>
      </article>
      <article>
        <span>Minimum receive</span>
        <strong>-</strong>
      </article>
      <article>
        <span>Route fee estimate</span>
        <strong>-</strong>
      </article>
    </div>
    <div class="rh-sol-bridge-actions">
      <button id="rhBridgeQuoteBtn" class="btn-ghost" type="button">Refresh funding quote</button>
      <button id="rhBridgeSubmitBtn" class="btn-primary" type="button">Fund launch wallet now</button>
    </div>
    <div class="rh-sol-bridge-progress" aria-live="polite">
      <div id="rhBridgeProgress" class="rh-sol-bridge-progress-bar"></div>
    </div>
    <p id="rhBridgeStatus" class="rh-sol-bridge-status">Create will auto-fund this launch wallet from SOL if it is short. The user signs the SOL funding tx; Pump-r never spends your dev wallet tokens.</p>
    <a id="rhBridgeTxLink" class="rh-sol-bridge-link" href="#" target="_blank" rel="noreferrer" hidden>Open bridge transaction</a>
  `;
  ui.advancedDetails?.insertAdjacentElement("beforebegin", panel);
  ui.rhSolBridgeCard = panel;
  ui.rhBridgeAmount = panel.querySelector("#rhBridgeAmount");
  ui.rhBridgeRecipient = panel.querySelector("#rhBridgeRecipient");
  ui.rhBridgeQuoteBtn = panel.querySelector("#rhBridgeQuoteBtn");
  ui.rhBridgeSubmitBtn = panel.querySelector("#rhBridgeSubmitBtn");
  ui.rhBridgeStatus = panel.querySelector("#rhBridgeStatus");
  ui.rhBridgePreview = panel.querySelector("#rhBridgePreview");
  ui.rhBridgeProgress = panel.querySelector("#rhBridgeProgress");
  ui.rhBridgeTxLink = panel.querySelector("#rhBridgeTxLink");
  ui.rhBridgeEyebrow = panel.querySelector("#rhBridgeEyebrow");
  ui.rhBridgeTitle = panel.querySelector("#rhBridgeTitle");
  ui.rhBridgeBody = panel.querySelector("#rhBridgeBody");
  ui.rhBridgeAmountLabel = panel.querySelector("#rhBridgeAmountLabel");
  ui.rhBridgeRecipientLabel = panel.querySelector("#rhBridgeRecipientLabel");
  ui.rhAttachedHeading = panel.querySelector("#rhAttachedHeading");
  ui.rhAttachedAutoLabel = panel.querySelector("#rhAttachedAutoLabel");
  ui.rhAttachedWallet = panel.querySelector("#rhAttachedWallet");
  ui.rhAttachedWalletMeta = panel.querySelector("#rhAttachedWalletMeta");
  ui.rhAttachedGenerateBtn = panel.querySelector("#rhAttachedGenerateBtn");
  ui.rhAttachedExportBtn = panel.querySelector("#rhAttachedExportBtn");
  ui.rhAttachedAutoLaunch = panel.querySelector("#rhAttachedAutoLaunch");
  ui.rhBridgeQuoteBtn?.addEventListener("click", () => quoteRhSolBridge({ silent: false }).catch((err) => setRhBridgeStatus(parseUiError(err), true)));
  ui.rhBridgeSubmitBtn?.addEventListener("click", () => submitRhSolBridge().catch((err) => {
    setRhBridgeBusy(false);
    setRhBridgeProgress(0);
    setRhBridgeStatus(parseUiError(err), true);
  }));
  ui.rhAttachedGenerateBtn?.addEventListener("click", async () => {
    try {
      await connectSolanaWallet();
      const wallet = ensureAttachedRhWallet({ create: true });
      renderAttachedRhWallet();
      if (ui.rhBridgeRecipient) ui.rhBridgeRecipient.value = wallet.address;
      const target = launchFromSolTargetInfo();
      setRhBridgeStatus(`Attached ${target.shortName} wallet ${shortAddress(wallet.address)}. Bridge SOL here, then launch without MetaMask.`);
      scheduleRhBridgeQuote();
    } catch (err) {
      setRhBridgeStatus(parseUiError(err), true);
    }
  });
  ui.rhAttachedExportBtn?.addEventListener("click", async () => {
    try {
      const wallet = ensureAttachedRhWallet({ create: false });
      if (!wallet?.privateKey) throw new Error("No attached launch wallet private key found.");
      const target = launchFromSolTargetInfo();
      await navigator.clipboard.writeText(wallet.privateKey);
      showCopyToast(target.copySuccess);
      setRhBridgeStatus(target.copyStatus);
    } catch (err) {
      setRhBridgeStatus(parseUiError(err), true);
    }
  });
  ui.rhBridgeAmount?.addEventListener("input", scheduleRhBridgeQuote);
  ui.rhBridgeRecipient?.addEventListener("input", scheduleRhBridgeQuote);
  updateRhBridgeUi();
  renderAttachedRhWallet();
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
        <p class="kol-eyebrow">Pump.fun add-on</p>
        <h3>Manlet Mode</h3>
        <p class="kol-subcopy">Optional buy and transfer to a selected Solana wallet after the Pump.fun token is live. Named Manlet Mode in honor of Ansem.</p>
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
      <p id="kolRouteStatus" class="kol-route-status">Manlet Mode is off.</p>
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
    if (String(context.launchMode || "").toLowerCase() === "evm" && String(solanaAddress || "").trim()) {
      const symbol = String(eligibility.symbol || "PUMPR").replace(/^\$/, "").toUpperCase();
      const held = Number(eligibility.balanceTokens || 0);
      const heldText = Number.isFinite(held) && held > 0
        ? held.toLocaleString(undefined, { maximumFractionDigits: 6 })
        : "0";
      throw new Error(
        `You're using Launch from SOL, so the connected Phantom wallet must hold $${symbol}. This Phantom wallet currently holds ${heldText} $${symbol} on SOL. Hold any amount above 0 $${symbol}, or turn off the SOL-funded launch rail and launch from your EVM wallet instead.`
      );
    }
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

function chainNativeSymbolForId(chainId) {
  const n = Number(chainId || 0);
  if (n === 143) return "MON";
  if ([1, 8453, 4663].includes(n)) return "ETH";
  if (n === 101) return "SOL";
  return "ETH";
}

function selectedSolFundingLaunchChainId() {
  const chainId = Number(state.selectedChainId || 0);
  if (isPumpFunMode() || isPumpVerseMode() || selectedQuoteMode() !== "native") return 0;
  return SOL_FUNDED_EVM_LAUNCH_CHAIN_IDS.has(chainId) ? chainId : 0;
}

function isSolFundingLaunchMode() {
  return selectedSolFundingLaunchChainId() > 0;
}

function launchFromSolTargetInfo(chainId = selectedSolFundingLaunchChainId()) {
  const targetChainId = Number(chainId || selectedSolFundingLaunchChainId() || ui.rhSolBridgeCard?.dataset?.chainId || 4663);
  const shortName = chainShortNameForId(targetChainId);
  const chainName = chainNameForId(targetChainId);
  const nativeSymbol = chainNativeSymbolForId(targetChainId);
  return {
    chainId: targetChainId,
    chainName,
    shortName,
    nativeSymbol,
    receiveLabel: `${chainName} receive wallet`,
    fundButtonLabel: `Fund ${shortName} wallet now`,
    railLabel: `${chainName} rail`,
    heading: "Launch from SOL",
    description:
      targetChainId === 4663
        ? "Bridge SOL into your Robinhood Chain wallet, then launch or trade without leaving Pump-r."
        : `Bridge SOL into your ${chainName} launch wallet, then launch without leaving Pump-r.`,
    amountLabel: `SOL to use if ${shortName} funding is needed`,
    attachedHeading: `Attached ${shortName} launch wallet`,
    attachedReadyLabel: `Auto ${shortName} wallet ready on launch`,
    attachedMissingMeta: `Pump-r will create one EVM wallet for this Solana profile and use it for ${chainName} launches.`,
    attachedAutoLabel: `Use attached ${shortName} wallet to launch automatically after it is funded`,
    defaultStatus: `Create will auto-fund this ${shortName} wallet from SOL if it is short. The user signs the SOL funding tx; Pump-r never spends your dev wallet tokens.`,
    copySuccess: `Attached ${shortName} private key copied`,
    copyStatus: `Attached ${shortName} private key copied. Keep it safe.`
  };
}

function isRobinhoodChainSelected() {
  return Number(state.selectedChainId || 0) === 4663 && !isPumpFunMode() && !isPumpVerseMode() && selectedQuoteMode() === "native";
}

function directLaunchStyleSupported(chainId = state.selectedChainId) {
  const normalized = Number(chainId || 0);
  return SOL_FUNDED_EVM_LAUNCH_CHAIN_IDS.has(normalized) && !isPumpFunMode() && !isPumpVerseMode() && selectedQuoteMode() === "native";
}

function selectedLaunchStyle(chainId = state.selectedChainId) {
  const normalized = Number(chainId || 0);
  const style = String(state.launchStyleByChain?.[normalized] || "bonding").toLowerCase();
  return style === "direct" ? "direct" : "bonding";
}

function isRobinhoodDirectLiquidityMode() {
  return directLaunchStyleSupported() && selectedLaunchStyle() === "direct";
}

function setLaunchStyle(style = "bonding", chainId = state.selectedChainId) {
  const normalized = Number(chainId || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return;
  if (!state.launchStyleByChain || typeof state.launchStyleByChain !== "object") {
    state.launchStyleByChain = {};
  }
  state.launchStyleByChain[normalized] = String(style || "").toLowerCase() === "direct" ? "direct" : "bonding";
}

function renderLaunchStyleToggle() {
  if (!ui.launchStyleCard) return;
  const supported = directLaunchStyleSupported();
  ui.launchStyleCard.hidden = !supported;
  if (!supported) return;
  const chainName = chainNameForId(state.selectedChainId);
  const direct = isRobinhoodDirectLiquidityMode();
  ui.launchStyleBondingBtn?.classList.toggle("active", !direct);
  ui.launchStyleBondingBtn?.setAttribute("aria-selected", direct ? "false" : "true");
  ui.launchStyleDirectBtn?.classList.toggle("active", direct);
  ui.launchStyleDirectBtn?.setAttribute("aria-selected", direct ? "true" : "false");
  if (ui.launchStyleHint) {
    ui.launchStyleHint.textContent = direct
      ? `Direct launch on ${chainName} uses your entered native gas token as launch liquidity and burns LP automatically.`
      : `Bonding curve launches start normally on ${chainName}, then any native gas token entered below is used as an optional starter buy after launch.`;
  }
}

function updateRhBridgeUi() {
  if (!ui.rhSolBridgeCard) return;
  const targetChainId = selectedSolFundingLaunchChainId() || Number(ui.rhSolBridgeCard.dataset.chainId || 4663);
  const target = launchFromSolTargetInfo(targetChainId);
  const lastChainId = Number(ui.rhSolBridgeCard.dataset.chainId || 0);
  const changedChain = lastChainId > 0 && lastChainId !== target.chainId;
  ui.rhSolBridgeCard.dataset.chainId = String(target.chainId);
  if (ui.rhBridgeEyebrow) ui.rhBridgeEyebrow.textContent = target.railLabel;
  if (ui.rhBridgeTitle) ui.rhBridgeTitle.textContent = target.heading;
  if (ui.rhBridgeBody) ui.rhBridgeBody.textContent = target.description;
  if (ui.rhBridgeAmountLabel) ui.rhBridgeAmountLabel.textContent = target.amountLabel;
  if (ui.rhBridgeRecipientLabel) ui.rhBridgeRecipientLabel.textContent = target.receiveLabel;
  if (ui.rhBridgeRecipient) ui.rhBridgeRecipient.placeholder = `0x... ${target.shortName} wallet`;
  if (ui.rhAttachedHeading) ui.rhAttachedHeading.textContent = target.attachedHeading;
  if (ui.rhAttachedAutoLabel) ui.rhAttachedAutoLabel.textContent = target.attachedAutoLabel;
  if (ui.rhBridgeSubmitBtn && !ui.rhBridgeSubmitBtn.disabled) ui.rhBridgeSubmitBtn.textContent = target.fundButtonLabel;
  if (changedChain) {
    state.rhBridge.quote = null;
    state.rhBridge.signature = "";
    renderRhBridgeQuote(null);
    if (ui.rhBridgeTxLink) {
      ui.rhBridgeTxLink.hidden = true;
      ui.rhBridgeTxLink.removeAttribute("href");
    }
    setRhBridgeProgress(0);
    setRhBridgeStatus(target.defaultStatus);
  } else if (!state.rhBridge.quote && !state.rhBridge.signature && ui.rhBridgeStatus && !ui.rhBridgeStatus.classList.contains("error")) {
    setRhBridgeStatus(target.defaultStatus);
  }
  if (ui.rhAttachedWallet) renderAttachedRhWallet();
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
  ensureRhSolBridgeOptions();
  updateRhBridgeUi();
  renderLaunchStyleToggle();
  if (ui.advancedDetails) {
    ui.advancedDetails.hidden = isPumpFunMode();
    if (isPumpFunMode()) ui.advancedDetails.open = false;
  }
  if (ui.pumpfunOptions) ui.pumpfunOptions.hidden = !isPumpFunMode();
  if (ui.rhSolBridgeCard) ui.rhSolBridgeCard.hidden = !isSolFundingLaunchMode();
  if (ui.kolApplicationCard) ui.kolApplicationCard.hidden = !isPumpFunMode();
  if (ui.pumpfunCreatorWalletWrap) ui.pumpfunCreatorWalletWrap.hidden = !isPumpFunMode();
  ui.createForm?.classList.toggle("create-mode-solana", isPumpFunMode());
  ui.createForm?.classList.toggle("create-mode-evm", !isPumpFunMode());
  syncRhBridgeRecipient();
  if (ui.starterBuyLabel) {
    ui.starterBuyLabel.textContent = isRobinhoodDirectLiquidityMode()
      ? `Direct launch liquidity (${chainNativeSymbolForId(state.selectedChainId)})`
      : `Optional starter buy (${chainNativeSymbolForId(state.selectedChainId)})`;
  }
  if (ui.starterMcapLabel) {
    ui.starterMcapLabel.textContent = isRobinhoodDirectLiquidityMode()
      ? "Direct launch market cap estimate (USD)"
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
      ? `PumpVerse launches the same token details on ${pumpVerseLabel()}. MetaMask will ask for separate confirmations on each chain; the single-wallet SOL funding rail does not apply to this multichain mode.`
      : selectedQuoteMode() === "usdc"
      ? "USDC launches use a USDC-paired bonding curve on Ethereum. Buyers can still route from ETH through Uniswap after graduation; the SOL funding rail only applies to native-gas EVM launch modes."
      : Number(current?.chainId || state.selectedChainId) === 4663
      ? isRobinhoodDirectLiquidityMode()
        ? "Robinhood Chain uses ETH for gas. Direct Uniswap mode seeds liquidity on launch and burns LP automatically."
        : "Robinhood Chain uses ETH for gas. Bonding curve mode launches first, then optional starter buy can be sent after launch."
      : directLaunchStyleSupported()
      ? isRobinhoodDirectLiquidityMode()
        ? `${current?.name || chainNameForId(state.selectedChainId)} direct launch seeds liquidity on launch and burns LP automatically.`
        : `${current?.name || chainNameForId(state.selectedChainId)} bonding curve mode launches first, then optional starter buy can be sent after launch.`
      : isSolFundingLaunchMode()
      ? `Pump-r can auto-fund an attached ${chainShortNameForId(state.selectedChainId)} launch wallet from SOL first, so you can launch on ${current?.name || chainNameForId(state.selectedChainId)} without holding native gas there upfront.`
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
        const isSolFundingChoice =
          !isPumpVerseParent &&
          !isExternalLaunch &&
          !isUsdcMode &&
          SOL_FUNDED_EVM_LAUNCH_CHAIN_IDS.has(Number(choice.chainId || 0));
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
          : isSolFundingChoice
          ? `${row?.shortName || choice.shortName} ${choice.networkLabel}${enabled ? " - launch from SOL ready" : " - configure factory"}`
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
    ui.imagePreview.hidden = true;
    ui.imagePreview.removeAttribute("src");
    return;
  }
  ui.imagePreview.src = src;
  ui.imagePreview.hidden = false;
  ui.imagePreview.style.display = "block";
}

function showUploadBoxPreview(src) {
  if (!ui.uploadPreviewImage || !ui.uploadMediaWrap || !ui.uploadCopy) return;
  if (!src) {
    ui.uploadPreviewImage.removeAttribute("src");
    ui.uploadPreviewImage.hidden = true;
    ui.uploadPreviewImage.style.display = "none";
    ui.uploadMediaWrap.classList.remove("active");
    ui.uploadCopy.style.display = "grid";
    return;
  }

  ui.uploadPreviewImage.src = src;
  ui.uploadPreviewImage.hidden = false;
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
  const directLaunch = isRobinhoodDirectLiquidityMode();
  const nativeChainLaunch = directLaunchStyleSupported();
  const nativeSymbol = chainNativeSymbolForId(state.selectedChainId);
  const chainName = chainNameForId(state.selectedChainId);

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
        ? directLaunch
          ? `Direct launch estimate: ${formatUsd(economics.marketCapUsd)} (~${economics.marketCapEth.toFixed(4)} ${economics.quoteSymbol} paired as launch liquidity)`
          : `Optional starter buy market cap: ${formatUsd(economics.marketCapUsd)} (~${economics.marketCapEth.toFixed(4)} ${economics.quoteSymbol})`
        : directLaunch
        ? `0 ${nativeSymbol} means this will open as a bonding curve first.`
        : "Bonding curve starts at the configured virtual reserve price.";
  }
  if (ui.launchMathSecondary) {
    ui.launchMathSecondary.textContent = directLaunch
      ? `Enter ${nativeSymbol} here to skip the bonding curve and launch directly on ${chainName} with burned LP.`
      : nativeChainLaunch
      ? `Launch starts on the bonding curve; any ${nativeSymbol} entered below is used as a starter buy after the launch is created.`
      : "Launches stay on the bonding curve until the graduation target is reached.";
  }
  if (ui.launchMathTertiary) {
    ui.launchMathTertiary.textContent =
      economics.liquidityEth > 0
        ? directLaunch
          ? "Starter liquidity is added to Uniswap and LP tokens are burned automatically."
          : "Starter buy is sent as the first pool buy after launch."
        : directLaunch
        ? "No direct Uniswap liquidity selected."
        : "No starter buy selected.";
  }
  if (ui.launchMathQuaternary) {
    ui.launchMathQuaternary.textContent = directLaunch
      ? `At your settings, 1 ${economics.quoteSymbol} direct launch liquidity estimates ${formatUsd(economics.oneEthMcapUsd)} market cap`
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
      : "Manlet Mode is off.";
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
  if (!directLaunchStyleSupported()) return true;
  if (!isRobinhoodDirectLiquidityMode()) return true;
  if (BigInt(details.starterBuyEth || 0n) > 0n) return true;
  const chainName = chainNameForId(state.selectedChainId);
  if (ui.advancedDetails) {
    ui.advancedDetails.hidden = false;
    ui.advancedDetails.open = true;
  }
  ui.devBuyEth?.focus?.();
  setAlert(ui.alert, `${chainName} direct launch needs liquidity entered first. Add liquidity or switch the launch style back to Bonding curve.`, true);
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
        throw new Error("Select a valid Solana wallet before enabling Manlet Mode.");
      }
      if (!Number.isFinite(Number(kolApplication.buySol)) || Number(kolApplication.buySol) <= 0) {
        throw new Error("Manlet Mode needs a SOL buy amount above 0.");
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

  const factory = makeFactoryContract(state.config.factoryAddress);
  const launchFeeWei = BigInt(state.config?.deployment?.launchFeeWei || "0");
  const dexRouter = String(state.config?.deployment?.dexRouter || ethers.ZeroAddress);
  const hasDexRouter = dexRouter && dexRouter.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
  const useTaxLaunch = Number(state.selectedChainId || 0) === 4663 && selectedQuoteMode() === "native";
  const directLiquidityMode = directLaunchStyleSupported(state.selectedChainId) && isRobinhoodDirectLiquidityMode();
  if (directLiquidityMode && details.starterBuyEth > 0n && !hasDexRouter) {
    throw new Error(`${chainNameForId(state.selectedChainId)} direct launch mode needs a DEX router configured first. Switch to Bonding curve or set direct liquidity to 0.`);
  }
  const useInstantLiquidity = directLiquidityMode && hasDexRouter && details.starterBuyEth > 0n;
  const totalValue = launchFeeWei + (useInstantLiquidity ? details.starterBuyEth : 0n);
  const launchMethodName = useInstantLiquidity
    ? useTaxLaunch
      ? "createLaunchInstantWithTax"
      : "createLaunchInstant"
    : useTaxLaunch
    ? "createLaunchWithTax"
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

async function launchOnRobinhoodAttachedWallet(details, { showModal = true } = {}) {
  const targetChainId = selectedSolFundingLaunchChainId();
  if (!targetChainId) {
    throw new Error("Attached wallet launch is only available on supported EVM launch rails.");
  }
  const target = launchFromSolTargetInfo(targetChainId);
  const attached = ensureAttachedRhWallet({ create: true });
  await loadChainConfig(targetChainId, "native");
  const rpcUrl = browserSafeRpcUrl();
  if (!rpcUrl) throw new Error(`${target.chainName} RPC is not configured.`);
  const provider = new ethers.JsonRpcProvider(rpcUrl, targetChainId);
  const signer = new ethers.Wallet(attached.privateKey, provider);
  const factory = new ethers.Contract(state.config.factoryAddress, FACTORY_ABI, signer);
  const launchFeeWei = BigInt(state.config?.deployment?.launchFeeWei || "0");
  const dexRouter = String(state.config?.deployment?.dexRouter || ethers.ZeroAddress);
  const hasDexRouter = dexRouter && dexRouter.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
  const useTaxLaunch = targetChainId === 4663 && selectedQuoteMode() === "native";
  const directLiquidityMode = directLaunchStyleSupported(targetChainId) && isRobinhoodDirectLiquidityMode();
  if (directLiquidityMode && details.starterBuyEth > 0n && !hasDexRouter) {
    throw new Error(`${target.chainName} direct launch mode needs a DEX router configured first. Switch to Bonding curve or set direct liquidity to 0.`);
  }
  const useInstantLiquidity = directLiquidityMode && hasDexRouter && details.starterBuyEth > 0n;
  const totalValue = launchFeeWei + (useInstantLiquidity ? details.starterBuyEth : 0n);
  const requiredFlowValue = totalValue + (useInstantLiquidity ? 0n : BigInt(details.starterBuyEth || 0n));
  const balance = await provider.getBalance(attached.address);
  if (balance < requiredFlowValue) {
    const needed = Number(ethers.formatEther(requiredFlowValue || 0n));
    const have = Number(ethers.formatEther(balance || 0n));
    throw new Error(`Attached ${target.shortName} wallet needs more ${target.nativeSymbol} before launch. Have ${have.toFixed(6)} ${target.nativeSymbol}, need about ${needed.toFixed(6)} ${target.nativeSymbol} plus gas. Bridge SOL into ${shortAddress(attached.address)} first.`);
  }
  const launchMethodName = useInstantLiquidity
    ? useTaxLaunch
      ? "createLaunchInstantWithTax"
      : "createLaunchInstant"
    : useTaxLaunch
    ? "createLaunchWithTax"
    : "createLaunch";
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
  const simulated = await factory[launchMethodName].staticCall(...launchArgs, { value: totalValue });
  setAlert(
    ui.alert,
    useInstantLiquidity
      ? `Launching on ${target.chainName} from attached wallet ${shortAddress(attached.address)} with burned LP...`
      : `Launching on ${target.chainName} from attached wallet ${shortAddress(attached.address)}...`
  );
  const tx = await factory[launchMethodName](...launchArgs, { value: totalValue });
  const receipt = await tx.wait();
  const launchInfo = extractLaunchCreated(receipt) || {
    launchId: simulated?.[0],
    token: simulated?.[1],
    pool: simulated?.[2]
  };
  if (!useInstantLiquidity && details.starterBuyEth > 0n && launchInfo?.pool) {
    setAlert(ui.alert, `${target.chainName} launch created. Sending starter buy from attached ${target.shortName} wallet...`);
    const pool = new ethers.Contract(launchInfo.pool, POOL_ABI, signer);
    const quoted = await pool.quoteBuy(details.starterBuyEth);
    const quotedTokens = BigInt(quoted?.[0] || 0n);
    const minTokensOut = quotedTokens > 0n ? (quotedTokens * 97n) / 100n : 0n;
    const buyTx = await pool.buy(minTokensOut, { value: details.starterBuyEth });
    await buyTx.wait();
  }
  if (launchInfo?.token) {
    ui.resultLink.href = `/token?token=${launchInfo.token}&chainId=${targetChainId}`;
    ui.resultLink.textContent = `Open ${target.chainName} ${shortAddress(launchInfo.token)} token page`;
    ui.resultLink.style.display = "inline-block";
    if (showModal) {
      showCreatedModal({ name: details.name, symbol: details.symbol, token: launchInfo.token, chainId: targetChainId, quoteMode: "native" });
    }
  }
  return {
    ok: true,
    chainId: targetChainId,
    quoteMode: "native",
    token: launchInfo?.token || "",
    pool: launchInfo?.pool || "",
    launchId: launchInfo?.launchId,
    attachedWallet: attached.address
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

function syncPumpFunLaunchRecord(row = {}) {
  if (typeof api.pumpfunRecordLaunch !== "function") return;
  const normalized = normalizePumpFunHomeLaunch(row);
  if (!normalized) return;
  api.pumpfunRecordLaunch(normalized).catch(() => {
    // Home will retry this cached launch if Supabase or Pump.fun is still catching up.
  });
}

function isSolanaBlockhashExpiredError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("block height exceeded") ||
    message.includes("blockhash not found") ||
    message.includes("signature") && message.includes("expired");
}

function normalizeSolanaSignature(result) {
  if (typeof result === "string") return result;
  if (typeof result?.signature === "string") return result.signature;
  if (typeof result?.txid === "string") return result.txid;
  return "";
}

function deserializeSolanaTransaction(solanaWeb3, transactionBase64, isVersioned = false) {
  const bytes = base64ToBytes(transactionBase64);
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
        // Preserve the legacy parser error for clearer wallet/debug messages.
      }
    }
    throw legacyError;
  }
}

function serializeSignedSolanaTransaction(transaction) {
  try {
    return bytesToBase64(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }));
  } catch {
    return bytesToBase64(transaction.serialize());
  }
}

function normalizeEvmAddress(value = "") {
  try {
    return ethers.getAddress(String(value || "").trim());
  } catch {
    return "";
  }
}

function formatNumber(value = 0, max = 6) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

function setRhBridgeStatus(message = "", error = false) {
  if (!ui.rhBridgeStatus) return;
  ui.rhBridgeStatus.textContent = message || "";
  ui.rhBridgeStatus.classList.toggle("error", Boolean(error));
}

function setRhBridgeBusy(active, label = "") {
  if (ui.rhBridgeQuoteBtn) ui.rhBridgeQuoteBtn.disabled = Boolean(active);
  if (ui.rhBridgeSubmitBtn) {
    ui.rhBridgeSubmitBtn.disabled = Boolean(active);
    ui.rhBridgeSubmitBtn.textContent = active ? (label || "Working...") : launchFromSolTargetInfo().fundButtonLabel;
  }
}

function setRhBridgeProgress(value = 0) {
  if (!ui.rhBridgeProgress) return;
  const pct = Math.max(0, Math.min(100, Number(value || 0)));
  ui.rhBridgeProgress.style.width = `${pct}%`;
}

function connectedSolanaProfileKey() {
  const sol = solanaWalletState();
  const ws = walletState();
  return String(state.solanaWallet?.publicKey || sol.address || ws.solanaAddress || "").trim();
}

function readRhWalletStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RH_WALLET_STORE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeRhWalletStore(store = {}) {
  try {
    localStorage.setItem(RH_WALLET_STORE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("pumpr:rhWalletChanged"));
  } catch {
    // Ignore storage write failures.
  }
}

function getAttachedRhWallet() {
  const key = connectedSolanaProfileKey();
  if (!key) return null;
  const row = readRhWalletStore()[key];
  return row?.type === "generated" && normalizeEvmAddress(row.address) && row.privateKey ? row : null;
}

function saveAttachedRhWallet(row = {}) {
  const key = connectedSolanaProfileKey();
  if (!key) throw new Error("Connect a Solana wallet before attaching an EVM launch wallet.");
  const store = readRhWalletStore();
  store[key] = {
    ...store[key],
    ...row,
    type: "generated",
    ownerSolana: key,
    updatedAt: Date.now()
  };
  writeRhWalletStore(store);
  return store[key];
}

function ensureAttachedRhWallet({ create = false } = {}) {
  const existing = getAttachedRhWallet();
  if (existing) return existing;
  if (!create) return null;
  if (!connectedSolanaProfileKey()) throw new Error("Connect a Solana wallet before attaching an EVM launch wallet.");
  const wallet = ethers.Wallet.createRandom();
  return saveAttachedRhWallet({
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || "",
    createdAt: Date.now()
  });
}

function renderAttachedRhWallet() {
  const target = launchFromSolTargetInfo();
  const wallet = getAttachedRhWallet();
  if (ui.rhAttachedWallet) {
    ui.rhAttachedWallet.textContent = wallet?.address || target.attachedReadyLabel;
  }
  if (ui.rhAttachedWalletMeta) {
    ui.rhAttachedWalletMeta.textContent = wallet
      ? `Saved to this Solana profile - ${shortAddress(wallet.address)}`
      : target.attachedMissingMeta;
  }
  if (ui.rhAttachedGenerateBtn) {
    ui.rhAttachedGenerateBtn.textContent = wallet ? "Attached" : "Attach wallet";
  }
  if (ui.rhAttachedExportBtn) ui.rhAttachedExportBtn.disabled = !wallet?.privateKey;
}

function attachedLaunchGasBufferWei(chainId = selectedSolFundingLaunchChainId()) {
  const targetChainId = Number(chainId || 0);
  if (targetChainId === 1) return ethers.parseEther("0.003");
  if (targetChainId === 143) return ethers.parseEther("0.001");
  if (targetChainId === 4663) return ethers.parseEther("0.00035");
  return ethers.parseEther("0.001");
}

function browserSafeRpcUrl(config = state.config) {
  return String(
    config?.browserRpcUrl ||
      config?.browserRpcUrls?.[0] ||
      config?.rpcUrl ||
      config?.rpcUrls?.[0] ||
      ""
  ).trim();
}

function buildAttachedFundingShortfallMessage({ quote, funding, target, solAmountText = "" } = {}) {
  const neededNative = Number(ethers.formatEther(BigInt(funding?.shortfall || 0n)));
  const minimumNative = Number(quote?.minimumTargetNative || quote?.estimatedTargetNative || 0);
  const shownSol = Number.parseFloat(String(quote?.amountSol || solAmountText || "0").replace(/[^\d.]+/g, "")) || 0;
  let recommendation = "";
  if (shownSol > 0 && minimumNative > 0 && neededNative > 0) {
    const recommendedSol = shownSol * (neededNative / minimumNative) * 1.08;
    if (Number.isFinite(recommendedSol) && recommendedSol > shownSol) {
      recommendation = ` Try about ${recommendedSol.toFixed(recommendedSol < 1 ? 3 : 2)} SOL so the attached ${target.shortName} wallet clears launch fee + gas.`;
    }
  }
  return `${solAmountText || quote?.amountSolText || "This SOL amount"} only routes about ${quote?.minimumTargetNativeText || minimumNative.toFixed(6)} ${target.nativeSymbol} minimum, but the launch wallet is short by about ${neededNative.toFixed(6)} ${target.nativeSymbol}.${recommendation}`;
}

async function getAttachedRhLaunchFunding(details, chainId = selectedSolFundingLaunchChainId()) {
  const targetChainId = Number(chainId || 0);
  const target = launchFromSolTargetInfo(targetChainId);
  const attached = ensureAttachedRhWallet({ create: true });
  await loadChainConfig(targetChainId, "native");
  const rpcUrl = browserSafeRpcUrl();
  if (!rpcUrl) throw new Error(`${target.chainName} RPC is not configured.`);
  const provider = new ethers.JsonRpcProvider(rpcUrl, targetChainId);
  const launchFeeWei = BigInt(state.config?.deployment?.launchFeeWei || "0");
  const dexRouter = String(state.config?.deployment?.dexRouter || ethers.ZeroAddress);
  const hasDexRouter = dexRouter && dexRouter.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
  const useTaxLaunch = targetChainId === 4663 && selectedQuoteMode() === "native";
  const directLiquidityMode = directLaunchStyleSupported(targetChainId) && isRobinhoodDirectLiquidityMode();
  if (directLiquidityMode && details.starterBuyEth > 0n && !hasDexRouter) {
    throw new Error(`${target.chainName} direct launch mode needs a DEX router configured first. Switch to Bonding curve or set direct liquidity to 0.`);
  }
  const useInstantLiquidity = directLiquidityMode && hasDexRouter && details.starterBuyEth > 0n;
  const totalValue = launchFeeWei + (useInstantLiquidity ? details.starterBuyEth : 0n);
  const requiredWithGas = totalValue + (useInstantLiquidity ? 0n : BigInt(details.starterBuyEth || 0n)) + attachedLaunchGasBufferWei(targetChainId);
  const balance = await provider.getBalance(attached.address);
  return {
    target,
    attached,
    provider,
    launchFeeWei,
    useTaxLaunch,
    hasDexRouter,
    useInstantLiquidity,
    totalValue,
    requiredWithGas,
    balance,
    shortfall: balance >= requiredWithGas ? 0n : requiredWithGas - balance
  };
}

function syncRhBridgeRecipient() {
  if (!ui.rhBridgeRecipient || ui.rhBridgeRecipient.value.trim()) return;
  const attached = getAttachedRhWallet();
  if (attached?.address && isSolFundingLaunchMode()) {
    ui.rhBridgeRecipient.value = attached.address;
    return;
  }
  const evmAddress = normalizeEvmAddress(walletState().address || "");
  if (evmAddress && isSolFundingLaunchMode()) {
    ui.rhBridgeRecipient.value = evmAddress;
  }
}

function renderRhBridgeQuote(quote = state.rhBridge.quote) {
  if (!ui.rhBridgePreview) return;
  const articles = [...ui.rhBridgePreview.querySelectorAll("article strong")];
  if (!quote) {
    articles[0].textContent = "-";
    articles[1].textContent = "-";
    articles[2].textContent = "-";
    return;
  }
  const feeUsd = Number(quote?.fees?.totalUsd || 0);
  const nativeSymbol = String(quote?.targetNativeSymbol || launchFromSolTargetInfo(Number(quote?.targetChainId || 0)).nativeSymbol || "ETH");
  articles[0].textContent = `${quote.estimatedTargetNativeText || formatNumber(quote.estimatedTargetNative, 8)} ${nativeSymbol}`;
  articles[1].textContent = `${quote.minimumTargetNativeText || formatNumber(quote.minimumTargetNative, 8)} ${nativeSymbol}`;
  articles[2].textContent = feeUsd > 0 ? `$${feeUsd.toFixed(2)} via ${quote.tool || "LI.FI"}` : quote.tool || "LI.FI";
}

let rhBridgeQuoteTimer = null;

function scheduleRhBridgeQuote() {
  window.clearTimeout(rhBridgeQuoteTimer);
  rhBridgeQuoteTimer = window.setTimeout(() => {
    if (!isSolFundingLaunchMode()) return;
    quoteRhSolBridge({ silent: true }).catch(() => {});
  }, 650);
}

async function signSolanaTransactionBase64(transactionBase64 = "") {
  const { provider } = await connectSolanaWallet();
  if (!provider || typeof provider.signTransaction !== "function") {
    throw new Error("Use Phantom or another Solana wallet that can sign bridge transactions.");
  }
  const solanaWeb3 = await loadSolanaWeb3();
  const transaction = deserializeSolanaTransaction(solanaWeb3, transactionBase64);
  const signed = await provider.signTransaction(transaction);
  return serializeSignedSolanaTransaction(signed);
}

async function quoteRhSolBridge({ silent = false } = {}) {
  ensureRhSolBridgeOptions();
  updateRhBridgeUi();
  syncRhBridgeRecipient();
  const targetChainId = selectedSolFundingLaunchChainId();
  if (!targetChainId) throw new Error("Launch-from-SOL is only available for supported EVM chains.");
  const target = launchFromSolTargetInfo(targetChainId);
  const existingSolana = solanaWalletState();
  if (silent && (!existingSolana?.provider || !existingSolana?.address)) {
    throw new Error("Connect Phantom to quote the SOL bridge.");
  }
  const solana = silent
    ? { provider: existingSolana.provider, publicKey: existingSolana.address }
    : await connectSolanaWallet();
  let recipient = normalizeEvmAddress(ui.rhBridgeRecipient?.value || "");
  if (!recipient && ui.rhAttachedAutoLaunch?.checked) {
    const attached = ensureAttachedRhWallet({ create: true });
    renderAttachedRhWallet();
    recipient = normalizeEvmAddress(attached.address || "");
    if (ui.rhBridgeRecipient) ui.rhBridgeRecipient.value = recipient;
  }
  const amountSol = String(ui.rhBridgeAmount?.value || "").trim();
  if (!recipient) throw new Error(`Enter a valid ${target.chainName} receive wallet.`);
  if (!amountSol || Number(amountSol) <= 0) throw new Error("Enter SOL amount to bridge.");
  if (!silent) {
    setRhBridgeBusy(true, "Quoting...");
    setRhBridgeProgress(18);
    setRhBridgeStatus(`Fetching live SOL -> ${target.chainName} ${target.nativeSymbol} route...`);
  }
  try {
    const quote = await api.rhBridgeQuote({
      solanaAddress: solana.publicKey,
      recipient,
      amountSol,
      targetChainId
    });
    state.rhBridge.quote = quote;
    renderRhBridgeQuote(quote);
    if (!silent) {
      setRhBridgeProgress(0);
      setRhBridgeStatus(`Quote ready. Estimated ${quote.estimatedTargetNativeText} ${target.nativeSymbol} to ${shortAddress(recipient)}.`);
    }
    return quote;
  } finally {
    if (!silent) setRhBridgeBusy(false);
  }
}

function rhBridgeExplorerUrl(signature = "") {
  const sig = String(signature || "").trim();
  return sig ? `https://solscan.io/tx/${encodeURIComponent(sig)}` : "";
}

async function pollRhBridgeStatus(signature = "", bridge = "", { wait = false, targetChainId = 0 } = {}) {
  const sig = String(signature || "").trim();
  if (!sig) return;
  const resolvedChainId = Number(targetChainId || selectedSolFundingLaunchChainId() || state.rhBridge.quote?.targetChainId || 4663);
  const target = launchFromSolTargetInfo(resolvedChainId);
  window.clearTimeout(state.rhBridge.statusTimer);
  let count = 0;
  return await new Promise((resolve, reject) => {
    const tick = async () => {
      count += 1;
      try {
        const status = await api.rhBridgeStatus({ txHash: sig, bridge, targetChainId: resolvedChainId });
        const text = String(status?.status || status?.payload?.status || "").toUpperCase();
        if (["DONE", "COMPLETED", "SUCCESS", "FINISHED"].includes(text)) {
          setRhBridgeProgress(100);
          setRhBridgeBusy(false);
          setRhBridgeStatus(
            wait
              ? `Bridge complete. Continuing ${target.chainName} launch...`
              : `Bridge complete. Switch/connect your ${target.chainName} wallet and launch or trade with the funded ${target.nativeSymbol}.`
          );
          resolve(status);
          return;
        }
        if (["FAILED", "INVALID", "NOT_FOUND"].includes(text)) {
          const message = `Bridge status: ${text || "unknown"}. Open the transaction link and check LI.FI/${target.chainName} delivery.`;
          setRhBridgeBusy(false);
          setRhBridgeStatus(message, true);
          reject(new Error(message));
          return;
        }
        setRhBridgeProgress(Math.min(92, 52 + count * 6));
        setRhBridgeStatus(`Bridge submitted. Waiting for ${target.chainName} delivery${text ? ` (${text})` : ""}...`);
      } catch (error) {
        setRhBridgeStatus(`Bridge submitted. Waiting for ${target.chainName} delivery...`);
        if (count > 8 && wait) {
          // Keep waiting unless the bridge API explicitly fails; status APIs can lag behind settlement.
        }
      }
      if (count < 24) state.rhBridge.statusTimer = window.setTimeout(tick, count < 8 ? 3000 : 7000);
      else {
        setRhBridgeBusy(false);
        const message = "Bridge is still processing. You can keep this page open or check the transaction link.";
        setRhBridgeStatus(message, wait);
        if (wait) reject(new Error(message));
        else resolve(null);
      }
    };
    state.rhBridge.statusTimer = window.setTimeout(tick, 2200);
  });
}

async function submitRhSolBridge(options = {}) {
  const waitForDelivery = Boolean(options.waitForDelivery);
  ensureRhSolBridgeOptions();
  updateRhBridgeUi();
  syncRhBridgeRecipient();
  const targetChainId = selectedSolFundingLaunchChainId();
  if (!targetChainId) throw new Error("Launch-from-SOL is only available for supported EVM chains.");
  const target = launchFromSolTargetInfo(targetChainId);
  const solana = await connectSolanaWallet();
  let recipient = normalizeEvmAddress(ui.rhBridgeRecipient?.value || "");
  if (!recipient && ui.rhAttachedAutoLaunch?.checked) {
    const attached = ensureAttachedRhWallet({ create: true });
    renderAttachedRhWallet();
    recipient = normalizeEvmAddress(attached.address || "");
    if (ui.rhBridgeRecipient) ui.rhBridgeRecipient.value = recipient;
  }
  const amountSol = String(ui.rhBridgeAmount?.value || "").trim();
  if (!recipient) throw new Error(`Enter a valid ${target.chainName} receive wallet.`);
  setRhBridgeBusy(true, "Preparing...");
  setRhBridgeProgress(16);
  setRhBridgeStatus("Preparing SOL bridge transaction for Phantom...");
  const prepared = await api.rhBridgePrepare({
    solanaAddress: solana.publicKey,
    recipient,
    amountSol,
    targetChainId
  });
  state.rhBridge.quote = prepared;
  renderRhBridgeQuote(prepared);
  if (!prepared.transactionBase64) throw new Error("Bridge route did not return a transaction.");
  setRhBridgeProgress(32);
  setRhBridgeBusy(true, "Sign in Phantom...");
  setRhBridgeStatus(`Open Phantom to bridge ${prepared.amountSolText} SOL to ${shortAddress(recipient)} on ${target.chainName}. This signs from your Solana wallet.`);
  const signedTransactionBase64 = await signSolanaTransactionBase64(prepared.transactionBase64);
  setRhBridgeProgress(48);
  setRhBridgeBusy(true, "Broadcasting...");
  setRhBridgeStatus("Broadcasting signed SOL bridge transaction...");
  const sent = await api.solanaSendTransaction({ signedTransactionBase64 });
  const signature = String(sent?.signature || sent?.txid || "");
  if (!signature) throw new Error("Bridge broadcast did not return a transaction signature.");
  state.rhBridge.signature = signature;
  if (ui.rhBridgeTxLink) {
    ui.rhBridgeTxLink.href = rhBridgeExplorerUrl(signature);
    ui.rhBridgeTxLink.hidden = false;
  }
  setRhBridgeProgress(58);
  setRhBridgeStatus(`Bridge sent: ${shortAddress(signature)}. Tracking ${target.chainName} delivery...`);
  if (!waitForDelivery) {
    pollRhBridgeStatus(signature, prepared.tool || "", { targetChainId }).catch(() => {});
    return signature;
  }
  const status = await pollRhBridgeStatus(signature, prepared.tool || "", { wait: true, targetChainId });
  return { signature, status, quote: prepared };
}

async function waitForAttachedRhFunding(details, { minWaitMs = 2500, timeoutMs = 120000, chainId = selectedSolFundingLaunchChainId() } = {}) {
  const target = launchFromSolTargetInfo(chainId);
  const started = Date.now();
  if (minWaitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, minWaitMs));
  let lastFunding = null;
  while (Date.now() - started < timeoutMs) {
    lastFunding = await getAttachedRhLaunchFunding(details, chainId);
    if (lastFunding.balance >= lastFunding.requiredWithGas) return lastFunding;
    setRhBridgeStatus(
      `Bridge delivered, waiting for ${target.shortName} wallet balance. Have ${Number(ethers.formatEther(lastFunding.balance)).toFixed(6)} ${target.nativeSymbol}; need about ${Number(ethers.formatEther(lastFunding.requiredWithGas)).toFixed(6)} ${target.nativeSymbol}.`
    );
    await new Promise((resolve) => window.setTimeout(resolve, 4500));
  }
  const funding = lastFunding || await getAttachedRhLaunchFunding(details, chainId);
  throw new Error(`Attached ${target.shortName} wallet is still short after bridging. Have ${Number(ethers.formatEther(funding.balance)).toFixed(6)} ${target.nativeSymbol}; need about ${Number(ethers.formatEther(funding.requiredWithGas)).toFixed(6)} ${target.nativeSymbol}.`);
}

async function ensureAttachedRhFundingBeforeLaunch(details) {
  ensureRhSolBridgeOptions();
  updateRhBridgeUi();
  const targetChainId = selectedSolFundingLaunchChainId();
  const target = launchFromSolTargetInfo(targetChainId);
  await connectSolanaWallet();
  const attached = ensureAttachedRhWallet({ create: true });
  renderAttachedRhWallet();
  if (ui.rhBridgeRecipient) ui.rhBridgeRecipient.value = attached.address;
  const funding = await getAttachedRhLaunchFunding(details, targetChainId);
  if (funding.balance >= funding.requiredWithGas) {
    setRhBridgeStatus(`Attached ${target.shortName} wallet is funded (${Number(ethers.formatEther(funding.balance)).toFixed(6)} ${target.nativeSymbol}). Launching now...`);
    return funding;
  }
  const solAmount = String(ui.rhBridgeAmount?.value || "").trim();
  if (!solAmount || Number(solAmount) <= 0) {
    throw new Error(`Enter SOL amount to use for the automatic ${target.chainName} launch bridge.`);
  }
  const quote = await quoteRhSolBridge({ silent: true });
  const quotedMinimumNative = Number(quote?.minimumTargetNative || quote?.estimatedTargetNative || 0);
  const neededNative = Number(ethers.formatEther(BigInt(funding.shortfall || 0n)));
  if (quotedMinimumNative > 0 && neededNative > 0 && quotedMinimumNative + 1e-12 < neededNative) {
    const message = buildAttachedFundingShortfallMessage({
      quote,
      funding,
      target,
      solAmountText: `${solAmount} SOL`
    });
    setRhBridgeStatus(message, true);
    throw new Error(message);
  }
  setSubmitting(true, `Bridging SOL for ${target.chainName} launch...`);
  setRhBridgeStatus(
    `Attached ${target.shortName} wallet needs ${target.nativeSymbol}. Pump-r will ask Phantom to bridge ${solAmount} SOL, then launch from ${shortAddress(attached.address)} automatically.`
  );
  const bridge = await submitRhSolBridge({ waitForDelivery: true });
  setAlert(ui.alert, `Bridge ${shortAddress(bridge.signature)} delivered. Waiting for ${target.shortName} balance before launch...`);
  return await waitForAttachedRhFunding(details, { chainId: targetChainId });
}

async function launchPumpFun(details) {
  const { provider, publicKey } = await connectSolanaWallet();
  const solanaWeb3 = await loadSolanaWeb3();
  let signature = "";
  let devBuySignature = "";
  let kolBuySignature = "";
  let kolTransferSignature = "";
  let kolApplication = details.kolApplication || null;
  let finalizedLaunch = null;
  let launchRecordWarning = "";
  let payload = null;
  let mint = "";
  let pumpfunUrl = "";
  if (typeof provider.signTransaction === "function") {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      setAlert(
        ui.alert,
        attempt > 0
          ? "The previous Solana blockhash expired. Rebuilding a fresh Pump.fun transaction for Phantom..."
          : details.kolApplication?.enabled
            ? `Preparing Pump.fun launch with Manlet Mode for ${details.kolApplication.name}...`
            : "Preparing official Pump.fun SDK transaction..."
      );
      payload = await api.pumpfunLaunch({
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
        walletBroadcast: false,
        transactionFormat: "legacy",
        kolApplication: details.kolApplication || null
      });
      mint = String(payload?.mint || payload?.tokenAddress || payload?.token || "");
      pumpfunUrl = String(payload?.pumpfunUrl || payload?.url || (mint ? `https://pump.fun/coin/${mint}` : ""));
      const transactionBase64 = String(payload?.transactionBase64 || "");
      const signingToken = String(payload?.signingToken || "");
      if (!mint || !pumpfunUrl || !transactionBase64 || !signingToken) throw new Error("Pump.fun SDK did not return a complete transaction.");

      const suffix = String(payload?.mintSuffix || "");
      const suffixText = suffix
        ? ` Mint ${shortAddress(mint)} ends with ${suffix}.`
        : "";
      const useWalletBroadcast = Boolean(payload?.walletBroadcast) && typeof provider.signAndSendTransaction === "function";
      setAlert(ui.alert, `Open Phantom to ${useWalletBroadcast ? "sign and send" : "sign"}${attempt > 0 ? " again" : ""}.${suffixText} Pump-r is using the legacy Pump.fun create path; dev buy and Manlet Mode open as separate prompts after launch.`);
      const transaction = deserializeSolanaTransaction(solanaWeb3, transactionBase64, Boolean(payload?.versionedTransaction));
      const signedOrSent = useWalletBroadcast
        ? await provider.signAndSendTransaction(transaction)
        : await provider.signTransaction(transaction);
      setAlert(ui.alert, "Finalizing Pump.fun launch...");
      try {
        const walletSignature = useWalletBroadcast ? normalizeSolanaSignature(signedOrSent) : "";
        if (useWalletBroadcast && !walletSignature) throw new Error("Phantom did not return a transaction signature.");
        const finalized = await api.pumpfunFinalize({
          signingToken,
          signature: walletSignature,
          versionedTransaction: Boolean(payload?.versionedTransaction),
          signedTransactionBase64: useWalletBroadcast
            ? ""
            : serializeSignedSolanaTransaction(signedOrSent)
        });
        signature = String(finalized?.signature || "");
        finalizedLaunch = finalized?.launch || null;
        launchRecordWarning = String(finalized?.recordWarning || "");
        break;
      } catch (error) {
        if (attempt === 0 && isSolanaBlockhashExpiredError(error)) continue;
        throw error;
      }
    }
    const pumpFunHomeLaunchRow = () => ({
      ...(finalizedLaunch || {}),
      mint,
      name: details.name,
      symbol: details.symbol,
      description: details.description,
      imageUri: details.imageUri,
      creator: publicKey,
      kolApplication,
      devBuySignature,
      kolBuySignature,
      kolTransferSignature,
      pumpfunUrl,
      signature,
      metadataUri: payload?.metadataUri,
      createdAt: Number(finalizedLaunch?.createdAt || Math.floor(Date.now() / 1000))
    });
    cachePumpFunLaunchForHome(pumpFunHomeLaunchRow());
    syncPumpFunLaunchRecord(pumpFunHomeLaunchRow());

    if (Number(details.pumpfunDevBuySol || 0) > 0) {
      setAlert(ui.alert, `Token is live. Open Phantom again to buy ${details.pumpfunDevBuySol} SOL from the dev wallet.`);
      const devBuyPayload = await api.pumpfunDevBuy({
        mint,
        creatorWallet: details.pumpfunCreatorWallet || publicKey,
        userPublicKey: publicKey,
        buySol: String(details.pumpfunDevBuySol || 0)
      });
      const devBuyTransactionBase64 = String(devBuyPayload?.transactionBase64 || "");
      if (!devBuyTransactionBase64) throw new Error("Dev buy transaction was not returned.");
      const devBuyTransaction = solanaWeb3.Transaction.from(base64ToBytes(devBuyTransactionBase64));
      const signedDevBuy = await provider.signTransaction(devBuyTransaction);
      setAlert(ui.alert, "Broadcasting dev buy...");
      const devBuySent = await api.solanaSendTransaction({
        signedTransactionBase64: bytesToBase64(signedDevBuy.serialize({ requireAllSignatures: false, verifySignatures: false })),
        rpcUrl: devBuyPayload.rpcUrl,
        blockhash: devBuyPayload.blockhash,
        lastValidBlockHeight: devBuyPayload.lastValidBlockHeight
      });
      devBuySignature = String(devBuySent?.signature || "");
    }
    if (details.kolApplication?.enabled && Number(details.kolApplication.buySol || 0) > 0) {
      setAlert(ui.alert, `Open Phantom again to buy ${details.kolApplication.buySol} SOL for Manlet Mode. Pump-r will transfer those tokens to ${details.kolApplication.name} next.`);
      const kolPayload = await api.pumpfunKolBuy({
        mint,
        creatorWallet: details.pumpfunCreatorWallet || publicKey,
        userPublicKey: publicKey,
        kolApplication: details.kolApplication
      });
      const kolTransactionBase64 = String(kolPayload?.transactionBase64 || "");
      if (!kolTransactionBase64) throw new Error("Manlet Mode buy transaction was not returned.");
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
        setAlert(ui.alert, `Manlet Mode completed directly to ${details.kolApplication.name}.`);
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
    cachePumpFunLaunchForHome(pumpFunHomeLaunchRow());
    syncPumpFunLaunchRecord(pumpFunHomeLaunchRow());
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
  setAlert(ui.alert, `Pump.fun transaction sent${signature ? ` (${shortAddress(signature)})` : ""}${devBuySignature ? `; dev buy completed (${shortAddress(devBuySignature)})` : ""}${kolBuySignature ? `; token buy completed (${shortAddress(kolBuySignature)})` : ""}${kolTransferSignature ? `; token transfer sent (${shortAddress(kolTransferSignature)})` : ""}.${launchRecordWarning ? " Launch record is syncing because Supabase is busy." : ""} Redirecting...`);
  window.setTimeout(() => {
    window.location.href = ui.resultLink.href;
  }, 900);
  return { ...payload, signature, devBuySignature, kolBuySignature, kolTransferSignature };
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
    const useAttachedRhWallet = isSolFundingLaunchMode() && ui.rhAttachedAutoLaunch?.checked;
    if (!isPumpFunMode() && !isPumpVerseMode() && !useAttachedRhWallet && !confirmRobinhoodLiquidityChoice(details)) {
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
      await loadChainConfig(state.selectedChainId);
      state.selectedLaunchMode = String(state.selectedChainId);
      const ws = walletState();
      if (!useAttachedRhWallet && !ws.signer) throw new Error("Connect wallet first");
      if (useAttachedRhWallet) {
        await ensureAttachedRhFundingBeforeLaunch(details);
        setSubmitting(true, `Launching on ${chainNameForId(state.selectedChainId)}...`);
      }
      const result = useAttachedRhWallet
        ? await launchOnRobinhoodAttachedWallet(details, { showModal: true })
        : await launchOnChain(state.selectedChainId, details, { showModal: true });
      renderLaunchResults([result]);
      const directLaunch = directLaunchStyleSupported(state.selectedChainId) && isRobinhoodDirectLiquidityMode();
      setAlert(
        ui.alert,
        useAttachedRhWallet
          ? `${chainNameForId(result.chainId)} launch created from attached wallet ${shortAddress(result.attachedWallet || "")}`
          : directLaunch && details.starterBuyEth > 0n
          ? `${chainNameForId(result.chainId)} direct launch created with burned LP`
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
    renderAttachedRhWallet();
    syncRhBridgeRecipient();
    if (isSolFundingLaunchMode()) scheduleRhBridgeQuote();
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
  ui.launchStyleBondingBtn?.addEventListener("click", () => {
    setLaunchStyle("bonding", state.selectedChainId);
    renderChainSelector();
    updateLaunchMath({ source: "liquidity" });
  });
  ui.launchStyleDirectBtn?.addEventListener("click", () => {
    setLaunchStyle("direct", state.selectedChainId);
    if (ui.advancedDetails) {
      ui.advancedDetails.hidden = false;
      ui.advancedDetails.open = true;
    }
    renderChainSelector();
    updateLaunchMath({ source: "liquidity" });
    ui.devBuyEth?.focus?.();
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
