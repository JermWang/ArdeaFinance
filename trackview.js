// The route tracker's view of a Houdini order: a timeline of steps and a headline, from the order's status codes
// (https://docs.houdiniswap.com/api-reference/private-send/get-order-details). Pure, so it's tested.
//
// status: -2/-1 setting up, 0 waiting for deposit, 1 confirming, 2 exchanging, 3 anonymizing (Monero), 4 finished,
// 5 expired, 6 failed, 7 refunded, 8 deleted. outStatus (second leg): 3 exchanging, 4 sending, 5 finished.

export const STEPS = [
  { key: "open", label: "Route opened", note: "One-time deposit address issued" },
  { key: "deposit", label: "Deposit received", note: "SOL arrived at the first exchange" },
  { key: "toxmr", label: "SOL → XMR", note: "First exchange swaps to Monero" },
  { key: "monero", label: "Crossing Monero", note: "Ring signatures, stealth addresses, RingCT" },
  { key: "tosol", label: "XMR → SOL", note: "An unrelated exchange swaps back" },
  { key: "paid", label: "Delivered", note: "SOL paid to the receiving wallet" }
];

// How far along the order is: index of the step in progress (all before it are done), or STEPS.length when finished.
export function stepIndex(o) {
  const s = o?.status, out = o?.outStatus ?? -1;
  if (s === 4) return STEPS.length;
  if (s == null || s < 0) return 0;
  if (s === 0) return 1;                 // waiting for the deposit to arrive
  if (s === 1) return 1;                 // deposit seen, confirming
  if (s === 2) return 2;                 // exchanging SOL → XMR
  if (s === 3) return out >= 4 ? 5 : out >= 3 ? 4 : 3;
  return -1;                             // expired, failed, refunded, deleted
}

export function headline(o) {
  switch (o?.status) {
    case 4: return { tone: "ok", text: "Delivered" };
    case 5: return { tone: "bad", text: "Expired: no deposit arrived in time" };
    case 6: return { tone: "bad", text: o.actionRequired ? "Failed after the deposit: contact Houdini support with this route id" : "Failed" };
    case 7: return { tone: "warn", text: "Refunded to the sending wallet" };
    case 8: return { tone: "bad", text: "Route no longer exists" };
    case 0: return { tone: "live", text: "Waiting for the deposit" };
    default: return { tone: "live", text: "In progress" };
  }
}

// The route ids Houdini issues: short, URL-safe.
export const isRouteId = s => /^[A-Za-z0-9_-]{4,64}$/.test(s || "");

// Minutes since the order was created, or between creation and finishing.
export function elapsedMin(o, now = Date.now()) {
  const a = Date.parse(o?.created || ""), b = Date.parse(o?.orderFinishedReceived || "") || now;
  return Number.isFinite(a) ? Math.max(0, Math.round((b - a) / 60000)) : null;
}
