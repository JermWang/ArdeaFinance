// Rebuild proof wallet B's secret key from proof wallet A's, locally, so B can be imported into a wallet app.
// Usage (any terminal, from the ardea folder):
//   node scripts/proof-b-key.mjs            paste A's base58 secret key when asked
//   node scripts/proof-b-key.mjs --railway  read A's key from the Railway service (railway CLI, logged in)
// It writes B's key to ARDEA-PROOF-B-KEY.txt on your desktop and prints only the addresses. Nothing is sent anywhere.
import { createInterface } from "node:readline/promises";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { proofWallets } from "../proof.mjs";
import { base58Encode } from "../trace.js";

let secret;
if (process.argv.includes("--railway")) {
  const vars = execSync("railway variables --service ardea --kv", { encoding: "utf8" });
  secret = (vars.split(/\r?\n/).find(l => l.startsWith("PROOF_WALLET_SECRET=")) || "").slice("PROOF_WALLET_SECRET=".length).trim();
  if (!secret) { console.error("PROOF_WALLET_SECRET isn't set on the Railway service."); process.exit(1); }
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  secret = (await rl.question("Proof wallet A secret key (base58): ")).trim();
  rl.close();
}
const { a, b } = await proofWallets(secret);
const out = join(homedir(), "OneDrive", "Desktop", "ARDEA-PROOF-B-KEY.txt");
writeFileSync(out, `Ardea proof wallet B\n\nAddress: ${b.publicKey.toBase58()}\nPrivate key (Phantom: Add wallet > Import private key):\n${base58Encode(b.secretKey)}\n\nDelete this file after importing.\n`);
console.log(`Proof A: ${a.publicKey.toBase58()}`);
console.log(`Proof B: ${b.publicKey.toBase58()}`);
console.log(`B's private key saved to ${out}`);
