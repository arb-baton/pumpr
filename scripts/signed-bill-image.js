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

function engravedText({
  x,
  y,
  text,
  anchor = "middle",
  fill = "#17140d",
  family = "Georgia, 'Times New Roman', serif",
  size = 34,
  weight = 800,
  letterSpacing = 0,
  fontStyle = "",
  stroke = "#070805",
  strokeWidth = 0.42,
  opacity = 0.94
}) {
  const content = escapeXml(text);
  const letterAttr = letterSpacing ? ` letter-spacing="${letterSpacing}"` : "";
  const styleAttr = fontStyle ? ` font-style="${fontStyle}"` : "";
  const base = `x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}"${letterAttr}${styleAttr}`;
  return `
    <text ${base} fill="#f3ecd4" fill-opacity="0.28" transform="translate(1.1 1.1)">${content}</text>
    <text ${base} fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-opacity="0.2" stroke-width="${strokeWidth}" paint-order="stroke">${content}</text>
    <text ${base} fill="none" stroke="#f4ecd1" stroke-opacity="0.18" stroke-width="0.55" transform="translate(-0.7 -0.7)">${content}</text>`;
}

function sealOverlay({ x, y, ticker }) {
  const mono = monogramFor("", ticker).slice(0, 4);
  return `
    <g transform="translate(${x} ${y})">
      ${engravedText({ x: 0, y: -2, text: mono, fill: "#176d32", stroke: "#0d3519", size: fitFontSize(mono, 48, 30, 4), weight: 900 })}
      ${engravedText({ x: 0, y: 36, text: "SERIES", fill: "#176d32", stroke: "#0d3519", size: 20, weight: 900, letterSpacing: 1.4 })}
      ${engravedText({ x: 0, y: 64, text: "2026", fill: "#176d32", stroke: "#0d3519", size: 24, weight: 900 })}
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
  const tokenAddress = cleanText(options.tokenAddress || options.contractAddress || "", 80);
  const sourceImageUrl = cleanText(options.sourceImageUrl || "", 500);
  const chain = chainLabel(launchpad);
  const hasPortrait = /^https?:\/\//i.test(sourceImageUrl);
  const caLine = tokenAddress ? `CA ${tokenAddress}` : "";
  const xIdLine = creatorId ? `X ID ${creatorId}` : `X ID @${creatorHandle || "unknown"}`;
  const leftSerial = serial.replace(/-/g, "").slice(0, 10) || "PUMPR0001";
  const rightSerial = `${leftSerial.slice(0, 6)}${ticker.slice(0, 4)}`.slice(0, 12);
  const template = billTemplateDataUri();
  const nameSize = fitFontSize(name, 42, 25, 17);
  const tickerSize = fitFontSize(`$${ticker}`, 44, 27, 10);
  const signatureSize = fitFontSize(signer, 42, 26, 15);
  const caSize = fitFontSize(caLine, 22, 13, 24);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${BILL_TEMPLATE_WIDTH}" height="${BILL_TEMPLATE_HEIGHT}" viewBox="0 0 ${BILL_TEMPLATE_WIDTH} ${BILL_TEMPLATE_HEIGHT}">
  <defs>
    <clipPath id="portraitClip"><ellipse cx="887" cy="442" rx="184" ry="260"/></clipPath>
  </defs>

  ${template ? `<image href="${template}" x="0" y="0" width="${BILL_TEMPLATE_WIDTH}" height="${BILL_TEMPLATE_HEIGHT}" preserveAspectRatio="none"/>` : `<rect width="${BILL_TEMPLATE_WIDTH}" height="${BILL_TEMPLATE_HEIGHT}" fill="#efe5c6"/>`}
  ${hasPortrait ? `<image href="${escapeXml(sourceImageUrl)}" x="703" y="257" width="368" height="520" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/>` : ""}

  <g font-family="Georgia, 'Times New Roman', serif">
    ${engravedText({ x: 472, y: 268, text: leftSerial, fill: "#146b2d", stroke: "#092512", family: "Courier New, monospace", size: 46, weight: 800, letterSpacing: 4 })}
    ${engravedText({ x: 1312, y: 268, text: rightSerial, fill: "#146b2d", stroke: "#092512", family: "Courier New, monospace", size: 44, weight: 800, letterSpacing: 4 })}

    ${sealOverlay({ x: 1328, y: 457, ticker })}

    ${engravedText({ x: 474, y: 606, text: name, fill: "#15120d", stroke: "#050504", size: nameSize, weight: 800 })}
    ${engravedText({ x: 474, y: 662, text: `$${ticker}`, fill: "#15120d", stroke: "#050504", family: "Arial Black, Arial, sans-serif", size: tickerSize, weight: 900 })}

    ${engravedText({ x: 1360, y: 606, text: `$${ticker}`, fill: "#15120d", stroke: "#050504", family: "Arial Black, Arial, sans-serif", size: tickerSize, weight: 900 })}
    ${engravedText({ x: 1360, y: 650, text: chain, fill: "#15120d", stroke: "#050504", family: "Arial, sans-serif", size: 20, weight: 800 })}

    ${engravedText({ x: 458, y: 706, text: signer, fill: "#15120d", stroke: "#050504", family: "Brush Script MT, Segoe Script, cursive", size: signatureSize, weight: 400 })}

    ${engravedText({ x: 1354, y: 704, text: "Pump-r Reserve", fill: "#15120d", stroke: "#050504", family: "Brush Script MT, Segoe Script, cursive", size: 42, weight: 400 })}

    ${caLine ? engravedText({ x: 930, y: 846, text: caLine, fill: "#15120d", stroke: "#050504", family: "Arial, sans-serif", size: caSize, weight: 800, opacity: 0.82 }) : ""}
    ${engravedText({ x: 930, y: 864, text: `SPECIMEN - ${description} - ${xIdLine}`, fill: "#15120d", stroke: "#050504", family: "Georgia, serif", size: 14, weight: 500, fontStyle: "italic", opacity: 0.68 })}
  </g>
</svg>`;
}

