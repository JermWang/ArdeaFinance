// Continuous proof: Ardea's own two proof wallets send a small amount to each other through the same Monero route a
// private buy uses (Houdini private send, Monero forced), once a day at a fixed UTC hour. Every leg is on-chain, so
// anyone can open the two wallets on Solscan and see that each receives SOL only from an exchange's wallet after a
// route, never from the other proof wallet. The docs' Proof section reads both wallets straight from the chain.
//
// Off unless PROOF_WALLET_SECRET is set (base58 secret key of proof wallet A, funded by the team). Wallet B is derived
// from A's key, so there is one secret. Optional: PROOF_AMOUNT_SOL (default 0.3), PROOF_UTC_HOUR (default 14).
// Uses the team's own funds only; no user funds are ever touched.
import web3 from "@solana/web3.js";
import { houdini, SOL_QUERY, solTokenId, routeQuote, fundingTx, waitForRoute, solToLamports, lamportsToSol } from "./stealth.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58Decode(s) {
  let n = 0n;
  for (const c of s) { const v = B58.indexOf(c); if (v < 0) throw new Error("bad base58"); n = n * 58n + BigInt(v); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

export const RESERVE = 10_000_000n; // 0.01 SOL stays in each proof wallet for network fees

// Proof wallet B: SHA-256(A's secret key ‖ "ardea/proof/b").
export async function proofWallets(secret) {
  const a = web3.Keypair.fromSecretKey(base58Decode(secret));
  const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...a.secretKey, ...new TextEncoder().encode("ardea/proof/b")])));
  return { a, b: web3.Keypair.fromSeed(seed) };
}

// Which way the next route goes and how much: the fuller wallet sends, keeping its reserve. Null if neither can.
export function nextLeg(balA, balB, amount) {
  const [from, bal] = BigInt(balA) >= BigInt(balB) ? ["a", BigInt(balA)] : ["b", BigInt(balB)];
  const send = bal - RESERVE < amount ? bal - RESERVE : amount;
  return send > 0n ? { from, to: from === "a" ? "b" : "a", amount: send } : null;
}

// Milliseconds until the next run at `hour`:00 UTC. A fixed hour means a restart never adds an extra run.
export function msUntil(hour, now = Date.now()) {
  const d = new Date(now); d.setUTCHours(hour, 0, 0, 0);
  if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime() - now;
}

// Proof history from Houdini's own records: the partner account's recent private orders that pay to or refund to a
// proof wallet. Each carries Houdini's deposit hash (the funding transfer on Solana) and payout hash (the delivery),
// so every proof transfer is matched to its Monero route by Houdini's data, and the history survives restarts.
// Only orders touching the two proof wallets are kept; nothing about anyone else's orders is published.
export function proofRoutesFrom(orders, wallets) {
  const [A, B] = wallets;
  // proof routes always pay one proof wallet and are funded by the other; no user order ever pays a proof wallet
  return (orders || []).filter(o => o && o.houdiniId && o.anonymous !== false && wallets.includes(o.receiverAddress)).map(o => {
    const to = o.receiverAddress === A ? "a" : "b";
    return {
      routeId: o.houdiniId, startedAt: o.created, endedAt: o.orderFinishedReceived || null,
      from: to === "a" ? "b" : "a", to, fromAddress: to === "a" ? B : A, toAddress: o.receiverAddress, depositAddress: o.depositAddress || null,
      amountSol: o.inAmount != null ? String(o.inAmount) : null, amountOutSol: o.outAmount != null ? String(o.outAmount) : null,
      status: o.status, statusLabel: o.displayStatus || o.statusLabel || null, anonymous: o.anonymous === true, delivered: o.status === 4,
      fundingSig: o.inHash || o.inTransactionInHash || null,
      deliverySig: o.status === 4 ? (o.transactionHash || o.outTransactionOutHash || null) : null,
      refundSig: o.refundHash || null
    };
  }).sort((x, y) => String(y.startedAt).localeCompare(String(x.startedAt)));
}
const H = env => ({ authorization: `${env.HOUDINI_API_KEY}:${env.HOUDINI_API_SECRET}`, "x-user-ip": "0.0.0.0", "x-user-agent": "ardea-proof", "x-user-timezone": "UTC" });
export const HOUDINI_ORDERS = "https://api-partner.houdiniswap.com/v2/orders";
// The fields of Houdini's own record that show what a proof route did. Only for orders paying a proof wallet.
export const RECORD_FIELDS = ["houdiniId", "created", "orderFinishedReceived", "status", "displayStatus", "anonymous", "isDex", "inSymbol", "outSymbol", "inAmount", "outAmount", "depositAddress", "receiverAddress", "inHash", "inTransactionInHash", "transactionHash", "outTransactionOutHash", "hashUrl", "inStatus", "outStatus", "eta"];
export async function houdiniRecord({ env, id, fetchFn = fetch }) {
  const d = await (await fetchFn(`${HOUDINI_ORDERS}/${encodeURIComponent(id)}`, { headers: H(env) })).json();
  return Object.fromEntries(RECORD_FIELDS.filter(k => d?.[k] !== undefined).map(k => [k, d[k]]));
}
export async function houdiniProofRoutes({ env, wallets, fetchFn = fetch }) {
  if (!env.HOUDINI_API_KEY || !env.HOUDINI_API_SECRET) return [];
  const list = await (await fetchFn(`${HOUDINI_ORDERS}?pageSize=100&anonymous=true&sortBy=created&sortOrder=desc`, { headers: H(env) })).json();
  const rows = [];
  for (const o of (list.orders || []).filter(o => wallets.includes(o.receiverAddress))) {
    try { rows.push(await houdiniRecord({ env, id: o.houdiniId, fetchFn })); } catch (_) { rows.push(o); }
  }
  return proofRoutesFrom(rows, wallets);
}

