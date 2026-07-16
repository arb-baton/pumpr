const fs = require("fs");
const path = require("path");

const DEFAULT_ROUTES = [
  "/",
  "/create",
  "/airi",
  "/airdrop",
  "/referrals",
  "/social",
  "/rh-swap",
  "/agents",
  "/communities",
  "/onboard",
  "/go",
  "/alpha",
  "/pumpr-card",
  "/android"
];

const ROOT = process.cwd();
const BASE_URL = String(process.env.AIRI_UI_AUDIT_BASE_URL || "https://pump-r.fun").replace(/\/+$/, "");
const OUTPUT_PATH = path.resolve(ROOT, process.env.AIRI_UI_AUDIT_OUTPUT || ".airi-ui-audit.json");
const SCREENSHOT_DIR = process.env.AIRI_UI_AUDIT_SCREENSHOTS_DIR
  ? path.resolve(ROOT, process.env.AIRI_UI_AUDIT_SCREENSHOTS_DIR)
  : "";
const REPORT_ISSUES = String(process.env.AIRI_UI_AUDIT_REPORT_ISSUES || "false").toLowerCase() === "true";
const REPORT_LEVEL = String(process.env.AIRI_UI_AUDIT_REPORT_LEVEL || "error").toLowerCase();
const SOFT_FAIL = String(process.env.AIRI_UI_AUDIT_SOFT_FAIL || "false").toLowerCase() === "true";
const FAIL_ON = String(process.env.AIRI_UI_AUDIT_FAIL_ON || "error").toLowerCase();
const MAX_REPORTS = Math.max(1, Math.min(20, Number(process.env.AIRI_UI_AUDIT_MAX_REPORTS || 8)));
const SLOW_ROUTE_MS = Math.max(1000, Number(process.env.AIRI_UI_AUDIT_SLOW_ROUTE_MS || 7000));
const ROUTES = String(process.env.AIRI_UI_AUDIT_ROUTES || "")
  .split(",")
  .map((route) => route.trim())
  .filter(Boolean);
const AUDIT_ROUTES = ROUTES.length ? ROUTES : DEFAULT_ROUTES;

function log(message) {
  console.log(`[airi-ui-audit] ${message}`);
}

function normalizeRoute(route) {
  const clean = String(route || "/").trim();
  if (!clean) return "/";
  if (/^https?:\/\//i.test(clean)) return clean;
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function pageNameFromRoute(route) {
  const pathname = (() => {
    try {
      return new URL(route, BASE_URL).pathname;
    } catch {
      return String(route || "/");
    }
  })();
  if (pathname === "/") return "home";
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "") || "home";
}

function issue(kind, severity, route, summary, payload = {}) {
  return {
    kind,
    severity,
    page: pageNameFromRoute(route),
    pathname: (() => {
      try {
        return new URL(route, BASE_URL).pathname;
      } catch {
        return normalizeRoute(route);
      }
    })(),
    summary: String(summary || "").replace(/\s+/g, " ").trim().slice(0, 500),
    payload: {
      source: "airi-ui-audit",
      baseUrl: BASE_URL,
      route: normalizeRoute(route),
      ...payload
    }
  };
}

function canFailFor(severity) {
  if (FAIL_ON === "none") return false;
  if (FAIL_ON === "warning") return severity === "warning" || severity === "error" || severity === "critical";
  if (FAIL_ON === "critical") return severity === "critical";
  return severity === "error" || severity === "critical";
}

function shouldReportSeverity(severity) {
  if (REPORT_LEVEL === "none") return false;
  if (REPORT_LEVEL === "warning") return severity === "warning" || severity === "error" || severity === "critical";
  if (REPORT_LEVEL === "critical") return severity === "critical";
  return severity === "error" || severity === "critical";
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    throw new Error("Playwright is not installed. Install it in CI with: npm install --no-save --package-lock=false playwright@1.49.1 && npx playwright install chromium");
  }
}

