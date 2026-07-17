const { expect } = require("chai");
const { createdTweetId, verifyTweetOnX } = require("../scripts/x-post-verification");

describe("X post verification", function () {
  it("extracts a created tweet ID from TwexAPI response shapes", function () {
    expect(createdTweetId({ data: { tweet_id: "1234567890" } })).to.equal("1234567890");
    expect(createdTweetId({ result: { id: "9876543210" } })).to.equal("9876543210");
    expect(createdTweetId({ success: true })).to.equal("");
  });

  it("extracts IDs from GraphQL-style and camel-case TwexAPI responses", function () {
    expect(createdTweetId({
      data: { create_tweet: { tweet_results: { result: { rest_id: "2078152123569656154" } } } }
    })).to.equal("2078152123569656154");
    expect(createdTweetId({ data: { tweetId: "2078152123569656154" } })).to.equal("2078152123569656154");
  });

  it("verifies the tweet ID and posting account on public X", async function () {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id_str: "1234567890", user: { screen_name: "airi_agi" } })
    });
    const result = await verifyTweetOnX("1234567890", "@airi_agi", fetchImpl);
    expect(result).to.deep.equal({ ok: true, tweetId: "1234567890", authorUsername: "airi_agi" });
  });

  it("rejects a tweet posted from the wrong cookie account", async function () {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id_str: "1234567890", user: { screen_name: "wrong_account" } })
    });
    await expect(verifyTweetOnX("1234567890", "airi_agi", fetchImpl))
      .to.be.rejectedWith("posted from @wrong_account, expected @airi_agi");
  });
});
