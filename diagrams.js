// The explanatory drawings used on the landing page and in the docs. Each one draws into an empty
// <svg> already in the page and sizes its viewBox to fit. Built from art.js: node cards, rules, packets.
import { schematic, ledger, curveChart, fit } from "./art.js";

const n = (id, x, y, label, sub, o = {}) => ({ id, x, y, label, sub, ...o });

// Main wallet → one-time deposit at exchange A (SOL → XMR) → Monero → exchange B (XMR → SOL) → stealth wallet →
// Jupiter. Ardea's fee is Houdini partner markup inside the route, so the funding is one plain transfer.
export function stealthRoute(svg, narrow = false) {
  const at = narrow
    ? { main: [0, 0], fee: [0, 110], dep: [0, 220], xmr: [0, 330], exb: [0, 440], stealth: [0, 550], jup: [0, 660] }
    : { main: [0, 0], fee: [0, 110], dep: [220, 0], xmr: [440, 0], exb: [660, 0], stealth: [660, 110], jup: [440, 110] };
  schematic(svg, {
    nodes: [
      n("main", ...at.main, "Your wallet", "one plain transfer", { glyph: "key" }),
      n("dep", ...at.dep, "Exchange A", "SOL → XMR · fee in route", { glyph: "file" }),
      n("xmr", ...at.xmr, "Monero", "ring sigs · RingCT", { glyph: "lock", tone: "core" }),
      n("exb", ...at.exb, "Exchange B", "XMR → SOL", { glyph: "file" }),
      n("stealth", ...at.stealth, "Clean wallet", "armed · fires instantly", { glyph: "stealth", tone: "brass" }),
      n("jup", ...at.jup, "Jupiter", "swap", { glyph: "route" })
    ],
    links: [{ from: "main", to: "dep" }, { from: "dep", to: "xmr" }, { from: "xmr", to: "exb" }, { from: "exb", to: "stealth" }, { from: "stealth", to: "jup" }],
    sequence: [[0], [1], [2], [3], [4]],
    tags: [{ link: 0, text: "SOL" }, { link: 1, text: "XMR", accent: true }, { link: 3, text: "B PAYS" }]
  });
  return fit(svg);
}

// Stealth exit: sell on Jupiter, then back to the main wallet through the same Monero route.
export function stealthExit(svg, narrow = false) {
  const at = narrow ? { jup: [0, 0], stealth: [0, 110], xmr: [0, 220], main: [0, 330] }
    : { jup: [0, 0], stealth: [220, 0], xmr: [440, 0], main: [660, 0] };
  schematic(svg, {
    nodes: [
      n("jup", ...at.jup, "Jupiter", "sell", { glyph: "route" }),
      n("stealth", ...at.stealth, "Stealth", "holds SOL", { glyph: "stealth", tone: "brass" }),
      n("xmr", ...at.xmr, "Monero route", "SOL → XMR → SOL", { glyph: "lock", tone: "core" }),
      n("main", ...at.main, "Your wallet", "receives", { glyph: "key" })
    ],
    links: [{ from: "jup", to: "stealth" }, { from: "stealth", to: "xmr" }, { from: "xmr", to: "main" }],
    tags: [{ link: 2, text: "NO FEE" }]
  });
  return fit(svg);
}

// One signature, many wallets: SHA-256(signature ‖ path) seeds each keypair.
export function walletTree(svg) {
  schematic(svg, {
    nodes: [
      n("main", 0, 120, "Your wallet", "signs once", { glyph: "key" }),
      n("sig", 220, 120, "Signature", "never stored", { glyph: "shield", tone: "core" }),
      n("inst", 470, 0, "Instant", "instant/0", { glyph: "bolt" }),
      n("s0", 470, 80, "Stealth 0", "stealth/0", { glyph: "stealth", tone: "brass" }),
      n("s1", 470, 160, "Stealth 1", "stealth/1", { glyph: "stealth", tone: "brass" }),
      n("s2", 470, 240, "Stealth 2", "stealth/2", { glyph: "stealth", tone: "brass" })
    ],
    links: [{ from: "main", to: "sig" }, { from: "sig", to: "inst", axis: "x", mid: 340 }, { from: "sig", to: "s0", axis: "x", mid: 340 }, { from: "sig", to: "s1", axis: "x", mid: 340 }, { from: "sig", to: "s2", axis: "x", mid: 340 }],
    sequence: [[0], [1, 2, 3, 4]],
    tags: [{ at: [340, 120], text: "SHA-256", accent: true }]
  });
  return fit(svg);
}

