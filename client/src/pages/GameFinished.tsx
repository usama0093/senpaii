import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";

interface FinishedInfo {
  session: { quizId: string; quizTitle: string };
  summary: { playerCount: number; first: { displayName: string; score: number } | null };
}

export default function GameFinished() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [info, setInfo] = useState<FinishedInfo | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api
      .get(`/sessions/${sessionId}/report`)
      .then((res) => setInfo(res.data.data))
      .catch((err) => setError(err.response?.data?.message || "Could not load the finished game"));
  }, [sessionId]);

  const handlePlayAgain = async () => {
    if (!info) return;
    setError("");
    setStarting(true);
    try {
      const res = await api.post(`/sessions/quizzes/${info.session.quizId}/start`);
      navigate(`/host/lobby/${res.data.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not start a new game");
      setStarting(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-extrabold text-brand-accent mb-2">Game complete 🎉</h1>
      {info && (
        <p className="text-slate-400 mb-8">
          {info.session.quizTitle} · {info.summary.playerCount} player{info.summary.playerCount !== 1 ? "s" : ""}
          {info.summary.first && <> · Winner: {info.summary.first.displayName}</>}
        </p>
      )}
      {!info && !error && <p className="text-slate-400 mb-8">Loading...</p>}
      {error && <p className="text-brand-error text-sm mb-6">{error}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <button
          onClick={handlePlayAgain}
          disabled={!info || starting}
          className="text-left bg-brand-accent hover:bg-brand-accent-hover text-black rounded-2xl p-6 disabled:opacity-50 transition"
        >
          <p className="text-2xl font-extrabold mb-1">▶ Play Again</p>
          <p className="text-black/70">{starting ? "Starting..." : "Start a new game with the same quiz."}</p>
        </button>

        <button
          onClick={() => navigate(`/reports/${sessionId}`)}
          className="text-left surface hover:bg-slate-800 rounded-2xl p-6 transition"
        >
          <p className="text-2xl font-extrabold mb-1">📊 Report</p>
          <p className="text-brand-text/70">See every player's results and question breakdowns.</p>
        </button>
      </div>
    </div>
  );
}