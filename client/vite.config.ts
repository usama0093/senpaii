// ---- ORIGINAL ----
// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 5173,
//   },
// });

// ---- WIFI-TEMP (direct hotspot/LAN testing) ----
// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
//
// export default defineConfig({
//   plugins: [react()],
//   server: {
//     allowedHosts: true,
//     host: true,
//     port: 5173,
//     hmr: false,
//   },
// });

// ---- DEV-PROXY (ACTIVE): for everyday `npm run dev` work only. The Cloudflare
// Tunnel test no longer exposes the dev server at all -- it wraps the backend
// (:5000) directly, via app.ts serving the built frontend -- so HMR can stay on.
// The proxy here is still useful day-to-day: it lets axios.ts/socket.ts use one
// relative URL that works unchanged whether you're running this dev server or
// the built/tunneled setup.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on all network interfaces, not just localhost -- needed for LAN/IP access
    allowedHosts: true, // accept requests with a LAN-IP Host header, not just "localhost"
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});