// Everything the browser talks to.
export function overview(svg, narrow = false) {
  const nodes = narrow ? [
    n("you", 0, 0, "Your browser", "keys + signing", { glyph: "globe", tone: "core" }),
    n("rpc", -86, 120, "Solana RPC", "chain reads", { glyph: "stack", w: 156 }), n("jup", 86, 120, "Jupiter", "routes, prices", { glyph: "route", w: 156 }),
    n("near", -86, 200, "Houdini", "Monero routes", { glyph: "lock", w: 156 }), n("pump", 86, 200, "PumpPortal", "new launches", { glyph: "flame", w: 156 }),
    n("jito", -86, 280, "Jito", "block engine", { glyph: "shield", w: 156 }), n("dex", 86, 280, "DexScreener", "charts", { glyph: "chart", w: 156 })
  ] : [
    n("you", 0, 0, "Your browser", "keys + signing", { glyph: "globe", tone: "core" }),
    n("rpc", 280, -100, "Solana RPC", "chain reads", { glyph: "stack" }), n("jup", 280, 0, "Jupiter", "routes, prices", { glyph: "route" }), n("jito", 280, 100, "Jito", "block engine", { glyph: "shield" }),
    n("pump", -280, -100, "PumpPortal", "new launches", { glyph: "flame" }), n("dex", -280, 0, "DexScreener", "charts", { glyph: "chart" }), n("near", -280, 100, "Houdini", "Monero routes", { glyph: "lock" })
  ];
  const links = ["rpc", "jup", "jito", "pump", "dex", "near"].map(id => narrow ? { from: "you", to: id, axis: "y", mid: 60 } : { from: "you", to: id, axis: "x" });
  schematic(svg, { nodes, links, sequence: [[0, 3], [1, 4], [2, 5]] });
  return fit(svg);
}

// The gateway: the browser calls one server, which adds the keys and forwards.
export function proxy(svg) {
  schematic(svg, {
    nodes: [
      n("you", 0, 0, "Browser", "no keys", { glyph: "globe" }),
      n("gw", 230, 0, "Gateway", "holds the keys", { glyph: "key", tone: "core" }),
      n("rpc", 470, -114, "RPC", "", { glyph: "stack" }), n("jup", 470, -38, "Jupiter", "", { glyph: "route" }),
      n("near", 470, 38, "Houdini", "", { glyph: "lock" }), n("x", 470, 114, "X posts", "", { glyph: "file" })
    ],
    links: [{ from: "you", to: "gw" }, ...["rpc", "jup", "near", "x"].map(id => ({ from: "gw", to: id, axis: "x", mid: 350 }))],
    sequence: [[0], [1, 2, 3, 4]],
    tags: [{ link: 0, text: "+ API KEY", accent: true }]
  });
  return fit(svg);
}

// Where Pulse gets its tokens.
export function pulseSources(svg) {
  schematic(svg, {
    nodes: [
      n("pump", 0, -90, "PumpPortal", "launches, live", { glyph: "flame" }),
      n("rpc", 0, 0, "RPC", "curve %", { glyph: "stack" }),
      n("jup", 0, 90, "Jupiter", "token lists", { glyph: "route" }),
      n("board", 270, 0, "Pulse", "3 columns", { glyph: "chart", tone: "core" })
    ],
    links: ["pump", "rpc", "jup"].map(id => ({ from: id, to: "board", axis: "x", mid: 150 })),
    sequence: [[0], [1], [2]]
  });
  return fit(svg);
}

