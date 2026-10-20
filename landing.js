// Landing page: the code-drawn art (art.js), the diagrams, and the read-only Trail audit.
import { trace, isAddress, short, DEFAULT_RPC as PUBLIC_RPC } from "./trace.js";
import { RPC_URL, PROXY_URL, FEE_BPS, TOKEN_CA } from "./config.js";
const DEFAULT_RPC = PROXY_URL ? `${PROXY_URL.replace(/\/$/, "")}/rpc` : RPC_URL || PUBLIC_RPC;
import { C, REDUCE, renderGlyphs, renderIcons, hero } from "./art.js";
import { renderDiagrams } from "./diagrams.js";
import { X_URL } from "./config.js";

renderGlyphs(document);
renderIcons(document);
hero(document.getElementById("seal"));
renderDiagrams(document);
document.querySelectorAll("[data-cfg=fee]").forEach(n => { n.textContent = `${FEE_BPS / 100}%`; });

/* ---------- Trail audit canvas ---------- */
// The wallet sits at left as a dial; what trackers link to it hangs on an arc to the right, joined by
// fine curves that carry a brass tick along the way funds moved. Exchanges are drawn in red.
const idle = () => ({ graph: { nodes: [{ id: "you", kind: "you", label: "YOU" }], edges: [] } });
const $ = id => document.getElementById(id);
const cv = $("tr-canvas"), ctx = cv.getContext("2d");
const G = { W: 0, H: 0, nodes: [], edges: [], you: { x: 0, y: 0 }, phase: "done", result: idle(), start: 0, frac: 0, shown: 0, born: 0 };
const RAD = { you: 22, exchange: 15, funder: 13, linked: 10, deposit: 7, siblings: 6 };
const RING = { funder: 0, siblings: 1, exchange: 2, linked: 3 };
const COL = k => k === "exchange" ? C.DOWN : k === "deposit" || k === "siblings" ? C.MUTE : k === "you" ? C.BRASS : C.IVORY;

function layout() {
  const { W, H } = G;
  if (!W) return;
  const s = Math.min(1, W / 480), you = G.you = { x: Math.max(48, W * .18), y: H * .52 };
  const g = G.result.graph, pos = new Map(), nodes = [];
  pos.set(g.nodes.find(n => n.kind === "you").id, you);
  const ring = g.nodes.filter(n => n.kind in RING).sort((a, b) => RING[a.kind] - RING[b.kind]);
  const rx = W - you.x - 56 * s, ry = H * .36;
  ring.forEach((n, i) => {
    const a = ring.length === 1 ? 0 : -1 + 2 * i / (ring.length - 1);
    pos.set(n.id, { x: you.x + Math.cos(a) * rx, y: you.y + Math.sin(a) * ry });
  });
  // a deposit address sits on the way to the exchange it sweeps into
  for (const n of g.nodes.filter(n => n.kind === "deposit")) {
    const e = g.edges.find(e => e.a === n.id && pos.has(e.b)), to = e ? pos.get(e.b) : { x: you.x + rx * .6, y: you.y };
    pos.set(n.id, { x: you.x + (to.x - you.x) * .5, y: you.y + (to.y - you.y) * .5 - 18 * s });
  }
  for (const n of g.nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const r = (n.kind === "linked" ? RAD.linked + Math.min(4, Math.max(0, (n.weight || 3) - 3)) : RAD[n.kind] || 12) * (n.kind === "you" ? 1 : s);
    nodes.push({ ...p, r, kind: n.kind, label: n.label, n: n.kind === "siblings" ? Math.min(7, n.weight || 3) : 0, d: nodes.length * .08 });
  }
  G.nodes = nodes;
  G.edges = [];
  for (const e of g.edges) {
    const A = pos.get(e.a), B = pos.get(e.b);
    if (!A || !B) continue;
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, nx = -(B.y - A.y), ny = B.x - A.x, L = Math.hypot(nx, ny) || 1;
    G.edges.push({ A, B, c: { x: mx + nx / L * 18, y: my + ny / L * 18 }, ph: (G.edges.length * .37) % 1 });
  }
}
const qpt = (e, t) => ({ x: (1 - t) ** 2 * e.A.x + 2 * (1 - t) * t * e.c.x + t * t * e.B.x, y: (1 - t) ** 2 * e.A.y + 2 * (1 - t) * t * e.c.y + t * t * e.B.y });

