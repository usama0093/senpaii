// import express from "express";
// import cors from "cors";
// import routes from "./routes";
// import { notFound } from "./middleware/notFound";
// import { errorHandler } from "./middleware/errorHandler";

// const app = express();

// app.use(
//   cors({
//     origin: process.env.CLIENT_URL || "http://localhost:5173",
//   })
// );
// app.use(express.json());

// app.use("/api", routes);

// app.use(notFound);
// app.use(errorHandler);

// export default app;


// temporary server configuration for testing purposes - WIFI
import express from "express";
import cors from "cors";
import path from "path";
import routes from "./routes";
import { notFound } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(
  cors({
    origin: "*", // Allows mobile devices on Wi-Fi to hit your API routes
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.options("*", cors());

app.use(express.json());

app.use("/api", routes);

// ---- TUNNEL-BUILD-TEMP: serves the built frontend (client/dist) directly from this
// same Express server, so Cloudflare Tunnel only has to wrap one port (5000).
// Run `npm run build` in client/ first — this does nothing until that folder exists.
// This MUST stay above app.use(notFound) below: notFound is a catch-all for every
// request not yet handled, so anything registered after it would never be reached.
app.use(express.static(path.join(__dirname, "../../client/dist")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next(); // let a genuinely-missing API route 404 normally, below
  res.sendFile(path.join(__dirname, "../../client/dist/index.html"));
});
// ---- end TUNNEL-BUILD-TEMP ----
 

app.use(notFound);
app.use(errorHandler);

export default app;