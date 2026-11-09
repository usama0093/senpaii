import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";

// Shared styling for every rendered/edited rich-text block, via Tailwind arbitrary
// child selectors — no changes to index.css needed. Headings stay close to body
// text size (these are quiz questions, not documents); lists get real bullets/
// numbers with proper indent.
export const RICH_TEXT_CONTENT_CLASS =
  "break-words [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-0 " +
  "[&_ul]:inline-block [&_ol]:inline-block [&_ul]:text-left [&_ol]:text-left [&_ul]:w-full [&_ol]:w-full";

function ToolbarButton({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keeps focus/selection inside the editor
      onClick={onClick}
      className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition ${
        active ? "bg-brand-accent text-black" : "text-brand-text/70 hover:bg-brand-text/10 hover:text-brand-text"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

// Single horizontal row, hidden scrollbar, with left/right arrows that only appear
// once the row actually overflows its container. Clear Formatting is deliberately
// the last item, separated by its own divider.
function Toolbar({ editor }: { editor: Editor }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    el.addEventListener("scroll", updateScrollState);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState]);

  const scrollBy = (dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <div className="relative flex items-center bg-slate-900 border-b border-brand-text/10 rounded-t-lg">
      {canScrollLeft && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => scrollBy(-120)}
          aria-label="Scroll toolbar left"
          className="shrink-0 w-7 h-9 flex items-center justify-center text-slate-400 hover:text-brand-text bg-slate-900"
        >
          ‹
        </button>
      )}
      <div ref={scrollRef} className="flex items-center gap-0.5 overflow-x-auto no-scrollbar px-1 py-1">
        <ToolbarButton
          title="Bold (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="Italic (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          title="Underline (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <span className="w-px h-5 bg-brand-text/10 mx-1 shrink-0" />
        <ToolbarButton
          title="Heading 1 (Ctrl+Alt+1)"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2 (Ctrl+Alt+2)"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <span className="w-px h-5 bg-brand-text/10 mx-1 shrink-0" />
        <ToolbarButton
          title="Bulleted list (Ctrl+Shift+8)"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
            <path d="M9 6h11M9 12h11M9 18h11" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list (Ctrl+Shift+7)"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 6h11M9 12h11M9 18h11" />
            <text x="1" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
            <text x="1" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
            <text x="1" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
          </svg>
        </ToolbarButton>
        <span className="w-px h-5 bg-brand-text/10 mx-1 shrink-0" />
        <ToolbarButton
          title="Superscript (Ctrl+.) — e.g. x²"
          active={editor.isActive("superscript")}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          <span>
            x<sup>2</sup>
          </span>
        </ToolbarButton>
        <ToolbarButton
          title="Subscript (Ctrl+,) — e.g. H₂O"
          active={editor.isActive("subscript")}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          <span>
            x<sub>2</sub>
          </span>
        </ToolbarButton>
        <span className="w-px h-5 bg-brand-text/10 mx-1 shrink-0" />
        <ToolbarButton
          title="Clear formatting"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15l7-7 7 7-4 4H9l-5-4z" />
            <path d="M3 21h12" />
            <line x1="5" y1="5" x2="19" y2="19" />
          </svg>
        </ToolbarButton>
      </div>
      {canScrollRight && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => scrollBy(120)}
          aria-label="Scroll toolbar right"
          className="shrink-0 w-7 h-9 flex items-center justify-center text-slate-400 hover:text-brand-text bg-slate-900"
        >
          ›
        </button>
      )}
    </div>
  );
}

interface RichTextEditorProps {
  value: string; // HTML
  onChange: (html: string) => void;
  placeholder?: string;
  // Hides just the visible toolbar row — formatting and all keyboard shortcuts
  // (Ctrl+B/I/U, heading shortcuts, list shortcuts, Ctrl+./Ctrl+, for super/
  // subscript) still work either way, since they come from the editor's
  // extensions, not the toolbar buttons.
  showToolbar?: boolean;
  // Counts visible/plain-text characters only (Tiptap's CharacterCount operates on
  // the document's text content, not the serialized HTML), and hard-stops typing
  // past the limit.
  characterLimit?: number;
  minHeightClassName?: string;
  // Extra classes applied to the actual editable content area (e.g. "text-lg" to
  // match a field that used to be a larger textarea, or option-tile text styling).
  contentClassName?: string;
  // Padding around the content; default matches the original textareas.
  paddingClassName?: string;
  // Outer wrapper styling; default is the usual dark input box. Pass "" (or custom
  // classes) to blend into a different background — e.g. an MC option's colored tile.
  wrapperClassName?: string;
}

const DEFAULT_WRAPPER_CLASS =
  "bg-slate-800 rounded-lg focus-within:ring-2 focus-within:ring-brand-accent overflow-hidden";

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  showToolbar = true,
  characterLimit,
  minHeightClassName = "min-h-[84px]",
  contentClassName = "",
  paddingClassName = "px-4 py-3",
  wrapperClassName = DEFAULT_WRAPPER_CLASS,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2] } }),
      Underline,
      Superscript,
      Subscript,
      Placeholder.configure({ placeholder: placeholder || "" }),
      CharacterCount.configure(characterLimit ? { limit: characterLimit } : {}),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `outline-none ${minHeightClassName} ${paddingClassName} ${RICH_TEXT_CONTENT_CLASS} ${contentClassName}`,
      },
    },
  });

  // Keeps the editor in sync when `value` changes from OUTSIDE it (resetForm()
  // clearing it, startEditing() loading a different question) — Tiptap only knows
  // about edits that came from typing inside it otherwise. emitUpdate: false is the
  // Tiptap v3 object-form API (NOT the v2 positional boolean) — without it, this
  // programmatic sync could itself fire onUpdate -> onChange -> re-trigger this
  // same effect, which is what caused the original bug report.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const count = editor.storage.characterCount?.characters?.() ?? 0;

  return (
    <div className={wrapperClassName}>
      {showToolbar && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      {characterLimit !== undefined && (
        <p className="text-brand-text/50 text-xs text-right px-3 pb-2">
          {count} / {characterLimit}
        </p>
      )}
    </div>
  );
}

// Tiptap's "empty" HTML is "<p></p>", not "" — this is the correct emptiness check
// to use in place of a plain-text `!text.trim()`.
export function isRichTextEmpty(html: string): boolean {
  const div = document.createElement("div");
  div.innerHTML = html;
  return !(div.textContent || "").trim();
}