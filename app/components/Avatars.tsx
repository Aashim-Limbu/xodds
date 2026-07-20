"use client";

import { Facehash } from "facehash";

// The app's original avatar palette, kept: facehash's own feature variation is far too
// subtle to tell people apart at 24px, so the background colour does the identifying work
// and the face does the personality. Without this every avatar reads as the same blank disc.
const FACE_COLORS = ["#ffd600", "#4aa3ff", "#35d07f", "#ff8a3d", "#c77dff", "#ff6b6b"];

/** One person's face, deterministic from their identity — pass the wallet where we have it,
 * the display name where we don't (Feed presence). Same string always draws the same face. */
export function Face({ id, size = 28 }: { id: string; size?: number }) {
  return (
    <span className="face" style={{ width: size, height: size }} aria-hidden="true">
      <Facehash name={id} size={size} showInitial={false} colors={FACE_COLORS} />
    </span>
  );
}

/** A stacked row of real people + "+N" overflow chip. `ids` are wallets (Pool entrants) or
 * display names (Feed presence) — whatever identity that surface actually has.
 * Set `showMore={false}` where a separate label already states the total (e.g. the group hero). */
export function Avatars({
  ids,
  shown = 3,
  showMore = true,
}: {
  ids: string[];
  shown?: number;
  showMore?: boolean;
}) {
  const faces = ids.slice(0, shown);
  const extra = showMore ? ids.length - faces.length : 0;
  return (
    <div className="avatars" aria-label={`${ids.length} participants`}>
      {faces.map((id) => (
        <span key={id} className="avatar">
          <Face id={id} size={26} />
        </span>
      ))}
      {extra > 0 && <span className="avatar more">+{extra}</span>}
    </div>
  );
}
