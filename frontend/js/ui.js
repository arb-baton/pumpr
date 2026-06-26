import {
  connectSolanaWallet,
  connectSocialWallet,
  connectWallet,
  defaultUsername,
  disconnectWallet,
  discoverWallets,
  ethers,
  exportGeneratedWalletPrivateKey,
  fetchEthUsdPrice,
  getChainOption,
  getGeneratedWalletInfo,
  getSavedWalletChoice,
  getSolanaProvider,
  loadUserProfile,
  restoreWalletFromSession,
  shortAddress,
  solanaWalletState,
  walletState,
  parseUiError
} from "./core.js";

export function setAlert(el, message, isError = false) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("error", Boolean(isError));
}

let copyToastEl = null;
let copyToastTimer = null;
const COPY_TOAST_ICON = `
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5"></circle>
    <path d="M6.5 10.2l2.2 2.2 4.8-4.8"></path>
  </svg>
`;

export function showCopyToast(message = "Address copied to clipboard") {
  if (!document?.body) return;
  if (!copyToastEl) {
    copyToastEl = document.createElement("div");
    copyToastEl.className = "copy-toast";
    copyToastEl.setAttribute("role", "status");
    copyToastEl.setAttribute("aria-live", "polite");
    document.body.appendChild(copyToastEl);
  }

  copyToastEl.innerHTML = `${COPY_TOAST_ICON}<span>${message}</span>`;
  copyToastEl.classList.add("show");

  if (copyToastTimer) {
    clearTimeout(copyToastTimer);
  }
  copyToastTimer = setTimeout(() => {
    copyToastEl?.classList.remove("show");
  }, 1700);
}

export function setWalletLabel(el) {
  if (!el) return;
  const ws = walletState();
  if (ws.signer && ws.address) {
    el.textContent = `${ws.walletLabel}: ${shortAddress(ws.address)}`;
  } else if (ws.solanaAddress) {
    el.textContent = `${ws.solanaWalletLabel || "Phantom"}: ${shortAddress(ws.solanaAddress)}`;
  } else {
    el.textContent = "Not connected";
  }
}

function formatUsdBalance(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "$0.00";
  return `$${numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNativeBalance(value, symbol = "ETH", maxFractionDigits = 6) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return `0 ${symbol}`;
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })} ${symbol}`;
}

async function readWalletChainMeta(ws) {
  let chainId = 0;
  try {
    if (ws?.activeInjectedProvider?.request) {
      const raw = await ws.activeInjectedProvider.request({ method: "eth_chainId" });
      chainId = typeof raw === "string" && raw.startsWith("0x") ? Number.parseInt(raw, 16) : Number(raw || 0);
    }
  } catch {
    chainId = 0;
  }

  if (!chainId) {
    try {
      const network = await ws?.provider?.getNetwork();
      chainId = Number(network?.chainId || 0);
    } catch {
      chainId = 0;
    }
  }

  const option = getChainOption(chainId);
  const symbol = option?.nativeCurrency?.symbol || "ETH";
  return { chainId, option, symbol };
}

async function readNativeBalance(ws, address) {
  if (!ws?.provider || !address) {
    throw new Error("Wallet provider unavailable");
  }

  let wei = null;
  let lastError = null;

  try {
    wei = await ws.provider.getBalance(address);
  } catch (error) {
    lastError = error;
  }

  if ((wei === null || wei === undefined) && ws.activeInjectedProvider?.request) {
    try {
      const hex = await ws.activeInjectedProvider.request({
        method: "eth_getBalance",
        params: [address, "latest"]
      });
      if (typeof hex === "string" && hex.startsWith("0x")) {
        wei = BigInt(hex);
      }
    } catch (error) {
      lastError = lastError || error;
    }
  }

  if (wei === null || wei === undefined) {
    throw lastError || new Error("Could not fetch native wallet balance");
  }

  const nativeAmount = Number(ethers.formatEther(wei));
  if (!Number.isFinite(nativeAmount) || nativeAmount < 0) {
    throw new Error("Balance value is invalid");
  }
  return nativeAmount;
}

