(() => {
  const STORAGE_KEY = "etherpump.sidebar.compact.v1";
  const REFERRAL_PENDING_KEY = "pumpr.referral.pending.v1";
  const WALLET_SESSION_KEY = "etherpump.wallet.session.v1";
  const CHAIN_PREFERENCE_KEY = "etherpump.chain.preferred.v1";
  const ETH_USD_CACHE_KEY = "etherpump.ethusd.v1";
  const ETH_USD_CACHE_TTL_MS = 5 * 60 * 1000;
  const REFRESH_INTERVAL_MS = 30_000;
  const CLAIM_MIN_USD = 8;

  if (!window.__pumprAssistantBooted) {
    window.__pumprAssistantBooted = true;
    import("/js/assistant.js?v=20260711airisenses")
      .then((module) => module?.initPumprAssistant?.())
      .catch(() => {
        window.__pumprAssistantBooted = false;
      });
  }

  const sidebar = document.getElementById("appSidebar") || document.querySelector(".sidebar");
  const toggle = document.getElementById("sidebarToggle") || sidebar?.querySelector(".sidebar-toggle");
  if (!sidebar || !toggle) return;

  const sideNav = sidebar.querySelector(".side-nav");
  const sideIcons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"></path><path d="M5.5 9.8V21h13V9.8"></path></svg>',
    onboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7.5 4.25v8.5L12 20.5l-7.5-4.25v-8.5L12 3.5z"></path><path d="M8.7 12h6.6"></path><path d="M12 8.7v6.6"></path></svg>',
    go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l7 4v8l-7 4-7-4v-8l7-4z"></path><path d="M9 12.2l2 2 4-4"></path></svg>',
    alpha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8l3 6-7 10-7-10 3-6z"></path><path d="M8 10h8"></path><path d="M12 4v16"></path></svg>',
    rwa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9"></path><path d="M10 19V5"></path><path d="M16 19v-7"></path><path d="M22 19H2"></path><path d="m4 6 6-3 6 5 5-4"></path></svg>',
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v4"></path><path d="M7 7.5h10a3 3 0 0 1 3 3v5.5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5.5a3 3 0 0 1 3-3z"></path><path d="M9 13h.01"></path><path d="M15 13h.01"></path><path d="M9.5 16c1.4.8 3.6.8 5 0"></path></svg>',
    airi: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.2 5.1 5.3.5-4 3.6 1.2 5.2L12 15.2l-4.7 2.7 1.2-5.2-4-3.6 5.3-.5L12 3.5z"></path><path d="M12 8.7v3.7"></path><path d="M9.8 11.1h4.4"></path></svg>',
    airdrop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14"></path><path d="M7 8l5-5 5 5"></path><path d="M4 17.5h16"></path><path d="M6.5 21h13"></path></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h12"></path><path d="m13 4 3 3-3 3"></path><path d="M20 17H8"></path><path d="m11 14-3 3 3 3"></path></svg>',
    referral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7h2.5a3.5 3.5 0 0 1 0 7H15"></path><path d="M9 17H6.5a3.5 3.5 0 0 1 0-7H9"></path><path d="M8 12h8"></path><path d="M12 4v3"></path><path d="M12 17v3"></path></svg>',
    social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9.5a4.5 4.5 0 0 1 4.5-4.5h5A4.5 4.5 0 0 1 19 9.5v3.2a4.5 4.5 0 0 1-4.5 4.5H11l-4.6 2.6.9-3.3A4.5 4.5 0 0 1 5 12.7V9.5z"></path><path d="M9 10.5h6"></path><path d="M9 13.5h3.5"></path></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.4"></rect><path d="M3 10h18"></path><path d="M7 15h4"></path><path d="M15.5 15h1.5"></path></svg>',
    android: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2.2"></rect><path d="M10 6h4"></path><path d="M12 15V9"></path><path d="M9.8 12.8 12 15l2.2-2.2"></path><path d="M11.2 18h1.6"></path></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.2" r="3.7"></circle><path d="M4.6 20c1.8-3.9 4.4-5.9 7.4-5.9s5.6 2 7.4 5.9"></path></svg>',
    communities: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11.5a4 4 0 1 1 8 0"></path><path d="M4.5 20c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5"></path><path d="M17 8.2a3 3 0 0 1 3 3"></path><path d="M18.5 15.2c1.2.6 2 1.7 2.5 3.1"></path></svg>',
    support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"></path><path d="M5 13v3a2 2 0 0 0 2 2h1v-7H7a2 2 0 0 0-2 2z"></path><path d="M19 13v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2z"></path><path d="M15 19a3 3 0 0 1-3 2"></path></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M7 7v10"></path><path d="M17 7v10"></path><path d="M4 17h16"></path></svg>'
  };
  const navItems = [
    { key: "home", href: "/", label: "Home", match: (path) => path === "/" || path === "/home" },
    { key: "onboard", href: "/onboard", label: "Onboard" },
    { key: "go", href: "/go", label: "GO" },
    { key: "alpha", href: "/alpha", label: "Alpha Tips" },
    { key: "rwa", href: "/rwa", label: "RWA Board", pill: "new" },
    { key: "agents", href: "/agents", label: "Agents" },
    { key: "airi", href: "/airi", label: "Airi Backroom", pill: "live" },
    { key: "airdrop", href: "/airdrop", label: "Airdrop" },
    { key: "swap", href: "/rh-swap", label: "RH Swap", pill: "beta", match: (path) => path === "/rh-swap" || path === "/swap" || path === "/robinhood-swap" },
    { key: "referral", href: "/referrals", label: "Referrals", pill: "beta", match: (path) => path === "/referrals" || path.startsWith("/r/") },
    { key: "social", href: "/social", label: "Social", pill: "beta" },
    { key: "card", href: "/pumpr-card", label: "PUMPR Card", pill: "waitlist" },
    { key: "android", href: "/android", label: "Android APK", pill: "download" },
    { key: "profile", href: "/profile", label: "Profile", id: "profileNavSide" },
    { key: "communities", href: "/communities", label: "Communities" },
    { key: "support", href: "#", label: "Support", id: "supportSideLink", className: "side-link-support", findByLabel: true },
    { key: "terminal", href: "https://trade.padre.gg/", label: "Terminal", external: true }
  ];

  function normalizeReferralCode(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^@+/, "")
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 24);
  }

  function captureReferralLanding() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const pathMatch = String(window.location.pathname || "").match(/^\/r\/([^/?#]+)/i);
      const ref = normalizeReferralCode(params.get("ref") || params.get("r") || params.get("referral") || decodeURIComponent(pathMatch?.[1] || ""));
      if (!ref) return;
      const pending = {
        ref,
        landingPath: `${window.location.pathname || "/"}${window.location.search || ""}`,
        ts: Date.now()
      };
      localStorage.setItem(REFERRAL_PENDING_KEY, JSON.stringify(pending));
      fetch("/api/referrals/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
        keepalive: true
      }).catch(() => {});
    } catch {
      // Referral capture should never block navigation.
    }
  }

  captureReferralLanding();

  function linkLabel(link) {
    return link?.querySelector(".side-link-label")?.textContent?.trim() || link?.textContent?.trim() || "";
  }

  function findSideLink(item) {
    if (!sideNav) return null;
    if (item.findByLabel) {
      return [...sideNav.querySelectorAll("a.side-link")].find((link) => linkLabel(link).toLowerCase() === item.label.toLowerCase()) || null;
    }
    return sideNav.querySelector(`a[href="${item.href}"]`);
  }

  function createSideLink(item) {
    const link = document.createElement("a");
    link.className = "side-link";
    link.href = item.href;
    if (item.id) link.id = item.id;
    if (item.external) {
      link.target = "_blank";
      link.rel = "noreferrer noopener";
    }
    link.innerHTML = `<span class="side-icon" aria-hidden="true">${sideIcons[item.key]}</span><span class="side-link-label">${item.label}</span>${item.pill ? `<span class="side-pill side-pill-beta">${item.pill}</span>` : ""}`;
    return link;
  }

  if (sideNav) {
    for (const item of navItems) {
      const link = findSideLink(item) || createSideLink(item);
      const label = link.querySelector(".side-link-label");
      const icon = link.querySelector(".side-icon");
      link.classList.add("side-link");
      if (item.className) link.classList.add(item.className);
      link.href = item.href;
      if (item.id && !link.id) link.id = item.id;
      if (item.external) {
        link.target = "_blank";
        link.rel = "noreferrer noopener";
      } else {
        link.removeAttribute("target");
        link.removeAttribute("rel");
      }
      if (label) label.textContent = item.label;
      if (icon && sideIcons[item.key]) icon.innerHTML = sideIcons[item.key];
      let pill = link.querySelector(".side-pill");
      if (item.pill && !pill) {
        pill = document.createElement("span");
        pill.className = "side-pill side-pill-beta";
        link.appendChild(pill);
      }
      if (pill) {
        if (item.pill) {
          pill.textContent = item.pill;
        } else {
          pill.remove();
        }
      }
      const pathname = location.pathname || "/";
      const isActive = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
      link.classList.toggle("active", Boolean(isActive));
      sideNav.appendChild(link);
    }
  }

  const createBtn = sidebar.querySelector(".side-create-btn");
  const rewardsCard = document.createElement("a");
  rewardsCard.className = "side-rewards-card";
  rewardsCard.id = "sideCreatorRewards";
  rewardsCard.href = "/profile";
  rewardsCard.style.display = "none";
  rewardsCard.innerHTML = `
    <span class="side-rewards-head">
      <span>Creator rewards</span>
      <span class="side-rewards-new">New</span>
    </span>
    <strong class="side-rewards-value">$0.00</strong>
  `;
  if (createBtn) {
    createBtn.insertAdjacentElement("afterend", rewardsCard);
  }

  let compact = false;
  let refreshTimer = null;
  let refreshBusy = false;

  try {
    compact = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    compact = false;
  }

  const apply = () => {
    sidebar.classList.toggle("compact", compact);
    toggle.setAttribute("aria-expanded", compact ? "false" : "true");
    toggle.setAttribute("aria-label", compact ? "Expand sidebar" : "Collapse sidebar");
  };

  toggle.addEventListener("click", () => {
    compact = !compact;
    try {
      localStorage.setItem(STORAGE_KEY, compact ? "1" : "0");
    } catch {
      // ignore storage failures
    }
    apply();
  });

  apply();

  function normalizeAddress(value) {
    const text = String(value || "").trim();
    return /^0x[a-fA-F0-9]{40}$/.test(text) ? text : "";
  }

