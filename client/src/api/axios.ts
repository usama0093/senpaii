// Relative baseURL — whatever origin the browser is currently on (plain localhost,
// a LAN IP, or the Cloudflare tunnel URL). vite.config.ts's dev proxy (or, once
// built, app.ts's own static-file serving) forwards /api to :5000 either way, so
// this one config works unchanged across all three ways of running the app.
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

// Runs before every single request this instance makes — reads the token fresh
// from localStorage each time, not captured once at module load.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("senpaii_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;