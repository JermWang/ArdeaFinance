// Ardea art, drawn in code in one flat, minimal style: fine lines, solid dots, the heron mark kept clean, and the
// Monero palette (orange on charcoal). No engraved patterns or textures.
// One shared animation clock drives it all; it pauses off-screen and respects prefers-reduced-motion.

import { logoMark } from "./logo.js";
import { brandNode } from "./brandlogos.js";
export const NS = "http://www.w3.org/2000/svg";
export const REDUCE = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const C = {
  BG: "#141414", BG1: "#1B1B1B", BG2: "#212121", BG3: "#2A2A2A", LINE: "#363636",
  IVORY: "#F2F2F2", MUTE: "#9A9A9A", STEEL: "#8C8C8C", BRASS: "#FF6600", BRASS2: "#D94F00",
  UP: "#43D19E", DOWN: "#F06A6A"
};
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const TAU = Math.PI * 2, f2 = n => n.toFixed(2);

export function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export function svgEl(viewBox, label) {
  const s = el("svg", { viewBox, role: label ? "img" : "presentation" });
  if (label) s.setAttribute("aria-label", label); else s.setAttribute("aria-hidden", "true");
  return s;
}
const text = (parent, x, y, str, attrs = {}) => { const t = el("text", { x: f2(x), y: f2(y), "font-family": MONO, ...attrs }, parent); t.textContent = str; return t; };

/* ---------- one animation clock ---------- */
// animate(fn, host): fn(t seconds) runs every frame while `host` is on screen. With reduced motion it
// runs once at a fixed t so the drawing settles into a sensible still frame.
const jobs = new Set();
let running = false, t0 = 0;
const seen = new WeakMap();
const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => es.forEach(e => seen.set(e.target, e.isIntersecting))) : null;
export function animate(fn, host, still = 2.4) {
  if (REDUCE) { fn(still); return () => {}; }
  const job = { fn, host };
  if (host && io) { seen.set(host, true); io.observe(host); }
  jobs.add(job);
  if (!running) { running = true; t0 = performance.now(); requestAnimationFrame(tick); }
  return () => jobs.delete(job);
}
function tick(now) {
  const t = Math.max(0, (now - t0) / 1000);
  for (const j of jobs) {
    // a host not yet in the page is skipped; one that was in the page and left it is dropped
    if (j.host && !j.host.isConnected) { if (j.armed) jobs.delete(j); continue; }
    if (j.host) j.armed = true;
    if (j.host && seen.get(j.host) === false) continue;
    j.fn(t);
  }
  if (jobs.size && !document.hidden) requestAnimationFrame(tick);
  else running = false;
}
document.addEventListener?.("visibilitychange", () => { if (!document.hidden && jobs.size && !running) { running = true; requestAnimationFrame(tick); } });

const ease = p => p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Size a drawing's viewBox to what was drawn (plus padding), ignoring moving parts marked data-anim,
// then lay a faint drafting grid of crosses behind it.
export function fit(svg, { pad = 18, top = 0, fallback = "0 0 800 400", grid = true } = {}) {
  const moving = [...svg.querySelectorAll("[data-anim]")];
  moving.forEach(m => m.setAttribute("display", "none"));
  let b = null;
  try { b = svg.getBBox(); } catch (_) {}
  moving.forEach(m => m.removeAttribute("display"));
  svg.setAttribute("viewBox", b && b.width ? `${f2(b.x - pad)} ${f2(b.y - pad - top)} ${f2(b.width + pad * 2)} ${f2(b.height + pad * 2 + top)}` : fallback);
  if (grid) crosses(svg);
  return svg;
}
function crosses(svg, step = 28) {
  const [x, y, w, h] = (svg.getAttribute("viewBox") || "0 0 0 0").split(/\s+/).map(Number);
  if (!w || !h) return;
  let d = "";
  for (let gy = Math.ceil(y / step) * step; gy < y + h; gy += step)
    for (let gx = Math.ceil(x / step) * step; gx < x + w; gx += step) d += `M${gx - 2.5} ${gy}h5M${gx} ${gy - 2.5}v5`;
  const p = el("path", { d, stroke: C.STEEL, "stroke-width": .7, opacity: .22, "data-anim": "" });
  svg.insertBefore(p, svg.firstChild);
}

