// Where the host's current Cloudflare Tunnel URL is kept for the QR code feature.
// This is short-lived, laptop-local testing state (it changes every time cloudflared
// restarts), not real app data — so it lives in localStorage, not the database.
export const TUNNEL_URL_KEY = "senpaii_tunnel_url";

export function getSavedTunnelUrl(): string | null {
  try {
    return localStorage.getItem(TUNNEL_URL_KEY);
  } catch {
    return null;
  }
}

export function saveTunnelUrl(url: string) {
  try {
    localStorage.setItem(TUNNEL_URL_KEY, url);
  } catch {
    // storage unavailable — Dashboard's own UI simply won't show anything saved
  }
}

export function clearTunnelUrl() {
  try {
    localStorage.removeItem(TUNNEL_URL_KEY);
  } catch {
    // ignore
  }
}