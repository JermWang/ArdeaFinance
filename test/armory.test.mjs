import test from "node:test";
import assert from "node:assert/strict";
import { armSizes, pickArmed, armSummary } from "../armory.js";

const SOL = 1_000_000_000n, RES = 10_000_000n;

test("wallet sizes add up exactly, vary, and aren't round", () => {
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const parts = armSizes(3n * SOL, 3, { rand });
  assert.equal(parts.reduce((a, b) => a + b, 0n), 3n * SOL);
  assert.equal(new Set(parts.map(String)).size, 3);
  assert.ok(parts.every(p => p % 1_000_000n !== 0n));
  assert.deepEqual(armSizes(SOL, 1), [SOL]);
});

test("fires the oldest armed wallet that still holds SOL, never one already used", () => {
  const recs = [
    { index: 4, address: "D", state: "armed" },
    { index: 2, address: "B", state: "armed" },
    { index: 1, address: "A", state: "holding", mint: "M" },
    { index: 3, address: "C", state: "routing", armed: true }
  ];
  const bal = { A: SOL, B: SOL / 2n, C: 0n, D: SOL };
  assert.equal(pickArmed(recs, bal, RES).address, "B");
  assert.equal(pickArmed(recs, { ...bal, B: RES }, RES).address, "D");
  assert.equal(pickArmed([recs[2], recs[3]], bal, RES), null);
});

test("summary counts ready wallets, wallets still arming, and SOL ready to fire", () => {
  const recs = [{ index: 1, address: "A", state: "armed" }, { index: 2, address: "B", state: "armed" }, { index: 3, address: "C", state: "routing", armed: true }];
  assert.deepEqual(armSummary(recs, { A: SOL, B: SOL }, RES), { ready: 2, arming: 1, readySol: 2n * SOL - 2n * RES });
});
