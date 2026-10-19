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
import { PROXY_URL, PROOF_TXS, SOURCE_REPO, TREASURY, FEE_BPS as FEE } from "./config.js";
{
  const base = `${(PROXY_URL || "").replace(/\/$/, "")}/1click`, out = document.getElementById("proof-out"), btn = document.getElementById("proof-run");
  const b58hex = s => { const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); return n.toString(16).padStart(64, "0"); };
  const b58 = bytes => { const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; let n = 0n; for (const x of bytes) n = n * 256n + BigInt(x); let s = ""; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const x of bytes) { if (x) break; s = "1" + s; } return s; };
  const line = (k, v) => { const b = document.createElement("b"); b.textContent = k; out.append(b, ` ${v}\n`); };
  btn?.addEventListener("click", async () => {
    btn.disabled = true; out.hidden = false; out.textContent = "Asking NEAR Intents…\n";
    try {
      const tokens = await (await fetch(`${base}/v0/tokens`)).json();
      const sol = tokens.find(t => t.blockchain === "sol" && t.symbol === "SOL" && !t.contractAddress)?.assetId || "nep141:sol.omft.near";
      const req = { dry: true, swapType: "EXACT_INPUT", slippageTolerance: 100, originAsset: sol, depositType: "ORIGIN_CHAIN", destinationAsset: sol,
        amount: "100000000", refundTo: TREASURY, refundType: "ORIGIN_CHAIN", recipient: b58(crypto.getRandomValues(new Uint8Array(32))), recipientType: "DESTINATION_CHAIN",
        deadline: new Date(Date.now() + 1800e3).toISOString(), confidentiality: "advanced", referral: "privatus", appFees: [{ recipient: b58hex(TREASURY), fee: FEE }] };
      const t0 = performance.now(), res = await fetch(`${base}/v0/quote`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
      const body = await res.json(), q = body.quote || {};
      out.textContent = "";
      line("POST", "1click.chaindefuser.com/v0/quote (dry run, via the Privatus gateway)");
      line("HTTP", `${res.status} in ${Math.round(performance.now() - t0)} ms`);
      line("confidentiality", req.confidentiality);
      line("recipient", `${req.recipient} (a fresh random address, like a stealth wallet)`);
      line("appFees", JSON.stringify(req.appFees));
      if (res.ok) { line("amountIn", `${q.amountIn} lamports (0.1 SOL)`); line("amountOut", `${q.amountOut} lamports (${(q.amountOut / 1e9).toFixed(6)} SOL, after the fee and NEAR's spread)`); line("minAmountOut", q.minAmountOut); line("timeEstimate", `${q.timeEstimate} s`); }
      else line("error", JSON.stringify(body).slice(0, 300));
      line("checked at", new Date().toISOString());
    } catch (e) { out.textContent = `Couldn't reach NEAR Intents: ${e.message}`; }
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
