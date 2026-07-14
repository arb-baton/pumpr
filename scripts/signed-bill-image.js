const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SIGNED_BILL_KEYWORDS = /\b(signed\s+bill|bill\s+token|signed\s+note|treasury\s+note|treasury\s+bill|bond\s+note|note\s+token|bill\s+style|certificate\s+token|print\s+(?:a\s+)?(?:signed\s+)?bill|issue\s+(?:a\s+)?(?:signed\s+)?bill)\b/i;
const BILL_TEMPLATE_PATH = path.join(__dirname, "assets", "pumpr-parody-bill-template.png");
const BILL_TEMPLATE_WIDTH = 1774;
const BILL_TEMPLATE_HEIGHT = 887;

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

function billTemplateDataUri() {
  try {
    return `data:image/png;base64,${fs.readFileSync(BILL_TEMPLATE_PATH).toString("base64")}`;
  } catch {
    return "";
  }
}

function fitFontSize(value = "", base = 42, min = 24, maxChars = 18) {
  const length = String(value || "").length;
  if (length <= maxChars) return base;
  return Math.max(min, Math.floor(base * (maxChars / length)));
}

function fieldBackplate(x, y, width, height, opacity = 0.84) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="#efe5c6" fill-opacity="${opacity}" stroke="#d4c7a5" stroke-opacity="0.38" stroke-width="1"/>`;
}

function sealOverlay({ x, y, ticker }) {
  const mono = monogramFor("", ticker).slice(0, 4);
  return `
    <g transform="translate(${x} ${y})">
      <circle cx="0" cy="0" r="98" fill="#efe5c6" fill-opacity="0.96" stroke="#12692b" stroke-width="8"/>
      <circle cx="0" cy="0" r="80" fill="none" stroke="#12692b" stroke-width="3" stroke-dasharray="5 5"/>
      <text x="0" y="-10" text-anchor="middle" fill="#12692b" font-family="Georgia, serif" font-size="${fitFontSize(mono, 46, 30, 4)}" font-weight="900">${escapeXml(mono)}</text>
      <text x="0" y="28" text-anchor="middle" fill="#12692b" font-family="Georgia, serif" font-size="22" font-weight="800">SERIES</text>
      <text x="0" y="58" text-anchor="middle" fill="#12692b" font-family="Georgia, serif" font-size="26" font-weight="900">2026</text>
    </g>`;
}

function buildSignedBillSvg(options = {}) {
  const name = cleanText(options.name || "Untitled Bill", 32);
  const ticker = cleanText(options.ticker || "BILL", 13).replace(/^\$/, "").toUpperCase();
  const description = cleanText(options.description || "On-chain signed issue", 92);
  const launchpad = cleanText(options.launchpad || "pumpfun", 30).toLowerCase();
  const creatorHandle = cleanText(options.creatorHandle || options.authorUsername || "unknown", 32).replace(/^@/, "");
  const creatorId = cleanText(options.creatorId || "", 40);
  const signer = creatorHandle ? `@${creatorHandle}` : "X requester";
  const serial = cleanText(options.serial || serialForBill(options), 24);
  const tokenAddress = shortAddress(options.tokenAddress || options.contractAddress || "");
  const sourceImageUrl = cleanText(options.sourceImageUrl || "", 500);
  const chain = chainLabel(launchpad);
  const hasPortrait = /^https?:\/\//i.test(sourceImageUrl);
  const caLine = tokenAddress ? `CA ${tokenAddress}` : "CA pending issuance";
  const xIdLine = creatorId ? `X ID ${creatorId}` : `X ID @${creatorHandle || "unknown"}`;
  const leftSerial = serial.replace(/-/g, "").slice(0, 10) || "PUMPR0001";
  const rightSerial = `${leftSerial.slice(0, 6)}${ticker.slice(0, 4)}`.slice(0, 12);
  const template = billTemplateDataUri();
  const nameSize = fitFontSize(name, 42, 25, 17);
  const tickerSize = fitFontSize(`$${ticker}`, 44, 27, 10);
  const signatureSize = fitFontSize(signer, 42, 26, 15);
  const caSize = fitFontSize(caLine, 24, 14, 24);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BILL_TEMPLATE_WIDTH}" height="${BILL_TEMPLATE_HEIGHT}" viewBox="0 0 ${BILL_TEMPLATE_WIDTH} ${BILL_TEMPLATE_HEIGHT}">
  <defs>
    <clipPath id="portraitClip"><ellipse cx="887" cy="442" rx="184" ry="260"/></clipPath>
    <filter id="inkShadow" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.55" flood-color="#efe5c6" flood-opacity="0.55"/>
    </filter>
  </defs>

  ${template ? `<image href="${template}" x="0" y="0" width="${BILL_TEMPLATE_WIDTH}" height="${BILL_TEMPLATE_HEIGHT}" preserveAspectRatio="none"/>` : `<rect width="${BILL_TEMPLATE_WIDTH}" height="${BILL_TEMPLATE_HEIGHT}" fill="#efe5c6"/>`}
  ${hasPortrait ? `<image href="${escapeXml(sourceImageUrl)}" x="703" y="257" width="368" height="520" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/>` : ""}

  <g font-family="Georgia, 'Times New Roman', serif" filter="url(#inkShadow)">
    ${fieldBackplate(296, 222, 360, 70, 0.72)}
    <text x="476" y="273" text-anchor="middle" fill="#146b2d" font-family="Courier New, monospace" font-size="46" font-weight="800" letter-spacing="4">${escapeXml(leftSerial)}</text>

    ${fieldBackplate(1118, 222, 388, 70, 0.72)}
    <text x="1312" y="273" text-anchor="middle" fill="#146b2d" font-family="Courier New, monospace" font-size="44" font-weight="800" letter-spacing="4">${escapeXml(rightSerial)}</text>

    ${sealOverlay({ x: 1328, y: 457, ticker })}

    ${fieldBackplate(282, 566, 430, 150, 0.96)}
    <text x="497" y="628" text-anchor="middle" fill="#11170d" font-size="${nameSize}" font-weight="700">${escapeXml(name)}</text>
    <text x="497" y="686" text-anchor="middle" fill="#11170d" font-family="Arial Black, Arial, sans-serif" font-size="${tickerSize}" font-weight="900">$${escapeXml(ticker)}</text>

    ${fieldBackplate(1184, 580, 356, 122, 0.96)}
    <text x="1362" y="632" text-anchor="middle" fill="#11170d" font-family="Arial Black, Arial, sans-serif" font-size="${tickerSize}" font-weight="900">$${escapeXml(ticker)}</text>
    <text x="1362" y="678" text-anchor="middle" fill="#11170d" font-family="Arial, sans-serif" font-size="20" font-weight="800">${escapeXml(chain)}</text>

    ${fieldBackplate(296, 704, 392, 88, 0.96)}
    <text x="492" y="760" text-anchor="middle" fill="#10170d" font-family="Brush Script MT, Segoe Script, cursive" font-size="${signatureSize}">${escapeXml(signer)}</text>

    ${fieldBackplate(1190, 704, 392, 88, 0.96)}
    <text x="1386" y="760" text-anchor="middle" fill="#10170d" font-family="Brush Script MT, Segoe Script, cursive" font-size="42">Pump-r Reserve</text>

    ${fieldBackplate(704, 790, 466, 62, 0.96)}
    <text x="937" y="826" text-anchor="middle" fill="#11170d" font-family="Arial, sans-serif" font-size="${caSize}" font-weight="800">${escapeXml(caLine)}</text>
    <text x="937" y="850" text-anchor="middle" fill="#11170d" font-family="Georgia, serif" font-size="16" font-style="italic">SPECIMEN - ${escapeXml(description)} - ${escapeXml(xIdLine)}</text>
  </g>
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
    const page = await browser.newPage({ viewport: { width: BILL_TEMPLATE_WIDTH, height: BILL_TEMPLATE_HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:#05090d">${svg}</body></html>`, { waitUntil: "networkidle", timeout: 45_000 });
    for (const quality of [92, 84, 76]) {
      const buffer = await page.screenshot({
        type: "jpeg",
        quality,
        clip: { x: 0, y: 0, width: BILL_TEMPLATE_WIDTH, height: BILL_TEMPLATE_HEIGHT }
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
