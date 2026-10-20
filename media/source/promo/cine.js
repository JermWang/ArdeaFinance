// Cinematic scene kit for Ardea's promo images. Same engraving language as art.js (guilloché bands,
// banknote waves, the vault dial), lit like a film still: light pools and beams, perspective floors,
// depth-of-field blur, bokeh, an anamorphic flare, grain and a vignette. Self-contained on purpose so
// the renders don't shift when the site's art.js changes.
export const C = { BG: "#05080D", NAVY: "#0B0F1A", NAVY2: "#101722", LINE: "#27324C", IVORY: "#F1ECE4", MUTE: "#8B93A1", STEEL: "#5D7596", STEEL2: "#8FA9CC", BRASS: "#FF6600", BRASS2: "#FF8A3D", DOWN: "#F06A6A" };
const NS = "http://www.w3.org/2000/svg", TAU = Math.PI * 2, f2 = n => n.toFixed(2);
let uid = 0;
export function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export function div(cls, parent, style = "") { const d = document.createElement("div"); d.className = cls; if (style) d.style.cssText = style; (parent || document.body).appendChild(d); return d; }
// seeded random, so every render of a scene is identical
export function rng(seed = 7) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

export function polar(fn, steps = 360) {
  let d = "";
  for (let i = 0; i <= steps; i++) { const a = i / steps * TAU, r = fn(a); d += (i ? "L" : "M") + f2(Math.cos(a) * r) + " " + f2(Math.sin(a) * r); }
  return d + "Z";
}
export function arc(cx, cy, r, a0, a1) {
  const large = ((a1 - a0) % TAU + TAU) % TAU > Math.PI ? 1 : 0;
  return `M${f2(cx + Math.cos(a0) * r)} ${f2(cy + Math.sin(a0) * r)}A${r} ${r} 0 ${large} 1 ${f2(cx + Math.cos(a1) * r)} ${f2(cy + Math.sin(a1) * r)}`;
}
export function guilloche(parent, { r, amp, k, copies = 12, stroke = C.STEEL, sw = .8, opacity = .8, steps = 900, shape = Math.sin, filter }) {
  let d = "";
  for (let i = 0; i < copies; i++) { const ph = i / copies * TAU; d += polar(a => r + amp * shape(k * a + ph), steps); }
  const p = el("path", { d, fill: "none", stroke, "stroke-width": sw, opacity }, parent);
  if (filter) p.setAttribute("filter", filter);
  return p;
}
function glowFilter(defs, std = 5, strength = 1.6) {
  const id = "glow" + uid++, f = el("filter", { id, x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
  el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: std, result: "b" }, f);
  const ct = el("feComponentTransfer", { in: "b", result: "bb" }, f); el("feFuncA", { type: "linear", slope: strength }, ct);
  const m = el("feMerge", {}, f); el("feMergeNode", { in: "bb" }, m); el("feMergeNode", { in: "SourceGraphic" }, m);
  return `url(#${id})`;
}

