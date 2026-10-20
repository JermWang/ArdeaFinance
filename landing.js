// Landing page: the code-drawn art (art.js), the diagrams, the contract row, the live proof strip and the particles.
import { isAddress } from "./trace.js";
import { PROXY_URL, FEE_BPS, TOKEN_CA } from "./config.js";
import { REDUCE, renderGlyphs, renderIcons, hero } from "./art.js";
import { renderDiagrams } from "./diagrams.js";
import { X_URL } from "./config.js";

renderGlyphs(document);
renderIcons(document);
hero(document.getElementById("seal"));
renderDiagrams(document);
document.querySelectorAll("[data-cfg=fee]").forEach(n => { n.textContent = `${FEE_BPS / 100}%`; });

const $ = id => document.getElementById(id);

/* ---------- token contract address ---------- */
// TOKEN_CA is set in config.js, so the address shows from the first second; the server's /env.js can override it.
const ca = $("ca");
// The server serves the address only once the mint exists on-chain, so until launch this checks again every 20 s
// and the address appears for visitors already on the page, with no reload.
(async function showCa() {
  let env = {};
  try { env = await import(`${PROXY_URL ? `${PROXY_URL.replace(/\/$/, "")}/env.js` : "./env.js"}?t=${Date.now()}`); }
  catch (_) { try { env = await import("./env.js"); } catch (_) {} }
  const addr = isAddress(env.TOKEN_CA || "") ? env.TOKEN_CA : isAddress(TOKEN_CA || "") ? TOKEN_CA : "";
  if (!addr) { setTimeout(showCa, 20000); return; }
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
  item("A real Monero route ", b(st.everyHours ? `every ${st.everyHours} h` : `every day at ${String(st.utcHour).padStart(2, "0")}:00 UTC`), " · ", a("/proof", "all proof →"));
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


// X links stay hidden until the account exists (X_URL in config.js).
if (X_URL) document.querySelectorAll("[data-x]").forEach(a => { a.href = X_URL; a.hidden = false; });
