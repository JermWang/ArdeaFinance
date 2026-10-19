// Privatus proxy (Cloudflare Worker). Keeps API keys server-side so the static site never ships them,
// and gives every visitor the same paid capacity instead of per-browser free-tier limits.
//   /rpc         Solana JSON-RPC (HTTP, method allowlist) and websocket subscriptions (Upgrade)
//   /jup/*       Jupiter API with x-api-key; token lists and prices cached briefly
//   /1click/*    NEAR Intents 1Click API with the partner JWT
//   /jito        Jito block engine sendTransaction relay
//   /x/search    X recent search (cached; costs money per post read, so it's opt-in on the site)
//   /ipfs/<cid>  token images and metadata, raced across public gateways and cached at the edge
//   /meta?u=     a token's metadata JSON from any public https host, trimmed to the fields the terminal uses
//   /health      which upstreams are configured
// Secrets: RPC_URL, RPC_WS_URL (optional), JUP_API_KEY, ONECLICK_JWT, X_BEARER. Var: ALLOWED_ORIGINS.

const RPC_METHODS = new Set([
  "getBalance", "getAccountInfo", "getMultipleAccounts", "getTokenAccountsByOwner", "getTokenLargestAccounts",
  "getTokenSupply", "getSignaturesForAddress", "getTransaction", "getLatestBlockhash", "sendTransaction",
  "simulateTransaction", "getSignatureStatuses", "getBlockHeight", "getSlot", "getRecentPrioritizationFees",
  "getFeeForMessage", "getMinimumBalanceForRentExemption", "getEpochInfo", "getVersion", "getHealth"
]);
const JUP = "https://api.jup.ag", JUP_LITE = "https://lite-api.jup.ag", ONECLICK = "https://1click.chaindefuser.com", JITO = "https://mainnet.block-engine.jito.wtf/api/v1/transactions";
const X_SEARCH = "https://api.x.com/2/tweets/search/recent";
const GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/"];
const IPFS_PATH = /^\/ipfs\/((?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(?:\/[\w\-.%]+)*)$/;

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// Best-effort per-IP limiter (per isolate). Cloudflare's rate limiting rules are the real backstop.
const hits = new Map();
function allow(ip, limit = 40) {
  const now = Math.floor(Date.now() / 1000), key = `${ip}:${now}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) for (const k of hits.keys()) if (!k.endsWith(`:${now}`)) hits.delete(k);
  return n <= limit;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), origin = req.headers.get("origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    // <img> requests carry no Origin header, only a Referer, so IPFS reads may prove their origin either way
    const refOrigin = (() => { try { return new URL(req.headers.get("referer") || "").origin; } catch (_) { return ""; } })();
    const isIpfs = url.pathname.startsWith("/ipfs/");
    const originOk = !allowed.length || allowed.includes(origin) || (isIpfs && !origin && allowed.includes(refOrigin));
    const cors = { "access-control-allow-origin": originOk && origin ? origin : allowed.length ? "null" : "*", "access-control-allow-headers": "content-type, solana-client", "access-control-allow-methods": "GET,POST,OPTIONS", vary: "origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!originOk) return json({ error: "origin not allowed" }, 403, cors);
    const ip = req.headers.get("cf-connecting-ip") || "anon";
    if (!(isIpfs ? allow(`${ip}:img`, 200) : allow(ip))) return json({ error: "rate limited" }, 429, cors);
    try {
      if (url.pathname === "/health") return json({ ok: true, rpc: !!env.RPC_URL, jupiterKey: !!env.JUP_API_KEY, oneclickJwt: !!env.ONECLICK_JWT, x: !!env.X_BEARER }, 200, cors);
      if (url.pathname === "/rpc") return await rpc(req, env, cors);
      if (url.pathname.startsWith("/jup/")) return await jupiter(req, env, url, cors, ctx);
      if (url.pathname.startsWith("/1click/")) return await oneclick(req, env, url, cors);
      if (url.pathname === "/jito") return await jito(req, env, cors);
      if (url.pathname === "/x/search") return await xsearch(env, url, cors, ctx);
      if (isIpfs) return await ipfsGet(url, cors, ctx);
      if (url.pathname === "/meta") return await metaGet(url, cors, ctx);
      return json({ error: "not found" }, 404, cors);
    } catch (e) {
      return json({ error: "upstream error" }, 502, cors);
    }
  }
};

async function rpc(req, env, cors) {
  if (!env.RPC_URL) return json({ error: "RPC_URL is not configured" }, 503, cors);
  if ((req.headers.get("upgrade") || "").toLowerCase() === "websocket") {
    // pass the websocket through to the upstream RPC
    return fetch(new Request(env.RPC_WS_URL || env.RPC_URL.replace(/^http/, "ws"), req));
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);
  const text = await req.text();
  if (text.length > 1_500_000) return json({ error: "request too large" }, 413, cors);
  let body;
  try { body = JSON.parse(text); } catch (_) { return json({ error: "bad json" }, 400, cors); }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > 20) return json({ error: "batch too large" }, 413, cors);
  const bad = calls.find(c => !c || !RPC_METHODS.has(c.method));
  if (bad) return json({ jsonrpc: "2.0", id: bad && bad.id, error: { code: -32601, message: `method not allowed: ${bad && bad.method}` } }, 200, cors);
  const up = await fetch(env.RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: text });
  return new Response(up.body, { status: up.status, headers: { "content-type": "application/json", ...cors } });
}

async function jupiter(req, env, url, cors, ctx) {
  // with a key, api.jup.ag; without one, Jupiter's keyless host (the gateway's IP is shared, so a 429 there
  // gets one retry on the other host)
  const path = url.pathname.slice(4) + url.search, target = (env.JUP_API_KEY ? JUP : JUP_LITE) + path;
  const headers = { "content-type": "application/json", ...(env.JUP_API_KEY ? { "x-api-key": env.JUP_API_KEY } : {}) };
  const cacheable = req.method === "GET" && /^\/jup\/(tokens|price)\//.test(url.pathname);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cacheable && cache) { const hit = await cache.match(target); if (hit) return withCors(hit, cors); }
  const body = req.method === "POST" ? await req.text() : undefined;
  let up = await fetch(target, { method: req.method, headers, body });
  if (up.status === 429 && !env.JUP_API_KEY) up = await fetch(JUP + path, { method: req.method, headers, body });
  const res = new Response(up.body, { status: up.status, headers: { "content-type": "application/json", "cache-control": `max-age=${/\/price\//.test(url.pathname) ? 5 : 20}` } });
  if (cacheable && cache && up.ok) ctx.waitUntil(cache.put(target, res.clone()));
  return withCors(res, cors);
}

async function oneclick(req, env, url, cors) {
  const target = ONECLICK + url.pathname.slice(7) + url.search;
  const up = await fetch(target, { method: req.method, headers: { "content-type": "application/json", ...(env.ONECLICK_JWT ? { authorization: `Bearer ${env.ONECLICK_JWT}` } : {}) }, body: req.method === "POST" ? await req.text() : undefined });
  return new Response(up.body, { status: up.status, headers: { "content-type": "application/json", ...cors } });
}

async function jito(req, env, cors) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);
  const text = await req.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { return json({ error: "bad json" }, 400, cors); }
  if (body.method !== "sendTransaction") return json({ error: "only sendTransaction" }, 400, cors);
  const up = await fetch(env.JITO_URL || JITO, { method: "POST", headers: { "content-type": "application/json" }, body: text });
  return new Response(up.body, { status: up.status, headers: { "content-type": "application/json", ...cors } });
}

