"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function PortalSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Dialog"}
      data-ox-portal-sheet="true"
      className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
      />
      <div className="ox-sheet relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--ox-line)] bg-[var(--ox-surface)] p-5 pb-7 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--ox-line)] sm:hidden" />
        {title ? <h2 className="mb-3 text-base font-bold text-[var(--ox-ink)]">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
