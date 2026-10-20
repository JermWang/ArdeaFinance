// Ardea terminal. Views: Pulse, Trending, token page, Tracker, Portfolio. All data comes from public
// sources in the browser (PumpPortal, Jupiter, DexScreener, your Solana RPC, Houdini's Monero route); every trade is
// signed by your wallet, or locally by your instant/stealth wallets which are derived from one signature of it.
import { RPC_URL, TREASURY, FEE_BPS, JUP_BASE, JUP_API_KEY, DEFAULT_SLIPPAGE_BPS, PRIORITY_MAX_LAMPORTS, STEALTH_MAX_SOL, STEALTH_GAS_RESERVE, PROXY_URL } from "./config.js";
import { jupiter, prepareSwap, sendAndConfirm, preflight, confirmSent, toRaw, fromRaw, SOL_MINT, SwapError, JITO_URL, JITO_MIN_TIP } from "./swap.js";
import { triggerApi, limitAmounts, signAndExecute, describeOrder, evaluateRule, newRule, ruleTarget } from "./orders.js";
import { STEALTH_MESSAGE, StealthError, deriveStealth, deriveInstant, nextUnusedStealth, scanStealths, seedFingerprint, houdini, SOL_QUERY, solTokenId, routeQuote, fundingTx, exitTx, exitAmount, waitForRoute, jitter, feeOf } from "./stealth.js";
import { trace, DEFAULT_RPC, short, isAddress, base58Encode } from "./trace.js";
import { createBoard, fromPumpPortal, fromJupiter, fromStonk, STONK, pnl, isPumpMint, mergeHistory, pushSample, momentum } from "./market.js";
import { pumpPortal, stonkFun, tokenTrades, readCurves, metadata, holders, recentSwaps, walletHistory, onchainMeta, imageSources, identicon, setMediaProxy } from "./feeds.js";
import { renderGlyphs, emblem, glyphSVG } from "./art.js";
import { X_URL, TOKEN_CA, HOLDER_TIERS } from "./config.js";
import { tierFor } from "./tiers.js";
import { armSizes, pickArmed, armSummary, ARM_MAX_WALLETS } from "./armory.js";

const web3 = window.solanaWeb3;
const $ = id => document.getElementById(id);
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- small helpers ---------- */
const make = (tag, cls, s) => { const e = document.createElement(tag); if (cls) e.className = cls; if (s !== undefined && s !== null) e.textContent = s; return e; };
const text = (el, s) => { el.textContent = s; return el; };
const emptyRow = (table, msg, art) => { const tr = make("tr"), td = make("td", "tdempty", art ? null : msg); if (art) td.append(emptyArt(art, msg, "tdart")); td.colSpan = 12; tr.append(td); table.append(tr); };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
};
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const price = n => {
  if (n == null || !isFinite(n) || n <= 0) return "—";
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  if (n >= 0.001) return `$${n.toPrecision(4)}`;
  let zeros = -Math.floor(Math.log10(n)) - 1, digits = Math.round(n * 10 ** (zeros + 4));
  if (digits >= 10000) { zeros--; digits = Math.round(n * 10 ** (zeros + 4)); }
  return `$0.0${String(zeros).split("").map(d => SUB[d]).join("")}${digits}`;
};
const usd = n => n == null || !isFinite(n) ? "—" : Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(Math.abs(n) < 10 ? 2 : 0)}`;
const pct = n => n == null || !isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
const solFmt = n => n == null || !isFinite(n) ? "—" : n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(3) : n.toFixed(4);
const num = n => n == null || !isFinite(n) ? "—" : n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(n < 10 ? 2 : 0);
const count = n => n == null || !isFinite(n) ? "—" : n < 1e3 ? String(Math.round(n)) : num(n); // whole things: holders
const ago = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const cls = (el, n) => { el.classList.toggle("up", n > 0); el.classList.toggle("down", n < 0); return el; };
const safeUrl = u => typeof u === "string" && /^https:\/\//.test(u) ? u : null;
// Token images: a flat placeholder from the mint shows at once; each source (proxy, original, other IPFS
// gateways, DexScreener) is probed off-screen with a timeout, and the first one that loads replaces it.
const resolvedImg = new Map();
const refPolicy = src => PROXY && src.startsWith(PROXY) ? "strict-origin-when-cross-origin" : "no-referrer";
const showImg = (img, src, real) => { if (!src.startsWith("data:")) img.referrerPolicy = refPolicy(src); img.src = src; img.dataset.real = real ? "1" : "0"; };
const icon = (img, url, seed) => {
  const gen = img._g = (img._g || 0) + 1, key = url || seed || "";
  img.alt = ""; img.decoding = "async"; img.draggable = false;
  if (resolvedImg.has(key)) { showImg(img, resolvedImg.get(key), true); return img; }
  if (img.dataset.real !== "1") showImg(img, identicon(seed || url || "?"), false);
  const list = imageSources(url, { mint: seed });
  let i = 0;
  const next = () => {
    if (img._g !== gen || i >= list.length) return;
    const src = list[i], first = i++ === 0, probe = new Image();
    let done = false;
    const finish = ok => { if (done) return; done = true; clearTimeout(t); if (ok && probe.naturalWidth) { resolvedImg.set(key, src); if (img._g === gen) showImg(img, src, true); } else next(); };
    const t = setTimeout(() => finish(false), first ? 8000 : 5000);
    probe.referrerPolicy = refPolicy(src); probe.onload = () => finish(true); probe.onerror = () => finish(false);
    probe.src = src;
  };
  next();
  return img;
};
const link = (href, label, cls) => { const a = make("a", cls, label); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };
// Small line icons (16×16, currentColor) for links and stats. Static markup, never built from data.
const ICO = {
  x: '<path d="M3 2.5h3l7 11h-3z" fill="currentColor" stroke="none"/><path d="M13 2.5 3.2 13.5"/>',
  tg: '<path d="M14 2.6 1.9 7.4l4 1.3 1.5 4.6 2.2-2.5 3.4 2.5z"/><path d="M5.9 8.7 12 4.9"/>',
  web: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.3 2.2 2.3 9.8 0 12M8 2c-2.3 2.2-2.3 9.8 0 12"/>',
  stonk: '<path d="M2 12.5l4-4.2 3 3 5-6"/><path d="M10.5 5.3H14v3.5"/>',
  pump: '<g transform="rotate(-38 8 8)"><rect x="2" y="5.3" width="12" height="5.4" rx="2.7"/><path d="M8 5.3v5.4"/></g>',
  dex: '<path d="M2.5 13.5h11"/><path d="M4.5 11V7.5M8 11V3.5M11.5 11V6"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  scan: '<circle cx="7" cy="7" r="4.5"/><path d="m10.4 10.4 3.6 3.6"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.4 10.4 3.6 3.6M5 7h4"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 10.5v-7a1 1 0 0 1 1-1h7"/>',
  check: '<path d="m3 8.5 3 3 7-7"/>',
  users: '<circle cx="6" cy="5.5" r="2.5"/><path d="M1.5 13.5c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4"/><path d="M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.8c1.3.6 2.2 1.9 2.5 3.7"/>',
  drop: '<path d="M8 2s4.5 4.8 4.5 8A4.5 4.5 0 0 1 3.5 10C3.5 6.8 8 2 8 2z"/>',
  bars: '<path d="M2.5 13.5h11M4.5 11V8M8 11V5M11.5 11V9"/>',
  crown: '<path d="m2.5 12 1-7 3 3L8 3.5 9.5 8l3-3 1 7z"/>',
  dev: '<rect x="2.5" y="3" width="11" height="8" rx="1.5"/><path d="M6 14h4M8 11v3M5.5 6 7 7.3 5.5 8.6"/>',
  bolt: '<path d="M9 1.8 3.6 9h4l-.8 5.2L12.4 7h-4z"/>',
  target: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="2.6"/><path d="M8 .9v2.4M8 12.7v2.4M.9 8h2.4M12.7 8h2.4"/>',
  auto: '<rect x="3" y="5" width="10" height="8" rx="2"/><path d="M8 5V2.6M6 9h.01M10 9h.01M1.5 8.5v2M14.5 8.5v2"/><circle cx="8" cy="2.2" r=".6" fill="currentColor"/>',
  shield: '<path d="M8 1.8 13 3.8v3.7c0 3.1-2.1 5.4-5 6.7-2.9-1.3-5-3.6-5-6.7V3.8z"/><path d="m5.8 8 1.5 1.5 3-3"/>',
  star: '<path d="m8 1.9 1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.2l-3.7 2 .8-4.1-3-2.9 4.1-.5z"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7 3.4 3.4"/><circle cx="8" cy="8" r="4.6"/>',
  ext: '<path d="M6.5 3.5H3.5v9h9v-3"/><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/>',
  heart: '<path d="M8 13.5S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.5-6 7.5z"/>',
  repost: '<path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H12l-2-2M13 9v1.5a1.5 1.5 0 0 1-1.5 1.5H4l2 2"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  verified: '<path d="m8 1.5 1.7 1.3 2.1-.1.6 2 1.7 1.3-.8 2 .8 2-1.7 1.3-.6 2-2.1-.1L8 14.5l-1.7-1.3-2.1.1-.6-2-1.7-1.3.8-2-.8-2 1.7-1.3.6-2 2.1.1z"/><path d="m5.6 8 1.6 1.6 3.2-3.2"/>'
};
const svgIcon = (name, cls) => { const e = document.createElementNS("http://www.w3.org/2000/svg", "svg"); e.setAttribute("viewBox", "0 0 16 16"); e.setAttribute("aria-hidden", "true"); e.setAttribute("class", `ico${cls ? " " + cls : ""}`); e.innerHTML = ICO[name]; return e; };
// An icon followed by a text label, replacing whatever the element held.
const iconLabel = (el, name, label, cls) => { el.textContent = ""; el.append(svgIcon(name, cls)); if (label !== "" && label != null) el.append(make("span", "", label)); return el; };
const extLink = (href, label, cls) => { const a = link(href, "", cls); if (label) a.append(label); a.append(svgIcon("ext", "ext")); a.setAttribute("aria-label", `${label || "Open"} (opens in a new tab)`); return a; };
const qbLabel = (b, v) => { iconLabel(b, "bolt", v); b.setAttribute("aria-label", `Quick buy ${v} SOL`); return b; };
const solscan = (kind, id) => `https://solscan.io/${kind}/${id}`;
const rejected = e => e && (e.code === 4001 || /reject|cancel|denied|declined/i.test(e.message || ""));
const errMsg = e => rejected(e) ? "Cancelled in wallet. Nothing was sent." : (e && e.message) || String(e);

function toast(msg, kind = "", sig) {
  const t = make("div", `toast ${kind}`, msg);
  if (sig) { t.append(" "); t.append(extLink(solscan("tx", sig), "Solscan")); }
  $("toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 10000 : 6000);
}

/* ---------- settings ---------- */
const DEFAULTS = {
  quickBuy: "0.1", buyAmounts: ["0.1", "0.5", "1", "2"], sellPcts: [10, 25, 50, 100],
  presets: [
    { slippageBps: DEFAULT_SLIPPAGE_BPS, priority: "high", maxSol: PRIORITY_MAX_LAMPORTS / 1e9, tipSol: 0, mev: false },
    { slippageBps: 1000, priority: "veryHigh", maxSol: 0.003, tipSol: 0.0005, mev: false },
    { slippageBps: 2000, priority: "veryHigh", maxSol: 0.01, tipSol: 0.001, mev: true }
  ],
  preset: 0, from: "main", finalStretch: 60, autoTp: 0, autoSl: 0,
  stealth: true, // Private mode on by default for buys from the main wallet; the trade panel switch saves the choice
  privacy: "strong" // "strong": a random wait between the SOL landing and the buy; "fast": buy as soon as it lands
};
const settings = Object.assign(structuredClone(DEFAULTS), store.get("ardea-settings", {}));
const saveSettings = () => store.set("ardea-settings", settings);
const preset = () => settings.presets[settings.preset] || DEFAULTS.presets[0];
// Private mode timing: the random wait (ms) between the SOL landing in the stealth wallet and its buy.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PRIVACY = { strong: { settle: [30000, 180000] }, fast: { settle: [0, 0] } };

/* ---------- services ---------- */
// With PROXY_URL set, RPC, Jupiter, the Monero route (Houdini), Jito and X go through the Ardea proxy, which holds the keys.
const PROXY = (PROXY_URL || "").replace(/\/$/, "");
setMediaProxy(PROXY);
const rpcUrl = (() => { const v = store.get("ardea-rpc-url", null) || (() => { try { return localStorage.getItem("ardea-rpc"); } catch (_) { return null; } })(); return typeof v === "string" && /^https?:\/\/\S+$/.test(v.trim()) ? v.trim() : PROXY ? `${PROXY}/rpc` : RPC_URL || DEFAULT_RPC; })();
const connection = new web3.Connection(rpcUrl, "confirmed");
const jup = jupiter({ base: PROXY ? `${PROXY}/jup` : JUP_BASE, apiKey: PROXY ? "" : JUP_API_KEY, minInterval: PROXY ? 300 : JUP_API_KEY ? 1050 : 2050 });
const hd = houdini({ base: PROXY ? `${PROXY}/houdini` : "" });
const jitoUrl = PROXY ? `${PROXY}/jito` : JITO_URL;
const trig = triggerApi(jup);
const S = { solUsd: null, wallet: null, seed: null, instant: null, sol: null, instantSol: null, busy: false, route: null, fee: { bps: FEE_BPS, pct: 0, tier: 0 } };

/* ---------- holder fee tiers ---------- */
// Holding the Ardea token lowers the fee on every trade and private buy (HOLDER_TIERS in config.js). The holding is
// your main wallet plus your instant wallet, read from the chain; the server's /env.js can supply the mint at launch.
const feeBps = () => S.fee.bps;
let tokenCa = isAddress(TOKEN_CA || "") ? TOKEN_CA : "", tokenSupply = null;
import(PROXY ? `${PROXY}/env.js` : "./env.js").then(m => { if (isAddress(m.TOKEN_CA || "")) { tokenCa = m.TOKEN_CA; refreshTier(); } }).catch(() => {});
async function refreshTier() {
  if (!tokenCa || !S.wallet || !HOLDER_TIERS.length) { S.fee = { bps: FEE_BPS, pct: 0, tier: 0 }; return; }
  try {
    const mint = new web3.PublicKey(tokenCa), owners = [S.wallet.pk, S.instant?.pk].filter(Boolean);
    if (tokenSupply == null) tokenSupply = BigInt((await connection.getTokenSupply(mint)).value.amount);
    let held = 0n;
    for (const o of owners) for (const a of (await connection.getParsedTokenAccountsByOwner(new web3.PublicKey(o), { mint })).value) held += BigInt(a.account.data.parsed.info.tokenAmount.amount);
    S.fee = tierFor(held, tokenSupply, HOLDER_TIERS, FEE_BPS);
  } catch (_) { /* keep the last known fee; an RPC hiccup never lowers or raises it on its own */ }
}

// Polling and streams run only while someone can see the terminal. A loop that wakes in a hidden tab parks
// instead of rescheduling, and coming back to the tab restarts every parked loop at once (see the
// visibilitychange handler at the bottom). Autopilot rules and armed snipes are the exception: they exist
// to act while nobody is looking, so the work they need keeps running.
const awake = () => !document.hidden;
const parked = new Set();
const whenAwake = fn => { if (awake()) return true; parked.add(fn); return false; };

async function refreshSolPrice() {
  try {
    const p = await jup.prices([SOL_MINT]);
    S.solUsd = p[SOL_MINT]?.usdPrice ?? S.solUsd;
    text($("solprice"), S.solUsd ? `SOL $${S.solUsd.toFixed(2)}` : "SOL —");
  } catch (_) {}
}
const decimalsCache = new Map();
async function decimalsOf(mint) {
  if (decimalsCache.has(mint)) return decimalsCache.get(mint);
  const r = await connection.getParsedAccountInfo(new web3.PublicKey(mint));
  const d = r.value?.data?.parsed?.info?.decimals;
  if (!Number.isInteger(d)) throw new SwapError("This address isn't a token mint.");
  decimalsCache.set(mint, d);
  return d;
}
const tokenInfo = new Map(); // mint → Jupiter token object
async function lookupTokens(mints) {
  const need = [...new Set(mints)].filter(m => m && !tokenInfo.has(m)).slice(0, 50);
  if (!need.length) return;
  need.forEach(m => tokenInfo.set(m, null));
  try { const list = await jup.search(need.join(",")); (Array.isArray(list) ? list : []).forEach(t => tokenInfo.set(t.id, t)); } catch (_) {}
  needMeta(need.filter(m => !tokenInfo.get(m)?.icon));
}
// Name, image and socials for any token, from wherever they turned up: Jupiter, the Pulse board, or
// the chain itself (see enrich below).
const metaStore = new Map();
const symbolOf = mint => tokenInfo.get(mint)?.symbol || board.tokens.get(mint)?.symbol || metaStore.get(mint)?.symbol || short(mint);
const iconOf = mint => tokenInfo.get(mint)?.icon || board.tokens.get(mint)?.image || metaStore.get(mint)?.image;
const infoOf = mint => ({ ...metaStore.get(mint), ...board.tokens.get(mint) });

/* ---------- brand and art ---------- */
renderGlyphs(document);
// An empty state with a small isometric drawing above the message.
const emptyArt = (kind, msg, cls = "empty") => { const d = make("div", cls + " art-empty"); d.dataset.msg = msg; d.append(emblem(kind), make("span", "", msg)); return d; };

/* ---------- wallets ---------- */
function providers() {
  const w = window, out = [];
  if (w.phantom?.solana?.isPhantom) out.push({ name: "Phantom", p: w.phantom.solana });
  if (w.solflare?.isSolflare) out.push({ name: "Solflare", p: w.solflare });
  if (w.backpack?.isBackpack) out.push({ name: "Backpack", p: w.backpack });
  if (!out.length && w.solana) out.push({ name: "Wallet", p: w.solana });
  return out;
}
async function connect(w) {
  const r = await w.p.connect();
  const pk = (r && r.publicKey ? r.publicKey : w.p.publicKey).toString();
  S.wallet = { name: w.name, p: w.p, pk };
  S.seed = null; S.instant = null; S.instantSol = null;
  w.p.on?.("accountChanged", next => { if (next) { S.wallet.pk = next.toString(); S.seed = null; S.instant = null; onWallet(); } else disconnect(); });
  onWallet();
}
async function disconnect() {
  try { await S.wallet?.p.disconnect?.(); } catch (_) {}
  S.wallet = null; S.seed = null; S.instant = null; S.sol = S.instantSol = null;
  if (settings.from === "instant") { settings.from = "main"; saveSettings(); }
  onWallet();
}
async function ensureConnected() {
  if (S.wallet) return true;
  const list = providers();
  if (list.length === 1) { await connect(list[0]); return true; }
  openWalletModal();
  return false;
}
function onWallet() {
  renderWalletBtn(); refreshBalances();
  if (S.route === "portfolio") renderPortfolio();
  if (S.route === "token") { renderTradePanel(); renderMine(); }
}
function renderWalletBtn() {
  const b = $("walletbtn");
  if (!S.wallet) { text(b, "Connect"); b.className = "btn primary"; return; }
  b.className = "btn";
  const inst = settings.from === "instant";
  const bal = inst ? S.instantSol : S.sol;
  iconLabel(b, inst ? "bolt" : "key", `${short(inst && S.instant ? S.instant.pk : S.wallet.pk)} · ${bal != null ? fromRaw(bal, 9, 3) : "…"} SOL`);
}
async function refreshBalances() {
  if (!S.wallet) return renderWalletBtn();
  try {
    S.sol = BigInt(await connection.getBalance(new web3.PublicKey(S.wallet.pk)));
    if (S.instant) S.instantSol = BigInt(await connection.getBalance(S.instant.kp.publicKey));
  } catch (_) {}
  await refreshTier();
  renderWalletBtn();
  readArmBalances().then(renderArmChip); resumeArming();
  if (S.route === "token") { refreshTokenBal(); renderTradePanel(); }
}

// One signature of a fixed message derives the instant wallet and every stealth wallet. Memory only.
async function walletSeed() {
  if (S.seed) return S.seed;
  if (!S.wallet && !(await ensureConnected())) throw new StealthError("Connect a wallet first.");
  if (!S.wallet.p.signMessage) throw new StealthError(`${S.wallet.name} can't sign messages, which instant and stealth wallets need.`);
  const r = await S.wallet.p.signMessage(new TextEncoder().encode(STEALTH_MESSAGE), "utf8");
  const sig = r instanceof Uint8Array ? r : r.signature;
  if (!sig || sig.length !== 64) throw new StealthError("The wallet returned an unexpected signature.");
  const fp = await seedFingerprint(sig), key = `ardea-stealthfp-${S.wallet.pk}`, known = store.get(key, null);
  if (known && known !== fp) throw new StealthError("This wallet signed differently than last time, so it would open different instant and stealth wallets. Use the same wallet app as before, or export keys from the device you used.");
  store.set(key, fp);
  return (S.seed = sig);
}
async function instantWallet() {
  if (S.instant) return S.instant;
  const kp = await deriveInstant(web3, await walletSeed());
  S.instant = { kp, pk: kp.publicKey.toBase58() };
  S.instantSol = BigInt(await connection.getBalance(kp.publicKey).catch(() => 0));
  renderWalletBtn(); updateAutoChip();
  return S.instant;
}
async function signerFor(from) {
  if (from === "instant") { const i = await instantWallet(); return { pk: i.pk, local: i.kp, label: "instant" }; }
  if (!S.wallet && !(await ensureConnected())) throw new SwapError("Connect a wallet first.");
  return { pk: S.wallet.pk, local: null, label: "main" };
}
// The main wallet only ever sees transactions our RPC has already simulated: Phantom blocks what its own
// simulation says will fail ("This dApp could be malicious"). It then signs and sends itself
// (signAndSendTransaction, Phantom's recommended method), unless the trade has to go through Jito.
async function signSend(tx, signer, lastValidBlockHeight, onStatus = () => {}, send = {}) {
  if (signer.local) { tx.sign([signer.local]); return sendAndConfirm(connection, tx, lastValidBlockHeight, { onStatus, ...send }); }
  await preflight(connection, tx);
  const p = S.wallet.p;
  if (send.jito || !p.signAndSendTransaction) return sendAndConfirm(connection, await p.signTransaction(tx), lastValidBlockHeight, { onStatus, ...send });
  const { signature } = await p.signAndSendTransaction(tx, { preflightCommitment: "confirmed" });
  onStatus({ state: "sent", sig: signature });
  return confirmSent(connection, signature, lastValidBlockHeight, { onStatus });
}
// Limit orders: Jupiter submits the signed transaction, so the wallet only signs (after the same check).
const signWith = signer => async tx => {
  if (signer.local) { tx.sign([signer.local]); return tx; }
  await preflight(connection, tx);
  return S.wallet.p.signTransaction(tx);
};
// A plain SOL transfer from the main wallet: enough balance for it plus fees, and at least the rent a new
// account needs, so nothing reaches the wallet that would fail.
const RENT_MIN = 890_880n, TRANSFER_RESERVE = 1_000_000n;
function checkTransfer(a) {
  if (a < RENT_MIN) throw new SwapError("Send at least 0.00089 SOL: that's the least a new Solana account can hold.");
  if (S.sol != null && a + TRANSFER_RESERVE > S.sol) throw new SwapError(`Not enough SOL. Your wallet has ${fromRaw(S.sol, 9, 4)} SOL; keep about 0.001 SOL for fees.`);
}

/* ---------- trades ---------- */
const TKEY = pk => `ardea-trades-${pk}`;
const tradesOf = pk => store.get(TKEY(pk), []);
function logTrade(pk, t) { const l = tradesOf(pk); l.unshift(t); store.set(TKEY(pk), l.slice(0, 500)); }
const tradedMints = () => { const s = new Set(); for (const pk of [S.wallet?.pk, S.instant?.pk]) if (pk) tradesOf(pk).forEach(t => s.add(t.mint)); return s; };

// Fee-paying trades need the project's treasury. Until it's set (before launch) they stop with a plain message.
const TRADING_CLOSED = "Trading opens at launch: the treasury address isn't set yet.";
async function executeTrade({ side, mint, amountRaw, from = settings.from, onStatus = () => {} }) {
  if (!TREASURY) throw new SwapError(TRADING_CLOSED);
  const signer = await signerFor(from), p = preset();
  if (side === "buy") {
    const bal = from === "instant" ? S.instantSol : S.sol;
    if (bal != null && BigInt(amountRaw) + 5_000_000n > bal) throw new SwapError(from === "instant" ? "Not enough SOL in your instant wallet. Deposit from the wallet menu." : "Not enough SOL for this buy plus network fees.");
  }
  onStatus("Routing through Jupiter…");
  const tip = BigInt(Math.round((p.tipSol || 0) * 1e9));
  const prep = await prepareSwap({ web3, jup, connection, side, mint, amountRaw, user: signer.pk, treasury: TREASURY, feeBps: feeBps(), slippageBps: p.slippageBps, priorityMaxLamports: Math.round(p.maxSol * 1e9), priorityLevel: p.priority, tipLamports: tip });
  onStatus(signer.local ? "Sending…" : "Approve in your wallet…");
  const jito = tip >= JITO_MIN_TIP ? jitoUrl : null;
  const sig = await signSend(prep.tx, signer, prep.lastValidBlockHeight, s => s.state === "sent" && onStatus(`Sent${jito ? (p.mev ? " privately via Jito" : " via Jito + RPC") : ""}. Confirming…`), { jito, mevProtect: !!(jito && p.mev) });
  const dec = await decimalsOf(mint);
  const sol = side === "buy" ? Number(amountRaw) / 1e9 : (Number(prep.quote.outAmount) - Number(prep.fee)) / 1e9;
  const tokens = side === "buy" ? Number(prep.quote.outAmount) / 10 ** dec : Number(amountRaw) / 10 ** dec;
  logTrade(signer.pk, { sig, time: Date.now(), side, mint, symbol: symbolOf(mint), sol, tokens, from: signer.label });
  setTimeout(refreshBalances, 1500);
  return { sig, sol, tokens };
}

async function quickBuy(mint, btn) {
  const amount = toRaw($("qbamt").value || settings.quickBuy, 9);
  if (!amount) return toast("Set a quick-buy amount in the top bar.", "err");
  if (btn) btn.disabled = true;
  try {
    if (settings.from === "main" && !S.wallet && !(await ensureConnected())) return;
    // with Private mode on, the bolt fires an armed wallet when one is ready: an instant private buy
    if (settings.stealth && settings.from !== "instant" && S.wallet) {
      await readArmBalances();
      if (armReady()) { const f = await fireArmed(mint); toast(`Armed wallet #${f.index} bought ≈${num(f.tokens)} ${symbolOf(mint)} with ${solFmt(f.sol)} SOL`, "ok", f.sig); return; }
    }
    const r = await executeTrade({ side: "buy", mint, amountRaw: amount, onStatus: () => {} });
    toast(`Bought ≈${num(r.tokens)} ${symbolOf(mint)} for ${solFmt(r.sol)} SOL`, "ok", r.sig);
  } catch (e) { toast(errMsg(e), "err"); }
  finally { if (btn) btn.disabled = false; }
}

/* ---------- router ---------- */
const VIEWS = ["arm", "pulse", "trending", "token", "tracker", "portfolio"];
let leaveToken = () => {};
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  let [name, arg] = h.split("/");
  if (!name) name = "arm";
  if (isAddress(name)) { location.replace(`#/token/${name}`); return; } // old deep links
  if (!VIEWS.includes(name) || (name === "token" && !isAddress(arg || ""))) name = "arm";
  if (S.route === "token" && (name !== "token" || arg !== S.tokenMint)) leaveToken();
  S.route = name;
  VIEWS.forEach(v => { $(`v-${v}`).hidden = v !== name; });
  document.querySelectorAll(".nav a").forEach(a => a.setAttribute("aria-current", a.dataset.route === name ? "page" : "false"));
  if (name === "arm") { document.title = "Arm · Ardea"; renderArm(); readArmBalances().then(refreshArmViews); resumeArming(); }
  if (name === "pulse") { document.title = "Pulse · Ardea"; renderPulse(true); }
  if (name === "trending") { document.title = "Trending · Ardea"; loadTrending(); }
  if (name === "token") openToken(arg);
  if (name === "tracker") { document.title = "Tracker · Ardea"; renderTracker(); }
  if (name === "portfolio") { document.title = "Portfolio · Ardea"; renderPortfolio(); }
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);

