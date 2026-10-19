# Lacuna: handoff for the next session

Read this and `README.md` before touching anything.

## What this is
Lacuna is a private execution terminal for Solana. The product is the trading terminal (`app.html`): Pulse, token pages, one-click Jupiter trades with a 0.5% SOL fee, an instant wallet, a tracker, portfolio and PnL, limit orders, autopilot TP/SL and a migration sniper. **Private mode** (beta) buys from fresh **stealth wallets** that NEAR Intents' 1Click API funds through a one-time deposit address with Confidential Intents, so no on-chain transfer runs from the user's wallet to the buyer. The **Trail audit** is the free, read-only tool on the landing page that shows what trackers can link to a wallet.

Never call it "untraceable": amounts and timing can still be matched, and the docs say so. Get a legal review before Private mode ships to real users.

## State (2026-10-19)
- All 59 unit tests pass (`npm test`).
- Checked in Chromium at desktop width: the landing page (hero seal, record vignettes, Private mode certificate with the route diagram, desk tiles, Trail audit against `test/mockchain.mjs`, token tiers), the docs (every diagram renders), and the terminal (live Pulse from PumpPortal, a token page, trade panel, Private mode toggle, orders).
- `config.js` has `PROXY_URL = ""`. **Nothing runs against mainnet reads until a gateway exists**: the public Solana RPC refuses browser requests from most origins (403 / CORS), which breaks the Trail audit, balances and token-page trades. Deploy `server.mjs` (Railway or any Node host) or `worker/` (Cloudflare), set its secrets, put its URL in `PROXY_URL`, and add the site's origin to `ALLOWED_ORIGINS`.
- `TREASURY` in `config.js` is still the wallet the code came with. Using the same treasury as another product links the two on-chain; set a new one if that matters.
- Wallet derivation strings are `lacuna/instant/0` and `lacuna/stealth/<i>`, and the signed message names Lacuna, so wallets derived here are new and separate from any other deployment of this code.
- The 1Click `referral` is `"lacuna"`; register it with NEAR Intents if referral tracking is wanted.
- No X account, domain or deployment yet. Link previews use the relative `media/banner.png`; most crawlers need an absolute `og:image` URL, so set one once the domain is known.

## Design system
See "Design" in `README.md`. Short version: vault navy, ivory, steel lines, one brass accent; Instrument Serif, Geist, Geist Mono; guilloché engravings drawn in `art.js`; the vault-dial mark. The docs invert it (ivory paper, navy figure plates). Re-render the PNG brand files with `media/source/render.sh` after changing the mark or the hero.

## TODO, roughly in order
1. Deploy the gateway and the site; set `PROXY_URL`, `ALLOWED_ORIGINS` and an absolute `og:image`.
2. A small real buy and sell, then a real Private mode buy and exit with about 0.05 SOL. Confirm 1Click accepts SOL→SOL on Solana with `confidentiality: "basic"`, and note timing and fees.
3. Run the Trail audit on real wallets and tune the heuristics. Only Binance 2 (`5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`) is a confirmed exchange label; confirm any others on Solscan before adding them.
4. Check the name "Lacuna" for trademark and domain conflicts before launch.
5. Token design and legal review before anything token-related.

## How the owner likes to work
- Iterate fast, keep updates short, show the page.
- Ask before outward-facing actions: pushing to new remotes, deploying, buying domains, anything token-related.
