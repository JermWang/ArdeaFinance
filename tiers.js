// Holder fee tiers: wallets holding the Ardea token pay less than the base fee on every trade and private buy.
// Pure functions only; the terminal reads the balances and passes them in.

// The fee for a holding, in basis points. tiers: [{ pct, bps }], where pct is the share of total supply (in %)
// a wallet must hold. The lowest qualifying fee wins; with no holding, no supply or no tiers it's the base fee.
export function tierFor(heldRaw, supplyRaw, tiers, baseBps) {
  const held = BigInt(heldRaw || 0), supply = BigInt(supplyRaw || 0);
  let best = { bps: baseBps, pct: 0, tier: 0 };
  if (held <= 0n || supply <= 0n || !Array.isArray(tiers)) return best;
  // compare in millionths of a percent so no float decides who qualifies
  const heldPpm = held * 100_000_000n / supply;
  [...tiers].sort((a, b) => a.pct - b.pct).forEach((t, i) => {
    if (heldPpm >= BigInt(Math.round(t.pct * 1_000_000)) && t.bps < best.bps) best = { bps: t.bps, pct: t.pct, tier: i + 1 };
  });
  return best;
}

// "0.1% of supply → 0.4% fee" lines for the docs and the trade panel.
export const describeTiers = (tiers, baseBps) =>
  [...tiers].sort((a, b) => a.pct - b.pct).map(t => `${t.pct}% of supply → ${t.bps / 100}% fee`).concat(`otherwise ${baseBps / 100}%`);
