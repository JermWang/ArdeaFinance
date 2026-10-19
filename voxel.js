// The Privatus chameleon in hand-rolled isometric. Each part (branch, legs, tail coil, body and head, crest, eye
// turret) is a drawn profile extruded into a solid: its walls are lit by which way they face (up is light, toward
// the viewer's right is dark), an ink silhouette wraps each solid, and the details (stripe, mouth, iris, pupil) are
// printed on the front faces. Projection: a world point (x, y, z) lands at ((x − y)·cos30°, (x + y)/2 − z).
// The profile plane is x (along the body) by z (up); depth runs along y, toward the viewer.
// Animation: the turret eye looks around and blinks, a camouflage tint sweeps the skin, the body breathes, and every
// few seconds the tongue snaps out and catches a brass token.

const NS = "http://www.w3.org/2000/svg", K = Math.cos(Math.PI / 6);
const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
const f2 = n => n.toFixed(2);

// tones per material: front face (top / bottom of its gradient), lit wall, shaded wall
export const MAT = {
  skin: { face: ["#F7F2E7", "#E4DCCB"], up: "#FFFDF7", down: "#ABA28F" },
  far: { face: ["#D9D1BF", "#C4BBA7"], up: "#E9E2D3", down: "#958C79" },
  branch: { face: ["#7F98BC", "#5D7596"], up: "#9CB3D2", down: "#3B4C64" },
  eye: { face: ["#FFFDF8", "#EDE7DA"], up: "#FFFFFF", down: "#B6AD99" },
  brass: { face: ["#F3D899", "#D6B26E"], up: "#FBE6B4", down: "#8E7240" },
  tongue: { face: ["#F7A1A1", "#E27F86"], up: "#FBC0C0", down: "#A95560" },
  token: { face: ["#FFE7AE", "#E2BE76"], up: "#FFF2CF", down: "#97793F" }
};
const INK = "#0B1018";

/* ---------- profiles (x right, v down; drawn on a 64-unit canvas, ground at v = 52) ---------- */
const BODY = "M20 34C20 25 27 18.4 37 17.6C42 17.2 45.6 18 48 19.6C50 21 50.4 24 50 27C49 33.5 45.6 37.4 40.6 38.4C33 40 24.5 39.6 21.2 37C20.4 36.3 20 35.2 20 34Z";
const HEAD = "M46.5 22L51.2 12.6C51.7 11.7 52.9 11.7 53.5 12.6L60.6 23.6C61.7 25.5 61.1 27.6 59.2 28.2L52.8 30.2C50.4 31 47.6 30.2 46.6 28C45.8 26 45.8 23.6 46.5 22Z";
const RIDGE = "M25 24.4C29 20.2 33.5 18.6 38 18.2C42 17.9 45.2 18.6 47.4 20";
const STRIPE = "M24.5 33C31 34.8 41 34.4 47.4 30.6";
const MOUTH = "M54.6 30.4C56.4 30.9 58.1 30.5 59.6 29.7";
const CASQUE = "M49.6 21.4L53.5 15.4";
// sample any path into points
let probe;
function sample(d, n) {
  if (!probe) { const s = el("svg", { width: 0, height: 0, style: "position:absolute;width:0;height:0" }); document.body.appendChild(s); probe = el("path", {}, s); }
  probe.setAttribute("d", d);
  const L = probe.getTotalLength(), out = [];
  for (let i = 0; i < n; i++) { const p = probe.getPointAtLength(L * i / n); out.push([p.x, p.y]); }
  return out;
}
// a ribbon around a centre line, `w(t)` wide, with round ends
function ribbon(pts, w) {
  const L = [], R = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, hw = w(i / (n - 1)) / 2;
    L.push([pts[i][0] - dy / len * hw, pts[i][1] + dx / len * hw]); R.push([pts[i][0] + dy / len * hw, pts[i][1] - dx / len * hw]);
  }
  const cap = (p, q, c, hw, steps = 8) => { const a0 = Math.atan2(p[1] - c[1], p[0] - c[0]), out = []; for (let k = 1; k < steps; k++) { const a = a0 + Math.PI * k / steps; out.push([c[0] + Math.cos(a) * hw, c[1] + Math.sin(a) * hw]); } return out; };
  return [...L, ...cap(L[n - 1], R[n - 1], pts[n - 1], w(1) / 2), ...R.reverse(), ...cap(R[R.length - 1], L[0], pts[0], w(0) / 2)];
}
const poly = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * 2 * Math.PI) * r, cy + Math.sin(i / n * 2 * Math.PI) * r]);

