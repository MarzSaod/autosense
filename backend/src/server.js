import "dotenv/config";
import app from "./app.js";
import {
  SHOP_TIME_ZONE,
  SHOP_TIME_ZONE_SOURCE,
  shopNow,
} from "./lib/availability.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set. The server cannot start without it.");
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32 || /placeholder/i.test(process.env.JWT_SECRET)) {
  console.warn("JWT_SECRET is weak or contains 'placeholder'. Use a long random string in production.");
}

const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  console.log(`AutoSense backend listening on port ${port}`);

  const now = shopNow();
  console.log(
    `Shop timezone: ${SHOP_TIME_ZONE} (from ${SHOP_TIME_ZONE_SOURCE}); ` +
      `shop-local now is ${now.dateKey} ${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:` +
      `${String(now.minutes % 60).padStart(2, "0")}, ` +
      `server clock is ${new Date().toISOString()}`
  );
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the other process or set PORT to a different value.`);
  } else {
    console.error(`Server error: ${err.message}`);
  }
  process.exit(1);
});