export function initWalletHubMenu({
  triggerEl,
  menuEl,
  balanceEl,
  balanceLargeEl,
  nativeEl,
  addressBtnEl,
  historyLinkEl,
  exportKeyBtnEl,
  depositBtnEl,
  tradeLinkEl,
  buyLinkEl,
  depositModalEl,
  depositCloseBtnEl,
  depositCopyBtnEl,
  depositAddressEl,
  depositQrEl,
  alertEl,
  onOpen
} = {}) {
  let open = false;
  let ethUsd = 3000;
  if (!exportKeyBtnEl && menuEl) {
    const grid = menuEl.querySelector(".wallet-hub-grid");
    if (grid) {
      const button = document.createElement("button");
      button.id = "walletHubExportKeyBtn";
      button.className = "wallet-hub-card";
      button.type = "button";
      button.hidden = true;
      button.innerHTML = `
        <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v10"></path><path d="M8.5 9.5L12 13l3.5-3.5"></path><path d="M5 21h14"></path><path d="M7 17h10"></path></svg></span>
        <span class="wallet-hub-copy"><strong>Export key</strong><span>Generated wallet</span></span>
      `;
      grid.appendChild(button);
      exportKeyBtnEl = button;
    }
  }

  const setOpen = (nextOpen) => {
    if (!menuEl || !triggerEl) return;
    open = Boolean(nextOpen);
    menuEl.classList.toggle("open", open);
    triggerEl.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && typeof onOpen === "function") onOpen();
  };

  const closeDeposit = () => {
    if (!depositModalEl) return;
    depositModalEl.classList.remove("open");
    depositModalEl.setAttribute("aria-hidden", "true");
  };

  const openDeposit = () => {
    if (!depositModalEl) return;
    depositModalEl.classList.add("open");
    depositModalEl.setAttribute("aria-hidden", "false");
  };

  const connectedAddress = () => {
    const ws = walletState();
    return ws?.generatedWallet?.address || (ws?.signer && ws?.address ? ws.address : "");
  };

  const refresh = async () => {
    const ws = walletState();
    const generated = getGeneratedWalletInfo();
    const connected = Boolean((ws.signer && ws.address) || generated?.address);

    if (!connected) {
      if (balanceEl) balanceEl.textContent = "$0.00";
      if (balanceLargeEl) balanceLargeEl.textContent = "$0.00";
      if (nativeEl) nativeEl.textContent = "0 ETH";
      if (addressBtnEl) {
        addressBtnEl.textContent = "Not connected";
        addressBtnEl.disabled = true;
      }
      if (historyLinkEl) historyLinkEl.href = "/profile";
      if (exportKeyBtnEl) exportKeyBtnEl.hidden = true;
      if (depositAddressEl) depositAddressEl.textContent = "Not connected";
      if (depositQrEl) {
        depositQrEl.removeAttribute("src");
        depositQrEl.style.display = "none";
      }
      triggerEl?.classList.remove("connected");
      return;
    }

    triggerEl?.classList.add("connected");
    const address = generated?.address || ws.address;
    if (addressBtnEl) {
      addressBtnEl.textContent = shortAddress(address);
      addressBtnEl.disabled = false;
    }
    if (historyLinkEl) {
      historyLinkEl.href = `/profile?address=${address}`;
    }
    if (exportKeyBtnEl) exportKeyBtnEl.hidden = !generated;
    if (tradeLinkEl) tradeLinkEl.href = "/";
    if (buyLinkEl && !buyLinkEl.href) {
      buyLinkEl.href = "https://www.moonpay.com/buy/eth";
    }
    if (depositAddressEl) depositAddressEl.textContent = address;
    if (depositQrEl) {
      const data = encodeURIComponent(address);
      depositQrEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=176x176&data=${data}`;
      depositQrEl.style.display = "block";
    }

    let nativeBalance = null;
    let nativeSymbol = "ETH";
    try {
      const meta = await readWalletChainMeta(ws);
      nativeSymbol = meta.symbol || "ETH";
      nativeBalance = generated ? 0 : await readNativeBalance(ws, address);
    } catch {
      nativeBalance = null;
    }

    if (nativeSymbol === "ETH") {
      try {
        ethUsd = await fetchEthUsdPrice(false);
      } catch {
        // keep fallback
      }
    }

    if (nativeBalance === null) {
      if (balanceEl) balanceEl.textContent = "--";
      if (balanceLargeEl) balanceLargeEl.textContent = "--";
      if (nativeEl) nativeEl.textContent = "Balance unavailable";
      return;
    }

    const nativeLabel = formatNativeBalance(nativeBalance, generated ? "SOL" : nativeSymbol, 6);
    const summaryLabel =
      generated
        ? formatNativeBalance(nativeBalance, "SOL", 3)
        : nativeSymbol === "ETH"
        ? formatUsdBalance(Number(nativeBalance) * Number(ethUsd || 3000))
        : formatNativeBalance(nativeBalance, nativeSymbol, 3);

    if (balanceEl) balanceEl.textContent = summaryLabel;
    if (balanceLargeEl) balanceLargeEl.textContent = summaryLabel;
    if (nativeEl) nativeEl.textContent = nativeLabel;
  };

  triggerEl?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const next = !open;
    if (next) {
      await refresh();
    }
    setOpen(next);
  });

  document.addEventListener("click", (event) => {
    if (!open) return;
    if (!menuEl || !triggerEl) return;
    if (menuEl.contains(event.target) || triggerEl.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      closeDeposit();
    }
  });

  addressBtnEl?.addEventListener("click", async () => {
    const address = connectedAddress();
    if (!address) {
      setAlert(alertEl, "Connect wallet first", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(alertEl, "Could not copy address", true);
    }
  });

  depositBtnEl?.addEventListener("click", () => {
    const address = connectedAddress();
    if (!address) {
      setAlert(alertEl, "Connect wallet first", true);
      return;
    }
    setOpen(false);
    openDeposit();
  });

  depositCloseBtnEl?.addEventListener("click", closeDeposit);
  depositModalEl?.addEventListener("click", (event) => {
    if (event.target === depositModalEl) {
      closeDeposit();
    }
  });

  depositCopyBtnEl?.addEventListener("click", async () => {
    const address = connectedAddress();
    if (!address) {
      setAlert(alertEl, "Connect wallet first", true);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      showCopyToast("Address copied to clipboard");
    } catch {
      setAlert(alertEl, "Could not copy address", true);
    }
  });

  exportKeyBtnEl?.addEventListener("click", async () => {
    try {
      const ok = window.confirm("Export this generated wallet private key? Anyone with this key can move the wallet's funds. Store it somewhere private.");
      if (!ok) return;
      const privateKey = exportGeneratedWalletPrivateKey();
      await navigator.clipboard.writeText(privateKey);
      showCopyToast("Private key copied");
      setAlert(alertEl, "Private key copied. Keep it secret.");
    } catch (error) {
      setAlert(alertEl, parseUiError(error), true);
    }
  });

  refresh().catch(() => {
    // non-blocking on first paint
  });

  return {
    refresh,
    setOpen
  };
}

function showWalletPickerModal(wallets = []) {
  return new Promise((resolve, reject) => {
    const rows = Array.isArray(wallets) ? [...wallets] : [];
    if (getSolanaProvider() && !rows.some((wallet) => wallet.key === "phantom")) {
      rows.push({ id: "phantom", key: "phantom", label: "Phantom" });
    }

    const preferredOrder = ["phantom", "metamask", "rabby", "coinbase", "injected", "unknown"];
    const orderedWallets = rows.sort((a, b) => {
      const ai = preferredOrder.indexOf(a.key);
      const bi = preferredOrder.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    const primaryWallets = orderedWallets.slice(0, 2);
    const extraWallets = orderedWallets.slice(2);
    const recentChoice = getSavedWalletChoice();

    const iconLabel = (wallet) => {
      if (wallet.key === "metamask") return "MM";
      if (wallet.key === "rabby") return "RB";
      if (wallet.key === "coinbase") return "CB";
      if (wallet.key === "phantom") return "PH";
      return "W";
    };

    const renderWalletButton = (wallet, withStatus = true) => {
      const isRecent = recentChoice && (wallet.id === recentChoice || wallet.key === recentChoice);
      const status = withStatus ? (isRecent ? "RECENT" : "DETECTED") : "";
      const badge = status
        ? `<span class="wallet-picker-badge ${status === "RECENT" ? "recent" : "detected"}"><i></i>${status}</span>`
        : `<span class="wallet-picker-arrow">></span>`;

      return `
        <button type="button" class="btn-ghost wallet-picker-btn" data-wallet-id="${wallet.id || wallet.key}">
          <span class="wallet-picker-btn-left">
            <span class="wallet-picker-icon wallet-${wallet.key}">${iconLabel(wallet)}</span>
            <span class="wallet-picker-name">${wallet.label}</span>
          </span>
          ${badge}
        </button>
      `;
    };

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay open wallet-picker-overlay";
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("role", "dialog");
    overlay.innerHTML = `
      <div class="modal-card wallet-picker-card">
        <button type="button" class="wallet-picker-close" aria-label="Close">x</button>
        <div class="wallet-picker-head">
          <div class="wallet-picker-brand">
            <img src="/assets/pump-r-logo.png?v=20260609brand" alt="Pump-r" />
          </div>
          <h3>Welcome back</h3>
          <p>Connect your wallet or continue with email.</p>
        </div>
        <div class="wallet-picker-list">
          ${primaryWallets.map((wallet) => renderWalletButton(wallet, true)).join("")}
          <button type="button" class="btn-ghost wallet-picker-btn wallet-picker-more-btn" data-wallet-more ${
            extraWallets.length ? "" : "disabled"
          }>
            <span class="wallet-picker-btn-left">
              <span class="wallet-picker-icon wallet-more">+</span>
              <span class="wallet-picker-name">More wallets</span>
            </span>
            <span class="wallet-picker-arrow">></span>
          </button>
          <div class="wallet-picker-more-list" ${extraWallets.length ? "hidden" : ""}>
            ${extraWallets.map((wallet) => renderWalletButton(wallet, false)).join("")}
          </div>
        </div>
        <div class="wallet-picker-divider"><span>or</span></div>
        <button type="button" class="btn-ghost wallet-picker-btn wallet-picker-email" data-wallet-email>
          <span class="wallet-picker-btn-left">
            <span class="wallet-picker-icon wallet-email">U</span>
            <span>
              <span class="wallet-picker-name">Email or Social</span>
              <small>Zero confirmation trading</small>
            </span>
          </span>
          <span class="wallet-picker-arrow">></span>
        </button>
        <div class="wallet-picker-social-panel" hidden>
          <button type="button" class="btn-ghost wallet-picker-btn" data-wallet-x>
            <span class="wallet-picker-btn-left">
              <span class="wallet-picker-icon wallet-email">X</span>
              <span>
                <span class="wallet-picker-name">Continue with X</span>
                <small>Use your X profile</small>
              </span>
            </span>
            <span class="wallet-picker-arrow">></span>
          </button>
          <form class="wallet-picker-email-form">
            <input type="email" name="email" autocomplete="email" placeholder="you@example.com" required />
            <button type="submit" class="btn-primary">Continue</button>
          </form>
        </div>
        <div class="wallet-picker-actions">
          <button type="button" class="btn-ghost wallet-picker-cancel">Cancel</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
    };

    const closeWithError = (message) => {
      cleanup();
      reject(new Error(message));
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") {
        closeWithError("Wallet connection cancelled");
      }
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeWithError("Wallet connection cancelled");
      }
    });

    overlay.querySelector(".wallet-picker-cancel")?.addEventListener("click", () => {
      closeWithError("Wallet connection cancelled");
    });
    overlay.querySelector(".wallet-picker-close")?.addEventListener("click", () => {
      closeWithError("Wallet connection cancelled");
    });

    overlay.querySelector("[data-wallet-more]")?.addEventListener("click", () => {
      const more = overlay.querySelector(".wallet-picker-more-list");
      if (!more) return;
      const hidden = more.hasAttribute("hidden");
      if (hidden) {
        more.removeAttribute("hidden");
      } else {
        more.setAttribute("hidden", "");
      }
    });

    overlay.querySelector("[data-wallet-email]")?.addEventListener("click", () => {
      const panel = overlay.querySelector(".wallet-picker-social-panel");
      if (!panel) return;
      const hidden = panel.hasAttribute("hidden");
      if (hidden) {
        panel.removeAttribute("hidden");
        panel.querySelector("input")?.focus();
      } else {
        panel.setAttribute("hidden", "");
      }
    });

    overlay.querySelector("[data-wallet-x]")?.addEventListener("click", () => {
      cleanup();
      resolve("x-auth");
    });

    overlay.querySelector(".wallet-picker-email-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
      cleanup();
      resolve(`email:${email}`);
    });

    overlay.querySelectorAll("[data-wallet-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = String(button.getAttribute("data-wallet-id") || "");
        cleanup();
        resolve(key);
      });
    });

    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(overlay);
    overlay.querySelector("[data-wallet-id]")?.focus();
  });
}

