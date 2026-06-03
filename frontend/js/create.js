import { api } from "./api.js";
import {
  FACTORY_ABI,
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
  selectedLaunchMode: "1",
  supportedChains: [],
  ethUsd: 3000,
  lastPumpVerseDetails: null,
  lastPumpVerseResults: []
};
const LAUNCH_CHAIN_CHOICES = [
  { chainId: 1, name: "Ethereum", shortName: "ETH", networkLabel: "Mainnet" },
  { chainId: 8453, name: "Base", shortName: "BASE", networkLabel: "Mainnet" },
  {
    mode: "pumpverse",
    name: "PumpVerse",
    shortName: "ETH + BASE",
    networkLabel: "Multiverse launch",
    requiredChains: [1, 8453]
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
  return [...map.values()].sort((a, b) => a.chainId - b.chainId);
}

function selectedChain() {
  return state.supportedChains.find((row) => Number(row.chainId) === Number(state.selectedChainId)) || state.supportedChains[0] || null;
}

function isPumpVerseMode() {
  return state.selectedLaunchMode === "pumpverse";
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

function renderChainSelector() {
  const current = selectedChain();
  const supported = configuredChainMap();
  const baseConfigured = supported.has(8453);
  if (ui.launchChainLabel) {
    ui.launchChainLabel.textContent = isPumpVerseMode()
      ? "PumpVerse"
      : current?.name || state.config?.chainName || "Ethereum";
  }
  if (ui.netChip && state.config) {
    ui.netChip.textContent = state.config.chainShortName || `Chain ${state.config.chainId}`;
  }
  if (ui.factoryChip && state.config?.factoryAddress) {
    ui.factoryChip.textContent = shortAddress(state.config.factoryAddress);
  }
  if (ui.launchChainHint) {
    ui.launchChainHint.textContent = isPumpVerseMode()
      ? "PumpVerse launches the same token details on Ethereum and Base. MetaMask will ask for separate confirmations."
      : baseConfigured
      ? "Wallet will switch to the selected network before launch."
      : "Base launches are ready once the Base factory address is configured.";
  }
  if (!ui.launchChainOptions) return;
  ui.launchChainOptions.innerHTML = LAUNCH_CHAIN_CHOICES
    .map((choice) => {
      const mode = choice.mode || String(choice.chainId);
      const requiredChains = Array.isArray(choice.requiredChains) ? choice.requiredChains : [choice.chainId];
      const enabled = requiredChains.every((chainId) => supported.has(Number(chainId)));
      const row = choice.chainId ? supported.get(choice.chainId) : null;
      const active = enabled && String(mode) === String(state.selectedLaunchMode);
      const chainAttr = choice.chainId ? `data-chain-id="${choice.chainId}"` : "";
      const description = choice.mode === "pumpverse"
        ? "ETH + BASE one guided flow"
        : `${row?.shortName || choice.shortName} ${choice.networkLabel}${enabled ? "" : " - configure factory"}`;
      return `
        <button class="create-chain-option${choice.mode === "pumpverse" ? " pumpverse" : ""}${active ? " active" : ""}${enabled ? "" : " disabled"}" type="button" ${chainAttr} data-launch-mode="${mode}" role="tab" aria-selected="${active ? "true" : "false"}" ${enabled ? "" : "disabled aria-disabled=\"true\""}>
          <strong>${row?.name || choice.name}</strong>
          <span>${description}</span>
        </button>
      `;
    })
    .join("");
}

async function loadChainConfig(chainId = state.selectedChainId) {
  const next = await api.config({ chainId });
  state.config = next;
  state.selectedChainId = Number(next.chainId || chainId || 1);
  state.supportedChains = normalizeSupportedChains(next);
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
    setAlert(ui.alert, `${target === 8453 ? "Base" : "Selected network"} factory is not configured yet.`, true);
    return;
  }
  try {
    setAlert(ui.alert, `Loading ${target === 8453 ? "Base" : "Ethereum"} launch settings...`);
    await loadChainConfig(target);
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

async function selectPumpVerseMode() {
  const supported = configuredChainMap();
  if (!supported.has(1) || !supported.has(8453)) {
    setAlert(ui.alert, "PumpVerse needs both Ethereum and Base factories configured.", true);
    return;
  }
  state.selectedChainId = 1;
  state.selectedLaunchMode = "pumpverse";
  await loadChainConfig(1);
  state.selectedLaunchMode = "pumpverse";
  renderChainSelector();
  setAlert(ui.alert, "PumpVerse selected. One form will launch on Ethereum and Base.");
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
      const uploaded = await api.uploadImage(dataUrl);
      pendingProfileImageUri = uploaded.url;
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

  const creatorFraction = Math.min(Math.max(creatorPct / 100, 0), 0.9999);
  const poolFraction = Math.max(0.0001, 1 - creatorFraction);
  const poolTokens = totalSupply * poolFraction;
  const mcapMultiplier = poolTokens > 0 ? totalSupply / poolTokens : 0;

  const marketCapEth = liquidityEth > 0 ? liquidityEth * mcapMultiplier : 0;
  const marketCapUsd = marketCapEth * ethUsd;
  const oneEthMcapUsd = mcapMultiplier * ethUsd;
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
        ? `Optional starter buy market cap: ${formatUsd(economics.marketCapUsd)} (~${economics.marketCapEth.toFixed(4)} ETH)`
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
    ui.launchMathQuaternary.textContent = `At your settings, 1 ETH starter buy estimates ${formatUsd(economics.oneEthMcapUsd)} market cap`;
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
  if (n === 8453) return "Base";
  if (n === 1) return "Ethereum";
  return `Chain ${n}`;
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
      const label = chainLabel(row.chainId);
      const href = ok ? `/token?token=${encodeURIComponent(row.token)}&chainId=${encodeURIComponent(String(row.chainId))}` : "#";
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

function showCreatedModal({ name, symbol, token, chainId = state.selectedChainId }) {
  if (!ui.createdModal || !token) return;
  ui.createdTokenName.textContent = `${name} ($${symbol})`;
  ui.createdTokenAddress.textContent = token;
  ui.openTokenBtn.href = `/token?token=${token}&chainId=${chainId}`;
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
    const uploaded = await api.uploadImage(imageUri);
    imageUri = uploaded.url;
    ui.image.value = imageUri;
  }

  if (imageUri.startsWith("data:image/")) {
    imageUri = `${window.location.origin}/assets/etherpump-logo.png`;
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
    starterBuyEth: ethers.parseEther(initialLiquidityEthInput || "0")
  };
}

async function launchOnChain(chainId, details, { showModal = true } = {}) {
  const target = Number(chainId || 0);
  await loadChainConfig(target);
  state.selectedChainId = Number(state.config?.chainId || target);
  await ensureWalletChain(state.selectedChainId);
  await walletHub?.refresh();

  const factory = makeFactoryContract(state.config.factoryAddress);
  const launchFeeWei = BigInt(state.config?.deployment?.launchFeeWei || "0");
  const totalValue = launchFeeWei;
  await assertLaunchBalance({ launchFeeWei, starterBuyEth: details.starterBuyEth });

  const simulated = await factory.createLaunch.staticCall(
    details.name,
    details.symbol,
    details.imageUri,
    details.description,
    details.totalSupply,
    details.creatorBps,
    { value: totalValue }
  );

  const chainName = state.config.chainName || chainLabel(state.selectedChainId);
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
    const buyTx = await sendTxWithFallback({
      label: `${chainName} Starter Bonding Buy`,
      populatedTx: pool.buy.populateTransaction(minTokensOut, { value: details.starterBuyEth }),
      walletNativeSend: () => pool.buy(minTokensOut, { value: details.starterBuyEth })
    });
    await buyTx.wait();
  }

  if (launchInfo?.token) {
    ui.resultLink.href = `/token?token=${launchInfo.token}&chainId=${state.selectedChainId}`;
    ui.resultLink.textContent = `Open ${chainName} ${shortAddress(launchInfo.token)} token page`;
    ui.resultLink.style.display = "inline-block";
    if (showModal) {
      showCreatedModal({ name: details.name, symbol: details.symbol, token: launchInfo.token, chainId: state.selectedChainId });
    }
  }

  return {
    ok: true,
    chainId: state.selectedChainId,
    token: launchInfo?.token || "",
    pool: launchInfo?.pool || "",
    launchId: launchInfo?.launchId
  };
}

async function launchPumpVerse(details) {
  const targets = [1, 8453];
  const results = [];
  state.lastPumpVerseDetails = details;
  state.lastPumpVerseResults = results;
  renderLaunchResults(results);

  for (const chainId of targets) {
    try {
      setSubmitting(true, `Launching ${chainLabel(chainId)}...`);
      setAlert(ui.alert, `PumpVerse: launching on ${chainLabel(chainId)}...`);
      const result = await launchOnChain(chainId, details, { showModal: false });
      results.push(result);
      state.lastPumpVerseResults = [...results];
      renderLaunchResults(results);
    } catch (error) {
      results.push({ ok: false, chainId, error: parseUiError(error) });
      state.lastPumpVerseResults = [...results];
      renderLaunchResults(results);
      break;
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
      `PumpVerse partially completed: ${successes.length}/2 launched. ${chainLabel(failures[0].chainId)} failed: ${failures[0].error}`,
      true
    );
    return results;
  }
  setAlert(ui.alert, "PumpVerse launch complete on Ethereum and Base.");
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
    const result = await launchOnChain(target, details, { showModal: false });
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
    setSubmitting(true, isPumpVerseMode() ? "Launching PumpVerse..." : "Launching...");
    renderLaunchResults([]);
    if (ui.resultLink) {
      ui.resultLink.style.display = "none";
      ui.resultLink.removeAttribute("href");
      ui.resultLink.textContent = "";
    }

    const ws = walletState();
    if (!ws.signer) throw new Error("Connect wallet first");
    const details = await prepareLaunchDetails();
    const pumpVerse = isPumpVerseMode();
    if (pumpVerse) {
      const results = await launchPumpVerse(details);
      if (results.some((row) => !row.ok)) {
        return;
      }
    } else {
      await loadChainConfig(state.selectedChainId);
      state.selectedLaunchMode = String(state.selectedChainId);
      const result = await launchOnChain(state.selectedChainId, details, { showModal: true });
      renderLaunchResults([result]);
      setAlert(ui.alert, details.starterBuyEth > 0n ? "Bonding-curve launch created with starter buy" : "Bonding-curve launch created");
    }

    ui.createForm.reset();
    updatePreview();
    updateLaunchMath({ source: "liquidity" });
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
    if (button.dataset.launchMode === "pumpverse") {
      selectPumpVerseMode();
      return;
    }
    selectLaunchChain(button.dataset.chainId);
  });

  ui.launchResultList?.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-retry-chain]");
    if (!button) return;
    retryPumpVerseChain(button.dataset.retryChain);
  });

  window.addEventListener("etherpump:chainChanged", (event) => {
    const nextChainId = Number(event?.detail?.chainId || 0);
    if (!Number.isFinite(nextChainId) || nextChainId <= 0) return;
    const supported = state.supportedChains.some((row) => Number(row.chainId) === nextChainId);
    if (supported) {
      loadChainConfig(nextChainId).catch((err) => setAlert(ui.alert, parseUiError(err), true));
    }
  });

  ui.signInBtn?.addEventListener("click", () => {
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
