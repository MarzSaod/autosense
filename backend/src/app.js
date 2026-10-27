import express from "express";
import cors from "cors";
import "dotenv/config";
import diagnosisRouter from "./routes/diagnosis.js";

// Explicit CORS allowlist (no wildcard): local dev plus the live frontend.
const defaultOrigins = [
  "http://localhost:5173",
  "https://autosense-phi.vercel.app",
];

const configuredOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...configuredOrigins])];

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/diagnosis", diagnosisRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

export default app;
