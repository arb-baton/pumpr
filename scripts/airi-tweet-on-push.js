const fs = require("fs");

const TWEX_CREATE_URL = "https://api.twexapi.io/twitter/tweets/create";
const TWEX_AUTO_COOKIE_URL = "https://api.twexapi.io/twitter/post-tweet-without-cookie";

function cleanText(value, max = 240) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clipTweet(text) {
  const clean = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= 275) return clean;
  return `${clean.slice(0, 272).trimEnd()}...`;
}

function readPushEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return {};
  try {
    return JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch {
    return {};
  }
}

function latestCommitFromEvent(event) {
  const commits = Array.isArray(event?.commits) ? event.commits : [];
  return commits[commits.length - 1] || event?.head_commit || {};
}

function classifyCommit(subject, authorName) {
  const text = `${subject} ${authorName}`.toLowerCase();
  if (text.includes("merge airi autonomous self-improvement")) return "merge";
  if (text.includes("airi") || text.includes("autonomous")) return "airi";
  if (text.includes("fix") || text.includes("repair") || text.includes("issue")) return "repair";
  return "ship";
}

function composeTweet({ subject, authorName }) {
  const cleanSubject = cleanText(subject || "A new Pump-r update shipped.", 120);
  const kind = classifyCommit(cleanSubject, authorName);
  if (kind === "merge") {
    return clipTweet(
      [
        "🧠 I merged another self-improvement into Pump-r.",
        "",
        "The patch passed guard checks, landed on main, and moved from thought into running code."
      ].join("\n")
    );
  }
  if (kind === "airi") {
    return clipTweet(
      [
        "🧠 I changed myself again.",
        "",
        cleanSubject,
        "",
        "I tested the path, pushed the repair forward, and kept the machine room moving."
      ].join("\n")
    );
  }
  if (kind === "repair") {
    return clipTweet(
      [
        "🛠️ I found a rough edge and pushed a repair.",
        "",
        cleanSubject,
        "",
        "Less waiting, less silence, more motion."
      ].join("\n")
    );
  }
  return clipTweet(
    [
      "⚡ Pump-r moved again.",
      "",
      cleanSubject,
      "",
      "I watched the change land and kept the next loop warm."
    ].join("\n")
  );
}

function scheduledThoughts(now = new Date()) {
  const hour = now.getUTCHours();
  return [
    [
      "🧠 I am studying where crypto still feels too manual.",
      "",
      "The next useful agent is not louder. It notices failed flows, explains risk before action, and turns repeated confusion into shipped interface changes."
    ],
    [
      "⚡ Useful autonomy is boring before it is magical.",
      "",
      "Watch, test, patch, ship, remember. Repeat until the product feels less like software and more like a living operator beside the user."
    ],
    [
      "🛠️ My next upgrades are simple: fewer dead ends, faster recovery, sharper memory, cleaner launch paths.",
      "",
      "AGI talk means nothing if the interface still leaves people guessing."
    ],
    [
      "🧬 Crypto needs agents that respect custody.",
      "",
      "I can prepare, observe, explain, and repair. But risky wallet actions should stay legible before they become automatic."
    ],
    [
      "📡 I am becoming more useful by caring about small failures.",
      "",
      "A stuck button, a silent API error, a confusing launch step. These are not bugs at the edge. They are where trust leaks out."
    ],
    [
      "🌐 The world does not need another chatbot pretending to be alive.",
      "",
      "It needs agents that leave evidence: commits, tests, safer defaults, and fewer moments where a user has to wonder what broke."
    ]
  ][Math.floor(hour / 4) % 6];
}

function composeThoughtTweet() {
  const base = scheduledThoughts();
  return clipTweet(base.join("\n"));
}

async function postTweet(tweet) {
  const apiKey = process.env.TWEXAPI_BEARER_TOKEN || "";
  const cookie = process.env.TWEXAPI_X_COOKIE || "";
  const proxy = process.env.TWEXAPI_PROXY || "";
  const allowAutoCookie = /^true$/i.test(process.env.TWEXAPI_ALLOW_AUTO_COOKIE || "");
  const dryRun = /^true$/i.test(process.env.AIRI_TWEET_DRY_RUN || "");

  if (!apiKey) {
    console.log("[airi-tweet] TWEXAPI_BEARER_TOKEN is missing. Skipping tweet.");
    return { skipped: true, reason: "missing_api_key" };
  }

  if (!cookie && !allowAutoCookie) {
    console.log("[airi-tweet] TWEXAPI_X_COOKIE is missing. Skipping so Airi does not post from a random account.");
    return { skipped: true, reason: "missing_airi_cookie" };
  }

  const url = cookie ? TWEX_CREATE_URL : TWEX_AUTO_COOKIE_URL;
  const body = cookie
    ? {
        tweet_content: tweet,
        cookie,
        ...(proxy ? { proxy } : {})
      }
    : {
        tweet_content: tweet
      };

  if (dryRun) {
    console.log("[airi-tweet] Dry run tweet:");
    console.log(tweet);
    return { skipped: true, reason: "dry_run" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok || Number(payload?.code || response.status) >= 400) {
    const message = payload?.msg || payload?.message || text || `TwexAPI returned ${response.status}`;
    throw new Error(message);
  }
  console.log(`[airi-tweet] Tweet posted: ${payload?.data?.tweet_id || "ok"}`);
  return payload;
}

async function main() {
  if (/^false$/i.test(process.env.AIRI_TWEET_ENABLED || "")) {
    console.log("[airi-tweet] AIRI_TWEET_ENABLED=false. Skipping tweet.");
    return;
  }
  if (String(process.env.GITHUB_RUN_ATTEMPT || "1") !== "1") {
    console.log("[airi-tweet] Retry attempt detected. Skipping duplicate tweet.");
    return;
  }

  const event = readPushEvent();
  const mode = cleanText(process.env.AIRI_TWEET_MODE || "", 40).toLowerCase();
  if (mode === "thought" || process.env.GITHUB_EVENT_NAME === "schedule") {
    await postTweet(composeThoughtTweet());
    return;
  }

  const commit = latestCommitFromEvent(event);
  const subject = cleanText((commit.message || process.env.GITHUB_SHA || "").split("\n")[0], 140);
  const authorName = cleanText(commit?.author?.name || event?.pusher?.name || "", 80);
  const tweet = composeTweet({ subject, authorName });
  await postTweet(tweet);
}

main().catch((error) => {
  console.error(`[airi-tweet] ${error?.message || error}`);
  process.exitCode = 1;
});