/* ---------- icons and token links ---------- */
// Every place a token lives: its own socials first, then the explorers.
function tokenLinks(mint, info = {}) {
  const out = [];
  if (info.twitter) out.push({ k: "x", label: "X", href: info.twitter, social: true });
  if (info.telegram) out.push({ k: "tg", label: "Telegram", href: info.telegram, social: true });
  if (info.website) out.push({ k: "web", label: "Website", href: info.website, social: true });
  if (isPumpMint(mint, info.launchpad) || info.pump) out.push({ k: "pump", label: "pump.fun", href: `https://pump.fun/coin/${mint}` });
  if (info.stonk || info.launchpad === "stonk.fun") out.push({ k: "stonk", label: "stonk.fun", href: `${STONK}/token/${mint}` });
  out.push({ k: "dex", label: "DexScreener", href: `https://dexscreener.com/solana/${mint}` });
  out.push({ k: "eye", label: "Birdeye", href: `https://birdeye.so/token/${mint}?chain=solana` });
  out.push({ k: "scan", label: "Solscan", href: solscan("token", mint) });
  out.push({ k: "search", label: "Search X", href: `https://x.com/search?q=${encodeURIComponent(mint)}&f=live` });
  return out.filter(l => /^https:\/\//.test(l.href));
}
function linkBtn(l, withLabel) {
  const a = link(l.href, "", `lk lk-${l.k}${l.social ? " soc" : ""}`); a.title = l.label; a.setAttribute("aria-label", l.label);
  a.append(svgIcon(l.k)); if (withLabel) a.append(make("span", "", l.label));
  a.addEventListener("click", e => e.stopPropagation());
  return a;
}
function copyBtn(mint, withLabel) {
  const b = make("button", "lk lk-copy"); b.type = "button"; b.title = "Copy contract address"; b.setAttribute("aria-label", "Copy contract address");
  b.append(svgIcon("copy")); if (withLabel) b.append(make("span", "", `${mint.slice(0, 4)}…${mint.slice(-4)}`));
  b.addEventListener("click", async e => {
    e.preventDefault(); e.stopPropagation();
    try { await navigator.clipboard.writeText(mint); b.classList.add("done"); b.firstChild.replaceWith(svgIcon("check")); setTimeout(() => { b.classList.remove("done"); b.firstChild.replaceWith(svgIcon("copy")); }, 1400); } catch (_) { toast("Couldn't reach the clipboard.", "err"); }
  });
  return b;
}
// Avatar with the bonding curve drawn as a ring around it.
function avatar(cls) { const d = make("div", `av${cls ? " " + cls : ""}`); d.append(make("img", "tok-icon"), make("span", "av-badge")); return d; }
function setRing(av, t, column) {
  const migrated = column === "migrated" || t.complete || t.graduatedAt || t.migratedAt;
  const p = migrated ? 100 : (t.pump || t.stonk) && t.progress != null ? Math.max(0, Math.min(100, t.progress)) : null;
  av.style.setProperty("--p", p ?? 0);
  av.classList.toggle("ring", p != null); av.classList.toggle("hot", p != null && p >= 80 && !migrated); av.classList.toggle("grad", !!migrated);
  const badge = av.querySelector(".av-badge"); badge.textContent = ""; if (migrated) badge.append(svgIcon("check")); badge.hidden = !migrated;
  av.title = migrated ? "Migrated to an AMM pool" : p != null ? `Bonding curve ${p.toFixed(1)}%` : "";
}

/* ---------- Pulse ---------- */
const board = createBoard({ finalStretch: settings.finalStretch });
const filters = store.get("ardea-pulse-filters", { new: {}, final: {}, migrated: {} });
const cardEls = new Map();
const paused = new Set();
let pulseDirty = true;

function seedPulse() {
  jup.list("recent").then(l => { (l || []).forEach(t => board.upsert(fromJupiter(t))); pulseDirty = true; }).catch(() => {});
  jup.list("toptraded", "5m", 50).then(l => {
    (l || []).filter(t => t.graduatedPool && isPumpMint(t.id, t.launchpad)).forEach(t => board.upsert(fromJupiter(t)));
    pulseDirty = true;
  }).catch(() => {});
}
let pp = null;
const startPumpPortal = () => pumpPortal({
  onStatus: s => setStatusChip($("pp-status"), s, "pump.fun stream"),
  onNewToken: m => {
    const t = board.upsert(fromPumpPortal(m, S.solUsd));
    t.fresh = true; pulseDirty = true;
    if (awake()) metadata(m.uri).then(meta => applyMeta(m.mint, meta)); // hidden: enrich fetches it on return
  },
  onMigration: m => {
    fireSnipe(m.mint);
    board.migrate(m.mint, Date.now(), { pool: m.pool });
    pulseDirty = true;
    const watched = watchlist().some(w => w.mint === m.mint) || tradedMints().has(m.mint);
    if (watched) toast(`${symbolOf(m.mint)} migrated to ${m.pool || "an AMM"}.`, "info");
  }
});
// stonk.fun launches, polled from its public API into the same board
stonkFun({ onStatus: s => setStatusChip($("sf-status"), s, "stonk.fun"), onTokens: list => { list.forEach(t => t && t.mint && board.upsert(fromStonk(t))); pulseDirty = true; } });
/* ---------- token metadata ---------- */
// Tokens that reach the terminal without a name or image (migrations, pasted mints, tokens Jupiter
// hasn't indexed yet) get them from the chain: metadata account → URI → JSON. Visible tokens first,
// at most one batch every 3 seconds, and a failed token is retried after 90 seconds.
const metaWant = new Set(), metaTried = new Map();
const needMeta = mints => { for (const m of mints) if (m && isAddress(m)) metaWant.add(m); };
const hasMeta = m => !!iconOf(m) && symbolOf(m) !== short(m);
function applyMeta(mint, m) {
  if (!m) return;
  const got = Object.fromEntries(Object.entries(m).filter(([, v]) => v != null && v !== ""));
  if (!Object.keys(got).length) return;
  metaStore.set(mint, { ...got, ...metaStore.get(mint), ...(got.image ? { image: got.image } : {}) });
  const cur = board.tokens.get(mint);
  if (cur) { board.upsert({ mint, ...Object.fromEntries(Object.entries(got).filter(([k]) => cur[k] == null || cur[k] === "")) }); pulseDirty = true; }
  if (S.route === "token" && S.tokenMint === mint) renderTokenHead();
}
async function enrich() {
  if (!whenAwake(enrich)) return;
  try {
    if (S.route === "pulse") { const c = board.columns(); needMeta([...c.new, ...c.final, ...c.migrated].filter(t => !t.image || !t.symbol).map(t => t.mint)); }
    const now = Date.now();
    const due = [...metaWant].filter(m => !hasMeta(m) && now - (metaTried.get(m) || 0) > 90_000).slice(0, 100);
    metaWant.clear();
    due.forEach(m => metaTried.set(m, now));
    const bare = [];
    for (const m of due) { const uri = infoOf(m).uri; if (uri) metadata(uri).then(meta => applyMeta(m, meta)); else bare.push(m); }
    if (bare.length) {
      const found = await onchainMeta({ connection, web3, mints: bare });
      for (const [m, d] of found) { applyMeta(m, { name: d.name, symbol: d.symbol, uri: d.uri }); if (d.uri) metadata(d.uri).then(meta => applyMeta(m, meta)); }
    }
  } catch (_) {}
  setTimeout(enrich, 3000);
}

// Holders, top-10 share and dev share only come from Jupiter's token data. Tokens that reached the board
// another way (the pump.fun stream, live migrations, stonk.fun) get them from a batched Jupiter lookup:
// visible cards without them are asked for every 20 seconds until Jupiter has indexed them, and the rest
// refresh every minute. Market cap, volume and liquidity from the token's own source are kept.
const statsAt = new Map();
async function statsLoop() {
  if (!whenAwake(statsLoop)) return;
  try {
    if (S.route === "pulse") {
      const c = board.columns(), now = Date.now();
      const every = t => t.holders == null ? 10_000 : board.column(t) === "migrated" ? 30_000 : 12_000;
      const due = [...c.new, ...c.final, ...c.migrated].filter(t => now - (statsAt.get(t.mint) || 0) > every(t)).map(t => t.mint).slice(0, 100);
      if (due.length) {
        due.forEach(m => statsAt.set(m, now));
        const list = (await Promise.all([due.slice(0, 50), due.slice(50)].filter(b => b.length).map(b => jup.search(b.join(",")).catch(() => [])))).flat();
        for (const j of Array.isArray(list) ? list : []) {
          const cur = board.tokens.get(j.id);
          if (!cur) continue;
          tokenInfo.set(j.id, j);
          const f = fromJupiter(j), { mint: _m, name: _n, symbol: _s, image: _i, createdAt: _c, mcapUsd, volume24h, liquidityUsd, progress: _p, graduatedAt: _g, source: _src, ...stats } = f;
          const t = board.upsert({ mint: j.id, ...stats, ...(cur.mcapUsd == null || !cur.curveAt || now - cur.curveAt > 30_000 || cur.complete ? { mcapUsd } : {}), ...(cur.volume24h == null ? { volume24h } : {}), ...(liquidityUsd != null ? { liquidityUsd } : {}) });
          // tokens with no curve to read still get a sparkline, from Jupiter's market cap
          if (t && (!t.pump || t.complete || t.migratedAt)) pushSample(t, { mc: t.mcapUsd });
        }
        pulseDirty = true;
      }
    }
  } catch (_) {}
  setTimeout(statsLoop, 5000);
}

function setStatusChip(el, s, label) {
  el.textContent = ""; const d = make("span", "dot"); d.classList.toggle("live", s === "live"); d.classList.toggle("warn", s !== "live"); el.append(d, `${label}${s === "live" ? "" : ` · ${s}`}`);
}

async function curveLoop() {
  const armed = snipes().filter(x => x.status === "armed").map(x => x.mint);
  // hidden: only the curves an armed snipe is waiting on
  if (!awake() && !armed.length) { parked.add(curveLoop); return; }
  const targets = [...new Set([...armed, ...(awake() ? board.curveTargets(100) : [])])].slice(0, 100);
  if (targets.length) {
    try {
      const curves = await readCurves({ connection, web3, mints: targets });
      for (const [mint, c] of curves) if (c.complete && armed.includes(mint)) fireSnipe(mint);
      // a completed curve has handed its reserves to the AMM, so it no longer prices the token: keep the last real price
      for (const [mint, c] of curves) {
        if (c.complete) { board.upsert({ mint, progress: 100, complete: true }); continue; }
        const raisedSol = Number(c.realSolReserves) / 1e9, mcapUsd = S.solUsd ? c.mcapSol * S.solUsd : undefined;
        const t = board.upsert({ mint, progress: c.progress, mcapSol: c.mcapSol, mcapUsd, raisedSol, curveAt: Date.now(), priceUsd: S.solUsd ? c.priceSol * S.solUsd : undefined });
        pushSample(t, { mc: mcapUsd, sol: raisedSol });
      }
      setStatusChip($("curve-status"), "live", `curves · ${curves.size}`);
      pulseDirty = true;
    } catch (_) { setStatusChip($("curve-status"), "rate limited", "curves"); }
  }
  board.prune();
  for (const m of cardEls.keys()) if (!board.tokens.has(m)) cardEls.delete(m);
  setTimeout(curveLoop, S.route === "pulse" ? 6000 : 20000);
}

// Placeholder cards while the first tokens stream in; after 12 s with nothing, the empty state says why.
let pulseWaitedOut = false;
setTimeout(() => { pulseWaitedOut = true; pulseDirty = true; }, 12000);
function skeletonCard() { const d = make("div", "skel"); d.setAttribute("aria-hidden", "true"); const l = make("div", "l"); l.append(make("i"), make("i"), make("i")); d.append(make("i", "c"), l, make("i", "b")); return d; }
function renderPulse(force) {
  if (S.route !== "pulse") return;
  if (!force && !pulseDirty) { tickAges(); return; }
  pulseDirty = false;
  board.settings.finalStretch = settings.finalStretch;
  for (const col of document.querySelectorAll(".pcol")) {
    const key = col.dataset.col;
    if (paused.has(key) && !force) continue;
    const list = board.columns(filters[key] || {})[key];
    const perMin = key === "new" ? [...board.tokens.values()].filter(t => t.source === "pumpportal" && Date.now() - (t.createdAt || 0) < 60_000).length : null;
    text(col.querySelector(".count"), perMin != null ? `${list.length} · ${perMin}/min` : String(list.length));
    const host = col.querySelector(".plist");
    if (!list.length) {
      const msg = key === "new" ? "Waiting for new pump.fun launches…" : key === "final" ? `Tokens past ${settings.finalStretch}% of their bonding curve show here.` : "Graduated tokens show here.";
      if (!cardEls.size && key !== "final" && !pulseWaitedOut) { if (!host.querySelector(".skel")) { host.textContent = ""; for (let i = 0; i < 6; i++) host.append(skeletonCard()); } continue; }
      if (host.querySelector(".empty")?.dataset.msg !== msg) { host.textContent = ""; host.append(emptyArt("stream", msg)); }
      continue;
    }
    const els = list.map(t => { let el = cardEls.get(t.mint); if (!el) { el = buildCard(t); cardEls.set(t.mint, el); } updateCard(el, t); return el; });
    host.querySelector(".empty")?.remove(); host.querySelectorAll(".skel").forEach(s => s.remove());
    els.forEach((el, i) => { if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null); });
    while (host.children.length > els.length) host.lastChild.remove();
  }
  for (const t of board.tokens.values()) t.fresh = false;
}
function tickAges() { document.querySelectorAll("#v-pulse .pcard").forEach(el => { const t = board.tokens.get(el.dataset.mint); if (t) text(el.querySelector(".age"), ago(Date.now() - (t.createdAt || t.firstSeen))); }); }

