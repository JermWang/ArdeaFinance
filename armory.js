// Arm a wallet: fund clean stealth wallets through Monero ahead of time, then fire private buys from them instantly.
// Pure helpers only; the terminal does the routing, signing and buying.

export const ARM_MAX_WALLETS = 5;

// Split a total into n wallet sizes that don't look like a split: each varies by up to ±spread around an even share,
// none is a round number, and they add up exactly.
export function armSizes(total, n, { spread = .2, rand = Math.random } = {}) {
  total = BigInt(total);
  if (n <= 1) return [total];
  const w = Array.from({ length: n }, () => 1 + (rand() * 2 - 1) * spread), sum = w.reduce((a, b) => a + b, 0);
  const parts = w.map(x => BigInt(Math.floor(Number(total) * x / sum)));
  parts[n - 1] += total - parts.reduce((a, b) => a + b, 0n);
  return parts;
}

// The armed wallet to fire next: armed, holding more than its reserve, oldest first (lowest index).
// balances: { [address]: lamports as BigInt }.
export function pickArmed(records, balances, reserve) {
  return records
    .filter(r => r.state === "armed" && !r.mint && BigInt(balances[r.address] ?? 0n) > BigInt(reserve))
    .sort((a, b) => a.index - b.index)[0] || null;
}

// Counts for the header chip and the Arm screen.
export function armSummary(records, balances, reserve) {
  const ready = records.filter(r => r.state === "armed" && !r.mint && BigInt(balances[r.address] ?? 0n) > BigInt(reserve));
  return {
    ready: ready.length,
    arming: records.filter(r => r.armed && r.state === "routing").length,
    readySol: ready.reduce((n, r) => n + BigInt(balances[r.address] ?? 0n) - BigInt(reserve), 0n)
  };
}
