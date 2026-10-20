import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/src/index.js";

const env = { RPC_URL: "https://rpc.test/?api-key=SECRET", JUP_API_KEY: "JUPKEY", HOUDINI_API_KEY: "HKEY", HOUDINI_API_SECRET: "HSECRET", X_BEARER: "XB", ALLOWED_ORIGINS: "https://jermwang.github.io" };
const ctx = { waitUntil: () => {} };
const ORIGIN = { origin: "https://jermwang.github.io" };
function withFetch(fn) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { calls.push({ url: String(url instanceof Request ? url.url : url), init }); return fn(String(url), init); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const ok = body => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("rpc: forwards allowed methods with the secret URL, refuses others", async () => {
  const f = withFetch(() => ok({ jsonrpc: "2.0", id: 1, result: 5 }));
  try {
    const r = await worker.fetch(new Request("https://p.test/rpc", { method: "POST", headers: ORIGIN, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: ["x"] }) }), env, ctx);
    assert.equal((await r.json()).result, 5);
    assert.equal(f.calls[0].url, env.RPC_URL);
    assert.equal(r.headers.get("access-control-allow-origin"), "https://jermwang.github.io");
    const bad = await worker.fetch(new Request("https://p.test/rpc", { method: "POST", headers: ORIGIN, body: JSON.stringify([{ jsonrpc: "2.0", id: 2, method: "getProgramAccounts" }]) }), env, ctx);
    assert.match((await bad.json()).error.message, /not allowed/);
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
});

test("preflight allows the solana-client header that @solana/web3.js sends on every RPC call", async () => {
  const r = await worker.fetch(new Request("https://p.test/rpc", { method: "OPTIONS", headers: { ...ORIGIN, "access-control-request-headers": "content-type,solana-client" } }), env, ctx);
  assert.equal(r.status, 204);
  assert.deepEqual(r.headers.get("access-control-allow-headers").split(",").map(s => s.trim()).sort(), ["content-type", "solana-client", "x-user-timezone"]);
});

test("origins outside the allowlist are refused", async () => {
  const r = await worker.fetch(new Request("https://p.test/health", { headers: { origin: "https://evil.test" } }), env, ctx);
  assert.equal(r.status, 403);
});

test("jupiter: adds the API key and strips the /jup prefix", async () => {
  const f = withFetch(() => ok({ hi: 1 }));
  try {
    await worker.fetch(new Request("https://p.test/jup/swap/v1/quote?inputMint=a", { headers: ORIGIN }), env, ctx);
    assert.equal(f.calls[0].url, "https://api.jup.ag/swap/v1/quote?inputMint=a");
    assert.equal(f.calls[0].init.headers["x-api-key"], "JUPKEY");
    await worker.fetch(new Request("https://p.test/jup/swap/v1/swap-instructions", { method: "POST", headers: ORIGIN, body: "{}" }), env, ctx);
    assert.equal(f.calls[1].init.method, "POST"); assert.equal(f.calls[1].init.body, "{}");
  } finally { f.restore(); }
});