// The seal: woven bands, a ticked bezel and a brass core, with an optional gap (wedge) cut out.
// Draws in a -320..320 box. Returns the <svg>.
export function seal({ gap = true, gapA = -0.9, gapW = .34, label = true, glow = true, dense = 1, brassOnly = false, core = true } = {}) {
  const svg = el("svg", { viewBox: "-320 -320 640 640" }), defs = el("defs", {}, svg);
  const g = glow ? glowFilter(defs, 4, 1.2) : null, gb = glow ? glowFilter(defs, 9, 2.2) : null;
  let host = svg;
  if (gap) {
    const id = "gap" + uid++, m = el("mask", { id }, defs);
    el("rect", { x: -400, y: -400, width: 800, height: 800, fill: "#fff" }, m);
    const w = gapW / 2, R = 420;
    el("path", { d: `M0 0L${f2(Math.cos(gapA - w) * R)} ${f2(Math.sin(gapA - w) * R)}A${R} ${R} 0 0 1 ${f2(Math.cos(gapA + w) * R)} ${f2(Math.sin(gapA + w) * R)}Z`, fill: "#000" }, m);
    host = el("g", { mask: `url(#${id})` }, svg);
  }
  guilloche(host, { r: 248, amp: 22, k: 16, copies: Math.round(12 * dense), stroke: brassOnly ? C.BRASS : C.STEEL2, sw: .9, opacity: .75, filter: g });
  guilloche(host, { r: 182, amp: 17, k: 11, copies: Math.round(10 * dense), stroke: C.BRASS, sw: 1, opacity: .9, filter: gb });
  guilloche(host, { r: 112, amp: 20, k: 8, copies: Math.round(8 * dense), stroke: brassOnly ? C.BRASS2 : C.IVORY, sw: .8, opacity: .55, shape: Math.cos, filter: g });
  el("circle", { r: 286, fill: "none", stroke: C.IVORY, "stroke-width": 1.2, opacity: .55 }, host);
  let ticks = "";
  for (let i = 0; i < 240; i++) { const a = i / 240 * TAU, r1 = 294, r2 = i % 10 ? 302 : 312; ticks += `M${f2(Math.cos(a) * r1)} ${f2(Math.sin(a) * r1)}L${f2(Math.cos(a) * r2)} ${f2(Math.sin(a) * r2)}`; }
  el("path", { d: ticks, stroke: C.MUTE, "stroke-width": 1, opacity: .7 }, host);
  if (gap) [gapA - gapW / 2, gapA + gapW / 2].forEach(a => el("line", { x1: f2(Math.cos(a) * 70), y1: f2(Math.sin(a) * 70), x2: f2(Math.cos(a) * 316), y2: f2(Math.sin(a) * 316), stroke: C.BRASS2, "stroke-width": 2, filter: gb }, svg));
  if (core) {
    el("circle", { r: 70, fill: C.BG, stroke: C.LINE, "stroke-width": 1.5 }, svg);
    el("circle", { r: 70, fill: "none", stroke: C.BRASS, "stroke-width": 1.6, opacity: .8, filter: gb }, svg);
    if (label) {
      const t = (y, s, size, fill, ls, w = 400) => { const e = el("text", { x: 0, y, "text-anchor": "middle", "font-family": "'IBM Plex Mono', monospace", "font-size": size, "font-weight": w, fill, "letter-spacing": ls }, svg); e.textContent = s; };
      t(-2, "NEAR", 19, C.IVORY, ".26em", 600); t(20, "INTENTS", 11, C.MUTE, ".3em");
    } else el("circle", { r: 14, fill: C.BRASS, filter: gb }, svg);
  }
  return svg;
}

// The vault-dial mark, lit: metallic ivory rings, a glowing brass core. 0..32 box.
export function mark({ outerRot = 0, innerRot = 0 } = {}) {
  const svg = el("svg", { viewBox: "0 0 32 32", overflow: "visible" }), defs = el("defs", {}, svg);
  const lg = "met" + uid++, g = el("linearGradient", { id: lg, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  [[0, "#FFF8EA"], [.45, "#F1ECE4"], [.7, "#B9B1A0"], [1, "#F5EEDF"]].forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, g));
  const rg = "core" + uid++, r = el("radialGradient", { id: rg }, defs);
  [[0, "#FFF1C8"], [.55, C.BRASS], [1, "#8C6C33"]].forEach(([o, c]) => el("stop", { offset: o, "stop-color": c }, r));
  const glow = glowFilter(defs, .9, 1.6), soft = glowFilter(defs, .35, .8);
  const ring = (rad, gapDeg, sw, rot) => { const gg = gapDeg / 2 * Math.PI / 180, c = -Math.PI / 4; return el("path", { d: arc(16, 16, rad, c + gg, c - gg + TAU), fill: "none", stroke: `url(#${lg})`, "stroke-width": sw, "stroke-linecap": "round", transform: `rotate(${rot} 16 16)`, filter: soft }, svg); };
  ring(12.6, 62, 2.5, outerRot); ring(7.2, 96, 2.5, innerRot);
  el("circle", { cx: 16, cy: 16, r: 2.3, fill: `url(#${rg})`, filter: glow }, svg);
  return svg;
}

// Banknote waves as a flat sheet (to be laid in perspective as a floor or wall).
export function wavesSheet(w, h, { gap = 14, amp = 6, period = 110, stroke = C.STEEL2, sw = 1 } = {}) {
  const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h });
  let d = "";
  for (let y = 0, i = 0; y <= h; y += gap, i++) for (let x = 0; x <= w; x += 6) d += (x ? "L" : "M") + f2(x) + " " + f2(y + Math.sin(x / period * TAU + i * .55) * amp);
  el("path", { d, fill: "none", stroke, "stroke-width": sw }, svg);
  return svg;
}

