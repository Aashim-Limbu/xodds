"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Rally the Squad" invite modal (from the Stitch component). Self-contained: renders the
 * INVITE trigger button + the dialog. One real path: copy the Group's share link. (The
 * email/username Send from the mockup was UI-only theatre — removed rather than shipped fake.)
 */
export function InviteModal({ url, label = "Invite" }: { url: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape to close + lock body scroll + focus the first field while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      triggerRef.current?.focus(); // WCAG 2.4.3: return focus to the trigger on close
    };
  }, [open]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <button ref={triggerRef} className="hero-btn invite" onClick={() => setOpen(true)}>
        <span className="msym">person_add</span>
        {label}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>
              <span className="msym">close</span>
            </button>

            <div className="modal-header">
              <h2 className="modal-title" id="invite-title">
                <span className="msym">group_add</span>
                Rally the Squad
              </h2>
              <p className="modal-sub">
                Invite friends to your Group. The more, the merrier (and the bigger the pot).
              </p>
            </div>

            <div className="modal-body">
              <div className="field">
                <label className="field-label">Share invite link</label>
                <div className="link-row">
                  <input
                    ref={inputRef}
                    className="link-input"
                    readOnly
                    value={url}
                    onClick={(e) => e.currentTarget.select()}
                    aria-label="Invite link"
                  />
                  <button className="copy-btn" title="Copy link" aria-label="Copy link" onClick={copy}>
                    <span className="msym">{copied ? "check" : "content_copy"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
