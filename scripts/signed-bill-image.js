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
  const denomination = ticker.slice(0, 4) || "MEME";
  const leftSerial = serial.replace(/-/g, "").slice(0, 10) || "PUMPR0001";
  const rightSerial = `${leftSerial.slice(0, 6)}${ticker.slice(0, 4)}`.slice(0, 12);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#eee7cb"/>
      <stop offset="0.48" stop-color="#d8d0ae"/>
      <stop offset="1" stop-color="#f3efd9"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="48%" r="64%">
      <stop offset="0" stop-color="#fbf8e7" stop-opacity="0.96"/>
      <stop offset="0.55" stop-color="#d6cfaa" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#aeb891" stop-opacity="0.35"/>
    </radialGradient>
    <pattern id="fineLines" width="18" height="18" patternUnits="userSpaceOnUse">
      <path d="M0 3H18M0 9H18M0 15H18" stroke="#183c25" stroke-opacity="0.09" stroke-width="0.8"/>
    </pattern>
    <pattern id="microText" width="170" height="24" patternUnits="userSpaceOnUse">
      <text x="0" y="16" fill="#315f3b" fill-opacity="0.13" font-family="Georgia, serif" font-size="13" letter-spacing="2">PUMP-R MEME NOTE</text>
    </pattern>
    <filter id="paperNoise">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" seed="8"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.075"/>
      </feComponentTransfer>
      <feBlend mode="multiply" in2="SourceGraphic"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#071209" flood-opacity="0.32"/>
    </filter>
    <clipPath id="portraitClip"><ellipse cx="800" cy="452" rx="150" ry="204"/></clipPath>
    <path id="topArc" d="M430 150C590 92 1010 92 1170 150"/>
    <path id="bottomArc" d="M430 834C590 892 1010 892 1170 834"/>
  </defs>

  <rect width="1600" height="1000" fill="#0a140d"/>
  <g filter="url(#softShadow)">
    <rect x="74" y="70" width="1452" height="860" rx="10" fill="url(#paper)"/>
    <rect x="74" y="70" width="1452" height="860" rx="10" fill="url(#fineLines)"/>
    <rect x="74" y="70" width="1452" height="860" rx="10" fill="url(#microText)"/>
    <rect x="74" y="70" width="1452" height="860" rx="10" fill="url(#centerGlow)" opacity="0.48"/>
    <rect x="74" y="70" width="1452" height="860" rx="10" fill="transparent" filter="url(#paperNoise)"/>
  </g>

  <rect x="108" y="104" width="1384" height="792" rx="6" fill="none" stroke="#163820" stroke-width="8"/>
  <rect x="132" y="128" width="1336" height="744" rx="4" fill="none" stroke="#4f7547" stroke-width="3"/>
  <rect x="154" y="150" width="1292" height="700" rx="3" fill="none" stroke="#17361f" stroke-width="2"/>
  <path d="M184 184H1416M184 816H1416" stroke="#17361f" stroke-width="3"/>
  <path d="M226 218C426 120 602 198 800 158C998 198 1174 120 1374 218" fill="none" stroke="#294f32" stroke-width="2.5" opacity="0.72"/>
  <path d="M226 782C426 880 602 802 800 842C998 802 1174 880 1374 782" fill="none" stroke="#294f32" stroke-width="2.5" opacity="0.72"/>
  <path d="M242 248C378 184 482 262 612 226C506 314 386 298 242 248Z" fill="none" stroke="#315f3b" stroke-width="2" opacity="0.68"/>
  <path d="M1358 248C1222 184 1118 262 988 226C1094 314 1214 298 1358 248Z" fill="none" stroke="#315f3b" stroke-width="2" opacity="0.68"/>
  <path d="M242 752C378 816 482 738 612 774C506 686 386 702 242 752Z" fill="none" stroke="#315f3b" stroke-width="2" opacity="0.68"/>
  <path d="M1358 752C1222 816 1118 738 988 774C1094 686 1214 702 1358 752Z" fill="none" stroke="#315f3b" stroke-width="2" opacity="0.68"/>

  <g fill="#17361f" font-family="Georgia, 'Times New Roman', serif">
    <text x="800" y="170" text-anchor="middle" font-size="48" font-weight="800" letter-spacing="2">PUMP-R RESERVE NOTE</text>
    <text x="800" y="214" text-anchor="middle" font-size="17" font-weight="700" letter-spacing="1.8">THIS NOTE IS MEMETIC TENDER FOR ON-CHAIN CULTURE AND PUBLIC LAUNCHES</text>
    <text x="800" y="842" text-anchor="middle" font-size="54" font-weight="900" letter-spacing="2">ONE MEME DOLLAR</text>
  </g>

  <g fill="#17361f" font-family="Georgia, 'Times New Roman', serif" font-weight="900">
    <text x="202" y="190" font-size="86">1</text>
    <text x="1398" y="190" text-anchor="end" font-size="86">1</text>
    <text x="202" y="840" font-size="86">1</text>
    <text x="1398" y="840" text-anchor="end" font-size="86">1</text>
  </g>
  <g fill="#315f3b" font-family="Courier New, monospace" font-size="29" font-weight="800">
    <text x="472" y="262" letter-spacing="3">${escapeXml(leftSerial)}</text>
    <text x="1128" y="262" text-anchor="end" letter-spacing="3">${escapeXml(rightSerial)}</text>
  </g>

  <g transform="translate(268 318)">
    <circle cx="0" cy="0" r="82" fill="none" stroke="#17361f" stroke-width="8"/>
    <circle cx="0" cy="0" r="62" fill="none" stroke="#4f7547" stroke-width="3"/>
    <text x="0" y="-10" text-anchor="middle" fill="#17361f" font-family="Georgia, serif" font-size="38" font-weight="900">P</text>
    <text x="0" y="32" text-anchor="middle" fill="#17361f" font-family="Arial, sans-serif" font-size="15" font-weight="800">PUMP-R</text>
  </g>

  <g transform="translate(1332 318)">
    <circle cx="0" cy="0" r="82" fill="none" stroke="#17361f" stroke-width="8"/>
    <circle cx="0" cy="0" r="62" fill="none" stroke="#4f7547" stroke-width="3"/>
    <text x="0" y="-8" text-anchor="middle" fill="#17361f" font-family="Georgia, serif" font-size="34" font-weight="900">${escapeXml(denomination)}</text>
    <text x="0" y="32" text-anchor="middle" fill="#17361f" font-family="Arial, sans-serif" font-size="14" font-weight="800">SERIES ${escapeXml(issuedAt.slice(0, 4))}</text>
  </g>

  <g>
    <ellipse cx="800" cy="452" rx="214" ry="274" fill="#efe9cf" stroke="#17361f" stroke-width="8"/>
    <ellipse cx="800" cy="452" rx="192" ry="248" fill="none" stroke="#4f7547" stroke-width="3" stroke-dasharray="12 12"/>
    <ellipse cx="800" cy="452" rx="158" ry="214" fill="#0b120d" opacity="0.92"/>
    ${hasPortrait ? `<image href="${escapeXml(sourceImageUrl)}" x="650" y="248" width="300" height="408" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)" opacity="0.96"/>` : `
      <ellipse cx="800" cy="452" rx="144" ry="198" fill="#d7d0ad" stroke="#17361f" stroke-width="3"/>
      <text x="800" y="428" text-anchor="middle" fill="#17361f" font-family="Georgia, serif" font-size="96" font-weight="900">${escapeXml(mono)}</text>
      <text x="800" y="496" text-anchor="middle" fill="#315f3b" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="4">SIGNED BILL</text>
    `}
  </g>

  <g fill="#17361f">
    <rect x="552" y="646" width="496" height="112" rx="18" fill="#eee7cb" fill-opacity="0.78" stroke="#17361f" stroke-width="3"/>
    <text x="800" y="690" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="900">${escapeXml(name)}</text>
    <text x="800" y="732" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="35" font-weight="900">$${escapeXml(ticker)}</text>
    <text x="800" y="756" text-anchor="middle" font-family="Georgia, serif" font-size="18" font-style="italic">${escapeXml(description)}</text>
  </g>

  <g font-family="Arial, sans-serif" font-size="21" fill="#17361f" font-weight="800">
    <text x="210" y="468">CHAIN</text>
    <text x="210" y="500" font-size="27">${escapeXml(chain)}</text>
    <text x="210" y="566">ISSUED</text>
    <text x="210" y="598" font-size="27">${escapeXml(issuedAt)}</text>
    <text x="210" y="664">IDENTITY</text>
    <text x="210" y="696" font-size="25">${escapeXml(xIdLine)}</text>

    <text x="1390" y="468" text-anchor="end">SIGNER</text>
    <text x="1390" y="500" text-anchor="end" font-size="27">${escapeXml(signer)}</text>
    <text x="1390" y="566" text-anchor="end">SERIAL</text>
    <text x="1390" y="598" text-anchor="end" font-size="27">${escapeXml(serial)}</text>
    <text x="1390" y="664" text-anchor="end">CONTRACT</text>
    <text x="1390" y="696" text-anchor="end" font-size="25">${escapeXml(caLine)}</text>
  </g>

  <g fill="#17361f">
    <path d="M266 762C356 722 448 722 538 762" fill="none" stroke="#17361f" stroke-width="3"/>
    <text x="402" y="786" text-anchor="middle" font-family="Brush Script MT, Segoe Script, cursive" font-size="43">${escapeXml(signer)}</text>
    <text x="402" y="820" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3">CREATOR SIGNATURE</text>

    <path d="M1062 762C1152 722 1244 722 1334 762" fill="none" stroke="#17361f" stroke-width="3"/>
    <text x="1198" y="786" text-anchor="middle" font-family="Brush Script MT, Segoe Script, cursive" font-size="43">Pump-r Reserve</text>
    <text x="1198" y="820" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="800" letter-spacing="3">ISSUANCE DESK</text>
  </g>

  <g opacity="0.28" fill="none" stroke="#17361f" stroke-width="1.4">
    <path d="M156 500C250 442 344 558 438 500C532 442 626 558 720 500C814 442 908 558 1002 500C1096 442 1190 558 1284 500C1378 442 1472 558 1566 500"/>
    <path d="M156 532C250 474 344 590 438 532C532 474 626 590 720 532C814 474 908 590 1002 532C1096 474 1190 590 1284 532C1378 474 1472 590 1566 532"/>
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:#05090d">${svg}</body></html>`, { waitUntil: "networkidle", timeout: 45_000 });
    for (const quality of [92, 84, 76]) {
      const buffer = await page.screenshot({
        type: "jpeg",
        quality,
        clip: { x: 0, y: 0, width: 1600, height: 1000 }
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
