import test from "node:test";
import assert from "node:assert/strict";
import { armSizes, tradableArmed, armedFor, armSummary } from "../armory.js";

const SOL = 1_000_000_000n, RES = 10_000_000n;

test("wallet sizes add up exactly, vary, and aren't round", () => {
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const parts = armSizes(3n * SOL, 3, { rand });
  assert.equal(parts.reduce((a, b) => a + b, 0n), 3n * SOL);
  assert.equal(new Set(parts.map(String)).size, 3);
  assert.ok(parts.every(p => p % 1_000_000n !== 0n));
  assert.deepEqual(armSizes(SOL, 1), [SOL]);
});

const recs = [
  { index: 4, address: "D", state: "armed" },
  { index: 2, address: "B", state: "armed" },
  { index: 1, address: "A", state: "holding", mint: "M" },
  { index: 3, address: "C", state: "routing", armed: true },
  { index: 5, address: "E", state: "exiting", armed: true }
];
const bal = { A: SOL, B: SOL / 2n, C: 0n, D: SOL, E: SOL };

test("tradable armed wallets: fresh ones first, then the oldest; never one still arming or on its way home", () => {
  assert.deepEqual(tradableArmed(recs, bal).map(r => r.address), ["B", "D", "A"]);
  assert.equal(tradableArmed(recs, bal)[0].balance, SOL / 2n);
});

test("a buy uses the freshest armed wallet with SOL, a pinned one when picked", () => {
  assert.equal(armedFor(recs, bal, RES).address, "B");
  assert.equal(armedFor(recs, { ...bal, B: RES }, RES).address, "D");
  assert.equal(armedFor(recs, { A: SOL }, RES).address, "A"); // used before, still a trading wallet
  assert.equal(armedFor(recs, bal, RES, { pick: 1 }).address, "A");
  assert.equal(armedFor(recs, bal, RES, { pick: 3 }), null); // still arming
  assert.equal(armedFor([recs[3], recs[4]], bal, RES), null);
});

test("a sell uses the armed wallet holding the most of the token", () => {
  assert.equal(armedFor(recs, bal, RES, { side: "sell", holdings: { A: 5n, D: 9n } }).address, "D");
  assert.equal(armedFor(recs, bal, RES, { side: "sell", holdings: {} }), null);
  assert.equal(armedFor(recs, bal, RES, { side: "sell", pick: 2, holdings: { D: 9n } }).address, "B");
});

test("summary counts ready wallets, wallets still arming, and SOL ready to fire", () => {
  const recs = [{ index: 1, address: "A", state: "armed" }, { index: 2, address: "B", state: "armed" }, { index: 3, address: "C", state: "routing", armed: true }];
  assert.deepEqual(armSummary(recs, { A: SOL, B: SOL }, RES), { ready: 2, arming: 1, readySol: 2n * SOL - 2n * RES });
});
