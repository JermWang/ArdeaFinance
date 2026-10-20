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
  assert.deepEqual(Object.keys(s).sort(), ["amountSol", "armed", "enabled", "everyHours", "history", "last", "minSol", "mode", "next", "routes", "running", "step", "utcHour", "waiting", "wallets"]);
  assert.ok(!JSON.stringify(s).includes("secret"));
});

test("proof history keeps only orders paying a proof wallet and matches their Solana hashes", () => {
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

test("the proof page is plain HTML with every route matched, and escapes what it shows", async () => {
  const { renderProofPage } = await import("../proofpage.mjs");
  const html = renderProofPage({ wallets: ["AAAA1111AAAA", "BBBB2222BBBB"], everyHours: 6, routes: [
    { routeId: "r1", startedAt: "2026-10-20T14:32:00Z", endedAt: "2026-10-20T15:53:00Z", from: "a", to: "b", amountSol: "0.3", amountOutSol: "0.2975", delivered: true, fundingSig: "fundSIG123456", deliverySig: "paidSIG123456", depositAddress: "DEP0000000000", paidBy: "EXCH000000000" },
    { routeId: "<x>", from: "b", to: "a", delivered: false }
  ] }, { now: new Date("2026-10-20T16:00:00Z") });
  assert.match(html, /<b>1<\/b><span>completed routes/);
  assert.match(html, /solscan\.io\/tx\/fundSIG123456/);
  assert.match(html, /solscan\.io\/tx\/paidSIG123456/);
  assert.match(html, /\/proof\/route\/r1\.json/);
  assert.match(html, /81 min/);
  assert.match(html, /every 6 hours/);
  assert.ok(!html.includes("<x>") && html.includes("&lt;x&gt;"));
});

test("the proof page names armed wallets and pairs their arm and disarm routes", async () => {
  const { renderProofPage } = await import("../proofpage.mjs");
  const html = renderProofPage({ mode: "arm", wallets: ["AAAA1111AAAA", "BBBB2222BBBB"], armed: [{ index: 0, address: "ARMD0000ARMD" }], routes: [
    { routeId: "in1", fromAddress: "AAAA1111AAAA", toAddress: "ARMD0000ARMD", delivered: true, startedAt: "2026-10-20T18:00:00Z", endedAt: "2026-10-20T18:15:00Z" },
    { routeId: "out1", fromAddress: "ARMD0000ARMD", toAddress: "BBBB2222BBBB", delivered: false, startedAt: "2026-10-20T18:17:00Z" }
  ] });
  assert.match(html, /Arm a wallet, on-chain/);
  assert.match(html, /Proof A → Armed wallet #0/);
  assert.match(html, /Armed wallet #0 → Proof B/);
  assert.match(html, /in1<\/a> · delivered/);
  assert.match(html, /out1<\/a> · crossing now/);
});