async function xsearch(env, url, cors, ctx) {
  if (!env.X_BEARER) return json({ error: "X is not configured on this proxy" }, 503, cors);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length > 200) return json({ error: "bad query" }, 400, cors);
  const target = `${X_SEARCH}?${new URLSearchParams({ query: `${q} -is:retweet`, max_results: "20", "tweet.fields": "created_at,public_metrics,author_id", expansions: "author_id", "user.fields": "username,name,profile_image_url,verified,public_metrics" })}`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = `https://x-cache.privatus/${encodeURIComponent(q)}`;
  if (cache) { const hit = await cache.match(key); if (hit) return withCors(hit, cors); }
  const up = await fetch(target, { headers: { authorization: `Bearer ${env.X_BEARER}` } });
  const data = await up.json().catch(() => ({}));
  if (!up.ok) return json({ error: data.title || `X answered ${up.status}` }, up.status === 429 ? 429 : 502, cors);
  const users = new Map((data.includes?.users || []).map(u => [u.id, u]));
  const posts = (data.data || []).map(t => {
    const u = users.get(t.author_id) || {};
    return { id: t.id, text: t.text, createdAt: t.created_at, likes: t.public_metrics?.like_count || 0, reposts: t.public_metrics?.retweet_count || 0, replies: t.public_metrics?.reply_count || 0,
      author: { username: u.username, name: u.name, image: u.profile_image_url, verified: !!u.verified, followers: u.public_metrics?.followers_count || 0 } };
  });
  const res = json({ posts }, 200, { "cache-control": "max-age=300" });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(res, cors);
}