let running = false, visible = true;
function frame(now) {
  running = false;
  if (!visible || document.hidden) return;
  const { W, H } = G, t = REDUCE ? 2 : now / 1000, tracing = G.phase === "tracing", age = REDUCE ? 9 : (now - G.born) / 1000;
  ctx.clearRect(0, 0, W, H);
  // edges, each carrying a brass tick along the way funds moved
  for (const e of G.edges) {
    ctx.strokeStyle = C.STEEL; ctx.lineWidth = 1; ctx.globalAlpha = Math.min(1, age * 2) * .9;
    ctx.beginPath(); ctx.moveTo(e.A.x, e.A.y); ctx.quadraticCurveTo(e.c.x, e.c.y, e.B.x, e.B.y); ctx.stroke();
    if (!REDUCE) { const p = qpt(e, (t * .35 + e.ph) % 1); ctx.fillStyle = C.BRASS; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y - 3.5); ctx.lineTo(p.x + 3.5, p.y); ctx.lineTo(p.x, p.y + 3.5); ctx.lineTo(p.x - 3.5, p.y); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  // nodes: engraved rings that open in one by one
  for (const n of G.nodes) {
    const k = Math.max(0, Math.min(1, (age - n.d) / .5)), e = 1 - (1 - k) ** 3, col = COL(n.kind);
    if (!e) continue;
    const ringAt = (x, y, r) => {
      ctx.globalAlpha = e; ctx.fillStyle = C.BG; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.lineWidth = 1; ctx.globalAlpha = e * .55; ctx.beginPath(); ctx.arc(x, y, r * .62, 0, 6.283); ctx.stroke(); ctx.globalAlpha = e;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, r * .16), 0, 6.283); ctx.fill();
    };
    if (n.kind === "siblings") for (let i = 0; i < n.n; i++) { const a = i / n.n * 6.283 - 1.57; ringAt(n.x + Math.cos(a) * 14, n.y + Math.sin(a) * 11, n.r); }
    else ringAt(n.x, n.y, n.r * e);
    if (n.kind === "you") {
      // the dial's broken outer ring turns while a read runs
      const a = tracing && !REDUCE ? t * 2.4 : -.8;
      ctx.strokeStyle = C.BRASS; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 7, a + .5, a + 6.283 - .5); ctx.stroke();
    }
    ctx.font = "500 9px 'IBM Plex Mono', monospace"; ctx.textAlign = "center"; ctx.fillStyle = n.kind === "exchange" ? C.DOWN : C.MUTE;
    if (!tracing) { const w = ctx.measureText(n.label).width / 2 + 4, ly = n.kind === "deposit" ? n.y - n.r - 7 : n.y + n.r + (n.kind === "siblings" ? 24 : n.kind === "you" ? 22 : 13); ctx.fillText(n.label, Math.min(W - w, Math.max(w, n.x)), Math.min(H - 4, ly)); }
  }
  ctx.globalAlpha = 1;
  // while reading, a sweep ring runs out from the wallet
  if (tracing && !REDUCE) { const max = Math.hypot(W, H) * .6, r = ((now - G.start) / 1400 % 1) * max; ctx.strokeStyle = C.BRASS; ctx.globalAlpha = .5 * (1 - r / max); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(G.you.x, G.you.y, r, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
  // readout
  ctx.textAlign = "left"; ctx.fillStyle = C.MUTE; ctx.font = "500 9px 'IBM Plex Mono', monospace";
  ctx.fillText(tracing ? "READING" : "EXPOSURE", 14, 20);
  ctx.font = "400 36px 'Cormorant Garamond', Georgia, serif";
  if (tracing) { ctx.fillStyle = C.IVORY; ctx.fillText(`${Math.round(G.frac * 100)}%`, 14, 52); }
  else if (G.result.score !== undefined) {
    G.shown += (G.result.score - G.shown) * (REDUCE ? 1 : .08);
    if (Math.abs(G.result.score - G.shown) < .5) G.shown = G.result.score;
    ctx.fillStyle = G.result.score >= 50 ? C.DOWN : G.result.score >= 25 ? C.BRASS : C.UP;
    ctx.fillText(String(Math.round(G.shown)), 14, 52);
    ctx.font = "500 9px 'IBM Plex Mono', monospace"; ctx.fillStyle = C.MUTE;
    ctx.fillText(`/100 · ${G.result.grade.toUpperCase()}`, 14, 68);
  } else { ctx.fillStyle = C.LINE; ctx.fillText("—", 14, 52); }
  if (!REDUCE) kick();
}
function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }
function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  G.W = r.width; G.H = r.height; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout(); kick();
}
new ResizeObserver(resize).observe(cv);
new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }).observe(cv);
document.addEventListener("visibilitychange", kick);
document.fonts?.ready.then(kick);

