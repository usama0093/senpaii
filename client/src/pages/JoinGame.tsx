import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
// import axios from "axios";
import api from "../api/axios"; // WIFI
import { getDeviceId } from "../utils/deviceId";

export default function JoinGame() {
  const [gamePin, setGamePin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // const res = await axios.post("http://localhost:5000/api/sessions/join", {
        const res = await api.post("/sessions/join", { // WIFI
        gamePin: gamePin.trim(),
        displayName: displayName.trim(),
        deviceId: getDeviceId(),
      });

      const { participantId, sessionId } = res.data.data;
      navigate(`/play/${sessionId}`, {
        state: { participantId, displayName: displayName.trim(), gamePin: gamePin.trim() },
      });
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not join game");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass-card p-8">
        <p className="text-brand-text text-center text-lg mb-6">Enter your game pin</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Game PIN"
            value={gamePin}
            onChange={(e) => setGamePin(e.target.value)}
            maxLength={6}
            required
            className="w-full bg-slate-800 text-brand-text text-center text-2xl tracking-widest rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
          />
          <input
            type="text"
            placeholder="Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full bg-slate-800 text-brand-text rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
          />

          {error && <p className="text-brand-error text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}