/* ---------- lighting and lens ---------- */
const NOISE = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.2 0'/></filter><rect width='300' height='300' filter='url(#n)'/></svg>`)}")`;
export function finish({ grain = .14, vignette = .82, letterbox = 0 } = {}) {
  div("fx", null, `background:radial-gradient(ellipse 75% 70% at 50% 50%,transparent 45%,rgba(0,0,0,${vignette}) 100%)`);
  div("fx", null, `background-image:${NOISE};opacity:${grain};mix-blend-mode:overlay`);
  if (letterbox) { div("fx", null, `bottom:auto;height:${letterbox}px;background:#000`); div("fx", null, `top:auto;height:${letterbox}px;background:#000`); }
}
export function lightPool(x, y, r, color = C.BRASS, alpha = .35, parent) {
  return div("fx", parent, `background:radial-gradient(circle ${r}px at ${x}px ${y}px,${hexA(color, alpha)},transparent 70%);mix-blend-mode:screen`);
}
export function beam(x, y, angleDeg, length, width, color = C.BRASS2, alpha = .5, parent) {
  // a soft cone of light: the wedge is clipped inside, the wrapper blurs its edges
  const wrap = div("beam", parent, `left:${x}px;top:${y - width / 2}px;width:${length}px;height:${width}px;right:auto;bottom:auto;transform-origin:0 50%;transform:rotate(${angleDeg}deg);filter:blur(${Math.max(10, width / 9)}px);mix-blend-mode:screen`);
  div("fx", wrap, `background:linear-gradient(90deg,${hexA(color, alpha)},${hexA(color, alpha * .4)} 45%,transparent 95%);clip-path:polygon(0 44%,100% 0,100% 100%,0 56%)`);
  return wrap;
}
export function flare(x, y, w = 900, color = C.BRASS2, parent) {
  div("fx", parent, `left:${x - w / 2}px;top:${y - 1.5}px;width:${w}px;height:3px;right:auto;bottom:auto;background:linear-gradient(90deg,transparent,${hexA(color, .9)} 50%,transparent);filter:blur(1.5px);mix-blend-mode:screen`);
  div("fx", parent, `left:${x - w * .35}px;top:${y - 14}px;width:${w * .7}px;height:28px;right:auto;bottom:auto;background:radial-gradient(ellipse at center,${hexA(color, .35)},transparent 70%);filter:blur(6px);mix-blend-mode:screen`);
  div("fx", parent, `left:${x - 60}px;top:${y - 60}px;width:120px;height:120px;right:auto;bottom:auto;border-radius:50%;background:radial-gradient(circle,${hexA("#FFFFFF", .9)},${hexA(color, .5)} 18%,transparent 62%);mix-blend-mode:screen`);
}
export function bokeh(n, { x0, y0, x1, y1, rMin = 6, rMax = 40, blur = [4, 14], colors = [C.BRASS, C.STEEL2, C.IVORY], alpha = [.06, .22], seed = 3, parent } = {}) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const r = rMin + R() * (rMax - rMin), x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0), c = colors[Math.floor(R() * colors.length)], a = alpha[0] + R() * (alpha[1] - alpha[0]);
    div("fx", parent, `left:${x - r}px;top:${y - r}px;width:${r * 2}px;height:${r * 2}px;right:auto;bottom:auto;border-radius:50%;background:radial-gradient(circle,${hexA(c, a * .6)} 0 55%,${hexA(c, a)} 70%,transparent 74%);filter:blur(${blur[0] + R() * (blur[1] - blur[0])}px);mix-blend-mode:screen`);
  }
}
export function dust(n, { x0, y0, x1, y1, seed = 9, parent, color = C.BRASS2 } = {}) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) { const s = .6 + R() * 1.8; div("fx", parent, `left:${x0 + R() * (x1 - x0)}px;top:${y0 + R() * (y1 - y0)}px;width:${s}px;height:${s}px;right:auto;bottom:auto;border-radius:50%;background:${color};opacity:${.15 + R() * .55};box-shadow:0 0 ${s * 3}px ${color}`); }
}
export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
