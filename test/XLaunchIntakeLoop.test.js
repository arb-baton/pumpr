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

  it("extracts a mention from X browser GraphQL responses", function () {
    const payload = {
      data: {
        search_by_raw_query: {
          tweet: {
            rest_id: "2078152123569656154",
            legacy: {
              full_text: "Hi @pumpr_launch create token on pump fun name nft guy ticker nftguy",
              conversation_id_str: "2078152123569656154",
              created_at: "Fri Jul 17 16:17:31 +0000 2026",
              extended_entities: {
                media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/example.jpg" }]
              }
            },
            core: {
              user_results: {
                result: { rest_id: "1814688188352368640", legacy: { screen_name: "nftKingretard" } }
              }
            }
          }
        }
      }
    };

    const rows = intakeTest.browserGraphqlTweetRows(payload, "pumpr_launch");
    expect(rows).to.have.length(1);
    expect(rows[0]).to.include({ id: "2078152123569656154", authorUsername: "nftKingretard" });
    expect(rows[0].media[0].url).to.equal("https://pbs.twimg.com/media/example.jpg");
  });
});
