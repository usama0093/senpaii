import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function JoinFeedback() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/sessions/feedback/live/join", { pin: pin.trim() });
      const room = res.data.data; // { pin, name, token }

      // Remembered for this tab only, so a refresh doesn't lose your anonymous name.
      try {
        sessionStorage.setItem("liveFeedbackRoom", JSON.stringify(room));
      } catch (err) {
        // storage unavailable — the page still works, it just can't survive a refresh
      }

      navigate("/live-feedback/room", { state: room });
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass-card p-8">
        <p className="text-brand-text text-center text-lg mb-6">Enter the Feedback PIN</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Feedback PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
            required
            className="w-full bg-slate-800 text-brand-text text-center text-2xl tracking-widest rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
          />

          {error && <p className="text-brand-error text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || pin.length < 6}
            className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}