// Content-addressed, so a hit is good forever. Only images and JSON/text come back, under a CSP that
// stops an SVG or anything else from running script on this origin.
async function ipfsGet(url, cors, ctx) {
  const m = url.pathname.match(IPFS_PATH);
  if (!m) return json({ error: "bad ipfs path" }, 400, cors);
  const cache = typeof caches !== "undefined" ? caches.default : null, key = `https://ipfs-cache.privatus/${m[1]}`;
  if (cache) { const hit = await cache.match(key); if (hit) return withCors(hit, cors); }
  const ctls = GATEWAYS.map(() => new AbortController()), timer = setTimeout(() => ctls.forEach(c => c.abort()), 15000);
  let up;
  try {
    up = await Promise.any(GATEWAYS.map((g, i) => fetch(g + m[1], { signal: ctls[i].signal }).then(r => { if (!r.ok) throw new Error(String(r.status)); r.i = i; return r; })));
  } catch (_) { return json({ error: "not available on any gateway" }, 504, cors); }
  finally { clearTimeout(timer); }
  ctls.forEach((c, i) => { if (i !== up.i) c.abort(); });
  const type = (up.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^(image\/[\w.+-]+|application\/json|text\/plain)$/.test(type)) return json({ error: "unsupported content type" }, 415, cors);
  if (Number(up.headers.get("content-length") || 0) > 8_000_000) return json({ error: "too large" }, 413, cors);
  const res = new Response(up.body, { status: 200, headers: { "content-type": type, "cache-control": "public, max-age=604800, immutable", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "x-content-type-options": "nosniff" } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(res, cors);
}

// Token metadata lives on all sorts of hosts (pump.fun launch tools, trackers, buckets), and many send no CORS
// headers, so browsers can't read them. This fetches one public https JSON file and returns only the fields the
// terminal reads. No internal hosts or IP literals, a few redirects at most, 64 KB, 6 seconds, cached a day.
const META_FIELDS = ["name", "symbol", "image", "description", "twitter", "telegram", "website"];
const privateHost = h => /^(localhost|.*\.(localhost|local|internal|lan|home|corp))$/i.test(h) || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".");
async function metaGet(url, cors, ctx) {
  let target;
  try { target = new URL(url.searchParams.get("u") || ""); } catch (_) { return json({ error: "bad url" }, 400, cors); }
  const cache = typeof caches !== "undefined" ? caches.default : null, key = `https://meta-cache.privatus/${encodeURIComponent(target.href)}`;
  if (cache) { const hit = await cache.match(key); if (hit) return withCors(hit, cors); }
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 6000);
  let body = null;
  try {
    for (let hop = 0; hop < 4; hop++) {
      if (target.protocol !== "https:" || target.username || target.password || (target.port && target.port !== "443") || privateHost(target.hostname)) return json({ error: "url not allowed" }, 400, cors);
      const up = await fetch(target.href, { redirect: "manual", signal: ctl.signal, headers: { accept: "application/json, text/plain, */*" } });
      if (up.status >= 300 && up.status < 400 && up.headers.get("location")) { target = new URL(up.headers.get("location"), target); continue; }
      if (!up.ok) return json({ error: `upstream ${up.status}` }, 502, cors);
      const reader = up.body.getReader(), parts = [];
      for (let n = 0; ;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > 65536) { ctl.abort(); return json({ error: "too large" }, 413, cors); } parts.push(value); }
      body = JSON.parse(new TextDecoder().decode(await new Blob(parts).arrayBuffer()));
      break;
    }
  } catch (_) { return json({ error: "metadata unavailable" }, 502, cors); }
  finally { clearTimeout(timer); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "not a metadata object" }, 502, cors);
  const pick = o => Object.fromEntries(META_FIELDS.filter(k => typeof o?.[k] === "string").map(k => [k, o[k].slice(0, 600)]));
  const out = { ...pick(body), ...(body.extensions && typeof body.extensions === "object" ? { extensions: pick(body.extensions) } : {}) };
  const res = new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
  if (cache) ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(res, cors);
}

function withCors(res, cors) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
  return r;
}
