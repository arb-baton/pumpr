import { api } from "./api.js";
import {
  defaultUsername,
  connectSocialWallet,
  disconnectWallet,
  exportGeneratedWalletPrivateKey,
  fetchEthUsdPrice,
  ethers,
  formatCompactUsd,
  formatToken,
  hydrateFollowerCount,
  hydrateUserProfile,
  hydrateUserProfiles,
  loadCachedFollowerCount,
  loadUserProfile,
  makeTokenContract,
  parseUiError,
  resolveCoinImage,
  saveUserProfile,
  sendTxWithFallback,
  setPreferredChainId,
  shortAddress,
  weiToUsd,
  walletState
} from "./core.js";
import { initWalletControls, initWalletHubMenu, setAlert, setWalletLabel, showCopyToast } from "./ui.js";
import { initCoinSearchOverlay, recordViewedLaunch } from "./searchModal.js?v=20260505a";
import { initSupportWidget } from "./support.js";

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const CLAIM_MIN_USD = 8;
const SOCIAL_AUTH_KEY = "pumpr.social.session.v1";

async function ensurePumpRHolderPaymentAccess(address) {
  const eligibility = await api.holderEligibility({ address });
  if (eligibility?.required === false) return eligibility;
  if (!eligibility?.configured) {
    throw new Error("Official Pump-r token is not configured yet. Set PUMPR_TOKEN_ADDRESS and PUMPR_TOKEN_CHAIN_ID before enabling creator payments.");
  }
  if (eligibility.required !== false && !eligibility.eligibleToLaunch) {
    const symbol = String(eligibility.symbol || "PUMPR").replace(/^\$/, "").toUpperCase();
    const chain = String(eligibility.chainShortName || eligibility.chainName || "configured chain");
    throw new Error(`Hold $${symbol} in your ${chain} wallet to receive creator payments. 1%+ holders will also be eligible for later airdrops.`);
  }
  return eligibility;
}

