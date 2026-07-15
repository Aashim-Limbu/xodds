// X/Twitter card — same rendered art as the OpenGraph card. Config is declared locally so
// Next can statically pick up the nodejs runtime (web3.js needs it); only the renderer is reused.
export { default } from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "xOdds Proof Receipt — proven on-chain";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