function toBigIntOrZero(value) {
    try {
      return BigInt(String(value ?? "0"));
    } catch {
      return 0n;
    }
  }

function profileHrefForAddress(value) {
  const raw = String(value || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(raw) ? `/profile?address=${raw}` : "/profile";
}

  function poolUnitPriceWei(pool) {
    const graduated = Boolean(pool?.graduated) || String(pool?.priceSource || "").toLowerCase() === "dex";
    const effective = toBigIntOrZero(pool?.effectiveSpotPriceWei);
    if (effective > 0n) return effective;

    const marketCapWei = toBigIntOrZero(pool?.marketCapWei);
    const circulating = toBigIntOrZero(pool?.circulatingSupply);
    if (marketCapWei > 0n && circulating > 0n) {
      return (marketCapWei * 10n ** 18n) / circulating;
    }

    if (graduated) return 0n;
    return toBigIntOrZero(pool?.spotPriceWei);
  }

  function readWalletSession() {
    try {
      const raw = localStorage.getItem(WALLET_SESSION_KEY);
      const parsed = JSON.parse(raw || "{}");
      return {
        connected: Boolean(parsed?.connected),
        choice: String(parsed?.choice || ""),
        address: normalizeAddress(parsed?.address || "")
      };
    } catch {
      return { connected: false, choice: "", address: "" };
    }
  }

  function readPreferredChainId() {
    try {
      const raw = Number(localStorage.getItem(CHAIN_PREFERENCE_KEY) || 0);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    } catch {
      return 0;
    }
  }

  function formatUsd(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "$0.00";
    if (n < 0.01) return "<$0.01";
    if (n < 1000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2
    }).format(n);
  }

  function readCachedEthUsd() {
    try {
      const raw = localStorage.getItem(ETH_USD_CACHE_KEY);
      const parsed = JSON.parse(raw || "{}");
      const price = Number(parsed?.price || 0);
      const ts = Number(parsed?.ts || 0);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts)) return null;
      if (Date.now() - ts > ETH_USD_CACHE_TTL_MS) return null;
      return price;
    } catch {
      return null;
    }
  }

  async function fetchEthUsd() {
    const cached = readCachedEthUsd();
    if (cached) return cached;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2200);
      const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
        cache: "no-store",
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) return 0;
      const payload = await res.json();
      const price = Number(payload?.data?.amount || 0);
      return Number.isFinite(price) && price > 0 ? price : 0;
    } catch {
      return 0;
    }
  }

  async function getConnectedAddress() {
    const session = readWalletSession();
    if (!session.connected) return "";
    const root = window.ethereum;
    if (!root) return session.address || "";

    const providers = Array.isArray(root.providers) && root.providers.length ? root.providers : [root];
    for (const provider of providers) {
      const selected = normalizeAddress(provider?.selectedAddress || "");
      if (selected) return selected;
    }

    for (const provider of providers) {
      if (!provider?.request) continue;
      try {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (Array.isArray(accounts) && accounts.length) {
          const found = normalizeAddress(accounts[0]);
          if (found) return found;
        }
      } catch {
        // ignore
      }
    }
    return session.address || "";
  }

  async function refreshCreatorRewardsCard() {
    if (!rewardsCard || refreshBusy) return;
    refreshBusy = true;
    try {
      const address = await getConnectedAddress();
      if (!address) {
        rewardsCard.style.display = "none";
        return;
      }

      const chainId = readPreferredChainId();
      const query = chainId > 0 ? `?chainId=${chainId}` : "";
      const response = await fetch(`/api/profile/${address}${query}`, { cache: "no-store" });
      if (!response.ok) {
        rewardsCard.style.display = "none";
        return;
      }

      const payload = await response.json();
      const created = Array.isArray(payload?.created) ? payload.created : [];
      let claimableValueWei = 0n;
      for (const row of created) {
        const claimWei = toBigIntOrZero(row?.feeSnapshot?.creatorClaimableWei);
        const priceWei = poolUnitPriceWei(row?.pool);
        if (claimWei <= 0n || priceWei <= 0n) continue;
        claimableValueWei += (claimWei * priceWei) / 10n ** 18n;
      }

      if (claimableValueWei <= 0n) {
        rewardsCard.style.display = "none";
        return;
      }

      const ethUsd = await fetchEthUsd();
      const claimableEth = Number(claimableValueWei) / 1e18;
      const claimableUsd = claimableEth * (ethUsd > 0 ? ethUsd : 0);
      if (!Number.isFinite(claimableUsd) || claimableUsd < CLAIM_MIN_USD) {
        rewardsCard.style.display = "none";
        return;
      }
      rewardsCard.href = profileHrefForAddress(address);
      const valueNode = rewardsCard.querySelector(".side-rewards-value");
      if (valueNode) {
        valueNode.textContent = formatUsd(claimableUsd);
      }
      rewardsCard.style.display = "";
    } catch {
      rewardsCard.style.display = "none";
    } finally {
      refreshBusy = false;
    }
  }

  function scheduleRefresh(delay = 0) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshCreatorRewardsCard().catch(() => {
        // ignore sidebar reward refresh errors
      });
    }, Math.max(0, delay));
  }

  window.addEventListener("focus", () => scheduleRefresh(80));
  window.addEventListener("storage", () => scheduleRefresh(80));
  document.getElementById("connectBtn")?.addEventListener("click", () => scheduleRefresh(900));
  document.getElementById("disconnectBtn")?.addEventListener("click", () => scheduleRefresh(200));
  scheduleRefresh(60);
  setInterval(() => scheduleRefresh(0), REFRESH_INTERVAL_MS);
})();

