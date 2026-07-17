const { expect } = require("chai");
const { dispatchNextRun } = require("../scripts/x-launch-intake-loop");
const { _test: intakeTest } = require("../scripts/x-launch-intake");

describe("X launch intake loop", function () {
  const originalEnv = { ...process.env };

  afterEach(function () {
    process.env = { ...originalEnv };
  });

  it("queues the next workflow after a bounded worker finishes", async function () {
    process.env.X_LAUNCH_SELF_DISPATCH = "true";
    process.env.GITHUB_TOKEN = "test-token";
    process.env.GITHUB_REPOSITORY = "pump-r/app";
    process.env.X_LAUNCH_WORKFLOW_REF = "main";
    let request;

    const dispatched = await dispatchNextRun(async (url, options) => {
      request = { url, options };
      return { ok: true, status: 204, text: async () => "" };
    });

    expect(dispatched).to.equal(true);
    expect(request.url).to.equal("https://api.github.com/repos/pump-r/app/actions/workflows/x-launch-intake.yml/dispatches");
    expect(request.options.method).to.equal("POST");
    expect(request.options.headers.Authorization).to.equal("Bearer test-token");
    expect(JSON.parse(request.options.body)).to.deep.equal({ ref: "main" });
  });

  it("does not dispatch when continuous handoff is disabled", async function () {
    process.env.X_LAUNCH_SELF_DISPATCH = "false";
    const dispatched = await dispatchNextRun(async () => {
      throw new Error("fetch should not be called");
    });
    expect(dispatched).to.equal(false);
  });

  it("reprocesses a complete launch request restored without a status", function () {
    const tweet = {
      id: "2078148349828469070",
      text: "@pumpr_launch create token on pump fun name nftguy ticker nftguy description nftguy"
    };
    const state = { processedTweetIds: [tweet.id], processedStatusByTweetId: {} };

    expect(intakeTest.shouldReprocessTweet(tweet, state)).to.equal(true);
  });
});
