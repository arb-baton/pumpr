const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EtherpumpGoEscrow", function () {
  async function deployFixture() {
    const [creator, winner, other] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("EtherpumpGoEscrow");
    const escrow = await Escrow.deploy();
    await escrow.waitForDeployment();
    const bountyId = ethers.id("go-test-bounty");
    return { creator, winner, other, escrow, bountyId };
  }

  it("funds and releases a bounty to the selected winner", async function () {
    const { creator, winner, escrow, bountyId } = await deployFixture();
    const amount = ethers.parseEther("0.05");

    await expect(escrow.connect(creator).fund(bountyId, { value: amount }))
      .to.emit(escrow, "BountyFunded")
      .withArgs(bountyId, creator.address, amount);

    await expect(escrow.connect(creator).release(bountyId, winner.address))
      .to.emit(escrow, "BountyReleased")
      .withArgs(bountyId, winner.address, amount);

    const row = await escrow.bounties(bountyId);
    expect(row.released).to.equal(true);
    expect(row.amount).to.equal(0n);
  });

  it("allows the creator to refund an unreleased bounty", async function () {
    const { creator, escrow, bountyId } = await deployFixture();
    const amount = ethers.parseEther("0.02");

    await escrow.connect(creator).fund(bountyId, { value: amount });
    await expect(escrow.connect(creator).refund(bountyId))
      .to.emit(escrow, "BountyRefunded")
      .withArgs(bountyId, creator.address, amount);

    const row = await escrow.bounties(bountyId);
    expect(row.refunded).to.equal(true);
    expect(row.amount).to.equal(0n);
  });

  it("prevents non-creators and double funding", async function () {
    const { creator, winner, other, escrow, bountyId } = await deployFixture();
    const amount = ethers.parseEther("0.01");

    await escrow.connect(creator).fund(bountyId, { value: amount });
    await expect(escrow.connect(other).release(bountyId, winner.address)).to.be.revertedWith("not creator");
    await expect(escrow.connect(creator).fund(bountyId, { value: amount })).to.be.revertedWith("already funded");
  });
});
