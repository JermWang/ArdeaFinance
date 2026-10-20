import test from "node:test";
import assert from "node:assert/strict";
import web3 from "@solana/web3.js";
import { feeOf, deriveStealth, nextUnusedStealth, scanStealths, seedFingerprint, houdini, routeQuote, routeLabel, fundingTx, exitTx, exitAmount, waitForRoute, solTokenId, lamportsToSol, solToLamports, STEALTH_MESSAGE } from "../stealth.js";
import { createHoudini, SOL_ID } from "./houdinimock.mjs";
import { createRequire } from "node:module";
const { ed25519 } = createRequire(import.meta.url)("@noble/curves/ed25519");
const signWith = (msg, kp) => ed25519.sign(msg, kp.secretKey.slice(0, 32));

const TREASURY = "DGorZp9ari8RGGdiQbXCsQ62HDmkxSL66xxQcYvWfWMP";
const main = web3.Keypair.generate();
const sig = signWith(new TextEncoder().encode(STEALTH_MESSAGE), main);

test("stealth wallets are deterministic per signature and index, and unrelated to the main key", async () => {
  const a0 = await deriveStealth(web3, sig, 0), a0b = await deriveStealth(web3, sig, 0), a1 = await deriveStealth(web3, sig, 1);
  assert.equal(a0.publicKey.toBase58(), a0b.publicKey.toBase58());
  assert.notEqual(a0.publicKey.toBase58(), a1.publicKey.toBase58());
  assert.notEqual(a0.publicKey.toBase58(), main.publicKey.toBase58());
  const other = signWith(new TextEncoder().encode(STEALTH_MESSAGE), web3.Keypair.generate());
  assert.notEqual((await deriveStealth(web3, other, 0)).publicKey.toBase58(), a0.publicKey.toBase58());
  assert.equal((await seedFingerprint(sig)).length, 16);
});

test("funding transaction pays the deposit address and the treasury fee", () => {
  const dep = web3.Keypair.generate().publicKey.toBase58();
  const tx = fundingTx(web3, { from: main.publicKey.toBase58(), depositAddress: dep, amount: 995n, fee: 5n, treasury: TREASURY, blockhash: web3.Keypair.generate().publicKey.toBase58() });
  const keys = tx.message.staticAccountKeys.map(k => k.toBase58());
  const xfers = tx.message.compiledInstructions.map(ci => ({ to: keys[ci.accountKeyIndexes[1]], lamports: Buffer.from(ci.data).readBigUInt64LE(4) }));
  assert.deepEqual(xfers, [{ to: dep, lamports: 995n }, { to: TREASURY, lamports: 5n }]);
});

