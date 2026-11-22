import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { CategoryItem } from "../hooks/useCategories";
import ConfirmModal from "./ConfirmModal";
import RenameModal from "./RenameModal";

interface Props {
  value: string;
  onChange: (name: string) => void;
  categories: CategoryItem[];
  onAdd: (name: string) => Promise<CategoryItem>;
  onRemove: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<CategoryItem>;
}

const MAX_HEIGHT = 288; // 18rem
const GAP = 4;

interface PanelPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export default function CategoryPicker({ value, onChange, categories, onAdd, onRemove, onRename }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [pos, setPos] = useState<PanelPos>({ left: 0, width: 0, top: 0, maxHeight: MAX_HEIGHT });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Delete confirmation (replaces window.confirm) — the category waiting to be confirmed, or null if closed
  const [confirmCategory, setConfirmCategory] = useState<CategoryItem | null>(null);
  // Rename modal — the category currently being renamed, or null if closed
  const [renamingCategory, setRenamingCategory] = useState<CategoryItem | null>(null);

  const close = () => {
    setOpen(false);
    setAdding(false);
    setNewName("");
    setError("");
  };

  // Opens below the button, or above it when there isn't enough room underneath.
  const openPanel = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom - GAP - 8;
    const spaceAbove = rect.top - GAP - 8;
    const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, Math.min(MAX_HEIGHT, openBelow ? spaceBelow : spaceAbove));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));

    setPos(
      openBelow
        ? { left, width: rect.width, top: rect.bottom + GAP, maxHeight }
        : { left, width: rect.width, bottom: window.innerHeight - rect.top + GAP, maxHeight }
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // The list is positioned on the screen, so close it if the page behind it moves.
    // (Scrolling inside the list itself is fine.)
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const current = value || "Generic";

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError("Enter a category name");
      return;
    }
    try {
      const created = await onAdd(newName.trim());
      onChange(created.name); // select it straight away
      close();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not add category");
    }
  };

    // Opens the modal instead of deleting right away.
  const handleRemove = (c: CategoryItem) => setConfirmCategory(c);

  // Runs the actual delete once the modal is confirmed.
  const handleConfirmRemove = async () => {
    if (!confirmCategory) return;
    const c = confirmCategory;
    setError("");
    try {
      await onRemove(c.id);
      if (current.toLowerCase() === c.name.toLowerCase()) onChange("Generic");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete category");
    } finally {
      setConfirmCategory(null);
    }
  };

  // Runs the actual rename once RenameModal's Save is confirmed. Left to throw on
  // failure — RenameModal itself catches and displays the error, same as every
  // other use of RenameModal in the app.
  const handleSaveRename = async (newName: string) => {
    if (!renamingCategory) return;
    const target = renamingCategory;
    const updated = await onRename(target.id, newName);
    if (current.toLowerCase() === target.name.toLowerCase()) onChange(updated.name); // keep selection pointing at it
    setRenamingCategory(null);
  };

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        className="w-full bg-slate-800 rounded-lg px-4 py-2 text-left flex justify-between items-center gap-2 outline-none focus:ring-2 focus:ring-brand-accent"
      >
        <span className="truncate">{current}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Drawn on top of the whole page, so no card or section can cover it */}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            className="overflow-y-auto bg-slate-800 border border-brand-text/10 rounded-xl shadow-2xl shadow-black/50 py-1 z-50"
          >
            {categories.map((c) => (
              <div key={c.id} className="flex items-center hover:bg-brand-text/10">
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.name);
                    close();
                  }}
                  className={`flex-1 text-left px-4 py-2 truncate ${
                    c.name.toLowerCase() === current.toLowerCase() ? "text-brand-accent font-semibold" : "text-brand-text"
                  }`}
                >
                  {c.name}
                </button>

                {/* Edit: any non-Generic category can be renamed, regardless of
                    whether it's in use. Sits left of Delete when Delete is also
                    shown; takes Delete's slot (rightmost) when Delete is hidden. */}
                {!c.isDefault && (
                  <button
                    type="button"
                    onClick={() => setRenamingCategory(c)}
                    title="Rename this category"
                    aria-label={`Rename category ${c.name}`}
                    className="px-3 py-2 text-brand-text/50 hover:text-brand-accent"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}

                {/* Trash icon: only for categories no quiz uses (never Generic) */}
                {!c.isDefault && c.quizCount === 0 && (
                  <button
                    type="button"
                    onClick={() => handleRemove(c)}
                    title="Delete this unused category"
                    aria-label={`Delete category ${c.name}`}
                    className="px-3 py-2 text-brand-text/50 hover:text-red-400"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            <div className="border-t border-brand-text/10 mt-1 pt-1">
              {adding ? (
                <div className="px-3 py-2 flex gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="New category"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (error) setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAdd();
                      }
                    }}
                    className="flex-1 min-w-0 bg-slate-900 rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-brand-accent"
                  />
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-3 rounded-lg"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="w-full text-left px-4 py-2 text-brand-accent hover:bg-brand-text/10"
                >
                  + Add new category
                </button>
              )}
              {error && <p className="px-4 pb-2 text-brand-error text-xs">{error}</p>}
            </div>
          </div>,
          document.body
        )}

      <ConfirmModal
        open={!!confirmCategory}
        title="Delete category?"
        message={`Delete the category "${confirmCategory?.name}"?`}
        confirmLabel="Delete"
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmCategory(null)}
      />

      <RenameModal
        open={!!renamingCategory}
        initialValue={renamingCategory?.name || ""}
        onCancel={() => setRenamingCategory(null)}
        onSave={handleSaveRename}
      />
    </div>
  );
}