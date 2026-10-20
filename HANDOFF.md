# Ardea handoff

Ardea's Private mode funds every buy through Monero (Houdini Swap private send, `useXmr=true`). See `README.md` for how it works.

Live: https://ardeafinance.xyz (also www., and ardea-production.up.railway.app) (Railway project **ardea**, service **ardea**). Built 2026-10-20.

## Status

Done and live:
- **Arm a wallet** is the headline feature: landing hero and first section, the terminal opens on the Arm screen
  (`#/`), header chip shows armed wallets, buys and ⚡ fire armed wallets instantly. Logic in `armory.js` (tested).
- Engine: Houdini Monero route for private buys, exits and instant-wallet deposits/withdrawals; order checks; no
  fallback path; background route completion with resume after reload. 71 tests pass (`npm test`).
- Gateway: `/houdini/*` with the partner key and compliance headers. Railway variables are set: `RPC_URL`,
  `RPC_WS_URL`, `JUP_API_KEY` (`X_BEARER` and `JITO_URL` are empty), `HOUDINI_API_KEY`,
  `HOUDINI_API_SECRET` (copied from Wraith), `ALLOWED_ORIGINS`.
- Public repo: https://github.com/JermWang/ardea (history scanned for secrets, CI runs the tests on every push),
  linked from the nav, footer, terminal and docs.
- Holder fee tiers (`tiers.js`): 0.1% / 0.5% / 1% of supply → 0.4% / 0.3% / 0.25% fee, live once `TOKEN_CA` is set.
- Brand: heron mark (Codex concept, traced to a vector in `logo.js`), Monero orange `#FF6600` on navy `#0B0F1A`,
  Cormorant Garamond / Manrope / IBM Plex Mono, favicons, all copy rewritten for the Monero route with the limits
  stated, Proof page with a live Houdini quote (verified on production: 9 private routes, 0.5 → 0.4838 SOL, 13–41 min).
- Graphics in `media/promo/`: `ardea-pfp-1000.png`, `ardea-banner-1500x500.png`, `ardea-promo-hero.png`,
  `ardea-promo-route.png`, `ardea-promo-proof.png`; share image `media/banner.png` (1200×630).

Waiting on the owner (the site is safe to show meanwhile: trades say "Trading opens at launch" until the treasury is set,
the contract row says "Announced at launch", X links stay hidden):
1. **Treasury**: done. `555KC8…gfDja`, receive-only: no key for it is on the server or needed anywhere. Proof wallets are separate.
2. **Domain**: add it to the Railway service and point DNS → then update `OWN_HOSTS` in `config.js`, the og/twitter
   URLs in the three HTML files, and `ALLOWED_ORIGINS` on Railway (one save).
3. **X account** → `X_URL` in `config.js`.
4. **Houdini tier**: upgraded for launch day (owner arranged it). The free tier is 10 orders and 50 quotes a day across all users, so make the upgrade permanent.
5. **Proof run** (after 1): one real private buy and exit through the terminal, at least ~0.3 SOL (Houdini's minimum
   is about 0.11–0.29 SOL per route right now). Add the funding, delivery, buy and exit signatures to `PROOF_TXS`.
6. **Daily proof route**: make a new wallet used only for proof, fund it with about 0.35 SOL, and set its base58 secret
   key on Railway as `PROOF_WALLET_SECRET` (one save). The server then routes 0.3 SOL through Monero between it and a
   second wallet derived from it, daily at 14:00 UTC (`proof.mjs`), and the docs' Proof table fills in from the chain.
   Each run costs roughly 0.01 SOL. Optional: `PROOF_AMOUNT_SOL`, `PROOF_UTC_HOUR`.
7. **Token**: at launch set `TOKEN_CA` on Railway (and in `config.js`), identical everywhere.
8. Run larpcheck.app on the site before announcing (see `../LAUNCH_PROOF.md`).

## Notes

- Wallet derivation tags are `ardea/stealth/i` and `ardea/instant/0`, and the signed message is "Ardea stealth wallets
  v1". Changing the name later changes every user's stealth wallets, so the name is final once anyone trades.
- The fee on a private buy is a visible transfer to the treasury in the funding transaction (Houdini has no in-route
  fee like NEAR's appFees). The treasury never sends to stealth wallets, and the copy says exactly this.
- Every saved Railway variable redeploys the service. Batch variable changes into one save; never change them mid-launch.
- There is no demo recorder: a Monero route takes 10–40 minutes, so a
  demo should be a real recording (or clearly marked as sped up).
