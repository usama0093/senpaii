import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import QrCodeButton from "../components/QrCodeButton";
import { getSavedTunnelUrl, saveTunnelUrl, clearTunnelUrl } from "../utils/tunnelUrl";

export default function Dashboard() {
  const { host } = useAuth();

  const [tunnelInput, setTunnelInput] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    const existing = getSavedTunnelUrl();
    setSavedUrl(existing);
    setTunnelInput(existing || "");
  }, []);

  const handleSave = () => {
    const url = tunnelInput.trim().replace(/\/$/, "");
    setError("");
    setSavedMsg("");
    if (!url) {
      setError("Paste your Cloudflare Tunnel URL first");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("URL must start with http:// or https://");
      return;
    }
    saveTunnelUrl(url);
    setSavedUrl(url);
    setTunnelInput(url);
    setSavedMsg("Saved");
  };

  const handleDelete = () => {
    clearTunnelUrl();
    setSavedUrl(null);
    setTunnelInput("");
    setError("");
    setSavedMsg("");
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 pt-4 md:pt-6">Dashboard</h1>
      <p className="text-slate-400 mb-6">Welcome{host?.name ? `, ${host.name}` : ""}.</p>

      <div className="glass-card border border-brand-text/10 rounded-2xl p-5 mb-8 max-w-xl">
        <h2 className="text-lg font-bold mb-1">Cloudflare Tunnel URL</h2>
        <p className="text-slate-400 text-base mb-3">
          Paste your current tunnel URL here so the QR code button on session screens can generate a working link for
          students.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <input
            type="text"
            placeholder="https://your-tunnel-url.trycloudflare.com"
            value={tunnelInput}
            onChange={(e) => {
              setTunnelInput(e.target.value);
              setError("");
              setSavedMsg("");
            }}
            className="flex-1 bg-slate-800 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-brand-accent"
          />
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleSave}
              className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-5 py-2 rounded-lg"
            >
              Save
            </button>
            <button
              onClick={handleDelete}
              disabled={!savedUrl}
              className="bg-slate-800  hover:bg-red-600 hover:text-white border border-brand-text/10 text-red-400 font-bold px-5 py-2 rounded-lg disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
        {error && <p className="text-brand-error text-sm">{error}</p>}
        {savedMsg && <p className="text-green-400 text-sm">{savedMsg}</p>}
        {savedUrl && !error && !savedMsg && <p className="text-slate-500 text-sm">Currently saved: {savedUrl}</p>}
      </div>

     <div className="glass-card border border-brand-text/10 rounded-2xl p-5 max-w-5xl bg-slate-900/50">
        <h3 className="text-base font-bold mb-2">Startup Commands Guide for a real-student test (3 Separate Terminals)</h3>
         <pre className="bg-slate-950 text-slate-300 text-base p-4 rounded-lg whitespace-pre overflow-x-auto break-words font-mono border border-brand-text/5">
          {`# 1. Build the frontend (rerun any time client code changes)
            cd client
            npm run build

            # 2. Start the backend (serves API + sockets + the built frontend, all on :5000)
            cd server
            npm run dev

            # 3. Tunnel the backend only
            cloudflared tunnel --url http://localhost:5000 --protocol http2`.split('\n').map(line => line.trimStart()).join('\n')}
        </pre>
      </div>

      <Link
        to="/sessions"
        className="inline-block bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-3 rounded-lg mb-6 mt-6"
      >
        Go to Quiz Session
      </Link>

      <QrCodeButton joinPath="/" />
    </div>
  );
}