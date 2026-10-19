// The Privatus mark: a chameleon as one clean silhouette in metallic gold. The only detail is the eye, cut through so it
// works on dark or on paper, and the tail is a true golden spiral (its radius shrinks by φ every quarter turn). The only motion is a slow sheen of
// light across the gold and the eye glancing now and then.
// chameleonMark(svg, opts) draws the bare mark; crest(svg, opts) sets it in a medallion with a bezel and lettering.

const NS = "http://www.w3.org/2000/svg", PHI = (1 + Math.sqrt(5)) / 2;
const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const f2 = n => n.toFixed(2);
let uid = 0;

// gold for dark grounds and a deeper gold for paper, as metallic gradient stops
const GOLD = {
  dark: [[0, "#FBEFD0"], [.22, "#E8CC8A"], [.45, "#B8904A"], [.62, "#F2DCA4"], [.82, "#C69C55"], [1, "#8C6A30"]],
  paper: [[0, "#C9A35D"], [.3, "#9C7838"], [.55, "#6E5122"], [.75, "#A8823F"], [1, "#5E441B"]]
};

/* ---------- geometry (a 120 × 80 drawing, the chameleon facing right) ---------- */
const BODY = "M34 46C36 33 48 24 62 23.5C69.5 23.2 74.6 24.4 78.2 26.8C78.8 21.4 80.8 16.2 84 13C85 12 86.4 11.9 87.4 12.8C91.6 16.8 96.4 23.6 99.6 30C100.8 32.4 100 34.8 97.8 35.4L88.6 38.4C85.6 44.6 78 49 66 49.6C54 50.2 42 50 36 48.6C34.8 48.2 34 47.2 34 46Z";
// a tapered ribbon along a centre line, as a closed path
function ribbon(pts, w) {
  const L = [], R = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, hw = w(i / (n - 1)) / 2;
    L.push([pts[i][0] - dy / len * hw, pts[i][1] + dx / len * hw]); R.push([pts[i][0] + dy / len * hw, pts[i][1] - dx / len * hw]);
  }
  const e = pts[n - 1], hw = w(1) / 2, last = Math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0]);
  const cap = [-1, -.5, 0, .5, 1].map(k => [e[0] + Math.cos(last + k * Math.PI / 2) * hw, e[1] + Math.sin(last + k * Math.PI / 2) * hw]);
  return "M" + [...L, ...cap.slice(1, -1), ...R.reverse()].map(p => p.map(f2).join(" ")).join("L") + "Z";
}
// the golden spiral tail: from the rump, over the top and inward, a quarter turn shrinking it by φ
function tail() {
  const c = [22, 50.6], r0 = 13.2, a0 = -.26, turns = 2.55, pts = [[43, 46.2], [38, 46.5]];
  for (let i = 0; i <= 220; i++) { const u = i / 220, th = a0 - u * turns * Math.PI, r = r0 * PHI ** (-(a0 - th) / (Math.PI / 2)); pts.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]); }
  return { d: ribbon(pts, u => 4.9 * (1 - u) ** 1.05 + .7), end: pts.at(-1) };
}
const curve = (d, n) => { const p = el("path", { d }), out = []; const s = el("svg", { style: "position:absolute;width:0;height:0" }); document.body.appendChild(s); s.appendChild(p); const L = p.getTotalLength(); for (let i = 0; i <= n; i++) { const q = p.getPointAtLength(L * i / n); out.push([q.x, q.y]); } s.remove(); return out; };
const limb = (d, w0, w1) => ribbon(curve(d, 30), u => w0 + (w1 - w0) * u);