test("exit closes token accounts, sends everything left, and is signed by the stealth", async () => {
  const stealth = await deriveStealth(web3, sig, 3), dep = web3.Keypair.generate().publicKey.toBase58();
  const close = [{ address: web3.Keypair.generate().publicKey.toBase58(), programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", lamports: 2_039_280 }];
  const amount = exitAmount(10_000_000n, close);
  assert.equal(amount, 10_000_000n + 2_039_280n - 5000n);
  const tx = exitTx(web3, { stealth, depositAddress: dep, amount, closeAccounts: close, blockhash: web3.Keypair.generate().publicKey.toBase58() });
  const keys = tx.message.staticAccountKeys.map(k => k.toBase58());
  const [closeIx, sendIx] = tx.message.compiledInstructions;
  assert.equal(keys[closeIx.programIdIndex], "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  assert.deepEqual([...closeIx.data], [9]);
  assert.equal(keys[sendIx.accountKeyIndexes[1]], dep);
  assert.equal(Buffer.from(sendIx.data).readBigUInt64LE(4), amount);
  assert.ok(ed25519.verify(tx.signatures[0], tx.message.serialize(), stealth.publicKey.toBytes()));
  assert.equal(exitAmount(3000n), 0n);
});

test("finds native SOL on Solana among Houdini's private-send tokens", () => {
  const m = createHoudini();
  assert.equal(solTokenId(m.handle("GET", "https://p.test/houdini/v2/tokens")), SOL_ID);
  assert.throws(() => solTokenId({ tokens: [] }), /doesn't list SOL/);
});

test("amounts convert between lamports and Houdini's decimal SOL exactly", () => {
  assert.equal(lamportsToSol(995_000_000n), "0.995");
  assert.equal(lamportsToSol(2_000_000_000n), "2");
  assert.equal(lamportsToSol(1n), "0.000000001");
  assert.equal(solToLamports(0.995), 995_000_000n);
  assert.equal(solToLamports("1.2345"), 1_234_500_000n);
  assert.equal(solToLamports("nope"), 0n);
});

test("route forces Monero, takes the best private quote and pays exactly the stealth", async () => {
  const m = createHoudini(), hd = houdini({ base: "https://p.test/houdini", fetch: m.fetch, timezone: "Europe/Berlin" });
  const stealth = (await deriveStealth(web3, sig, 0)).publicKey.toBase58(), from = main.publicKey.toBase58();
  const r = await routeQuote({ hd, token: SOL_ID, amount: 995_000_000n, from, to: stealth });
  assert.equal([...m.quotes.values()][0].useXmr, "true");
  assert.equal([...m.quotes.values()][0].amount, 0.995);
  assert.deepEqual(m.created[0], { quoteId: "q1", addressTo: stealth, refundAddress: from });
  assert.equal(r.amountIn, 995_000_000n);
  assert.equal(r.amountOut, solToLamports(0.995 * 0.975));
  assert.equal(r.etaMin, 25);
  assert.match(r.depositAddress, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  assert.ok(m.headers.every(h => h["x-user-timezone"] === "Europe/Berlin"));
});

test("amounts outside the route's limits say what the limit is", async () => {
  const m = createHoudini({ min: 0.2 }), hd = houdini({ base: "https://p.test/houdini", fetch: m.fetch });
  await assert.rejects(routeQuote({ hd, token: SOL_ID, amount: 100_000_000n, from: main.publicKey.toBase58(), to: web3.Keypair.generate().publicKey.toBase58() }), /start at 0.2 SOL/);
  assert.equal(m.created.length, 0);
});

test("refuses tampered orders", async () => {
  const to = web3.Keypair.generate().publicKey.toBase58(), from = main.publicKey.toBase58();
  for (const [tamper, why] of [
    [o => { o.receiverAddress = web3.Keypair.generate().publicKey.toBase58(); }, /different wallet/],
    [o => { o.inAmount = 0.5; }, /amount changed/],
    [o => { o.depositAddress = "0xdeadbeef"; }, /deposit address/],
    [o => { o.depositAddress = to; }, /your own wallets/],
    [o => { o.outSymbol = "XMR"; }, /different assets/],
    [o => { o.outToken.chain = "bsc"; }, /isn't on Solana/],
    [o => { o.anonymous = false; }, /isn't a private route/],
    [o => { o.depositTag = "123"; }, /deposit memo/],
    [o => { o.expires = new Date(Date.now() + 1000).toISOString(); }, /expires/]
  ]) {
    const m = createHoudini({ tamper });
    await assert.rejects(routeQuote({ hd: houdini({ base: "https://p.test/houdini", fetch: m.fetch }), token: SOL_ID, amount: 1_000_000_000n, from, to }), why);
  }
});

test("waits through the Monero route's statuses until it delivers", async () => {
  const m = createHoudini({ pollsUntilDone: 4 }), hd = houdini({ base: "https://p.test/houdini", fetch: m.fetch });
  const r = await routeQuote({ hd, token: SOL_ID, amount: 1_000_000_000n, from: main.publicKey.toBase58(), to: web3.Keypair.generate().publicKey.toBase58() });
  const seen = [];
  const st = await waitForRoute(hd, r.id, { sleep: async () => {}, onStatus: s => seen.push(s) });
  assert.equal(st.status, 4);
  assert.deepEqual(seen, ["waiting for the deposit", "confirming the deposit", "swapping SOL to XMR", "swapping XMR back to SOL", "delivered"]);
});

test("expired, failed and refunded routes stop the wait with a clear message", async () => {
  for (const [status, re] of [[5, /expired/], [6, /failed/], [7, /refunded/], [8, /no longer has/]]) {
    await assert.rejects(waitForRoute({ order: async () => ({ status }) }, "hdX", { sleep: async () => {} }), re);
  }
  let t = 0, calls = 0;
  const flaky = { order: async () => { if (++calls < 3) { const e = new Error("busy"); e.status = 503; throw e; } return { status: 3 }; } };
  await assert.rejects(waitForRoute(flaky, "hdX", { sleep: async () => {}, timeoutMs: 10, now: () => (t += 3) }), /keeps going without this tab/);
  assert.ok(calls >= 3);
  assert.equal(routeLabel({ status: 3 }), "moving through Monero");
  assert.equal(routeLabel({ status: 3, outStatus: 4 }), "sending SOL to the wallet");
});

test("the Houdini client refuses to run without the proxy", async () => {
  await assert.rejects(houdini({ base: "", fetch: async () => { throw new Error("should not fetch"); } }).tokens({}), /needs the gateway/);
});

test("next stealth skips any index with on-chain history, even when local records are gone", async () => {
  const addr = async i => (await deriveStealth(web3, sig, i)).publicKey.toBase58();
  const used = new Set([await addr(0), await addr(1), await addr(3)]);
  const isUsed = async a => used.has(a);
  const n = await nextUnusedStealth(web3, sig, { isUsed });
  assert.equal(n.index, 2);
  assert.equal(n.stealth.publicKey.toBase58(), await addr(2));
  assert.equal((await nextUnusedStealth(web3, sig, { isUsed, start: 3 })).index, 4);
  await assert.rejects(nextUnusedStealth(web3, sig, { isUsed: async () => { throw new Error("rpc down"); } }), /rpc down/);
});

test("stealth scan finds used stealths past gaps and always covers known indexes", async () => {
  const addr = async i => (await deriveStealth(web3, sig, i)).publicKey.toBase58();
  const used = new Set([await addr(0), await addr(4), await addr(9)]);
  const isUsed = async a => used.has(a);
  assert.deepEqual((await scanStealths(web3, sig, { isUsed, gap: 5 })).map(g => g.index), [0, 4, 9]);
  assert.deepEqual((await scanStealths(web3, sig, { isUsed, gap: 3 })).map(g => g.index), [0]);
  assert.deepEqual((await scanStealths(web3, sig, { isUsed, gap: 3, known: 9 })).map(g => g.index), [0, 4, 9]);
  await assert.rejects(scanStealths(web3, sig, { isUsed: async () => { throw new Error("429"); } }), /429/);
});

test("the platform fee is the basis-point share, rounded down", () => {
  assert.equal(feeOf(1_000_000_000n, 50), 5_000_000n);
  assert.equal(feeOf(199n, 50), 0n);
});