// A limit order lives with Jupiter's keepers, so it fills with the tab closed.
export function limitOrder(svg) {
  schematic(svg, {
    nodes: [
      n("you", 0, 0, "You", "sign once", { glyph: "key" }),
      n("trig", 220, 0, "Trigger", "Jupiter keepers", { glyph: "target", tone: "core" }),
      n("mkt", 450, 0, "Market", "fills at price", { glyph: "chart" }),
      n("back", 450, 110, "Your wallet", "receives", { glyph: "wallet", tone: "brass" })
    ],
    links: [{ from: "you", to: "trig" }, { from: "trig", to: "mkt" }, { from: "mkt", to: "back" }],
    tags: [{ link: 0, text: "ESCROWED" }]
  });
  return fit(svg);
}

// Autopilot: this tab watches the price and sells from the instant wallet.
export function autopilot(svg) {
  schematic(svg, {
    nodes: [
      n("price", 0, 0, "Price", "every 4 s", { glyph: "chart" }),
      n("tab", 220, 0, "This tab", "TP · SL · trail", { glyph: "target", tone: "core" }),
      n("inst", 220, 110, "Instant", "signs, no popup", { glyph: "bolt", tone: "brass" }),
      n("jup", 450, 110, "Jupiter", "sell", { glyph: "route" })
    ],
    links: [{ from: "price", to: "tab" }, { from: "tab", to: "inst" }, { from: "inst", to: "jup" }]
  });
  return fit(svg);
}

// What one terminal buy puts in its transaction, top to bottom.
export function tradeTx(svg) {
  ledger(svg, {
    rows: [
      { label: "COMPUTE BUDGET", note: "limit + priority" },
      { label: "TOKEN ACCOUNT", note: "opened if needed" },
      { label: "ARDEA FEE", note: "0.5% → treasury", accent: true },
      { label: "JUPITER SWAP", note: "best route" },
      { label: "CLEANUP", note: "unwrap SOL" },
      { label: "JITO TIP", note: "if the preset sets one" }
    ]
  });
  return fit(svg, { grid: false });
}

export function bondingCurve(svg) {
  curveChart(svg);
  return fit(svg, { top: 10 });
}

export const DIAGRAMS = { stealthRoute, stealthExit, walletTree, overview, proxy, pulseSources, limitOrder, autopilot, tradeTx, bondingCurve };

// Diagrams with a phone layout, and the width below which their drawing area switches to it.
const NARROW = new Set(["stealthRoute", "stealthExit", "overview"]), NARROW_PX = 620;
const isNarrow = svg => NARROW.has(svg.dataset.diagram) && (svg.parentElement?.clientWidth || Infinity) < NARROW_PX;
function draw(svg) {
  const narrow = isNarrow(svg);
  svg.toggleAttribute("data-narrow", narrow);
  DIAGRAMS[svg.dataset.diagram](svg, narrow);
}

// Draw every <svg data-diagram="name"> in root, and redraw the ones with a phone layout when their
// width crosses over. A redraw swaps in a fresh <svg> so the old drawing's animation stops with it.
export function renderDiagrams(root = document) {
  const live = [...root.querySelectorAll("svg[data-diagram]")].filter(svg => DIAGRAMS[svg.dataset.diagram] && !svg.childNodes.length);
  // each diagram on its own: one that fails to draw must not leave the others blank
  live.forEach(svg => { try { draw(svg); } catch (e) { console.error(`diagram ${svg.dataset.diagram}:`, e); } });
  const flip = live.filter(svg => NARROW.has(svg.dataset.diagram));
  if (!flip.length || typeof ResizeObserver !== "function") return;
  const ro = new ResizeObserver(() => flip.forEach((svg, i) => {
    if (isNarrow(svg) === svg.hasAttribute("data-narrow")) return;
    const fresh = svg.cloneNode(false);
    svg.replaceWith(fresh);
    flip[i] = fresh;
    draw(fresh);
  }));
  flip.forEach(svg => ro.observe(svg.parentElement));
}
