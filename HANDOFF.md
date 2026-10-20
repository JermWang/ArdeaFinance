# Ardea handoff

Ardea is the Privatus terminal with a new name, look and privacy route: Private mode now funds every buy through
Monero (Houdini Swap private send, `useXmr=true`) instead of NEAR Intents. See `README.md` for how it works.

Live: https://ardea-production.up.railway.app (Railway project **ardea**, service **ardea**). Built 2026-10-20.

## Status

Done and live:
- Engine: Houdini Monero route for private buys, exits and instant-wallet deposits/withdrawals; order checks; no
  fallback path; background route completion with resume after reload. 62 tests pass (`npm test`).
- Gateway: `/houdini/*` with the partner key and compliance headers. Railway variables are set: `RPC_URL`,
  `RPC_WS_URL`, `JUP_API_KEY`, `X_BEARER`, `JITO_URL` (copied from Privatus), `HOUDINI_API_KEY`,
  `HOUDINI_API_SECRET` (copied from Wraith), `ALLOWED_ORIGINS`.
- Brand: heron mark (Codex concept, traced to a vector in `logo.js`), Monero orange `#FF6600` on navy `#0B0F1A`,
  Cormorant Garamond / Manrope / IBM Plex Mono, favicons, all copy rewritten for the Monero route with the limits
  stated, Proof page with a live Houdini quote (verified on production: 9 private routes, 0.5 → 0.4838 SOL, 13–41 min).
- Graphics in `media/promo/`: `ardea-pfp-1000.png`, `ardea-banner-1500x500.png`, `ardea-promo-hero.png`,
  `ardea-promo-route.png`, `ardea-promo-proof.png`; share image `media/banner.png` (1200×630).

Waiting on the owner (the site is safe to show meanwhile: trades say "Trading opens at launch" until the treasury is set,
the contract row says "Announced at launch", X links stay hidden):
1. **Treasury wallet**: a new address used only by Ardea → `TREASURY` in `config.js`.
2. **Domain**: add it to the Railway service and point DNS → then update `OWN_HOSTS` in `config.js`, the og/twitter
   URLs in the three HTML files, and `ALLOWED_ORIGINS` on Railway (one save).
3. **X account** → `X_URL` in `config.js`.
4. **Houdini Pro tier**: the free tier allows 10 orders and 50 quotes a day across all users. Request Pro before launch.
5. **Proof run** (after 1): one real private buy and exit through the terminal, at least ~0.3 SOL (Houdini's minimum
   is about 0.11–0.29 SOL per route right now). Add the funding, delivery, buy and exit signatures to `PROOF_TXS`.
6. **Public repo**: OK to publish this code (scan history for secrets first) → `SOURCE_REPO`.
7. **Token**: at launch set `TOKEN_CA` on Railway (and in `config.js`), identical everywhere.
8. Run larpcheck.app on the site before announcing (see `../LAUNCH_PROOF.md`).

## Notes

- Wallet derivation tags are `ardea/stealth/i` and `ardea/instant/0`, and the signed message is "Ardea stealth wallets
  v1". Changing the name later changes every user's stealth wallets, so the name is final once anyone trades.
- The fee on a private buy is a visible transfer to the treasury in the funding transaction (Houdini has no in-route
  fee like NEAR's appFees). The treasury never sends to stealth wallets, and the copy says exactly this.
- Every saved Railway variable redeploys the service. Batch variable changes into one save; never change them mid-launch.
- The Privatus demo recorder was removed: it mocked NEAR delivery timing, and a Monero route takes 10–40 minutes, so a
  demo should be a real recording (or clearly marked as sped up).