// A Pulse card reads like a ticker row: identity and age on top, market cap with volume, a sparkline and the
// one-minute move under it, then a grid of labelled numbers coloured by risk, and a buy/sell pressure line
// along the bottom edge. Numbers come from the curve reads (from the first second) and from Jupiter (once it
// has indexed the token); a cell with nothing yet shows a dim dash so the grid never jumps.
const CELLS = ["holders", "top10", "dev", "bs", "traders", "flow", "raised", "launches"];
const CELL_LABEL = { holders: "Holders", top10: "Top 10", dev: "Dev", bs: "B / S 5m", traders: "Traders", flow: "Net 1m", raised: "Raised", launches: "Dev coins" };
function buildCard(t) {
  const a = make("a", "pcard"); a.href = `#/token/${t.mint}`; a.dataset.mint = t.mint;
  const av = avatar(); icon(av.querySelector("img"), t.image, t.mint);
  // round avatar inside a ring that fills with bonding-curve progress, the percentage under it
  const pfp = make("div", "pc-pfp"), curve = make("div", "pc-curve"), bar = make("span", "cbar");
  bar.append(make("i")); curve.append(bar, make("b"));
  const NS = "http://www.w3.org/2000/svg", ring = document.createElementNS(NS, "svg");
  ring.setAttribute("viewBox", "0 0 80 80"); ring.setAttribute("class", "pc-ring"); ring.setAttribute("aria-hidden", "true");
  for (const c of ["trk", "val"]) { const k = document.createElementNS(NS, "circle"); k.setAttribute("class", c); k.setAttribute("cx", 40); k.setAttribute("cy", 40); k.setAttribute("r", 37); k.setAttribute("pathLength", 100); ring.append(k); }
  const disc = make("div", "pc-disc"); disc.append(av, ring);
  pfp.append(disc, curve);
  const main = make("div", "pc-main"), top = make("div", "pc-top"), row = make("div", "pc-row"), grid = make("div", "pc-grid"), links = make("div", "pc-links");
  top.append(make("b"), make("span", "nm"), make("span", "age"), links);
  const spark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  spark.setAttribute("viewBox", "0 0 64 18"); spark.setAttribute("class", "spark"); spark.setAttribute("aria-hidden", "true");
  for (const c of ["area", "line"]) { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("class", c); spark.append(p); }
  const mc = make("span", "mc"); mc.append(make("i", "", "MC"), make("b"));
  const vol = make("span", "vol"); vol.append(make("i", "", "V"), make("b"));
  row.append(mc, vol, spark, make("span", "chg"));
  for (const k of CELLS) { const c = make("span", "cell"); c.dataset.k = k; c.append(make("i", "", CELL_LABEL[k]), make("b", "", "—")); grid.append(c); }
  main.append(top, row, grid);
  const qb = make("button", "qb"); qb.type = "button";
  qb.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); quickBuy(t.mint, qb); });
  const sn = make("button", "snipe"); sn.append(svgIcon("target")); sn.type = "button";
  sn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); toggleSnipe(t.mint); });
  const acts = make("div", "pc-acts"); acts.append(qb, sn);
  const bs = make("div", "pc-bs"); bs.append(make("i", "b"), make("i", "s"));
  a.append(pfp, main, acts, bs);
  if (t.fresh && !REDUCE) a.classList.add("fresh");
  return a;
}
const solShort = n => `${n > 0 ? "+" : ""}${Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2)}`;
function setCell(el, k, v, title, tone) {
  const c = el.querySelector(`.cell[data-k="${k}"]`), b = c.lastChild;
  if (b.textContent !== v) b.textContent = v;
  c.className = `cell${v === "—" ? " na" : ""}${tone ? " " + tone : ""}`;
  c.title = title;
}
function drawSpark(svg, series) {
  const pts = (series || []).filter(p => p.mc);
  const [area, line] = svg.children;
  if (pts.length < 2) { line.setAttribute("d", "M0 9H64"); area.setAttribute("d", ""); svg.dataset.dir = "flat"; return; }
  const lo = Math.min(...pts.map(p => p.mc)), hi = Math.max(...pts.map(p => p.mc)), t0 = pts[0].at, span = Math.max(1, pts[pts.length - 1].at - t0);
  const xy = pts.map(p => [(p.at - t0) / span * 64, hi === lo ? 9 : 16 - (p.mc - lo) / (hi - lo) * 14]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  line.setAttribute("d", d); area.setAttribute("d", `${d}L64 18L0 18Z`);
  svg.dataset.dir = pts[pts.length - 1].mc >= pts[0].mc ? "up" : "down";
}
function updateCard(el, t) {
  const img = el.querySelector("img"), column = board.column(t), now = Date.now();
  if (t.image && img.dataset.src !== t.image) { img.dataset.src = t.image; icon(img, t.image, t.mint); }
  setRing(el.querySelector(".av"), t, column);
  text(el.querySelector(".pc-top b"), t.symbol || short(t.mint));
  text(el.querySelector(".nm"), t.name || "");
  const age = now - (t.createdAt || t.firstSeen), ageEl = el.querySelector(".age");
  text(ageEl, ago(age)); ageEl.classList.toggle("new", age < 60_000);
  const m = momentum(t, now), curveLive = (t.pump || t.stonk) && t.progress != null && column !== "migrated";
  // market cap, volume, sparkline, the move
  const mc = t.mcapUsd ?? (t.mcapSol && S.solUsd ? t.mcapSol * S.solUsd : null);
  text(el.querySelector(".mc b"), mc != null ? usd(mc) : "—");
  el.querySelector(".mc").title = t.athMc ? `Market cap · high ${usd(t.athMc)} while on this board` : "Market cap";
  const vol = t.vol5m ?? t.vol1h ?? t.volume24h, volK = t.vol5m != null ? "5m" : t.vol1h != null ? "1h" : "24h";
  text(el.querySelector(".vol b"), vol != null ? usd(vol) : "—");
  el.querySelector(".vol").title = vol != null ? `Volume ${volK}` : "Volume: waiting for Jupiter to index this token";
  drawSpark(el.querySelector(".spark"), t.series);
  const chg = m.change != null && m.span > 10_000 ? m.change : t.change5m, chgEl = el.querySelector(".chg");
  text(chgEl, chg != null ? pct(chg) : ""); chgEl.className = `chg${chg > 0 ? " up" : chg < 0 ? " down" : ""}`;
  chgEl.title = m.change != null && m.span > 10_000 ? "Market cap change, last minute" : "Price change, 5 minutes";
  const migrated = column === "migrated" || t.complete || t.graduatedAt || t.migratedAt, cEl = el.querySelector(".pc-curve");
  const cp = migrated ? 100 : curveLive ? Math.max(0, Math.min(100, t.progress)) : null;
  cEl.hidden = cp == null;
  const ringEl = el.querySelector(".pc-ring");
  if (ringEl) { ringEl.querySelector(".val").style.strokeDasharray = `${cp ?? 0} 100`; ringEl.dataset.state = cp == null ? "none" : migrated ? "done" : cp >= 80 ? "hot" : "live"; }
  if (cp != null) {
    cEl.className = `pc-curve${migrated ? " done" : cp >= 80 ? " hot" : ""}`;
    cEl.querySelector("i").style.width = `${cp}%`;
    text(cEl.querySelector("b"), migrated ? "MIGRATED" : `${cp < 10 ? cp.toFixed(1) : cp.toFixed(0)}%`);
    cEl.title = migrated ? "Graduated to an AMM pool" : `Bonding curve ${cp.toFixed(1)}%`;
  }
  // the grid
  setCell(el, "holders", t.holders != null ? count(t.holders) : "—", t.holderChange5m != null ? `Holders · ${t.holderChange5m > 0 ? "+" : ""}${t.holderChange5m.toFixed(1)}% in 5m` : "Holders", t.holderChange5m > 5 ? "good" : "");
  setCell(el, "top10", t.topHoldersPct != null ? `${t.topHoldersPct.toFixed(0)}%` : "—", "Share held by the top 10 holders", t.topHoldersPct > 50 ? "bad" : t.topHoldersPct > 30 ? "warn" : t.topHoldersPct != null ? "good" : "");
  const dev = t.devPct ?? t.devBuyPct;
  setCell(el, "dev", dev != null ? `${dev.toFixed(dev < 10 ? 1 : 0)}%` : "—", t.devPct != null ? "Share the dev wallet holds now" : t.devBuyPct != null ? `Dev bought ${dev.toFixed(1)}% of supply at launch${t.devBuySol ? ` for ${solFmt(t.devBuySol)} SOL` : ""}` : "Dev holdings", dev > 15 ? "bad" : dev > 5 ? "warn" : dev != null ? "good" : "");
  const b = t.buys5m, s = t.sells5m;
  setCell(el, "bs", b != null || s != null ? `${count(b || 0)}/${count(s || 0)}` : "—", "Buys / sells in the last 5 minutes", b > s ? "good" : s > b ? "bad" : "");
  setCell(el, "traders", t.traders5m != null ? count(t.traders5m) : "—", t.netBuyers5m != null ? `Unique traders, 5m · ${t.netBuyers5m} net buyers` : "Unique traders, 5m", "");
  if (curveLive || !t.organicScore) setCell(el, "flow", m.flowSol != null && m.span > 10_000 ? solShort(m.flowSol) : "—", "Net SOL into the bonding curve over the last minute", m.flowSol > .05 ? "good" : m.flowSol < -.05 ? "bad" : "");
  else setCell(el, "flow", t.organicScore.toFixed(0), `Jupiter organic score${t.organicLabel ? ` · ${t.organicLabel}` : ""}: how much of the activity looks like real traders`, t.organicScore >= 60 ? "good" : t.organicScore < 25 ? "bad" : "");
  el.querySelector('.cell[data-k="flow"] i').textContent = curveLive || !t.organicScore ? "Net 1m" : "Organic";
  if (curveLive && t.raisedSol != null) setCell(el, "raised", `${t.raisedSol >= 10 ? t.raisedSol.toFixed(1) : t.raisedSol.toFixed(2)}`, "SOL raised in the bonding curve (85 to graduate)", "");
  else setCell(el, "raised", t.liquidityUsd != null ? usd(t.liquidityUsd) : "—", "Liquidity", "");
  el.querySelector('.cell[data-k="raised"] i').textContent = curveLive ? "Raised" : "Liq";
  setCell(el, "launches", t.devMints != null ? count(t.devMints) : "—", "Tokens this dev wallet has created", t.devMints > 5 ? "bad" : t.devMints > 1 ? "warn" : t.devMints != null ? "good" : "");
  // buy/sell pressure along the bottom edge
  const bsEl = el.querySelector(".pc-bs"), tot = (b || 0) + (s || 0);
  bsEl.hidden = !tot;
  if (tot) { bsEl.firstChild.style.flex = String(b || 0); bsEl.lastChild.style.flex = String(s || 0); }
  const links = el.querySelector(".pc-links"), sig = [t.twitter, t.telegram, t.website, t.pump, t.stonk].join("|");
  if (links.dataset.sig !== sig) {
    links.dataset.sig = sig; links.textContent = "";
    tokenLinks(t.mint, t).filter(l => l.social || l.k === "pump" || l.k === "stonk" || l.k === "dex").forEach(l => links.append(linkBtn(l)));
    links.append(copyBtn(t.mint));
  }
  qbLabel(el.querySelector(".qb"), $("qbamt").value || settings.quickBuy);
  const sn = el.querySelector(".snipe"), armed = snipes().some(x => x.mint === t.mint && x.status === "armed");
  sn.hidden = column === "migrated"; sn.setAttribute("aria-pressed", armed);
  sn.title = armed ? "Sniping: buys from your instant wallet the moment this migrates. Click to cancel." : "Snipe the migration: buy from your instant wallet the moment this token migrates";
  sn.setAttribute("aria-label", armed ? "Cancel migration snipe" : "Snipe the migration");
}
document.querySelectorAll(".pcol").forEach(col => {
  const key = col.dataset.col, f = filters[key] = filters[key] || {};
  col.addEventListener("mouseenter", () => { paused.add(key); col.querySelector(".paused").hidden = false; });
  col.addEventListener("mouseleave", () => { paused.delete(key); col.querySelector(".paused").hidden = true; pulseDirty = true; });
  col.querySelectorAll("[data-f]").forEach(inp => {
    const k = inp.dataset.f;
    if (inp.type === "checkbox") inp.checked = !!f[k]; else inp.value = f[k] || "";
    inp.addEventListener("input", () => { f[k] = inp.type === "checkbox" ? inp.checked : k === "minMcap" ? Number(inp.value) || 0 : inp.value.trim(); store.set("ardea-pulse-filters", filters); pulseDirty = true; paused.delete(key); renderPulse(); paused.add(key); });
  });
});
$("mobcols").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  $("mobcols").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
  document.querySelectorAll(".pcol").forEach(c => c.classList.toggle("on", c.dataset.col === b.dataset.col));
});

/* ---------- Trending ---------- */
let trCat = "toptrending", trInt = "1h", trTimer = 0;
async function loadTrending() {
  clearTimeout(trTimer);
  if (S.route !== "trending" || !whenAwake(loadTrending)) return;
  const table = $("tr-table");
  if (!table.rows.length) { table.textContent = ""; emptyRow(table, "Loading…"); }
  try {
    const list = await jup.list(trCat, trInt, 50);
    const rows = (Array.isArray(list) ? list : []).filter(t => t.id !== SOL_MINT);
    rows.forEach(t => tokenInfo.set(t.id, t));
    const statKey = { "5m": "stats5m", "1h": "stats1h", "6h": "stats6h", "24h": "stats24h" }[trInt];
    table.textContent = "";
    const head = make("tr");
    ["#", "Token", "Price", trInt, `Vol ${trInt}`, "MC", "Liq", "Holders", "Organic", "Age", ""].forEach((h, i) => head.append(make("th", i > 1 && i < 10 ? "num" : "", h)));
    table.append(head);
    rows.forEach((t, i) => {
      const st = t[statKey] || {}, tr = make("tr", "pick"), tok = make("td"), wrap = make("div", "cell-tok");
      wrap.append(icon(make("img", "tok-icon"), t.icon, t.id), make("b", "", t.symbol || short(t.id)), make("span", "muted", (t.name || "").slice(0, 18)));
      tok.append(wrap);
      const chg = make("td", "num", pct(st.priceChange)); cls(chg, st.priceChange);
      const age = Date.parse(t.firstPool?.createdAt || "");
      const qbtd = make("td", "num"), qb = qbLabel(make("button", "qb"), $("qbamt").value || settings.quickBuy); qb.type = "button";
      qb.addEventListener("click", e => { e.stopPropagation(); quickBuy(t.id, qb); });
      qbtd.append(qb);
      tr.append(make("td", "muted", String(i + 1)), tok, make("td", "num", price(t.usdPrice)), chg, make("td", "num", usd((st.buyVolume || 0) + (st.sellVolume || 0))), make("td", "num", usd(t.mcap ?? t.fdv)), make("td", "num", usd(t.liquidity)), make("td", "num", count(t.holderCount)), make("td", "num", t.organicScore != null ? t.organicScore.toFixed(0) : "—"), make("td", "num", age ? ago(Date.now() - age) : "—"), qbtd);
      tr.addEventListener("click", () => { location.hash = `#/token/${t.id}`; });
      table.append(tr);
    });
    if (!rows.length) emptyRow(table, "Jupiter returned no tokens for this list.");
    text($("tr-note"), `Jupiter · updated ${new Date().toLocaleTimeString()}`);
  } catch (e) { text($("tr-note"), errMsg(e)); }
  trTimer = setTimeout(loadTrending, 30000);
}
for (const [id, set] of [["tr-cat", v => { trCat = v; }], ["tr-int", v => { trInt = v; }]]) {
  $(id).addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; $(id).querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); set(b.dataset.v); $("tr-table").textContent = ""; loadTrending(); });
}

/* ---------- token page ---------- */
const T = { side: "buy", quoteTimer: 0, quoteSeq: 0, tokenBal: null, trades: [], sub: null, curveTimer: 0, statsTimer: 0 };
async function openToken(mint) {
  if (S.tokenMint === mint && S.route === "token" && T.sub) return;
  leaveToken();
  S.tokenMint = mint;
  T.trades = []; T.tokenBal = null; T.decimals = null; T.info = null; T.curve = null; T.priceUsd = null; T.holders = null;
  $("amt").value = ""; $("quote").hidden = true; setTradeStatus("");
  const b = board.tokens.get(mint) || {};
  $("t-icon").dataset.real = "0"; $("t-links").textContent = ""; $("t-desc").hidden = true; $("t-age").hidden = true; $("t-curve").hidden = true;
  $("t-ca").textContent = ""; $("t-ca").append(copyBtn(mint, true));
  renderTokenHead();
  ["s-price", "s-mcap", "s-liq", "s-vol", "s-c5", "s-c1", "s-c24"].forEach(id => cls(text($(id), "—"), 0));
  $("chart").textContent = ""; $("chart").append(make("div", "empty", "Loading chart…"));
  $("curvebar").hidden = true;
  renderStar(); renderTrades(); renderMine(); renderTradePanel(); selectTokenTab("tt-trades"); renderOrdersPanel();
  $("audit").textContent = ""; $("audit").append(make("h3", "", "Token info"), make("span", "muted", "Loading…"));
  document.title = `${b.symbol || short(mint)} · Ardea`;

  if (!hasMeta(mint)) { metaTried.delete(mint); needMeta([mint]); }
  decimalsOf(mint).then(d => { T.decimals = d; renderTradePanel(); }).catch(e => setTradeStatus(errMsg(e), "err"));
  jup.search(mint).then(l => { const t = (l || []).find(x => x.id === mint); if (t && S.tokenMint === mint) { tokenInfo.set(mint, t); T.info = t; renderTokenHead(); renderAudit(); } else renderAudit(); }).catch(() => renderAudit());
  loadPairs(mint);
  if (isPumpMint(mint, b.launchpad) || b.pump) curveTick(mint);
  refreshTokenBal();
  openTradeStream(mint);
  T.statsTimer = setInterval(() => awake() && loadPairs(mint, true), 30000);
}
function openTradeStream(mint) {
  T.sub?.close();
  T.sub = tokenTrades({ rpcHttp: rpcUrl, mint, solUsd: () => S.solUsd, onStatus: s => { T.stream = s; if (!T.trades.length) renderTrades(); }, onTrade: tr => {
    if (S.tokenMint !== mint || T.trades.some(x => x.sig === tr.sig && x.side === tr.side && x.tokens === tr.tokens)) return;
    T.trades.unshift({ ...tr, fresh: true }); T.trades.length = Math.min(T.trades.length, 120);
    if (tr.priceSol && S.solUsd) { T.priceUsd = tr.priceSol * S.solUsd; text($("s-price"), price(T.priceUsd)); }
    renderTrades();
  } });
}
leaveToken = () => { T.sub?.close(); T.sub = null; clearTimeout(T.curveTimer); clearInterval(T.statsTimer); clearTimeout(T.quoteTimer); };

