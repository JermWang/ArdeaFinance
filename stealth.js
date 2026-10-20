// Private mode: trade from fresh wallets that have no on-chain link to your main wallet.
//
// Funds move between your wallet and a stealth wallet through Monero. Houdini Swap's private send takes SOL at a
// one-time deposit address on one exchange, swaps it to XMR, moves the XMR on Monero (where ring signatures, stealth
// addresses and RingCT hide sender, receiver and amount), swaps it back to SOL on an unrelated exchange and pays the
// stealth wallet from that exchange's wallet. Nobody on our side holds XMR. Houdini's key never reaches the browser:
// every call goes through the gateway's /houdini route.
//
// Stealth wallets are derived from one signature of STEALTH_MESSAGE by your main wallet, so they can
// always be rebuilt by signing again. Nothing secret is stored.

export const STEALTH_MESSAGE = "Privatus stealth wallets v1\n\nSigning this creates your private trading wallets. It sends no transaction and costs nothing. Only sign it on Privatus: anyone with this signature can open your stealth wallets.";
export const BASE_FEE = 5000n; // lamports per signature

export class StealthError extends Error {}

/* ---------- stealth wallets ---------- */
async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); }
const enc = new TextEncoder();

// A short public fingerprint of the signature, kept so we can tell if a wallet ever signs differently.
export async function seedFingerprint(signature) {
  return Array.from((await sha256(signature)).slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}
export async function deriveStealth(web3, signature, index) {
  const tag = enc.encode(`privatus/stealth/${index}`);
  const seed = await sha256(new Uint8Array([...signature, ...tag]));
  return web3.Keypair.fromSeed(seed);
}

// Local records can be wiped (cleared browser, new device), so the chain decides which stealths are used.
// isUsed(address) → true once anything has touched that address on-chain.
export async function nextUnusedStealth(web3, signature, { isUsed, start = 0, max = 500 }) {
  for (let i = Math.max(0, start); i < start + max; i++) {
    const stealth = await deriveStealth(web3, signature, i);
    if (!(await isUsed(stealth.publicKey.toBase58()))) return { index: i, stealth };
  }
  throw new StealthError("Couldn't find an unused stealth wallet.");
}

// Every stealth that has been used: walks indexes until `gap` in a row are unused, and always past `known`.
export async function scanStealths(web3, signature, { isUsed, known = -1, gap = 5, max = 500 }) {
  const used = [];
  for (let i = 0, empty = 0; i < max && (i <= known || empty < gap); i++) {
    const stealth = await deriveStealth(web3, signature, i);
    if (await isUsed(stealth.publicKey.toBase58())) { empty = 0; used.push({ index: i, stealth }); } else empty++;
  }
  return used;
}

// The instant trading wallet: same signature, its own derivation path, so it never collides with stealths.
export async function deriveInstant(web3, signature) {
  const seed = await sha256(new Uint8Array([...signature, ...enc.encode("privatus/instant/0")]));
  return web3.Keypair.fromSeed(seed);
}

/* ---------- amounts ---------- */
// Houdini speaks decimal SOL; everything here is lamports in BigInt, so no float ever sizes a transfer.
export function lamportsToSol(l) {
  const v = BigInt(l), whole = v / 1_000_000_000n, frac = (v % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
export function solToLamports(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0) return 0n;
  const [w, f = ""] = n.toFixed(9).split(".");
  return BigInt(w) * 1_000_000_000n + BigInt(f.padEnd(9, "0"));
}
// The platform fee on a private buy, in lamports, rounded down.
export const feeOf = (amount, bps) => BigInt(amount) * BigInt(bps) / 10_000n;

/* ---------- Houdini client (through the gateway) ---------- */
// The gateway adds the API key and the caller's IP and user agent, which Houdini requires for its compliance
// checks. The browser adds its timezone, the third required header.
export function houdini({ base, fetch: f = globalThis.fetch.bind(globalThis), timezone } = {}) {
  const tz = timezone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) { return "UTC"; } })();
  async function call(path, init = {}) {
    if (!base) throw new StealthError("Private mode needs the gateway (PROXY_URL in config.js), which holds the Monero route's key.");
    let res;
    try { res = await f(base + path, { ...init, headers: { "x-user-timezone": tz, ...(init.headers || {}) } }); }
    catch (_) { throw new StealthError("Couldn't reach the Monero route. Check your connection."); }
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (res.status === 429) { const e = new StealthError("The Monero route is rate limited right now. Wait a minute and try again."); e.status = 429; throw e; }
    if (!res.ok) { const e = new StealthError(`Monero route: ${String(body?.message || body?.error || `HTTP ${res.status}`).slice(0, 180)}`); e.status = res.status; throw e; }
    return body;
  }
  const json = body => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return {
    tokens: params => call(`/v2/tokens?${new URLSearchParams(params)}`),
    quote: ({ token, amount, useXmr = true }) => call(`/v2/quotes/private-send?${new URLSearchParams({ token, amount: String(amount), useXmr: String(!!useXmr) })}`),
    create: req => call("/v2/exchanges/private-send", json(req)),
    order: id => call(`/v2/orders/${encodeURIComponent(id)}`)
  };
}

