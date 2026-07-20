import { callerWallet, configured, db, unauthorized, unconfigured } from "@/lib/server/auth";

/**
 * The Fixture name book — see supabase/setup.sql.
 *
 * GET is public: the Proof Receipt on a share link must resolve team names for a viewer who
 * never saw the Pool while it was Open. POST records a Fixture at Pool creation, behind the
 * verified Privy token, because these names are what a settled receipt claims to prove.
 *
 * ponytail: write-once, first writer wins. A Fixture's teams don't change, so re-writing on
 * every Pool creation would only ever be a way to overwrite a good row with a worse one.
 */
export async function GET() {
  if (!db) return Response.json([]); // no backend — the static slate still works
  const { data, error } = await db
    .from("fixtures")
    .select("fixture_id, home, away, kickoff, competition");
  if (error) return Response.json([]);
  return Response.json(
    (data ?? []).map((f) => ({
      fixtureId: f.fixture_id,
      home: f.home,
      away: f.away,
      kickoff: Number(f.kickoff),
      competition: f.competition ?? undefined,
    })),
    { headers: { "Cache-Control": "s-maxage=60" } },
  );
}

export async function POST(req: Request) {
  if (!configured()) return unconfigured();
  if (!(await callerWallet(req))) return unauthorized();
  const { fixtureId, home, away, kickoff, competition } = (await req.json()) as {
    fixtureId?: string; home?: string; away?: string; kickoff?: number; competition?: string;
  };
  // fixtureId is a TxLINE id, not free text — pin the shape so a junk key can't squat a row
  // that a later, real Fixture would need.
  if (!/^\d+$/.test(fixtureId ?? "") || !home?.trim() || !away?.trim()) {
    return Response.json({ error: "fixtureId, home, away required" }, { status: 400 });
  }
  const { error } = await db!.from("fixtures").upsert(
    {
      fixture_id: fixtureId,
      home: home.trim().slice(0, 64),
      away: away.trim().slice(0, 64),
      kickoff: kickoff ?? 0,
      competition: competition?.trim().slice(0, 64) || null,
    },
    { onConflict: "fixture_id", ignoreDuplicates: true },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
