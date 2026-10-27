import express from "express";
import cors from "cors";
import "dotenv/config";
import diagnosisRouter from "./routes/diagnosis.js";
import servicesRouter from "./routes/services.js";
import reviewsRouter from "./routes/reviews.js";
import galleryRouter from "./routes/gallery.js";
import shopSettingsRouter from "./routes/shopSettings.js";

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

// Railway puts exactly one reverse proxy in front of the app, which sets
// X-Forwarded-For. Trusting that single hop lets express-rate-limit key on the
// visitor's real IP instead of rejecting the header as unexpected.
app.set("trust proxy", 1);

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
app.use("/api/services", servicesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/shop-settings", shopSettingsRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

export default app;
