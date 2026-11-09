import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { getDeviceId } from "../utils/deviceId";

export default function JoinQod() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/sessions/qod/live/join", {
        pin: pin.trim(),
        name: name.trim(),
        deviceId: getDeviceId(),
      });
      const room = res.data.data; // { type: "live" | "regular", ...rest }

      if (room.type === "regular") {
        try {
          sessionStorage.setItem("qodSessionRoom", JSON.stringify(room));
        } catch (err) {
          // storage unavailable — the page still works, it just can't survive a refresh
        }
        navigate("/qod/session/room", { state: room });
      } else {
        try {
          sessionStorage.setItem("liveQodRoom", JSON.stringify(room));
        } catch (err) {
          // storage unavailable — the page still works, it just can't survive a refresh
        }
        navigate("/qod/live/room", { state: room });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass-card p-8">
        <p className="text-brand-text text-center text-lg mb-6">Join the Quiz of the Day</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            placeholder="QOD PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
            required
            className="w-full bg-slate-800 text-brand-text text-center text-2xl tracking-widest rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
          />
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            className="w-full bg-slate-800 text-brand-text rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
          />

          {error && <p className="text-brand-error text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || pin.length < 6 || !name.trim()}
            className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join"}
          </button>
        </form>
      </div>
    </div>
  );
}