function renderTokenHead() {
  const mint = S.tokenMint, t = T.info, b = infoOf(mint);
  const sym = t?.symbol || b.symbol || short(mint);
  text($("t-sym"), sym); text($("t-name"), t?.name || b.name || "");
  icon($("t-icon"), t?.icon || b.image, mint);
  setRing($("t-av"), { ...b, pump: b.pump || isPumpMint(mint, t?.launchpad), progress: T.curve ? T.curve.progress : b.progress, complete: T.curve?.complete || b.complete || !!t?.graduatedPool }, b.migratedAt || t?.graduatedPool ? "migrated" : "");
  document.title = `${sym} · Ardea`;
  const soc = { twitter: t?.twitter || b.twitter, telegram: t?.telegram || b.telegram, website: t?.website || b.website, launchpad: t?.launchpad || b.launchpad, pump: b.pump, stonk: b.stonk };
  const links = $("t-links"), sig = JSON.stringify(soc);
  if (links.dataset.sig !== sig || !links.childElementCount) { links.dataset.sig = sig; links.textContent = ""; tokenLinks(mint, soc).forEach(l => links.append(linkBtn(l, true))); }
  const desc = b.description;
  $("t-desc").hidden = !desc; if (desc) text($("t-desc"), desc);
  const created = Date.parse(t?.firstPool?.createdAt || "") || b.createdAt;
  $("t-age").hidden = !created; if (created) text($("t-age"), `${ago(Date.now() - created)} old`);
  if (t) {
    if (t.usdPrice) T.priceUsd = t.usdPrice;
    text($("s-price"), price(t.usdPrice)); text($("s-mcap"), usd(t.mcap ?? t.fdv)); text($("s-liq"), usd(t.liquidity));
    cls(text($("s-c5"), pct(t.stats5m?.priceChange)), t.stats5m?.priceChange); cls(text($("s-c1"), pct(t.stats1h?.priceChange)), t.stats1h?.priceChange); cls(text($("s-c24"), pct(t.stats24h?.priceChange)), t.stats24h?.priceChange);
    if (t.stats24h) text($("s-vol"), usd((t.stats24h.buyVolume || 0) + (t.stats24h.sellVolume || 0)));
  }
}
async function loadPairs(mint, statsOnly) {
  try {
    const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`);
    const pairs = res.ok ? await res.json() : [];
    if (S.tokenMint !== mint) return;
    const best = (Array.isArray(pairs) ? pairs : []).filter(p => p.chainId === "solana" && isAddress(p.pairAddress || "")).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (best) {
      if (Number(best.priceUsd) > 0) T.priceUsd = Number(best.priceUsd);
      text($("s-price"), price(Number(best.priceUsd))); text($("s-mcap"), usd(best.marketCap ?? best.fdv)); text($("s-liq"), usd(best.liquidity?.usd)); text($("s-vol"), usd(best.volume?.h24));
      cls(text($("s-c5"), pct(best.priceChange?.m5)), best.priceChange?.m5); cls(text($("s-c1"), pct(best.priceChange?.h1)), best.priceChange?.h1); cls(text($("s-c24"), pct(best.priceChange?.h24)), best.priceChange?.h24);
    }
    if (statsOnly) return;
    const box = $("chart");
    if (!best) { box.textContent = ""; box.append(emptyArt("chart", "No pool on DexScreener yet. Live trades below come straight from the chain.")); return; }
    const f = document.createElement("iframe");
    f.title = "Price chart"; f.loading = "lazy";
    f.src = `https://dexscreener.com/solana/${best.pairAddress}?embed=1&theme=dark&trades=0&info=0`;
    box.textContent = ""; box.append(f);
  } catch (_) { if (!statsOnly && S.tokenMint === mint) { $("chart").textContent = ""; $("chart").append(make("div", "empty", "Chart unavailable right now.")); } }
}
async function curveTick(mint) {
  if (S.tokenMint !== mint || !whenAwake(() => curveTick(mint))) return;
  try {
    const c = (await readCurves({ connection, web3, mints: [mint] })).get(mint);
    if (c && S.tokenMint === mint) {
      T.curve = c;
      $("curvebar").hidden = false;
      $("curvebar").querySelector("i").style.width = `${c.progress}%`;
      $("curvebar").querySelector(".pbar").classList.toggle("hot", c.progress >= 80);
      text($("curvepct"), c.complete ? "Complete · migrating" : `${c.progress.toFixed(1)}% · ${solFmt(Number(c.realSolReserves) / 1e9)} SOL in curve`);
      $("t-curve").hidden = false; text($("t-curve"), c.complete ? "Curve complete" : `Curve ${c.progress.toFixed(0)}%`);
      setRing($("t-av"), { pump: true, progress: c.progress, complete: c.complete }, c.complete ? "migrated" : "");
      if (S.solUsd) { T.priceUsd = c.priceSol * S.solUsd; text($("s-mcap"), usd(c.mcapSol * S.solUsd)); text($("s-price"), price(T.priceUsd)); }
      renderAudit();
      if (c.complete) return;
    }
  } catch (_) {}
  T.curveTimer = setTimeout(() => curveTick(mint), 5000);
}

function renderTrades() {
  const host = $("tp-trades"); host.textContent = "";
  if (!T.trades.length) { host.append(make("div", "tdempty", T.stream === "live" ? "Listening for trades on-chain…" : `Connecting to the chain for live trades${T.stream && T.stream !== "connecting" ? ` (${T.stream})` : ""}…`)); return; }
  const table = make("table"), head = make("tr");
  ["Age", "Type", "SOL", "Tokens", "Price", "Maker", ""].forEach((h, i) => head.append(make("th", i > 1 && i < 5 ? "num" : "", h)));
  table.append(head);
  const mine = new Set([S.wallet?.pk, S.instant?.pk].filter(Boolean));
  for (const t of T.trades) {
    const tr = make("tr", `trade-${t.side}${mine.has(t.user) ? " mine" : ""}${t.fresh ? " newrow" : ""}`); t.fresh = false;
    const maker = make("td"); const ml = link(solscan("account", t.user), short(t.user)); maker.append(ml);
    const tx = make("td", "num"); tx.append(extLink(solscan("tx", t.sig), "", "txl"));
    tr.append(make("td", "muted", ago(Date.now() - t.time * 1000)), make("td", "side", t.side === "buy" ? "Buy" : "Sell"), make("td", "num", solFmt(t.sol)), make("td", "num", num(t.tokens)), make("td", "num", S.solUsd && t.priceSol ? price(t.priceSol * S.solUsd) : "—"), maker, tx);
    table.append(tr);
  }
  host.append(table);
}
async function renderHolders() {
  const host = $("tp-holders"), mint = S.tokenMint;
  host.textContent = ""; host.append(make("div", "tdempty", "Reading top holders from the chain…"));
  try {
    const creator = T.info?.dev || board.tokens.get(mint)?.creator;
    const h = await holders({ connection, web3, mint, creator });
    if (S.tokenMint !== mint) return;
    T.holders = h; renderAudit();
    host.textContent = "";
    const table = make("table"), head = make("tr");
    ["#", "Holder", "%", "Amount", ""].forEach((x, i) => head.append(make("th", i > 1 && i < 4 ? "num" : "", x)));
    table.append(head);
    h.rows.forEach((r, i) => {
      const tr = make("tr"), who = make("td");
      who.append(link(solscan("account", r.owner || r.account), short(r.owner || r.account)));
      if (r.label) who.append(" ", make("span", r.label === "Dev" ? "warnc" : "muted", r.label));
      const tk = make("td", "num"); const tb = make("button", "btn small", "Track"); tb.type = "button";
      tb.addEventListener("click", () => { addTracked(r.owner || r.account, r.label || `Holder #${i + 1}`); toast("Added to the tracker.", "ok"); });
      if (r.owner && r.label !== "Bonding curve") tk.append(tb);
      tr.append(make("td", "muted", String(i + 1)), who, make("td", "num", `${r.pct.toFixed(2)}%`), make("td", "num", num(r.amount / 10 ** h.decimals)), tk);
      table.append(tr);
    });
    host.append(table);
  } catch (e) { host.textContent = ""; host.append(make("div", "tdempty", `Couldn't read holders: ${errMsg(e)}`)); }
}
function renderMine() {
  const host = $("tp-mine"); host.textContent = "";
  const list = [S.wallet?.pk, S.instant?.pk].filter(Boolean).flatMap(pk => tradesOf(pk)).filter(t => t.mint === S.tokenMint).sort((a, b) => b.time - a.time);
  if (!list.length) { host.append(make("div", "tdempty", S.wallet ? "No trades in this token from this terminal yet." : "Connect a wallet to see your trades.")); return; }
  host.append(tradeTable(list));
}
function tradeTable(list) {
  const table = make("table"), head = make("tr");
  ["When", "Type", "Token", "SOL", "Tokens", "From", ""].forEach((h, i) => head.append(make("th", i > 2 && i < 5 ? "num" : "", h)));
  table.append(head);
  for (const t of list) {
    const tr = make("tr", `trade-${t.side}`), tx = make("td", "num"); tx.append(extLink(solscan("tx", t.sig), "", "txl"));
    const tok = make("td"); const a = make("a", "", t.symbol || short(t.mint)); a.href = `#/token/${t.mint}`; tok.append(a);
    tr.append(make("td", "muted", new Date(t.time).toLocaleString()), make("td", "side", t.side === "buy" ? "Buy" : "Sell"), tok, make("td", "num", solFmt(t.sol)), make("td", "num", num(t.tokens)), make("td", "muted", t.from || "main"), tx);
    table.append(tr);
  }
  return table;
}
function renderAudit() {
  const a = $("audit"), t = T.info, b = infoOf(S.tokenMint), h = T.holders, c = T.curve;
  a.textContent = ""; a.append(make("h3", "", "Token info"));
  // authorities as two badges
  const mintOff = h ? !h.mintAuthority : t?.audit?.mintAuthorityDisabled, freezeOff = h ? !h.freezeAuthority : t?.audit?.freezeAuthorityDisabled;
  const badges = make("div", "badges");
  for (const [k, off] of [["Mint", mintOff], ["Freeze", freezeOff]]) {
    const s2 = make("span", `badge ${off == null ? "" : off ? "ok" : "bad"}`); s2.append(svgIcon(off ? "check" : "dev"), make("span", "", `${k} ${off == null ? "unknown" : off ? "revoked" : "active"}`));
    s2.title = off == null ? "Not read yet" : off ? `${k} authority is revoked: nobody can ${k === "Mint" ? "mint more tokens" : "freeze your tokens"}.` : `${k} authority is active: the owner can ${k === "Mint" ? "mint more tokens" : "freeze holders' tokens"}.`;
    badges.append(s2);
  }
  a.append(badges);
  // meters: share held by the top 10 and the dev, and the bonding curve
  const meter = (label, pctv, note, warnAt) => {
    const m = make("div", "meter"), row = make("div", "mrow"), bar = make("div", "mbar"), fill = make("i");
    row.append(make("span", "k", label), make("b", pctv != null && warnAt != null && pctv > warnAt ? "warnc" : "", pctv != null ? `${pctv.toFixed(pctv < 10 ? 2 : 1)}%` : note));
    fill.style.width = `${Math.max(0, Math.min(100, pctv ?? 0))}%`; if (warnAt != null && pctv > warnAt) fill.className = "warn";
    bar.append(fill); m.append(row, bar); a.append(m);
  };
  const top10 = h ? h.top10 : t?.audit?.topHoldersPercentage;
  meter("Top 10 holders", top10, "open Holders", 30);
  const dev = h && h.devPct ? h.devPct : t?.audit?.devBalancePercentage;
  if (dev != null) meter("Dev holds", dev, "", 5);
  if (c) meter("Bonding curve", c.complete ? 100 : c.progress, "", null);
  const row = (k, v, cl) => { const r = make("div", "row"); r.append(make("span", "k", k), make("span", cl || "", v)); a.append(r); };
  if (t?.holderCount) row("Holders", count(t.holderCount));
  if (t?.organicScore != null) row("Organic score", `${t.organicScore.toFixed(0)} ${t.organicScoreLabel || ""}`);
  const created = Date.parse(t?.firstPool?.createdAt || "") || b.createdAt;
  if (created) row("Age", ago(Date.now() - created));
  const creator = t?.dev || b.creator;
  if (creator) {
    const r = make("div", "row"), v = make("span"), tb = make("button", "btn small", "Trace dev"); tb.type = "button";
    v.append(link(solscan("account", creator), short(creator)), " ", tb);
    tb.addEventListener("click", async () => {
      tb.disabled = true; text(tb, "Tracing…");
      try { const r2 = await trace(creator, { url: rpcUrl, recent: 60, depthWallets: 3 }); text(tb, `${r2.score}/100 ${r2.grade}`); tb.title = r2.findings.map(f => `${f.k}: ${f.v}`).join("\n"); }
      catch (e) { text(tb, "Trace failed"); tb.title = errMsg(e); }
    });
    r.append(make("span", "k", "Dev wallet"), v); a.append(r);
  }
}
function selectTokenTab(id) {
  document.querySelectorAll("#v-token .tok-main [role=tab]").forEach(t => { const on = t.id === id; t.setAttribute("aria-selected", on); $(t.getAttribute("aria-controls")).hidden = !on; });
  if (id === "tt-holders") renderHolders();
  if (id === "tt-mine") renderMine();
  if (id === "tt-posts") loadPosts();
}
document.querySelectorAll("#v-token .tok-main [role=tab]").forEach(t => t.addEventListener("click", () => selectTokenTab(t.id)));
document.querySelectorAll("#orders [role=tab]").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll("#orders [role=tab]").forEach(o => { const on = o === t; o.setAttribute("aria-selected", on); $(o.getAttribute("aria-controls")).hidden = !on; });
  if (t.id === "ot-auto") renderAutoList(); else loadTokenOrders();
}));

/* ---------- trade panel ---------- */
const amt = $("amt");
const stealthOn = () => !!settings.stealth && T.side === "buy" && settings.from !== "instant";
function setTradeStatus(msg, kind = "", sig) {
  const st = $("status"); st.textContent = msg; st.className = "status " + kind;
  if (sig) { st.append(" "); st.append(extLink(solscan("tx", sig), "Solscan")); }
}
async function refreshTokenBal() {
  if (S.route !== "token" || !S.tokenMint) return;
  const pk = settings.from === "instant" ? S.instant?.pk : S.wallet?.pk;
  if (!pk) { T.tokenBal = null; return renderTradePanel(); }
  try {
    const r = await connection.getParsedTokenAccountsByOwner(new web3.PublicKey(pk), { mint: new web3.PublicKey(S.tokenMint) });
    T.tokenBal = r.value.reduce((n, a) => n + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  } catch (_) { T.tokenBal = 0n; }
  renderTradePanel();
}
function renderTradePanel() {
  if (!S.tokenMint) return;
  const buy = T.side === "buy", sym = symbolOf(S.tokenMint), inst = settings.from === "instant";
  $("side-buy").setAttribute("aria-pressed", buy); $("side-sell").setAttribute("aria-pressed", !buy);
  $("fromseg").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.w === settings.from));
  text($("amt-label"), buy ? "Amount (SOL)" : `Amount (${sym})`);
  text($("amt-unit"), buy ? "SOL" : sym);
  const solBal = inst ? S.instantSol : S.sol;
  text($("bal"), buy ? `Bal ${solBal != null ? fromRaw(solBal, 9, 3) : "—"} SOL` : `Bal ${T.tokenBal != null && T.decimals != null ? num(Number(T.tokenBal) / 10 ** T.decimals) : "—"}`);
  const q = $("quick"); q.textContent = "";
  (buy ? settings.buyAmounts : settings.sellPcts).forEach(v => {
    const b = make("button", "", buy ? String(v) : `${v}%`); b.type = "button";
    b.addEventListener("click", () => {
      if (buy) amt.value = String(v);
      else if (T.tokenBal != null && T.decimals != null) amt.value = fromRaw(v >= 100 ? T.tokenBal : T.tokenBal * BigInt(Math.round(v * 100)) / 10000n, T.decimals, T.decimals);
      scheduleQuote();
    });
    q.append(b);
  });
  const ps = $("presets"); ps.textContent = "";
  settings.presets.forEach((p, i) => {
    const b = make("button"); b.type = "button"; b.setAttribute("aria-pressed", settings.preset === i);
    const pb = make("b", "", `P${i + 1}`); if (p.mev) { const sh = svgIcon("shield", "mev"); pb.append(sh); b.title = "MEV-protected: sent only through Jito"; } b.append(pb, `${p.slippageBps / 100}% · ${p.priority === "veryHigh" ? "turbo" : p.priority}${p.tipSol ? " · jito" : ""}`);
    b.title = `Slippage ${p.slippageBps / 100}%, priority ${p.priority} up to ${p.maxSol} SOL${p.tipSol ? `, Jito tip ${p.tipSol} SOL${p.mev ? ", MEV-protected (Jito only)" : ""}` : ""}`;
    b.addEventListener("click", () => { settings.preset = i; saveSettings(); renderTradePanel(); scheduleQuote(); });
    ps.append(b);
  });
  const gs = $("stealth-switch");
  gs.disabled = inst || !buy;
  gs.setAttribute("aria-checked", stealthOn());
  $("stealth-box").classList.toggle("on", stealthOn());
  text($("stealth-sub"), inst ? "Instant trades already use a separate wallet" : !buy ? "Stealth positions sell from Portfolio" : "Buy from a fresh wallet funded through Monero");
  updateGo();
}
function amountRaw() {
  if (T.side === "sell" && T.decimals == null) return null;
  return toRaw(amt.value, T.side === "buy" ? 9 : T.decimals);
}
function problem() {
  if (T.decimals == null) return "Loading token…";
  if (stealthOn() && armReady()) return null; // an armed wallet fires its own balance; no amount needed
  const raw = amountRaw();
  if (!raw) return "Enter an amount";
  if (stealthOn() && raw > toRaw(String(STEALTH_MAX_SOL), 9)) return `Private mode limit is ${STEALTH_MAX_SOL} SOL · switch it off`;
  if (stealthOn() && raw <= STEALTH_GAS_RESERVE * 2n) return "Private buys start at 0.02 SOL";
  const inst = settings.from === "instant";
  if (inst && !S.instant) return null; // unlocking happens on click
  if (!inst && !S.wallet) return null;
  const sol = inst ? S.instantSol : S.sol;
  if (T.side === "buy" && sol != null && raw + 5_000_000n > sol) return inst ? "Deposit SOL to instant wallet" : "Not enough SOL";
  if (T.side === "sell" && T.tokenBal != null && raw > T.tokenBal) return `Not enough ${symbolOf(S.tokenMint)}`;
  return null;
}
function updateGo() {
  if (S.busy) return;
  const go = $("go"), p = problem(), inst = settings.from === "instant", sym = symbolOf(S.tokenMint);
  const needConnect = !S.wallet;
  go.disabled = !!p && !needConnect;
  const armed = stealthOn() && armReady();
  const goLabel = needConnect ? "Connect wallet" : p || (armed ? `Fire armed wallet · ${fromRaw((armBalances[armed.address] ?? 0n) - STEALTH_GAS_RESERVE, 9, 3)} SOL → ${sym}` : `${stealthOn() ? "Private buy" : T.side === "buy" ? "Buy" : "Sell"} ${sym}`);
  if (inst && !needConnect && !p) iconLabel(go, "bolt", goLabel); else text(go, goLabel);
  go.className = `btn go ${needConnect || !p ? (T.side === "buy" ? "buy" : "primary") : ""}`;
  const pr = preset();
  text($("fine"), armed ? `Armed wallet #${armed.index} fires its whole balance through Jupiter, signed in this tab. It was funded through Monero earlier, so the buy is instant and its timing and amount don't line up with your deposit. No fee now: it was paid at arming.`
    : stealthOn()
    ? `Private mode: your wallet signs one transaction, the amount to a one-time Monero route address plus the ${feeBps() / 100}%${S.fee.tier ? ` (holder tier ${S.fee.tier})` : ""} fee to the treasury. The SOL crosses Monero through two unrelated exchanges (10–40 min, their fees included in the quote) and lands in a fresh stealth wallet, which buys. Houdini sees both ends, and a close observer can still try to match amounts and timing.`
    : `${feeBps() / 100}% fee in SOL${S.fee.tier ? ` (holder tier ${S.fee.tier})` : ""} · P${settings.preset + 1}: ${pr.slippageBps / 100}% slippage, ${pr.priority} priority up to ${pr.maxSol} SOL${pr.tipSol ? ` · Jito tip ${pr.tipSol} SOL${pr.mev ? " (MEV-protected)" : ""}` : ""} · ${inst ? "signed instantly by your instant wallet" : "you approve every trade in your wallet"}`);
}
function scheduleQuote() {
  updateGo(); clearTimeout(T.quoteTimer);
  if (!amountRaw()) { $("quote").hidden = true; return; }
  T.quoteTimer = setTimeout(previewQuote, 600);
}
async function previewQuote() {
  const seq = ++T.quoteSeq, raw = amountRaw(), mint = S.tokenMint;
  if (!raw) return;
  const buy = T.side === "buy", fee = buy ? raw * BigInt(feeBps()) / 10000n : 0n;
  const spend = buy ? raw - fee - (stealthOn() ? STEALTH_GAS_RESERVE : 0n) : raw;
  if (spend <= 0n) return;
  try {
    const qt = await jup.quote({ inputMint: buy ? SOL_MINT : mint, outputMint: buy ? mint : SOL_MINT, amount: spend, slippageBps: preset().slippageBps });
    if (seq !== T.quoteSeq || mint !== S.tokenMint) return;
    renderQuote(qt, buy ? fee : BigInt(qt.otherAmountThreshold) * BigInt(feeBps()) / 10000n);
  } catch (e) { if (seq === T.quoteSeq) { const box = $("quote"); box.hidden = false; box.textContent = ""; box.append(make("div", "row", errMsg(e))); } }
}
function renderQuote(qt, fee) {
  const buy = T.side === "buy", outDec = buy ? T.decimals : 9, outSym = buy ? symbolOf(S.tokenMint) : "SOL";
  const route = [...new Set((qt.routePlan || []).map(r => r.swapInfo?.label).filter(Boolean))].slice(0, 3).join(" → ");
  const rows = [["You get ≈", `${fromRaw(qt.outAmount, outDec, 4)} ${outSym}`], ["Minimum", `${fromRaw(qt.otherAmountThreshold, outDec, 4)} ${outSym}`], ["Price impact", `${(Number(qt.priceImpactPct || 0) * 100).toFixed(2)}%`], ["Route", route || "—"], [`Fee ${feeBps() / 100}%${S.fee.tier ? ` · holder tier ${S.fee.tier}` : ""}`, `${fromRaw(fee, 9, 6)} SOL`]];
  const armedQ = stealthOn() && armReady();
  if (armedQ) rows.splice(0, rows.length, ["Fires", `armed wallet #${armedQ.index}, its whole balance`], ["Spend", `${fromRaw((armBalances[armedQ.address] ?? 0n) - STEALTH_GAS_RESERVE, 9, 4)} SOL`], ["Funded", "through Monero, earlier"], ["Fee", "none now; paid at arming"]);
  else if (stealthOn()) rows.push(["Private route", "SOL → XMR → SOL via Houdini → fresh wallet"], ["Route time", "10–40 min; or arm a wallet ahead to buy instantly"], ["Route fees", "two exchange hops; the exact SOL out is shown before you sign"]);
  const box = $("quote"); box.textContent = "";
  for (const [k, v] of rows) { const r = make("div", "row"); r.append(make("span", "k", k), make("span", "", v)); box.append(r); }
  box.hidden = false;
}
$("side-buy").addEventListener("click", () => { T.side = "buy"; amt.value = ""; $("quote").hidden = true; renderTradePanel(); });
$("side-sell").addEventListener("click", () => { T.side = "sell"; amt.value = ""; $("quote").hidden = true; renderTradePanel(); });
$("fromseg").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  settings.from = b.dataset.w; saveSettings();
  if (settings.from === "instant") { try { await instantWallet(); } catch (err) { settings.from = "main"; saveSettings(); setTradeStatus(errMsg(err), "err"); } }
  renderWalletBtn(); refreshTokenBal(); renderTradePanel();
});
$("bal").addEventListener("click", () => {
  if (T.side === "sell" && T.tokenBal != null && T.decimals != null) amt.value = fromRaw(T.tokenBal, T.decimals, T.decimals);
  else if (T.side === "buy") { const s = settings.from === "instant" ? S.instantSol : S.sol; if (s != null) amt.value = fromRaw(s > 10_000_000n ? s - 10_000_000n : 0n, 9, 4); }
  scheduleQuote();
});
amt.addEventListener("input", () => { amt.value = amt.value.replace(/,/g, ".").replace(/[^\d.]/g, ""); scheduleQuote(); });
$("stealth-switch").addEventListener("click", () => { settings.stealth = !settings.stealth; saveSettings(); renderTradePanel(); scheduleQuote(); });
$("go").addEventListener("click", async () => {
  if (!S.wallet) { await ensureConnected(); return; }
  if (S.busy || problem()) return;
  if (!TREASURY) return setTradeStatus(TRADING_CLOSED, "err");
  if (stealthOn()) return armReady() ? fireFromPanel() : stealthBuy();
  const go = $("go"), raw = amountRaw(), mint = S.tokenMint, sym = symbolOf(mint), side = T.side;
  S.busy = true; go.disabled = true;
  try {
    const r = await executeTrade({ side, mint, amountRaw: raw, onStatus: m => { text(go, m); setTradeStatus(m); } });
    setTradeStatus(side === "buy" ? `Bought ≈${num(r.tokens)} ${sym}.` : `Sold ${num(r.tokens)} ${sym} for ≈${solFmt(r.sol)} SOL.`, "ok", r.sig);
    amt.value = ""; $("quote").hidden = true;
    setTimeout(() => { refreshTokenBal(); renderMine(); loadTokenOrders(); }, 1500);
  } catch (e) { setTradeStatus(errMsg(e), "err"); }
  finally { S.busy = false; updateGo(); }
});