export function startProof({ env = process.env, gateway, log = console.log } = {}) {
  const state = { enabled: !!env.PROOF_WALLET_SECRET, a: null, b: null, amountSol: Number(env.PROOF_AMOUNT_SOL) || 0.3, utcHour: Number.isInteger(+env.PROOF_UTC_HOUR) ? +env.PROOF_UTC_HOUR : 14, everyHours: Number(env.PROOF_INTERVAL_HOURS) > 0 ? Number(env.PROOF_INTERVAL_HOURS) : 0, running: false, last: null, next: null, history: [] };
  if (!state.enabled) return state;
  (async () => {
    const { a, b } = await proofWallets(env.PROOF_WALLET_SECRET);
    state.a = a.publicKey.toBase58(); state.b = b.publicKey.toBase58();
    const connection = new web3.Connection(env.RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
    const sync = async () => {
      try {
        const routes = await houdiniProofRoutes({ env, wallets: [state.a, state.b] });
        const known = new Map((state.routes || []).map(r => [r.routeId, r]));
        for (const r of routes) {
          const old = known.get(r.routeId);
          if (old?.paidBy) r.paidBy = old.paidBy;
          else if (r.deliverySig) {
            try {
              const tx = await connection.getParsedTransaction(r.deliverySig, { maxSupportedTransactionVersion: 0 });
              const t = tx?.transaction.message.instructions.find(ix => ix.parsed?.type === "transfer" && ix.parsed.info.destination === r.toAddress);
              if (t) r.paidBy = t.parsed.info.source;
            } catch (_) {}
          }
          known.set(r.routeId, r);
        }
        state.routes = [...known.values()].sort((x, y) => String(y.startedAt).localeCompare(String(x.startedAt))).slice(0, 50);
      } catch (e) { log(`proof: history sync failed (${e.message})`); }
    };
    sync(); setInterval(sync, 10 * 60_000);
    const keys = { a, b };
    // Houdini through the gateway in-process, so the key and compliance headers are added exactly as for users
    const hd = houdini({ base: "http://gateway.internal/houdini", fetch: gateway, timezone: "UTC" });
    const run = async () => {
      if (state.running) return;
      state.running = true;
      const rec = { startedAt: new Date().toISOString() };
      try {
        const [balA, balB] = await Promise.all([connection.getBalance(a.publicKey), connection.getBalance(b.publicKey)]);
        const leg = nextLeg(balA, balB, solToLamports(state.amountSol));
        if (!leg) throw new Error("proof wallets are empty");
        const from = keys[leg.from], to = keys[leg.to];
        Object.assign(rec, { from: leg.from, to: leg.to, amountSol: lamportsToSol(leg.amount) });
        const route = await routeQuote({ hd, token: solTokenId(await hd.tokens(SOL_QUERY)), amount: leg.amount, from: from.publicKey.toBase58(), to: to.publicKey.toBase58() });
        rec.routeId = route.id; state.last = rec;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const tx = fundingTx(web3, { from: from.publicKey.toBase58(), depositAddress: route.depositAddress, amount: leg.amount, blockhash });
        tx.sign([from]);
        rec.fundingSig = await connection.sendTransaction(tx, { maxRetries: 3 });
        await connection.confirmTransaction({ signature: rec.fundingSig, blockhash, lastValidBlockHeight }, "confirmed");
        log(`proof: ${leg.from} → ${leg.to} ${rec.amountSol} SOL funded ${rec.fundingSig}`);
        await waitForRoute(hd, route.id, { interval: 30_000, timeoutMs: 3 * 60 * 60 * 1000 });
        rec.delivered = true; rec.amountOutSol = lamportsToSol(route.amountOut);
        log(`proof: delivered ≈${rec.amountOutSol} SOL to ${leg.to}`);
      } catch (e) { rec.error = String(e.message || e).slice(0, 200); log(`proof: ${rec.error}`); }
      finally { rec.endedAt = new Date().toISOString(); state.last = rec; state.running = false; state.history = [rec, ...state.history].slice(0, 10); }
    };
    // Daily at utcHour, or with PROOF_INTERVAL_HOURS every N hours, counted from when the last route finished.
    const schedule = () => { const ms = state.everyHours ? state.everyHours * 3600_000 : msUntil(state.utcHour); state.next = new Date(Date.now() + ms).toISOString(); setTimeout(() => { run().finally(schedule); }, ms); };
    schedule();
    log(`proof: wallets ${state.a} and ${state.b}, ${state.amountSol} SOL ${state.everyHours ? `every ${state.everyHours} h` : `daily at ${state.utcHour}:00 UTC`}`);
    // one extra route right after this start, on top of the schedule; remove the variable afterwards
    if (env.PROOF_RUN_NOW) { log("proof: PROOF_RUN_NOW is set, running one route now"); run(); }
  })().catch(e => { state.enabled = false; state.error = String(e.message || e); log(`proof: off (${state.error})`); });
  return state;
}

// What /proof.json shows: the two addresses and the schedule. Never the key.
// Proof routes run between Ardea's own public wallets, so their route ids are safe to publish: anyone can track them.
const runView = r => r && { startedAt: r.startedAt, endedAt: r.endedAt, from: r.from, to: r.to, amountSol: r.amountSol, amountOutSol: r.amountOutSol, routeId: r.routeId, fundingSig: r.fundingSig, delivered: !!r.delivered, error: r.error };
export const publicState = s => ({ enabled: s.enabled, wallets: s.a ? [s.a, s.b] : [], routes: s.routes || [], amountSol: s.amountSol, utcHour: s.utcHour, everyHours: s.everyHours || 0, running: s.running, next: s.next, last: runView(s.last), history: (s.history || []).map(runView) });
