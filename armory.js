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

// Armed wallets the terminal can trade from: armed and not on their way back home. Fresh ones (never traded from)
// come first, then the oldest. Each comes with its SOL balance. balances: { [address]: lamports as BigInt }.
export function tradableArmed(records, balances = {}) {
  return records
    .filter(r => r.armed !== false && ["armed", "holding"].includes(r.state))
    .map(r => ({ ...r, balance: BigInt(balances[r.address] ?? 0n) }))
    .sort((a, b) => Number(!!(a.usedAt || a.mint)) - Number(!!(b.usedAt || b.mint)) || a.index - b.index);
}

// The armed wallet a trade uses. A pinned wallet (pick = its index) when it's tradable; otherwise, for a buy, the
// first tradable wallet with SOL above the reserve, and for a sell, the one holding the most of the token.
// holdings: { [address]: raw token amount }.
export function armedFor(records, balances, reserve, { pick = null, side = "buy", holdings = {} } = {}) {
  const list = tradableArmed(records, balances);
  if (pick != null) return list.find(r => r.index === pick) || null;
  if (side === "sell") {
    const held = list.map(r => [r, BigInt(holdings[r.address] ?? 0n)]).filter(([, h]) => h > 0n);
    return held.sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))[0]?.[0] || null;
  }
  return list.find(r => r.balance > BigInt(reserve)) || null;
}

// Counts for the header chip and the Arm screen.
export function armSummary(records, balances, reserve) {
  const ready = tradableArmed(records, balances).filter(r => r.balance > BigInt(reserve));
  return {
    ready: ready.length,
    arming: records.filter(r => r.armed && r.state === "routing").length,
    readySol: ready.reduce((n, r) => n + r.balance - BigInt(reserve), 0n)
  };
}