/* ---------- UI state ---------- */
const form = $("tr-form"), addrIn = $("tr-addr"), go = $("tr-go"), chip = $("tr-chip"), list = $("tr-fields"), meta = $("tr-meta");
const copyBtn = $("tr-copy"), rpcIn = $("tr-rpc");
const pad = n => String(n).padStart(2, "0");

function setChip(text, cls) { chip.textContent = text; chip.className = "chip " + cls; }
function setMeta(parts) { meta.textContent = ""; parts.forEach(p => { if (typeof p === "string") meta.append(p); else { const b = document.createElement("b"); b.textContent = p.b; meta.append(b); } }); }
function note(text) { list.textContent = ""; const li = document.createElement("li"); li.className = "empty"; li.textContent = text; list.appendChild(li); }

function renderFindings(fs) {
  list.textContent = "";
  for (const f of fs) {
    const li = document.createElement("li");
    li.className = "sev-" + f.sev;
    for (const [c, t] of [["k", f.k], ["v", f.v], ["g", f.sev === "warn" ? "Warning" : f.g], ["why", f.why]]) {
      const s = document.createElement("span"); s.className = c; s.textContent = t; li.appendChild(s);
    }
    list.appendChild(li);
  }
}

function renderHours(h, name) {
  const host = $("hours"), max = Math.max(1, ...h.histogram);
  host.textContent = "";
  h.histogram.forEach((n, i) => {
    const col = document.createElement("div"), bw = document.createElement("div"), bar = document.createElement("div"), lab = document.createElement("div");
    col.className = "col" + (h.zone && (i - h.quietStart + 24) % 24 < 7 ? " q" : "");
    col.title = `${pad(i)}:00 UTC · ${n} signed`;
    bw.className = "bw"; bar.className = "bar"; bar.style.height = `${(n/max*100).toFixed(1)}%`;
    lab.className = "h"; lab.textContent = i % 3 ? "" : pad(i);
    bw.appendChild(bar); col.append(bw, lab); host.appendChild(col);
  });
  $("hr-name").textContent = name;
  $("hr-zone").textContent = h.zone ? `Quiet ${pad(h.quietStart)}:00–${pad((h.quietStart + 7) % 24)}:00 UTC → ${h.zone}` : "Not enough signed transactions to place a time zone";
}

function show(res) {
  G.result = res; G.phase = "done"; G.shown = 0; G.born = performance.now();
  layout(); kick();
  renderFindings(res.findings);
  renderHours(res.hours, short(res.address));
  setChip(`${res.grade} · ${res.score}`, res.score >= 50 ? "leak" : res.score >= 25 ? "" : "clean");
  setMeta([{ b: short(res.address) }, ` · read ${res.scanned} of ${res.signatureCount}${res.reachedStart ? "" : "+"} transactions${res.reachedStart ? ", back to its first" : ". Its first transactions are older than this window"}.`]);
  copyBtn.disabled = false;
}
// Nothing traced yet: a lone wallet on the lattice, an empty hours strip.
function ready() {
  G.result = idle(); G.phase = "done";
  layout(); kick();
  note("Findings appear here: funding source, exchange links, linked wallets, signing hours, poisoning attempts.");
  renderHours({ histogram: Array(24).fill(0) }, "the wallet you audit");
  $("hr-zone").textContent = "";
  setChip("Ready", "");
  setMeta(["Paste any address. Your browser reads the public chain; nothing is stored about what you look up."]);
  copyBtn.disabled = true;
}

