# Privatus: handoff for the next session

Read this and `README.md` before touching anything.

## What this is
Privatus is a private execution terminal for Solana. The product is the trading terminal (`app.html`): Pulse, token pages, one-click Jupiter trades with a 0.5% SOL fee, an instant wallet, a tracker, portfolio and PnL, limit orders, autopilot TP/SL and a migration sniper. **Private mode** (beta) buys from fresh **stealth wallets** that NEAR Intents' 1Click API funds through a one-time deposit address with Confidential Intents, so no on-chain transfer runs from the user's wallet to the buyer. The **Trail audit** is the free, read-only tool on the landing page that shows what trackers can link to a wallet.

Never call it "untraceable": amounts and timing can still be matched, and the docs say so. Get a legal review before Private mode ships to real users.

## State (2026-10-19)
- **Live on Railway:** https://privatus.up.railway.app (project `privatus`, service `privatus`, linked in this folder; deploy with `railway up --service privatus --detach`). `server.mjs` serves the site and the gateway on one origin; `PROXY_URL` in `config.js` points at it.
- **Railway variables:** all eight exist on the service. Set: `RPC_URL=https://api.mainnet-beta.solana.com` (placeholder) and `ALLOWED_ORIGINS=http://localhost:5179` (the server always allows its own origin on top). Blank, to fill in: `RPC_WS_URL`, `JUP_API_KEY`, `ONECLICK_JWT`, `X_BEARER`, `JITO_URL` (blank uses Jito's default), `TOKEN_CA`. An older Railway project `lacuna` from before the rename still exists and can be deleted.
- **Keys still to add in Railway (Variables tab), in order of importance:**
  1. `RPC_URL`: a paid RPC such as Helius (`https://mainnet.helius-rpc.com/?api-key=…`), plus `RPC_WS_URL` (`wss://…`) for live trades. The public node rate-limits Railway's shared IP, so the Trail audit (about 70 calls) fails with "rate limiting" and balances and trades are flaky until this is set. PublicNode was tested and doesn't return full wallet history, so it isn't a substitute.
  2. `JUP_API_KEY` from portal.jup.ag. Without it, the gateway uses Jupiter's keyless host (`lite-api.jup.ag`, then `api.jup.ag` on a 429), which works but is shared and slow.
  3. `ONECLICK_JWT` (NEAR Intents partner key), which removes the 0.1–0.2% route fee. Optional: `X_BEARER` for the Posts tab, `JITO_URL`.
  4. When a custom domain is added, put it in `ALLOWED_ORIGINS` and set an absolute `og:image`.
- All 59 unit tests pass (`npm test`).
- Terminal: no emoji anywhere (16-unit line icons in `terminal.js` `ICO`, 24-unit glyphs from `art.js` on the pages); a status bar (stream, curves, RPC latency and slot, SOL price, UTC clock); skeleton cards while Pulse fills; tabular numbers; brass focus rings. Checked at 1440, 1024 and 375 px with no horizontal overflow.
- `TREASURY` in `config.js` is still the wallet the code came with. Using the same treasury as another product links the two on-chain; set a new one if that matters.
- Wallet derivation strings are `privatus/instant/0` and `privatus/stealth/<i>`, and the signed message names Privatus.
- The 1Click `referral` is `"privatus"`; register it with NEAR Intents if referral tracking is wanted.
- **Custom domain:** privatusterminal.xyz (Namecheap) and www are attached to the Railway `privatus` service (moved off the old `lacuna` project on 2026-10-19). They go live once the CNAME and `_railway-verify` TXT records from `railway domain status` are added at Namecheap. `ALLOWED_ORIGINS` (Railway variable and `worker/wrangler.toml`) lists both, and `config.js` uses same-origin for the gateway on its own domains. Once DNS is live, switch `og:url`/`og:image` to https://privatusterminal.xyz.
- No X account yet.

## Design system
See "Design" in `README.md`. Short version: vault navy, ivory, steel lines, one brass accent; Instrument Serif, Geist, Geist Mono; guilloché engravings drawn in `art.js`; the vault-dial mark. The docs invert it (ivory paper, navy figure plates). Re-render the PNG brand files with `media/source/render.sh` after changing the mark or the hero.

## TODO, roughly in order
1. Add the Railway keys above (a paid RPC first), then a custom domain.
2. A small real buy and sell, then a real Private mode buy and exit with about 0.05 SOL. Confirm 1Click accepts SOL→SOL on Solana with `confidentiality: "basic"`, and note timing and fees.
3. Run the Trail audit on real wallets and tune the heuristics. Only Binance 2 (`5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`) is a confirmed exchange label; confirm any others on Solscan before adding them.
4. Check the name "Privatus" for trademark and domain conflicts before launch.
5. Token design and legal review before anything token-related.

## How the owner likes to work
- Iterate fast, keep updates short, show the page.
- Ask before outward-facing actions: pushing to new remotes, deploying, buying domains, anything token-related.
