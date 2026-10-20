// Docs page: line glyphs, engraved illustrations and diagrams, and a contents list that follows the reader.
import { renderGlyphs, renderIcons } from "./art.js";
import { renderDiagrams } from "./diagrams.js";
import { FEE_BPS, STEALTH_MAX_SOL } from "./config.js";

renderGlyphs(document);
renderIcons(document);
renderDiagrams(document);
// diagrams wider than a phone scroll sideways; start them centred
document.querySelectorAll(".fig .art").forEach(a => { if (a.scrollWidth > a.clientWidth) a.scrollLeft = (a.scrollWidth - a.clientWidth) / 2; });

// label each cell of a wide table with its column header, for the stacked phone layout
document.querySelectorAll(".tbl table").forEach(t => {
  const th = [...t.querySelectorAll("thead th")].map(h => h.textContent.trim());
  t.classList.toggle("stack", th.length > 2);
  t.querySelectorAll("tbody tr").forEach(r => [...r.cells].forEach((c, i) => { if (th[i]) c.dataset.th = th[i]; }));
});

// live values from config.js, so the docs never drift from what the terminal does
document.querySelectorAll("[data-cfg]").forEach(n => {
  const v = { fee: `${FEE_BPS / 100}%`, stealthMax: `${STEALTH_MAX_SOL} SOL` }[n.dataset.cfg];
  if (v) n.textContent = v;
});

// highlight the section being read
const links = new Map([...document.querySelectorAll(".toc a")].map(a => [a.getAttribute("href").slice(1), a]));
const io = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) {
    links.forEach(a => a.removeAttribute("aria-current"));
    const a = links.get(e.target.id);
    if (a) { a.setAttribute("aria-current", "true"); const bar = a.closest(".toc"); if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" }); }
  }
}, { rootMargin: "-20% 0px -70% 0px" });
document.querySelectorAll("article section[id]").forEach(s => io.observe(s));

/* ---------- proof ---------- */
import { PROXY_URL, PROOF_TXS, SOURCE_REPO } from "./config.js";
import { houdini, SOL_QUERY, solTokenId } from "./stealth.js";
import { X_URL } from "./config.js";
{
  const out = document.getElementById("proof-out"), btn = document.getElementById("proof-run");
  const hd = houdini({ base: PROXY_URL ? `${PROXY_URL.replace(/\/$/, "")}/houdini` : "" });
  const line = (k, v) => { const b = document.createElement("b"); b.textContent = k; out.append(b, ` ${v}\n`); };
  // the same calls a private buy makes, minus opening the order: find SOL, then quote SOL → XMR → SOL
  btn?.addEventListener("click", async () => {
    btn.disabled = true; out.hidden = false; out.textContent = "Asking Houdini for a Monero route…\n";
    try {
      const token = solTokenId(await hd.tokens(SOL_QUERY)), amount = 0.5;
      const t0 = performance.now(), { quotes = [] } = (await hd.quote({ token, amount, useXmr: true })) || {};
      const ms = Math.round(performance.now() - t0), priv = quotes.filter(q => q && q.quoteId && !q.error && (!q.type || q.type === "private"));
      const best = priv.sort((a, b) => Number(b.amountOut) - Number(a.amountOut))[0];
      out.textContent = "";
      line("GET", "api-partner.houdiniswap.com/v2/quotes/private-send (via the Ardea gateway, quote only, no order)");
      line("answered in", `${ms} ms`);
      line("route", `SOL → XMR → SOL, Monero forced as the bridge (useXmr=true), ${amount} SOL in`);
      line("private quotes", String(priv.length));
      if (best) {
        line("best route", `${best.swap || "private"} (quote ${best.quoteId})`);
        line("SOL out", `${Number(best.amountOut).toFixed(6)} SOL (after both exchange hops, network fees and Houdini's commission)`);
        if (best.duration) line("route time", `about ${Math.round(best.duration)} min`);
      } else {
        const lim = quotes.find(q => q && (q.min || q.max)) || {};
        line("no private route", lim.min ? `the minimum right now is ${lim.min} SOL` : "none available at this moment, so a private buy would stop without sending anything");
      }
      line("checked at", new Date().toISOString());
    } catch (e) { out.textContent = `Couldn't reach the Monero route: ${e.message}`; }
    btn.disabled = false;
  });
  const tb = document.querySelector("#proof-txs tbody");
  if (tb) {
    if (!PROOF_TXS.length) { const tr = tb.insertRow(), td = tr.insertCell(); td.colSpan = 3; td.textContent = "The first public private-mode transactions are being added here; until then, the live route check above and the code below are verifiable."; }
    for (const t of PROOF_TXS) { const tr = tb.insertRow(); tr.insertCell().textContent = t.step; tr.insertCell().textContent = t.note || ""; const a = document.createElement("a"); a.href = `https://solscan.io/tx/${t.sig}`; a.target = "_blank"; a.rel = "noopener"; a.textContent = `${t.sig.slice(0, 8)}…${t.sig.slice(-6)}`; tr.insertCell().append(a); }
  }
  const repo = document.getElementById("proof-repo");
  if (repo && SOURCE_REPO) { repo.append(" The full source is public on "); const a = document.createElement("a"); a.href = SOURCE_REPO; a.target = "_blank"; a.rel = "noopener"; a.textContent = "GitHub"; repo.append(a, "."); }
}

// X links stay hidden until the account exists (X_URL in config.js).
if (X_URL) document.querySelectorAll("[data-x]").forEach(a => { a.href = X_URL; a.hidden = false; });