/* ---------- engraving primitives ---------- */
// A closed polar curve r(θ) as path data, centred on (0, 0).
export function polar(fn, steps = 360) {
  let d = "";
  for (let i = 0; i <= steps; i++) { const a = i / steps * TAU, r = fn(a); d += (i ? "L" : "M") + f2(Math.cos(a) * r) + " " + f2(Math.sin(a) * r); }
  return d + "Z";
}
// An arc of radius r from angle a0 to a1 (radians, clockwise on screen), centred on (cx, cy).
export function arc(cx, cy, r, a0, a1) {
  const large = ((a1 - a0) % TAU + TAU) % TAU > Math.PI ? 1 : 0;
  return `M${f2(cx + Math.cos(a0) * r)} ${f2(cy + Math.sin(a0) * r)}A${r} ${r} 0 ${large} 1 ${f2(cx + Math.cos(a1) * r)} ${f2(cy + Math.sin(a1) * r)}`;
}
function diamond(parent, size = 4.5, fill = C.BRASS) {
  return el("path", { d: `M0 ${-size}L${size} 0L0 ${size}L${-size} 0Z`, fill, stroke: C.BG, "stroke-width": 1 }, parent);
}

// The logo: the Ardea heron in its ring (logo.js), always clean. On paper pages pass { tone: "orangePaper" }.
export function mark(cls, { tone = "orange", animate = true } = {}) {
  const svg = svgEl("0 0 10 10");
  if (cls) svg.setAttribute("class", cls);
  logoMark(svg, { tone, sheen: false });
  return svg;
}

