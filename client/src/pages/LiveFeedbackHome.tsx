import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import ConfirmModal from "../components/ConfirmModal";

interface ActiveInfo {
  pin: string;
  joined: number;
  messageCount: number;
}

export default function LiveFeedbackHome() {
  const navigate = useNavigate();
  const [active, setActive] = useState<ActiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // End-session confirmation (replaces window.confirm)
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  useEffect(() => {
    api
      .get("/sessions/feedback/live/active")
      .then((res) => setActive(res.data.data))
      .catch((err) => setError(err.response?.data?.message || "Could not check for a running session"))
      .finally(() => setLoading(false));
  }, []);

  const handleStart = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/sessions/feedback/live");
      navigate(`/feedback/live/${res.data.data.pin}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not start the session");
      setBusy(false);
    }
  };

  // Opens the modal instead of ending right away.
  const handleEnd = () => {
    if (!active) return;
    setConfirmEndOpen(true);
  };

  // Runs the actual end once the modal is confirmed.
  const handleConfirmEnd = async () => {
    if (!active) return;
    setError("");
    try {
      await api.delete(`/sessions/feedback/live/${active.pin}`);
      setActive(null);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not end the session");
    } finally {
      setConfirmEndOpen(false);
    }
  };

  return (
    <div className="max-w-2xl pt-4 md:pt-4">
      <Link
        to="/feedback"
        className="border border-brand-text/15 text-brand-text/90 text-base font-semibold mb-1 -ml-3 px-3 py-1.5 rounded-lg transition hover:bg-brand-text hover:text-brand-bg"
      >
        ← Back to Feedback
      </Link>

      <h1 className="text-2xl font-bold mt-4 mb-2">Live Feedback</h1>
      <p className="text-slate-400 mb-6">
        Start a session and share the PIN. Students open <span className="text-brand-text font-semibold">{window.location.origin}/live-feedback</span>,
        enter the PIN and send feedback anonymously. It appears on your screen instantly. When you end the session,
        everything is forgotten — nothing is saved.
      </p>

      {error && <p className="text-brand-error text-sm mb-4">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : active ? (
        <div className="surface rounded-2xl p-6">
          <p className="text-slate-400 text-sm mb-1">A session is already running</p>
          <p className="text-4xl font-extrabold text-brand-accent tracking-widest mb-2">{active.pin}</p>
          <p className="text-slate-400 mb-5">
            {active.joined} student{active.joined !== 1 ? "s" : ""} joined · {active.messageCount} feedback received
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate(`/feedback/live/${active.pin}`)}
              className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-6 py-3 rounded-lg"
            >
              Resume
            </button>
            <button
              onClick={handleEnd}
              className="bg-slate-800 hover:bg-red-600 border border-brand-text/10 text-red-400 hover:text-white font-bold px-5 py-2 rounded-lg transition disabled:opacity-50"
            >
              End session
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleStart}
          disabled={busy}
          className="bg-brand-accent hover:bg-brand-accent-hover text-black font-bold px-8 py-4 rounded-xl text-lg disabled:opacity-50"
        >
          {busy ? "Starting..." : "▶ Start Live Feedback"}
        </button>
      )}

      <ConfirmModal
        open={confirmEndOpen}
        title="End session?"
        message="End this feedback session? Students can no longer send feedback, and nothing is saved."
        confirmLabel="End session"
        onConfirm={handleConfirmEnd}
        onCancel={() => setConfirmEndOpen(false)}
      />
    </div>
  );
}