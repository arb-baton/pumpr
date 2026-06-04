const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

dotenv.config();

const ROUTER_BY_CHAIN = {
  1: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  8453: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  143: ethers.ZeroAddress,
  11155111: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  31337: ethers.ZeroAddress
};

function readTargetChainId() {
  const value = Number(process.env.TARGET_CHAIN_ID || process.env.CHAIN_ID || 0);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Set TARGET_CHAIN_ID, for example 8453 for Base or 143 for Monad.");
  }
  return Math.floor(value);
}

function pickRpcUrl(chainId) {
  const byChain = process.env[`RPC_URL_${chainId}`] || "";
  const base = chainId === 8453 ? process.env.BASE_RPC_URL || "https://mainnet.base.org" : "";
  const monad = chainId === 143 ? process.env.MONAD_RPC_URL || "https://rpc.monad.xyz" : "";
  const mainnet = chainId === 1 ? process.env.MAINNET_RPC_URL || process.env.RPC_URL || "" : "";
  const value = process.env.TARGET_RPC_URL || byChain || base || monad || mainnet || process.env.RPC_URL || "";
  if (!value.trim()) throw new Error(`No RPC URL configured for chain ${chainId}.`);
  return value.trim();
}

function readLaunchFeeWei() {
  if (process.env.LAUNCH_FEE_WEI) return BigInt(process.env.LAUNCH_FEE_WEI);
  if (process.env.LAUNCH_FEE_ETH) return ethers.parseEther(process.env.LAUNCH_FEE_ETH);
  return ethers.parseEther("0.0015");
}

async function main() {
  const root = path.join(__dirname, "..");
  const artifactPath = path.join(root, "artifacts", "contracts", "MemeLaunchFactory.sol", "MemeLaunchFactory.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing artifact: ${artifactPath}. Run npm run compile first.`);
  }

  const targetChainId = readTargetChainId();
  const rpcUrl = pickRpcUrl(targetChainId);
  const privateKey = String(process.env.PRIVATE_KEY || "").trim();
  if (!privateKey) throw new Error("PRIVATE_KEY is required");

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(rpcUrl, targetChainId);
  const wallet = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
  const chain = await provider.getNetwork();
  if (Number(chain.chainId) !== targetChainId) {
    throw new Error(`Unexpected chainId ${chain.chainId}. RPC must point to chain ${targetChainId}.`);
  }
  const balanceWei = await provider.getBalance(wallet.address);
  console.log("Deployer balance:", `${ethers.formatEther(balanceWei)} ETH`);
  if (balanceWei <= 0n) {
    throw new Error(`Deployer has 0 ETH on chain ${targetChainId}. Fund ${wallet.address} on that chain and retry.`);
  }

  const feeRecipient = process.env.FEE_RECIPIENT || wallet.address;
  const platformFeeRecipient = process.env.PLATFORM_FEE_RECIPIENT || wallet.address;
  const feeBps = process.env.FEE_BPS ? Number(process.env.FEE_BPS) : 50;
  const launchFeeWei = readLaunchFeeWei();
  const virtualEthReserve = process.env.VIRTUAL_ETH_RESERVE
    ? ethers.parseEther(process.env.VIRTUAL_ETH_RESERVE)
    : ethers.parseEther("0.5");
  const virtualTokenReserve = process.env.VIRTUAL_TOKEN_RESERVE
    ? ethers.parseUnits(process.env.VIRTUAL_TOKEN_RESERVE, 18)
    : ethers.parseUnits("1000000", 18);
  const graduationTargetEth = process.env.GRADUATION_TARGET_ETH
    ? ethers.parseEther(process.env.GRADUATION_TARGET_ETH)
    : ethers.parseEther("12");
  const chainDexRouter = process.env[`DEX_ROUTER_${targetChainId}`] || "";
  const legacyDexRouter = targetChainId === 1 ? process.env.DEX_ROUTER || "" : "";
  const dexRouter = chainDexRouter || legacyDexRouter || ROUTER_BY_CHAIN[targetChainId] || ethers.ZeroAddress;
  const lpRecipient = process.env.LP_RECIPIENT || feeRecipient;

  const feeData = await provider.getFeeData();
  const latestBlock = await provider.getBlock("latest");
  const baseFeePerGas = latestBlock?.baseFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("1", "gwei");
  const maxPriorityFeePerGas = process.env.DEPLOY_PRIORITY_FEE_GWEI
    ? ethers.parseUnits(process.env.DEPLOY_PRIORITY_FEE_GWEI, "gwei")
    : feeData.maxPriorityFeePerGas ?? 100000n;
  const maxFeePerGas = process.env.DEPLOY_MAX_FEE_GWEI
    ? ethers.parseUnits(process.env.DEPLOY_MAX_FEE_GWEI, "gwei")
    : baseFeePerGas + maxPriorityFeePerGas + 100000n;

  console.log("Deploying with account:", wallet.address);
  console.log("Chain ID:", chain.chainId.toString());
  console.log("dexRouter:", dexRouter);
  console.log("launchFeeWei:", launchFeeWei.toString());

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(
    feeRecipient,
    platformFeeRecipient,
    feeBps,
    launchFeeWei,
    virtualEthReserve,
    virtualTokenReserve,
    graduationTargetEth,
    dexRouter,
    lpRecipient,
    { maxPriorityFeePerGas, maxFeePerGas }
  );

  console.log("Deploy tx:", contract.deploymentTransaction()?.hash || "");
  await contract.waitForDeployment();
  const factoryAddress = await contract.getAddress();
  console.log("MemeLaunchFactory deployed:", factoryAddress);
  console.log(`FACTORY_ADDRESS_${targetChainId}=${factoryAddress}`);

  const output = {
    chainId: targetChainId,
    deployedAt: new Date().toISOString(),
    memeLaunchFactory: factoryAddress,
    feeRecipient,
    platformFeeRecipient,
    feeBps,
    launchFeeWei: launchFeeWei.toString(),
    virtualEthReserve: virtualEthReserve.toString(),
    virtualTokenReserve: virtualTokenReserve.toString(),
    graduationTargetEth: graduationTargetEth.toString(),
    dexRouter,
    lpRecipient
  };
  const outDir = path.join(root, "frontend", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${targetChainId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log("Wrote chain deployment record to", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
