# Ardea

[![test](https://github.com/JermWang/ardea/actions/workflows/test.yml/badge.svg)](https://github.com/JermWang/ardea/actions/workflows/test.yml)

Arm a clean wallet through Monero, then fire private buys from it instantly. A full Solana trading terminal sits around it.

Ardea is built on the Privatus codebase (itself descended from Ghostprint) by the same team, with a new name, look and
privacy route. Live at https://ardea-production.up.railway.app until the custom domain is added.

## What it does

- **Arm a wallet** (the default screen of `app.html`, `#/`): fund one to five fresh stealth wallets through Monero ahead
  of time, in one wallet approval. The total is split into uneven sizes; each wallet gets its own Houdini route (forced
  through Monero, order checked), sent 3–15 s apart. When a wallet's SOL lands it's **armed**. With Private mode on,
  any buy or ⚡ quick-buy fires the oldest armed wallet instantly with its whole balance (`fireArmed` in
  `terminal.js`, `pickArmed` in `armory.js`). The 0.5% fee is paid at arming; firing is free. Disarming returns the SOL
  through Monero. Without an armed wallet, Private mode falls back to a per-buy route (10–40 min).
- **Terminal** (`app.html`): Pulse (new pairs, final stretch, migrated, streamed live from PumpPortal), Trending, token
  pages with live trades and holders, one-click Jupiter trades with presets, an instant wallet derived from one
  signature, wallet tracker, limit orders, portfolio and PnL.
- **Private mode** (beta, on by default for buys): the main wallet signs one transaction, the amount to a one-time
  Houdini Swap deposit address plus the 0.5% fee to the treasury. One exchange swaps the SOL to XMR, the XMR crosses
  Monero, and an unrelated exchange swaps it back and pays a fresh stealth wallet, which buys on Jupiter. Routes take
  10–40 minutes and run in the background; the record is saved so Portfolio resumes or retries after a reload.
  - Monero is always forced as the bridge (`useXmr=true`). If no Monero route exists, nothing is sent: there is no
    fallback path.
  - Every order is checked before the user signs (`checkOrder` in `stealth.js`): right receiver, SOL to SOL on
    Solana, private, same amount, a deposit address that isn't one of ours, no memo, not about to expire.
  - Stealth wallets come from one signature of `STEALTH_MESSAGE` (SHA-256 of signature ‖ `ardea/stealth/i`), so
    they can be rebuilt on any device. Nothing secret is stored.
  - Exits sell on Jupiter and route all SOL back through Monero. No fee on exits.
- **Trail audit** (landing page): reads any wallet's public history and shows what trackers link to it.
- **Docs** (`docs.html`), including a **Proof** section: a live Houdini quote from the browser (quote only, no order),
  the on-chain transactions in `PROOF_TXS`, and the source.

## Honest limits (also on the site)

Houdini sees both ends of a route and keeps order data for 72 hours; each exchange sees its own leg. Amounts and
timing can still be matched by a determined observer. The route's fees change the amount, and its duration plus a
random 30 s – 3 min wait (Strong mode) blur the timing; that makes tracing harder, not impossible.

## Layout

- `index.html` + `landing.js`, `docs.html` + `docs.js`, `app.html` + `terminal.js`
- `stealth.js`: stealth wallets, the Houdini client, `routeQuote`, `checkOrder`, funding and exit transactions,
  `waitForRoute`.
- `logo.js`: the heron mark (one path traced from `media/source/logo/heron-concept-3.png`). Keep it clean: no effects,
  never set inside other artwork.
- `art.js`, `diagrams.js`: line icons, guilloché, the landing hero and the route diagrams.
- `server.mjs` + `worker/src/index.js`: static files plus the gateway (`/rpc`, `/jup`, `/houdini`, `/jito`,
  `/x/search`, `/ipfs`, `/meta`, `/env.js`). Keys live only in Railway variables.
- `media/source/brand.html`: renders the PFP, X banner, share image and promo cards (serve the folder over HTTP, then
  screenshot `?s=pfp|xbanner|og|hero|route|proof` at its size).

## Run and test

```bash
npm ci
npm test
node server.mjs
```

## Deploy

Railway project **ardea**, service **ardea**: `railway up --service ardea --detach` from this folder.
Variables: `RPC_URL`, `RPC_WS_URL`, `JUP_API_KEY`, `HOUDINI_API_KEY`, `HOUDINI_API_SECRET`, `JITO_URL`, `X_BEARER`,
`ALLOWED_ORIGINS`, and `TOKEN_CA` at launch. Every saved variable redeploys, so set them in one save, never mid-launch.