/* ---------- line icons ---------- */
// 24-unit line icons drawn in currentColor, each with one brass detail.
const I = (d, accent) => ({ d, accent });
export const GLYPHS = {
  key: I("M11 12.5 19.5 4M16.5 7l2 2M14.2 9.3l1.4 1.4M12 15.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", ["circle", { cx: 8, cy: 15.5, r: 1.3 }]),
  lock: I("M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19v-7A1.5 1.5 0 0 1 6 10.5ZM8 10.5V7.5a4 4 0 0 1 8 0v3", ["circle", { cx: 12, cy: 15.5, r: 1.5 }]),
  clock: I("M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM12 7.5V12l3.2 2", ["circle", { cx: 12, cy: 12, r: 1.2 }]),
  file: I("M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20V3.5ZM14 3.5v4h4M9.5 15.5h5", ["path", { d: "M9.5 12h5" }]),
  fuel: I("M6 7.5v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7.5M6 12v4.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V12", ["ellipse", { cx: 12, cy: 7.5, rx: 6, ry: 2.5 }]),
  stairs: I("M3.5 20h5v-4.5h4.5V11h4.5V6.5h3", ["circle", { cx: 20.5, cy: 4, r: 1.4 }]),
  flame: I("M12 3.5c1.2 3 5 5 5 9.5a5 5 0 0 1-10 0c0-2.4 1.3-3.9 2.4-5 .3 1.4 1 2.3 1.9 2.8-.1-2.8-.4-5 .7-7.3Z", ["circle", { cx: 12, cy: 15.5, r: 1.6 }]),
  stack: I("M4 12.5l8 4 8-4M4 16.5l8 4 8-4", ["path", { d: "M12 4.5l8 4-8 4-8-4Z" }]),
  link: I("M8.6 11.4 6.8 13.2a3.5 3.5 0 0 0 5 5l1.8-1.8M15.4 12.6l1.8-1.8a3.5 3.5 0 0 0-5-5l-1.8 1.8", ["path", { d: "M10 14l4-4" }]),
  bolt: I("M13.5 3 5.5 13.5h6L10.5 21l8-10.5h-6Z", ["circle", { cx: 20, cy: 4.5, r: 1.3 }]),
  target: I("M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z", ["circle", { cx: 12, cy: 12, r: 1.5 }]),
  shield: I("M12 3.5l7 2.8v5.2c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6.3Z", ["path", { d: "M9 12.2l2 2 4-4" }]),
  route: I("M7 6h6.5a3 3 0 0 1 0 6h-3a3 3 0 0 0 0 6H17M7 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z", ["circle", { cx: 19, cy: 18, r: 2 }]),
  chart: I("M4 20h16M5 16l4-4 3 2.5 6-7", ["circle", { cx: 18, cy: 7.5, r: 1.5 }]),
  stealth: I("M5 7.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V9A1.5 1.5 0 0 1 5 7.5ZM16 13h4.5", ["circle", { cx: 16.5, cy: 13, r: 1.3 }]),
  wallet: I("M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17V8A1.5 1.5 0 0 1 5 6.5ZM3.5 10h17", ["circle", { cx: 16.5, cy: 14, r: 1.3 }]),
  globe: I("M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8Z", ["circle", { cx: 12, cy: 12, r: 1.2 }]),
  pool: I("M4 9c2 0 2-1.5 4-1.5S10 9 12 9s2-1.5 4-1.5S18 9 20 9M4 13c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M4 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5", ["circle", { cx: 12, cy: 5, r: 1.3 }])
};
GLYPHS.stealth.dash = "2.2 2.4";
export function glyphSVG(kind, cls) {
  // the Solana and Monero marks, as published, wherever a route touches either chain
  if (kind === "solana" || kind === "monero") { const b = brandNode(kind, 24); if (cls) b.setAttribute("class", `${cls} brand-logo`); b.setAttribute("aria-hidden", "true"); return b; }
  const gl = GLYPHS[kind] || GLYPHS.wallet;
  // duotone: a bold rounded outline, and the detail as a soft orange fill with an orange edge
  const svg = el("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  if (cls) svg.setAttribute("class", cls);
  const [tag, attrs] = gl.accent;
  el(tag, tag === "circle" ? { ...attrs, r: f2(attrs.r * 1.7), fill: C.BRASS, "fill-opacity": .3, stroke: "none" } : { ...attrs, fill: C.BRASS, "fill-opacity": .22, stroke: C.BRASS }, svg);
  el("path", gl.dash ? { d: gl.d, "stroke-dasharray": gl.dash } : { d: gl.d }, svg);
  return svg;
}
// Draw a glyph at (x, y), `size` units square, inside another SVG.
function glyphAt(parent, kind, x, y, size, color = C.IVORY) {
  const g = glyphSVG(kind);
  g.setAttribute("x", f2(x - size / 2)); g.setAttribute("y", f2(y - size / 2));
  g.setAttribute("width", size); g.setAttribute("height", size); g.setAttribute("color", color);
  parent.appendChild(g);
  return g;
}

// Replace every [data-glyph] placeholder: "mark" (the logo), "word" (the wordmark) or any GLYPHS key.
export function renderGlyphs(root = document) {
  root.querySelectorAll("[data-glyph]").forEach(host => {
    const kind = host.dataset.glyph, cls = host.getAttribute("class");
    if (kind === "word") { host.removeAttribute("data-glyph"); host.textContent = "Ardea"; return; }
    host.replaceWith(kind === "mark" ? mark(cls, { tone: host.dataset.tone || "orange" }) : glyphSVG(kind, cls));
  });
}

/* ---------- the hero: the heron, and the route under it ---------- */
// No frame and no pattern: the mark stands on the page, clean. Under it, one line: your wallet, the Monero hop, a new
// wallet. A small marker walks the route; the readout says what the chain shows between the two ends.
export function hero(svg) {
  const m = el("svg", { x: 160, y: 20, width: 280, height: 280, overflow: "visible" }, svg);
  logoMark(m, { tone: "orange" });
  const y = 420, xs = [70, 300, 530], labels = [["YOUR WALLET", "public history"], ["MONERO", "SOL → XMR → SOL"], ["ARMED WALLET", "fires in one click"]];
  const line = el("path", { d: `M${xs[0]} ${y}H${xs[2]}`, stroke: C.LINE, "stroke-width": 1.2 }, svg);
  xs.forEach((x, i) => {
    // Solana at both wallet ends, Monero in the middle
    const sz = i === 1 ? 30 : 20, b = brandNode(i === 1 ? "monero" : "solana", sz);
    el("circle", { cx: x, cy: y, r: sz / 2 + 7, fill: C.BG, stroke: C.LINE, "stroke-width": 1 }, svg);
    b.setAttribute("x", f2(x - sz / 2)); b.setAttribute("y", f2(y - (i === 1 ? sz : sz * 88 / 101) / 2)); svg.appendChild(b);
    text(svg, x, y + 30, labels[i][0], { "font-size": 10.5, "font-weight": 600, fill: C.IVORY, "letter-spacing": ".14em", "text-anchor": "middle" });
    text(svg, x, y + 46, labels[i][1], { "font-size": 9.5, fill: C.MUTE, "letter-spacing": ".06em", "text-anchor": "middle" });
  });
  text(svg, 300, y - 26, "DIRECT TRANSFER: NONE", { "font-size": 9.5, "font-weight": 600, fill: C.BRASS, "letter-spacing": ".16em", "text-anchor": "middle" });
  const pk = el("circle", { r: 3.2, fill: C.BRASS, cy: y }, svg);
  animate(t => { const q = (t % 5) / 5; pk.setAttribute("cx", f2(xs[0] + (xs[2] - xs[0]) * ease(q))); pk.setAttribute("opacity", f2(Math.sin(q * Math.PI))); }, svg, 1);
  return line;
}

/* ---------- illustrations for the "what trackers see" cards ---------- */
export const ICONS = {
  funding(svg) {
    el("circle", { cx: 54, cy: 75, r: 14, fill: "none", stroke: C.IVORY, "stroke-width": 1.2 }, svg); el("circle", { cx: 54, cy: 75, r: 4, fill: C.IVORY }, svg);
    const ys = [28, 60, 92, 124], paths = ys.map((y, i) => el("path", { d: `M78 75C130 75 128 ${y} 182 ${y}`, fill: "none", stroke: i === 1 ? C.BRASS : C.STEEL, "stroke-width": i === 1 ? 1.3 : 1, opacity: i === 1 ? 1 : .8 }, svg));
    ys.forEach((y, i) => { el("circle", { cx: 192, cy: y, r: 8, fill: C.BG1, stroke: i === 1 ? C.BRASS : C.IVORY, "stroke-width": 1.1 }, svg); el("circle", { cx: 192, cy: y, r: 2, fill: i === 1 ? C.BRASS : C.IVORY }, svg); });
    text(svg, 208, 63, "YOU", { "font-size": 8, fill: C.BRASS, "letter-spacing": ".12em" });
    const dots = paths.map(() => el("circle", { r: 2.2, fill: C.IVORY }, svg));
    animate(t => paths.forEach((p, i) => { const L = p.getTotalLength?.() || 0, q = (t * .45 + i * .21) % 1, pt = L ? p.getPointAtLength(q * L) : { x: 0, y: 0 }; dots[i].setAttribute("cx", f2(pt.x)); dots[i].setAttribute("cy", f2(pt.y)); dots[i].setAttribute("opacity", f2(Math.sin(q * Math.PI))); }), svg);
  },
  serial(svg) {
    el("rect", { x: 36, y: 26, width: 168, height: 100, rx: 10, fill: C.BG1, stroke: C.IVORY, "stroke-width": 1, opacity: .95 }, svg);
    let fp = "";
    for (let i = 0; i < 9; i++) { const rx = 5 + i * 3.6, ry = 7 + i * 4.2, a0 = .4 + (i % 3) * .5; fp += polarArc(78, 78, rx, ry, a0, a0 + TAU - .9 - (i % 2) * .5); }
    el("path", { d: fp, fill: "none", stroke: C.STEEL, "stroke-width": 1.1, "stroke-linecap": "round" }, svg);
    [[116, 54, 64], [116, 68, 46], [116, 82, 56], [116, 96, 34]].forEach(([x, y, w], i) => el("rect", { x, y, width: w, height: 3.4, rx: 1.7, fill: i ? C.MUTE : C.IVORY, opacity: i ? .6 : .9 }, svg));
    const scan = el("g", {}, svg);
    el("line", { x1: 0, y1: 30, x2: 0, y2: 122, stroke: C.BRASS, "stroke-width": 1.2 }, scan);
    el("rect", { x: -16, y: 30, width: 16, height: 92, fill: C.BRASS, opacity: .08 }, scan);
    animate(t => { const p = (Math.sin(t * 1.1) + 1) / 2; scan.setAttribute("transform", `translate(${f2(44 + p * 150)} 0)`); }, svg);
  },
  linked(svg) {
    const P = [[56, 104], [120, 40], [184, 104]];
    const curves = [];
    [[0, 1], [1, 2], [2, 0]].forEach(([a, b]) => {
      const [ax, ay] = P[a], [bx, by] = P[b], mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay), ny = bx - ax, L = Math.hypot(nx, ny);
      for (const s of [1, -1]) curves.push({ p: el("path", { d: `M${ax} ${ay}Q${f2(mx + nx / L * 14 * s)} ${f2(my + ny / L * 14 * s)} ${bx} ${by}`, fill: "none", stroke: C.STEEL, "stroke-width": 1, opacity: .85 }, svg), rev: s < 0 });
    });
    P.forEach(([x, y], i) => { el("circle", { cx: x, cy: y, r: 17, fill: C.BG1, stroke: i ? C.IVORY : C.BRASS, "stroke-width": 1.2 }, svg); el("circle", { cx: x, cy: y, r: 4, fill: i ? C.IVORY : C.BRASS }, svg); });
    const dots = curves.map(c => el("circle", { r: 2.2, fill: c.rev ? C.IVORY : C.BRASS }, svg));
    animate(t => curves.forEach((c, i) => { const L = c.p.getTotalLength?.() || 0, q = (t * .4 + i * .17) % 1, pt = L ? c.p.getPointAtLength((c.rev ? 1 - q : q) * L) : { x: 0, y: 0 }; dots[i].setAttribute("cx", f2(pt.x)); dots[i].setAttribute("cy", f2(pt.y)); dots[i].setAttribute("opacity", f2(Math.sin(q * Math.PI))); }), svg);
  },
  clock(svg) {
    const cx = 120, cy = 78, R = 58, g = el("g", { transform: `translate(${cx} ${cy})` }, svg);
    let d = "";
    for (let i = 0; i < 96; i++) { const a = i / 96 * TAU - Math.PI / 2, r2 = i % 4 ? R - 4 : R - 9; d += `M${f2(Math.cos(a) * R)} ${f2(Math.sin(a) * R)}L${f2(Math.cos(a) * r2)} ${f2(Math.sin(a) * r2)}`; }
    el("path", { d, stroke: C.MUTE, "stroke-width": .8 }, g);
    const h = n => n / 24 * TAU - Math.PI / 2;
    el("path", { d: arc(0, 0, R - 15, h(5), h(12)), fill: "none", stroke: C.BRASS, "stroke-width": 5, opacity: .75 }, g);
    ["00", "06", "12", "18"].forEach((s, i) => { const a = h(i * 6); text(g, Math.cos(a) * (R + 10), Math.sin(a) * (R + 10) + 3, s, { "font-size": 8, fill: C.MUTE, "text-anchor": "middle" }); });
    const hand = el("line", { x1: 0, y1: 0, x2: 0, y2: -(R - 12), stroke: C.IVORY, "stroke-width": 1.4, "stroke-linecap": "round" }, g);
    el("circle", { r: 3, fill: C.BRASS }, g);
    animate(t => { hand.setAttribute("transform", `rotate(${f2(t * 30 % 360)})`); }, svg);
  }
};
function polarArc(cx, cy, rx, ry, a0, a1, steps = 48) {
  let d = "";
  for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; d += (i ? "L" : "M") + f2(cx + Math.cos(a) * rx) + " " + f2(cy + Math.sin(a) * ry); }
  return d;
}
export function renderIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach(host => {
    const svg = svgEl("0 0 240 150");
    host.appendChild(svg); // in the document first, so paths can be measured
    ICONS[host.dataset.icon](svg);
  });
}