const RPC_KEY = "ardea-rpc";
try { rpcIn.value = localStorage.getItem(RPC_KEY) || DEFAULT_RPC; } catch (_) { rpcIn.value = DEFAULT_RPC; }
rpcIn.addEventListener("change", () => { try { localStorage.setItem(RPC_KEY, rpcIn.value.trim()); } catch (_) {} });
const rpcUrl = () => /^https?:\/\/\S+$/.test(rpcIn.value.trim()) ? rpcIn.value.trim() : DEFAULT_RPC;

function progress(p) {
  if (p.step === "history") { G.frac = .05; setMeta(["Reading the wallet's history…"]); }
  else if (p.step === "transactions") { G.frac = .1 + .7*p.done/Math.max(1, p.total); setMeta([`Reading transactions ${p.done}/${p.total}`]); }
  else if (p.step === "neighbours") { G.frac = .8 + .2*p.done/Math.max(1, p.total); setMeta([`Checking neighbouring wallets ${p.done}/${p.total}`]); }
}

let busy = false;
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (busy) return;
  const a = addrIn.value.trim();
  if (!isAddress(a)) {
    setChip("Not an address", "");
    setMeta(["Paste a Solana wallet address: 32 to 44 letters and numbers, like ", { b: "5tzF…uAi9" }, "."]);
    addrIn.focus();
    return;
  }
  busy = true; go.disabled = copyBtn.disabled = true;
  G.result = { address: a, graph: { nodes: [{ id: a, kind: "you", label: "YOU" }], edges: [] } };
  G.phase = "tracing"; G.start = performance.now(); G.frac = 0; G.born = performance.now();
  layout(); kick();
  note("Reading public history…");
  setChip("Reading…", "");
  try {
    show(await trace(a, { url: rpcUrl(), onProgress: progress }));
  } catch (err) {
    G.phase = "done";
    setChip("Can't read", "");
    setMeta([err && err.message ? err.message : "Something went wrong reading the chain."]);
    note("No result. Check the address and the RPC node, then try again.");
  } finally { busy = false; go.disabled = false; }
});

// Shareable summary. Addresses are masked so a copied result doesn't link wallets for anyone.
copyBtn.addEventListener("click", async () => {
  const r = G.result;
  if (!r || !r.findings) return;
  const mask = s => s.replace(/[1-9A-HJ-NP-Za-km-z]{4,8}…[1-9A-HJ-NP-Za-km-z]{4}/g, "••••");
  const text = [`My Solana wallet exposure (Ardea trail audit): ${r.score}/100 (${r.grade})`, ...r.findings.map(f => `· ${f.k}: ${mask(f.v)}`), location.href.split("#")[0]].join("\n");
  try { await navigator.clipboard.writeText(text); setMeta(["Copied. Wallet addresses are masked."]); }
  catch (_) { setMeta(["Couldn't reach the clipboard in this view."]); }
});

/* ---------- token contract address ---------- */
// TOKEN_CA is set in config.js, so the address shows from the first second; the server's /env.js can override it.
const ca = $("ca");
(async () => {
  let env = {};
  try { env = await import(PROXY_URL ? `${PROXY_URL.replace(/\/$/, "")}/env.js` : "./env.js"); }
  catch (_) { try { env = await import("./env.js"); } catch (_) {} }
  const addr = isAddress(env.TOKEN_CA || "") ? env.TOKEN_CA : isAddress(TOKEN_CA || "") ? TOKEN_CA : "";
  if (!addr) return;
  $("ca-v").textContent = addr;
  $("ca-trade").href = `./app.html#/token/${addr}`; $("ca-trade").hidden = false;
  ca.disabled = false;
  ca.setAttribute("aria-label", `Copy contract address ${addr}`);
  let reset;
  ca.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(addr); }
    catch (_) { const t = document.createElement("textarea"); t.value = addr; t.style.cssText = "position:fixed;opacity:0"; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
    $("ca-go").textContent = "Copied"; ca.classList.add("copied");
    clearTimeout(reset); reset = setTimeout(() => { $("ca-go").textContent = "Copy"; ca.classList.remove("copied"); }, 1600);
  });
})();

