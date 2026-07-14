// SSE relay for the TxLINE odds stream. The browser's EventSource can't set the X-Api-Token
// header, so we open the upstream stream server-side (token stays here) and pipe its bytes
// straight through. No token / no upstream -> 204, so the client's EventSource errors once,
// closes, and the snapshot probabilities remain (see useTxlineLive).
const ORIGIN = process.env.TXLINE_ORIGIN ?? "https://txline-dev.txodds.com";

export const dynamic = "force-dynamic"; // never cache a live stream

async function guestJwt(): Promise<string> {
  const res = await fetch(`${ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest auth ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

export async function GET(req: Request): Promise<Response> {
  const apiToken = process.env.TXLINE_API_TOKEN;
  const fixtureId = new URL(req.url).searchParams.get("fixtureId");
  if (!apiToken || !fixtureId) return new Response(null, { status: 204 });

  try {
    const jwt = process.env.TXLINE_JWT ?? (await guestJwt());
    const upstream = await fetch(`${ORIGIN}/api/odds/stream?fixtureId=${fixtureId}`, {
      headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken, Accept: "text/event-stream" },
      signal: req.signal, // client disconnect tears down the upstream connection
    });
    if (!upstream.ok || !upstream.body) return new Response(null, { status: 204 });
    return new Response(upstream.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  } catch {
    return new Response(null, { status: 204 });
  }
}
