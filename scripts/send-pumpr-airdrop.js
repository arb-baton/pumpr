const fs = require("fs");
const path = require("path");

require("dotenv").config();

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction
} = require("@solana/web3.js");
const splToken = require("@solana/spl-token");

const DEFAULT_MINT = "C64Fr3nt6S9mmbehCS66Y1HYLnwBdMeUCdTimfmvpump";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_BATCH_SIZE = 6;

function argValue(name, fallback = "") {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function decodeSolanaSecretKey(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) throw new Error("Airdrop wallet secret is missing.");
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Solana secret JSON must be an array.");
    return Uint8Array.from(parsed.map((item) => Number(item)));
  }
  try {
    const bs58 = require("bs58");
    const decoder = bs58.decode ? bs58 : bs58.default;
    const decoded = decoder.decode(raw);
    if (decoded.length === 64) return Uint8Array.from(decoded);
  } catch {
    // Try base64 next.
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 64) return Uint8Array.from(decoded);
  throw new Error("Solana secret must be a 64-byte JSON array, base58 secret key, or base64 secret key.");
}

function readAirdropKeypair() {
  const names = [
    "PUMPR_AIRDROP_SOLANA_SECRET_KEY",
    "PUMPR_AIRDROP_SOLANA_PRIVATE_KEY",
    "PUMPR_ADMIN_SOLANA_SECRET_KEY",
    "PUMPR_ADMIN_SOLANA_PRIVATE_KEY",
    "PUMPR_DEV_WALLET_SECRET_KEY",
    "PUMPR_DEV_WALLET_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY"
  ];
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (!value) continue;
    return { keypair: Keypair.fromSecretKey(decodeSolanaSecretKey(value)), envName: name };
  }
  throw new Error(`Set one of these env vars before sending: ${names.join(", ")}`);
}

function rpcUrl() {
  return (
    process.env.PUMPFUN_SOLANA_RPC_URL ||
    process.env.ALCHEMY_SOLANA_RPC_URL ||
    process.env.HELIUS_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    DEFAULT_RPC
  );
}

function parseCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function readRecipients(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() || "").map((value) => value.trim());
  const addressIndex = header.indexOf("address");
  const amountIndex = header.indexOf("amountPumpr");
  if (addressIndex === -1 || amountIndex === -1) {
    throw new Error("CSV must include address and amountPumpr columns.");
  }
  return lines.map((line, index) => {
    const cols = parseCsvLine(line);
    const address = String(cols[addressIndex] || "").trim();
    const amountPumpr = String(cols[amountIndex] || "").trim();
    if (!address || !amountPumpr) throw new Error(`CSV row ${index + 2} is missing address or amountPumpr.`);
    return { index: index + 1, address, amountPumpr };
  });
}

function decimalToRaw(amount, decimals) {
  const text = String(amount || "0").trim();
  const [wholeRaw, fracRaw = ""] = text.split(".");
  const whole = BigInt(wholeRaw || "0");
  const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  return whole * 10n ** BigInt(decimals) + BigInt(frac || "0");
}

function pickTokenProgram(mintInfo) {
  const owner = mintInfo?.owner?.toBase58?.() || "";
  if (owner === splToken.TOKEN_PROGRAM_ID.toBase58()) return splToken.TOKEN_PROGRAM_ID;
  if (owner === splToken.TOKEN_2022_PROGRAM_ID.toBase58()) return splToken.TOKEN_2022_PROGRAM_ID;
  throw new Error(`Unsupported token program owner for mint: ${owner || "missing"}`);
}

async function main() {
  const csvPath = path.resolve(argValue("csv", ""));
  const mint = new PublicKey(argValue("mint", process.env.PUMPR_AIRDROP_TOKEN || process.env.AIRDROP_TOKEN_ADDRESS || DEFAULT_MINT));
  const execute = hasFlag("execute");
  const batchSize = Math.max(1, Math.min(Number(argValue("batch-size", DEFAULT_BATCH_SIZE)) || DEFAULT_BATCH_SIZE, 12));
  if (!csvPath || !fs.existsSync(csvPath)) {
    throw new Error("Pass --csv path/to/pumpr-live-...-send.csv");
  }

  const recipients = readRecipients(csvPath);
  if (!recipients.length) throw new Error("CSV has no recipients.");
  const connection = new Connection(rpcUrl(), "confirmed");
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) throw new Error(`Mint not found: ${mint.toBase58()}`);
  const tokenProgram = pickTokenProgram(mintInfo);
  const mintState = await splToken.getMint(connection, mint, "confirmed", tokenProgram);
  const decimals = Number(mintState.decimals);
  const totalRaw = recipients.reduce((sum, row) => sum + decimalToRaw(row.amountPumpr, decimals), 0n);

  if (!execute) {
    console.log(JSON.stringify({
      mode: "dry-run",
      mint: mint.toBase58(),
      tokenProgram: tokenProgram.toBase58(),
      decimals,
      recipients: recipients.length,
      totalPumpr: recipients.reduce((sum, row) => sum + Number(row.amountPumpr || 0), 0),
      totalRaw: totalRaw.toString(),
      note: "Dry run only. Add --execute after setting the airdrop wallet secret to broadcast."
    }, null, 2));
    return;
  }

  const { keypair, envName } = readAirdropKeypair();
  const sourceAta = splToken.getAssociatedTokenAddressSync(mint, keypair.publicKey, true, tokenProgram);
  const sourceBalance = await connection.getTokenAccountBalance(sourceAta, "confirmed").catch(() => null);
  const sourceRaw = BigInt(sourceBalance?.value?.amount || "0");
  if (sourceRaw < totalRaw) {
    throw new Error(`Airdrop wallet ${keypair.publicKey.toBase58()} has ${sourceRaw} raw tokens, needs ${totalRaw}.`);
  }

  const signatures = [];
  for (let offset = 0; offset < recipients.length; offset += batchSize) {
    const batch = recipients.slice(offset, offset + batchSize);
    const latest = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: latest.blockhash });
    for (const row of batch) {
      const owner = new PublicKey(row.address);
      const destinationAta = splToken.getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
      const amountRaw = decimalToRaw(row.amountPumpr, decimals);
      tx.add(
        splToken.createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destinationAta, owner, mint, tokenProgram),
        splToken.createTransferCheckedInstruction(sourceAta, mint, destinationAta, keypair.publicKey, amountRaw, decimals, [], tokenProgram)
      );
    }
    tx.sign(keypair);
    const simulation = await connection.simulateTransaction(tx);
    if (simulation.value.err) {
      throw new Error(`Batch ${Math.floor(offset / batchSize) + 1} simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    signatures.push(signature);
    console.log(`Sent batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil(recipients.length / batchSize)}: ${signature}`);
  }

  const receipt = {
    sentAt: new Date().toISOString(),
    csvPath,
    mint: mint.toBase58(),
    sender: keypair.publicKey.toBase58(),
    senderEnv: envName,
    recipientCount: recipients.length,
    totalRaw: totalRaw.toString(),
    signatures
  };
  const receiptPath = path.join(process.cwd(), "cache", "airdrops", `pumpr-airdrop-send-receipt-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, receiptPath, signatures }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
