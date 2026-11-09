// Session-only fallback for a page's filter/search/sort/tab state, used when the page is
// opened via a bare link with no query string of its own — e.g. the sidebar, or a Back
// button whose history was lost. A URL that already carries any of these params always
// wins over this; this is purely the fallback for when it doesn't.
const PREFIX = "senpaii:filters:";

export function saveSectionFilters(key: string, params: Record<string, string>) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(params));
  } catch {
    // sessionStorage can fail (private browsing, quota) — filters just won't persist, no crash.
  }
}

export function loadSectionFilters(key: string): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}