/* ---------- the bare mark ---------- */
// opts: tone "dark" | "paper", branch, animate, sheen
export function chameleonMark(svg, { tone = "dark", branch = true, animate = true, sheen = true, viewBox = true } = {}) {
  const id = "pv" + uid++, defs = el("defs", {}, svg);
  const g = el("linearGradient", { id: `${id}-gold`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  for (const [o, c] of GOLD[tone]) el("stop", { offset: o, "stop-color": c }, g);
  const T = tail();
  // one cut only: the eye
  const mask = el("mask", { id: `${id}-cut`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 120, height: 80 }, defs);
  el("rect", { x: 0, y: 0, width: 120, height: 80, fill: "#fff" }, mask);
  const cuts = el("g", { fill: "none", stroke: "#000", "stroke-linecap": "round" }, mask);
  // the eye: a cut ring around a gold pupil
  const eye = [87, 26.6];
  const eyeHole = el("circle", { cx: eye[0], cy: eye[1], r: 3.4, fill: "#000", stroke: "none" }, mask);
  const art = el("g", { mask: `url(#${id}-cut)` }, svg);
  const gold = `url(#${id}-gold)`;
  if (branch) el("path", { d: ribbon(curve("M10 61.6C40 60.2 80 60 114 61", 40), u => .6 + Math.sin(u * Math.PI) * 1.9), fill: gold, opacity: .85 }, art);
  // legs: slim, tapering, the feet closing on the branch
  for (const d of ["M46 49C42.6 52.4 40.6 55.2 41.6 59.6", "M73.6 47.6C77.6 51.2 78.4 55 76.4 59.6"]) el("path", { d: limb(d, 3.4, 1.9), fill: gold }, art);
  for (const x of [41.6, 76.4]) { el("path", { d: limb(`M${x} 59.4C${x - 1.8} 60.2 ${x - 3} 61.4 ${x - 3.4} 63`, 1.6, .7), fill: gold }, art); el("path", { d: limb(`M${x} 59.4C${x + 1.8} 60.2 ${x + 3} 61.4 ${x + 3.4} 63`, 1.6, .7), fill: gold }, art); }
  el("path", { d: T.d, fill: gold }, art);
  el("path", { d: BODY, fill: gold }, art);
  // the pupil sits in the cut, so it is drawn outside the mask
  const pupil = el("circle", { cx: f2(eye[0] + .8), cy: f2(eye[1] - .2), r: 1.5, fill: gold }, svg);
  // sheen: a soft band of light that crosses the gold every few seconds
  let band = null;
  if (sheen) {
    const sg = el("linearGradient", { id: `${id}-sheen`, gradientUnits: "userSpaceOnUse", x1: 0, y1: 0, x2: 40, y2: 20 }, defs);
    [[0, 0], [.42, 0], [.5, .55], [.58, 0], [1, 0]].forEach(([o, a]) => el("stop", { offset: o, "stop-color": "#FFF6DF", "stop-opacity": a }, sg));
    const clip = el("clipPath", { id: `${id}-clip` }, defs);
    el("path", { d: BODY }, clip); el("path", { d: T.d }, clip);
    band = el("rect", { x: -40, y: -10, width: 200, height: 100, fill: `url(#${id}-sheen)`, "clip-path": `url(#${id}-clip)`, style: "mix-blend-mode:screen" }, svg);
  }
  if (viewBox) svg.setAttribute("viewBox", branch ? "6 9 112 57" : "10 9 94 52");
  if (animate && typeof requestAnimationFrame === "function") {
    const t0 = performance.now(), looks = [[1, -.3], [.2, -.9], [1.1, .4], [-.5, -.2]];
    const step = now => {
      if (!svg.isConnected && now - t0 > 2000) return;
      const t = (now - t0) / 1000;
      if (band) { const c = (t % 7) / 7, x = -60 + Math.min(1, c / .45) * 190; band.setAttribute("transform", `translate(${f2(x)} 0)`); band.setAttribute("opacity", c < .45 ? 1 : 0); }
      const [dx, dy] = looks[Math.floor(t / 2.6) % looks.length].map(v => v * .75), blink = (t % 5.2) < .12;
      pupil.setAttribute("cx", f2(eye[0] + dx)); pupil.setAttribute("cy", f2(eye[1] + dy)); pupil.setAttribute("r", blink ? .3 : 1.5);
      eyeHole.setAttribute("r", blink ? .8 : 3.4);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else if (band) band.setAttribute("transform", "translate(40 0)");
  return svg;
}

/* ---------- the crest ---------- */
// The mark in a gold medallion: an outer ring, a bezel of fine ticks, the name across the top and a line beneath.
export function crest(svg, { animate = true, top = "PRIVATUS", bottom = "PRIVATE  EXECUTION", font = "'Instrument Serif', Georgia, serif" } = {}) {
  const id = "cr" + uid++, defs = el("defs", {}, svg);
  svg.setAttribute("viewBox", "0 0 200 200");
  const g = el("linearGradient", { id: `${id}-gold`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  for (const [o, c] of GOLD.dark) el("stop", { offset: o, "stop-color": c }, g);
  const gold = `url(#${id}-gold)`;
  const bg = el("radialGradient", { id: `${id}-bg`, cx: .5, cy: .42, r: .62 }, defs);
  el("stop", { offset: 0, "stop-color": "#17233A" }, bg); el("stop", { offset: 1, "stop-color": "#070A10" }, bg);
  el("circle", { cx: 100, cy: 100, r: 99, fill: `url(#${id}-bg)` }, svg);
  el("circle", { cx: 100, cy: 100, r: 94, fill: "none", stroke: gold, "stroke-width": 1.6 }, svg);
  el("circle", { cx: 100, cy: 100, r: 90.5, fill: "none", stroke: gold, "stroke-width": .5, opacity: .8 }, svg);
  let ticks = "";
  for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2, r1 = 66, r2 = i % 10 ? 68.2 : 70; ticks += `M${f2(100 + Math.cos(a) * r1)} ${f2(100 + Math.sin(a) * r1)}L${f2(100 + Math.cos(a) * r2)} ${f2(100 + Math.sin(a) * r2)}`; }
  el("path", { d: ticks, stroke: gold, "stroke-width": .5, opacity: .75 }, svg);
  el("circle", { cx: 100, cy: 100, r: 64, fill: "none", stroke: gold, "stroke-width": .5, opacity: .6 }, svg);
  // lettering around the band between the rings
  el("path", { id: `${id}-top`, d: "M27 100A73 73 0 0 1 173 100", fill: "none" }, defs);
  el("path", { id: `${id}-bot`, d: "M20 100A80 80 0 0 0 180 100", fill: "none" }, defs);
  const txt = (href, s, size, ls) => { const t = el("text", { "font-family": font, "font-size": size, fill: gold, "letter-spacing": ls, "text-anchor": "middle" }, svg); const tp = el("textPath", { href: `#${href}`, startOffset: "50%" }, t); tp.textContent = s; };
  txt(`${id}-top`, top, 15, 6.5);
  txt(`${id}-bot`, bottom, 8.5, 3.6);
  for (const a of [Math.PI * .93, Math.PI * .07]) el("circle", { cx: f2(100 + Math.cos(a) * 78), cy: f2(100 + Math.sin(a) * 78), r: 1.3, fill: gold }, svg);
  // the chameleon in the centre
  const inner = el("svg", { x: 42, y: 66, width: 116, height: 68 }, svg);
  chameleonMark(inner, { animate, branch: true });
  return svg;
}