// Houdini's id for native SOL on Solana, among tokens that support private send.
const SOL_MINT = "So11111111111111111111111111111111111111112";
export const SOL_QUERY = { symbol: "SOL", hasSelfPrivate: "true", hasCex: "true", pageSize: "50", page: "1" };
export function solTokenId(res) {
  const list = Array.isArray(res) ? res : res && Array.isArray(res.tokens) ? res.tokens : [];
  const sol = list.filter(t => t && t.id && t.symbol === "SOL" && /^sol/i.test(t.chain || t.chainData?.shortName || "") && t.hasSelfPrivate !== false && t.enabled !== false);
  const native = sol.find(t => !t.address || t.address === SOL_MINT) || sol[0];
  if (!native) throw new StealthError("The Monero route doesn't list SOL right now. Try again later.");
  return native.id;
}

// Quote a private SOL → XMR → SOL send and open the order. Monero is always forced as the bridge: if no Monero route
// is available, this stops rather than use any other path. Throws rather than return anything we didn't ask for.
export async function routeQuote({ hd, token, amount, from, to, now = Date.now() }) {
  amount = BigInt(amount);
  const sol = lamportsToSol(amount);
  const { quotes = [] } = (await hd.quote({ token, amount: sol, useXmr: true })) || {};
  const usable = quotes.filter(q => q && q.quoteId && !q.error && !q.filtered && (!q.type || q.type === "private") && Number(q.amountOut) > 0);
  if (!usable.length) {
    const lim = quotes.find(q => q && (q.min || q.max)) || {};
    if (lim.min && Number(sol) < lim.min) throw new StealthError(`Private routes start at ${lim.min} SOL.`);
    if (lim.max && Number(sol) > lim.max) throw new StealthError(`Private routes top out at ${lim.max} SOL right now.`);
    throw new StealthError("No Monero route is available for this amount right now, so nothing was sent. Try again shortly or a different amount.");
  }
  const quote = usable.sort((a, b) => Number(b.amountOut) - Number(a.amountOut))[0];
  const order = await hd.create({ quoteId: quote.quoteId, addressTo: to, refundAddress: from });
  checkOrder(order, { amount, from, to, now });
  return {
    order, quote, id: order.houdiniId, depositAddress: order.depositAddress,
    amountIn: amount, amountOut: solToLamports(order.outAmount),
    etaMin: Math.round(Number(order.eta || quote.duration) || 0) || null
  };
}

// Never send funds into an order that doesn't say exactly what we asked for.
export function checkOrder(o, { amount, from, to, now = Date.now() }) {
  const bad = m => { throw new StealthError(`Refusing this route: ${m}.`); };
  if (!o || !o.houdiniId) bad("the order is incomplete");
  if (o.receiverAddress !== to) bad("it pays a different wallet");
  if (o.inSymbol !== "SOL" || o.outSymbol !== "SOL") bad("it swaps different assets");
  for (const t of [o.inToken, o.outToken]) if (t && t.chain && !/^sol/i.test(t.chain)) bad("it isn't on Solana");
  if (o.anonymous !== true) bad("it isn't a private route");
  const diff = solToLamports(o.inAmount) - BigInt(amount);
  if (diff > 1n || diff < -1n) bad("the amount changed");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(o.depositAddress || "")) bad("there is no valid Solana deposit address");
  if (o.depositAddress === to || o.depositAddress === from) bad("the deposit address is one of your own wallets");
  if (o.depositTag) bad("it needs a deposit memo");
  if (!(solToLamports(o.outAmount) > 0n)) bad("it pays out nothing");
  if (typeof o.status === "number" && o.status > 0) bad("the order is already past waiting for a deposit");
  if (o.expires && Date.parse(o.expires) < now + 60_000) bad("the order expires before a deposit could land");
}

