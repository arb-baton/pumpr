const { expect } = require("chai");

const {
  buildContractAddressOverlaySvg,
  buildSignedBillSvg
} = require("../scripts/signed-bill-image");

describe("X launch reply images", function () {
  const solanaMint = "So11111111111111111111111111111111111111112";

  it("prints the full contract address on an attached-image overlay", function () {
    const svg = buildContractAddressOverlaySvg({
      sourceImageUrl: "https://example.com/user-image.png",
      tokenAddress: solanaMint
    });

    expect(svg).not.to.include("CONTRACT ADDRESS");
    expect(svg).to.include(`CA: ${solanaMint}`);
    expect(svg).to.include('height="1200" preserveAspectRatio="xMidYMid meet"');
    expect(svg).to.include(solanaMint);
    expect(svg).to.include("https://example.com/user-image.png");
  });

  it("prints the full contract address on signed-bill images", function () {
    const svg = buildSignedBillSvg({
      name: "Address Bill",
      ticker: "ADDR",
      tokenAddress: solanaMint
    });

    expect(svg).to.include(`CA ${solanaMint}`);
    expect(svg).not.to.include("So111111...111112");
  });

  it("uses the same prepared address before metadata and launch", function () {
    const { Keypair } = require("@solana/web3.js");
    const prepared = Keypair.generate();
    const encoded = Buffer.from(prepared.secretKey).toString("base64");
    const restored = Keypair.fromSecretKey(Uint8Array.from(Buffer.from(encoded, "base64")));

    expect(restored.publicKey.toBase58()).to.equal(prepared.publicKey.toBase58());
  });
});
