// The route tracker: track.html#<route id>. Reads the route's status from Houdini through the gateway and draws its
// progress. Transaction links stay hidden until asked for: the deposit shows the sending wallet and the payout the
// receiving one, and seeing both together would join the two wallets the route keeps apart.
import { renderGlyphs } from "./art.js";
import { PROXY_URL } from "./config.js";
import { houdini, lamportsToSol, solToLamports } from "./stealth.js";
import { STEPS, stepIndex, headline, isRouteId, elapsedMin } from "./trackview.js";
import { solanaSvg, moneroSvg } from "./brandlogos.js";
// which chain each step happens on
const CHAIN = { open: "solana", deposit: "solana", toxmr: "monero", monero: "monero", tosol: "solana", paid: "solana" };

renderGlyphs(document);
const hd = houdini({ base: `${(PROXY_URL || "").replace(/\/$/, "")}/houdini` });
const out = document.getElementById("out"), input = document.getElementById("rid");
const make = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const sol = n => `${lamportsToSol(solToLamports(n))} SOL`;
let timer = 0, showTx = false, current = "", proofWallets = [];
// Ardea's own proof wallets are public, so their routes show transaction links straight away.
fetch(`${(PROXY_URL || "").replace(/\/$/, "")}/proof.json`).then(r => r.json()).then(st => { proofWallets = st.wallets || []; }).catch(() => {});

// Accepts a bare id or any link that ends in #<id>.
const idFrom = v => { const s = String(v || "").trim(), h = s.includes("#") ? s.slice(s.lastIndexOf("#") + 1) : s; return isRouteId(h) ? h : ""; };

function render(o, id) {
  out.textContent = "";
  const h = headline(o), at = stepIndex(o), proof = proofWallets.includes(o.receiverAddress) && proofWallets.includes(o.refundAddress);
  if (proof) showTx = true;
  const st = make("div", "status"); st.dataset.tone = h.tone; st.append(make("i"), make("span", "", h.text)); out.append(st);
  const meta = make("div", "meta");
  const m = (k, v) => { const d = make("span"); d.append(`${k} `, make("b", "", v)); meta.append(d); };
  m("Route", id);
  if (proof) m("Type", "Ardea proof route (both wallets are Ardea's own)");
  if (o.inAmount != null) m("In", sol(o.inAmount));
  if (o.outAmount != null) m(o.status === 4 ? "Delivered" : "Arrives ≈", sol(o.outAmount));
  const min = elapsedMin(o); if (min != null) m(o.status === 4 ? "Took" : "Running", `${min} min`);
  if (o.status !== 4 && o.eta) m("Typical", `${Math.round(o.eta)} min`);
  if (o.rerouted) m("Note", "rerouted, amounts may differ");
  out.append(meta);
  const ol = make("ol", "steps");
  STEPS.forEach((s, i) => { const li = make("li", at === -1 ? "" : i < at ? "done" : i === at ? "active" : ""), b = make("b"); b.innerHTML = CHAIN[s.key] === "monero" ? moneroSvg(14) : solanaSvg(14); b.append(" ", s.label); li.append(make("i", "dot"), b, make("span", "", s.note)); ol.append(li); });
  out.append(ol);
  // transaction links, on request only
  const txs = make("div", "txs");
  const links = [["Deposit", o.inHash], ["Payout", o.transactionHash], ["Refund", o.refundHash]].filter(([, h2]) => h2);
  if (!links.length) txs.append(make("p", "", "Transaction links appear here once the route has them."));
  else if (!showTx) {
    txs.append(make("p", "", "The deposit transaction shows the sending wallet and the payout shows the receiving one. Showing both together links the two, so they're hidden unless you choose to see them."));
    const b = make("button", "ghost", "Show transaction links"); b.type = "button";
    b.addEventListener("click", () => { showTx = true; render(o, id); }); txs.append(b);
  } else for (const [k, hash] of links) { const a = make("a", "", `${k}: ${hash}`); a.href = `https://solscan.io/tx/${hash}`; a.target = "_blank"; a.rel = "noopener"; txs.append(a); }
  out.append(txs, make("p", "small", `Updated ${new Date().toLocaleTimeString()}${[4, 5, 6, 7, 8].includes(o.status) ? " · final" : " · refreshes every 15 s"}`));
}

async function track(id) {
  clearTimeout(timer); current = id; showTx = false;
  out.textContent = ""; out.append(make("p", "small", "Looking up the route…"));
  const tick = async () => {
    if (current !== id) return;
    try {
      const o = await hd.order(id);
      if (current !== id) return;
      render(o, id);
      if (![4, 5, 6, 7, 8].includes(o.status)) timer = setTimeout(tick, 15000);
    } catch (e) {
      out.textContent = "";
      out.append(make("p", "err", e.status === 404 ? "No route with that id. Tracking links work for 48 hours after a route opens." : `Couldn't reach the route right now (${e.message}). Retrying…`));
      if (e.status !== 404) timer = setTimeout(tick, 15000);
    }
  };
  tick();
}

document.getElementById("f").addEventListener("submit", e => {
  e.preventDefault();
  const id = idFrom(input.value);
  if (!id) { out.textContent = ""; out.append(make("p", "err", "That doesn't look like a route id.")); return; }
  location.hash = id;
});
const fromHash = () => { const id = idFrom(location.hash.slice(1)); if (id) { input.value = id; document.title = `Route ${id} · Ardea`; track(id); } };
addEventListener("hashchange", fromHash);
fromHash();
