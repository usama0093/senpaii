import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";

interface Props {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onSave: (newValue: string) => Promise<void>;
}

export default function RenameModal({ open, initialValue, onCancel, onSave }: Props) {
  const { theme } = useTheme();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError("");
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(trimmed);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not rename");
      setSaving(false);
    }
  };

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="glass-card border border-brand-text/10 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold mb-3 text-brand-text">Rename</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          disabled={saving}
          className="w-full bg-slate-800 text-brand-text rounded-lg px-4 py-2 mb-2 outline-none focus:ring-2 focus:ring-brand-accent"
        />
        {error && <p className="text-brand-error text-sm mb-2">{error}</p>}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 bg-slate-800 hover:bg-slate-700 border border-brand-text/10 text-brand-text hover:text-white font-bold py-2.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand-accent hover:bg-brand-accent-hover text-black font-bold py-2.5 rounded-lg disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}