const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MemeLaunchFactory", function () {
  const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

  async function deployFixture({ withDex = false, withV3 = false, targetEth = "20", launchFeeWei = 0n } = {}) {
    const [owner, creator, trader, feeRecipient, lpRecipient, platformRecipient] = await ethers.getSigners();

    let dexRouter = ethers.ZeroAddress;
    let v3PositionManager = ethers.ZeroAddress;
    let v3Weth = ethers.ZeroAddress;
    if (withDex) {
      const MockRouter = await ethers.getContractFactory("MockDexRouter");
      const mockRouter = await MockRouter.deploy("0x4200000000000000000000000000000000000006");
      await mockRouter.waitForDeployment();
      dexRouter = await mockRouter.getAddress();
    }
    if (withV3) {
      const MockQuote = await ethers.getContractFactory("MockQuoteToken");
      const quote = await MockQuote.deploy();
      await quote.waitForDeployment();
      v3Weth = await quote.getAddress();

      const MockV3Manager = await ethers.getContractFactory("MockV3PositionManager");
      const manager = await MockV3Manager.deploy(v3Weth);
      await manager.waitForDeployment();
      v3PositionManager = await manager.getAddress();
    }

    const Factory = await ethers.getContractFactory("MemeLaunchFactory");
    const factory = await Factory.deploy(
      feeRecipient.address,
      platformRecipient.address,
      50,
      launchFeeWei,
      ethers.parseEther("0.5"),
      ethers.parseUnits("1000000", 18),
      ethers.parseEther(targetEth),
      dexRouter,
      withDex ? lpRecipient.address : ethers.ZeroAddress,
      v3PositionManager,
      10000
    );
    await factory.waitForDeployment();

    return { owner, creator, trader, feeRecipient, lpRecipient, platformRecipient, factory, dexRouter, v3PositionManager, v3Weth };
  }

  it("creates a launch and seeds the pool", async function () {
    const { creator, factory } = await deployFixture();

    const totalSupply = ethers.parseUnits("1000000000", 18);
    const creatorBps = 1200;

    await factory
      .connect(creator)
      .createLaunch(
        "Dog Rocket",
        "DROCKET",
        "https://example.com/drocket.png",
        "first launch",
        totalSupply,
        creatorBps
      );

    const launch = await factory.getLaunch(0);

    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pool = await ethers.getContractAt("MemePool", launch.pool);

    const creatorAllocation = (totalSupply * BigInt(creatorBps)) / 10_000n;
    const poolAllocation = totalSupply - creatorAllocation;

    expect(launch.creator).to.equal(creator.address);
    expect(await token.balanceOf(creator.address)).to.equal(creatorAllocation);
    expect(await token.balanceOf(launch.pool)).to.equal(poolAllocation);
    expect(await pool.tokenReserve()).to.equal(poolAllocation);
    expect(await pool.seeded()).to.equal(true);
    expect(await pool.graduated()).to.equal(false);
  });

  it("allows buy and sell with low fees before graduation", async function () {
    const { creator, trader, feeRecipient, factory } = await deployFixture({ targetEth: "50" });

    const totalSupply = ethers.parseUnits("500000000", 18);

    await factory.connect(creator).createLaunch("Meme Cat", "MCAT", "", "cats on chain", totalSupply, 0);

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pool = await ethers.getContractAt("MemePool", launch.pool);
    expect(launch.totalSupply).to.equal(ethers.parseUnits("1000000000", 18));

    const buyAmount = ethers.parseEther("1");
    const [tokensOut] = await pool.quoteBuy(buyAmount);

    await pool.connect(trader).buy(tokensOut, { value: buyAmount });

    const boughtBalance = await token.balanceOf(trader.address);
    expect(boughtBalance).to.equal(tokensOut);
    expect(await pool.ethReserve()).to.be.greaterThan(0);

    const feeBalanceAfterBuy = await ethers.provider.getBalance(feeRecipient.address);

    const sellAmount = boughtBalance / 2n;
    await token.connect(trader).approve(launch.pool, sellAmount);

    const [ethOut] = await pool.quoteSell(sellAmount);
    await pool.connect(trader).sell(sellAmount, ethOut);

    const feeBalanceAfterSell = await ethers.provider.getBalance(feeRecipient.address);
    expect(feeBalanceAfterSell).to.be.greaterThan(feeBalanceAfterBuy);
    expect(await token.balanceOf(trader.address)).to.equal(boughtBalance - sellAmount);
    expect(await pool.graduated()).to.equal(false);
  });

  it("auto-migrates liquidity when graduation target is reached", async function () {
    const { creator, trader, lpRecipient, factory } = await deployFixture({ withDex: true, targetEth: "1" });

    await factory
      .connect(creator)
      .createLaunch("Graduator", "GRAD", "", "auto migration", ethers.parseUnits("1000000000", 18), 0);

    const launch = await factory.getLaunch(0);
    const pool = await ethers.getContractAt("MemePool", launch.pool);

    const buyAmount = ethers.parseEther("2");
    const [tokensOut] = await pool.quoteBuy(buyAmount);
    await pool.connect(trader).buy(tokensOut, { value: buyAmount });

    expect(await pool.graduated()).to.equal(true);

    const pairAddress = await pool.migratedPair();
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);

    // Bonding-curve liquidity is moved out after graduation.
    expect(await pool.ethReserve()).to.equal(0n);
    expect(await pool.tokenReserve()).to.equal(0n);

    const pair = await ethers.getContractAt("MockDexPair", pairAddress);
    expect(await pair.ethLiquidity()).to.be.greaterThan(0);
    expect(await pair.tokenLiquidity()).to.be.greaterThan(0);

    // LP recipient should be configured and non-zero.
    expect(lpRecipient.address).to.not.equal(ethers.ZeroAddress);

    await expect(pool.connect(trader).buy(1n, { value: ethers.parseEther("0.1") })).to.be.revertedWith("graduated");
  });

  it("opens Robinhood-style live Uniswap bonding curves without marking them graduated", async function () {
    const { creator, trader, factory } = await deployFixture({ withDex: true, targetEth: "1" });

    await factory
      .connect(creator)
      .createLaunchLiveDexCurve("Live Curve", "LIVE", "", "dex from block one", ethers.parseUnits("1000000", 18), 0, {
        value: ethers.parseEther("0.1")
      });

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pool = await ethers.getContractAt("MemePool", launch.pool);

    const pairAddress = await pool.migratedPair();
    const pair = await ethers.getContractAt("MockDexPair", pairAddress);

    expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    expect(await pool.liveDexCurve()).to.equal(true);
    expect(await pool.graduated()).to.equal(false);
    expect(await pool.ethReserve()).to.equal(0n);
    expect(await pool.tokenReserve()).to.equal(0n);
    expect(await token.dexPair()).to.equal(pairAddress);
    expect(await token.factoryControlRenounced()).to.equal(true);
    expect(await pair.ethLiquidity()).to.equal(ethers.parseEther("0.1"));
    expect(await pair.balanceOf(launch.pool)).to.be.greaterThan(0n);
    expect(await pool.targetProgressBps()).to.equal(1000n);

    await expect(pool.connect(trader).buy(1n, { value: ethers.parseEther("0.01") })).to.be.revertedWith("dex curve live");
    await expect(pool.triggerGraduation()).to.be.revertedWith("target not reached");
  });

  it("burns live Uniswap curve LP when the bonding target is reached", async function () {
    const { creator, factory } = await deployFixture({ withDex: true, targetEth: "0.05" });

    await factory
      .connect(creator)
      .createLaunchLiveDexCurve("Bonded Live", "BOND", "", "burns at bond", ethers.parseUnits("1000000", 18), 0, {
        value: ethers.parseEther("0.1")
      });

    const launch = await factory.getLaunch(0);
    const pool = await ethers.getContractAt("MemePool", launch.pool);
    const pairAddress = await pool.migratedPair();
    const pair = await ethers.getContractAt("MockDexPair", pairAddress);

    expect(await pool.liveDexCurve()).to.equal(false);
    expect(await pool.graduated()).to.equal(true);
    expect(await pair.balanceOf(launch.pool)).to.equal(0n);
    expect(await pair.balanceOf(DEAD_ADDRESS)).to.be.greaterThan(0n);
    expect(await pool.targetProgressBps()).to.equal(10000n);
  });

  it("opens zero-seed Uniswap V3 live bonding curves when a position manager is configured", async function () {
    const launchFeeWei = ethers.parseEther("0.0017");
    const { creator, platformRecipient, factory, v3PositionManager } = await deployFixture({
      withV3: true,
      targetEth: "1",
      launchFeeWei
    });

    const before = await ethers.provider.getBalance(platformRecipient.address);
    await factory
      .connect(creator)
      .createLaunchLiveDexCurve("V3 Live", "V3LIVE", "", "single-sided", ethers.parseUnits("1000000", 18), 0, {
        value: launchFeeWei
      });
    const after = await ethers.provider.getBalance(platformRecipient.address);

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pool = await ethers.getContractAt("MemePool", launch.pool);
    const manager = await ethers.getContractAt("MockV3PositionManager", v3PositionManager);
    const v3PoolAddress = await pool.migratedPair();
    const v3Pool = await ethers.getContractAt("MockV3Pool", v3PoolAddress);
    const positionId = await pool.v3TokenId();

    expect(after - before).to.equal(launchFeeWei);
    expect(v3PoolAddress).to.not.equal(ethers.ZeroAddress);
    expect(positionId).to.be.greaterThan(0n);
    expect(await manager.ownerOf(positionId)).to.equal(launch.pool);
    expect(await pool.liveDexCurve()).to.equal(true);
    expect(await pool.liveDexCurveV3()).to.equal(true);
    expect(await pool.migratedDexV3()).to.equal(true);
    expect(await pool.ethReserve()).to.equal(0n);
    expect(await pool.tokenReserve()).to.equal(0n);
    expect(await pool.spotPrice()).to.equal(673223281n);
    expect(await token.dexPair()).to.equal(v3PoolAddress);
    expect(await token.factoryControlRenounced()).to.equal(true);
    expect(await token.balanceOf(v3PoolAddress)).to.be.greaterThan(0n);

    const weth = await manager.WETH9();
    const tokenIsToken0 = launch.token.toLowerCase() < weth.toLowerCase();
    expect(await v3Pool.sqrtPriceX96()).to.equal(
      tokenIsToken0 ? 2055697212782694920257830n : 3053514737654229152956308097490832n
    );
  });

  it("restricts default updates to owner", async function () {
    const { creator, factory } = await deployFixture();

    await expect(
      factory.connect(creator).setDefaults(
        creator.address,
        creator.address,
        50,
        0,
        ethers.parseEther("1"),
        ethers.parseUnits("2000000", 18),
        ethers.parseEther("20"),
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        10000
      )
    ).to.be.revertedWith("only owner");
  });

  it("charges launch fee to platform recipient", async function () {
    const launchFeeWei = ethers.parseEther("0.0017");
    const { creator, platformRecipient, factory } = await deployFixture({ launchFeeWei });

    const before = await ethers.provider.getBalance(platformRecipient.address);
    await factory
      .connect(creator)
      .createLaunch("Fee Token", "FEE", "", "launch fee test", ethers.parseUnits("1000000", 18), 0, {
        value: launchFeeWei
      });
    const after = await ethers.provider.getBalance(platformRecipient.address);

    expect(after - before).to.equal(launchFeeWei);
  });

  it("applies 0.5% trade tax on dex transfers and supports creator/platform claims", async function () {
    const { creator, trader, platformRecipient, factory } = await deployFixture({ withDex: true, targetEth: "1" });

    await factory
      .connect(creator)
      .createLaunchInstant("Tax Token", "TAX", "", "fees", ethers.parseUnits("1000000", 18), 1000, {
        value: ethers.parseEther("0.1")
      });

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pairAddress = await (await ethers.getContractAt("MemePool", launch.pool)).migratedPair();

    const transferAmount = ethers.parseUnits("1000", 18);
    const pairBefore = await token.balanceOf(pairAddress);
    await token.connect(creator).transfer(pairAddress, transferAmount);
    const pairAfter = await token.balanceOf(pairAddress);

    const creatorClaimable = await token.creatorClaimable();
    const platformClaimable = await token.platformClaimable();
    const feeVaultBalance = await token.balanceOf(token.target);

    expect(creatorClaimable).to.equal((transferAmount * 30n) / 10_000n);
    expect(platformClaimable).to.equal((transferAmount * 20n) / 10_000n);
    expect(feeVaultBalance).to.equal((transferAmount * 50n) / 10_000n);

    const creatorBefore = await token.balanceOf(creator.address);
    const platformBefore = await token.balanceOf(platformRecipient.address);

    await token.connect(creator).claimCreatorFees();
    const platformSigner = await ethers.getSigner(platformRecipient.address);
    await token.connect(platformSigner).claimPlatformFees();

    const creatorAfter = await token.balanceOf(creator.address);
    const platformAfter = await token.balanceOf(platformRecipient.address);

    expect(creatorAfter - creatorBefore).to.equal(creatorClaimable);
    expect(platformAfter - platformBefore).to.equal(platformClaimable);
    expect(await token.creatorClaimable()).to.equal(0n);
    expect(await token.platformClaimable()).to.equal(0n);
    expect(await token.balanceOf(token.target)).to.equal(0n);
    expect(pairAfter - pairBefore).to.equal((transferAmount * 9950n) / 10_000n);
    expect(await token.balanceOf(trader.address)).to.equal(0n);
  });

  it("allows launches to choose a custom token trade tax", async function () {
    const { creator, platformRecipient, factory } = await deployFixture({ withDex: true, targetEth: "1" });

    await factory
      .connect(creator)
      .createLaunchInstantWithTax("Custom Tax", "CTAX", "", "custom fees", ethers.parseUnits("1000000", 18), 1000, 250, {
        value: ethers.parseEther("0.1")
      });

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pairAddress = await (await ethers.getContractAt("MemePool", launch.pool)).migratedPair();

    expect(await token.tradeFeeBps()).to.equal(250n);
    expect(await token.creatorFeeBps()).to.equal(150n);
    expect(await token.platformFeeBps()).to.equal(100n);

    const transferAmount = ethers.parseUnits("1000", 18);
    const pairBefore = await token.balanceOf(pairAddress);
    await token.connect(creator).transfer(pairAddress, transferAmount);
    const pairAfter = await token.balanceOf(pairAddress);

    expect(await token.creatorClaimable()).to.equal((transferAmount * 150n) / 10_000n);
    expect(await token.platformClaimable()).to.equal((transferAmount * 100n) / 10_000n);
    expect(await token.balanceOf(token.target)).to.equal((transferAmount * 250n) / 10_000n);
    expect(pairAfter - pairBefore).to.equal((transferAmount * 9750n) / 10_000n);

    const platformSigner = await ethers.getSigner(platformRecipient.address);
    await token.connect(creator).claimCreatorFees();
    await token.connect(platformSigner).claimPlatformFees();
    expect(await token.balanceOf(token.target)).to.equal(0n);
  });

  it("rejects token trade tax over 10%", async function () {
    const { creator, factory } = await deployFixture();

    await expect(
      factory
        .connect(creator)
        .createLaunchWithTax("Too Much Tax", "TAXED", "", "cap", ethers.parseUnits("1000000", 18), 0, 1001)
    ).to.be.revertedWith("trade fee too high");
  });

  it("burns LP and renounces factory control for non-platform instant launches", async function () {
    const { creator, factory } = await deployFixture({ withDex: true, targetEth: "1" });

    await factory
      .connect(creator)
      .createLaunchInstant("Safe Token", "SAFE", "", "locked", ethers.parseUnits("1000000", 18), 1000, {
        value: ethers.parseEther("0.1")
      });

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pool = await ethers.getContractAt("MemePool", launch.pool);

    expect(await pool.lpRecipient()).to.equal(DEAD_ADDRESS);
    expect(await token.factoryControlRenounced()).to.equal(true);
  });

  it("keeps configured LP recipient for platform wallet launches", async function () {
    const { lpRecipient, platformRecipient, factory } = await deployFixture({ withDex: true, targetEth: "1" });

    await factory
      .connect(platformRecipient)
      .createLaunchInstant("Platform Token", "PLAT", "", "platform", ethers.parseUnits("1000000", 18), 0, {
        value: ethers.parseEther("0.1")
      });

    const launch = await factory.getLaunch(0);
    const token = await ethers.getContractAt("MemeToken", launch.token);
    const pool = await ethers.getContractAt("MemePool", launch.pool);

    expect(await pool.lpRecipient()).to.equal(lpRecipient.address);
    expect(await token.factoryControlRenounced()).to.equal(false);
  });
});
