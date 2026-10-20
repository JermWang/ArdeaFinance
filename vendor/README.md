# vendor

`solana-web3.min.js` is the official browser (IIFE) build of [`@solana/web3.js`](https://github.com/solana-labs/solana-web3.js)
1.98.4, served from Ardea's own domain so the terminal doesn't depend on a third-party CDN at run time. It exposes the
global `solanaWeb3`, which `terminal.js` uses to build and sign transactions in the browser.

To check it, compare it with the `lib/index.iife.min.js` file in the matching npm release.
