// Generates (once per browser) and remembers a random device ID, used to let a
// student rejoin a session as themselves instead of creating a duplicate entry.
// Stored in localStorage (not sessionStorage) so it survives a fully closed tab —
// the whole point of this ID is to recognize the SAME device on a later visit.

const STORAGE_KEY = "senpaii_device_id";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch (err) {
    // localStorage unavailable (private browsing, etc.) — rejoin/dedupe simply
    // won't work for this visit, but joining still works normally.
    return generateId();
  }
}