import test from "node:test";
import assert from "node:assert/strict";
import web3 from "@solana/web3.js";
import { base58Decode, proofWallets, nextLeg, msUntil, RESERVE, publicState } from "../proof.mjs";
import { base58Encode } from "../trace.js";

test("base58 decodes a secret key back to its bytes", () => {
  const kp = web3.Keypair.generate();
  assert.deepEqual(base58Decode(base58Encode(kp.secretKey)), kp.secretKey);
});

test("wallet B is derived from A, deterministic, and a different wallet", async () => {
  const secret = base58Encode(web3.Keypair.generate().secretKey);
  const w1 = await proofWallets(secret), w2 = await proofWallets(secret);
  assert.equal(w1.b.publicKey.toBase58(), w2.b.publicKey.toBase58());
  assert.notEqual(w1.a.publicKey.toBase58(), w1.b.publicKey.toBase58());
});

test("the fuller wallet sends, keeps its reserve, and nothing goes when both are empty", () => {
  assert.deepEqual(nextLeg(500_000_000n, 0n, 300_000_000n), { from: "a", to: "b", amount: 300_000_000n });
  assert.deepEqual(nextLeg(10_000_000n, 480_000_000n, 300_000_000n), { from: "b", to: "a", amount: 300_000_000n });
  assert.deepEqual(nextLeg(200_000_000n, 0n, 300_000_000n), { from: "a", to: "b", amount: 200_000_000n - RESERVE });
  assert.equal(nextLeg(RESERVE, RESERVE, 300_000_000n), null);
});

test("runs land on the fixed UTC hour, never immediately after a restart", () => {
  const at = Date.UTC(2026, 9, 20, 13, 30);
  assert.equal(msUntil(14, at), 30 * 60 * 1000);
  assert.equal(msUntil(14, Date.UTC(2026, 9, 20, 14, 0)), 24 * 60 * 60 * 1000);
});

test("the public state never includes a key", () => {
  const s = publicState({ enabled: true, a: "A", b: "B", amountSol: 0.3, utcHour: 14, running: false, next: null, last: null, secret: "x" });
  assert.deepEqual(Object.keys(s).sort(), ["amountSol", "enabled", "history", "last", "next", "running", "utcHour", "wallets"]);
  assert.ok(!JSON.stringify(s).includes("secret"));
});
