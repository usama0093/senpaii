import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red styling for destructive actions (delete, end session, etc.)
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  // Escape key cancels, same as the other portal components (MoreMenu, CategoryPicker).
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
      onClick={onCancel} // clicking the overlay cancels
    >
      <div
        onClick={(e) => e.stopPropagation()} // clicking the card itself doesn't
        className="glass-card border border-brand-text/10 rounded-2xl p-6 w-full max-w-sm"
      >
        {title && <h2 className="text-lg font-bold mb-2 text-brand-text">{title}</h2>}
        <p className="text-brand-text/80 mb-6 whitespace-pre-wrap">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold py-2.5 rounded-lg transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 font-bold py-2.5 rounded-lg transition ${
              danger
                ? "bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white"
                : "bg-brand-accent hover:bg-brand-accent-hover text-black"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}