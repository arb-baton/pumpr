const { execSync } = require("child_process");

const DOMAIN = process.env.PUMPR_PRODUCTION_DOMAIN || "pump-r.fun";
const SKIP = process.env.PUMPR_SKIP_AUTO_DEPLOY === "1";

function run(command, args, options = {}) {
  const cmd = `${[command, ...args].join(" ")}${options.capture ? " 2>&1" : ""}`;
  return execSync(cmd, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_CONFIG_PACKAGE_LOCK: "false"
    },
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
}

function npx(args, options = {}) {
  return run("npx", args, options);
}

function currentBranch() {
  return run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }).trim();
}

function parseDeploymentUrl(output = "") {
  const clean = String(output || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  const matches = [...clean.matchAll(/https:\/\/[^\s"'<>]+\.vercel\.app/g)].map((match) => match[0]);
  return matches.reverse().find((url) => !url.includes("vercel.com")) || matches.reverse()[0] || "";
}

async function verifyDomain() {
  if (typeof fetch !== "function") return;
  const response = await fetch(`https://${DOMAIN}/airdrop`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  });
  if (!response.ok) {
    throw new Error(`${DOMAIN} returned HTTP ${response.status}`);
  }
}

async function main() {
  if (SKIP) {
    console.log("[pumpr] PUMPR_SKIP_AUTO_DEPLOY=1, skipping Vercel deploy.");
    return;
  }

  const branch = currentBranch();
  if (branch !== "main") {
    console.log(`[pumpr] Current branch is ${branch}; production deploy only runs on main.`);
    return;
  }

  console.log("[pumpr] Building production output...");
  npx(["vercel", "build", "--prod", "--yes"]);

  console.log("[pumpr] Deploying prebuilt output to Vercel production...");
  const deployOutput = npx(["vercel", "deploy", "--prebuilt", "--prod", "--yes"], { capture: true });
  process.stdout.write(deployOutput);
  const deploymentUrl = parseDeploymentUrl(deployOutput);
  if (!deploymentUrl) {
    throw new Error("Could not find Vercel deployment URL in deploy output");
  }

  console.log(`[pumpr] Aliasing ${DOMAIN} to ${deploymentUrl}...`);
  npx(["vercel", "alias", "set", deploymentUrl, DOMAIN]);

  console.log(`[pumpr] Verifying https://${DOMAIN}/airdrop...`);
  await verifyDomain();
  console.log(`[pumpr] ${DOMAIN} is now on the latest production deployment.`);
}

main().catch((error) => {
  console.error(`[pumpr] Production deploy failed: ${error?.message || error}`);
  process.exitCode = 1;
});
