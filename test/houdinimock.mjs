// Fake Houdini partner API (v2 private send): SOL token lookup, private-send quotes, orders, and an order status
// that walks waiting → confirming → exchanging → anonymizing → finished over a few polls.
import web3 from "@solana/web3.js";
export const SOL_ID = "6689b73ec90e45f3b3e51553";
export function createHoudini({ pollsUntilDone = 4, tamper = null, min = 0.1, max = 500, feePct = 2.5, noMarkupRoutes = false } = {}) {
  const orders = new Map(), quotes = new Map(), created = [], headers = [];
  let n = 0;
  function handle(method, url, body) {
    const u = new URL(url), p = u.pathname.replace(/^\/houdini/, "");
    if (p === "/v2/tokens") return { tokens: [
      { id: "wsol", symbol: "SOL", chain: "solana", address: "So11111111111111111111111111111111111111112", hasSelfPrivate: false, enabled: true },
      { id: SOL_ID, symbol: "SOL", chain: "solana", address: null, hasSelfPrivate: true, enabled: true },
      { id: "solbsc", symbol: "SOL", chain: "bsc", address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", hasSelfPrivate: true, enabled: true }
    ], total: 3, totalPages: 1 };
    if (p === "/v2/quotes/private-send") {
      const amount = Number(u.searchParams.get("amount"));
      if (u.searchParams.get("token") !== SOL_ID) return { status: 422, body: { message: "Token does not support private send", code: "TOKEN" } };
      if (amount < min || amount > max) return { quotes: [{ swap: "x", type: "private", min, max, error: "amount out of range", amountIn: amount, amountOut: 0 }], total: 1 };
      if (noMarkupRoutes && Number(u.searchParams.get("markup")) > 0) return { quotes: [{ swap: "x", type: "private", error: "no route supports markup", amountIn: amount, amountOut: 0 }], total: 1 };
      const quoteId = `q${++n}`, amountOut = +(amount * (1 - feePct / 100)).toFixed(9);
      quotes.set(quoteId, { amount, amountOut, useXmr: u.searchParams.get("useXmr"), markup: u.searchParams.get("markup"), rotate: u.searchParams.get("rotatePayoutWallets") });
      return { quotes: [{ swap: "ff", quoteId, type: "private", amountIn: amount, amountOut, duration: 25, min, max }, { swap: "worse", quoteId: `q${++n}`, type: "private", amountIn: amount, amountOut: amountOut * 0.9, duration: 30, min, max }], total: 2 };
    }
    if (p === "/v2/exchanges/private-send" && method === "POST") {
      created.push(body);
      const q = quotes.get(body.quoteId);
      if (!q) return { status: 422, body: { message: "Quote expired", code: "QUOTE" } };
      const houdiniId = `hd${++n}x`;
      const order = { houdiniId, created: new Date().toISOString(), expires: new Date(Date.now() + 30 * 60000).toISOString(), depositAddress: web3.Keypair.generate().publicKey.toBase58(), receiverAddress: body.addressTo, refundAddress: body.refundAddress, anonymous: true, status: 0, inAmount: q.amount, inSymbol: "SOL", outAmount: q.amountOut, outSymbol: "SOL", inToken: { id: SOL_ID, chain: "solana", symbol: "SOL" }, outToken: { id: SOL_ID, chain: "solana", symbol: "SOL" }, eta: 25, displayStatus: "WAITING_FOR_DEPOSIT" };
      if (tamper) tamper(order);
      orders.set(houdiniId, { order, polls: 0 });
      return order;
    }
    const m = p.match(/^\/v2\/orders\/(.+)$/);
    if (m) {
      const o = orders.get(m[1]);
      if (!o) return { status: 404, body: { message: "not found", code: "NF" } };
      o.polls++;
      const status = o.polls > pollsUntilDone ? 4 : Math.min(o.polls - 1, 3);
      return { ...o.order, status, inStatus: status, outStatus: status === 3 ? 3 : undefined };
    }
    return { status: 404, body: { message: "unmocked " + p, code: "NF" } };
  }
  const fetch = async (url, init = {}) => {
    headers.push(init.headers || {});
    const out = handle(init.method || "GET", url, init.body ? JSON.parse(init.body) : null);
    const status = out && typeof out.status === "number" && out.body ? out.status : 200;
    const body = status === 200 ? out : out.body;
    return { ok: status === 200, status, json: async () => body };
  };
  return { fetch, handle, orders, quotes, created, headers };
}
