const { main } = require("./x-launch-intake");

// Keep this file in the workflow path filter so cookie refresh retries can be kicked from a code push.
const DEFAULT_INTERVAL_SECONDS = 30;
const DEFAULT_WORKFLOW = "x-launch-intake.yml";

function log(message) {
  console.log(`[x-launch-loop] ${message}`);
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function booleanEnv(name, fallback = false) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

async function dispatchNextRun(fetchImpl = globalThis.fetch) {
  if (!booleanEnv("X_LAUNCH_SELF_DISPATCH")) return false;

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const workflow = process.env.X_LAUNCH_WORKFLOW || DEFAULT_WORKFLOW;
  const ref = process.env.X_LAUNCH_WORKFLOW_REF || process.env.GITHUB_REF_NAME || "main";
  if (!token || !repository) {
    throw new Error("Self-dispatch requires GITHUB_TOKEN and GITHUB_REPOSITORY");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Self-dispatch requires Node.js 18 or newer");
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PumpR-X-Launch-Intake/1.0"
      },
      body: JSON.stringify({ ref })
    }
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub workflow dispatch failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }

  log(`Queued the next intake worker on ${ref}.`);
  return true;
}

async function runLoop() {
  const intervalSeconds = Math.max(10, Math.min(30, numberEnv("X_LAUNCH_LOOP_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS)));
  const maxRuns = Math.max(0, Math.floor(numberEnv("X_LAUNCH_LOOP_RUNS", 0)));
  let runCount = 0;
  let successCount = 0;
  let failureCount = 0;

  log(maxRuns > 0
    ? `Starting ${maxRuns} intake pass(es) every ${intervalSeconds}s.`
    : `Starting continuous intake every ${intervalSeconds}s.`);

  while (!maxRuns || runCount < maxRuns) {
    runCount += 1;
    log(`Pass ${runCount}${maxRuns ? `/${maxRuns}` : ""} starting.`);
    try {
      await main();
      successCount += 1;
      log(`Pass ${runCount} complete.`);
    } catch (error) {
      failureCount += 1;
      console.error(`[x-launch-loop] Pass ${runCount} failed: ${error?.message || error}`);
    }

    if (maxRuns && runCount >= maxRuns) break;
    await sleep(intervalSeconds * 1000);
  }

  log(`Finished. successful=${successCount} failed=${failureCount}`);
  if (maxRuns) {
    await dispatchNextRun();
  }
  if (!successCount && failureCount) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runLoop().catch((error) => {
    console.error(`[x-launch-loop] ${error?.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = { booleanEnv, dispatchNextRun, runLoop };