/* ---------- limit orders (Jupiter Trigger, on-chain) ---------- */
const LO = { side: "buy" };
function renderOrdersPanel() {
  if (!S.tokenMint) return;
  const buy = LO.side === "buy", sym = symbolOf(S.tokenMint);
  $("lo-side").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === LO.side));
  text($("lo-amt-label"), buy ? "Spend (SOL)" : `Sell (${sym})`);
  text($("lo-unit"), buy ? "SOL" : sym);
  const steps = $("lo-steps"); steps.textContent = "";
  for (const d of buy ? [-10, -25, -50, -75] : [25, 50, 100, 200]) {
    const b = make("button", "", `${d > 0 ? "+" : ""}${d}%`); b.type = "button";
    b.addEventListener("click", () => { if (!T.priceUsd) return setTradeStatus("No live price yet for this token.", "err"); $("lo-price").value = String(+(T.priceUsd * (1 + d / 100)).toPrecision(4)); limitHint(); });
    steps.append(b);
  }
  limitHint(); loadTokenOrders(); renderAutoList();
}
function limitHint() {
  const p = Number($("lo-price").value), mcNow = T.curve && S.solUsd ? T.curve.mcapSol * S.solUsd : T.info?.mcap;
  text($("lo-mc"), p > 0 && T.priceUsd && mcNow ? `≈ MC ${usd(mcNow * p / T.priceUsd)} · now ${price(T.priceUsd)}` : T.priceUsd ? `now ${price(T.priceUsd)}` : "");
}
$("lo-side").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; LO.side = b.dataset.v; $("lo-price").value = ""; $("lo-amt").value = ""; renderOrdersPanel(); });
$("lo-price").addEventListener("input", limitHint);
$("lo-go").addEventListener("click", async () => {
  const btn = $("lo-go"), mint = S.tokenMint;
  if (S.busy) return;
  S.busy = true; btn.disabled = true;
  try {
    if (settings.from === "main" && !S.wallet && !(await ensureConnected())) return;
    const dec = T.decimals ?? await decimalsOf(mint), buy = LO.side === "buy";
    const amountRaw = toRaw($("lo-amt").value, buy ? 9 : dec);
    if (!amountRaw) throw new SwapError(buy ? "Enter how much SOL to spend." : "Enter how many tokens to sell.");
    if (!S.solUsd) throw new SwapError("Waiting for the SOL price. Try again in a moment.");
    const a = limitAmounts({ side: LO.side, mint, amountRaw, priceUsd: Number($("lo-price").value), solUsd: S.solUsd, decimals: dec });
    if (!buy && T.priceUsd && Number($("lo-price").value) <= T.priceUsd) throw new SwapError("A sell limit below the current price would fill right away. Use a market sell, or Auto for a stop loss.");
    if (buy && T.priceUsd && Number($("lo-price").value) >= T.priceUsd) throw new SwapError("A buy limit above the current price would fill right away. Use a market buy instead.");
    const signer = await signerFor(settings.from), exp = Number($("lo-exp").value);
    text(btn, "Creating order…");
    const res = await trig.create({ inputMint: a.inputMint, outputMint: a.outputMint, maker: signer.pk, making: a.making, taking: a.taking, expiredAt: exp ? Math.floor(Date.now() / 1000) + exp : undefined });
    text(btn, signer.local ? "Submitting…" : "Approve in wallet…");
    const r = await signAndExecute({ web3, api: trig, res, sign: signWith(signer) });
    toast(`Limit ${buy ? "buy" : "sell"} placed for ${symbolOf(mint)} at ${price(Number($("lo-price").value))}.`, "ok", r.signature);
    $("lo-amt").value = "";
    setTimeout(loadTokenOrders, 2500);
  } catch (e) { toast(errMsg(e), "err"); }
  finally { S.busy = false; btn.disabled = false; text(btn, "Place limit order"); }
});
async function ordersFor(from) {
  const pk = from === "instant" ? S.instant?.pk : S.wallet?.pk;
  if (!pk) return [];
  const res = await trig.list(pk, "active");
  return (res?.orders || []).map(o => ({ ...describeOrder(o, S.solUsd), from }));
}
async function loadTokenOrders() {
  const host = $("lo-list"), mint = S.tokenMint;
  host.textContent = "";
  if (!S.wallet) return;
  try {
    const list = (await Promise.all(["main", "instant"].map(f => ordersFor(f).catch(() => [])))).flat().filter(o => o.mint === mint);
    if (S.tokenMint !== mint) return;
    for (const o of list) host.append(orderRow(o, loadTokenOrders));
  } catch (_) {}
}
function orderRow(o, after) {
  const row = make("div", "orow"), info = make("div"), x = make("button", "btn small", "Cancel"); x.type = "button";
  info.append(make("b", o.side === "buy" ? "up" : "down", `Limit ${o.side}`), ` ${num(o.tokens)} ${symbolOf(o.mint)} @ ${price(o.priceUsd)} · ${solFmt(o.sol)} SOL`, make("div", "muted", `${o.from === "instant" ? "instant wallet" : "main wallet"}${o.filledPct > 0 ? ` · ${o.filledPct.toFixed(0)}% filled` : ""}${o.expiredAt ? ` · expires ${new Date(/^\d+$/.test(String(o.expiredAt)) ? Number(o.expiredAt) * 1000 : Date.parse(o.expiredAt)).toLocaleString()}` : ""}`));
  x.addEventListener("click", async () => {
    x.disabled = true; text(x, "Cancelling…");
    try {
      const signer = await signerFor(o.from), res = await trig.cancel(signer.pk, o.key);
      const r = await signAndExecute({ web3, api: trig, res, sign: signWith(signer) });
      toast("Limit order cancelled. Unfilled funds return to the wallet.", "ok", r.signature);
      setTimeout(after, 2000);
    } catch (e) { toast(errMsg(e), "err"); x.disabled = false; text(x, "Cancel"); }
  });
  row.append(info, x);
  return row;
}