const ui = {
  walletSelect: document.getElementById("walletChoice"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  walletLabel: document.getElementById("walletAddress"),
  alert: document.getElementById("alert"),
  signInBtn: document.getElementById("signInBtn"),
  netChip: document.getElementById("networkChip"),
  factoryChip: document.getElementById("factoryChip"),
  profileNav: document.getElementById("profileNav"),
  profileNavSide: document.getElementById("profileNavSide"),
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
  editProfileBtn: document.getElementById("editProfileBtn"),
  menuLogoutBtn: document.getElementById("menuLogoutBtn"),
  profileAddressInput: document.getElementById("profileAddressInput"),
  profileResolvedName: document.getElementById("profileResolvedName"),
  profileResolvedAddress: document.getElementById("profileResolvedAddress"),
  profileResolvedBio: document.getElementById("profileResolvedBio"),
  profileCopyAddressBtn: document.getElementById("profileCopyAddressBtn"),
  profileEtherscanLink: document.getElementById("profileEtherscanLink"),
  profileExportKeyBtn: document.getElementById("profileExportKeyBtn"),
  profileHeroAvatar: document.getElementById("profileHeroAvatar"),
  profileFollowBtn: document.getElementById("profileFollowBtn"),
  statFollowers: document.getElementById("statFollowers"),
  statFollowing: document.getElementById("statFollowing"),
  statCreated: document.getElementById("statCreated"),
  statValue: document.getElementById("statValue"),
  createdCountInline: document.getElementById("createdCountInline"),
  createdMiniList: document.getElementById("createdMiniList"),
  profileTabsWrap: document.getElementById("profileTabs"),
  profileTabButtons: Array.from(document.querySelectorAll("[data-tab]")),
  profileTabContent: document.getElementById("profileTabContent"),
  privateKeyModal: document.getElementById("privateKeyModal"),
  privateKeyCloseBtn: document.getElementById("privateKeyCloseBtn"),
  privateKeyDoneBtn: document.getElementById("privateKeyDoneBtn"),
  privateKeyCopyBtn: document.getElementById("privateKeyCopyBtn"),
  privateKeyValue: document.getElementById("privateKeyValue"),
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

const state = {
  address: "",
  payload: null,
  pendingProfileImageUri: "",
  activeTab: "balances",
  ethUsd: 3000,
  chainId: 1,
  supportConfig: null,
  socialLoaded: false,
  socialLoading: false,
  isFollowingProfile: false,
  followBusy: false,
  profileLoading: false,
  profileLoadSeq: 0
};
let walletHub = null;
let walletControls = null;

function readSocialAuthSession() {
  try {
    const raw = localStorage.getItem(SOCIAL_AUTH_KEY);
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.type === "x" && parsed.username) return parsed;
    if (parsed.type === "email" && parsed.email) return parsed;
  } catch {
    // ignore corrupt social session
  }
  return null;
}

function saveSocialAuthSession(value = {}) {
  try {
    localStorage.setItem(SOCIAL_AUTH_KEY, JSON.stringify({ ...value, createdAt: Date.now() }));
  } catch {
    // ignore storage failures
  }
}

function clearSocialAuthSession() {
  try {
    localStorage.removeItem(SOCIAL_AUTH_KEY);
  } catch {
    // ignore storage failures
  }
}

function decodeBase64UrlJson(value = "") {
  try {
    const text = String(value || "");
    if (!text) return null;
    const padded = `${text}${"=".repeat((4 - (text.length % 4)) % 4)}`;
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function followerMetaText(count) {
  const numeric = Math.max(0, Number(count || 0));
  return `${numeric} ${numeric === 1 ? "follower" : "followers"}`;
}

const COPY_PILL_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2"></rect>
    <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path>
  </svg>
`;

function creatorHandle(address) {
  if (!address) return "anon";
  const profile = loadUserProfile(address);
  return profile.username || defaultUsername(address);
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function humanAgo(timestampSec) {
  const ts = Number(timestampSec || 0) * 1000;
  if (!ts) return "-";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function normalizeAddress(input) {
  try {
    return ethers.getAddress((input || "").trim());
  } catch {
    return "";
  }
}

function normalizeSolanaAddress(input = "") {
  const text = String(input || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : "";
}

function normalizeProfileAddress(input = "") {
  return normalizeAddress(input) || normalizeSolanaAddress(input);
}

function isSolanaProfileAddress(input = "") {
  const text = String(input || "").trim();
  return Boolean(text && !normalizeAddress(text) && normalizeSolanaAddress(text));
}

function defaultProfileUsername(address = "") {
  const sol = normalizeSolanaAddress(address);
  if (sol && !normalizeAddress(address)) return `sol_${sol.slice(0, 6)}`;
  return defaultUsername(address);
}

function profileHrefForAddress(value) {
  const normalized = normalizeProfileAddress(value);
  return normalized ? `/profile?address=${encodeURIComponent(normalized)}` : "/profile";
}

function connectedAddress() {
  return normalizeAddress(walletState().address || "");
}

function viewingOwnProfile() {
  const viewer = connectedAddress();
  if (!viewer) return false;
  const candidates = [
    state.address,
    state.payload?.address,
    state.payload?.profile?.address,
    getAddressFromUrl()
  ]
    .map((value) => normalizeAddress(value || ""))
    .filter(Boolean);

  if (!candidates.length) return false;
  return candidates.some((address) => address.toLowerCase() === viewer.toLowerCase());
}

async function copyText(value) {
  await navigator.clipboard.writeText(String(value || ""));
}

function getAddressFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("address") || "";
}

function updateQuery(address) {
  const url = new URL(window.location.href);
  if (address) {
    url.searchParams.set("address", address);
  } else {
    url.searchParams.delete("address");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function setAvatar(node, text, imageUri = "") {
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

function ensureProfileExportKeyButton() {
  if (ui.profileExportKeyBtn) return ui.profileExportKeyBtn;
  const row = document.querySelector(".profile-address-row");
  if (!row) return null;
  const button = document.createElement("button");
  button.id = "profileExportKeyBtn";
  button.className = "addr-copy-btn copy-pill-btn";
  button.type = "button";
  button.hidden = true;
  button.textContent = "Export key";
  row.appendChild(button);
  ui.profileExportKeyBtn = button;
  setupGeneratedKeyExportButton(button);
  return button;
}

function hidePrivateKeyModal() {
  if (!ui.privateKeyModal) return;
  ui.privateKeyModal.classList.remove("open");
  ui.privateKeyModal.setAttribute("aria-hidden", "true");
  if (ui.privateKeyValue) ui.privateKeyValue.value = "";
}

function showPrivateKeyModal(value = "") {
  if (!ui.privateKeyModal || !ui.privateKeyValue) return;
  ui.privateKeyValue.value = String(value || "");
  ui.privateKeyModal.classList.add("open");
  ui.privateKeyModal.setAttribute("aria-hidden", "false");
  ui.privateKeyValue.focus();
  ui.privateKeyValue.select();
}

function setupGeneratedKeyExportButton(button) {
  if (!button || button.dataset.boundExportKey === "true") return;
  button.dataset.boundExportKey = "true";
  button.addEventListener("click", async () => {
    try {
      showPrivateKeyModal(exportGeneratedWalletPrivateKey());
    } catch (error) {
      setAlert(ui.alert, parseUiError(error), true);
    }
  });
}

function setProfileMenuOpen(open) {
  if (!ui.profileMenu || !ui.profileMenuBtn) return;
  ui.profileMenu.classList.toggle("open", open);
  ui.profileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function hideEditProfileModal() {
  if (!ui.editProfileModal) return;
  ui.editProfileModal.classList.remove("open");
  ui.editProfileModal.setAttribute("aria-hidden", "true");
}

function updateEditAvatarPreview(text = "EP", imageUri = "") {
  setAvatar(ui.editAvatarPreview, text, imageUri);
}

function displayNameForAddress(address) {
  if (!address) return "unknown";
  const profile = loadUserProfile(address);
  return profile.username || creatorHandle(address);
}

function generatedWalletDisplayForAddress(address = "") {
  const generated = walletState().generatedWallet || null;
  const normalized = normalizeSolanaAddress(address);
  if (!generated?.address || !normalized || generated.address !== normalized) return null;
  const name = String(generated.name || (generated.username ? `@${generated.username}` : "") || generated.email || "").trim();
  return {
    ...generated,
    name: name || `sol_${generated.address.slice(0, 6)}`,
    meta: generated.type === "x" && generated.username
      ? `@${generated.username}`
      : generated.type === "email"
        ? "Email connected"
        : "Generated Solana wallet",
    avatarText: generated.type === "x" ? "X" : (name || "SOL").slice(0, 2).toUpperCase(),
    imageUri: String(generated.image || "")
  };
}

function updateProfileIdentity() {
  const ws = walletState();
  const evmConnected = Boolean(ws.signer && ws.address);
  const generatedConnected = Boolean(ws.generatedWallet?.address);
  const generatedDisplay = generatedConnected ? generatedWalletDisplayForAddress(ws.generatedWallet.address) : null;
  const solanaConnected = Boolean(ws.solanaAddress);
  const social = readSocialAuthSession();
  const socialConnected = Boolean(!evmConnected && !solanaConnected && social);
  const connected = evmConnected || solanaConnected || socialConnected;
  const profile = evmConnected ? loadUserProfile(ws.address) : { username: "Guest", imageUri: "", bio: "" };
  const username = generatedDisplay
    ? generatedDisplay.name
    : solanaConnected && !evmConnected
    ? `sol_${String(ws.solanaAddress).slice(0, 6)}`
    : evmConnected
      ? profile.username || defaultUsername(ws.address)
      : socialConnected
        ? social.type === "x"
          ? social.name || `@${social.username}`
          : social.name || social.email
      : "Guest";
  const avatarText = generatedDisplay ? generatedDisplay.avatarText : solanaConnected && !evmConnected ? "SOL" : socialConnected && social.type === "x" ? "X" : connected ? username.slice(0, 2).toUpperCase() : "EP";
  const imageUri = generatedDisplay ? generatedDisplay.imageUri : evmConnected ? profile.imageUri || "" : socialConnected ? String(social.image || "") : "";
  const profileHref = evmConnected ? `/profile?address=${encodeURIComponent(ws.address)}` : solanaConnected ? `/profile?address=${encodeURIComponent(ws.generatedWallet?.address || ws.solanaAddress)}` : "/profile";

  if (ui.profileMenuName) ui.profileMenuName.textContent = username;
  if (ui.profileMenuNameLarge) ui.profileMenuNameLarge.textContent = username;
  if (ui.profileMenuMeta) {
    if (evmConnected) {
      const cachedFollowers = loadCachedFollowerCount(ws.address);
      ui.profileMenuMeta.textContent = followerMetaText(cachedFollowers ?? 0);
    } else if (solanaConnected) {
      ui.profileMenuMeta.textContent = generatedDisplay ? generatedDisplay.meta : "Solana wallet connected";
    } else if (socialConnected) {
      ui.profileMenuMeta.textContent = social.type === "x" ? `@${social.username}` : "Email connected";
    } else {
      ui.profileMenuMeta.textContent = "Not connected";
    }
  }
  if (ui.signInBtn) ui.signInBtn.style.display = connected ? "none" : "inline-flex";
  if (ui.walletHubBtn) ui.walletHubBtn.style.display = evmConnected || generatedConnected ? "inline-flex" : "none";
  if (ui.profileMenuBtn) ui.profileMenuBtn.style.display = connected ? "inline-flex" : "none";
  if (!evmConnected && !generatedConnected) {
    walletHub?.setOpen(false);
  }
  if (!connected) {
    setProfileMenuOpen(false);
  }
  if (ui.profileNav) ui.profileNav.href = profileHref;
  if (ui.profileNavSide) ui.profileNavSide.href = profileHref;
  setAvatar(ui.profileAvatar, avatarText, imageUri);
  setAvatar(ui.profileAvatarLarge, avatarText, imageUri);
  syncFollowButton();

  if (ui.editProfileBtn) {
    ui.editProfileBtn.disabled = !evmConnected;
    ui.editProfileBtn.style.opacity = evmConnected ? "1" : "0.6";
    ui.editProfileBtn.style.cursor = evmConnected ? "pointer" : "not-allowed";
  }

  if (ui.menuLogoutBtn) {
    ui.menuLogoutBtn.textContent = connected ? "Log out" : "Connect wallet";
  }

  if (evmConnected) {
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
        if (state.address && normalizeAddress(state.address) === normalizeAddress(currentAddress)) {
          renderProfileHeader(currentAddress);
        }
      }
    }).catch(() => {
      // ignore profile hydration failures
    });
  }

  if (state.address) {
    refreshFollowState().catch(() => {
      // ignore follow-state refresh failures
    });
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function toBigIntOrZero(value) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

function effectivePriceWeiFromPool(pool) {
  const graduated = Boolean(pool?.graduated) || String(pool?.priceSource || "").toLowerCase() === "dex";
  const effective = toBigIntOrZero(pool?.effectiveSpotPriceWei);
  if (effective > 0n) return effective;

  const marketCapWei = toBigIntOrZero(pool?.marketCapWei);
  const circulating = toBigIntOrZero(pool?.circulatingSupply);
  if (marketCapWei > 0n && circulating > 0n) {
    return (marketCapWei * 10n ** 18n) / circulating;
  }

  if (graduated) {
    // Avoid legacy bonding-curve fallback after DEX migration.
    return 0n;
  }

  const spot = toBigIntOrZero(pool?.spotPriceWei);
  return spot > 0n ? spot : 0n;
}

function computePortfolioValueWei(holdings) {
  return (holdings || []).reduce((sum, item) => {
    const bal = BigInt(item.holderBalance || "0");
    const price = effectivePriceWeiFromPool(item.pool);
    return sum + (bal * price) / 10n ** 18n;
  }, 0n);
}

function formatMcapUsd(weiLike) {
  return formatCompactUsd(weiToUsd(weiLike || "0", state.ethUsd));
}

function renderProfileHeader(address) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) {
    if (state.payload?.chainType === "social") {
      const profile = state.payload.profile || {};
      const username = String(profile.username || "Social profile");
      ui.profileResolvedName.textContent = username;
      if (ui.profileResolvedAddress) {
        ui.profileResolvedAddress.textContent = "";
        ui.profileResolvedAddress.hidden = true;
      }
      if (ui.profileResolvedBio) {
        const bioText = String(profile.bio || "").trim();
        ui.profileResolvedBio.textContent = bioText;
        ui.profileResolvedBio.hidden = !bioText;
      }
      if (ui.profileCopyAddressBtn) {
        ui.profileCopyAddressBtn.hidden = true;
        ui.profileCopyAddressBtn.dataset.copyAddress = "";
      }
      if (ui.profileEtherscanLink) {
        ui.profileEtherscanLink.hidden = true;
        ui.profileEtherscanLink.href = "#";
      }
      const exportBtn = ensureProfileExportKeyButton();
      if (exportBtn) exportBtn.hidden = true;
      setAvatar(ui.profileHeroAvatar, String(profile.avatarText || username).slice(0, 2).toUpperCase(), profile.imageUri || "");
      syncFollowButton();
      return;
    }
    ui.profileResolvedName.textContent = "Guest";
    if (ui.profileResolvedAddress) {
      ui.profileResolvedAddress.textContent = "";
      ui.profileResolvedAddress.hidden = true;
    }
    if (ui.profileResolvedBio) {
      ui.profileResolvedBio.textContent = "";
      ui.profileResolvedBio.hidden = true;
    }
    if (ui.profileCopyAddressBtn) {
      ui.profileCopyAddressBtn.hidden = true;
      ui.profileCopyAddressBtn.dataset.copyAddress = "";
    }
    if (ui.profileEtherscanLink) {
      ui.profileEtherscanLink.hidden = true;
      ui.profileEtherscanLink.href = "#";
    }
    const exportBtn = ensureProfileExportKeyButton();
    if (exportBtn) exportBtn.hidden = true;
    setAvatar(ui.profileHeroAvatar, "EP", "");
    syncFollowButton();
    return;
  }

  const isSolana = isSolanaProfileAddress(normalized);
  const generatedDisplay = isSolana ? generatedWalletDisplayForAddress(normalized) : null;
  const profile = generatedDisplay
    ? {
        username: generatedDisplay.name,
        bio: generatedDisplay.meta,
        imageUri: generatedDisplay.imageUri,
        avatarText: generatedDisplay.avatarText
      }
    : isSolana
      ? state.payload?.profile || { username: defaultProfileUsername(normalized), bio: "", imageUri: "" }
      : loadUserProfile(normalized);
  const username = profile.username || defaultProfileUsername(normalized);
  ui.profileResolvedName.textContent = username;
  if (ui.profileResolvedAddress) {
    ui.profileResolvedAddress.textContent = "";
    ui.profileResolvedAddress.hidden = true;
  }
  if (ui.profileResolvedBio) {
    const bioText = String(profile.bio || "").trim();
    ui.profileResolvedBio.textContent = bioText;
    ui.profileResolvedBio.hidden = !bioText;
  }
  if (ui.profileCopyAddressBtn) {
    ui.profileCopyAddressBtn.hidden = false;
    ui.profileCopyAddressBtn.dataset.copyAddress = normalized;
    ui.profileCopyAddressBtn.innerHTML = `${COPY_PILL_ICON}<span>${shortAddress(normalized)}</span>`;
  }
  if (ui.profileEtherscanLink) {
    const href = getAddressExplorerUrl(normalized, state.chainId);
    if (href) {
      ui.profileEtherscanLink.href = href;
      ui.profileEtherscanLink.textContent = isSolana ? "Solscan" : "Etherscan";
      ui.profileEtherscanLink.hidden = false;
    } else {
      ui.profileEtherscanLink.hidden = true;
      ui.profileEtherscanLink.href = "#";
    }
  }
  const exportBtn = ensureProfileExportKeyButton();
  if (exportBtn) exportBtn.hidden = !generatedDisplay;
  setAvatar(ui.profileHeroAvatar, generatedDisplay ? generatedDisplay.avatarText : isSolana ? "SOL" : username.slice(0, 2).toUpperCase(), profile.imageUri || "");
  syncFollowButton();
}

function syncFollowButton() {
  if (!ui.profileFollowBtn) return;
  const ws = walletState();
  const viewer = normalizeAddress(ws?.address || connectedAddress() || "");
  const target = normalizeAddress(
    ui.profileCopyAddressBtn?.dataset?.copyAddress ||
      state.payload?.profile?.address ||
      state.payload?.address ||
      state.address ||
      getAddressFromUrl()
  );
  if (isSolanaProfileAddress(state.address || getAddressFromUrl())) {
    ui.profileFollowBtn.hidden = true;
    ui.profileFollowBtn.style.display = "none";
    ui.profileFollowBtn.disabled = false;
    ui.profileFollowBtn.textContent = "Follow";
    ui.profileFollowBtn.dataset.mode = "";
    return;
  }
  const own = Boolean(viewer && target && viewer.toLowerCase() === target.toLowerCase()) || viewingOwnProfile();

  if (!target) {
    ui.profileFollowBtn.hidden = true;
    ui.profileFollowBtn.style.display = "none";
    ui.profileFollowBtn.disabled = false;
    ui.profileFollowBtn.textContent = "Follow";
    ui.profileFollowBtn.dataset.mode = "";
    return;
  }

  if (viewer && own) {
    ui.profileFollowBtn.hidden = false;
    ui.profileFollowBtn.style.display = "inline-flex";
    ui.profileFollowBtn.disabled = false;
    ui.profileFollowBtn.textContent = "Edit profile";
    ui.profileFollowBtn.dataset.mode = "edit";
    return;
  }

  if (!viewer) {
    ui.profileFollowBtn.hidden = true;
    ui.profileFollowBtn.style.display = "none";
    ui.profileFollowBtn.disabled = false;
    ui.profileFollowBtn.textContent = "Follow";
    ui.profileFollowBtn.dataset.mode = "";
    return;
  }

  ui.profileFollowBtn.hidden = false;
  ui.profileFollowBtn.style.display = "inline-flex";
  ui.profileFollowBtn.dataset.mode = "follow";
  ui.profileFollowBtn.disabled = state.followBusy;
  ui.profileFollowBtn.textContent = state.followBusy
    ? "Saving..."
    : state.isFollowingProfile
      ? "Unfollow"
      : "Follow";
}

async function refreshFollowState() {
  if (!ui.profileFollowBtn) return;
  const viewer = connectedAddress();
  const target = normalizeAddress(state.address || "");
  if (!viewer || !target || viewer.toLowerCase() === target.toLowerCase()) {
    state.isFollowingProfile = false;
    syncFollowButton();
    return;
  }

  try {
    const payload = await api.followState(viewer, target);
    state.isFollowingProfile = Boolean(payload?.isFollowing);
    if (state.payload) {
      state.payload.followersCount = Number(payload?.followersCount || state.payload.followersCount || 0);
      state.payload.followingCount = Number(payload?.followingCount || state.payload.followingCount || 0);
      state.payload.socialIncluded = true;
      setSummary(state.payload);
      if (state.activeTab === "followers") {
        await loadSocialIfNeeded();
      }
    }
  } catch {
    // no-op
  } finally {
    syncFollowButton();
  }
}

function setupAddressCopy() {
  setupGeneratedKeyExportButton(ui.profileExportKeyBtn);
  ui.profileCopyAddressBtn?.addEventListener("click", async () => {
    const address = String(ui.profileCopyAddressBtn?.dataset.copyAddress || "");
    if (!address) return;
    try {
      await copyText(address);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(ui.alert, "Could not copy wallet address", true);
    }
  });
  ui.privateKeyCloseBtn?.addEventListener("click", hidePrivateKeyModal);
  ui.privateKeyDoneBtn?.addEventListener("click", hidePrivateKeyModal);
  ui.privateKeyModal?.addEventListener("click", (event) => {
    if (event.target === ui.privateKeyModal) hidePrivateKeyModal();
  });
  ui.privateKeyCopyBtn?.addEventListener("click", async () => {
    const key = String(ui.privateKeyValue?.value || "");
    if (!key) return;
    try {
      await copyText(key);
      showCopyToast("Private key copied");
      setAlert(ui.alert, "Generated Solana private key copied. Store it somewhere secure.");
    } catch {
      setAlert(ui.alert, "Could not copy private key", true);
    }
  });
}

function getAddressExplorerUrl(address, chainId) {
  const id = Number(chainId || 0);
  if (!address) return "";
  if (isSolanaProfileAddress(address)) return `https://solscan.io/account/${address}`;
  if (id === 1) return `https://etherscan.io/address/${address}`;
  if (id === 11155111) return `https://sepolia.etherscan.io/address/${address}`;
  return "";
}

function isPumpFunProfileLaunch(item = {}) {
  const chain = String(item?.chainId || "").toLowerCase();
  const source = String(item?.source || "").toLowerCase();
  const url = String(item?.pumpfunUrl || item?.url || "").toLowerCase();
  return chain === "pumpfun" || source === "pumpfun" || url.includes("pump.fun/coin/");
}

function profileTokenHref(item = {}) {
  if (isPumpFunProfileLaunch(item)) {
    const mint = String(item?.mint || item?.token || "").trim();
    return String(item?.pumpfunUrl || (mint ? `https://pump.fun/coin/${encodeURIComponent(mint)}` : "https://pump.fun/")).trim();
  }
  return `/token?token=${encodeURIComponent(String(item?.token || ""))}`;
}

function profileTokenLinkAttrs(item = {}) {
  return isPumpFunProfileLaunch(item) ? 'target="_blank" rel="noopener noreferrer"' : "";
}

function formatProfileMarketCap(item = {}) {
  if (isPumpFunProfileLaunch(item)) {
    const usd = Math.max(Number(item?.marketCapUsd || 0), Number(item?.dexSnapshot?.marketCapUsd || 0), Number(item?.fdvUsd || 0));
    if (Number.isFinite(usd) && usd > 0) return formatCompactUsd(usd);
    const sol = Number(item?.marketCapSol || 0);
    if (Number.isFinite(sol) && sol > 0) return `${sol >= 1000 ? sol.toLocaleString(undefined, { maximumFractionDigits: 0 }) : sol.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`;
    return "Syncing";
  }
  return formatMcapUsd(item.pool?.marketCapWei || "0");
}

function renderCreatedMiniList(created = []) {
  if (!ui.createdMiniList) return;
  if (!created.length) {
    ui.createdMiniList.innerHTML = `<p class="muted">No created coins yet.</p>`;
    return;
  }

  ui.createdMiniList.innerHTML = created
    .slice(0, 6)
    .map((item) => {
      const image = resolveCoinImage(item);
      const href = profileTokenHref(item);
      const linkAttrs = profileTokenLinkAttrs(item);
      return `
        <a class="profile-mini-item" href="${href}" ${linkAttrs}>
          <img src="${image}" alt="${item.symbol}" />
          <div>
            <strong>${item.name}</strong>
            <span>$${item.symbol}</span>
          </div>
          <div class="profile-mini-metric">
            <b>${formatProfileMarketCap(item)}</b>
            <span>${humanAgo(item.createdAt)}</span>
          </div>
        </a>
      `;
    })
    .join("");
}

function renderBalancesTab(holdings = []) {
  if (!holdings.length) {
    return `<p class="muted">No balances found for this profile.</p>`;
  }

  const rows = holdings
    .sort((a, b) => Number(b.pool?.marketCapEth || 0) - Number(a.pool?.marketCapEth || 0))
    .map((item) => {
      const balance = BigInt(item.holderBalance || "0");
      const price = effectivePriceWeiFromPool(item.pool);
      const valueWei = (balance * price) / 10n ** 18n;
      const image = resolveCoinImage(item);
      return `
        <a class="profile-balance-row" href="/token?token=${item.token}">
          <div class="profile-balance-left">
            <img src="${image}" alt="${item.symbol}" />
            <div>
              <strong>${item.name}</strong>
              <span>${formatToken(item.holderBalance || "0", 18, 2)} ${item.symbol}</span>
            </div>
          </div>
          <div class="profile-balance-right">
            <b>${formatCompactUsd(weiToUsd(valueWei, state.ethUsd))}</b>
            <span>MC ${formatMcapUsd(item.pool?.marketCapWei || "0")}</span>
          </div>
        </a>
      `;
    })
    .join("");

  return `<div class="profile-balance-list">${rows}</div>`;
}

function renderCoinsTab(created = []) {
  if (!created.length) {
    return `<p class="muted">This profile has not created coins yet.</p>`;
  }

  return `
    <div class="coin-grid">
      ${created
        .map((item) => {
          const image = resolveCoinImage(item);
          const href = profileTokenHref(item);
          const linkAttrs = profileTokenLinkAttrs(item);
          const badge = isPumpFunProfileLaunch(item) ? "Pump.fun" : "PumpSwap";
          return `
            <article class="coin-card">
              <a href="${href}" class="coin-image-wrap" ${linkAttrs}>
                <img class="coin-image" src="${image}" alt="${item.symbol}" />
                <span class="coin-badge">${badge}</span>
              </a>
              <div class="coin-body">
                <div class="coin-head">
                  <h3><a href="${href}" ${linkAttrs}>${item.name}</a></h3>
                  <span>$${item.symbol}</span>
                </div>
                <div class="coin-stats">
                  <span>MC ${formatProfileMarketCap(item)}</span>
                  <span>Created ${humanAgo(item.createdAt)}</span>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderFollowersTab(payload) {
  if (!state.socialLoaded) {
    return `<p class="muted">${state.socialLoading ? "Loading followers..." : "Open this tab to load followers and following."}</p>`;
  }

  const followers = payload?.followers || [];
  const following = payload?.following || [];

  const renderFollowRow = (row, fallbackDetail) => {
    const detail = Array.isArray(row.details) && row.details.length ? row.details[0] : fallbackDetail;
    const interactions = Math.max(1, Number(row.interactions || 1));
    const address = normalizeAddress(row.address || "");
    const displayName = displayNameForAddress(address);
    const profile = loadUserProfile(address);
    const imageUri = String(profile.imageUri || "");
    const initials = String(displayName || "EP")
      .replace(/\s+/g, "")
      .slice(0, 2)
      .toUpperCase() || "EP";
    const avatarMarkup = imageUri
      ? `<span class="profile-follow-avatar with-image"><img src="${escapeHtml(imageUri)}" alt="${escapeHtml(displayName)}" loading="lazy" /></span>`
      : `<span class="profile-follow-avatar">${escapeHtml(initials)}</span>`;

    return `
      <a class="profile-follow-row" href="${profileHrefForAddress(address)}">
        <div class="profile-follow-left">
          ${avatarMarkup}
          <div>
            <strong>${escapeHtml(displayName)}</strong>
            <span>${escapeHtml(shortAddress(address))}</span>
          </div>
        </div>
        <div class="profile-follow-meta">
          <b>${interactions}x</b>
          <span>${escapeHtml(detail)}</span>
        </div>
      </a>
    `;
  };

  const followerHtml = followers.length
    ? followers
        .map((row) => renderFollowRow(row, "Follower"))
        .join("")
    : `<p class="muted">No followers detected yet.</p>`;

  const followingHtml = following.length
    ? following
        .map((row) => renderFollowRow(row, "Following"))
        .join("")
    : `<p class="muted">Not following anyone yet.</p>`;

  return `
    <div class="profile-follow-grid">
      <section>
        <h3>Followers</h3>
        ${followerHtml}
      </section>
      <section>
        <h3>Following</h3>
        ${followingHtml}
      </section>
    </div>
  `;
}

function renderCreatorRewardsTab(payload) {
  const created = payload?.created || [];
  if (!created.length) {
    return `<p class="muted">No created coins yet, so no creator rewards.</p>`;
  }

  const ws = walletState();
  const viewer = normalizeAddress(ws.address || "");
  let availableValueWeiTotal = 0n;
  let claimedValueWeiTotal = 0n;

  const rows = created
    .map((item) => {
      const claimWei = BigInt(item?.feeSnapshot?.creatorClaimableWei || "0");
      const claimedWei = BigInt(item?.feeSnapshot?.creatorClaimedWei || "0");
      const claimStr = formatToken(claimWei, 18, 4);
      const claimedStr = formatToken(claimedWei, 18, 4);
      const priceWei = effectivePriceWeiFromPool(item?.pool);
      const claimValueWei = priceWei > 0n ? (claimWei * priceWei) / 10n ** 18n : 0n;
      const claimedValueWei = priceWei > 0n ? (claimedWei * priceWei) / 10n ** 18n : 0n;
      availableValueWeiTotal += claimValueWei;
      claimedValueWeiTotal += claimedValueWei;

      const claimValueUsd = weiToUsd(claimValueWei, state.ethUsd);
      const claimUsd = formatCompactUsd(claimValueUsd);
      const claimedUsd = formatCompactUsd(weiToUsd(claimedValueWei, state.ethUsd));
      const creator = normalizeAddress(item?.creator || "");
      const claimReady = claimWei > 0n && claimValueUsd >= CLAIM_MIN_USD;
      const canClaim = claimReady && viewer && creator && viewer === creator;
      return `
        <article class="profile-reward-row">
          <div class="profile-reward-main">
            <strong>${item.name} (${item.symbol})</strong>
            <div class="profile-reward-breakdown">
              <span>Available to claim: ${claimStr} ${item.symbol} (~${claimUsd})</span>
              <span>Minimum to claim: $${CLAIM_MIN_USD} equivalent</span>
              <span>Already claimed: ${claimedStr} ${item.symbol} (~${claimedUsd})</span>
            </div>
          </div>
          ${
            canClaim
              ? `<button class="btn-primary tiny" data-claim-token="${item.token}">Claim</button>`
              : claimWei > 0n && viewer && creator && viewer === creator
                ? `<button class="btn-ghost tiny" type="button" disabled>Below minimum</button>`
              : `<a class="btn-ghost tiny" href="/token?token=${item.token}">Open</a>`
          }
        </article>
      `;
    })
    .join("");

  const totalAcrossUsd = formatCompactUsd(weiToUsd(availableValueWeiTotal + claimedValueWeiTotal, state.ethUsd));
  const availableUsd = formatCompactUsd(weiToUsd(availableValueWeiTotal, state.ethUsd));
  const claimedUsd = formatCompactUsd(weiToUsd(claimedValueWeiTotal, state.ethUsd));

  return `
    <section class="profile-reward-summary-grid">
      <article class="profile-reward-summary-card">
        <small>Total across all coins</small>
        <strong>${totalAcrossUsd}</strong>
      </article>
      <article class="profile-reward-summary-card">
        <small>Available to claim</small>
        <strong>${availableUsd}</strong>
      </article>
      <article class="profile-reward-summary-card">
        <small>Already claimed</small>
        <strong>${claimedUsd}</strong>
      </article>
    </section>
    <div class="profile-reward-list">${rows}</div>
  `;
}

async function ensureSupportConfig() {
  if (state.supportConfig) return state.supportConfig;
  try {
    state.supportConfig = await api.supportConfig();
  } catch {
    state.supportConfig = { platformAddress: "" };
  }
  return state.supportConfig;
}

function renderNotificationsList(messages = [], inboxMode = false) {
  if (!messages.length) {
    return `<p class="muted">No support messages yet.</p>`;
  }

  const rows = messages
    .map((row) => {
      const fromAddress = normalizeAddress(row?.fromAddress || "");
      const fromName = fromAddress ? (loadUserProfile(fromAddress).username || defaultUsername(fromAddress)) : "User";
      const tokenAddress = normalizeAddress(row?.tokenAddress || "");
      const label = inboxMode ? `From ${fromName}` : `To support`;
      return `
        <article class="profile-follow-row">
          <div class="profile-follow-meta">
            <strong>${escapeHtml(row?.subject || "Support request")}</strong>
            <span>${escapeHtml(label)} · ${escapeHtml(humanAgo(row?.createdAt || 0))}</span>
            <span>${escapeHtml(String(row?.body || ""))}</span>
            ${
              tokenAddress
                ? `<a class="profile-inline-link" href="/token?token=${tokenAddress}">Token ${escapeHtml(shortAddress(tokenAddress))}</a>`
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");

  return `<div class="profile-follow-list">${rows}</div>`;
}

async function loadNotificationsTab() {
  if (!ui.profileTabContent) return;
  ui.profileTabContent.innerHTML = `<p class="muted">Loading notifications...</p>`;

  const target = normalizeAddress(state.address || state.payload?.address || "");
  if (!target) {
    ui.profileTabContent.innerHTML = `<p class="muted">Load a profile to view notifications.</p>`;
    return;
  }

  const viewer = connectedAddress();
  const cfg = await ensureSupportConfig();
  const platformAddress = normalizeAddress(cfg?.platformAddress || "");
  const isPlatformProfile = Boolean(platformAddress && target.toLowerCase() === platformAddress.toLowerCase());
  const viewingOwn = Boolean(viewer && viewer.toLowerCase() === target.toLowerCase());
  const canViewInbox = isPlatformProfile && viewingOwn;

  if (!viewingOwn && !canViewInbox) {
    ui.profileTabContent.innerHTML = `<p class="muted">Notifications are private to the profile owner.</p>`;
    return;
  }

  try {
    let messages = [];
    if (canViewInbox) {
      const payload = await api.supportInbox(target);
      messages = Array.isArray(payload?.messages) ? payload.messages : [];
      ui.profileTabContent.innerHTML = `
        <section class="profile-reward-summary-grid">
          <article class="profile-reward-summary-card">
            <small>Support inbox</small>
            <strong>${messages.length}</strong>
          </article>
        </section>
        ${renderNotificationsList(messages, true)}
      `;
      return;
    }

    const payload = await api.supportMessages(target);
    messages = Array.isArray(payload?.messages) ? payload.messages : [];
    ui.profileTabContent.innerHTML = `
      <section class="profile-reward-summary-grid">
        <article class="profile-reward-summary-card">
          <small>Your support messages</small>
          <strong>${messages.length}</strong>
        </article>
      </section>
      ${renderNotificationsList(messages, false)}
    `;
  } catch (error) {
    ui.profileTabContent.innerHTML = `<p class="muted">${escapeHtml(String(error?.message || "Failed to load notifications"))}</p>`;
  }
}

function renderActiveTab() {
  const payload = state.payload;
  if (!payload) {
    ui.profileTabContent.innerHTML = `<p class="muted">Load a profile to see details.</p>`;
    return;
  }
  if (state.profileLoading) {
    ui.profileTabContent.innerHTML = `<p class="muted">Loading profile...</p>`;
    return;
  }

  if (state.activeTab === "balances") {
    ui.profileTabContent.innerHTML = renderBalancesTab(payload.holdings || []);
    return;
  }
  if (state.activeTab === "coins") {
    ui.profileTabContent.innerHTML = renderCoinsTab(payload.created || []);
    return;
  }
  if (state.activeTab === "followers") {
    ui.profileTabContent.innerHTML = renderFollowersTab(payload);
    return;
  }
  if (state.activeTab === "creatorRewards") {
    ui.profileTabContent.innerHTML = renderCreatorRewardsTab(payload);
    return;
  }
  loadNotificationsTab().catch(() => {
    ui.profileTabContent.innerHTML = `<p class="muted">Could not load notifications.</p>`;
  });
}

function updateTabButtons() {
  for (const button of ui.profileTabButtons) {
    const active = button.dataset.tab === state.activeTab;
    button.classList.toggle("active", active);
  }
}

async function loadSocialIfNeeded() {
  if (!state.payload || state.socialLoaded || state.socialLoading) return;
  if (isSolanaProfileAddress(state.payload.address)) return;
  const normalized = normalizeAddress(state.payload.address);
  if (!normalized) return;

  state.socialLoading = true;
  if (state.activeTab === "followers") {
    renderActiveTab();
  }

  try {
    const social = await api.profile(normalized, { includeSocial: true });
    const currentAddress = normalizeAddress(state.payload?.address || "");
    if (!currentAddress || currentAddress !== normalized) return;

    state.payload = {
      ...state.payload,
      followers: social.followers || [],
      following: social.following || state.payload.following || [],
      followersCount: social.followersCount,
      followingCount: social.followingCount,
      socialIncluded: true
    };
    state.socialLoaded = true;
    setSummary(state.payload);
  } finally {
    state.socialLoading = false;
    if (state.activeTab === "followers") {
      renderActiveTab();
    }
  }
}

function setupTabs() {
  for (const button of ui.profileTabButtons) {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab || "balances";
      updateTabButtons();
      renderActiveTab();
      if (state.activeTab === "followers") {
        loadSocialIfNeeded().catch(() => {
          setAlert(ui.alert, "Could not load followers right now", true);
        });
      }
    });
  }
}

function setupCreatorRewardsActions() {
  ui.profileTabContent?.addEventListener("click", async (event) => {
    const tokenLink = event.target.closest('a[href^="/token?token="]');
    if (tokenLink) {
      const href = new URL(tokenLink.href, window.location.origin);
      const tokenAddress = normalizeAddress(href.searchParams.get("token") || "");
      const launchRow = [...(state.payload?.created || []), ...(state.payload?.holdings || [])].find(
        (row) => normalizeAddress(row?.token || row?.tokenAddress || "") === tokenAddress
      );
      if (launchRow) recordViewedLaunch(launchRow);
      return;
    }

    const trigger = event.target.closest("[data-claim-token]");
    if (!trigger) return;
    const tokenAddress = normalizeAddress(trigger.dataset.claimToken || "");
    if (!tokenAddress) return;

    try {
      const ws = walletState();
      if (!ws.signer || !ws.address) {
        throw new Error("Connect wallet first");
      }
      await ensurePumpRHolderPaymentAccess(ws.address);
      trigger.disabled = true;
      setAlert(ui.alert, "Claiming creator rewards...");

      const token = makeTokenContract(tokenAddress);
      const claimableWei = BigInt((await token.creatorClaimable()).toString());
      const launchRow = (state.payload?.created || []).find((row) => normalizeAddress(row?.token || "") === tokenAddress);
      const priceWei = effectivePriceWeiFromPool(launchRow?.pool);
      const claimValueWei = priceWei > 0n ? (claimableWei * priceWei) / 10n ** 18n : 0n;
      const claimValueUsd = weiToUsd(claimValueWei, state.ethUsd);
      if (claimValueUsd < CLAIM_MIN_USD) {
        throw new Error(`Minimum claim is $${CLAIM_MIN_USD} equivalent`);
      }
      const tx = await sendTxWithFallback({
        label: "Claim Creator Fees",
        populatedTx: token.claimCreatorFees.populateTransaction(),
        walletNativeSend: () => token.claimCreatorFees()
      });
      await tx.wait();

      setAlert(ui.alert, "Creator rewards claimed");
      await loadProfile(state.address);
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    } finally {
      trigger.disabled = false;
    }
  });

  ui.createdMiniList?.addEventListener("click", (event) => {
    const tokenLink = event.target.closest('a[href^="/token?token="]');
    if (!tokenLink) return;
    const href = new URL(tokenLink.href, window.location.origin);
    const tokenAddress = normalizeAddress(href.searchParams.get("token") || "");
    const launchRow = (state.payload?.created || []).find(
      (row) => normalizeAddress(row?.token || row?.tokenAddress || "") === tokenAddress
    );
    if (launchRow) recordViewedLaunch(launchRow);
  });
}

async function handleSocialAuthReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("x");
  if (!status) return;

  if (status === "authorized") {
    const xUser = decodeBase64UrlJson(params.get("x_user")) || {};
    const social = {
      type: "x",
      id: String(xUser.id || ""),
      username: String(xUser.username || ""),
      name: String(xUser.name || xUser.username || "X user"),
      image: String(xUser.image || ""),
      followers: Math.max(0, Number(xUser.followers || 0) || 0)
    };
    saveSocialAuthSession(social);
    const connected = await connectSocialWallet(social);
    setAlert(ui.alert, `X connected. Generated Solana wallet: ${shortAddress(connected?.generatedWallet?.address || connected?.publicKey || "")}`);
  } else if (status === "failed" || status === "expired" || status === "cancelled") {
    setAlert(ui.alert, params.get("reason") || "X authorization failed", true);
  }

  params.delete("x");
  params.delete("x_user");
  params.delete("reason");
  const qs = params.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`);
}

function setSummary(payload) {
  const created = payload.created || [];
  const holdings = payload.holdings || [];
  const followersCount = Number(payload.followersCount || (payload.followers || []).length || 0);
  const followingCount = Number(payload.followingCount || (payload.following || []).length || 0);
  const valueWei = computePortfolioValueWei(holdings);

  if (ui.statFollowers) ui.statFollowers.textContent = String(followersCount);
  if (ui.statFollowing) ui.statFollowing.textContent = String(followingCount);
  if (ui.statCreated) ui.statCreated.textContent = String(created.length);
  if (ui.statValue) ui.statValue.textContent = isSolanaProfileAddress(payload.address) ? "0 SOL" : formatCompactUsd(weiToUsd(valueWei, state.ethUsd));
  if (ui.createdCountInline) ui.createdCountInline.textContent = String(created.length);
  renderProfileHeader(payload.address);
  renderCreatedMiniList(created);
}

async function refreshEthUsd(force = false) {
  const price = await fetchEthUsdPrice(force);
  if (Number.isFinite(price) && price > 0) {
    state.ethUsd = price;
  }
}

function loadSocialProfile(session = readSocialAuthSession()) {
  if (!session) return false;
  const isX = session.type === "x";
  const username = isX
    ? session.name || `@${session.username}`
    : session.name || session.email;
  const bio = isX
    ? `Connected with X @${session.username}${Number(session.followers || 0) > 0 ? ` • ${Number(session.followers || 0).toLocaleString()} followers` : ""}`
    : `Signed in with ${session.email}`;
  state.profileLoading = false;
  state.address = "";
  state.socialLoaded = true;
  state.socialLoading = false;
  state.payload = {
    address: "",
    chainType: "social",
    profile: {
      address: "",
      username,
      bio,
      imageUri: session.image || "",
      avatarText: isX ? "X" : "EM"
    },
    created: [],
    holdings: [],
    followers: [],
    following: [],
    followersCount: Number(session.followers || 0),
    followingCount: 0,
    socialIncluded: true
  };
  updateQuery("");
  setSummary(state.payload);
  renderActiveTab();
  updateProfileIdentity();
  return true;
}

async function loadProfile(address) {
  const normalized = normalizeProfileAddress(address);
  if (!normalized) {
    throw new Error("Enter a valid wallet address");
  }
  const isSolana = isSolanaProfileAddress(normalized);

  const requestSeq = ++state.profileLoadSeq;
  state.profileLoading = true;
  state.address = normalized;
  updateQuery(normalized);
  // Fast first paint: show header/address instantly, then hydrate profile data async.
  const cachedFollowers = isSolana ? 0 : loadCachedFollowerCount(normalized);
  const warmPayload = {
    address: normalized,
    profile: isSolana ? { address: normalized, username: defaultProfileUsername(normalized), bio: "", imageUri: "" } : loadUserProfile(normalized),
    created: [],
    holdings: [],
    followers: [],
    following: [],
    followersCount: Number(cachedFollowers || 0),
    followingCount: 0,
    socialIncluded: false
  };
  state.payload = warmPayload;
  setSummary(warmPayload);
  renderActiveTab();

  try {
    const payload = await api.profile(normalized);
    if (requestSeq !== state.profileLoadSeq) return;
    const relatedAddresses = new Set([normalized]);
    for (const row of payload?.created || []) {
      if (row?.creator) relatedAddresses.add(row.creator);
    }
    for (const row of payload?.holdings || []) {
      if (row?.creator) relatedAddresses.add(row.creator);
    }
    for (const row of payload?.followers || []) {
      if (row?.address) relatedAddresses.add(row.address);
    }
    for (const row of payload?.following || []) {
      if (row?.address) relatedAddresses.add(row.address);
    }
    if (!isSolana) {
      await hydrateUserProfiles([...relatedAddresses], { force: true });
    }
    if (requestSeq !== state.profileLoadSeq) return;
    state.payload = payload;
    state.socialLoaded = Boolean(payload.socialIncluded);
    state.socialLoading = false;
    setSummary(payload);
    renderActiveTab();
    await refreshFollowState();
  } catch (error) {
    if (requestSeq !== state.profileLoadSeq) return;
    state.payload = warmPayload;
    state.socialLoaded = false;
    state.socialLoading = false;
    setSummary(warmPayload);
    renderActiveTab();
    setAlert(ui.alert, parseUiError(error), true);
  } finally {
    if (requestSeq === state.profileLoadSeq) {
      state.profileLoading = false;
      renderActiveTab();
    }
  }
}

async function loadConfig() {
  const cfg = await api.config();
  state.chainId = Number(cfg.chainId || 1);
  setPreferredChainId(state.chainId);
  ui.netChip.textContent = `Chain ${cfg.chainId}`;
  ui.factoryChip.textContent = shortAddress(cfg.factoryAddress);
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
  state.pendingProfileImageUri = String(profile.imageUri || "");
  updateEditAvatarPreview((profile.username || "EP").slice(0, 2).toUpperCase(), state.pendingProfileImageUri);

  ui.editProfileModal?.classList.add("open");
  ui.editProfileModal?.setAttribute("aria-hidden", "false");
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
    state.pendingProfileImageUri = "";
    const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
    updateEditAvatarPreview(text || "EP", "");
    if (ui.editAvatarFile) ui.editAvatarFile.value = "";
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
        state.pendingProfileImageUri = uploaded.url || dataUrl;
      } catch {
        state.pendingProfileImageUri = dataUrl;
      }
      const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
      updateEditAvatarPreview(text || "EP", state.pendingProfileImageUri);
      setAlert(ui.alert, "Profile image uploaded");
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    }
  });

  ui.editUsername?.addEventListener("input", () => {
    const text = String(ui.editUsername?.value || "EP").slice(0, 2).toUpperCase();
    updateEditAvatarPreview(text || "EP", state.pendingProfileImageUri);
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

    const saved = await saveUserProfile(ws.address, { username, bio, imageUri: state.pendingProfileImageUri });
    updateProfileIdentity();
    if (normalizeAddress(state.address) === normalizeAddress(ws.address)) {
      renderProfileHeader(ws.address);
    }
    hideEditProfileModal();
    if (saved?.synced) {
      setAlert(ui.alert, "Profile updated");
    } else {
      setAlert(ui.alert, "Profile saved locally, but cloud sync failed. Check backend env/API.", true);
    }
  });
}

