const crypto = require("crypto");

const SIGNED_BILL_KEYWORDS = /\b(signed\s+bill|bill\s+token|signed\s+note|treasury\s+note|treasury\s+bill|bond\s+note|note\s+token|bill\s+style|certificate\s+token|print\s+(?:a\s+)?(?:signed\s+)?bill|issue\s+(?:a\s+)?(?:signed\s+)?bill)\b/i;

function cleanText(value, max = 120) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function escapeXml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isSignedBillRequested(text = "") {
  return SIGNED_BILL_KEYWORDS.test(String(text || ""));
}

function normalizeVisualMode(value = "", text = "") {
  const explicit = cleanText(value, 40).toLowerCase().replace(/[-_]+/g, " ");
  if (["signed bill", "signature bill", "bill", "treasury", "treasury note", "treasury bill", "note", "certificate"].includes(explicit)) return "signed_bill";
  if (/\b(?:treasury|bill|certificate)\b/i.test(String(text || "")) && /\b(?:token|coin|ticker|launch|create|mint|deploy|issue|print|note)\b/i.test(String(text || ""))) return "signed_bill";
  return isSignedBillRequested(text) ? "signed_bill" : "";
}

function serialForBill({ launchpad = "", tweetId = "", ticker = "" } = {}) {
  const prefix = String(launchpad || "").toLowerCase() === "robinhood" ? "RH" : "SOL";
  const hash = crypto.createHash("sha256")
    .update(`${launchpad}:${tweetId}:${ticker}:${process.env.GITHUB_RUN_ID || ""}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `${prefix}-${hash.slice(0, 4)}-${hash.slice(4)}`;
}

function chainLabel(launchpad = "") {
  return String(launchpad || "").toLowerCase() === "robinhood" ? "Robinhood Chain" : "Pump.fun / Solana";
}

function chainPalette(launchpad = "") {
  if (String(launchpad || "").toLowerCase() === "robinhood") {
    return {
      bgA: "#06110c",
      bgB: "#102418",
      ink: "#d9ffe9",
      muted: "#a6c8b2",
      line: "#69f5a2",
      sealA: "#0a2d1a",
      sealB: "#69f5a2",
      accent: "#7bffb0",
      accent2: "#b7ffd0"
    };
  }
  return {
    bgA: "#07121c",
    bgB: "#17102b",
    ink: "#f0f6ff",
    muted: "#b8c7df",
    line: "#7cf7c9",
    sealA: "#1d1541",
    sealB: "#8ef9d6",
    accent: "#8ef9d6",
    accent2: "#bca8ff"
  };
}

function monogramFor(name = "", ticker = "") {
  const raw = String(ticker || name || "PR").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return raw.slice(0, 4) || "PR";
}

function shortAddress(value = "") {
  const raw = cleanText(value, 80);
  if (!raw) return "";
  return raw.length > 18 ? `${raw.slice(0, 8)}...${raw.slice(-6)}` : raw;
}

function formatDate(value = "") {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildSignedBillSvg(options = {}) {
  const name = cleanText(options.name || "Untitled Bill", 32);
  const ticker = cleanText(options.ticker || "BILL", 13).replace(/^\$/, "").toUpperCase();
  const description = cleanText(options.description || "On-chain signed issue", 92);
  const launchpad = cleanText(options.launchpad || "pumpfun", 30).toLowerCase();
  const palette = chainPalette(launchpad);
  const creatorHandle = cleanText(options.creatorHandle || options.authorUsername || "unknown", 32).replace(/^@/, "");
  const creatorId = cleanText(options.creatorId || "", 40);
  const signer = creatorHandle ? `@${creatorHandle}` : "X requester";
  const serial = cleanText(options.serial || serialForBill(options), 24);
  const issuedAt = formatDate(options.issuedAt);
  const tokenAddress = shortAddress(options.tokenAddress || options.contractAddress || "");
  const sourceImageUrl = cleanText(options.sourceImageUrl || "", 500);
  const mono = monogramFor(name, ticker);
  const chain = chainLabel(launchpad);
  const hasPortrait = /^https?:\/\//i.test(sourceImageUrl);
  const caLine = tokenAddress ? `CA ${tokenAddress}` : "CA pending issuance";
  const xIdLine = creatorId ? `X ID ${creatorId}` : `X ID @${creatorHandle || "unknown"}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 0 1600 1600">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${palette.bgA}"/>
      <stop offset="1" stop-color="${palette.bgB}"/>
    </linearGradient>
    <radialGradient id="seal" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="${palette.sealB}" stop-opacity="0.42"/>
      <stop offset="0.52" stop-color="${palette.sealA}" stop-opacity="0.86"/>
      <stop offset="1" stop-color="${palette.bgA}" stop-opacity="1"/>
    </radialGradient>
    <pattern id="micro" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M0 14H28M14 0V28" stroke="${palette.line}" stroke-opacity="0.08" stroke-width="1"/>
    </pattern>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <clipPath id="portraitClip"><circle cx="800" cy="652" r="254"/></clipPath>
  </defs>
  <rect width="1600" height="1600" fill="url(#bg)"/>
  <rect x="0" y="0" width="1600" height="1600" fill="url(#micro)"/>
  <rect x="74" y="92" width="1452" height="1416" rx="42" fill="none" stroke="${palette.line}" stroke-opacity="0.75" stroke-width="8"/>
  <rect x="118" y="136" width="1364" height="1328" rx="28" fill="#ffffff" fill-opacity="0.018" stroke="${palette.accent2}" stroke-opacity="0.32" stroke-width="3"/>
  <path d="M160 302H1440M160 1298H1440" stroke="${palette.line}" stroke-opacity="0.65" stroke-width="3"/>
  <path d="M188 248C412 188 596 188 800 248C1004 188 1188 188 1412 248" fill="none" stroke="${palette.accent}" stroke-opacity="0.22" stroke-width="3"/>
  <path d="M188 1352C412 1412 596 1412 800 1352C1004 1412 1188 1412 1412 1352" fill="none" stroke="${palette.accent}" stroke-opacity="0.22" stroke-width="3"/>

  <text x="800" y="228" text-anchor="middle" fill="${palette.accent2}" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700" letter-spacing="7">PUMP-R SIGNED ISSUE</text>
  <text x="800" y="292" text-anchor="middle" fill="${palette.muted}" font-family="Arial, sans-serif" font-size="26" letter-spacing="5">NEGOTIABLE MEME NOTE</text>

  <g filter="url(#softShadow)">
    <circle cx="800" cy="652" r="318" fill="url(#seal)" stroke="${palette.line}" stroke-width="8" stroke-opacity="0.92"/>
    <circle cx="800" cy="652" r="282" fill="none" stroke="${palette.accent2}" stroke-width="3" stroke-dasharray="16 18" stroke-opacity="0.52"/>
    ${hasPortrait ? `<image href="${escapeXml(sourceImageUrl)}" x="546" y="398" width="508" height="508" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/>` : `
      <circle cx="800" cy="652" r="210" fill="${palette.bgA}" stroke="${palette.line}" stroke-width="4" stroke-opacity="0.55"/>
      <text x="800" y="626" text-anchor="middle" fill="${palette.accent}" font-family="Arial Black, Arial, sans-serif" font-size="108" font-weight="900" letter-spacing="2">${escapeXml(mono)}</text>
      <text x="800" y="700" text-anchor="middle" fill="${palette.muted}" font-family="Arial, sans-serif" font-size="28" letter-spacing="6">SIGNED BILL</text>
    `}
  </g>

  <text x="800" y="1016" text-anchor="middle" fill="${palette.ink}" font-family="Arial Black, Arial, sans-serif" font-size="86" font-weight="900">${escapeXml(name)}</text>
  <text x="800" y="1104" text-anchor="middle" fill="${palette.accent}" font-family="Arial Black, Arial, sans-serif" font-size="68" font-weight="900">$${escapeXml(ticker)}</text>
  <text x="800" y="1164" text-anchor="middle" fill="${palette.muted}" font-family="Arial, sans-serif" font-size="28">${escapeXml(description)}</text>

  <g font-family="Arial, sans-serif" font-size="30" fill="${palette.ink}">
    <text x="184" y="382" fill="${palette.muted}" letter-spacing="3">CHAIN</text>
    <text x="184" y="430" font-weight="800">${escapeXml(chain)}</text>
    <text x="184" y="506" fill="${palette.muted}" letter-spacing="3">SERIAL</text>
    <text x="184" y="554" font-weight="800">${escapeXml(serial)}</text>
    <text x="184" y="630" fill="${palette.muted}" letter-spacing="3">ISSUED</text>
    <text x="184" y="678" font-weight="800">${escapeXml(issuedAt)}</text>

    <text x="1416" y="382" text-anchor="end" fill="${palette.muted}" letter-spacing="3">SIGNER</text>
    <text x="1416" y="430" text-anchor="end" font-weight="800">${escapeXml(signer)}</text>
    <text x="1416" y="506" text-anchor="end" fill="${palette.muted}" letter-spacing="3">IDENTITY</text>
    <text x="1416" y="554" text-anchor="end" font-weight="800">${escapeXml(xIdLine)}</text>
    <text x="1416" y="630" text-anchor="end" fill="${palette.muted}" letter-spacing="3">CONTRACT</text>
    <text x="1416" y="678" text-anchor="end" font-weight="800">${escapeXml(caLine)}</text>
  </g>

  <path d="M274 1252C392 1196 508 1194 628 1252" fill="none" stroke="${palette.accent}" stroke-opacity="0.75" stroke-width="4"/>
  <text x="451" y="1308" text-anchor="middle" fill="${palette.ink}" font-family="Brush Script MT, Segoe Script, cursive" font-size="54">${escapeXml(signer)}</text>
  <text x="451" y="1356" text-anchor="middle" fill="${palette.muted}" font-family="Arial, sans-serif" font-size="24" letter-spacing="4">CREATOR SIGNATURE</text>

  <path d="M972 1252C1090 1196 1206 1194 1326 1252" fill="none" stroke="${palette.accent}" stroke-opacity="0.75" stroke-width="4"/>
  <text x="1149" y="1308" text-anchor="middle" fill="${palette.ink}" font-family="Arial Black, Arial, sans-serif" font-size="38">PUMP-R</text>
  <text x="1149" y="1356" text-anchor="middle" fill="${palette.muted}" font-family="Arial, sans-serif" font-size="24" letter-spacing="4">ISSUANCE DESK</text>
</svg>`;
}

async function renderSvgToJpegDataUrl(svg) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"]
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:#05090d">${svg}</body></html>`, { waitUntil: "networkidle", timeout: 45_000 });
    for (const quality of [92, 84, 76]) {
      const buffer = await page.screenshot({
        type: "jpeg",
        quality,
        clip: { x: 0, y: 0, width: 1400, height: 1400 }
      });
      if (buffer.length <= 980 * 1024 || quality === 76) {
        return `data:image/jpeg;base64,${buffer.toString("base64")}`;
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function generateSignedBillImageDataUrl(options = {}) {
  const svg = buildSignedBillSvg(options);
  return renderSvgToJpegDataUrl(svg);
}

module.exports = {
  buildSignedBillSvg,
  generateSignedBillImageDataUrl,
  isSignedBillRequested,
  normalizeVisualMode,
  serialForBill
};