/* ---------- solids ---------- */
// local (x, v) at depth y → screen
const P = (x, v, y) => [(x - y) * K, (x + y) * .5 + v];
// The whole scene is tilted up a little in its own plane (and stretched along the body), so the chameleon climbs a
// rising branch in 3D and sits nearly level on screen instead of sliding down the isometric 30° slope.
const TILT = -.27, STRETCH = 1.14, PIV = [34, 36], CT = Math.cos(TILT), ST = Math.sin(TILT);
const tilt = ([x, v]) => { const dx = (x - PIV[0]) * STRETCH, dv = v - PIV[1]; return [PIV[0] + dx * CT - dv * ST, PIV[1] + dx * ST + dv * CT]; };
// the affine map that prints flat drawing onto the face at depth y (tilted like the solids)
const faceM = y => `matrix(${K},.5,0,1,${f2(-K * y)},${f2(.5 * y)}) rotate(${f2(TILT * 180 / Math.PI)} ${PIV[0]} ${PIV[1]}) translate(${PIV[0]} 0) scale(${STRETCH} 1) translate(${-PIV[0]} 0)`;
function solid(parent, shape, { y0, y1, mat, ink = 1.1, gradId, faceAttrs = {} }) {
  const g = el("g", {}, parent), m = MAT[mat];
  shape = shape.map(tilt);
  const back = shape.map(([x, v]) => P(x, v, y0)), front = shape.map(([x, v]) => P(x, v, y1));
  const pts = a => a.map(p => p.map(f2).join(",")).join(" ");
  const walls = shape.map((p, i) => {
    const q = shape[(i + 1) % shape.length];
    // outward normal in the profile plane (v points down), turned into a light value: up is lit, down/right is shaded
    const nx = q[1] - p[1], nv = -(q[0] - p[0]), len = Math.hypot(nx, nv) || 1, up = -nv / len, right = nx / len;
    return { quad: [back[i], back[(i + 1) % shape.length], front[(i + 1) % shape.length], front[i]], lit: Math.max(0, Math.min(1, .55 + up * .55 - right * .25)) };
  });
  // 1. ink silhouette: everything, stroked wide in ink
  const sil = el("g", { fill: INK, stroke: INK, "stroke-width": ink * 2, "stroke-linejoin": "round" }, g);
  el("polygon", { points: pts(back) }, sil);
  for (const w of walls) el("polygon", { points: pts(w.quad) }, sil);
  // 2. the walls, toned by the way they face
  const wallG = el("g", { "stroke-linejoin": "round" }, g);
  for (const w of walls) { const c = mix(m.down, m.up, w.lit); el("polygon", { points: pts(w.quad), fill: c, stroke: c, "stroke-width": .35 }, wallG); }
  // 3. the front face
  const face = el("polygon", { points: pts(front), fill: `url(#${gradId})`, stroke: INK, "stroke-width": ink * .8, "stroke-linejoin": "round", ...faceAttrs }, g);
  return { g, face };
}
function mix(a, b, k) { const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16)); return `rgb(${A.map((c, i) => Math.round(c + (B[i] - c) * k)).join(",")})`; }

