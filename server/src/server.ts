// import dotenv from "dotenv";
// dotenv.config();

// import http from "http";
// import app from "./app";
// import { initSocket } from "./socket";

// const PORT = process.env.PORT || 5000;

// const httpServer = http.createServer(app);
// initSocket(httpServer);

// httpServer.listen(PORT, () => {
//   console.log(`Senpaii server listening on http://localhost:${PORT}`);
// });


// // temporary server configuration for testing purposes - WIFI
// import dotenv from "dotenv";
// dotenv.config();

// import http from "http";
// import app from "./app";
// import { initSocket } from "./socket";

// const PORT = process.env.PORT || 5000;

// const httpServer = http.createServer(app);
// initSocket(httpServer);

// httpServer.listen(Number(PORT), "0.0.0.0", () => {
//   console.log(`Senpaii server listening on http://10.77.242.67:${PORT}`);
// });








// Temporary checking

import dotenv from "dotenv";
dotenv.config();

import http from "http";
import path from "path";
import express from "express";
import app from "./app";
import { initSocket } from "./socket";

// CommonJS provides __dirname directly.

const PORT = process.env.PORT || 5000;

// Serve static files from the Vite build folder
// (Adjust "../../client/dist" if your folder structure differs)
app.use(express.static(path.join(__dirname, "../../client/dist")));

// Catch-all route for Single Page Application (SPA) routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Senpaii server listening on localhost:${PORT}`);
});