

import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // A message handed over from another page — currently used by Settings after
  // scheduling account deletion, to explain the 30-day recoverable window.
  useEffect(() => {
    const state = location.state as { message?: string } | null;
    if (state?.message) setNotice(state.message);
  }, [location.state]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      const { token, host, accountRestored } = res.data.data;
      login(token, host);

      if (accountRestored) {
        // Give them a moment to actually see the restore notice before leaving.
        setNotice("Welcome back! Your account was scheduled for deletion and has now been restored.");
        setTimeout(() => navigate("/dashboard"), 1800);
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm glass-card p-8">
      <p className="text-brand-text text-center text-lg mb-6">Host Login</p>

        {notice && (
          <div className="bg-brand-accent/10 border border-brand-accent text-brand-accent text-sm rounded-lg px-3 py-2 mb-4">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-800 text-brand-text rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
          />
            <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-slate-800 text-brand-text rounded-lg pl-4 pr-11 py-3 outline-none focus:ring-2 focus:ring-brand-accent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text/50 hover:text-brand-text"
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a13.6 13.6 0 0 1 3.06-4.44M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 7.5a13.6 13.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          </div>

          {error && (
          <div className="bg-brand-error/10 border border-brand-error text-brand-error text-sm rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-accent hover:bg-brand-accent-hover text-black font-bold rounded-lg py-3 transition disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="text-slate-400 text-sm text-center mt-6">
          Don't have an account?{" "}
          <Link to="/register" className="text-brand-accent font-medium hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}