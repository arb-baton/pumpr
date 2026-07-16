const TWEX_CREATE_URL = "https://api.twexapi.io/twitter/tweets/create";
const { createdTweetId, verifyTweetOnX } = require("./x-post-verification");

function cleanText(value, max = 280) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function twexApiKey() {
  return String(
    process.env.TWEXAPI_BEARER_TOKEN ||
      process.env.TWITTERX_API_KEY ||
      process.env.TWEX_API_KEY ||
      ""
  ).trim();
}

function pumprCookie() {
  return String(
    process.env.PUMPR_TWEX_X_COOKIE ||
      process.env.TWEXAPI_PUMPR_X_COOKIE ||
      process.env.X_PUMPR_COOKIE ||
      process.env.PUMPR_X_COOKIE ||
      ""
  ).trim();
}

async function postTweet(text) {
  const apiKey = twexApiKey();
  const cookie = pumprCookie();
  const tweet = cleanText(text);

  if (!tweet) throw new Error("Set PUMPR_TWEET_TEXT or pass tweet text as the first argument.");
  if (tweet.length > 280) throw new Error("Tweet is longer than 280 characters.");
  if (!apiKey) throw new Error("Set TWEXAPI_BEARER_TOKEN as a GitHub secret.");
  if (!cookie) throw new Error("Set PUMPR_TWEX_X_COOKIE as a GitHub secret so the tweet posts from @pumpr_fun.");

  if (isTruthy(process.env.PUMPR_TWEET_DRY_RUN)) {
    console.log("[pumpr-tweet] Dry run tweet:");
    console.log(tweet);
    return { dryRun: true };
  }

  const response = await fetch(TWEX_CREATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tweet_content: tweet,
      cookie
    })
  });
  const bodyText = await response.text();
  let payload = {};
  try {
    payload = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    payload = { raw: bodyText };
  }
  if (!response.ok || Number(payload?.code || response.status) >= 400) {
    throw new Error(payload?.msg || payload?.message || payload?.raw || `TwexAPI returned ${response.status}`);
  }
  const tweetId = createdTweetId(payload);
  if (!tweetId) throw new Error("TwexAPI accepted the create request but did not return a created tweet ID.");
  const verified = await verifyTweetOnX(tweetId, "pumpr_fun");
  console.log(`[pumpr-tweet] Tweet posted and verified: https://x.com/${verified.authorUsername || "pumpr_fun"}/status/${tweetId}`);
  return payload;
}

if (require.main === module) {
  postTweet(process.env.PUMPR_TWEET_TEXT || process.argv.slice(2).join(" ")).catch((error) => {
    console.error(`[pumpr-tweet] ${error?.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { postTweet };
