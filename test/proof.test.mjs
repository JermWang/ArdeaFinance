import test from "node:test";
import assert from "node:assert/strict";
import web3 from "@solana/web3.js";
import { base58Decode, proofWallets, nextLeg, msUntil, RESERVE, publicState, proofRoutesFrom } from "../proof.mjs";
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
  assert.deepEqual(Object.keys(s).sort(), ["amountSol", "enabled", "everyHours", "history", "last", "next", "routes", "running", "utcHour", "wallets"]);
  assert.ok(!JSON.stringify(s).includes("secret"));
});

test("proof history keeps only orders touching the proof wallets and matches their Solana hashes", () => {
  const W = ["AAA", "BBB"];
  const orders = [
    { houdiniId: "r1", anonymous: true, refundAddress: "AAA", receiverAddress: "BBB", status: 4, inAmount: 0.3, outAmount: 0.2975, inHash: "fund1", transactionHash: "paid1", created: "2026-10-20T14:32:00Z", orderFinishedReceived: "2026-10-20T15:53:00Z" },
    { houdiniId: "r2", anonymous: true, refundAddress: "BBB", receiverAddress: "AAA", status: 3, inAmount: 0.2875, outAmount: 0.27, inHash: "fund2", transactionHash: null, created: "2026-10-20T15:58:00Z" },
    { houdiniId: "user", anonymous: true, refundAddress: "someone", receiverAddress: "stealth", status: 4, inHash: "x", transactionHash: "y" }
  ];
  const r = proofRoutesFrom(orders, W);
  assert.deepEqual(r.map(x => x.routeId), ["r2", "r1"]);
  assert.equal(r[1].fundingSig, "fund1"); assert.equal(r[1].deliverySig, "paid1"); assert.equal(r[1].from, "a"); assert.equal(r[1].to, "b");
  assert.equal(r[0].deliverySig, null); assert.equal(r[0].delivered, false);
  assert.ok(!JSON.stringify(r).includes("someone"));
});
