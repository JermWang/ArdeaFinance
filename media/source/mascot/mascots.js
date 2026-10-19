// Three mascot concepts for Privatus, drawn on a 64-unit grid in the house style: bold ivory forms,
// navy cut-outs, one brass detail, a little guilloché engraving on the body. Each returns an <svg> and
// animates itself while it's on the page.
const NS = "http://www.w3.org/2000/svg";
export const C = { NAVY: "#0A0E14", IVORY: "#EFE9DC", IVORY2: "#D9D1BF", STEEL: "#5D7596", STEEL2: "#8FA9CC", BRASS: "#D6B26E", BRASS2: "#F3D79A" };
let uid = 0;
const el = (tag, a = {}, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const f2 = n => n.toFixed(2);
const loop = fn => { const t0 = performance.now(); const step = now => { fn((now - t0) / 1000); requestAnimationFrame(step); }; requestAnimationFrame(step); };
const blinkAt = (t, every = 3.4, off = 0) => { const c = (t + off) % every; return c < .12 ? 1 - Math.sin(c / .12 * Math.PI) * .92 : 1; };
// engraved wave lines clipped to a shape
function engrave(svg, defs, shapeD, { y0, y1, gap = 3.2, amp = .9, period = 9, color = C.NAVY, op = .22 }) {
  const id = "cl" + uid++, cp = el("clipPath", { id }, defs); el("path", { d: shapeD }, cp);
  let d = "";
  for (let y = y0, i = 0; y <= y1; y += gap, i++) for (let x = 0; x <= 64; x += 1) d += (x ? "L" : "M") + f2(x) + " " + f2(y + Math.sin(x / period * 6.283 + i * .8) * amp);
  return el("path", { d, fill: "none", stroke: color, "stroke-width": .55, opacity: op, "clip-path": `url(#${id})` }, svg);
}

/* ---------- 1. Octopus: escapes in a cloud of ink ---------- */
export function octopus({ animate = true, engraved = true } = {}) {
  const svg = el("svg", { viewBox: "0 0 64 64", overflow: "visible" }), defs = el("defs", {}, svg);
  const ink = el("g", {}, svg);
  const tents = [
    { root: [19, 37], d: "M19 37C17 44 11 45 9 51C8 54 11 56 13 54", ph: 0 },
    { root: [25, 39], d: "M25 39C24 46 20 50 21 55C21.5 58 25 58 25.5 55.5", ph: .7 },
    { root: [32, 40], d: "M32 40C32 47 30 52 32 57C33 59.5 36 58.5 35.5 56", ph: 1.4 },
    { root: [39, 39], d: "M39 39C40 46 44 50 43 55C42.5 58 39 58 38.5 55.5", ph: 2.1 },
    { root: [45, 37], d: "M45 37C47 44 53 45 55 51C56 54 53 56 51 54", ph: 2.8 }
  ].map(tn => ({ ...tn, el: el("path", { d: tn.d, fill: "none", stroke: C.IVORY, "stroke-width": 4.6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg) }));
  const mantle = "M13 35C13 18 21 7 32 7C43 7 51 18 51 35C51 39 46 41 32 41C18 41 13 39 13 35Z";
  el("path", { d: mantle, fill: C.IVORY }, svg);
  if (engraved) engrave(svg, defs, mantle, { y0: 9, y1: 22, gap: 2.8 });
  // a brass band across the brow, like a banknote seal
  el("path", { d: "M17.5 23.5C22 21.5 42 21.5 46.5 23.5", fill: "none", stroke: C.BRASS, "stroke-width": 1.6, "stroke-linecap": "round" }, svg);
  const eyes = [[25, 30], [39, 30]].map(([x, y]) => { const g = el("g", { transform: `translate(${x} ${y})` }, svg), lid = el("g", {}, g); el("ellipse", { rx: 4.3, ry: 4.8, fill: C.NAVY }, lid); const pu = el("circle", { r: 1.5, cx: 1, cy: -1.4, fill: C.IVORY }, lid); return { lid, pu }; });
  if (animate) loop(t => {
    tents.forEach(tn => tn.el.setAttribute("transform", `rotate(${f2(Math.sin(t * 1.6 + tn.ph) * 7)} ${tn.root[0]} ${tn.root[1]})`));
    const b = blinkAt(t);
    eyes.forEach(e => e.lid.setAttribute("transform", `scale(1 ${f2(b)})`));
    // every 5 s it puffs a cloud of ink and is "gone" behind it for a beat
    const c = t % 5;
    ink.textContent = "";
    if (c > 3.4) {
      const p = (c - 3.4) / 1.6;
      [[-8, 4, 7], [4, 8, 9], [14, 2, 6], [-2, -4, 8], [10, -6, 5]].forEach(([dx, dy, r], i) => el("circle", { cx: 32 + dx * (.4 + p * 1.6), cy: 46 + dy * (.4 + p * 1.4) + p * 6, r: r * (.3 + p * 1.1), fill: i % 2 ? C.STEEL : C.NAVY, stroke: C.STEEL2, "stroke-width": .5, opacity: f2(Math.sin(p * Math.PI) * .9) }, ink));
    }
  });
  return svg;
}

/* ---------- 2. Chameleon: blends in; its tail is the dial ---------- */
export function chameleon({ animate = true, engraved = true, tongue = true, branch = true, camo = true, tone = "ivory" } = {}) {
  // tone "ink" draws it in navy for light backgrounds
  const FG = tone === "ink" ? "#101722" : C.IVORY, LINE = tone === "ink" ? C.IVORY : C.NAVY;
  const svg = el("svg", { viewBox: "0 0 64 64", overflow: "visible" }), defs = el("defs", {}, svg);
  if (branch) el("path", { d: "M3 52.5C18 51.2 40 51.2 61 52.8", fill: "none", stroke: C.STEEL, "stroke-width": 2.2, "stroke-linecap": "round" }, svg);
  // tail: one spiral that winds into the dial, ending in the brass core
  const cx = 14.2, cy = 38.6;
  let d = "M24.5 38.8C22 36.6 21 34 ";
  let end = [cx, cy];
  for (let i = 0; i <= 140; i++) { const u = i / 140, a = -0.15 - u * 7.4, r = 10.8 - u * 6.6; end = [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; d += (i ? "L" : "") + f2(end[0]) + " " + f2(end[1]); }
  el("path", { d, fill: "none", stroke: FG, "stroke-width": 3.8, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
  el("circle", { cx: f2(end[0]), cy: f2(end[1]), r: 1.55, fill: C.BRASS }, svg);
  // legs gripping the branch, toes wrapped round it
  const legs = el("g", { stroke: FG, "stroke-width": 3.4, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" }, svg);
  el("path", { d: "M30 40.5L27.2 46.4L29 51.2M29 51.2L26.6 53.6M29 51.2L31.4 53.8" }, legs);
  el("path", { d: "M45.5 40L49.2 45.6L47.4 51.4M47.4 51.4L45 53.8M47.4 51.4L49.8 53.8" }, legs);
  // body and casque head
  const body = "M23 38C22 28.5 30 20.6 40 20C44 19.8 46.9 20.3 49 21.6L52.4 15.6C52.9 14.8 54 14.8 54.5 15.6L60.6 26C61.7 27.9 61 30 59 30.6L53.2 32.4C51.2 37.2 47 41.6 40 42.6C33 43.6 26 42.6 23 38Z";
  const skinG = el("g", {}, svg);
  const skin = el("path", { d: body, fill: FG }, skinG);
  if (engraved) {
    const id = "cb" + uid++, cp = el("clipPath", { id }, defs); el("path", { d: body }, cp);
    // fine arcs that follow the arch of the back, like engraved banknote line work
    let ld = "";
    for (let r = 6; r < 30; r += 2.1) for (let s = 0; s <= 48; s++) { const a = Math.PI + s / 48 * Math.PI, rr = r + Math.sin(s * .9 + r) * .35; ld += (s ? "L" : "M") + f2(40 + Math.cos(a) * rr * 1.25) + " " + f2(46 + Math.sin(a) * rr); }
    el("path", { d: ld, fill: "none", stroke: LINE, "stroke-width": .4, opacity: .085, "clip-path": `url(#${id})` }, skinG);
  }
  // brass stripe along the flank
  el("path", { d: "M27.5 37.2C33 38.6 42 38 50.5 33.4", fill: "none", stroke: C.BRASS, "stroke-width": 1.7, "stroke-linecap": "round" }, svg);
  // casque ridge and smile
  el("path", { d: "M49.4 22.1L53.4 17", fill: "none", stroke: LINE, "stroke-width": .9, "stroke-linecap": "round", opacity: .35 }, svg);
  el("path", { d: "M54.4 30.6C56.3 31 58 30.6 59.6 29.8", fill: "none", stroke: LINE, "stroke-width": 1, "stroke-linecap": "round", opacity: .6 }, svg);
  // the tongue (behind the head) and the token it catches
  const tg = el("g", { opacity: 0 }, svg);
  const tLine = el("line", { x1: 59.5, y1: 29.6, x2: 59.5, y2: 29.6, stroke: "#E27F86", "stroke-width": 1.6, "stroke-linecap": "round" }, tg);
  const tTip = el("circle", { r: 1.9, fill: "#E27F86" }, tg);
  const token = el("path", { d: "M0 -3.4L3.4 0L0 3.4L-3.4 0Z", fill: C.BRASS, stroke: C.BRASS2, "stroke-width": .6, opacity: 0 }, svg);
  // turret eye
  const eye = el("g", { transform: "translate(53.2 24.6)" }, svg);
  el("circle", { r: 5, fill: C.IVORY, stroke: tone === "ink" ? "#101722" : C.NAVY, "stroke-width": 1.4 }, eye);
  el("circle", { r: 3.1, fill: "none", stroke: C.NAVY, "stroke-width": .5, opacity: .4 }, eye);
  const lid = el("g", {}, eye), pupil = el("circle", { r: 2, fill: C.NAVY }, lid), glint = el("circle", { r: .65, fill: C.BRASS2 }, lid);
  const setLook = ([x, y]) => { pupil.setAttribute("cx", x); pupil.setAttribute("cy", y); glint.setAttribute("cx", f2(x + .7)); glint.setAttribute("cy", f2(y - .7)); };
  setLook([1.4, -.3]);
  if (animate) loop(t => {
    const cyc = t % 8;
    // the eye wanders, then locks onto the token before the tongue fires
    const look = cyc > 5.2 && tongue ? [1.6, .4] : [[1.4, -.3], [-1.3, -1], [.3, 1.2], [1.5, .7], [-.8, .9]][Math.floor(t / 1.3) % 5];
    setLook(look);
    lid.setAttribute("transform", `scale(1 ${f2(blinkAt(t, 4.3, .8))})`);
    if (camo) { const c = (t % 9) / 9, k = Math.max(0, Math.sin(c * Math.PI * 2 - .5)); skin.setAttribute("fill", mix(FG, c < .5 ? C.BRASS : C.STEEL2, k * .5)); }
    if (tongue) {
      // a token floats in, the tongue snaps out, catches it and reels it back
      const tx = 74, ty = 31 + Math.sin(t * 2) * 1.2;
      const shoot = cyc > 5.9 && cyc < 6.5 ? (cyc - 5.9) / .6 : 0, p = shoot ? Math.sin(shoot * Math.PI) : 0;
      token.setAttribute("opacity", cyc > 4.2 && cyc < 6.45 ? 1 : 0);
      const tokX = cyc < 6.2 ? tx : 59.5 + (tx - 59.5) * p, tokY = cyc < 6.2 ? ty : 29.6 + (ty - 29.6) * p;
      token.setAttribute("transform", `translate(${f2(cyc > 4.2 && cyc < 5 ? tx + (5 - cyc) * 8 : tokX)} ${f2(tokY)}) rotate(${f2(t * 90)})`);
      tg.setAttribute("opacity", p > .02 ? 1 : 0);
      const ex = 59.5 + (tx - 59.5) * p, ey = 29.6 + (ty - 29.6) * p;
      tLine.setAttribute("x2", f2(ex)); tLine.setAttribute("y2", f2(ey)); tTip.setAttribute("cx", f2(ex)); tTip.setAttribute("cy", f2(ey));
    }
  });
  return svg;
}
function mix(a, b, k) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",")})`; }

/* ---------- 3. Hermit crab: lives in a vault-dial shell ---------- */
export function crab({ animate = true } = {}) {
  const svg = el("svg", { viewBox: "0 0 64 64", overflow: "visible" });
  const arcP = (cx, cy, r, a0, a1) => `M${f2(cx + Math.cos(a0) * r)} ${f2(cy + Math.sin(a0) * r)}A${r} ${r} 0 1 1 ${f2(cx + Math.cos(a1) * r)} ${f2(cy + Math.sin(a1) * r)}`;
  const legs = el("g", { stroke: C.IVORY, "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" }, svg);
  [["M24 44L19 50L20 55"], ["M29 46L27 52L29 56"], ["M35 46L37 52L36 56"]].forEach(([dd]) => el("path", { d: dd }, legs));
  // body peeking out of the shell, eyes on stalks
  el("path", { d: "M14 40C14 34 20 31 27 32L34 34L33 46C27 47 14 46 14 40Z", fill: C.IVORY }, svg);
  const stalks = el("g", {}, svg);
  const eyes = [[15.5, 23], [22.5, 21.5]].map(([x, y], i) => { const g = el("g", {}, stalks); el("path", { d: `M${18 + i * 3} 33L${x} ${y + 3}`, stroke: C.IVORY, "stroke-width": 2.4, "stroke-linecap": "round" }, g); const e = el("g", { transform: `translate(${x} ${y})` }, g), lid = el("g", {}, e); el("circle", { r: 3.6, fill: C.IVORY }, e); el("circle", { r: 2.1, fill: C.NAVY }, lid); el("circle", { r: .7, cx: .7, cy: -.7, fill: C.IVORY }, lid); return lid; });
  // claw
  const claw = el("g", {}, svg);
  el("path", { d: "M15 42C10 42 6 45 6.5 49C7 52.5 11 53.5 14 51.5", fill: "none", stroke: C.IVORY, "stroke-width": 4.2, "stroke-linecap": "round" }, claw);
  const pincer = el("path", { d: "M6.5 49C5 45.5 7 42.5 10 42", fill: "none", stroke: C.IVORY, "stroke-width": 2.6, "stroke-linecap": "round" }, claw);
  // the shell: the vault dial
  const shell = el("g", {}, svg);
  el("circle", { cx: 39, cy: 30, r: 19, fill: C.NAVY }, shell);
  const outer = el("path", { d: arcP(39, 30, 16, -0.55 + .5, -0.55 - .5), fill: "none", stroke: C.IVORY, "stroke-width": 4.4, "stroke-linecap": "round" }, shell);
  const inner = el("path", { d: arcP(39, 30, 8.8, -0.55 + .8, -0.55 - .8), fill: "none", stroke: C.IVORY, "stroke-width": 4.4, "stroke-linecap": "round" }, shell);
  el("circle", { cx: 39, cy: 30, r: 3, fill: C.BRASS }, shell);
  if (animate) loop(t => {
    const c = (t / 1.5) % 4, k = Math.floor(c), p = Math.min(1, (c - k) / .5), e = p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
    outer.setAttribute("transform", `rotate(${f2((k + e) * 90)} 39 30)`);
    inner.setAttribute("transform", `rotate(${f2(-(k + e) * 120)} 39 30)`);
    const b = blinkAt(t, 3.7);
    eyes.forEach(l => l.setAttribute("transform", `scale(1 ${f2(b)})`));
    stalks.setAttribute("transform", `rotate(${f2(Math.sin(t * 1.3) * 4)} 20 33)`);
    pincer.setAttribute("transform", `rotate(${f2(Math.max(0, Math.sin(t * 4)) * -18)} 10 42)`);
  });
  return svg;
}
export const MASCOTS = { octopus, chameleon, crab };