// A random wait in [min, max] ms, so funding and buying don't line up in time.
export const jitter = (min, max, rand = Math.random) => Math.round(min + rand() * (max - min));

/* ---------- transactions ---------- */
// Main wallet → deposit address, plus the platform fee to the treasury, in one transaction signed in the user's
// wallet. The treasury never sends anything to a stealth wallet, so the fee doesn't connect the two.
export function fundingTx(web3, { from, depositAddress, amount, fee = 0n, treasury, blockhash }) {
  const payer = new web3.PublicKey(from);
  const ixs = [web3.SystemProgram.transfer({ fromPubkey: payer, toPubkey: new web3.PublicKey(depositAddress), lamports: BigInt(amount) })];
  if (BigInt(fee) > 0n) ixs.push(web3.SystemProgram.transfer({ fromPubkey: payer, toPubkey: new web3.PublicKey(treasury), lamports: BigInt(fee) }));
  return new web3.VersionedTransaction(new web3.TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
}

// Stealth → deposit address, closing empty token accounts first so their rent comes along.
export function exitTx(web3, { stealth, depositAddress, amount, closeAccounts = [], blockhash }) {
  const owner = stealth.publicKey;
  const ixs = closeAccounts.map(a => new web3.TransactionInstruction({
    programId: new web3.PublicKey(a.programId),
    keys: [{ pubkey: new web3.PublicKey(a.address), isSigner: false, isWritable: true }, { pubkey: owner, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false }],
    data: Uint8Array.from([9]) // CloseAccount
  }));
  ixs.push(web3.SystemProgram.transfer({ fromPubkey: owner, toPubkey: new web3.PublicKey(depositAddress), lamports: BigInt(amount) }));
  const tx = new web3.VersionedTransaction(new web3.TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
  tx.sign([stealth]);
  return tx;
}

// Everything a stealth can send out: its SOL plus the rent locked in empty token accounts, minus the fee.
export function exitAmount(balance, closeAccounts = []) {
  const total = BigInt(balance) + closeAccounts.reduce((n, a) => n + BigInt(a.lamports), 0n) - BASE_FEE;
  return total > 0n ? total : 0n;
}

/* ---------- waiting on the Monero route ---------- */
// Houdini v2 order status: -2/-1 setting up, 0 waiting, 1 confirming, 2 exchanging, 3 anonymizing,
// 4 finished, 5 expired, 6 failed, 7 refunded, 8 deleted. outStatus tracks the second exchange.
export function routeLabel(st) {
  switch (st && st.status) {
    case -2: case -1: return "setting up the route";
    case 0: return "waiting for the deposit";
    case 1: return "confirming the deposit";
    case 2: return "swapping SOL to XMR";
    case 3: return st.outStatus >= 4 ? "sending SOL to the wallet" : st.outStatus >= 3 ? "swapping XMR back to SOL" : "moving through Monero";
    case 4: return "delivered";
    default: return "routing";
  }
}

// Routes take 5 to 50 minutes, so this polls slowly. A route keeps going on Houdini's side if the tab closes.
export async function waitForRoute(hd, id, { onStatus = () => {}, interval = 15000, timeoutMs = 90 * 60 * 1000, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const until = now() + timeoutMs;
  let last = "";
  for (;;) {
    let st = null;
    try { st = await hd.order(id); } catch (e) { if (!(e.status >= 500) && e.status !== 404 && e.status !== 429) throw e; }
    if (st && typeof st.status === "number") {
      const label = routeLabel(st);
      if (label !== last) { last = label; onStatus(label, st); }
      if (st.status === 4) return st;
      if (st.status === 5) throw new StealthError(`Route ${id} expired before the deposit reached it. If SOL left the sending wallet, Houdini support can trace it with that order id.`);
      if (st.status === 6) throw new StealthError(`Route ${id} failed. The exchange returns the deposit to the sending wallet; Houdini support can help if it doesn't arrive.`);
      if (st.status === 7) throw new StealthError("The route couldn't complete and the deposit was refunded to the sending wallet.");
      if (st.status === 8) throw new StealthError(`Houdini no longer has route ${id}. Check the receiving wallet.`);
    }
    if (now() > until) throw new StealthError(`Route ${id} is taking longer than usual. It keeps going without this tab; check the wallet later.`);
    await sleep(interval);
  }
}