/* ---------- the chameleon ---------- */
// Draws into `svg`. Options: tongue, camo, breathe, still, branch. Returns a stop function.
let uid = 0;
export function voxelChameleon(svg, { tongue = true, camo = true, breathe = true, still = false, branch = true, at = 2.2 } = {}) {
  const id = "ch" + uid++, defs = el("defs", {}, svg);
  const grad = (name, [a, b]) => { const lg = el("linearGradient", { id: `${id}-${name}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs); el("stop", { offset: 0, "stop-color": a }, lg); el("stop", { offset: 1, "stop-color": b }, lg); return lg; };
  for (const k in MAT) grad(k, MAT[k].face);
  const root = el("g", {}, svg);
  // depth plan (y): a slim body (chameleons are flat side to side) on a log the legs straddle:
  // far legs 4.4–6.4, branch 6–10.6, tail 7–9.2, body 6.2–10, near legs 10.2–12.4, eye turret 9.6–12.8
  if (branch) {
    const b = ribbon([[2, 48.8], [66, 49.6]], () => 4.2);
    solid(root, b, { y0: 6, y1: 10.6, mat: "branch", gradId: `${id}-branch` });
  }
  // each leg is a smooth curve from hip through the knee to the foot
  const leg = ([h, k, f], w = 3.1) => ribbon(sample(`M${h[0]} ${h[1]}Q${k[0]} ${k[1]} ${f[0]} ${f[1]}`, 18).concat([f]), t => w - t * .7);
  const legs = { far: [[[43.6, 35.4], [48, 40.8], [46.6, 46.4]], [[29, 36.4], [26.2, 41.4], [27.8, 46.4]]], near: [[[45, 35.8], [49.2, 41.4], [47.6, 46.8]], [[30.4, 36.8], [27.2, 41.8], [29, 46.8]]] };
  const feet = x => ribbon([[x - 2.3, 48.2], [x, 46.7], [x + 2.3, 48.2]], () => 2.3);
  for (const p of legs.far) solid(root, leg(p), { y0: 4.4, y1: 6.4, mat: "far", gradId: `${id}-far` });
  for (const p of legs.far) solid(root, feet(p[2][0]), { y0: 4.4, y1: 6.4, mat: "far", gradId: `${id}-far` });
  // tail: a coil winding inward from the rump, ending in a brass tip
  const coil = [];
  for (let i = 0; i <= 120; i++) { const u = i / 120, a = -.2 - u * Math.PI * 2.3, r = 9.8 - u * 7.2; coil.push([13.4 + Math.cos(a) * r, 36.4 + Math.sin(a) * r]); }
  const tailPts = [[23, 34.8], [21, 34.2], ...coil];
  const tail = solid(root, ribbon(tailPts, t => 4.6 - t * 2.4), { y0: 7, y1: 9.2, mat: "skin", gradId: `${id}-skin` });
  const tipAt = coil.at(-1);
  // body and head as one solid, the crest along the back, and the face details
  const bodyG = el("g", {}, root);
  const body = solid(bodyG, sample(BODY, 260), { y0: 6.2, y1: 10, mat: "skin", gradId: `${id}-skin` });
  const head = solid(bodyG, sample(HEAD, 200), { y0: 6.8, y1: 9.4, mat: "skin", gradId: `${id}-skin` });
  const print = el("g", { transform: faceM(10) }, bodyG);
  el("path", { d: STRIPE, fill: "none", stroke: INK, "stroke-width": 3.4, "stroke-linecap": "round" }, print);
  el("path", { d: STRIPE, fill: "none", stroke: `url(#${id}-brass)`, "stroke-width": 2, "stroke-linecap": "round" }, print);
  el("path", { d: RIDGE, fill: "none", stroke: INK, "stroke-width": .7, "stroke-linecap": "round", opacity: .3 }, print);
  const headPrint = el("g", { transform: faceM(9.4) }, bodyG);
  el("path", { d: MOUTH, fill: "none", stroke: INK, "stroke-width": 1, "stroke-linecap": "round", opacity: .75 }, headPrint);
  el("path", { d: CASQUE, fill: "none", stroke: INK, "stroke-width": .8, "stroke-linecap": "round", opacity: .35 }, headPrint);
  // near legs over the body
  for (const p of legs.near) solid(root, leg(p, 3.3), { y0: 10.2, y1: 12.4, mat: "skin", gradId: `${id}-skin` });
  for (const p of legs.near) solid(root, feet(p[2][0]), { y0: 10.2, y1: 12.4, mat: "skin", gradId: `${id}-skin` });
  // tail tip, printed on the tail's face
  const tipP = el("g", { transform: faceM(9.2) }, root);
  el("circle", { cx: f2(tipAt[0]), cy: f2(tipAt[1]), r: 1.9, fill: `url(#${id}-brass)`, stroke: INK, "stroke-width": .7 }, tipP);
  // eye turret: a short cone of skin, then the eyeball with iris rings and a pupil that looks around
  const eyeC = [53.4, 21.8];
  solid(root, poly(...eyeC, 5.2, 48), { y0: 9, y1: 10.8, mat: "skin", gradId: `${id}-skin` });
  solid(root, poly(...eyeC, 3.9, 40), { y0: 10.8, y1: 12, mat: "eye", gradId: `${id}-eye`, ink: .9 });
  const eyeP = el("g", { transform: faceM(12) }, root);
  el("circle", { cx: eyeC[0], cy: eyeC[1], r: 3, fill: "none", stroke: INK, "stroke-width": .45, opacity: .35 }, eyeP);
  const lid = el("g", {}, eyeP), pupil = el("circle", { r: 1.75, fill: INK }, lid), glint = el("circle", { r: .55, fill: "#F3D79A" }, lid);
  const look = ([dx, dy]) => { pupil.setAttribute("cx", f2(eyeC[0] + dx)); pupil.setAttribute("cy", f2(eyeC[1] + dy)); glint.setAttribute("cx", f2(eyeC[0] + dx + .65)); glint.setAttribute("cy", f2(eyeC[1] + dy - .65)); };
  look([1.3, -.2]);
  // tongue and token (built once, shown while they fly)
  const tg = el("g", { opacity: 0 }, root), tokenG = el("g", { opacity: 0 }, root);
  // size the drawing to what was drawn, with room for the tongue to the right
  const bb = root.getBBox ? (() => { try { return root.getBBox(); } catch { return null; } })() : null;
  const pad = 3, extra = tongue ? 15 : 0;
  if (bb && bb.width) svg.setAttribute("viewBox", `${f2(bb.x - pad)} ${f2(bb.y - pad - (tongue ? 3 : 0))} ${f2(bb.width + pad * 2 + extra)} ${f2(bb.height + pad * 2 + (tongue ? 3 : 0))}`);
  else svg.setAttribute("viewBox", `-8 -2 ${78 + extra} 70`);
  const camoStops = [...defs.querySelectorAll(`#${id}-skin stop`)];
  let stopped = false, last = -1;
  const tongueAt = len => { tg.textContent = ""; if (len < .5) return; solid(tg, ribbon([[59.5, 28.4], [59.5 + len, 28.6]], t => 1.5 + (t > .92 ? 1.6 : 0)), { y0: 7.4, y1: 8.6, mat: "tongue", gradId: `${id}-tongue`, ink: .6 }); };
  const tokenTo = (x, v) => { tokenG.textContent = ""; solid(tokenG, [[x, v - 2.6], [x + 2.6, v], [x, v + 2.6], [x - 2.6, v]], { y0: 7, y1: 9.2, mat: "token", gradId: `${id}-token`, ink: .7 }); };
  const frame = t => {
    const tc = t % 8;
    look(tongue && tc > 5.2 && tc < 6.6 ? [1.5, .5] : [[1.3, -.2], [-1, -.9], [.4, 1.1], [1.4, .7], [-.6, .8]][Math.floor(t / 1.5) % 5]);
    lid.setAttribute("transform", (t % 4.4) < .14 ? `translate(0 ${f2(eyeC[1] * .9)}) scale(1 .1)` : "");
    if (camo) { const c = (t % 9) / 9, k = Math.max(0, Math.sin(c * Math.PI * 2 - .5)) * .5, tgt = c < .5 ? ["#F1D592", "#C9A35D"] : ["#B4C6DE", "#7F98BC"]; camoStops[0].setAttribute("stop-color", mix(MAT.skin.face[0], tgt[0], k)); camoStops[1].setAttribute("stop-color", mix(MAT.skin.face[1], tgt[1], k)); }
    if (breathe) bodyG.setAttribute("transform", `translate(0 ${f2(-Math.sin(t * 2.1) * .25)})`);
    if (tongue) {
      const shoot = tc > 5.9 && tc < 6.7 ? Math.sin((tc - 5.9) / .8 * Math.PI) : 0, len = shoot * 13;
      tongueAt(len); tg.setAttribute("opacity", len > .5 ? 1 : 0);
      const flying = tc > 4.2 && tc < 6.3, riding = tc >= 6.3 && shoot > .08;
      tokenG.setAttribute("opacity", flying || riding ? 1 : 0);
      if (flying) tokenTo(74 + Math.max(0, 5 - tc) * 6, 28.4 + Math.sin(t * 3) * .8);
      else if (riding) tokenTo(60.5 + len, 28.6);
    }
  };
  frame(still ? at : 0);
  if (!still && typeof requestAnimationFrame === "function") {
    const t0 = performance.now();
    const step = now => { if (stopped) return; const t = (now - t0) / 1000; if (t - last > 1 / 30) { last = t; frame(t); } requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  return () => { stopped = true; };
}
