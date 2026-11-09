const pad = (n: number) => String(n).padStart(2, "0");

// 30/09/2026
export function formatDate(value: string | Date): string {
  const d = new Date(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// 30/09/2026, 07:45 AM
export function formatDateTime(value: string | Date): string {
  const d = new Date(value);
  const hours = d.getHours();
  const hour12 = hours % 12 || 12;
  return `${formatDate(d)}, ${pad(hour12)}:${pad(d.getMinutes())} ${hours >= 12 ? "PM" : "AM"}`;
}