export function initWalletControls({ selectEl, connectBtn, disconnectBtn, labelEl, alertEl, onConnected, onDisconnected } = {}) {
  if (selectEl) {
    selectEl.style.display = "none";
    selectEl.setAttribute("aria-hidden", "true");
    selectEl.tabIndex = -1;
  }
  setWalletLabel(labelEl);

  disconnectBtn?.style && (disconnectBtn.style.display = (walletState().signer || walletState().solanaAddress) ? "inline-block" : "none");

  const notifyConnected = async () => {
    if (disconnectBtn?.style) disconnectBtn.style.display = "inline-block";
    if (onConnected) await onConnected();
  };

  const notifyDisconnected = async () => {
    if (disconnectBtn?.style) disconnectBtn.style.display = "none";
    if (onDisconnected) await onDisconnected();
  };

  (async () => {
    try {
      const restored = await restoreWalletFromSession("");
      const ws = walletState();
      if (!restored || (!ws.signer && !ws.solanaAddress)) return;
      setWalletLabel(labelEl);
      await notifyConnected();
    } catch {
      // keep page usable even if silent reconnect fails
    }
  })();

  const syncFromSharedSession = async ({ clearOnMissing = false } = {}) => {
    try {
      const restored = await restoreWalletFromSession("");
      const ws = walletState();
      setWalletLabel(labelEl);
      if (restored && (ws.signer || ws.solanaAddress)) {
        await notifyConnected();
      } else {
        if (clearOnMissing) {
          disconnectWallet();
          setWalletLabel(labelEl);
        }
        await notifyDisconnected();
      }
    } catch {
      if (clearOnMissing) {
        disconnectWallet();
        setWalletLabel(labelEl);
      }
      await notifyDisconnected();
    }
  };

  window.addEventListener("storage", (event) => {
    if (event.key !== "etherpump.wallet.session.v1") return;
    let connected = false;
    try {
      connected = Boolean(JSON.parse(event.newValue || "{}")?.connected);
    } catch {
      connected = false;
    }
    syncFromSharedSession({ clearOnMissing: !connected });
  });
  window.addEventListener("etherpump:solanaWalletChanged", () => {
    setWalletLabel(labelEl);
    if (walletState().solanaAddress) {
      notifyConnected();
    } else {
      notifyDisconnected();
    }
  });

  const doConnect = async () => {
    try {
      const wallets = discoverWallets();
      const choice = await showWalletPickerModal(wallets);
      const walletKey = String(choice || "").split(":")[0];
      if (walletKey === "x-auth") {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
        window.location.href = `/api/x/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
        return;
      }
      if (walletKey === "email") {
        const email = String(choice || "").slice("email:".length).trim().toLowerCase();
        const connected = await connectSocialWallet({ type: "email", email, name: email.split("@")[0] });
        setWalletLabel(labelEl);
        window.dispatchEvent(new CustomEvent("pumpr:socialAuth", { detail: { type: "email", email, address: connected?.address } }));
        await notifyConnected();
        const generatedAddress = connected?.generatedWallet?.address || connected?.publicKey || "";
        setAlert(alertEl, `Signed in as ${email}. Generated Solana wallet: ${shortAddress(generatedAddress)}`);
        return;
      }
      if (walletKey === "phantom") {
        await connectSolanaWallet({ requirePrompt: true, requireSignature: true });
      } else {
        await connectWallet(choice);
      }
      setWalletLabel(labelEl);
      await notifyConnected();
      setAlert(alertEl, "Wallet connected");
    } catch (err) {
      const message = parseUiError(err);
      if (String(message).toLowerCase().includes("cancelled")) {
        setAlert(alertEl, "Wallet connection cancelled");
        return;
      }
      setAlert(alertEl, message, true);
      showCopyToast(message);
    }
  };

  const doDisconnect = async () => {
    disconnectWallet();
    setWalletLabel(labelEl);
    await notifyDisconnected();
    setAlert(alertEl, "Wallet disconnected");
  };

  connectBtn?.addEventListener("click", doConnect);
  disconnectBtn?.addEventListener("click", doDisconnect);

  return {
    connect: doConnect,
    disconnect: doDisconnect
  };
}

function sharedWalletMarkup() {
  return `
    <div class="wallet-hub-wrap">
      <button id="walletHubBtn" class="wallet-hub-trigger" style="display:none" type="button" aria-expanded="false" aria-controls="walletHubMenu">
        <span class="wallet-hub-dot" aria-hidden="true"></span>
        <span id="walletHubBalance">0 SOL</span>
        <span class="wallet-hub-caret">v</span>
      </button>
      <div id="walletHubMenu" class="wallet-hub-menu" role="menu">
        <p class="wallet-hub-label">Balance</p>
        <h3 id="walletHubBalanceLarge">0 SOL</h3>
        <p class="wallet-hub-sub"><span id="walletHubNative">0 SOL</span> available</p>
        <button id="walletHubAddressBtn" class="wallet-hub-address" type="button">Not connected</button>
        <div class="wallet-hub-grid">
          <a id="walletHubTradeLink" class="wallet-hub-card" href="/">
            <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h12"></path><path d="M13 4l3 3-3 3"></path><path d="M20 17H8"></path><path d="M11 14l-3 3 3 3"></path></svg></span>
            <span class="wallet-hub-copy"><strong>Browse</strong><span>Pump-r tokens</span></span>
          </a>
          <a id="walletHubHistoryLink" class="wallet-hub-card" href="/profile">
            <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l2.5 2.5"></path></svg></span>
            <span class="wallet-hub-copy"><strong>Profile</strong><span>Wallet activity</span></span>
          </a>
          <button id="walletHubExportKeyBtn" class="wallet-hub-card" type="button" hidden>
            <span class="wallet-hub-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v10"></path><path d="M8.5 9.5L12 13l3.5-3.5"></path><path d="M5 21h14"></path><path d="M7 17h10"></path></svg></span>
            <span class="wallet-hub-copy"><strong>Export key</strong><span>Generated wallet</span></span>
          </button>
        </div>
      </div>
    </div>
    <button id="profileMenuBtn" class="profile-trigger" style="display:none" type="button" aria-expanded="false" aria-controls="profileMenu">
      <span class="profile-avatar" id="profileAvatar">PR</span>
      <span class="profile-name" id="profileMenuName">Guest</span>
      <span class="profile-chevron">v</span>
    </button>
    <div id="profileMenu" class="profile-menu">
      <div class="profile-menu-header">
        <span class="profile-avatar large" id="profileAvatarLarge">PR</span>
        <div class="profile-menu-identity">
          <div class="profile-menu-name-row"><strong id="profileMenuNameLarge">Guest</strong></div>
          <small id="profileMenuMeta">Connected with Phantom</small>
        </div>
      </div>
      <a class="profile-menu-link profile-menu-item" id="profileNav" href="/profile">
        <span class="profile-menu-item-left"><span class="profile-menu-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8.2" r="3.7"></circle><path d="M4.6 20c1.8-3.9 4.4-5.9 7.4-5.9s5.6 2 7.4 5.9"></path></svg></span><span>View profile</span></span>
        <span class="profile-menu-item-arrow">></span>
      </a>
      <button class="profile-menu-link profile-menu-btn profile-menu-item profile-menu-item-danger" id="menuLogoutBtn" type="button">Log out</button>
    </div>
  `;
}

function setSharedAvatar(node, name = "", imageUri = "") {
  if (!node) return;
  const label = String(name || "PR").slice(0, 2).toUpperCase() || "PR";
  if (imageUri) {
    node.textContent = "";
    node.classList.add("with-image");
    node.style.backgroundImage = `url("${imageUri}")`;
  } else {
    node.classList.remove("with-image");
    node.style.backgroundImage = "";
    node.textContent = label;
  }
}

export function initTopbarWalletProfile({
  signInBtn,
  connectBtn,
  disconnectBtn,
  walletSelect,
  walletLabel,
  alertEl,
  onChange
} = {}) {
  const topActions = signInBtn?.closest(".top-actions") || document.querySelector(".top-actions");
  if (!topActions) {
    return initWalletControls({ selectEl: walletSelect, connectBtn, disconnectBtn, labelEl: walletLabel, alertEl, onConnected: onChange });
  }

  if (!document.getElementById("walletHubBtn")) {
    signInBtn?.insertAdjacentHTML("afterend", sharedWalletMarkup());
  }

  const els = {
    walletHubBtn: document.getElementById("walletHubBtn"),
    walletHubMenu: document.getElementById("walletHubMenu"),
    walletHubBalance: document.getElementById("walletHubBalance"),
    walletHubBalanceLarge: document.getElementById("walletHubBalanceLarge"),
    walletHubNative: document.getElementById("walletHubNative"),
    walletHubAddressBtn: document.getElementById("walletHubAddressBtn"),
    walletHubExportKeyBtn: document.getElementById("walletHubExportKeyBtn"),
    walletHubTradeLink: document.getElementById("walletHubTradeLink"),
    walletHubHistoryLink: document.getElementById("walletHubHistoryLink"),
    profileMenuBtn: document.getElementById("profileMenuBtn"),
    profileMenu: document.getElementById("profileMenu"),
    profileMenuName: document.getElementById("profileMenuName"),
    profileMenuNameLarge: document.getElementById("profileMenuNameLarge"),
    profileMenuMeta: document.getElementById("profileMenuMeta"),
    profileAvatar: document.getElementById("profileAvatar"),
    profileAvatarLarge: document.getElementById("profileAvatarLarge"),
    profileNav: document.getElementById("profileNav"),
    menuLogoutBtn: document.getElementById("menuLogoutBtn")
  };

  let walletHub = null;
  const setProfileOpen = (open) => {
    if (!els.profileMenu || !els.profileMenuBtn) return;
    els.profileMenu.classList.toggle("open", Boolean(open));
    els.profileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const update = async () => {
    const ws = walletState();
    const solana = solanaWalletState();
    const evmConnected = Boolean(ws.signer && ws.address);
    const generatedConnected = Boolean(ws.generatedWallet?.address);
    const solanaConnected = Boolean(solana.address);
    const connected = evmConnected || solanaConnected;
    if (signInBtn) signInBtn.style.display = connected ? "none" : "inline-flex";
    if (els.walletHubBtn) els.walletHubBtn.style.display = evmConnected || generatedConnected ? "inline-flex" : "none";
    if (els.profileMenuBtn) els.profileMenuBtn.style.display = connected ? "inline-flex" : "none";
    setWalletLabel(walletLabel);
    if (!connected) {
      setProfileOpen(false);
      walletHub?.setOpen(false);
      if (typeof onChange === "function") await onChange();
      return;
    }
    if (solanaConnected && !evmConnected) {
      const name = `sol_${solana.address.slice(0, 6)}`;
      if (els.profileMenuName) els.profileMenuName.textContent = name;
      if (els.profileMenuNameLarge) els.profileMenuNameLarge.textContent = name;
      if (els.profileMenuMeta) els.profileMenuMeta.textContent = "Solana wallet connected";
      if (els.profileNav) els.profileNav.href = `/profile?address=${encodeURIComponent(solana.address)}`;
      setSharedAvatar(els.profileAvatar, "SOL", "");
      setSharedAvatar(els.profileAvatarLarge, "SOL", "");
      walletHub?.setOpen(false);
      if (typeof onChange === "function") await onChange();
      return;
    }
    const profile = loadUserProfile(ws.address);
    const name = profile?.username || defaultUsername(ws.address) || shortAddress(ws.address);
    const imageUri = profile?.imageUri || "";
    if (els.profileMenuName) els.profileMenuName.textContent = name;
    if (els.profileMenuNameLarge) els.profileMenuNameLarge.textContent = name;
    if (els.profileMenuMeta) els.profileMenuMeta.textContent = shortAddress(ws.address);
    if (els.profileNav) els.profileNav.href = `/profile?address=${encodeURIComponent(ws.address)}`;
    setSharedAvatar(els.profileAvatar, name, imageUri);
    setSharedAvatar(els.profileAvatarLarge, name, imageUri);
    walletHub?.refresh();
    if (typeof onChange === "function") await onChange();
  };

  const controls = initWalletControls({
    selectEl: walletSelect,
    connectBtn,
    disconnectBtn,
    labelEl: walletLabel,
    alertEl,
    onConnected: update,
    onDisconnected: update
  });

  walletHub = initWalletHubMenu({
    triggerEl: els.walletHubBtn,
    menuEl: els.walletHubMenu,
    balanceEl: els.walletHubBalance,
    balanceLargeEl: els.walletHubBalanceLarge,
    nativeEl: els.walletHubNative,
    addressBtnEl: els.walletHubAddressBtn,
    exportKeyBtnEl: els.walletHubExportKeyBtn,
    tradeLinkEl: els.walletHubTradeLink,
    historyLinkEl: els.walletHubHistoryLink,
    alertEl,
    onOpen: () => setProfileOpen(false)
  });

  signInBtn?.addEventListener("click", async () => {
    if (walletState().signer || walletState().solanaAddress) return;
    await controls.connect();
    await update();
  });
  els.profileMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    walletHub?.setOpen(false);
    setProfileOpen(!els.profileMenu?.classList.contains("open"));
  });
  document.addEventListener("click", (event) => {
    if (!els.profileMenu || !els.profileMenuBtn) return;
    if (els.profileMenu.contains(event.target) || els.profileMenuBtn.contains(event.target)) return;
    setProfileOpen(false);
  });
  els.menuLogoutBtn?.addEventListener("click", async () => {
    await controls.disconnect();
    await update();
  });

  update();
  return { ...controls, refresh: update, walletHub };
}