function setupProfileMenu() {
  ui.profileMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    walletHub?.setOpen(false);
    setProfileMenuOpen(!ui.profileMenu?.classList.contains("open"));
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
    const address = ws.address || ws.solanaAddress || "";
    if (!address) return;
    const profileUrl = new URL(`/profile?address=${encodeURIComponent(address)}`, window.location.origin).toString();
    try {
      await copyText(profileUrl);
      showCopyToast("Profile link copied");
    } catch {
      setAlert(ui.alert, "Could not copy profile link", true);
    }
  });

  ui.menuLogoutBtn?.addEventListener("click", () => {
    const ws = walletState();
    const social = readSocialAuthSession();
    if (!ws.signer && !ws.address && !ws.solanaAddress && !social) {
      setAlert(ui.alert, "Wallet already disconnected");
      setProfileMenuOpen(false);
      return;
    }
    disconnectWallet();
    clearSocialAuthSession();
    setWalletLabel(ui.walletLabel);
    if (ui.disconnectBtn?.style) ui.disconnectBtn.style.display = "none";
    setAlert(ui.alert, "Signed out");
    setProfileMenuOpen(false);
    updateProfileIdentity();
    walletHub?.refresh();
    state.payload = null;
    state.address = "";
    updateQuery("");
    renderProfileHeader("");
    renderActiveTab();
  });
}

