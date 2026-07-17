"use client";

import { useEffect, useRef } from "react";

/** The sticker-book modal shell (overlay, panel, close, Esc, scroll-lock, focus return).
 * Extracted from the original InviteModal so every dialog feels native to the app. */
export function Modal({
  open,
  onClose,
  title,
  icon,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first focusable field so keyboard users land inside the dialog.
    panelRef.current?.querySelector<HTMLElement>("input, button:not(.modal-close)")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          <span className="msym">close</span>
        </button>
        <div className="modal-header">
          <h2 className="modal-title">
            <span className="msym">{icon}</span>
            {title}
          </h2>
          {sub && <p className="modal-sub">{sub}</p>}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
