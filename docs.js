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
  // continuous proof: the server only says which two wallets; their history comes straight from the chain
  const live = document.getElementById("proof-live");
  if (live) (async () => {
    const base = (PROXY_URL || "").replace(/\/$/, "");
    const rpc = async (method, params) => (await (await fetch(`${base}/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
    const say = t => { live.textContent = ""; const p = document.createElement("p"); p.textContent = t; live.append(p); };
    try {
      const st = await (await fetch(`${base}/proof.json`)).json();
      if (!st.enabled || st.wallets.length !== 2) return say("The daily proof route isn't running yet. It starts before launch; this table fills in from the chain once it does.");
      const [A, B] = st.wallets, name = w => w === A ? "Proof A" : "Proof B", rows = [];
      for (const w of [A, B]) {
        const sigs = (await rpc("getSignaturesForAddress", [w, { limit: 12 }])) || [];
        for (const s of sigs) {
          const tx = await rpc("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
          if (!tx || tx.meta?.err) continue;
          const keys = tx.transaction.message.accountKeys.map(k => k.pubkey || k), i = keys.indexOf(w);
          const delta = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9;
          // the other side: whichever account moved the most SOL the opposite way
          let other = "", best = 0;
          keys.forEach((k, j) => { const d = tx.meta.postBalances[j] - tx.meta.preBalances[j]; if (j !== i && Math.sign(d) === -Math.sign(delta) && Math.abs(d) > best) { best = Math.abs(d); other = k; } });
          rows.push({ w, sig: s.signature, time: (s.blockTime || 0) * 1000, delta, other });
        }
      }
      // Proof A doubles as the treasury, so it also receives small fee payments; only route-sized legs (≥ 0.05 SOL) are shown
      for (let i = rows.length - 1; i >= 0; i--) if (Math.abs(rows[i].delta) < 0.05) rows.splice(i, 1);
      rows.sort((a, b) => b.time - a.time);
      const direct = rows.filter(r => r.other === (r.w === A ? B : A)).length;
      live.textContent = "";
      const head = document.createElement("p");
      head.innerHTML = `<b>Proof A</b> <a target="_blank" rel="noopener" href="https://solscan.io/account/${A}">${A.slice(0, 6)}…${A.slice(-4)}</a> · <b>Proof B</b> <a target="_blank" rel="noopener" href="https://solscan.io/account/${B}">${B.slice(0, 6)}…${B.slice(-4)}</a> · ${st.amountSol} SOL ${st.everyHours ? `every ${st.everyHours} h` : `daily at ${st.utcHour}:00 UTC`} · <b>direct transfers between them: ${direct}</b>${st.last?.routeId ? ` · <a href="./track.html#${encodeURIComponent(st.last.routeId)}">track the latest route live</a>` : ""}`;
      const t = document.createElement("table"), tb = t.createTBody();
      t.createTHead().innerHTML = "<tr><th>When (UTC)</th><th>Wallet</th><th>SOL</th><th>Other side</th><th>Transaction</th></tr>";
      for (const r of rows.slice(0, 16)) {
        const tr = tb.insertRow();
        tr.insertCell().textContent = r.time ? new Date(r.time).toISOString().slice(0, 16).replace("T", " ") : "—";
        tr.insertCell().textContent = name(r.w);
        tr.insertCell().textContent = `${r.delta > 0 ? "+" : ""}${r.delta.toFixed(4)}`;
        tr.insertCell().textContent = r.other === A || r.other === B ? name(r.other) : r.other ? `${r.other.slice(0, 6)}…${r.other.slice(-4)}` : "—";
        const a = document.createElement("a"); a.href = `https://solscan.io/tx/${r.sig}`; a.target = "_blank"; a.rel = "noopener"; a.textContent = `${r.sig.slice(0, 8)}…`; tr.insertCell().append(a);
      }
      const wrap = document.createElement("div"); wrap.className = "tbl"; wrap.append(t);
      live.append(head, rows.length ? wrap : Object.assign(document.createElement("p"), { textContent: "No transactions yet: the first route runs at the next scheduled hour." }));
    } catch (e) { say(`Couldn't read the proof wallets right now (${e.message}).`); }
  })();

  const repo = document.getElementById("proof-repo");
  if (repo && SOURCE_REPO) { repo.append(" The full source is public on "); const a = document.createElement("a"); a.href = SOURCE_REPO; a.target = "_blank"; a.rel = "noopener"; a.textContent = "GitHub"; repo.append(a, "."); }
}

// X links stay hidden until the account exists (X_URL in config.js).
if (X_URL) document.querySelectorAll("[data-x]").forEach(a => { a.href = X_URL; a.hidden = false; });