/* ---------- autopilot: TP / SL / trailing stop (instant wallet, while open) ---------- */
const RKEY = "ardea-autopilot";
const rules = () => store.get(RKEY, []);
const saveRules = l => { store.set(RKEY, l.slice(-200)); updateAutoChip(); };
document.querySelectorAll("#op-auto [data-add]").forEach(b => b.addEventListener("click", async () => {
  const kind = b.dataset.add, ids = { tp: ["ap-tp", "ap-tp-sell"], sl: ["ap-sl", "ap-sl-sell"], trail: ["ap-tr", "ap-tr-sell"] }[kind];
  try {
    const inst = await instantWallet();
    if (!T.priceUsd) throw new SwapError("No live price yet for this token.");
    const r = newRule({ wallet: inst.pk, mint: S.tokenMint, symbol: symbolOf(S.tokenMint), kind, pct: Number($(ids[0]).value), sellPct: Number($(ids[1]).value), entryUsd: T.priceUsd });
    saveRules([...rules(), r]); renderAutoList();
    toast(`${kind === "tp" ? "Take profit" : kind === "sl" ? "Stop loss" : "Trailing stop"} armed for ${r.symbol} at ${price(ruleTarget(r))}.`, "ok");
  } catch (e) { toast(errMsg(e), "err"); }
}));
function ruleRow(r, after) {
  const row = make("div", "orow"), info = make("div"), x = make("button", "btn small", r.status === "armed" ? "Remove" : "Clear"); x.type = "button";
  const name = { tp: "Take profit", sl: "Stop loss", trail: "Trailing stop" }[r.kind];
  info.append(make("b", r.kind === "tp" ? "up" : "down", name), ` ${r.symbol} · sell ${r.sellPct}% at ${price(ruleTarget(r))}`, make("div", "muted", `${r.kind === "trail" ? `${r.pct}% below peak ${price(r.peakUsd)}` : `${r.kind === "tp" ? "+" : "−"}${r.pct}% from ${price(r.entryUsd)}`} · ${r.status}${r.note ? ` · ${r.note}` : ""}`));
  x.addEventListener("click", () => { saveRules(rules().filter(y => y.id !== r.id)); after(); });
  row.append(info, x);
  return row;
}
function renderAutoList() {
  const host = $("ap-list"); host.textContent = "";
  for (const r of rules().filter(r => r.mint === S.tokenMint)) host.append(ruleRow(r, renderAutoList));
}
let autoBusy = false;
async function autopilot() {
  const armed = rules().filter(r => r.status === "armed");
  updateAutoChip();
  if (!armed.length || !S.instant || autoBusy) return;
  autoBusy = true;
  try {
    const prices = await jup.prices([...new Set(armed.map(r => r.mint))]);
    const all = rules();
    for (const r of all) {
      if (r.status !== "armed" || r.wallet !== S.instant.pk) continue;
      const ev = evaluateRule(r, prices[r.mint]?.usdPrice);
      if (ev.peakUsd && ev.peakUsd !== r.peakUsd) r.peakUsd = ev.peakUsd;
      if (ev.fire) { r.status = "firing"; saveRules(all); await fireRule(r, all); }
    }
    saveRules(all);
    if (S.route === "token") renderAutoList();
  } catch (_) {} finally { autoBusy = false; }
}
async function fireRule(r, all) {
  try {
    const accts = await connection.getParsedTokenAccountsByOwner(S.instant.kp.publicKey, { mint: new web3.PublicKey(r.mint) });
    const bal = accts.value.reduce((n, a) => n + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
    const amountRaw = r.sellPct >= 100 ? bal : bal * BigInt(Math.round(r.sellPct * 100)) / 10000n;
    if (amountRaw <= 0n) { r.status = "done"; r.note = "nothing left to sell"; return; }
    const res = await executeTrade({ side: "sell", mint: r.mint, amountRaw, from: "instant" });
    r.status = "done"; r.note = `sold for ${solFmt(res.sol)} SOL`; r.sig = res.sig;
    if (r.sellPct >= 100) for (const o of all) if (o !== r && o.mint === r.mint && o.wallet === r.wallet && o.status === "armed") { o.status = "cancelled"; o.note = "position closed"; }
    toast(`Autopilot: ${r.symbol} ${r.kind === "tp" ? "take profit" : r.kind === "sl" ? "stop loss" : "trailing stop"} sold ${r.sellPct}% for ≈${solFmt(res.sol)} SOL.`, "ok", res.sig);
  } catch (e) { r.status = "error"; r.note = errMsg(e).slice(0, 80); toast(`Autopilot couldn't sell ${r.symbol}: ${errMsg(e)}`, "err"); }
}
function updateAutoChip() {
  const chip = $("autochip"), armed = rules().filter(r => r.status === "armed").length, sn = snipes().filter(x => x.status === "armed").length;
  chip.hidden = !(armed + sn);
  const paused = !S.instant;
  chip.classList.toggle("paused", paused);
  iconLabel(chip, "auto", paused ? `${armed + sn} paused · unlock` : `${armed} rule${armed === 1 ? "" : "s"}${sn ? ` · ${sn} snipe${sn === 1 ? "" : "s"}` : ""}`);
  chip.title = paused ? "Autopilot needs your instant wallet unlocked in this tab." : "Autopilot is watching prices and migrations. Keep this terminal open.";
}
$("autochip").addEventListener("click", async () => { if (!S.instant) { try { await instantWallet(); updateAutoChip(); toast("Autopilot resumed.", "ok"); } catch (e) { toast(errMsg(e), "err"); } } else location.hash = "#/portfolio"; });

/* ---------- migration sniper ---------- */
const SKEY = "ardea-snipes";
const snipes = () => store.get(SKEY, []);
const saveSnipes = l => { store.set(SKEY, l.slice(-100)); updateAutoChip(); pulseDirty = true; };
async function toggleSnipe(mint) {
  const l = snipes(), on = l.find(x => x.mint === mint && x.status === "armed");
  if (on) { saveSnipes(l.filter(x => x !== on)); toast(`Snipe cancelled for ${symbolOf(mint)}.`, "info"); renderPulse(true); return; }
  try {
    const inst = await instantWallet();
    const amount = $("qbamt").value || settings.quickBuy;
    if (!toRaw(amount, 9)) throw new SwapError("Set a quick-buy amount first.");
    saveSnipes([...l.filter(x => x.mint !== mint), { mint, symbol: symbolOf(mint), amount, wallet: inst.pk, status: "armed", createdAt: Date.now() }]);
    toast(`Sniping ${symbolOf(mint)}: buys ${amount} SOL from your instant wallet the moment it migrates. Keep this tab open.`, "ok");
    renderPulse(true);
  } catch (e) { toast(errMsg(e), "err"); }
}
const firing = new Set();
async function fireSnipe(mint) {
  const l = snipes(), s = l.find(x => x.mint === mint && x.status === "armed");
  if (!s || firing.has(mint)) return;
  firing.add(mint);
  try {
    if (!S.instant || S.instant.pk !== s.wallet) { s.status = "missed"; s.note = "instant wallet was locked"; toast(`${s.symbol} migrated, but your instant wallet was locked so the snipe didn't fire.`, "err"); return; }
    s.status = "firing"; saveSnipes(l);
    const r = await executeTrade({ side: "buy", mint, amountRaw: toRaw(s.amount, 9), from: "instant" });
    s.status = "done"; s.sig = r.sig; s.note = `bought ${num(r.tokens)}`;
    toast(`Sniped ${s.symbol} on migration: ≈${num(r.tokens)} for ${s.amount} SOL.`, "ok", r.sig);
    const entryUsd = r.tokens && S.solUsd ? r.sol / r.tokens * S.solUsd : null;
    const add = [];
    if (entryUsd && settings.autoTp > 0) add.push(newRule({ wallet: s.wallet, mint, symbol: s.symbol, kind: "tp", pct: settings.autoTp, sellPct: 50, entryUsd }));
    if (entryUsd && settings.autoSl > 0) add.push(newRule({ wallet: s.wallet, mint, symbol: s.symbol, kind: "sl", pct: settings.autoSl, sellPct: 100, entryUsd }));
    if (add.length) saveRules([...rules(), ...add]);
  } catch (e) { s.status = "error"; s.note = errMsg(e).slice(0, 80); toast(`Snipe for ${s.symbol} failed: ${errMsg(e)}`, "err"); }
  finally { saveSnipes(l); firing.delete(mint); }
}

/* ---------- X posts ---------- */
async function loadPosts() {
  const host = $("tp-posts"), mint = S.tokenMint, sym = symbolOf(mint);
  host.textContent = "";
  if (!PROXY) { host.append(make("div", "tdempty", "Posts from X need the Ardea proxy with an X API key (see worker/README.md). X charges per post read, so they only load here.")); return; }
  host.append(make("div", "tdempty", "Loading posts…"));
  try {
    const q = /^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(sym) ? `(${mint} OR $${sym})` : mint;
    const res = await fetch(`${PROXY}/x/search?${new URLSearchParams({ q })}`);
    const data = await res.json();
    if (S.tokenMint !== mint) return;
    host.textContent = "";
    if (!res.ok) { host.append(make("div", "tdempty", data.error || "X is unavailable right now.")); return; }
    if (!data.posts?.length) { host.append(make("div", "tdempty", "No recent posts mention this token.")); return; }
    for (const p of data.posts) {
      const row = make("div", "post"), body = make("div"), who = make("div", "who");
      who.append(make("b", "", p.author?.name || "—"), ` @${p.author?.username || "?"} · ${num(p.author?.followers || 0)} followers · ${ago(Date.now() - Date.parse(p.createdAt))}`);
      const meta = make("div", "who stats");
      meta.append(svgIcon("heart"), make("span", "", num(p.likes)), svgIcon("repost"), make("span", "", num(p.reposts)));
      meta.append(extLink(`https://x.com/${encodeURIComponent(p.author?.username || "i")}/status/${encodeURIComponent(p.id)}`, "Open"));
      body.append(who, make("p", "", p.text), meta);
      row.append(icon(make("img"), p.author?.image), body);
      host.append(row);
    }
  } catch (e) { host.textContent = ""; host.append(make("div", "tdempty", `Couldn't load posts: ${errMsg(e)}`)); }
}

/* ---------- Private mode ---------- */
let solToken = null;
const GKEY = pk => `ardea-stealths-${pk}`;
const stealthRecords = () => S.wallet ? store.get(GKEY(S.wallet.pk), []) : [];
function saveStealth(rec) { const list = stealthRecords().filter(g => g.index !== rec.index); list.push(rec); list.sort((a, b) => a.index - b.index); store.set(GKEY(S.wallet.pk), list); }
// Any signature at all means the address has history. RPC errors throw: better no buy than a reused stealth.
const usedOnChain = async pk => (await connection.getSignaturesForAddress(new web3.PublicKey(pk), { limit: 1 })).length > 0;
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
// Houdini's id for native SOL. A failure here stops the route: there is no other path to fall back on.
const routeToken = async () => solToken || (solToken = await hd.tokens(SOL_QUERY).then(solTokenId));
function gsteps(n) { [...$("gsteps").children].forEach((li, i) => { li.className = i < n ? "done" : i === n ? "active" : ""; }); $("gsteps").hidden = n < 0; }
async function waitForSol(pk, min, ms = 90000) {
  const until = Date.now() + ms;
  for (;;) {
    const b = BigInt(await connection.getBalance(new web3.PublicKey(pk)));
    if (b >= min) return b;
    if (Date.now() > until) throw new StealthError("The Monero route reported delivery but the wallet hasn't received SOL yet. Check Portfolio in a minute.");
    await new Promise(r => setTimeout(r, 2500));
  }
}
// Private buy. The main wallet signs one transaction: the amount to a one-time Monero route address, plus the platform
// fee to the treasury. The route takes 10–40 minutes, so the rest runs in the background and the terminal stays
// usable: when the SOL lands in the fresh stealth wallet, it waits a random beat (Strong) and buys. The record is saved
// at every step, so Portfolio resumes or retries it after a reload.
async function stealthBuy() {
  const raw = amountRaw(), mint = S.tokenMint, sym = symbolOf(mint), main = S.wallet.pk, go = $("go");
  S.busy = true; go.disabled = true;
  let rec = null;
  try {
    text(go, "Sign in wallet…"); setTradeStatus("Sign the Ardea message so the terminal can open a fresh stealth wallet. It sends nothing.");
    const seed = await walletSeed();
    text(go, "Finding a fresh stealth wallet…");
    const { index, stealth } = await nextUnusedStealth(web3, seed, { isUsed: usedOnChain, start: stealthRecords().reduce((m, g) => Math.max(m, g.index + 1), 0) });
    const gpk = stealth.publicKey.toBase58(), fee = feeOf(raw, feeBps()), amount = raw - fee;
    gsteps(0); text(go, "Getting a Monero route…"); setTradeStatus("Asking Houdini for a SOL → XMR → SOL route to a fresh stealth wallet…");
    const route = await routeQuote({ hd, token: await routeToken(), amount, from: main, to: gpk });
    const eta = route.etaMin ? `about ${route.etaMin} min` : "10–40 min";
    rec = { index, address: gpk, mint, symbol: sym, sol: Number(raw) / 1e9, state: "funding", routeId: route.id, depositAddress: route.depositAddress, amountOut: String(route.amountOut), createdAt: Date.now() };
    saveStealth(rec);
    text(go, "Approve in wallet…");
    setTradeStatus(`Approve one transaction: ${fromRaw(amount, 9, 4)} SOL to a one-time Monero route address and the ${feeBps() / 100}% fee (${fromRaw(fee, 9, 4)} SOL) to the treasury. Stealth wallet #${index} receives ≈${fromRaw(route.amountOut, 9, 4)} SOL in ${eta}, then buys ${sym}.`);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = fundingTx(web3, { from: main, depositAddress: route.depositAddress, amount, fee, treasury: TREASURY, blockhash });
    await preflight(connection, tx);
    const sig = await signSend(tx, { local: null }, lastValidBlockHeight);
    rec = { ...rec, state: "routing", fundingSig: sig };
    saveStealth(rec);
    gsteps(1);
    setTradeStatus(`Sent. The Monero route takes ${eta} and runs in the background, so keep trading. Stealth wallet #${index} buys ${sym} when its SOL lands; progress is in Portfolio.`, "ok", sig);
    amt.value = ""; $("quote").hidden = true;
    refreshBalances();
    finishPrivateBuy(rec);
  } catch (e) {
    setTradeStatus(`${errMsg(e)}${rec && rec.state !== "funding" ? ` Stealth wallet #${rec.index} is listed in Portfolio.` : ""}`, "err");
  } finally { S.busy = false; setTimeout(() => gsteps(-1), 8000); updateGo(); }
}
// The background half of a private buy: wait for the Monero route, then buy from the stealth wallet.
const finishing = new Set();
async function finishPrivateBuy(rec) {
  if (finishing.has(rec.index) || !S.wallet) return;
  finishing.add(rec.index);
  const tag = `Stealth #${rec.index}`, save = patch => { rec = { ...rec, ...patch }; saveStealth(rec); };
  try {
    if (rec.state === "routing") {
      await waitForRoute(hd, rec.routeId, { onStatus: label => { save({ route: label }); refreshArmViews(); } });
      await waitForSol(rec.address, STEALTH_GAS_RESERVE + 1n, 10 * 60_000);
      // an armed wallet has no token yet: it waits, funded, until a buy fires it
      if (rec.armed && !rec.mint) { save({ state: "armed", route: undefined, error: undefined, armedAt: Date.now() }); toast(`Wallet #${rec.index} is armed: its SOL arrived through Monero. Private buys now fire instantly.`, "ok"); refreshArmViews(); return; }
      save({ state: "funded", route: "delivered", error: undefined });
      toast(`${tag} received its SOL through Monero.`, "ok");
    }
    if (rec.state !== "funded" || !rec.mint) return;
    const settle = jitter(...(PRIVACY[settings.privacy] || PRIVACY.strong).settle);
    if (settle) { save({ route: `buying in ${Math.round(settle / 1000)}s` }); await sleep(settle); }
    const stealth = await deriveStealth(web3, await walletSeed(), rec.index), pr = preset();
    const bal = BigInt(await connection.getBalance(stealth.publicKey));
    if (bal <= STEALTH_GAS_RESERVE) throw new StealthError(`${tag} has no SOL to buy with yet.`);
    const prep = await prepareSwap({ web3, jup, connection, side: "buy", mint: rec.mint, amountRaw: bal - STEALTH_GAS_RESERVE, user: rec.address, treasury: TREASURY, feeBps: 0, slippageBps: pr.slippageBps, priorityMaxLamports: Math.round(pr.maxSol * 1e9), priorityLevel: pr.priority });
    const bsig = await signSend(prep.tx, { local: stealth }, prep.lastValidBlockHeight);
    save({ state: "holding", buySig: bsig, route: undefined, error: undefined });
    const out = Number(prep.quote.outAmount) / 10 ** await decimalsOf(rec.mint);
    logTrade(S.wallet.pk, { sig: bsig, time: Date.now(), side: "buy", mint: rec.mint, symbol: rec.symbol, sol: rec.sol, tokens: out, from: `stealth #${rec.index}` });
    toast(`${tag} bought ≈${num(out)} ${rec.symbol}. No transfer runs from your wallet to it.`, "ok", bsig);
    refreshBalances(); renderMine();
  } catch (e) {
    save({ error: errMsg(e) });
    toast(`${tag}: ${errMsg(e)}`, "err");
  } finally { finishing.delete(rec.index); if (S.route === "portfolio") renderStealths(); }
}
/* ---------- Arm a wallet ---------- */
// Arming funds fresh stealth wallets through Monero ahead of time: one wallet approval for all of them, the fee paid
// once, at arming. An armed wallet then fires a private buy instantly with its whole balance: there is no route to
// wait for, and because the funding happened earlier, the buy's timing and amount don't line up with your deposit.
const armBalances = {};
async function readArmBalances() {
  const recs = S.wallet ? stealthRecords().filter(r => r.armed) : [];
  await Promise.all(recs.map(async r => { try { armBalances[r.address] = BigInt(await connection.getBalance(new web3.PublicKey(r.address))); } catch (_) {} }));
  return recs;
}
const armReady = () => S.wallet ? pickArmed(stealthRecords(), armBalances, STEALTH_GAS_RESERVE) : null;
function refreshArmViews() {
  renderArmChip();
  if (S.route === "arm") renderArm();
  if (S.route === "portfolio") renderStealths();
  if (S.route === "token") updateGo();
}
function renderArmChip() {
  const chip = $("armchip");
  if (!chip) return;
  const s = armSummary(S.wallet ? stealthRecords() : [], armBalances, STEALTH_GAS_RESERVE);
  chip.hidden = !s.ready && !s.arming;
  text(chip, s.ready ? `${s.ready} armed · ${fromRaw(s.readySol, 9, 2)} SOL` : `${s.arming} arming…`);
}
// Resume any arming routes after a reload: they only wait for the chain, no signature needed.
function resumeArming() { if (S.wallet) stealthRecords().filter(r => r.armed && r.state === "routing" && r.routeId).forEach(r => finishPrivateBuy(r)); }

async function armWallets(totalRaw, count, say) {
  if (!TREASURY) throw new SwapError(TRADING_CLOSED);
  const main = S.wallet.pk, seed = await walletSeed(), sizes = armSizes(totalRaw, count);
  // distinct fresh wallets, each checked on-chain so none is ever reused
  const picks = [];
  let start = stealthRecords().reduce((m, g) => Math.max(m, g.index + 1), 0);
  for (let i = 0; i < count; i++) { const p = await nextUnusedStealth(web3, seed, { isUsed: usedOnChain, start }); picks.push(p); start = p.index + 1; }
  const token = await routeToken(), routes = [], fees = [];
  for (let i = 0; i < count; i++) {
    say(`Opening Monero route ${i + 1} of ${count}…`);
    const fee = feeOf(sizes[i], feeBps());
    fees.push(fee);
    routes.push(await routeQuote({ hd, token, amount: sizes[i] - fee, from: main, to: picks[i].stealth.publicKey.toBase58() }));
    if (i < count - 1) await sleep(1300); // the gateway opens at most one order per second
  }
  const recs = picks.map((p, i) => ({ index: p.index, address: p.stealth.publicKey.toBase58(), armed: true, state: "funding", routeId: routes[i].id, depositAddress: routes[i].depositAddress, amountOut: String(routes[i].amountOut), sol: Number(sizes[i]) / 1e9, createdAt: Date.now() }));
  recs.forEach(saveStealth);
  const out = routes.reduce((n, r) => n + r.amountOut, 0n), feeTotal = fees.reduce((a, b) => a + b, 0n);
  say(`Approve ${count === 1 ? "one transaction" : `${count} transactions in one prompt`}: ${fromRaw(totalRaw - feeTotal, 9, 4)} SOL into Monero routes plus the ${feeBps() / 100}% fee (${fromRaw(feeTotal, 9, 4)} SOL). About ${fromRaw(out, 9, 4)} SOL arrives across ${count} clean wallet${count > 1 ? "s" : ""} in 10–40 minutes.`);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const txs = routes.map((r, i) => fundingTx(web3, { from: main, depositAddress: r.depositAddress, amount: sizes[i] - fees[i], fee: fees[i], treasury: TREASURY, blockhash }));
  for (const tx of txs) await preflight(connection, tx);
  const p = S.wallet.p, signed = p.signAllTransactions ? await p.signAllTransactions(txs) : [];
  if (!p.signAllTransactions) for (const tx of txs) signed.push(await p.signTransaction(tx));
  for (let i = 0; i < signed.length; i++) {
    if (i) { const ms = jitter(3000, 15000); say(`Sent ${i} of ${signed.length}. The next goes in ${Math.round(ms / 1000)}s, so the deposits don't line up.`); await sleep(ms); }
    const sig = await sendAndConfirm(connection, signed[i], lastValidBlockHeight, {});
    const rec = { ...recs[i], state: "routing", fundingSig: sig };
    saveStealth(rec);
    finishPrivateBuy(rec);
  }
  refreshArmViews(); refreshBalances();
  return { count, out };
}

// Fire: the oldest armed wallet buys `mint` with its whole balance, signed in this tab. No fee here; it was paid at arming.
async function fireArmed(mint, { onStatus = () => {} } = {}) {
  await readArmBalances();
  const armed = armReady();
  if (!armed) throw new StealthError("No armed wallet is ready. Arm one first, or turn Private mode off.");
  saveStealth({ ...armed, state: "firing", mint, symbol: symbolOf(mint) });
  try {
    const stealth = await deriveStealth(web3, await walletSeed(), armed.index), pr = preset();
    const bal = BigInt(await connection.getBalance(stealth.publicKey)), spend = bal - STEALTH_GAS_RESERVE;
    onStatus(`Firing armed wallet #${armed.index} (${fromRaw(spend, 9, 4)} SOL)…`);
    const prep = await prepareSwap({ web3, jup, connection, side: "buy", mint, amountRaw: spend, user: armed.address, treasury: TREASURY, feeBps: 0, slippageBps: pr.slippageBps, priorityMaxLamports: Math.round(pr.maxSol * 1e9), priorityLevel: pr.priority });
    const sig = await signSend(prep.tx, { local: stealth }, prep.lastValidBlockHeight);
    const tokens = Number(prep.quote.outAmount) / 10 ** await decimalsOf(mint), sol = Number(spend) / 1e9;
    saveStealth({ ...armed, state: "holding", mint, symbol: symbolOf(mint), buySig: sig, firedAt: Date.now() });
    logTrade(S.wallet.pk, { sig, time: Date.now(), side: "buy", mint, symbol: symbolOf(mint), sol, tokens, from: `armed #${armed.index}` });
    armBalances[armed.address] = 0n;
    refreshArmViews(); refreshBalances(); renderMine();
    return { sig, tokens, sol, index: armed.index };
  } catch (e) { saveStealth(armed); throw e; } // still armed if the buy didn't happen
}
async function fireFromPanel() {
  const go = $("go"), mint = S.tokenMint;
  S.busy = true; go.disabled = true;
  try {
    text(go, "Firing…");
    const r = await fireArmed(mint, { onStatus: m => setTradeStatus(m) });
    setTradeStatus(`Armed wallet #${r.index} bought ≈${num(r.tokens)} ${symbolOf(mint)} with ${solFmt(r.sol)} SOL. It was funded through Monero earlier, so no transfer runs from your wallet to it.`, "ok", r.sig);
  } catch (e) { setTradeStatus(errMsg(e), "err"); }
  finally { S.busy = false; updateGo(); }
}

// The Arm screen: arm new wallets, see the ones arming and armed, disarm back to your wallet through Monero.
function renderArm() {
  const box = $("arm-body");
  if (!box) return;
  box.textContent = "";
  if (!S.wallet) {
    const b = make("button", "btn primary", "Connect wallet"); b.type = "button"; b.addEventListener("click", ensureConnected);
    box.append(make("p", "muted", "Connect the wallet you'll arm from. It signs the funding; the armed wallets are derived from one signature of it and can be rebuilt on any device."), b);
    return;
  }
  const s = armSummary(stealthRecords(), armBalances, STEALTH_GAS_RESERVE);
  const stats = make("div", "arm-stats");
  [["Armed", String(s.ready)], ["Ready to fire", `${fromRaw(s.readySol, 9, 3)} SOL`], ["Arming", String(s.arming)]].forEach(([k, v]) => { const d = make("div"); d.append(make("i", "", k), make("b", "", v)); stats.append(d); });
  const form = make("div", "arm-form");
  const total = make("input", "inp"); total.placeholder = "Total SOL, e.g. 1.5"; total.inputMode = "decimal"; total.setAttribute("aria-label", "Total SOL to arm");
  const count = make("select", "inp"); count.setAttribute("aria-label", "Number of wallets");
  for (let n = 1; n <= ARM_MAX_WALLETS; n++) { const o = make("option", "", `${n} wallet${n > 1 ? "s" : ""}`); o.value = n; if (n === 2) o.selected = true; count.append(o); }
  const go = make("button", "btn primary arm-go", "Arm"); go.type = "button";
  const st = make("p", "arm-status muted mono", `Each wallet is funded through its own Monero route (about 0.3 SOL minimum per wallet right now) and is ready in 10–40 minutes. The ${feeBps() / 100}% fee is paid once, here; firing is free.`);
  go.addEventListener("click", async () => {
    if (S.busy) return;
    const raw = toRaw(total.value, 9), n = Number(count.value);
    if (!raw) return text(st, "Enter how much SOL to arm in total.");
    if (raw > toRaw(String(STEALTH_MAX_SOL * n), 9)) return text(st, `Up to ${STEALTH_MAX_SOL} SOL per wallet while arming is in beta.`);
    if (S.sol != null && raw + 10_000_000n > S.sol) return text(st, "Not enough SOL in your wallet for that plus network fees.");
    S.busy = true; go.disabled = true;
    try { const r = await armWallets(raw, n, m => text(st, m)); text(st, `Arming ${r.count} wallet${r.count > 1 ? "s" : ""}: about ${fromRaw(r.out, 9, 4)} SOL arrives through Monero in 10–40 minutes. Keep trading; this page and the header show when they're ready.`); total.value = ""; }
    catch (e) { text(st, errMsg(e)); }
    finally { S.busy = false; go.disabled = false; }
  });
  form.append(total, count, go);
  const list = make("div", "arm-list");
  const recs = stealthRecords().filter(r => r.armed).sort((a, b) => b.index - a.index);
  if (!recs.length) list.append(make("p", "muted", "No armed wallets yet."));
  for (const r of recs) {
    const row = make("div", "arm-row"), meta = make("div", "meta"), acts = make("div", "acts");
    const label = { funding: "waiting for your approval", routing: r.route || "crossing Monero", armed: "armed · ready to fire", firing: "firing…", holding: `fired · holds ${r.symbol || "a token"}`, exiting: "returning to your wallet", closed: "returned", partial: "returned, tokens left" }[r.state] || r.state;
    const bal = armBalances[r.address];
    meta.append(make("b", "", `Wallet #${r.index}`), " ", extLink(`https://solscan.io/account/${r.address}`, short(r.address)), ` · ${label}${bal != null ? ` · ${fromRaw(bal, 9, 4)} SOL` : ""}`);
    if (r.error) meta.append(make("span", "neg", ` · ${r.error}`));
    if (["armed", "holding", "partial"].includes(r.state)) {
      const b = make("button", "btn small", r.state === "armed" ? "Disarm" : "Sell all & return"); b.type = "button";
      b.addEventListener("click", () => stealthExit(r.index, row).then(refreshArmViews));
      acts.append(b);
    }
    row.dataset.state = r.state; row.append(meta, acts); list.append(row);
  }
  box.append(stats, form, st, list);
}

async function stealthExit(index, row) {
  if (S.busy) return;
  S.busy = true;
  const say = (m, k = "") => { text(row.querySelector(".meta"), m); if (k) toast(m, k); };
  try {
    const stealth = await deriveStealth(web3, await walletSeed(), index), gpk = stealth.publicKey.toBase58(), owner = stealth.publicKey;
    const accounts = async () => (await Promise.all(TOKEN_PROGRAMS.map(p =>
      connection.getParsedTokenAccountsByOwner(owner, { programId: new web3.PublicKey(p) }).then(r => r.value.map(a => ({ address: a.pubkey.toBase58(), programId: p, lamports: a.account.lamports, mint: a.account.data.parsed.info.mint, raw: BigInt(a.account.data.parsed.info.tokenAmount.amount) }))).catch(() => [])))).flat();
    for (const a of (await accounts()).filter(a => a.raw > 0n && a.mint !== SOL_MINT)) {
      say(`Stealth #${index}: selling ${symbolOf(a.mint)}…`);
      const prep = await prepareSwap({ web3, jup, connection, side: "sell", mint: a.mint, amountRaw: a.raw, user: gpk, treasury: TREASURY, feeBps: 0, slippageBps: Math.max(preset().slippageBps, 500), priorityMaxLamports: PRIORITY_MAX_LAMPORTS });
      await signSend(prep.tx, { local: stealth }, prep.lastValidBlockHeight);
    }
    const left = await accounts(), stuck = left.filter(a => a.raw > 0n), close = left.filter(a => a.raw === 0n);
    const amount = exitAmount(await connection.getBalance(owner), close);
    if (amount <= 0n) throw new StealthError(`Stealth #${index} has nothing left to send.`);
    say(`Stealth #${index}: getting a private route home…`);
    const route = await routeQuote({ hd, token: await routeToken(), amount, from: gpk, to: S.wallet.pk });
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const sig = await sendAndConfirm(connection, exitTx(web3, { stealth, depositAddress: route.depositAddress, amount, closeAccounts: close, blockhash }), lastValidBlockHeight);
    const rec = stealthRecords().find(g => g.index === index) || { index, address: gpk };
    saveStealth({ ...rec, state: "exiting", exitRouteId: route.id, exitDeposit: route.depositAddress });
    S.busy = false; // the route takes 10–40 minutes; the terminal stays usable meanwhile
    await waitForRoute(hd, route.id, { onStatus: label => say(`Stealth #${index} → your wallet: ${label}…`) });
    saveStealth({ ...rec, state: stuck.length ? "partial" : "closed" });
    toast(`Stealth #${index} is back in your wallet through Monero: ≈${fromRaw(route.amountOut, 9, 4)} SOL${stuck.length ? `. ${stuck.length} token(s) had no route and stayed behind` : ""}.`, "ok", sig);
    refreshBalances();
  } catch (e) { say(errMsg(e), "err"); }
  finally { S.busy = false; renderStealths(); }
}
async function renderStealths(gap = 5) {
  const list = $("g-list");
  if (!S.wallet) { list.textContent = ""; list.append(make("span", "muted mono", "Connect a wallet to see its stealth wallets.")); return; }
  if (!S.seed) return;
  text($("g-unlock"), "Scan further");
  list.textContent = ""; list.append(make("span", "muted mono", "Scanning stealth wallets…"));
  const recs = stealthRecords(), rows = [];
  // An RPC failure must not read as "unused": it would end the scan early and hide funded stealths.
  let used = [], scanErr = null;
  try { used = await scanStealths(web3, S.seed, { isUsed: usedOnChain, known: recs.reduce((m, g) => Math.max(m, g.index), -1), gap }); }
  catch (e) { scanErr = e; }
  for (const r of recs) if (!used.some(u => u.index === r.index)) used.push({ index: r.index, stealth: await deriveStealth(web3, S.seed, r.index) });
  used.sort((a, b) => a.index - b.index);
  for (const { index: i, stealth } of used) {
    const pk = stealth.publicKey;
    const [bal, toks] = await Promise.all([connection.getBalance(pk).catch(() => 0), Promise.all(TOKEN_PROGRAMS.map(p => connection.getParsedTokenAccountsByOwner(pk, { programId: new web3.PublicKey(p) }).then(r => r.value).catch(() => []))).then(v => v.flat())]);
    const held = toks.map(a => a.account.data.parsed.info).filter(t => BigInt(t.tokenAmount.amount) > 0n);
    const rec = recs.find(g => g.index === i);
    if (!bal && !held.length && !(rec && rec.state !== "closed")) continue;
    rows.push({ i, stealth, bal: BigInt(bal), held, rec });
  }
  list.textContent = "";
  if (scanErr) list.append(make("span", "muted mono", `Couldn't read stealth history from the RPC (${errMsg(scanErr)}). Showing stealth wallets this browser remembers; use Scan further to retry, or set your own RPC URL in Settings.`));
  else if (!rows.length) list.append(make("span", "muted mono", "No stealth wallets with funds. Turn on Private mode in the trade panel to make one."));
  for (const r of rows) {
    const row = make("div", "stealth-row"), meta = make("div", "meta"), acts = make("div", "acts");
    meta.append(make("b", "", `Stealth #${r.i}`), ` · ${short(r.stealth.publicKey.toBase58())} · ${fromRaw(r.bal, 9, 4)} SOL`);
    for (const t of r.held) meta.append(` · ${num(Number(t.tokenAmount.uiAmountString || t.tokenAmount.uiAmount))} ${symbolOf(t.mint)}`);
    if (r.rec) meta.append(` · ${r.rec.state}${r.rec.route ? ` (${r.rec.route})` : ""}`);
    if (r.rec && r.rec.error) meta.append(make("span", "neg", ` · ${r.rec.error}`));
    if (r.rec && r.rec.state === "routing" && r.rec.routeId) finishPrivateBuy(r.rec);
    if (r.rec && r.rec.state === "funded" && r.rec.mint && !finishing.has(r.i)) {
      const buy = make("button", "btn small primary", `Buy ${r.rec.symbol || symbolOf(r.rec.mint)}`); buy.type = "button";
      buy.addEventListener("click", () => finishPrivateBuy({ ...r.rec, error: undefined }));
      acts.append(buy);
    }
    const exit = make("button", "btn small" + (r.rec && r.rec.state === "funded" ? "" : " primary"), r.held.length ? "Sell all & exit" : "Exit to wallet"); exit.type = "button";
    exit.addEventListener("click", () => stealthExit(r.i, row));
    const key = make("button", "btn small", "Export key"); key.type = "button";
    key.addEventListener("click", () => { const old = row.querySelector(".keybox"); if (old) return old.remove(); row.append(make("div", "keybox", `Secret key for stealth #${r.i} (import into Phantom or Solflare): ${base58Encode(r.stealth.secretKey)}`)); });
    acts.append(exit, key); row.append(meta, acts); list.append(row);
  }
}
$("g-unlock").addEventListener("click", async () => {
  try { if (!S.wallet && !(await ensureConnected())) return; await walletSeed(); S.stealthScan = (S.stealthScan || 5) + 10; await renderStealths(S.stealthScan); }
  catch (e) { toast(errMsg(e), "err"); }
});

/* ---------- Tracker ---------- */
const tracked = () => store.get("ardea-tracked", []);
function addTracked(address, label) {
  if (!isAddress(address)) return toast("That isn't a Solana address.", "err");
  const l = tracked().filter(w => w.address !== address); l.push({ address, label: label || short(address) });
  store.set("ardea-tracked", l); renderTracker(); startTracker();
}
const feed = [];
const seenSigs = new Map();
let trackerTimer = 0, trackerRunning = false;
async function trackerPass() {
  const list = tracked();
  if (!list.length) { setStatusChip($("tk-status"), "idle", "tracker"); return; }
  setStatusChip($("tk-status"), "live", `${list.length} wallet${list.length === 1 ? "" : "s"}`);
  for (const w of list) {
    const first = !seenSigs.has(w.address);
    if (first) seenSigs.set(w.address, new Set());
    try {
      const swaps = await recentSwaps({ connection, web3, wallet: w.address, seen: seenSigs.get(w.address), solUsd: S.solUsd, limit: first ? 10 : 6 });
      if (!swaps.length) continue;
      await lookupTokens(swaps.map(s => s.mint));
      for (const s of swaps) {
        feed.unshift({ ...s, label: w.label, fresh: !first });
        if (!first) toast(`${w.label} ${s.side === "buy" ? "bought" : "sold"} ${symbolOf(s.mint)} for ${solFmt(s.sol)} SOL`, "info", s.sig);
      }
      feed.sort((a, b) => b.time - a.time); feed.length = Math.min(feed.length, 200);
      if (S.route === "tracker") renderFeed();
    } catch (_) { setStatusChip($("tk-status"), "rate limited", "tracker"); }
  }
}
function startTracker() {
  if (trackerRunning) return;
  trackerRunning = true;
  const loop = async () => { if (!whenAwake(loop)) return; await trackerPass(); trackerTimer = setTimeout(loop, 20000); };
  loop();
}
function renderTracker() {
  const ul = $("tk-list"); ul.textContent = "";
  for (const w of tracked()) {
    const li = make("li"), info = make("div"), x = make("button", "icon-btn"); x.append(svgIcon("close")); x.type = "button"; x.setAttribute("aria-label", `Stop tracking ${w.label}`);
    info.append(make("div", "lab", w.label), link(solscan("account", w.address), short(w.address)));
    x.addEventListener("click", () => { store.set("ardea-tracked", tracked().filter(t => t.address !== w.address)); seenSigs.delete(w.address); renderTracker(); });
    li.append(info, x); ul.append(li);
  }
  renderFeed();
}
function renderFeed() {
  const table = $("tk-feed"); table.textContent = "";
  if (!tracked().length) { emptyRow(table, "Add a wallet to see its swaps here. Tip: the Holders tab on any token has a Track button.", "stream"); return; }
  if (!feed.length) { emptyRow(table, "Watching… swaps show up within about 20 seconds."); return; }
  const head = make("tr"); ["Age", "Wallet", "Type", "Token", "SOL", "Tokens", "", ""].forEach((h, i) => head.append(make("th", i > 3 && i < 6 ? "num" : "", h))); table.append(head);
  for (const s of feed) {
    const tr = make("tr", `trade-${s.side}${s.fresh ? " newrow" : ""}`); s.fresh = false;
    const tok = make("td"), wrap = make("a", "cell-tok"); wrap.href = `#/token/${s.mint}`; wrap.append(icon(make("img", "tok-icon"), iconOf(s.mint), s.mint), make("span", "", symbolOf(s.mint))); tok.append(wrap);
    const qbtd = make("td", "num"), qb = qbLabel(make("button", "qb"), $("qbamt").value || settings.quickBuy); qb.type = "button"; qb.addEventListener("click", () => quickBuy(s.mint, qb)); qbtd.append(qb);
    const tx = make("td", "num"); tx.append(extLink(solscan("tx", s.sig), "", "txl"));
    tr.append(make("td", "muted", s.time ? ago(Date.now() - s.time * 1000) : "—"), make("td", "", s.label), make("td", "side", s.side === "buy" ? "Buy" : "Sell"), tok, make("td", "num", solFmt(s.sol)), make("td", "num", num(s.tokens)), qbtd, tx);
    table.append(tr);
  }
}
$("tk-form").addEventListener("submit", e => { e.preventDefault(); addTracked($("tk-addr").value.trim(), $("tk-label").value.trim()); $("tk-addr").value = ""; $("tk-label").value = ""; });

/* ---------- Portfolio ---------- */
let pfWallet = "main";
let pfRun = 0;
// Allocation colours: the art palette, so the dashboard matches the drawings.
const ALLOC = ["#9A9A9A", "#FF6600", "#43D19E", "#8C8C8C", "#F2C14E", "#B9A3E3", "#F2F2F2", "#4C4C4C"];
// A PnL value with a small bar under it, scaled to the biggest win or loss in the table.
function pnlCell(v, max) {
  const td = make("td", "num pnl");
  if (v == null || !isFinite(v)) { td.textContent = "—"; return td; }
  const val = cls(make("span", "", `${v >= 0 ? "+" : ""}${solFmt(v)}`), v), bar = make("span", `pb ${v >= 0 ? "pos" : "neg"}`);
  bar.style.width = `${Math.max(4, Math.min(100, Math.abs(v) / max * 100))}%`;
  td.append(val, bar); return td;
}
async function renderPortfolio() {
  const run = ++pfRun, stale = () => run !== pfRun;
  const cards = $("pf-cards"), table = $("pf-table"), act = $("pf-act");
  $("pf-wallet").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b.dataset.w === pfWallet));
  cards.textContent = ""; table.textContent = ""; act.textContent = "";
  const card = (k, v, c, glyph = "key") => { const d = make("div", "panel card"), g = glyphSVG(glyph, "cg"), body = make("div"); body.append(make("div", "k", k), cls(make("div", "v", v), c)); d.append(g, body); cards.append(d); };
  if (!S.wallet) { card("Wallet", "Not connected"); emptyRow(table, "Connect a wallet to see positions.", "stealth"); renderStealths(); renderPfOrders(); return; }
  const pk = pfWallet === "instant" ? S.instant?.pk : S.wallet.pk;
  if (!pk) { card("Instant wallet", "Locked"); const tr = table.insertRow(), td = make("td", "tdempty"); const b = make("button", "btn small primary", "Unlock instant wallet"); b.type = "button"; b.addEventListener("click", async () => { try { await instantWallet(); renderPortfolio(); } catch (e) { toast(errMsg(e), "err"); } }); td.append(b); tr.append(td); renderStealths(); renderPfOrders(); return; }
  emptyRow(table, "Loading positions…");
  const log = tradesOf(pk);
  if (log.length) act.append(tradeTable(log)); else emptyRow(act, "Trades you make in this terminal show up here. Import on-chain history to include trades made elsewhere.");
  renderStealths(); renderPfOrders();
  try {
    const owner = new web3.PublicKey(pk);
    const [bal, accts] = await Promise.all([connection.getBalance(owner), Promise.all(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"].map(p => connection.getParsedTokenAccountsByOwner(owner, { programId: new web3.PublicKey(p) }).then(r => r.value).catch(() => []))).then(x => x.flat())]);
    if (stale()) return;
    const held = new Map();
    for (const a of accts) { const i = a.account.data.parsed.info, n = Number(i.tokenAmount.uiAmountString ?? i.tokenAmount.uiAmount ?? 0); if (n > 0 && i.mint !== SOL_MINT) held.set(i.mint, (held.get(i.mint) || 0) + n); }
    const mints = [...new Set([...held.keys(), ...log.map(t => t.mint)])].slice(0, 50);
    // draw from the chain right away; prices and PnL fill in when Jupiter answers
    const draw = (prices, priced) => {
      if (stale()) return;
      const solUsd = S.solUsd || 0;
      const pSol = Object.fromEntries(mints.map(m => [m, prices[m]?.usdPrice && solUsd ? prices[m].usdPrice / solUsd : undefined]));
      const byMint = new Map(pnl(log, pSol).map(r => [r.mint, r]));
      const all = mints.map(m => { const r = byMint.get(m) || { mint: m, avg: 0, realized: 0, unrealized: null, total: 0, pct: 0, holding: 0 }; const h = held.get(m) || 0; const value = pSol[m] != null ? h * pSol[m] : null; return { ...r, onchain: h, value, unrealized: r.boughtTok ? (value != null ? value - Math.min(h, r.holding) * r.avg : null) : null }; })
        .filter(r => r.onchain > 0 || r.realized).sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.onchain - a.onchain);
      const total = all.reduce((n, r) => n + (r.value || 0), 0), unreal = all.reduce((n, r) => n + (r.unrealized || 0), 0), real = all.reduce((n, r) => n + (r.realized || 0), 0);
      cards.textContent = "";
      card(`${pfWallet === "instant" ? "Instant" : "Main"} SOL`, `${solFmt(bal / 1e9)} SOL`, 0, pfWallet === "instant" ? "bolt" : "key");
      card("Positions value", priced ? `${solFmt(total)} SOL${solUsd ? ` · ${usd(total * solUsd)}` : ""}` : "pricing…", 0, "stack");
      card("Unrealized PnL", priced ? `${unreal >= 0 ? "+" : ""}${solFmt(unreal)} SOL` : "…", priced ? unreal : 0, "chart");
      card("Realized PnL", `${real >= 0 ? "+" : ""}${solFmt(real)} SOL`, real, "target");
      // where the SOL sits: wallet balance plus each position, as one bar
      const parts = [{ label: "SOL", v: bal / 1e9, mint: null }, ...all.filter(r => r.value > 0).map(r => ({ label: symbolOf(r.mint), v: r.value, mint: r.mint }))];
      const sum = parts.reduce((n, x) => n + x.v, 0);
      if (priced && sum > 0 && parts.length > 1) {
        const box = make("div", "panel alloc"), bar = make("div", "abar"), legend = make("div", "alegend");
        box.append(make("div", "k", "Allocation"), bar, legend);
        const shown = parts.slice(0, 7), rest = parts.slice(7).reduce((n, x) => n + x.v, 0);
        if (rest > 0) shown.push({ label: "Other", v: rest, mint: null });
        shown.forEach((x, i) => {
          const share = x.v / sum * 100, seg = make("i"); seg.style.width = `${share}%`; seg.style.background = ALLOC[i % ALLOC.length]; seg.title = `${x.label} ${share.toFixed(1)}%`; bar.append(seg);
          const li = make("span", "ali"), sw = make("i"); sw.style.background = ALLOC[i % ALLOC.length];
          li.append(sw); if (x.mint) li.append(icon(make("img", "tok-icon"), iconOf(x.mint), x.mint));
          li.append(make("b", "", x.label), make("span", "muted", `${share.toFixed(share < 10 || share > 99 ? 1 : 0)}%`)); legend.append(li);
        });
        cards.append(box);
      }
      table.textContent = "";
      const head = make("tr"); ["Token", "Holding", "Value", "Avg cost", "Unrealized", "Realized", "Sell"].forEach((h, i) => head.append(make("th", i ? "num" : "", h))); table.append(head);
      if (!all.length) emptyRow(table, "No positions yet.", "stealth");
      const pnlMax = Math.max(1e-9, ...all.flatMap(r => [Math.abs(r.unrealized || 0), Math.abs(r.realized || 0)]));
      for (const r of all) {
        const tr = make("tr"), tok = make("td"), a = make("a", "cell-tok"); a.href = `#/token/${r.mint}`; a.append(icon(make("img", "tok-icon"), iconOf(r.mint), r.mint), make("b", "", symbolOf(r.mint))); tok.append(a);
        const sells = make("td", "num");
        for (const pctv of [50, 100]) {
          const b = make("button", "btn small", `${pctv}%`); b.type = "button";
          b.addEventListener("click", async () => {
            b.disabled = true;
            try {
              const dec = await decimalsOf(r.mint), accts2 = await connection.getParsedTokenAccountsByOwner(owner, { mint: new web3.PublicKey(r.mint) });
              const rawBal = accts2.value.reduce((n, x) => n + BigInt(x.account.data.parsed.info.tokenAmount.amount), 0n);
              const amountRaw = pctv === 100 ? rawBal : rawBal * BigInt(pctv) / 100n;
              const res = await executeTrade({ side: "sell", mint: r.mint, amountRaw, from: pfWallet });
              toast(`Sold ${num(Number(amountRaw) / 10 ** dec)} ${symbolOf(r.mint)} for ≈${solFmt(res.sol)} SOL`, "ok", res.sig);
              setTimeout(renderPortfolio, 2000);
            } catch (e) { toast(errMsg(e), "err"); b.disabled = false; }
          });
          sells.append(b, " ");
        }
        tr.append(tok, make("td", "num", num(r.onchain)), make("td", "num", r.value != null ? `${solFmt(r.value)} SOL` : priced ? "—" : "…"), make("td", "num", r.avg ? price(r.avg * solUsd) : "—"), pnlCell(r.unrealized, pnlMax), pnlCell(r.realized || null, pnlMax), sells);
        table.append(tr);
      }
    };
    draw({}, false);
    const [prices] = await Promise.all([jup.prices(mints).catch(() => ({})), lookupTokens(mints)]);
    draw(prices, true);
  } catch (e) { if (!stale()) { table.textContent = ""; emptyRow(table, `Couldn't load positions: ${errMsg(e)}`); } }
}
let pfoRun = 0;
async function renderPfOrders() {
  const run = ++pfoRun, t = $("pf-orders");
  const host = make("div", "olist"); host.style.padding = "8px";
  const limits = S.wallet ? (await Promise.all(["main", "instant"].map(f => ordersFor(f).catch(() => [])))).flat() : [];
  await lookupTokens(limits.map(o => o.mint));
  if (run !== pfoRun) return;
  t.textContent = "";
  for (const o of limits) host.append(orderRow(o, renderPfOrders));
  for (const r of rules()) host.append(ruleRow(r, renderPfOrders));
  for (const sn of snipes()) {
    const row = make("div", "orow"), info = make("div"), x = make("button", "btn small", sn.status === "armed" ? "Cancel" : "Clear"); x.type = "button";
    const a = make("a", "", sn.symbol); a.href = `#/token/${sn.mint}`;
    info.append(make("b", "warnc", "Snipe "), a, ` · ${sn.amount} SOL on migration`, make("div", "muted", `${sn.status}${sn.note ? ` · ${sn.note}` : ""}`));
    x.addEventListener("click", () => { saveSnipes(snipes().filter(y => y.mint !== sn.mint)); renderPfOrders(); });
    row.append(info, x); host.append(row);
  }
  const tr = make("tr"), td = make("td"); td.colSpan = 12; td.style.padding = "0";
  if (!host.childElementCount) td.append(make("div", "tdempty", "No open limit orders, autopilot rules or snipes."));
  else td.append(host);
  tr.append(td); t.append(tr);
}
$("imp-go").addEventListener("click", async () => {
  const btn = $("imp-go");
  try {
    if (!S.wallet && !(await ensureConnected())) return;
    const pk = pfWallet === "instant" ? (await instantWallet()).pk : S.wallet.pk;
    btn.disabled = true;
    const { swaps } = await walletHistory({ connection, web3, wallet: pk, limit: 100, onProgress: (d, n) => text($("imp-note"), `Reading ${d}/${n} transactions…`) });
    await lookupTokens(swaps.map(x => x.mint));
    const before = tradesOf(pk).length, merged = mergeHistory(tradesOf(pk), swaps, symbolOf);
    store.set(TKEY(pk), merged.slice(0, 1000));
    text($("imp-note"), `Added ${merged.length - before} swap${merged.length - before === 1 ? "" : "s"} from the last 100 transactions.`);
    renderPortfolio();
  } catch (e) { text($("imp-note"), errMsg(e)); }
  finally { btn.disabled = false; }
});
$("pf-wallet").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; pfWallet = b.dataset.w; renderPortfolio(); });
$("x-run").addEventListener("click", async () => {
  if (!S.wallet && !(await ensureConnected())) return;
  const btn = $("x-run"); btn.disabled = true; text(btn, "Tracing…");
  try {
    const r = await trace(S.wallet.pk, { url: rpcUrl, onProgress: p => text($("x-grade"), p.step === "transactions" ? `Reading transactions ${p.done}/${p.total}` : p.step === "neighbours" ? `Checking neighbouring wallets ${p.done}/${p.total}` : "Reading history…") });
    cls(text($("x-score"), `${r.score}/100`), r.score >= 50 ? -1 : 1);
    text($("x-grade"), `${r.grade} · read ${r.scanned} transactions. Private mode keeps new buys off this graph.`);
    const ul = $("x-list"); ul.textContent = "";
    for (const f of r.findings) { const li = make("li"), d = make("div"); d.append(make("div", "lab", `${f.k}: ${f.v}`), make("div", "muted", f.why)); li.append(d, make("span", f.sev === "high" || f.sev === "warn" ? "down" : "muted", f.sev)); ul.append(li); }
  } catch (e) { text($("x-grade"), errMsg(e)); }
  finally { btn.disabled = false; text(btn, "Trace again"); }
});

