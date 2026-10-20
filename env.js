// Deploy-time values. server.mjs answers /env.js from its environment variables (set TOKEN_CA on Railway), and the
// landing page reads it from the proxy origin in config.js, so one variable updates every deployment.
// This file is the fallback when no server answers. The server only fills TOKEN_CA once the mint exists on-chain,
// so an empty value shows "Announced at launch" and the landing page checks again every 20 seconds.
export const TOKEN_CA = "";
