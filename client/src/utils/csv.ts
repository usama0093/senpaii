// Minimal client-side CSV export helper — deliberately no external library,
// since none is installed in this project yet.

function escapeCell(value: string | number): string {
  const str = String(value);
  // Always quote every cell, doubling any internal quotes — the simplest rule
  // that safely handles commas, quotes, or line breaks inside a name or title.
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

// A UTF-8 BOM prefix makes Excel correctly detect encoding for accented or
// non-Latin student names, instead of mangling them.
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = "\uFEFF" + toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Turns a quiz/session title into a safe file name fragment.
export function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "report";
}