function setupAddressControls() {
  ui.profileAddressInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    try {
      await loadProfile(ui.profileAddressInput.value);
      setAlert(ui.alert, "Profile loaded");
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    }
  });
}

function setupFollowButton() {
  ui.profileFollowBtn?.addEventListener("click", async () => {
    if (ui.profileFollowBtn?.dataset?.mode === "edit") {
      try {
        await openEditProfileModal();
      } catch (err) {
        setAlert(ui.alert, parseUiError(err), true);
      }
      return;
    }

    try {
      const viewer = connectedAddress();
      const target = normalizeAddress(state.address || "");
      if (!viewer) {
        throw new Error("Connect wallet first");
      }
      if (!target) {
        throw new Error("Load a profile first");
      }
      if (viewer.toLowerCase() === target.toLowerCase()) {
        return;
      }

      state.followBusy = true;
      syncFollowButton();
      const payload = await api.setFollow(viewer, target, !state.isFollowingProfile);
      state.isFollowingProfile = Boolean(payload?.isFollowing);
      setAlert(ui.alert, state.isFollowingProfile ? "Followed profile" : "Unfollowed profile");
      await loadProfile(target);
    } catch (err) {
      setAlert(ui.alert, parseUiError(err), true);
    } finally {
      state.followBusy = false;
      syncFollowButton();
    }
  });
}

