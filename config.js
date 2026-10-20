// Terminal settings. Public values only: nothing here can move funds.

// Where trading fees go. Only the public key belongs in this repo.
// Receive-only: no key for it is needed anywhere in Ardea, so keep it in cold storage.
export const TREASURY = "555KC8Zw5rnbFn582YYksKTFdjhzAmxvbyHRosRgfDja";

// Fee on every terminal trade, in basis points (50 = 0.5%). Charged in SOL:
// on buys from the SOL you spend, on sells from the minimum SOL you receive.
export const FEE_BPS = 50;

// Jupiter routes the swaps. Each visitor's browser calls Jupiter from its own IP, so keyless
// limits (0.5 requests/s) apply per visitor. A key placed here is public AND shared by every
// visitor, so leave it empty until requests go through a server proxy that holds the key.
// Jupiter has said keyless access will be phased out; the proxy is the fix when that lands.
export const JUP_BASE = "https://api.jup.ag";
export const JUP_API_KEY = "";

export const DEFAULT_SLIPPAGE_BPS = 300;           // 3%: memecoins move fast
export const PRIORITY_MAX_LAMPORTS = 1_000_000;     // cap on the priority fee (0.001 SOL)

// Private mode routes through Monero with Houdini Swap's private send: SOL → XMR at one exchange, XMR → SOL at an
// unrelated one, paid to a fresh stealth wallet. Houdini's API key and secret are server-only (HOUDINI_API_KEY and
// HOUDINI_API_SECRET on the gateway), so Private mode needs PROXY_URL. Every route is forced through Monero; if none
// is available the terminal stops instead of using another path.
export const STEALTH_MAX_SOL = 5;                     // per stealth buy while Private mode is in beta
export const STEALTH_GAS_RESERVE = 10_000_000n;       // 0.01 SOL kept in each stealth wallet for fees and token account rent

// Solana RPC every visitor uses (HTTP, plus websockets for live trades) when PROXY_URL is empty and the
// visitor hasn't picked their own in Settings. Empty = the public mainnet-beta node (heavily rate limited).
export const RPC_URL = "";

// After deploying worker/ (see worker/README.md), set this to the worker URL, e.g.
// "https://ardea-proxy.<you>.workers.dev". RPC, Jupiter, the Monero route, Jito and X then go through
// the proxy, which holds the keys. Empty = browsers talk to the public endpoints directly.
// Served from one of the site's own domains, the gateway is that same origin (server.mjs runs both), so
// the custom domain and the Railway domain each work on their own. Anywhere else (local preview, another
// static host) it's the Railway deployment.
const OWN_HOSTS = ["ardeafinance.xyz", "www.ardeafinance.xyz", "ardea-production.up.railway.app"];
export const PROXY_URL = typeof location !== "undefined" && OWN_HOSTS.includes(location.hostname) ? location.origin : "https://ardeafinance.xyz";

// The Ardea token's mint. Shown on the landing page (copy bar and a Trade button) from launch.
export const TOKEN_CA = ""; // set at launch

// Public proof of Private mode working: real transaction signatures shown in the docs' Proof section, each linked to
// Solscan. Add them after a real private buy and exit, e.g. { step: "Funding", note: "...", sig: "5abc…" }.
export const PROOF_TXS = [
  { step: "Proof route 1 · funding", note: "Proof wallet A pays 0.3 SOL to a one-time Houdini deposit address (route 4QF9jP9Zuz7LkMtPfXRivC, forced through Monero).", sig: "3LkACAvZPxHE2vRzjqgWzkZCvBKhK3wFBKjqhfEFej3i9Lxo2AZepp7SAQLcoWymhQqdBcXVXxXpqDQa5FgzVNQA" },
  { step: "Proof route 1 · delivery", note: "81 minutes later proof wallet B receives 0.2975 SOL from an exchange wallet (5ndLnE…HEPs), not from proof wallet A.", sig: "4mD881oW7k7KX6SpRS3ZQKM2kN4JLPC3qYwMgeUrG7ABpFGcSRovgYNj9roCR7QNksgP4zMoJdv2FjdxVdUd7NU" }
];
// The public source repository, linked from the docs' Proof section once it exists ("" hides the link).
export const SOURCE_REPO = "https://github.com/JermWang/ArdeaFinance";

// The project's X account, e.g. "https://x.com/ardea". Empty hides every X link on the site until it exists.
export const X_URL = "https://x.com/Ardeafinance";

// Holder fee tiers: holding the token (main wallet plus instant wallet) lowers the fee on every trade and private buy.
// pct is the share of total supply held, in %; bps the fee at that level. Live as soon as TOKEN_CA is set.
export const HOLDER_TIERS = [{ pct: 0.1, bps: 40 }, { pct: 0.5, bps: 30 }, { pct: 1, bps: 25 }];