test("houdini gets the key and compliance headers and only the private-send calls; jito only relays sendTransaction", async () => {
  const f = withFetch(() => ok({ result: "sig" }));
  try {
    const hdr = { ...ORIGIN, "cf-connecting-ip": "203.0.113.9", "user-agent": "UA/1", "x-user-timezone": "America/New_York" };
    await worker.fetch(new Request("https://p.test/houdini/v2/quotes/private-send?token=t&amount=1&useXmr=true", { headers: hdr }), env, ctx);
    assert.equal(f.calls[0].url, "https://api-partner.houdiniswap.com/v2/quotes/private-send?token=t&amount=1&useXmr=true");
    const h = f.calls[0].init.headers;
    assert.equal(h.authorization, "HKEY:HSECRET");
    assert.equal(h["x-user-ip"], "203.0.113.9"); assert.equal(h["x-user-agent"], "UA/1"); assert.equal(h["x-user-timezone"], "America/New_York");
    await worker.fetch(new Request("https://p.test/houdini/v2/exchanges/private-send", { method: "POST", headers: { ...hdr, "x-user-timezone": "<script>" }, body: JSON.stringify({ quoteId: "q", addressTo: "a", refundAddress: "r", markup: 4 }) }), env, ctx);
    assert.deepEqual(JSON.parse(f.calls[1].init.body), { quoteId: "q", addressTo: "a", refundAddress: "r" });
    assert.equal(f.calls[1].init.headers["x-user-timezone"], "UTC");
    for (const [path, method] of [["/houdini/v2/exchanges", "POST"], ["/houdini/v2/orders", "GET"], ["/houdini/v2/partner/stats", "GET"]]) {
      const r = await worker.fetch(new Request("https://p.test" + path, { method, headers: hdr, body: method === "POST" ? "{}" : undefined }), env, ctx);
      assert.equal(r.status, 404);
    }
    assert.equal(f.calls.length, 2);
    const off = await worker.fetch(new Request("https://p.test/houdini/v2/tokens", { headers: ORIGIN }), { ...env, HOUDINI_API_KEY: "" }, ctx);
    assert.equal(off.status, 503);
    const j = await worker.fetch(new Request("https://p.test/jito", { method: "POST", headers: ORIGIN, body: JSON.stringify({ method: "sendTransaction", params: [] }) }), env, ctx);
    assert.equal((await j.json()).result, "sig");
    const nope = await worker.fetch(new Request("https://p.test/jito", { method: "POST", headers: ORIGIN, body: JSON.stringify({ method: "sendBundle" }) }), env, ctx);
    assert.equal(nope.status, 400);
  } finally { f.restore(); }
});

test("x search: bearer auth, simplified posts", async () => {
  const f = withFetch(() => ok({ data: [{ id: "1", text: "gm $BONK", created_at: "2026-10-02T00:00:00Z", author_id: "u", public_metrics: { like_count: 3, retweet_count: 1, reply_count: 0 } }], includes: { users: [{ id: "u", username: "trader", name: "T", public_metrics: { followers_count: 900 } }] } }));
  try {
    const r = await worker.fetch(new Request("https://p.test/x/search?q=%24BONK", { headers: ORIGIN }), env, ctx);
    const { posts } = await r.json();
    assert.equal(posts[0].author.username, "trader"); assert.equal(posts[0].likes, 3);
    assert.equal(f.calls[0].init.headers.authorization, "Bearer XB");
    assert.match(f.calls[0].url, /query=%24BONK\+-is%3Aretweet/);
    const none = await worker.fetch(new Request("https://p.test/x/search?q=x", { headers: ORIGIN }), { ...env, X_BEARER: "" }, ctx);
    assert.equal(none.status, 503);
  } finally { f.restore(); }
});

test("ipfs: races gateways, serves images to <img> requests from allowed pages, refuses html and bad paths", async () => {
  const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
  const f = withFetch(url => url.startsWith("https://dweb.link/") ? new Response("PNG", { status: 200, headers: { "content-type": "image/png" } }) : new Response("", { status: 504 }));
  try {
    const img = await worker.fetch(new Request(`https://p.test/ipfs/${CID}`, { headers: { referer: "https://jermwang.github.io/ardea/app.html" } }), env, ctx);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.match(img.headers.get("content-security-policy"), /sandbox/);
    assert.equal(await img.text(), "PNG");
    assert.equal(f.calls.length, 3);
    const stranger = await worker.fetch(new Request(`https://p.test/ipfs/${CID}`, { headers: { referer: "https://evil.test/" } }), env, ctx);
    assert.equal(stranger.status, 403);
    const bad = await worker.fetch(new Request("https://p.test/ipfs/notacid", { headers: ORIGIN }), env, ctx);
    assert.equal(bad.status, 400);
  } finally { f.restore(); }
  const g = withFetch(() => new Response("<script>", { status: 200, headers: { "content-type": "text/html" } }));
  try {
    const html = await worker.fetch(new Request(`https://p.test/ipfs/${"QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"}/x`, { headers: ORIGIN }), env, ctx);
    assert.equal(html.status, 415);
  } finally { g.restore(); }
});