/* ---------- schematics: the explanatory diagrams ---------- */
// Rounded orthogonal path through points.
function rounded(pts, r = 10) {
  let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), k = Math.min(r, l1 / 2, l2 / 2);
    if (!l1 || !l2) continue;
    d += `L${f2(x - (x - px) / l1 * k)} ${f2(y - (y - py) / l1 * k)}Q${f2(x)} ${f2(y)} ${f2(x + (nx - x) / l2 * k)} ${f2(y + (ny - y) / l2 * k)}`;
  }
  const e = pts[pts.length - 1];
  return d + `L${f2(e[0])} ${f2(e[1])}`;
}
// schematic(svg, spec): labelled node cards joined by fine rules; a brass diamond carries the "packet"
// along each step of `sequence` (a list of steps, each a list of link indexes that run together), and a
// card's border lights up when the packet arrives.
// node: { id, x, y, label, sub, glyph, tone: "plain"|"core"|"brass", w }
// link: { from, to, via: [[x, y]…], axis: "x"|"y" }; tag: { link, text, accent } or { at: [x, y], text }
export function schematic(svg, { nodes, links = [], sequence, tags = [], step = 1.15, rest = .9 }) {
  const N = new Map(nodes.map(n => {
    const label = n.label.toUpperCase(), sub = n.sub || "";
    const w = n.w || Math.max(120, (n.glyph ? 46 : 18) + Math.max(label.length * 7.1, sub.length * 5.7) + 16);
    return [n.id, { tone: "plain", h: 52, ...n, label, sub, w }];
  }));
  const lg = el("g", {}, svg), ng = el("g", {}, svg), tg = el("g", {}, svg), pg = el("g", { "data-anim": "" }, svg);
  const edge = (n, toward) => { const [tx, ty] = toward, dx = tx - n.x, dy = ty - n.y; return Math.abs(dx) / n.w > Math.abs(dy) / n.h ? [n.x + Math.sign(dx) * n.w / 2, n.y] : [n.x, n.y + Math.sign(dy) * n.h / 2]; };
  const L = links.map(l => {
    const A = N.get(l.from), B = N.get(l.to);
    let pts;
    if (l.via) pts = [edge(A, l.via[0]), ...l.via, edge(B, l.via[l.via.length - 1])];
    else {
      const axis = l.axis || (Math.abs(B.x - A.x) >= Math.abs(B.y - A.y) ? "x" : "y");
      if (axis === "x") {
        const a = [A.x + Math.sign(B.x - A.x) * A.w / 2, A.y], b = [B.x - Math.sign(B.x - A.x) * B.w / 2, B.y];
        if (Math.abs(a[1] - b[1]) < .5) pts = [a, b];
        else { const mx = l.mid ?? (a[0] + b[0]) / 2; pts = [a, [mx, a[1]], [mx, b[1]], b]; }
      } else {
        const a = [A.x, A.y + Math.sign(B.y - A.y) * A.h / 2], b = [B.x, B.y - Math.sign(B.y - A.y) * B.h / 2];
        if (Math.abs(a[0] - b[0]) < .5) pts = [a, b];
        else { const my = l.mid ?? (a[1] + b[1]) / 2; pts = [a, [a[0], my], [b[0], my], b]; }
      }
    }
    const d = rounded(pts);
    el("path", { d, fill: "none", stroke: C.LINE, "stroke-width": 3.2, "stroke-linecap": "round" }, lg);
    const flow = el("path", { d, fill: "none", stroke: l.muted ? C.MUTE : C.STEEL, "stroke-width": 1, "stroke-dasharray": "2 5", "stroke-linecap": "round" }, lg);
    animate(t => flow.setAttribute("stroke-dashoffset", f2(-t * 14)), svg);
    const end = pts[pts.length - 1], prev = pts[pts.length - 2], ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
    el("path", { d: `M${f2(end[0] - Math.cos(ang - .45) * 7)} ${f2(end[1] - Math.sin(ang - .45) * 7)}L${f2(end[0])} ${f2(end[1])}L${f2(end[0] - Math.cos(ang + .45) * 7)} ${f2(end[1] - Math.sin(ang + .45) * 7)}`, fill: "none", stroke: C.MUTE, "stroke-width": 1.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, lg);
    return { ...l, path: flow, to: B, pts };
  });
  const frames = new Map();
  for (const n of N.values()) {
    const g = el("g", { transform: `translate(${f2(n.x)} ${f2(n.y)})` }, ng), x0 = -n.w / 2, y0 = -n.h / 2;
    const col = n.tone === "brass" ? C.BRASS : n.tone === "core" ? C.IVORY : C.LINE;
    el("rect", { x: x0, y: y0, width: n.w, height: n.h, rx: 8, fill: n.tone === "core" ? C.BG3 : C.BG2, stroke: col, "stroke-width": n.tone === "plain" ? 1 : 1.2 }, g);
    if (n.tone === "core") el("rect", { x: x0 + 3.5, y: y0 + 3.5, width: n.w - 7, height: n.h - 7, rx: 5, fill: "none", stroke: C.LINE, "stroke-width": .8, "stroke-dasharray": "1 3" }, g);
    const flash = el("rect", { x: x0, y: y0, width: n.w, height: n.h, rx: 8, fill: "none", stroke: C.BRASS, "stroke-width": 1.6, opacity: 0 }, g);
    frames.set(n.id, flash);
    let tx = x0 + 14;
    if (n.glyph) {
      el("circle", { cx: x0 + 24, cy: 0, r: 13, fill: C.BG, stroke: n.tone === "brass" ? C.BRASS : C.LINE }, g);
      glyphAt(g, n.glyph, x0 + 24, 0, 16, n.tone === "brass" ? C.BRASS : C.IVORY);
      tx = x0 + 46;
    }
    text(g, tx, n.sub ? -2 : 3.6, n.label, { "font-size": 10.5, "font-weight": 600, fill: n.tone === "brass" ? C.BRASS : C.IVORY, "letter-spacing": ".08em" });
    if (n.sub) text(g, tx, 12, n.sub, { "font-size": 9, fill: C.MUTE });
  }
  for (const tg0 of tags) {
    let at = tg0.at;
    if (tg0.link != null) { const p = L[tg0.link].pts, i = Math.floor((p.length - 1) / 2); at = [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2]; }
    const w = tg0.text.length * 5.9 + 18, g = el("g", { transform: `translate(${f2(at[0])} ${f2(at[1])})` }, tg);
    el("rect", { x: -w / 2, y: -9, width: w, height: 18, rx: 9, fill: C.BG, stroke: tg0.accent ? C.BRASS : C.LINE }, g);
    text(g, 0, 3.2, tg0.text, { "font-size": 8.5, "font-weight": 600, fill: tg0.accent ? C.BRASS : C.IVORY, "text-anchor": "middle", "letter-spacing": ".1em" });
  }
  const steps = sequence || L.map((_, i) => [i]);
  const packets = L.map(() => { const g = el("g", { opacity: 0 }, pg); diamond(g, 4.6); return g; });
  const cycle = steps.length * step + rest;
  animate(t => {
    const tc = t % cycle, k = Math.floor(tc / step), p = (tc - k * step) / step;
    L.forEach((l, i) => {
      const on = steps[k] && steps[k].includes(i), g = packets[i], len = l.path.getTotalLength?.() || 0;
      if (!on || !len) { g.setAttribute("opacity", 0); return; }
      const q = ease(Math.min(1, p * 1.15)), pt = l.path.getPointAtLength(q * len);
      g.setAttribute("transform", `translate(${f2(pt.x)} ${f2(pt.y)})`);
      g.setAttribute("opacity", p > .92 ? 0 : 1);
    });
    for (const [id, fr] of frames) {
      const hot = L.some((l, i) => l.to.id === id && ((steps[k]?.includes(i) && p > .85) || (k > 0 && steps[k - 1]?.includes(i) && p < .4)));
      fr.setAttribute("opacity", hot ? 1 : 0);
    }
  }, svg, step * .6);
}

// A transaction as a printed ledger slip: its instructions print in one by one, top to bottom.
export function ledger(svg, { title = "ONE TRANSACTION", rows, w = 320 }) {
  const rh = 30, top = 46, h = top + rows.length * rh + 34;
  // torn receipt edge: from the bottom-right corner, zigzag leftwards to the bottom-left, then up the left side
  const teeth = Math.round(w / 12), zig = Array.from({ length: teeth }, (_, i) => `L${f2(w - (i + 1) * w / teeth)} ${h + (i % 2 ? 0 : 6)}`).join("");
  el("path", { d: `M0 8Q0 0 8 0H${w - 8}Q${w} 0 ${w} 8V${h}${zig}Z`, fill: C.BG2, stroke: C.LINE, "stroke-linejoin": "round" }, svg);
  text(svg, 18, 26, title, { "font-size": 10, "font-weight": 600, fill: C.IVORY, "letter-spacing": ".16em" });
  text(svg, w - 18, 26, "v0 · SOLANA", { "font-size": 9, fill: C.MUTE, "text-anchor": "end", "letter-spacing": ".1em" });
  el("line", { x1: 18, y1: 36, x2: w - 18, y2: 36, stroke: C.LINE, "stroke-dasharray": "2 3" }, svg);
  const gs = rows.map((r, i) => {
    const g = el("g", { transform: `translate(0 ${top + i * rh})` }, svg);
    if (r.accent) el("rect", { x: 10, y: 2, width: w - 20, height: rh - 4, rx: 6, fill: C.BRASS, opacity: .1 }, g);
    text(g, 18, 19, String(i + 1).padStart(2, "0"), { "font-size": 9, fill: C.MUTE });
    text(g, 44, 19, r.label, { "font-size": 10, "font-weight": 600, fill: r.accent ? C.BRASS : C.IVORY, "letter-spacing": ".06em" });
    if (r.note) text(g, w - 18, 19, r.note, { "font-size": 9, fill: C.MUTE, "text-anchor": "end" });
    return g;
  });
  const foot = text(svg, 18, h - 12, "SIGNED ONCE · SENT ONCE", { "font-size": 9, fill: C.BRASS, "letter-spacing": ".14em" });
  const n = rows.length, cycle = n * .45 + 3.2;
  animate(t => {
    const tc = t % cycle;
    gs.forEach((g, i) => { const p = clamp((tc - i * .45) / .35); g.setAttribute("opacity", f2(tc > cycle - .5 ? (cycle - tc) / .5 : p)); });
    foot.setAttribute("opacity", tc > n * .45 && tc < cycle - .5 ? 1 : 0);
  }, svg, 99);
}

// A bonding curve that fills; at 100% its liquidity moves to a pool.
export function curveChart(svg) {
  const W = 300, H = 170, x0 = 0, y0 = H;
  el("path", { d: `M0 0V${H}H${W}`, fill: "none", stroke: C.LINE, "stroke-width": 1.2 }, svg);
  for (let i = 1; i < 5; i++) el("line", { x1: 0, x2: W, y1: H - i * H / 5, y2: H - i * H / 5, stroke: C.LINE, "stroke-width": .6, "stroke-dasharray": "2 4" }, svg);
  text(svg, 0, H + 18, "TOKENS SOLD →", { "font-size": 8.5, fill: C.MUTE, "letter-spacing": ".12em" });
  text(svg, -8, 4, "PRICE", { "font-size": 8.5, fill: C.MUTE, "letter-spacing": ".12em", "text-anchor": "end" });
  const curvePts = p => { let d = `M${x0} ${y0}`; for (let i = 1; i <= 60; i++) { const u = i / 60 * p; d += `L${f2(u * W)} ${f2(H - (u ** 2.2) * (H - 10))}`; } return d; };
  const area = el("path", { fill: C.BRASS, opacity: .1 }, svg), line = el("path", { fill: "none", stroke: C.BRASS, "stroke-width": 1.8 }, svg);
  const tip = el("circle", { r: 4, fill: C.BRASS, stroke: C.BG, "stroke-width": 1.5 }, svg);
  const lab = text(svg, 0, 0, "", { "font-size": 9.5, "font-weight": 600, fill: C.IVORY, "letter-spacing": ".1em" });
  const pool = el("g", { transform: `translate(${W + 70} ${H / 2})` }, svg);
  el("circle", { r: 30, fill: C.BG2, stroke: C.LINE }, pool);
  const poolRing = el("circle", { r: 30, fill: "none", stroke: C.BRASS, "stroke-width": 1.4, opacity: 0 }, pool);
  glyphAt(pool, "pool", 0, -4, 20, C.IVORY);
  text(pool, 0, 48, "AMM POOL", { "font-size": 9, fill: C.MUTE, "text-anchor": "middle", "letter-spacing": ".12em" });
  const link = el("path", { d: `M${W} 10C${W + 30} 10 ${W + 20} ${H / 2} ${W + 40} ${H / 2}`, fill: "none", stroke: C.STEEL, "stroke-dasharray": "2 4" }, svg);
  const pk = el("g", { opacity: 0, "data-anim": "" }, svg); diamond(pk, 4.6);
  animate(t => {
    const c = t % 7.5, p = Math.min(1, c / 4.8), e = p * (2 - p);
    line.setAttribute("d", curvePts(e)); area.setAttribute("d", curvePts(e) + `L${f2(e * W)} ${H}Z`);
    const tx = e * W, ty = H - (e ** 2.2) * (H - 10);
    tip.setAttribute("cx", f2(tx)); tip.setAttribute("cy", f2(ty));
    lab.setAttribute("x", f2(Math.min(tx + 10, W - 96))); lab.setAttribute("y", f2(Math.max(ty - 10, 14)));
    lab.textContent = p < 1 ? `CURVE ${Math.round(e * 100)}%` : "MIGRATING";
    const m = clamp((c - 5) / 1.3), L = link.getTotalLength?.() || 0;
    if (L && m > 0 && m < 1) { const pt = link.getPointAtLength(ease(m) * L); pk.setAttribute("opacity", 1); pk.setAttribute("transform", `translate(${f2(pt.x)} ${f2(pt.y)})`); } else pk.setAttribute("opacity", 0);
    poolRing.setAttribute("opacity", c > 6.2 ? 1 : 0);
  }, svg, 6.4);
}

/* ---------- emblems for empty states in the terminal ---------- */
// The Ardea heron mark (or, for "chart", a line that keeps drawing itself).
export function emblem(kind = "stream") {
  const svg = svgEl("0 0 200 120");
  if (kind === "chart") {
    el("path", { d: "M30 96H170", stroke: C.LINE, "stroke-width": 1.2 }, svg);
    const pts = [[30, 84], [52, 78], [70, 86], [92, 62], [112, 68], [132, 44], [150, 50], [170, 30]];
    const d = "M" + pts.map(p => p.join(" ")).join("L"), ln = el("path", { d, fill: "none", stroke: C.BRASS, "stroke-width": 1.8, "stroke-linejoin": "round" }, svg);
    const dot = el("circle", { r: 3.5, fill: C.BRASS }, svg);
    animate(t => { const L = ln.getTotalLength?.() || 300, p = Math.min(1, (t % 4) / 2.6); ln.setAttribute("stroke-dasharray", `${f2(L)} ${f2(L)}`); ln.setAttribute("stroke-dashoffset", f2(L * (1 - p))); const pt = ln.getPointAtLength ? ln.getPointAtLength(p * L) : { x: 170, y: 30 }; dot.setAttribute("cx", f2(pt.x)); dot.setAttribute("cy", f2(pt.y)); }, svg, 3);
    return svg;
  }
  // the heron, standing still while there is nothing to show
  const m = el("svg", { x: 62, y: 14, width: 76, height: 84, overflow: "visible" }, svg);
  logoMark(m, { sheen: false });
  return svg;
}
