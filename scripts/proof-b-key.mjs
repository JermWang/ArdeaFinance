// Rebuild proof wallet B's secret key from proof wallet A's, locally, so B can be imported into a wallet app.
// Usage: node scripts/proof-b-key.mjs   then paste A's base58 secret key (the PROOF_WALLET_SECRET value) when asked.
// Nothing is sent anywhere: it only derives and prints.
import { createInterface } from "node:readline/promises";
import { proofWallets } from "../proof.mjs";
import { base58Encode } from "../trace.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const secret = (await rl.question("Proof wallet A secret key (base58): ")).trim();
rl.close();
const { a, b } = await proofWallets(secret);
console.log(`\nProof A address: ${a.publicKey.toBase58()}`);
console.log(`Proof B address: ${b.publicKey.toBase58()}`);
console.log(`Proof B secret key (import into Phantom: Add wallet → Import private key):\n${base58Encode(b.secretKey)}\n`);
console.log("Clear your terminal after copying it.");