async function init() {
  try {
    await refreshEthUsd();
  } catch {
    // keep fallback ETH/USD price
  }

  await loadConfig();
  await handleSocialAuthReturn();

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
      updateProfileIdentity();
      setProfileMenuOpen(false);
      await walletHub?.refresh();
      const ws = walletState();
      if (ws.address && !state.address) {
        await loadProfile(ws.address);
      } else if (ws.solanaAddress && !state.address) {
        await loadProfile(ws.solanaAddress);
      } else if (!state.address) {
        loadSocialProfile();
      } else {
        renderProfileHeader(state.address);
        setSummary(state.payload || {
          address: state.address,
          profile: isSolanaProfileAddress(state.address)
            ? { address: state.address, username: defaultProfileUsername(state.address), bio: "", imageUri: "" }
            : loadUserProfile(state.address),
          created: [],
          holdings: [],
          followers: [],
          following: [],
          followersCount: 0,
          followingCount: 0,
          socialIncluded: false
        });
      }
    }
  });

  ui.disconnectBtn?.addEventListener("click", () => {
    updateProfileIdentity();
    setProfileMenuOpen(false);
    walletHub?.refresh();
  });
  ui.connectBtn?.addEventListener("click", () => {
    setTimeout(() => {
      updateProfileIdentity();
      walletHub?.refresh();
    }, 20);
  });
  ui.walletSelect?.addEventListener("change", () => {
    setTimeout(() => {
      updateProfileIdentity();
      walletHub?.refresh();
    }, 20);
  });

  ui.signInBtn?.addEventListener("click", () => {
    if (walletControls?.connect) {
      walletControls.connect();
      return;
    }
    ui.connectBtn?.click();
  });

  window.addEventListener("pumpr:socialAuth", () => {
    const ws = walletState();
    if (ws.solanaAddress) {
      loadProfile(ws.solanaAddress).catch((error) => setAlert(ui.alert, parseUiError(error), true));
      return;
    }
    loadSocialProfile();
  });

  setupProfileMenu();
  setupEditProfileModal();
  initSupportWidget({ alertEl: ui.alert });
  setupAddressControls();
  setupFollowButton();
  initCoinSearchOverlay({ triggerInputs: [ui.profileAddressInput] });
  setupAddressCopy();
  setupTabs();
  setupCreatorRewardsActions();
  updateTabButtons();
  updateProfileIdentity();
  renderActiveTab();

  setInterval(() => {
    refreshEthUsd(true)
      .then(() => {
        if (state.payload) {
          setSummary(state.payload);
          renderActiveTab();
        }
      })
      .catch(() => {
        // ignore ETH/USD polling failures
      });
  }, 60_000);

  const fromUrl = getAddressFromUrl();
  if (fromUrl) {
    const normalizedFromUrl = normalizeProfileAddress(fromUrl);
    if (normalizedFromUrl) {
      await loadProfile(normalizedFromUrl);
      return;
    }
    // Ignore invalid query values (e.g. usernames) and continue with wallet fallback.
    updateQuery("");
  }

  const ws = walletState();
  if (ws.address) {
    await loadProfile(ws.address);
    return;
  }
  if (ws.solanaAddress) {
    await loadProfile(ws.solanaAddress);
    return;
  }
  if (loadSocialProfile()) {
    return;
  }

  renderProfileHeader("");
}

init().catch((err) => {
  setAlert(ui.alert, parseUiError(err), true);
});
