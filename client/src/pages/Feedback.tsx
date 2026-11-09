import { Link } from "react-router-dom";

export default function Feedback() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 pt-4 md:pt-6">Feedback</h1>
      <p className="text-slate-400 mb-6">Collect feedback from your students.</p>

      <div className="grid md:grid-cols-2 gap-5 max-w-3xl">
        <div className="glass-card border border-brand-text/10 rounded-2xl p-6 opacity-50 cursor-not-allowed">
          <p className="text-xl font-bold mb-1">Regular Feedback</p>
          <p className="text-slate-400">Collect student details and feedback, with an Excel report.</p>
          <p className="text-brand-accent text-sm mt-3">Coming soon</p>
        </div>

        <Link
          to="/feedback/live"
          className="block glass-card hover:bg-slate-800 border border-brand-text/10 rounded-2xl p-6 transition"
        >
          <p className="text-xl font-bold mb-1">Live Feedback</p>
          <p className="text-slate-400">
            Students join with a PIN and send anonymous feedback that appears live on your screen.
          </p>
          <p className="text-brand-accent text-sm mt-3">Open →</p>
        </Link>
      </div>
    </div>
  );
}