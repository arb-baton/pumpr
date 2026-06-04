const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  console.log("Deploying GO escrow");
  console.log("Network:", `${network.name} (${network.chainId})`);
  console.log("Deployer:", deployer.address);

  const Escrow = await hre.ethers.getContractFactory("EtherpumpGoEscrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log("EtherpumpGoEscrow:", address);
  console.log(`Set GO_ESCROW_ADDRESS_${network.chainId}=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
