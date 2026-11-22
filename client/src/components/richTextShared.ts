// Shared between RichTextEditor.tsx (the editor) and RichText.tsx (read-only
// display) — kept in its own file with ZERO Tiptap imports. RichText.tsx is used
// by eager, non-lazy student pages (PlayGame, QodRoom, FeedbackRoom), so if this
// lived inside RichTextEditor.tsx instead, importing even one string from it
// would pull Tiptap's entire editor library into the student-facing bundle.

export const RICH_TEXT_CONTENT_CLASS =
  "break-words [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-0 " +
  "[&_ul]:inline-block [&_ol]:inline-block [&_ul]:text-left [&_ol]:text-left [&_ul]:w-full [&_ol]:w-full";

// Tiptap's "empty" HTML is "<p></p>", not "" — this is the correct emptiness check
// to use in place of a plain-text `!text.trim()`.
export function isRichTextEmpty(html: string): boolean {
  const div = document.createElement("div");
  div.innerHTML = html;
  return !(div.textContent || "").trim();
}