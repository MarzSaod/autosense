import "dotenv/config";
import app from "./app.js";
import {
  SHOP_TIME_ZONE,
  SHOP_TIME_ZONE_SOURCE,
  shopNow,
} from "./lib/availability.js";

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`AutoSense backend listening on port ${port}`);

  // Print the clock availability is computed against. Importing the module
  // above already threw if the runtime could not honour the zone, so reaching
  // this line means the zone is real; logging it makes a wrong-but-valid zone
  // (or an unnoticed fall back to the default) visible in the deploy logs.
  const now = shopNow();
  console.log(
    `Shop timezone: ${SHOP_TIME_ZONE} (from ${SHOP_TIME_ZONE_SOURCE}); ` +
      `shop-local now is ${now.dateKey} ${String(Math.floor(now.minutes / 60)).padStart(2, "0")}:` +
      `${String(now.minutes % 60).padStart(2, "0")}, ` +
      `server clock is ${new Date().toISOString()}`
  );
});
