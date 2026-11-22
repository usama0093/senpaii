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
  build: {
    // Reorganizes output for better browser caching across deploys -- does NOT
    // shrink total bytes. Vendor code changes far less often than our own, so
    // splitting it out means a future deploy only invalidates our own chunk,
    // not React/Router/Socket.IO too. The real size fix was removing Tiptap's
    // leak from RichText.tsx (see richTextShared.ts) -- this is a separate,
    // smaller improvement on top of that.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          socket: ["socket.io-client"],
        },
      },
    },
  },
});