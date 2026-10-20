import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, describeTiers } from "../tiers.js";

const SUPPLY = 1_000_000_000_000_000n; // 1B tokens, 6 decimals
const TIERS = [{ pct: 0.1, bps: 40 }, { pct: 0.5, bps: 30 }, { pct: 1, bps: 25 }];
const tokens = n => BigInt(n) * 1_000_000n;

test("no holding, no supply or no tiers pays the base fee", () => {
  assert.equal(tierFor(0n, SUPPLY, TIERS, 50).bps, 50);
  assert.equal(tierFor(tokens(5_000_000), 0n, TIERS, 50).bps, 50);
  assert.equal(tierFor(tokens(5_000_000), SUPPLY, [], 50).bps, 50);
});

test("each threshold is inclusive and the lowest qualifying fee wins", () => {
  assert.equal(tierFor(tokens(999_999), SUPPLY, TIERS, 50).bps, 50);
  assert.deepEqual(tierFor(tokens(1_000_000), SUPPLY, TIERS, 50), { bps: 40, pct: 0.1, tier: 1 });
  assert.equal(tierFor(tokens(5_000_000), SUPPLY, TIERS, 50).bps, 30);
  assert.equal(tierFor(tokens(10_000_000), SUPPLY, TIERS, 50).bps, 25);
  assert.equal(tierFor(tokens(400_000_000), SUPPLY, TIERS, 50).bps, 25);
});

test("tier order in config doesn't matter, and a tier never raises the fee", () => {
  assert.equal(tierFor(tokens(10_000_000), SUPPLY, [...TIERS].reverse(), 50).bps, 25);
  assert.equal(tierFor(tokens(10_000_000), SUPPLY, [{ pct: 0.1, bps: 80 }], 50).bps, 50);
});

test("describes the tiers in plain words", () => {
  assert.deepEqual(describeTiers(TIERS, 50), ["0.1% of supply → 0.4% fee", "0.5% of supply → 0.3% fee", "1% of supply → 0.25% fee", "otherwise 0.5%"]);
});
