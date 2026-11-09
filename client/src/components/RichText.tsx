import { RICH_TEXT_CONTENT_CLASS } from "./RichTextEditor";

// Read-only display of saved rich-text HTML. Safe with dangerouslySetInnerHTML
// because Tiptap — the only thing that ever produces this HTML — only emits tags
// from the extensions enabled in RichTextEditor; nothing else (including a pasted
// <script>) survives being typed into it, so there's no separate sanitizing step.
export default function RichText({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`${RICH_TEXT_CONTENT_CLASS} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}