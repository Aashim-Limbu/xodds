/* Fabricated participant avatars — placeholder identities for the dashboard design.
 * ponytail: the app tracks no per-Pool participants or user photos, so these are
 * deterministic decoration seeded off the Pool/Group key. Swap for real Members when we have them. */

const PALETTE = ["#ffd600", "#4aa3ff", "#35d07f", "#ff8a3d", "#c77dff", "#ff6b6b"];
const INITIALS = ["JD", "AK", "MR", "SL", "TB", "EN", "KP", "RC", "VG", "OL"];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** A stacked row of fake avatars + "+N" overflow chip. `count` is the fabricated total.
 * Set `showMore={false}` where a separate label already states the total (e.g. the group hero). */
export function Avatars({
  seed,
  count,
  shown = 3,
  showMore = true,
}: {
  seed: string;
  count: number;
  shown?: number;
  showMore?: boolean;
}) {
  const base = hash(seed);
  const faces = Math.min(shown, count);
  const extra = showMore ? count - faces : 0;
  return (
    <div className="avatars" aria-label={`${count} participants`}>
      {Array.from({ length: faces }).map((_, i) => {
        const h = (base >> (i * 3)) + i * 7;
        return (
          <span key={i} className="avatar" style={{ background: PALETTE[h % PALETTE.length] }}>
            {INITIALS[h % INITIALS.length]}
          </span>
        );
      })}
      {extra > 0 && <span className="avatar more">+{extra}</span>}
    </div>
  );
}

/** Deterministic fabricated participant count for a Pool (2–24), seeded off its key + pot. */
export function fakeParticipants(seed: string, pot: bigint): number {
  return 2 + (hash(seed + pot.toString()) % 23);
}
