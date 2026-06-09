import { api } from "./api.js";
import {
  FACTORY_ABI,
  TOKEN_ABI,
  defaultUsername,
  disconnectWallet,
  ensureWalletChain,
  ethers,
  fetchEthUsdPrice,
  getPreferredChainId,
  hydrateFollowerCount,
  hydrateUserProfile,
  loadCachedFollowerCount,
  loadUserProfile,
  makeFallbackImage,
  makeFactoryContract,
  makePoolContract,
  parseUiError,
  saveUserProfile,
  sendTxWithFallback,
  setPreferredChainId,
  shortAddress,
  walletState
} from "./core.js";
import { initWalletControls, initWalletHubMenu, setAlert, setWalletLabel, showCopyToast } from "./ui.js";
import { initCoinSearchOverlay } from "./searchModal.js?v=20260505a";
import { initSupportWidget } from "./support.js";

const MIN_INITIAL_LIQUIDITY_ETH = 0;

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
  devBuyEth: document.getElementById("devBuyEth"),
  launchMcapUsd: document.getElementById("launchMcapUsd"),
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

function followerMetaText(count) {
  const numeric = Math.max(0, Number(count || 0));
  return `${numeric} ${numeric === 1 ? "follower" : "followers"}`;
}

function requiredMinLiquidityEth(address = walletState().address) {
  void address;
  return MIN_INITIAL_LIQUIDITY_ETH;
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
    const order = [1, 8453, 143, 101, 11155111, 31337];
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
  if (n === 101) return "Solana";
  return `Chain ${n}`;
}

