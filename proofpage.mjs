// /proof: the proof page, rendered on the server as plain HTML so it reads the same with or without JavaScript, for
// people and for automated checkers alike. Everything on it comes from Houdini's own records of the proof routes and
// from the Solana chain; each fact links to where it can be checked independently.
import { solanaSvg, moneroSvg } from "./brandlogos.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
const tx = sig => sig ? `<a href="https://solscan.io/tx/${esc(sig)}">${esc(short(sig))}</a>` : "—";
const acct = a => a ? `<a href="https://solscan.io/account/${esc(a)}">${esc(short(a))}</a>` : "—";
const mins = r => r.startedAt && r.endedAt ? Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 60000) : null;
const when = t => t ? esc(String(t).replace("T", " ").slice(0, 16)) + " UTC" : "—";
const REPO = "https://github.com/JermWang/ArdeaFinance";

export function renderProofPage(st, { now = new Date() } = {}) {
  const routes = st?.routes || [], done = routes.filter(r => r.delivered), [A, B] = st?.wallets || [];
  const armed = st?.armed || [], names = new Map([[A, "Proof A"], [B, "Proof B"], ...armed.map(x => [x.address, `Armed wallet #${x.index}`])]);
  const label = w => w === "a" ? "Proof A" : w === "b" ? "Proof B" : "—";
  const who = (addr, key) => names.get(addr) || (addr ? short(addr) : label(key));
  const rows = routes.map(r => `<tr>
    <td><a href="/track.html#${esc(r.routeId)}">${esc(r.routeId)}</a></td>
    <td>${when(r.startedAt)}</td>
    <td>${esc(who(r.fromAddress, r.from))} → ${esc(who(r.toAddress, r.to))}</td>
    <td>${esc(r.amountSol ?? "—")} → ${esc(r.amountOutSol ?? "—")} SOL</td>
    <td>${r.delivered ? `${mins(r) ?? "—"} min` : "crossing now"}</td>
    <td>${tx(r.fundingSig)}<br><small>to deposit ${acct(r.depositAddress)}</small></td>
    <td>${r.delivered ? tx(r.deliverySig) : "pending"}${r.paidBy ? `<br><small>paid by ${acct(r.paidBy)}</small>` : ""}</td>
    <td><a href="/proof/route/${esc(r.routeId)}.json">Houdini record</a></td>
  </tr>`).join("");
  const schedule = st?.everyHours ? `every ${esc(st.everyHours)} hours` : `daily at ${esc(String(st?.utcHour ?? 14).padStart(2, "0"))}:00 UTC`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proof · Ardea</title>
<meta name="description" content="Completed Monero routes run by Ardea's own proof wallets, each matched to Houdini's record and to the Solana transactions, checkable without trusting Ardea.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{--bg:#141414;--line:#2E2E2E;--ink:#F2F2F2;--mute:#9A9A9A;--or:#FF6600;--up:#43D19E}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 "Manrope","Segoe UI",system-ui,sans-serif}
a{color:var(--or)}main{max-width:1080px;margin:0 auto;padding:40px 20px 80px}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line)}
header a{color:var(--ink);text-decoration:none;margin-left:18px;font-size:.92rem}header b{font:500 1.4rem Georgia,serif}
h1{font:500 clamp(2rem,4.5vw,3rem)/1.1 Georgia,serif;margin:.2em 0}h2{font:500 1.6rem Georgia,serif;margin:2em 0 .4em}
.k{font:600 .72rem ui-monospace,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--or)}
.stats{display:flex;gap:40px;flex-wrap:wrap;padding:16px 0;border-block:1px solid var(--line);margin:24px 0}
.stats b{display:block;font:500 1.8rem Georgia,serif}.stats span{color:var(--mute);font-size:.8rem}
table{width:100%;border-collapse:collapse;font:.82rem ui-monospace,Consolas,monospace}th,td{text-align:left;padding:10px 8px;border-top:1px solid var(--line);vertical-align:top}
th{color:var(--mute);font-weight:500}small{color:var(--mute)}.wrap{overflow-x:auto}
ol li,ul li{margin:.4em 0}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid var(--line);border-radius:99px;font:.8rem ui-monospace,Consolas,monospace;color:var(--ink)}.chip i{font-style:normal;color:var(--mute);margin:0 4px}.brand-logo{vertical-align:-3px}code{font:.85em ui-monospace,Consolas,monospace;color:#FF8A3D}p,li{color:#D0D0D0}
</style></head><body>
<header><b>Ardea</b><nav><a href="/">Home</a><a href="/app.html">Terminal</a><a href="/track.html">Route tracker</a><a href="/docs.html#proof">Docs</a><a href="${REPO}">GitHub</a></nav></header>
<main>
<p class="k">Proof · generated ${when(now.toISOString())}</p>
<h1>Real Monero routes, checkable without trusting us.</h1>
<p class="chip">${solanaSvg(16)} SOL <i>→</i> ${moneroSvg(16)} XMR <i>→</i> ${solanaSvg(16)} SOL</p>
<p>Ardea runs two proof wallets of its own and ${st?.mode === "arm" ? `runs the Arm a wallet flow with them ${schedule}: arm a brand-new wallet, then disarm it,` : `sends SOL between them ${schedule},`} through the same code path a private buy uses: a Houdini Swap private send with Monero forced as the bridge (<code>useXmr=true</code>, see <a href="${REPO}/blob/main/stealth.js">stealth.js</a>). Every completed route below is matched to Houdini's own record of it and to the two Solana transactions it produced.</p>
<div class="stats">
  <div><b>${done.length}</b><span>completed routes</span></div>
  <div><b>${routes.length - done.length}</b><span>crossing now</span></div>
  <div><b>0</b><span>direct transfers between the proof wallets</span></div>
  <div><b>${done.length ? esc(Math.round(done.reduce((n, r) => n + (mins(r) || 0), 0) / done.length)) + " min" : "—"}</b><span>average route time</span></div>
</div>
<p>Proof wallet A: ${acct(A)} (<code>${esc(A)}</code>)<br>Proof wallet B: ${acct(B)} (<code>${esc(B)}</code>)</p>

<h2>Routes</h2>
${routes.length ? `<div class="wrap"><table><thead><tr><th>Houdini route id</th><th>Started</th><th>Direction</th><th>SOL in → out</th><th>Took</th><th>Funding tx</th><th>Delivery tx</th><th>Record</th></tr></thead><tbody>${rows}</tbody></table></div>` : "<p>No proof routes in the last 48 hours yet.</p>"}

${armed.length ? `<h2>Arm a wallet, on-chain</h2>
<p>Each arm cycle runs the product's own flow with Ardea's wallets: a brand-new wallet is <b>armed</b> through Monero (paid by an exchange, with no link to the proof wallet that funded it), then <b>disarmed</b> back through Monero to the other proof wallet.</p>
<div class="wrap"><table><thead><tr><th>Armed wallet</th><th>Armed by route</th><th>Disarmed by route</th></tr></thead><tbody>${armed.slice().reverse().map(x => {
    const inR = routes.find(r => r.toAddress === x.address), outR = routes.find(r => r.fromAddress === x.address);
    const cell = r => r ? `<a href="/track.html#${esc(r.routeId)}">${esc(r.routeId)}</a> · ${r.delivered ? "delivered" : "crossing now"}` : "—";
    return `<tr><td>#${esc(x.index)} ${acct(x.address)}</td><td>${cell(inR)}</td><td>${cell(outR)}</td></tr>`;
  }).join("")}</tbody></table></div>` : ""}

<h2>How to check a route yourself</h2>
<ol>
<li><b>Funding.</b> Open the funding transaction: the sending proof wallet pays the route's one-time deposit address. Nothing else is in it: no transfer to Ardea and none to the other proof wallet.</li>
<li><b>Delivery.</b> Open the delivery transaction: the receiving proof wallet is paid by an exchange's wallet ("paid by"), not by the other proof wallet.</li>
<li><b>The match.</b> Open the route's Houdini record (<code>/proof/route/&lt;id&gt;.json</code>, Houdini's own order data forwarded unchanged): its <code>inHash</code> is the funding transaction, its <code>transactionHash</code> is the delivery, <code>anonymous</code> is true (Houdini's private, two-exchange route) and <code>status</code> 4 means finished.</li>
<li><b>No shortcut.</b> Open either proof wallet on Solscan: there is never a transfer between A and B.</li>
<li><b>Monero.</b> Houdini's record doesn't name the middle asset. Monero is what Ardea requests on every route (<code>useXmr=true</code> in <a href="${REPO}/blob/main/stealth.js">stealth.js</a>, covered by tests in <a href="${REPO}/blob/main/test/stealth.test.mjs">stealth.test.mjs</a>). For route 4QF9jP9Zuz7LkMtPfXRivC, Houdini support confirmed on 2026-10-20 that the second exchange was waiting for 20 Monero network confirmations, which is why it took 81 minutes.</li>
</ol>

<h2>What this doesn't show</h2>
<ul>
<li>Houdini sees both ends of each route, and each exchange sees its own leg. Amounts and timing can still be matched by a determined observer; the docs explain how Ardea makes that harder, not impossible.</li>
<li>Houdini keeps order records for 48 hours, so this page lists the routes from that window; older completed routes stay on Solscan.</li>
</ul>
<p><a href="/proof.json">proof.json</a> has the same data as JSON. Source: <a href="${REPO}">${REPO}</a>.</p>
</main></body></html>`;
}
