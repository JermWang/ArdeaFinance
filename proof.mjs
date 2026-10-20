// Continuous proof: Ardea's own two proof wallets send a small amount to each other through the same Monero route a
// private buy uses (Houdini private send, Monero forced), once a day at a fixed UTC hour. Every leg is on-chain, so
// anyone can open the two wallets on Solscan and see that each receives SOL only from an exchange's wallet after a
// route, never from the other proof wallet. The docs' Proof section reads both wallets straight from the chain.
//
// Off unless PROOF_WALLET_SECRET is set (base58 secret key of proof wallet A, funded by the team). Wallet B is derived
// from A's key, so there is one secret. Optional: PROOF_AMOUNT_SOL (default 0.3), PROOF_UTC_HOUR (default 14),
// PROOF_INTERVAL_HOURS (every N hours instead of daily), PROOF_MODE=arm (each run arms a brand-new wallet through
// Monero, then disarms it back through Monero to the other proof wallet: the Arm a wallet flow, no token trades).
// Uses the team's own funds only; no user funds are ever touched.
import web3 from "@solana/web3.js";
import { houdini, SOL_QUERY, solTokenId, routeQuote, fundingTx, waitForRoute, solToLamports, lamportsToSol, nextUnusedStealth, scanStealths, exitTx, exitAmount } from "./stealth.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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
  const state = {
    enabled: !!env.PROOF_WALLET_SECRET, a: null, b: null, amountSol: Number(env.PROOF_AMOUNT_SOL) || 0.3,
    utcHour: Number.isInteger(+env.PROOF_UTC_HOUR) ? +env.PROOF_UTC_HOUR : 14,
    everyHours: Number(env.PROOF_INTERVAL_HOURS) > 0 ? Number(env.PROOF_INTERVAL_HOURS) : 0,
    mode: env.PROOF_MODE === "arm" ? "arm" : "route", running: false, step: null, last: null, next: null, history: [], armed: [], routes: []
  };
  if (!state.enabled) return state;
  (async () => {
    const { a, b } = await proofWallets(env.PROOF_WALLET_SECRET);
    state.a = a.publicKey.toBase58(); state.b = b.publicKey.toBase58();
    const connection = new web3.Connection(env.RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
    const isUsed = async pk => (await connection.getSignaturesForAddress(new web3.PublicKey(pk), { limit: 1 })).length > 0;
    // Armed proof wallets are derived from proof wallet A's key, so the list rebuilds itself from the chain after a restart.
    try { state.armed = (await scanStealths(web3, a.secretKey, { isUsed, gap: 3, max: 200 })).map(x => ({ index: x.index, address: x.stealth.publicKey.toBase58() })); } catch (_) {}
    const watched = () => [state.a, state.b, ...state.armed.map(x => x.address)];
    const sync = async () => {
      try {
        const routes = await houdiniProofRoutes({ env, wallets: watched() });
        const known = new Map((state.routes || []).map(r => [r.routeId, r]));
        for (const r of routes) {
          const old = known.get(r.routeId) || {};
          if (old.paidBy) r.paidBy = old.paidBy;
          if (old.fromAddress && old.fromChecked) { r.fromAddress = old.fromAddress; r.fromChecked = true; }
          // who funded it and who paid it, read once from the chain
          for (const [sig, key] of [[r.fundingSig, "from"], [r.deliverySig, "paid"]]) {
            if (!sig || (key === "paid" && r.paidBy) || (key === "from" && r.fromChecked)) continue;
            try {
              const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
              const ixs = tx?.transaction.message.instructions || [];
              if (key === "from") { const t = ixs.find(ix => ix.parsed?.type === "transfer" && ix.parsed.info.destination === r.depositAddress); if (t) { r.fromAddress = t.parsed.info.source; r.fromChecked = true; } }
              else { const t = ixs.find(ix => ix.parsed?.type === "transfer" && ix.parsed.info.destination === r.toAddress); if (t) r.paidBy = t.parsed.info.source; }
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
    const token = async () => solTokenId(await hd.tokens(SOL_QUERY));
    // one Monero route from a keypair to an address: open, check, fund, wait
    const route = async (fromKp, to, amount, rec, label) => {
      const r = await routeQuote({ hd, token: await token(), amount, from: fromKp.publicKey.toBase58(), to });
      rec[`${label}RouteId`] = r.id; state.last = rec;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = fundingTx(web3, { from: fromKp.publicKey.toBase58(), depositAddress: r.depositAddress, amount, blockhash });
      tx.sign([fromKp]);
      rec[`${label}FundingSig`] = await connection.sendTransaction(tx, { maxRetries: 3 });
      await connection.confirmTransaction({ signature: rec[`${label}FundingSig`], blockhash, lastValidBlockHeight }, "confirmed");
      log(`proof: ${label} route ${r.id} funded ${rec[`${label}FundingSig`]}`);
      await waitForRoute(hd, r.id, { interval: 30_000, timeoutMs: 3 * 60 * 60 * 1000 });
      return r;
    };
    const waitBalance = async (pk, min, ms = 10 * 60_000) => {
      const until = Date.now() + ms;
      for (;;) { const bal = BigInt(await connection.getBalance(pk)); if (bal >= min) return bal; if (Date.now() > until) throw new Error("delivered SOL hasn't shown up yet"); await new Promise(r => setTimeout(r, 5000)); }
    };
    const tokenAccounts = async pk => (await connection.getParsedTokenAccountsByOwner(pk, { programId: new web3.PublicKey(TOKEN_PROGRAM) })).value.map(x => ({ address: x.pubkey.toBase58(), programId: TOKEN_PROGRAM, lamports: x.account.lamports, mint: x.account.data.parsed.info.mint, raw: BigInt(x.account.data.parsed.info.tokenAmount.amount) }));

    const run = async () => {
      if (state.running) return;
      state.running = true;
      const rec = { mode: state.mode, startedAt: new Date().toISOString() };
      try {
        const [balA, balB] = await Promise.all([connection.getBalance(a.publicKey), connection.getBalance(b.publicKey)]);
        const leg = nextLeg(balA, balB, solToLamports(state.amountSol));
        if (!leg) throw new Error("proof wallets are empty");
        const from = keys[leg.from], to = keys[leg.to];
        Object.assign(rec, { from: leg.from, to: leg.to, amountSol: lamportsToSol(leg.amount) });
        if (state.mode !== "arm") {
          state.step = "crossing Monero";
          const r = await route(from, to.publicKey.toBase58(), leg.amount, rec, "proof");
          rec.routeId = r.id; rec.delivered = true; rec.amountOutSol = lamportsToSol(r.amountOut);
          log(`proof: delivered ≈${rec.amountOutSol} SOL to ${leg.to}`);
          return;
        }
        // The Arm a wallet cycle on-chain, with Ardea's own wallets: arm a brand-new wallet through Monero, then disarm
        // it back through Monero to the other proof wallet. No token trades.
        const { index, stealth: armed } = await nextUnusedStealth(web3, a.secretKey, { isUsed, start: state.armed.reduce((m, x) => Math.max(m, x.index + 1), 0) });
        const armedAddr = armed.publicKey.toBase58();
        state.armed.push({ index, address: armedAddr });
        Object.assign(rec, { armedIndex: index, armedAddress: armedAddr });
        state.step = "arming: crossing Monero";
        const r1 = await route(from, armedAddr, leg.amount, rec, "arm");
        rec.routeId = r1.id;
        const bal = await waitBalance(armed.publicKey, RESERVE + 1n);
        rec.armedSol = lamportsToSol(bal);
        // armed: the wallet now holds SOL paid by an exchange after the Monero hop, with no link to the proof wallet
        state.step = "armed";
        await new Promise(r => setTimeout(r, 120_000));
        state.step = "disarming: crossing Monero";
        const close = (await tokenAccounts(armed.publicKey)).filter(t => t.raw === 0n);
        const amount = exitAmount(await connection.getBalance(armed.publicKey), close);
        const r2 = await routeQuote({ hd, token: await token(), amount, from: armedAddr, to: to.publicKey.toBase58() });
        rec.exitRouteId = r2.id;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        rec.exitSig = await connection.sendTransaction(exitTx(web3, { stealth: armed, depositAddress: r2.depositAddress, amount, closeAccounts: close, blockhash }), { maxRetries: 3 });
        await connection.confirmTransaction({ signature: rec.exitSig, blockhash, lastValidBlockHeight }, "confirmed");
        log(`proof: armed wallet #${index} disarming via ${r2.id}`);
        await waitForRoute(hd, r2.id, { interval: 30_000, timeoutMs: 3 * 60 * 60 * 1000 });
        rec.delivered = true; rec.amountOutSol = lamportsToSol(r2.amountOut);
        log(`proof: arm cycle done, ≈${rec.amountOutSol} SOL back to ${leg.to}`);
      } catch (e) { rec.error = String(e.message || e).slice(0, 200); log(`proof: ${rec.error}`); }
      finally { rec.endedAt = new Date().toISOString(); state.last = rec; state.step = null; state.running = false; state.history = [rec, ...state.history].slice(0, 20); sync(); }
    };
    // Daily at utcHour, or with PROOF_INTERVAL_HOURS every N hours, counted from when the last run finished.
    const schedule = () => { const ms = state.everyHours ? state.everyHours * 3600_000 : msUntil(state.utcHour); state.next = new Date(Date.now() + ms).toISOString(); setTimeout(() => { run().finally(schedule); }, ms); };
    schedule();
    log(`proof: wallets ${state.a} and ${state.b}, ${state.mode === "arm" ? "full arm cycles" : "routes"} of ${state.amountSol} SOL ${state.everyHours ? `every ${state.everyHours} h` : `daily at ${state.utcHour}:00 UTC`}`);
    // one extra run right after this start, on top of the schedule; remove the variable afterwards
    if (env.PROOF_RUN_NOW) { log("proof: PROOF_RUN_NOW is set, running now"); run(); }
  })().catch(e => { state.enabled = false; state.error = String(e.message || e); log(`proof: off (${state.error})`); });
  return state;
}

// What /proof.json shows: addresses, schedule, matched routes and arm cycles. Never a key.
// Proof routes run between Ardea's own public wallets, so their route ids are safe to publish: anyone can track them.
const runView = r => r && Object.fromEntries(Object.entries(r).filter(([k]) => !/secret|key/i.test(k)));
export const publicState = s => ({
  enabled: s.enabled, mode: s.mode || "route", wallets: s.a ? [s.a, s.b] : [], armed: s.armed || [], routes: s.routes || [],
  amountSol: s.amountSol, utcHour: s.utcHour, everyHours: s.everyHours || 0, running: s.running, step: s.step || null, next: s.next,
  last: runView(s.last), history: (s.history || []).map(runView)
});
