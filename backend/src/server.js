import "dotenv/config";
import app from "./app.js";
import {
  SHOP_TIME_ZONE,
  SHOP_TIME_ZONE_SOURCE,
  shopNow,
} from "./lib/availability.js";

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