async function postIssue(foundIssue) {
  if (!REPORT_ISSUES || typeof fetch !== "function") return { skipped: true };
  try {
    const response = await fetch(`${BASE_URL}/api/airi/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "PumpR-Airi-UI-Audit/1.0"
      },
      body: JSON.stringify({
        sessionId: "airi-ui-auditor",
        page: foundIssue.page,
        pathname: foundIssue.pathname,
        issue: foundIssue
      }),
      signal: AbortSignal.timeout(7000)
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 180) };
  }
}

async function collectPageLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const bodyText = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
    const documentWidth = Math.max(
      document.documentElement.scrollWidth || 0,
      document.body?.scrollWidth || 0,
      viewportWidth
    );

    const visuallyHidden = (el, style = getComputedStyle(el)) => {
      const rect = el.getBoundingClientRect();
      if (el.hidden || el.getAttribute("aria-hidden") === "true" || el.closest("[aria-hidden='true']")) return true;
      if (el.matches("input[type='hidden'], template, script, style")) return true;
      if (!el.getClientRects().length) return true;
      if (/(sr-only|visually-hidden|screen-reader)/i.test(String(el.className || ""))) return true;
      if (style.clipPath && style.clipPath !== "none") return true;
      if (style.clip && style.clip !== "auto") return true;
      return rect.width <= 1 && rect.height <= 1 && style.position === "absolute";
    };

    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none" && !visuallyHidden(el, style);
    };

    const describe = (el) => {
      const rect = el.getBoundingClientRect();
      const id = el.id ? `#${el.id}` : "";
      const cls = String(el.className || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((item) => `.${item}`)
        .join("");
      const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
      return {
        selector: `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 180),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        text
      };
    };

    const overflowElements = Array.from(document.querySelectorAll("body *"))
      .filter((el) => visible(el))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const allowsScroll = /(auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
        const isMedia = /^(svg|canvas|img|video)$/i.test(el.tagName);
        return !allowsScroll && !isMedia && rect.right > viewportWidth + 8 && rect.left < viewportWidth;
      })
      .slice(0, 8)
      .map(describe);

    const suspiciousHugePanels = Array.from(document.querySelectorAll("article, section, [class*='card'], [class*='panel']"))
      .filter((el) => visible(el))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const cls = String(el.className || "");
        if (/hero|modal|drawer|sidebar/i.test(cls)) return false;
        return rect.height > Math.max(520, viewportHeight * 0.78) && text.length < 900;
      })
      .slice(0, 6)
      .map(describe);

    const clippedText = Array.from(document.querySelectorAll("button, a, label, h1, h2, h3, [class*='title'], [class*='label']"))
      .filter((el) => visible(el))
      .filter((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 8) return false;
        if (/(auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) return false;
        return el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0 && String(el.textContent || "").trim().length > 3;
      })
      .slice(0, 8)
      .map(describe);

    const brokenControls = Array.from(document.querySelectorAll("button, a, input, textarea, select"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && !visuallyHidden(el, style) && (rect.width <= 1 || rect.height <= 1);
      })
      .slice(0, 8)
      .map(describe);

    return {
      title: document.title,
      bodyTextLength: bodyText.length,
      viewportWidth,
      viewportHeight,
      documentWidth,
      horizontalOverflow: documentWidth > viewportWidth + 8,
      overflowElements,
      suspiciousHugePanels,
      clippedText,
      brokenControls
    };
  });
}

async function auditRoute(browser, route) {
  const normalizedRoute = normalizeRoute(route);
  const url = /^https?:\/\//i.test(normalizedRoute) ? normalizedRoute : `${BASE_URL}${normalizedRoute}`;
  const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(String(message.text() || "").slice(0, 500));
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error || "page error").slice(0, 500));
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const responseUrl = response.url();
    try {
      const parsed = new URL(responseUrl);
      const base = new URL(BASE_URL);
      if (parsed.origin !== base.origin) return;
    } catch {}
    badResponses.push({
      status,
      url: responseUrl.replace(BASE_URL, "").slice(0, 240)
    });
  });

  const startedAt = Date.now();
  const routeIssues = [];
  let layout = null;
  let status = "ok";
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(1200);
    const httpStatus = response ? response.status() : 0;
    if (!response || httpStatus >= 400) {
      routeIssues.push(issue("ui_route_http", httpStatus >= 500 ? "error" : "warning", normalizedRoute, `Route returned HTTP ${httpStatus || "no response"}`, { httpStatus }));
    }
    layout = await collectPageLayout(page);
    const navigation = await page.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0];
      return entry ? {
        durationMs: Math.round(entry.duration),
        domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
        transferSize: Number(entry.transferSize || 0)
      } : null;
    });
    if (navigation?.durationMs >= SLOW_ROUTE_MS) {
      routeIssues.push(issue("ui_slow_route", "warning", normalizedRoute, `Page took ${(navigation.durationMs / 1000).toFixed(1)}s to finish loading`, navigation));
    }
    if (layout.bodyTextLength < 40) {
      routeIssues.push(issue("ui_empty_page", "error", normalizedRoute, "Page rendered with almost no readable content", { bodyTextLength: layout.bodyTextLength }));
    }
    if (layout.horizontalOverflow) {
      routeIssues.push(issue("ui_horizontal_overflow", "warning", normalizedRoute, "Page content is wider than the viewport", {
        documentWidth: layout.documentWidth,
        viewportWidth: layout.viewportWidth,
        elements: layout.overflowElements
      }));
    }
    if (layout.suspiciousHugePanels.length) {
      routeIssues.push(issue("ui_oversized_panel", "warning", normalizedRoute, "A panel/card is unusually tall compared with its content", {
        panels: layout.suspiciousHugePanels
      }));
    }
    if (layout.clippedText.length) {
      routeIssues.push(issue("ui_text_clipping", "warning", normalizedRoute, "Some visible text appears clipped inside its container", {
        elements: layout.clippedText
      }));
    }
    if (layout.brokenControls.length) {
      routeIssues.push(issue("ui_broken_control", "error", normalizedRoute, "A visible control has no usable size", {
        controls: layout.brokenControls
      }));
    }
    if (consoleErrors.length) {
      routeIssues.push(issue("ui_console_error", "error", normalizedRoute, "Browser console reported JavaScript errors", {
        errors: consoleErrors.slice(0, 5)
      }));
    }
    if (pageErrors.length) {
      routeIssues.push(issue("ui_page_error", "error", normalizedRoute, "Page threw an uncaught JavaScript error", {
        errors: pageErrors.slice(0, 5)
      }));
    }
    if (badResponses.length) {
      const hasServerFailure = badResponses.some((entry) => entry.status >= 500);
      routeIssues.push(issue("ui_bad_response", hasServerFailure ? "error" : "warning", normalizedRoute, "Page requested same-origin resources that returned errors", {
        responses: badResponses.slice(0, 8)
      }));
    }
  } catch (error) {
    status = "failed";
    routeIssues.push(issue("ui_route_crash", "error", normalizedRoute, `Route could not be audited: ${String(error?.message || error).slice(0, 240)}`, {}));
  }

  if (SCREENSHOT_DIR && routeIssues.length) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const safeName = pageNameFromRoute(normalizedRoute).replace(/[^a-z0-9_-]/gi, "-") || "home";
    const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    routeIssues.forEach((entry) => {
      entry.payload.screenshot = path.relative(ROOT, screenshotPath).replace(/\\/g, "/");
    });
  }

  await page.close().catch(() => undefined);
  return {
    route: normalizedRoute,
    url,
    status,
    durationMs: Date.now() - startedAt,
    layout,
    issues: routeIssues
  };
}

async function main() {
  const { chromium } = await loadPlaywright();
  log(`Auditing ${AUDIT_ROUTES.length} route(s) on ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const routes = [];
  try {
    for (const route of AUDIT_ROUTES) {
      const result = await auditRoute(browser, route);
      routes.push(result);
      log(`${result.route}: ${result.issues.length ? `${result.issues.length} issue(s)` : "ok"}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const issues = routes.flatMap((route) => route.issues);
  const report = {
    ok: !issues.some((entry) => canFailFor(entry.severity)),
    baseUrl: BASE_URL,
    auditedAt: new Date().toISOString(),
    routes: routes.map((route) => ({
      route: route.route,
      url: route.url,
      status: route.status,
      durationMs: route.durationMs,
      layout: route.layout,
      issueCount: route.issues.length
    })),
    issues,
    summary: {
      routes: routes.length,
      issues: issues.length,
      errors: issues.filter((entry) => entry.severity === "error" || entry.severity === "critical").length,
      warnings: issues.filter((entry) => entry.severity === "warning").length
    }
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);

  const reportableIssues = issues.filter((entry) => shouldReportSeverity(entry.severity));
  if (REPORT_ISSUES && reportableIssues.length) {
    for (const foundIssue of reportableIssues.slice(0, MAX_REPORTS)) {
      const posted = await postIssue(foundIssue);
      log(`Reported ${foundIssue.kind} on ${foundIssue.page}: ${posted.ok ? "ok" : posted.reason || posted.status || posted.error || "skipped"}`);
    }
  }

  if (!report.ok && !SOFT_FAIL) {
    console.error(JSON.stringify(report.summary, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[airi-ui-audit] ${error?.stack || error?.message || error}`);
  if (!SOFT_FAIL) process.exit(1);
});
