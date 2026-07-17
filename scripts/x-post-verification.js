function createdTweetId(payload = {}) {
  const candidates = [
    payload?.data?.tweet_id,
    payload?.data?.id,
    payload?.data?.id_str,
    payload?.data?.rest_id,
    payload?.data?.tweet?.id,
    payload?.data?.tweet?.id_str,
    payload?.data?.tweetId,
    payload?.data?.tweet_id_str,
    payload?.data?.create_tweet?.tweet_results?.result?.rest_id,
    payload?.data?.create_tweet?.tweet_results?.result?.legacy?.id_str,
    payload?.data?.createTweet?.tweet_results?.result?.rest_id,
    payload?.tweet_id,
    payload?.tweetId,
    payload?.id_str,
    payload?.id,
    payload?.result?.tweet_id,
    payload?.result?.id
  ];
  return candidates.map((value) => String(value || "").trim()).find((value) => /^\d{5,}$/.test(value)) || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyTweetOnX(tweetId, expectedUsername = "", fetchImpl = globalThis.fetch) {
  const id = String(tweetId || "").trim();
  if (!/^\d{5,}$/.test(id)) throw new Error("TwexAPI did not return a valid created tweet ID.");
  const expected = String(expectedUsername || "").replace(/^@/, "").trim().toLowerCase();
  let lastDetail = "not visible from X";

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetchImpl(`https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(id)}&lang=en`, {
        headers: { "User-Agent": "PumpR-X-Post-Verification/1.0" }
      });
      const body = await response.json().catch(() => ({}));
      const returnedId = String(body?.id_str || body?.id || "").trim();
      const author = String(body?.user?.screen_name || "").replace(/^@/, "").trim().toLowerCase();
      if (response.ok && returnedId === id) {
        if (expected && author && author !== expected) {
          throw new Error(`Tweet ${id} posted from @${author}, expected @${expected}. Check the configured X cookie.`);
        }
        return { ok: true, tweetId: id, authorUsername: author };
      }
      lastDetail = `X verification returned HTTP ${response.status}`;
    } catch (error) {
      if (/posted from @/i.test(String(error?.message || ""))) throw error;
      lastDetail = error?.message || String(error);
    }
    if (attempt < 4) await sleep(1500);
  }
  throw new Error(`TwexAPI returned tweet ${id}, but it could not be verified on X: ${lastDetail}`);
}

module.exports = { createdTweetId, verifyTweetOnX };
