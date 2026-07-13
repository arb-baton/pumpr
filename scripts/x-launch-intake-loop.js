const { main } = require("./x-launch-intake");

const DEFAULT_INTERVAL_SECONDS = 15;

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
  if (!successCount && failureCount) {
    process.exitCode = 1;
  }
}

runLoop().catch((error) => {
  console.error(`[x-launch-loop] ${error?.message || error}`);
  process.exitCode = 1;
});
