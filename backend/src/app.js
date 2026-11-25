import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import "dotenv/config";
import diagnosisRouter from "./routes/diagnosis.js";
import servicesRouter from "./routes/services.js";
import reviewsRouter from "./routes/reviews.js";
import galleryRouter from "./routes/gallery.js";
import shopSettingsRouter from "./routes/shopSettings.js";
import availabilityRouter from "./routes/availability.js";
import bookingsRouter from "./routes/bookings.js";
import contactRouter from "./routes/contact.js";
import adminRouter from "./routes/admin.js";
import {
  SHOP_TIME_ZONE,
  SHOP_TIME_ZONE_SOURCE,
  shopNow,
} from "./lib/availability.js";

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

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please wait a moment and try again." },
});
app.use("/api", globalApiLimiter);

app.get("/api/health", (req, res) => {
  // The shop clock is reported here so the timezone the deployed container is
  // actually using can be checked from outside, without shell access. A
  // mismatch between shop_now and server_utc_now is the signature of the
  // container losing its timezone data.
  const now = shopNow();

  res.json({
    status: "ok",
    shop_time_zone: SHOP_TIME_ZONE,
    shop_time_zone_source: SHOP_TIME_ZONE_SOURCE,
    shop_now: `${now.dateKey} ${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:${String(
      now.minutes % 60
    ).padStart(2, "0")}`,
    server_utc_now: new Date().toISOString(),
  });
});

app.use("/api/diagnosis", diagnosisRouter);
app.use("/api/services", servicesRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/shop-settings", shopSettingsRouter);
app.use("/api/availability", availabilityRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/contact", contactRouter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});
app.use("/api/admin/login", loginLimiter);

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password change attempts, please try again later." },
});
app.use("/api/admin/account/password", passwordChangeLimiter);

app.use("/api/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

export default app;