/* ---------- watchlist ---------- */
const watchlist = () => store.get("ardea-watchlist", []);
let watchPrices = {};
function renderStar() { const on = watchlist().some(w => w.mint === S.tokenMint); $("t-star").setAttribute("aria-pressed", on); $("t-star").setAttribute("aria-label", on ? "Remove from watchlist" : "Add to watchlist"); }
$("t-star").addEventListener("click", () => {
  const l = watchlist(), on = l.some(w => w.mint === S.tokenMint);
  store.set("ardea-watchlist", on ? l.filter(w => w.mint !== S.tokenMint) : [...l, { mint: S.tokenMint, symbol: symbolOf(S.tokenMint), icon: iconOf(S.tokenMint) }]);
  renderStar(); renderWatchbar(); refreshWatch();
});
function renderWatchbar() {
  const bar = $("watchbar"), l = watchlist(); bar.textContent = "";
  bar.append(make("span", "lab", "Watchlist"));
  if (!l.length) { bar.append(make("span", "muted mono", "Star a token to pin it here.")); return; }
  for (const w of l) {
    const a = make("a"); a.href = `#/token/${w.mint}`;
    const p = watchPrices[w.mint];
    a.append(icon(make("img"), w.icon || iconOf(w.mint), w.mint), make("b", "", w.symbol || short(w.mint)), make("span", "", p ? price(p.usdPrice) : ""), cls(make("span", "", p?.priceChange24h != null ? pct(p.priceChange24h) : ""), p?.priceChange24h));
    bar.append(a);
  }
}
async function refreshWatch() { const l = watchlist(); needMeta(l.filter(w => !w.icon).map(w => w.mint)); if (l.length) { try { watchPrices = await jup.prices(l.map(w => w.mint)); } catch (_) {} } renderWatchbar(); }