function buildContractAddressOverlaySvg(options = {}) {
  const sourceImageUrl = cleanText(options.sourceImageUrl || "", 1000);
  const tokenAddress = cleanText(options.tokenAddress || options.contractAddress || "", 80);
  if (!/^https?:\/\//i.test(sourceImageUrl)) throw new Error("A hosted source image is required for the contract-address overlay.");
  if (!tokenAddress) throw new Error("A token contract address is required for the image overlay.");
  const addressSize = fitFontSize(tokenAddress, 31, 18, 44);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="caBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#070a0e" stop-opacity="0.96"/>
      <stop offset="1" stop-color="#111827" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="#080b10"/>
  <image href="${escapeXml(sourceImageUrl)}" x="0" y="0" width="1200" height="1010" preserveAspectRatio="xMidYMid meet"/>
  <rect x="0" y="1010" width="1200" height="190" fill="url(#caBar)"/>
  <rect x="0" y="1010" width="1200" height="5" fill="#7cf7c9"/>
  <text x="600" y="1071" text-anchor="middle" fill="#7cf7c9" font-family="Arial, sans-serif" font-size="27" font-weight="800" letter-spacing="4">CONTRACT ADDRESS</text>
  <text x="600" y="1144" text-anchor="middle" fill="#ffffff" font-family="Courier New, monospace" font-size="${addressSize}" font-weight="700">${escapeXml(tokenAddress)}</text>
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

async function generateContractAddressImageDataUrl(options = {}) {
  return renderSvgToJpegDataUrl(buildContractAddressOverlaySvg(options));
}

module.exports = {
  buildContractAddressOverlaySvg,
  buildSignedBillSvg,
  generateContractAddressImageDataUrl,
  generateSignedBillImageDataUrl,
  isSignedBillRequested,
  normalizeVisualMode,
  serialForBill
};