function chainShortNameForId(chainId) {
  const n = Number(chainId || 0);
  if (n === 1) return "ETH";
  if (n === 8453) return "BASE";
  if (n === 143) return "MONAD";
  if (n === 101) return "SOL";
  return String(n);
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
  if (isPumpFunMode() && state.solanaWallet?.publicKey) {
    const publicKey = state.solanaWallet.publicKey;
    const username = `sol_${publicKey.slice(0, 6)}`;
    if (ui.profileMenuName) ui.profileMenuName.textContent = username;
    if (ui.profileMenuNameLarge) ui.profileMenuNameLarge.textContent = username;
    if (ui.profileMenuMeta) ui.profileMenuMeta.textContent = "Solana wallet connected";
    if (ui.signInBtn) ui.signInBtn.style.display = "none";
    if (ui.walletHubBtn) ui.walletHubBtn.style.display = "none";
    if (ui.profileMenuBtn) ui.profileMenuBtn.style.display = "inline-flex";
    if (ui.profileNav) ui.profileNav.href = "/profile";
    if (ui.profileNavSide) ui.profileNavSide.href = "/profile";
    if (ui.editProfileBtn) {
      ui.editProfileBtn.disabled = true;
      ui.editProfileBtn.style.opacity = "0.6";
      ui.editProfileBtn.style.cursor = "not-allowed";
    }
    if (ui.menuLogoutBtn) ui.menuLogoutBtn.textContent = "Disconnect Solana";
    setAvatarNode(ui.profileAvatar, "SOL", "");
    setAvatarNode(ui.profileAvatarLarge, "SOL", "");
    return;
  }
  const ws = walletState();
  const connected = Boolean(ws.signer && ws.address);
  const profile = connected ? loadUserProfile(ws.address) : { username: "Guest", bio: "", imageUri: "" };
  const username = profile.username || (connected ? defaultUsername(ws.address) : "Guest");
  const avatarText = connected ? username.slice(0, 2).toUpperCase() : "EP";
  const imageUri = connected ? profile.imageUri || "" : "";
  const profileHref = connected ? `/profile?address=${ws.address}` : "/profile";

  if (ui.profileMenuName) ui.profileMenuName.textContent = username;
  if (ui.profileMenuNameLarge) ui.profileMenuNameLarge.textContent = username;
  if (ui.profileMenuMeta) {
    if (connected) {
      const cachedFollowers = loadCachedFollowerCount(ws.address);
      ui.profileMenuMeta.textContent = followerMetaText(cachedFollowers ?? 0);
    } else {
      ui.profileMenuMeta.textContent = "Not connected";
    }
  }
  if (ui.signInBtn) ui.signInBtn.style.display = connected ? "none" : "inline-flex";
  if (ui.walletHubBtn) ui.walletHubBtn.style.display = connected ? "inline-flex" : "none";
  if (ui.profileMenuBtn) ui.profileMenuBtn.style.display = connected ? "inline-flex" : "none";
  if (!connected) {
    walletHub?.setOpen(false);
    setProfileMenuOpen(false);
  }
  setAvatarNode(ui.profileAvatar, avatarText, imageUri);
  setAvatarNode(ui.profileAvatarLarge, avatarText, imageUri);
  if (ui.profileNav) ui.profileNav.href = profileHref;
  if (ui.profileNavSide) ui.profileNavSide.href = profileHref;

  if (ui.editProfileBtn) {
    ui.editProfileBtn.disabled = !connected;
    ui.editProfileBtn.style.opacity = connected ? "1" : "0.6";
    ui.editProfileBtn.style.cursor = connected ? "pointer" : "not-allowed";
  }
  if (ui.menuLogoutBtn) {
    ui.menuLogoutBtn.textContent = connected ? "Log out" : "Connect wallet";
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
  ui.profileMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    walletHub?.setOpen(false);
    const isOpen = ui.profileMenu?.classList.contains("open");
    setProfileMenuOpen(!isOpen);
  });

  document.addEventListener("click", (event) => {
    if (!ui.profileMenu || !ui.profileMenuBtn) return;
    if (ui.profileMenu.contains(event.target) || ui.profileMenuBtn.contains(event.target)) return;
    setProfileMenuOpen(false);
  });

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

  ui.menuLogoutBtn?.addEventListener("click", () => {
    if (isPumpFunMode() && state.solanaWallet?.publicKey) {
      try {
        state.solanaWallet.provider?.disconnect?.();
      } catch {
        // optional wallet API
      }
      state.solanaWallet = null;
      setAlert(ui.alert, "Solana wallet disconnected");
      setProfileMenuOpen(false);
      updateProfileIdentity();
      return;
    }
    const ws = walletState();
    if (!ws.signer || !ws.address) {
      if (walletControls?.connect) {
        walletControls.connect();
      } else {
        ui.connectBtn?.click();
      }
      setProfileMenuOpen(false);
      return;
    }
    disconnectWallet();
    setWalletLabel(ui.walletLabel);
    if (ui.disconnectBtn?.style) ui.disconnectBtn.style.display = "none";
    setAlert(ui.alert, "Wallet disconnected");
    setProfileMenuOpen(false);
    updateProfileIdentity();
    walletHub?.refresh();
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
        ? `Optional starter buy market cap: ${formatUsd(economics.marketCapUsd)} (~${economics.marketCapEth.toFixed(4)} ${economics.quoteSymbol})`
        : "Bonding curve starts at the configured virtual reserve price.";
  }
  if (ui.launchMathSecondary) {
    ui.launchMathSecondary.textContent = "Launches stay on the bonding curve until the graduation target is reached.";
  }
  if (ui.launchMathTertiary) {
    ui.launchMathTertiary.textContent =
      economics.liquidityEth > 0 ? "Starter buy is sent as the first pool buy after launch." : "No starter buy selected.";
  }
  if (ui.launchMathQuaternary) {
    ui.launchMathQuaternary.textContent = `At your settings, 1 ${economics.quoteSymbol} starter buy estimates ${formatUsd(economics.oneEthMcapUsd)} market cap`;
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
    throw new Error(
      `Not enough ${state.config?.chainName || "network"} ETH. Need about ${formatEthAmount(required)} for launch fee${starterBuyEth > 0n ? " and starter buy" : ""}; wallet has ${formatEthAmount(balance)}.`
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

  if (!name || !symbol) throw new Error("Coin name and ticker are required");
  if (isPumpFunMode()) {
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
      throw new Error("Pump.fun tickers must be 2-10 letters/numbers.");
    }
    if (!ui.image.value.trim()) {
      throw new Error("Pump.fun launches require an uploaded image before launch.");
    }
  }
  if (!Number.isFinite(creatorAllocationPct) || creatorAllocationPct < 0) {
    throw new Error("Creator allocation must be 0 or higher");
  }
  if (creatorAllocationPct > 20) {
    throw new Error("Creator allocation must be 20% or lower.");
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
    starterBuyEth: ethers.parseUnits(initialLiquidityEthInput || "0", selectedQuoteAsset().decimals || 18),
    pumpfunCreatorWallet: ui.pumpfunCreatorWallet?.value?.trim?.() || ""
  };
}

async function launchOnChain(chainId, details, { showModal = true, quoteMode = selectedQuoteMode() } = {}) {
  const target = Number(chainId || 0);
  await loadChainConfig(target, quoteMode);
  state.selectedChainId = Number(state.config?.chainId || target);
  await ensureWalletChain(state.selectedChainId);
  await walletHub?.refresh();

  const factory = makeFactoryContract(state.config.factoryAddress);
  const launchFeeWei = BigInt(state.config?.deployment?.launchFeeWei || "0");
  const totalValue = launchFeeWei;
  await assertLaunchBalance({ launchFeeWei, starterBuyEth: selectedQuoteMode() === "usdc" ? 0n : details.starterBuyEth });

  const simulated = await factory.createLaunch.staticCall(
    details.name,
    details.symbol,
    details.imageUri,
    details.description,
    details.totalSupply,
    details.creatorBps,
    { value: totalValue }
  );

  const chainName = selectedQuoteMode() === "usdc" ? "Ethereum + USDC" : state.config.chainName || chainLabel(state.selectedChainId);
  if (launchFeeWei > 0n) {
    const launchFeeEth = Number(ethers.formatEther(launchFeeWei)).toFixed(6);
    setAlert(ui.alert, `Creating bonding-curve launch on ${chainName} (launch fee ${launchFeeEth} ETH)...`);
  } else {
    setAlert(ui.alert, `Creating bonding-curve launch on ${chainName}...`);
  }

  const tx = await sendTxWithFallback({
    label: `Create ${chainName} Bonding Launch`,
    populatedTx: factory.createLaunch.populateTransaction(
      details.name,
      details.symbol,
      details.imageUri,
      details.description,
      details.totalSupply,
      details.creatorBps,
      { value: totalValue }
    ),
    walletNativeSend: () =>
      factory.createLaunch(details.name, details.symbol, details.imageUri, details.description, details.totalSupply, details.creatorBps, {
        value: totalValue
      })
  });

  const receipt = await tx.wait();
  const launchInfo = extractLaunchCreated(receipt) || {
    launchId: simulated?.[0],
    token: simulated?.[1],
    pool: simulated?.[2]
  };

  if (details.starterBuyEth > 0n && launchInfo?.pool) {
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

function getSolanaProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solflare) return window.solflare;
  if (window.solana?.isPhantom) return window.solana;
  return window.phantom?.solana || window.solana || null;
}

async function connectSolanaWallet() {
  const provider = getSolanaProvider();
  if (!provider) {
    throw new Error("Install or enable a Solana wallet like Phantom or Solflare to launch on Pump.fun.");
  }
  const response = await provider.connect();
  const publicKey = response?.publicKey || provider.publicKey;
  const text = publicKey?.toBase58?.() || String(publicKey || "");
  if (!text) throw new Error("Solana wallet did not return a public key");
  state.solanaWallet = { provider, publicKey: text };
  updateProfileIdentity();
  return { provider, publicKey: text };
}

function base64ToBytes(value = "") {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function launchPumpFun(details) {
  const { provider, publicKey } = await connectSolanaWallet();
  const solanaWeb3 = await loadSolanaWeb3();
  setAlert(ui.alert, "Preparing official Pump.fun SDK transaction...");
  const payload = await api.pumpfunLaunch({
    name: details.name,
    symbol: details.symbol,
    description: details.description,
    imageUri: details.imageUri,
    totalSupply: details.totalSupply?.toString?.() || String(details.totalSupply || ""),
    creatorBps: details.creatorBps?.toString?.() || String(details.creatorBps || "0"),
    starterBuy: details.starterBuyEth?.toString?.() || "0",
    creatorWallet: details.pumpfunCreatorWallet || publicKey,
    userPublicKey: publicKey,
    source: "Pump-r"
  });
  const mint = String(payload?.mint || payload?.tokenAddress || payload?.token || "");
  const pumpfunUrl = String(payload?.pumpfunUrl || payload?.url || (mint ? `https://pump.fun/coin/${mint}` : ""));
  const transactionBase64 = String(payload?.transactionBase64 || "");
  if (!mint || !pumpfunUrl || !transactionBase64) throw new Error("Pump.fun SDK did not return a complete transaction.");

  setAlert(ui.alert, "Open your Solana wallet to sign the Pump.fun token creation transaction. Pump-r will broadcast it through the configured Solana RPC.");
  const transaction = solanaWeb3.Transaction.from(base64ToBytes(transactionBase64));
  let signature = "";
  if (typeof provider.signTransaction === "function") {
    const rpcUrl = String(payload?.rpcUrl || "https://sparkling-blue-sponge.solana-mainnet.quiknode.pro/1a7f99d93cb6940285e9a095de8fc546c3c76d35/");
    const connection = new solanaWeb3.Connection(rpcUrl, "confirmed");
    const signed = await provider.signTransaction(transaction);
    signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(
      {
        signature,
        blockhash: payload.blockhash,
        lastValidBlockHeight: payload.lastValidBlockHeight
      },
      "confirmed"
    );
  } else if (typeof provider.signAndSendTransaction === "function") {
    const sent = await provider.signAndSendTransaction(transaction);
    signature = sent?.signature || String(sent || "");
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
  setAlert(ui.alert, `Pump.fun transaction sent${signature ? ` (${shortAddress(signature)})` : ""}. Redirecting...`);
  window.setTimeout(() => {
    window.location.href = ui.resultLink.href;
  }, 900);
  return { ...payload, signature };
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
      setAlert(ui.alert, details.starterBuyEth > 0n ? "Bonding-curve launch created with starter buy" : "Bonding-curve launch created");
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

  walletHub = initWalletHubMenu({
    triggerEl: ui.walletHubBtn,
    menuEl: ui.walletHubMenu,
    balanceEl: ui.walletHubBalance,
    balanceLargeEl: ui.walletHubBalanceLarge,
    nativeEl: ui.walletHubNative,
    addressBtnEl: ui.walletHubAddressBtn,
    historyLinkEl: ui.walletHubHistoryLink,
    depositBtnEl: ui.walletHubDepositBtn,
    tradeLinkEl: ui.walletHubTradeLink,
    buyLinkEl: ui.walletHubBuyLink,
    depositModalEl: ui.depositModal,
    depositCloseBtnEl: ui.depositCloseBtn,
    depositCopyBtnEl: ui.depositCopyBtn,
    depositAddressEl: ui.depositAddressText,
    depositQrEl: ui.depositQrImage,
    alertEl: ui.alert,
    onOpen: () => setProfileMenuOpen(false)
  });

  walletControls = initWalletControls({
    selectEl: ui.walletSelect,
    connectBtn: ui.connectBtn,
    disconnectBtn: ui.disconnectBtn,
    labelEl: ui.walletLabel,
    alertEl: ui.alert,
    onConnected: async () => {
      await ensureWalletChain(state.selectedChainId);
      updateProfileIdentity();
      setProfileMenuOpen(false);
      syncLiquidityInputMin();
      updateLaunchMath({ source: "liquidity" });
      await walletHub?.refresh();
    }
  });

  ui.disconnectBtn?.addEventListener("click", () => {
    updateProfileIdentity();
    setProfileMenuOpen(false);
    syncLiquidityInputMin();
    updateLaunchMath({ source: "liquidity" });
    walletHub?.refresh();
  });

  ui.connectBtn?.addEventListener("click", () => {
    setTimeout(() => {
      updateProfileIdentity();
      syncLiquidityInputMin();
      updateLaunchMath({ source: "liquidity" });
      walletHub?.refresh();
    }, 20);
  });

  ui.walletSelect?.addEventListener("change", () => {
    setTimeout(() => {
      updateProfileIdentity();
      syncLiquidityInputMin();
      updateLaunchMath({ source: "liquidity" });
      walletHub?.refresh();
    }, 20);
  });

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

  ui.signInBtn?.addEventListener("click", () => {
    if (isPumpFunMode()) {
      connectSolanaWallet().catch((err) => setAlert(ui.alert, parseUiError(err), true));
      return;
    }
    if (walletControls?.connect) {
      walletControls.connect();
      return;
    }
    ui.connectBtn?.click();
  });

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