/* ---------- search ---------- */
const q = $("q"), results = $("results");
let searchTimer = 0, searchSeq = 0;
q.addEventListener("input", () => { clearTimeout(searchTimer); const v = q.value.trim(); if (!v) return closeResults(); if (isAddress(v)) { closeResults(); q.value = ""; location.hash = `#/token/${v}`; return; } searchTimer = setTimeout(() => search(v), 400); });
q.addEventListener("keydown", e => {
  const items = [...results.querySelectorAll("button")], i = items.findIndex(b => b.getAttribute("aria-selected") === "true");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]; items.forEach(b => b.setAttribute("aria-selected", b === n)); n && n.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "Enter") { e.preventDefault(); (items[i] || items[0])?.click(); }
  else if (e.key === "Escape") { closeResults(); q.blur(); }
});
document.addEventListener("click", e => { if (!e.target.closest(".search")) closeResults(); });
function closeResults() { results.hidden = true; q.setAttribute("aria-expanded", "false"); }
async function search(v) {
  const seq = ++searchSeq;
  results.textContent = ""; results.append(make("li", "note", "Searching…")); results.hidden = false; q.setAttribute("aria-expanded", "true");
  try {
    const list = (await jup.search(v) || []).filter(t => t && t.id && t.id !== SOL_MINT).slice(0, 12);
    if (seq !== searchSeq) return;
    results.textContent = "";
    if (!list.length) { results.append(make("li", "note", "No tokens found.")); return; }
    for (const t of list) {
      tokenInfo.set(t.id, t);
      const li = make("li"), b = make("button"), mid = make("div"), n2 = make("div", "num");
      b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", "false");
      const symEl = make("div", "sym", t.symbol || "?"); if (t.isVerified) { const v = svgIcon("verified", "vf"); symEl.append(v); symEl.title = "Verified on Jupiter"; }
      mid.append(symEl, make("div", "nm", `${t.name || ""} · ${short(t.id)}`));
      n2.append(make("div", "", price(t.usdPrice)), make("div", "", `MC ${usd(t.mcap)}`));
      b.append(icon(make("img", "tok-icon"), t.icon, t.id), mid, n2);
      b.addEventListener("click", () => { closeResults(); q.value = ""; location.hash = `#/token/${t.id}`; });
      li.append(b); results.append(li);
    }
  } catch (err) { if (seq === searchSeq) { results.textContent = ""; results.append(make("li", "note", errMsg(err))); } }
}

/* ---------- modals: wallet + settings ---------- */
const modal = $("modal");
function openModal(title, build) { text($("m-title"), title); const body = $("m-body"); body.textContent = ""; build(body); if (!modal.open) modal.showModal(); }
$("m-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });

function openWalletModal() {
  openModal("Wallet", body => {
    if (!S.wallet) {
      const list = providers();
      const box = make("div", "box");
      if (!list.length) {
        box.append(make("p", "", "No Solana wallet found in this browser."));
        [["Phantom", "https://phantom.com/download"], ["Solflare", "https://solflare.com/download"], ["Backpack", "https://backpack.app/downloads"]].forEach(([n, u]) => box.append(extLink(u, `Get ${n}`, "btn small")));
      } else list.forEach(w => { const b = make("button", "btn primary", `Connect ${w.name}`); b.type = "button"; b.addEventListener("click", async () => { try { await connect(w); openWalletModal(); } catch (e) { toast(errMsg(e), "err"); } }); box.append(b); });
      body.append(box);
      return;
    }
    // main
    const main = make("div", "box"), r1 = make("div", "row");
    r1.append(make("b", "", `${S.wallet.name} · ${short(S.wallet.pk)}`), make("span", "", `${S.sol != null ? fromRaw(S.sol, 9, 4) : "…"} SOL`));
    const r2 = make("div", "row"), copy = make("button", "btn small", "Copy address"), out = make("button", "btn small", "Disconnect"); copy.type = out.type = "button";
    copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(S.wallet.pk); toast("Address copied.", "ok"); } catch (_) {} });
    out.addEventListener("click", async () => { await disconnect(); modal.close(); });
    r2.append(copy, out);
    main.append(make("h3", "", "Main wallet"), r1, r2);
    // trade from
    const from = make("div", "box"), seg = make("div", "seg");
    for (const [w, label] of [["main", "Main · approve each trade"], ["instant", "Instant · no popups"]]) {
      const b = make("button", "", label); b.type = "button"; b.setAttribute("aria-pressed", settings.from === w);
      b.addEventListener("click", async () => { try { if (w === "instant") await instantWallet(); settings.from = w; saveSettings(); renderWalletBtn(); if (S.route === "token") { refreshTokenBal(); renderTradePanel(); } openWalletModal(); } catch (e) { toast(errMsg(e), "err"); } });
      seg.append(b);
    }
    from.append(make("h3", "", "Trade from"), seg, make("p", "", "Quick-buy buttons, presets and the trade panel use this wallet."));
    // instant
    const inst = make("div", "box");
    inst.append(iconLabel(make("h3", "with-ico"), "bolt", "Instant wallet"));
    if (!S.instant) {
      inst.append(make("p", "", "A trading wallet derived from one signature of your main wallet. Trades sign in this tab with no popups, like Axiom. Rebuild it on any device by signing again. Keep only what you're actively trading in it."));
      const u = make("button", "btn primary", "Unlock instant wallet"); u.type = "button";
      u.addEventListener("click", async () => { try { await instantWallet(); openWalletModal(); } catch (e) { toast(errMsg(e), "err"); } });
      inst.append(u);
    } else {
      const r = make("div", "row"); r.append(make("span", "", short(S.instant.pk)), make("b", "", `${S.instantSol != null ? fromRaw(S.instantSol, 9, 4) : "…"} SOL`)); inst.append(r);
      const dep = make("div", "row"), amtIn = make("input", "inp"); amtIn.placeholder = "SOL amount"; amtIn.inputMode = "decimal"; amtIn.setAttribute("aria-label", "Deposit amount in SOL");
      const dDirect = make("button", "btn small", "Deposit"), dPrivate = make("button", "btn small primary", "Deposit via Monero"); dDirect.type = dPrivate.type = "button";
      dep.append(amtIn, dDirect, dPrivate); inst.append(dep);
      const wd = make("div", "row"), wDirect = make("button", "btn small", "Withdraw all"), wPrivate = make("button", "btn small", "Withdraw via Monero"), key = make("button", "btn small", "Export key");
      wDirect.type = wPrivate.type = key.type = "button";
      wd.append(wDirect, wPrivate, key); inst.append(wd);
      const st = make("p", "", "A direct deposit links the two wallets on-chain. A deposit via Monero doesn't: it takes 10–40 minutes and costs the route's exchange and network fees.");
      inst.append(st);
      const busy = async (fn, btn) => { if (S.busy) return; S.busy = true; btn.disabled = true; try { await fn(m => text(st, m)); } catch (e) { text(st, errMsg(e)); toast(errMsg(e), "err"); } finally { S.busy = false; btn.disabled = false; await refreshBalances(); } };
      const amount = () => { const r2 = toRaw(amtIn.value, 9); if (!r2) throw new SwapError("Enter an amount to deposit."); return r2; };
      dDirect.addEventListener("click", () => busy(async say => {
        const a = amount(); checkTransfer(a); say("Approve the deposit in your wallet…");
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const sig = await signSend(fundingTx(web3, { from: S.wallet.pk, depositAddress: S.instant.pk, amount: a, blockhash }), { local: null }, lastValidBlockHeight);
        say("Deposited."); toast(`Deposited ${fromRaw(a, 9, 4)} SOL to your instant wallet.`, "ok", sig);
      }, dDirect));
      dPrivate.addEventListener("click", () => busy(async say => {
        const a = amount(); checkTransfer(a); say("Getting a Monero route…");
        const route = await routeQuote({ hd, token: await routeToken(), amount: a, from: S.wallet.pk, to: S.instant.pk });
        say(`Approve the deposit in your wallet. ≈${fromRaw(route.amountOut, 9, 4)} SOL arrives in ${route.etaMin ? `about ${route.etaMin} min` : "10–40 min"}.`);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const sig = await signSend(fundingTx(web3, { from: S.wallet.pk, depositAddress: route.depositAddress, amount: a, blockhash }), { local: null }, lastValidBlockHeight);
        S.busy = false;
        await waitForRoute(hd, route.id, { onStatus: label => say(`Monero route: ${label}…`) });
        say("Delivered."); toast(`≈${fromRaw(route.amountOut, 9, 4)} SOL arrived in your instant wallet through Monero.`, "ok", sig);
      }, dPrivate));
      const withdraw = (priv, btn) => busy(async say => {
        const bal = BigInt(await connection.getBalance(S.instant.kp.publicKey)), a = exitAmount(bal);
        if (a <= 0n) throw new SwapError("Nothing to withdraw.");
        let to = S.wallet.pk, route = null;
        if (priv) { say("Getting a Monero route home…"); route = await routeQuote({ hd, token: await routeToken(), amount: a, from: S.instant.pk, to: S.wallet.pk }); to = route.depositAddress; }
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const sig = await sendAndConfirm(connection, exitTx(web3, { stealth: S.instant.kp, depositAddress: to, amount: a, blockhash }), lastValidBlockHeight);
        if (route) { S.busy = false; await waitForRoute(hd, route.id, { onStatus: label => say(`Monero route: ${label}…`) }); }
        say("Withdrawn."); toast(`Withdrew ${priv ? `≈${fromRaw(route.amountOut, 9, 4)}` : fromRaw(a, 9, 4)} SOL to your main wallet${priv ? " through Monero" : ""}. Tokens stay in the instant wallet.`, "ok", sig);
      }, btn);
      wDirect.addEventListener("click", () => withdraw(false, wDirect));
      wPrivate.addEventListener("click", () => withdraw(true, wPrivate));
      key.addEventListener("click", () => { const old = inst.querySelector(".keybox"); if (old) return old.remove(); inst.append(make("div", "keybox", `Instant wallet secret key (import into Phantom or Solflare): ${base58Encode(S.instant.kp.secretKey)}`)); });
    }
    body.append(main, from, inst);
  });
}
$("walletbtn").addEventListener("click", openWalletModal);

$("settingsbtn").addEventListener("click", () => openModal("Settings", body => {
  const field = (label, value, attrs = {}) => { const l = make("label", "", label), i = make("input", "inp"); i.value = value; Object.assign(i, attrs); l.append(i); return [l, i]; };
  const qb = make("div", "box"); qb.append(make("h3", "", "Quick amounts"));
  const g1 = make("div", "grid"), buyIns = settings.buyAmounts.map((v, i) => { const [l, inp] = field(`Buy ${i + 1} (SOL)`, v, { inputMode: "decimal" }); g1.append(l); return inp; }); qb.append(g1);
  const g2 = make("div", "grid"), sellIns = settings.sellPcts.map((v, i) => { const [l, inp] = field(`Sell ${i + 1} (%)`, v, { inputMode: "numeric" }); g2.append(l); return inp; }); qb.append(g2);
  const pr = make("div", "box"); pr.append(make("h3", "", "Presets"), make("p", "", "Slippage, priority level, the most you'll pay for priority, and an optional Jito tip (at least 0.000001 SOL) for faster landing. MEV protect sends only through Jito, so the trade never touches the public mempool. P1–P3 switch in the trade panel or with keys 1–3."));
  const presetIns = settings.presets.map((p, i) => {
    const g = make("div", "grid");
    const [l1, s] = field(`P${i + 1} slippage %`, p.slippageBps / 100, { inputMode: "decimal" });
    const l2 = make("label", "", `P${i + 1} priority`), sel = make("select", "inp"); ["medium", "high", "veryHigh"].forEach(v => { const o = make("option", "", v === "veryHigh" ? "turbo" : v); o.value = v; o.selected = p.priority === v; sel.append(o); }); l2.append(sel);
    const [l3, m] = field(`P${i + 1} max priority SOL`, p.maxSol, { inputMode: "decimal" });
    const [l4, tip] = field(`P${i + 1} Jito tip SOL`, p.tipSol || 0, { inputMode: "decimal" });
    const l5 = make("label", "", `P${i + 1} MEV protect`), mev = make("input"); mev.type = "checkbox"; mev.checked = !!p.mev; l5.append(mev);
    g.append(l1, l2, l3, l4, l5); pr.append(g);
    return { s, sel, m, tip, mev };
  });
  const pulse = make("div", "box"); pulse.append(make("h3", "", "Pulse and autopilot"));
  const [lfs, fs] = field("Final Stretch starts at bonding curve %", settings.finalStretch, { inputMode: "numeric" }); pulse.append(lfs);
  const ag = make("div", "grid");
  const [lat, autoTpIn] = field("After a snipe: take profit at +% (sells half, 0 = off)", settings.autoTp || 0, { inputMode: "decimal" });
  const [las, autoSlIn] = field("After a snipe: stop loss at −% (0 = off)", settings.autoSl || 0, { inputMode: "decimal" });
  ag.append(lat, las); pulse.append(ag);
  const pv = make("div", "box"); pv.append(make("h3", "", "Private mode"), make("p", "", "Every private buy crosses Monero. Strong also waits a random 30 seconds to 3 minutes after the SOL lands before buying, so the buy doesn't line up with the delivery. Fast buys as soon as it lands."));
  const lpv = make("label", "", "Privacy strength"), pvSel = make("select", "inp"); [["strong", "Strong (random wait before buying)"], ["fast", "Fast (buy on arrival)"]].forEach(([v, t]) => { const o = make("option", "", t); o.value = v; o.selected = (settings.privacy || "strong") === v; pvSel.append(o); }); lpv.append(pvSel); pv.append(lpv);
  const net = make("div", "box"); net.append(make("h3", "", "Network"), make("p", "", "The public Solana RPC is rate limited. A Helius, Triton or QuickNode URL makes Pulse, trades and the tracker much faster. Reloads the page."));
  const [lrpc, rpcIn] = field("RPC URL", rpcUrl, { spellcheck: false }); net.append(lrpc);
  const save = make("button", "btn primary", "Save"); save.type = "button";
  save.addEventListener("click", () => {
    buyIns.forEach((inp, i) => { if (toRaw(inp.value, 9)) settings.buyAmounts[i] = inp.value.trim(); });
    sellIns.forEach((inp, i) => { const v = Math.round(Number(inp.value)); if (v > 0 && v <= 100) settings.sellPcts[i] = v; });
    presetIns.forEach((p, i) => { const s = Number(p.s.value), m = Number(p.m.value), tip = Number(p.tip.value); settings.presets[i] = { slippageBps: Math.round(Math.min(50, Math.max(0.1, s || 3)) * 100), priority: p.sel.value, maxSol: Math.min(0.1, Math.max(0, m || 0.001)), tipSol: tip > 0 ? Math.min(0.05, Math.max(0.000001, tip)) : 0, mev: p.mev.checked && tip > 0 }; });
    const tp = Number(autoTpIn.value), sl = Number(autoSlIn.value);
    settings.autoTp = tp > 0 ? Math.min(10000, tp) : 0; settings.autoSl = sl > 0 && sl < 100 ? sl : 0;
    const f = Number(fs.value); if (f >= 10 && f <= 99) settings.finalStretch = f;
    settings.privacy = pvSel.value;
    saveSettings();
    const newRpc = rpcIn.value.trim();
    if (newRpc !== rpcUrl && /^https?:\/\/\S+$/.test(newRpc)) { store.set("ardea-rpc-url", newRpc); location.reload(); return; }
    modal.close(); pulseDirty = true; renderPulse(true); if (S.route === "token") renderTradePanel();
    toast("Settings saved.", "ok");
  });
  body.append(qb, pr, pv, pulse, net, save);
}));

/* ---------- quick-buy amount + hotkeys ---------- */
$("qbamt").value = settings.quickBuy;
$("qbamt").addEventListener("input", () => {
  const v = $("qbamt").value.replace(/,/g, ".").replace(/[^\d.]/g, ""); $("qbamt").value = v;
  if (toRaw(v, 9)) { settings.quickBuy = v; saveSettings(); document.querySelectorAll(".qb").forEach(b => qbLabel(b, v)); }
});
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "") || modal.open;
  if (e.key === "/" && !typing) { e.preventDefault(); q.focus(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (S.route === "token") {
    if (e.key === "b") { $("side-buy").click(); amt.focus(); e.preventDefault(); }
    else if (e.key === "s") { $("side-sell").click(); amt.focus(); e.preventDefault(); }
    else if (["1", "2", "3"].includes(e.key)) { settings.preset = Number(e.key) - 1; saveSettings(); renderTradePanel(); }
  }
  if (e.key === "p") location.hash = "#/pulse";
  if (e.key === "a") location.hash = "#/";
});

/* ---------- boot ---------- */
refreshSolPrice(); setInterval(() => awake() && refreshSolPrice(), 60000);
setTimeout(enrich, 2000);
renderWatchbar(); refreshWatch(); setInterval(() => awake() && refreshWatch(), 30000);
pp = startPumpPortal(); seedPulse(); setTimeout(curveLoop, 1500); setTimeout(statsLoop, 4000);
setInterval(() => awake() && renderPulse(), 1000);
setInterval(() => { if (awake() && S.route === "token") renderTrades(); }, 5000);
if (tracked().length) startTracker();
updateAutoChip(); setInterval(autopilot, 4000);
route();
// Hidden: the token page's trade stream closes at once, the pump.fun stream after a minute unless a snipe
// is waiting on a migration. Visible again: both reopen, the board is back-filled from Jupiter, prices
// refresh and every parked loop restarts.
let ppIdle = 0;
function onHidden() {
  T.sub?.close(); T.sub = null;
  clearTimeout(ppIdle);
  ppIdle = setTimeout(() => {
    if (awake() || !pp || snipes().some(x => x.status === "armed")) return;
    pp.close(); pp = null; setStatusChip($("pp-status"), "paused", "pump.fun stream");
  }, 60000);
}
if (!awake()) onHidden(); // opened in a background tab
document.addEventListener("visibilitychange", () => {
  if (!awake()) return onHidden();
  clearTimeout(ppIdle);
  if (!pp) { pp = startPumpPortal(); seedPulse(); }
  if (S.route === "token" && S.tokenMint && !T.sub) openTradeStream(S.tokenMint);
  refreshSolPrice(); refreshWatch();
  const l = [...parked]; parked.clear(); l.forEach(f => f());
});
// reconnect silently if a wallet already trusts this site
for (const w of providers()) { if (w.p.isConnected || w.p.publicKey) { w.p.connect?.({ onlyIfTrusted: true }).then(() => connect(w)).catch(() => {}); break; } }
window.__ardea = { board, settings, S, T }; // handy for debugging from the console

/* ---------- status bar ---------- */
// Mirrors the stream chips, times a getSlot round trip to the RPC every 15 s while the tab is visible,
// and keeps a UTC clock. Nothing here sends anything a page view doesn't already send.
const sbCopy = (from, to, label) => { const d = from.querySelector(".dot"), t = to.querySelector(".dot"); if (d && t) t.className = d.className; to.lastChild.textContent = label; to.title = from.textContent.trim(); };
async function pingRpc() {
  if (!awake()) return;
  const el = $("sb-rpc"), t0 = performance.now();
  try {
    const slot = await connection.getSlot();
    const ms = Math.round(performance.now() - t0);
    el.className = `sb lat ${ms < 250 ? "ok" : ms < 700 ? "slow" : "bad"}`; el.lastChild.textContent = `${ms} ms`;
    $("sb-slot").lastChild.textContent = slot.toLocaleString("en-US");
  } catch (_) { el.className = "sb lat bad"; el.lastChild.textContent = "unreachable"; }
}
function tickStatus() {
  sbCopy($("pp-status"), $("sb-stream"), "Stream");
  sbCopy($("curve-status"), $("sb-curves"), "Curves");
  $("sb-sol").lastChild.textContent = S.solUsd ? `$${S.solUsd.toFixed(2)}` : "—";
  $("sb-clock").firstChild.textContent = new Date().toISOString().slice(11, 19);
}
["sb-rpc", "sb-slot", "sb-sol"].forEach(id => { const b = $(id).querySelector("b"); b.remove(); $(id).append(b); });
setInterval(tickStatus, 1000); tickStatus();
setInterval(pingRpc, 15000); pingRpc();

// X links stay hidden until the account exists (X_URL in config.js).
if (X_URL) document.querySelectorAll("[data-x]").forEach(a => { a.href = X_URL; a.hidden = false; });