/* ---------- live proof strip ---------- */
// Ardea's own daily proof route, from /proof.json: whether one is crossing Monero now, how the last one went, and
// public links to track it and to the two proof wallets on Solscan. It says nothing about any user.
(async () => {
  const bar = $("ticker"), track = $("tk-track");
  if (!bar) return;
  const top = document.querySelector(".top");
  if (top) document.documentElement.style.setProperty("--top-h", `${top.offsetHeight}px`);
  let st;
  try { st = await (await fetch(`${(PROXY_URL || "").replace(/\/$/, "")}/proof.json`)).json(); } catch (_) { return; }
  if (!st || !st.enabled || st.wallets?.length !== 2) return;
  const short = a => `${a.slice(0, 4)}…${a.slice(-4)}`, items = [];
  const item = (...parts) => { const s = document.createElement("span"); s.className = "tk-item"; s.append(document.createElement("i"), ...parts); items.push(s); };
  const a = (href, label) => { const l = document.createElement("a"); l.href = href; l.textContent = label; if (/^https?:/.test(href)) { l.target = "_blank"; l.rel = "noopener"; } return l; };
  const b = t => { const e = document.createElement("b"); e.textContent = t; return e; };
  const r = st.last;
  if (r && r.routeId && !r.delivered && !r.error) item("Proof route crossing Monero now · ", b(`${r.amountSol} SOL`), " · ", a(`./track.html#${r.routeId}`, "track it live →"));
  else if (r && r.delivered) item("Last proof route delivered · ", b(`${r.amountSol} → ≈${r.amountOutSol} SOL`), " through Monero", r.routeId ? " · " : "", ...(r.routeId ? [a(`./track.html#${r.routeId}`, "see the route →")] : []));
  item("Proof wallets ", a(`https://solscan.io/account/${st.wallets[0]}`, short(st.wallets[0])), " ⇄ ", a(`https://solscan.io/account/${st.wallets[1]}`, short(st.wallets[1])), " · never a direct transfer between them");
  item("A real Monero route every day at ", b(`${String(st.utcHour).padStart(2, "0")}:00 UTC`), " · ", a("./docs.html#proof", "all proof →"));
  item("Track any Ardea route from its link · ", a("./track.html", "route tracker →"));
  // twice, so the scroll loops without a gap
  track.append(...items, ...items.map(n => n.cloneNode(true)));
  bar.hidden = false;
})();

/* ---------- background particles ---------- */
// A few dozen tiny orange specks drifting slowly upward behind the page, each fading in and out on its own beat.
// One fixed canvas, about 1 per 30,000 px² of screen; off with reduced motion, paused while the tab is hidden.
if (!REDUCE) {
  const cv = document.createElement("canvas"), cx = cv.getContext("2d");
  cv.setAttribute("aria-hidden", "true");
  cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none";
  document.body.prepend(cv);
  let W = 0, H = 0, dots = [];
  const spawn = (y = Math.random() * H) => ({ x: Math.random() * W, y, r: .5 + Math.random() * 1.3, vy: 4 + Math.random() * 10, vx: (Math.random() - .5) * 4, a: .12 + Math.random() * .38, ph: Math.random() * Math.PI * 2, tw: .3 + Math.random() * .7 });
  const size = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(70, W * H / 30000));
    while (dots.length < n) dots.push(spawn());
    dots.length = n;
  };
  size(); addEventListener("resize", size);
  let last = performance.now();
  const tick = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!document.hidden) {
      cx.clearRect(0, 0, W, H);
      for (const d of dots) {
        d.y -= d.vy * dt; d.x += d.vx * dt;
        if (d.y < -4 || d.x < -4 || d.x > W + 4) Object.assign(d, spawn(H + 4));
        const alpha = d.a * (.55 + .45 * Math.sin(now / 1000 * d.tw + d.ph));
        cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        cx.fillStyle = `rgba(255,${102 + Math.round(d.r * 30)},${Math.round(d.r * 20)},${alpha.toFixed(3)})`;
        cx.shadowColor = "rgba(255,102,0,.6)"; cx.shadowBlur = d.r * 4;
        cx.fill();
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- boot ---------- */
ready();

// X links stay hidden until the account exists (X_URL in config.js).
if (X_URL) document.querySelectorAll("[data-x]").forEach(a => { a.href = X_URL; a.hidden = false; });
