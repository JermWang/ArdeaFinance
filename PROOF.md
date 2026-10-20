# Proof

Ardea routes SOL through Monero (SOL → XMR → SOL, Houdini Swap private send, Monero forced) into wallets with no
on-chain link to the sender. This file lists completed routes and how to verify each one without trusting Ardea.

**Live, always-current version: [ardeafinance.xyz/proof](https://ardeafinance.xyz/proof)** (plain HTML, no
JavaScript needed) and [ardeafinance.xyz/proof.json](https://ardeafinance.xyz/proof.json).

## Proof wallets

Ardea's own wallets, used only for proof. Fees go to a separate, receive-only treasury
(`555KC8Zw5rnbFn582YYksKTFdjhzAmxvbyHRosRgfDja`).

| | Address | Solscan |
|---|---|---|
| Proof A | `3WfKw8HJENLS42DEdVHvh7LoXMSC6Uuay4BcF9akzYjy` | [open](https://solscan.io/account/3WfKw8HJENLS42DEdVHvh7LoXMSC6Uuay4BcF9akzYjy) |
| Proof B | `7TLWpuaZrBxsu1sSCeHRZQDNfVYe2gtHCfM1A5JvGBeK` | [open](https://solscan.io/account/7TLWpuaZrBxsu1sSCeHRZQDNfVYe2gtHCfM1A5JvGBeK) |

A route runs between them every 6 hours ([`proof.mjs`](proof.mjs)), through the same `routeQuote` and `checkOrder` a
private buy uses ([`stealth.js`](stealth.js)).

## Completed routes

### Route 1: `4QF9jP9Zuz7LkMtPfXRivC` (Proof A → Proof B), 2026-10-20

| | |
|---|---|
| Opened | 14:32 UTC, Houdini private send, `useXmr=true` |
| Funding | Proof A sends 0.3 SOL to Houdini's one-time deposit address `G83J5pP9aEHSswnLf59XoRBt8BqwhDnrZQ8Q6DnYmYSF`: [3LkACAvZ…](https://solscan.io/tx/3LkACAvZPxHE2vRzjqgWzkZCvBKhK3wFBKjqhfEFej3i9Lxo2AZepp7SAQLcoWymhQqdBcXVXxXpqDQa5FgzVNQA) |
| Delivery | 15:53 UTC, Proof B receives 0.2975 SOL from exchange wallet `5ndLnEYqSFiA5yUFHo6LVZ1eWc6Rhh11K5CfJNkoHEPs`: [4mD881oW…](https://solscan.io/tx/4mD881oW7k7KX6SpRS3ZQKM2kN4JLPC3qYwMgeUrG7ABpFGcSRovgYNj9roCR7QNksgP4zMoJdv2FjdxVdUd7NU) |
| Houdini record | `status 4` (finished), `displayStatus SWAP_COMPLETED`, `anonymous true`, `inHash` = the funding tx, `transactionHash` = the delivery tx: [/proof/route/4QF9jP9Zuz7LkMtPfXRivC.json](https://ardeafinance.xyz/proof/route/4QF9jP9Zuz7LkMtPfXRivC.json) |
| Monero | Houdini support confirmed the second exchange waited for 20 Monero network confirmations before swapping back, which is why the route took 81 minutes. |

### Route 2: `pgAKKLNz88tJ4vCn33simc` (Proof B → Proof A), 2026-10-20

| | |
|---|---|
| Opened | 15:58 UTC, Houdini private send, `useXmr=true` |
| Funding | Proof B sends 0.2875 SOL to its one-time deposit address: [LrUKVmwX…](https://solscan.io/tx/LrUKVmwXXwhzokx388F1MQTQxQuhBAjZh7LLzAebatxDPzyHj4R1YrZJMfitGuz1DZC5WmgG9CKnrQhMUSD1BLm) |
| Delivery | 16:03 UTC, Proof A receives 0.2723 SOL from a different exchange wallet `HetaPyWvKKNswrcbSG9uVGiwfdpUwosdsuuoaHncudaE`: [2kpNyg8F…](https://solscan.io/tx/2kpNyg8FkvKwvUfpF2LEM4mZnHH8C8Et4gMVzJC6GrwWz3vFnNUdokEMz76xisqWLx38cdrfA7mMCoMbQdKZNAMu) |
| Houdini record | [/proof/route/pgAKKLNz88tJ4vCn33simc.json](https://ardeafinance.xyz/proof/route/pgAKKLNz88tJ4vCn33simc.json) |

## Verify a route yourself

1. **Funding:** the sending proof wallet pays the route's one-time deposit address, and nothing else is in that
   transaction: no transfer to Ardea, none to the other proof wallet.
2. **Delivery:** the receiving proof wallet is paid by an exchange's wallet, not by the other proof wallet. The two
   routes were paid by different exchange wallets (Houdini rotates payout wallets).
3. **The match:** the route's Houdini record (`/proof/route/<id>.json`, Houdini's order data forwarded unchanged,
   available for 48 hours) has `inHash` equal to the funding transaction and `transactionHash` equal to the delivery,
   with `anonymous: true` (Houdini's private two-exchange route) and `status: 4` (finished).
4. **No shortcut:** the two proof wallets have never transacted with each other directly. Open either on Solscan.
5. **Monero:** Houdini's record doesn't name the intermediate asset. Ardea requests Monero on every route
   (`useXmr: true` in `houdini().quote`, [`stealth.js`](stealth.js)), and a test asserts it
   ([`test/stealth.test.mjs`](test/stealth.test.mjs)).

## Fee and privacy design, as built

- **No fee transfer in the funding.** Ardea's fee on private routes is Houdini partner markup taken inside the route
  (`legMarkup` in [`stealth.js`](stealth.js)), so a user's funding is one plain transfer to a one-time address.
- **No silent fallback.** If no Monero route is available, nothing is sent (`routeQuote`).
- **Stated limits.** Houdini sees both ends of each route and each exchange sees its own leg; amounts and timing can
  still be matched by a determined observer. Arming ahead at uneven sizes makes that harder, not impossible.
