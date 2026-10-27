import "dotenv/config";
import { pool } from "../src/db/pool.js";
import services from "../../frontend/src/mocks/services.js";
import reviews from "../../frontend/src/mocks/reviews.js";
import gallery from "../../frontend/src/mocks/gallery.js";
import shopSettings from "../../frontend/src/mocks/shopSettings.js";

async function seedServices() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM services");

    for (const row of services) {
      await client.query(
        `INSERT INTO services
          (id, name, description, image_url,
           est_price_min, est_price_max, est_duration_minutes, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          row.id,
          row.name,
          row.description,
          row.image_url,
          row.est_price_min,
          row.est_price_max,
          row.est_duration_minutes,
          row.is_active,
        ]
      );
    }

    await client.query(
      "SELECT setval('services_id_seq', (SELECT max(id) FROM services))"
    );
    await client.query("COMMIT");
    return services.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedReviews() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM reviews");

    // Each mock review names its service as text; store the relationship to
    // services instead, resolved by name.
    const { rows: serviceRows } = await client.query(
      "SELECT id, name FROM services"
    );
    const serviceIdByName = new Map(
      serviceRows.map(({ id, name }) => [name, id])
    );

    for (const row of reviews) {
      const serviceId = serviceIdByName.get(row.service_name);

      if (!serviceId) {
        throw new Error(
          `review ${row.id} names service "${row.service_name}", which is not in the services table`
        );
      }

      await client.query(
        `INSERT INTO reviews
          (id, customer_name, rating, review_text, is_featured, created_at, service_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.id,
          row.customer_name,
          row.rating,
          row.review_text,
          row.is_featured,
          row.created_at,
          serviceId,
        ]
      );
    }

    await client.query(
      "SELECT setval('reviews_id_seq', (SELECT max(id) FROM reviews))"
    );
    await client.query("COMMIT");
    return reviews.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedGalleryImages() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM gallery_images");

    for (const row of gallery) {
      await client.query(
        `INSERT INTO gallery_images
          (id, image_url, caption, category, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.image_url, row.caption, row.category, row.display_order]
      );
    }

    await client.query(
      "SELECT setval('gallery_images_id_seq', (SELECT max(id) FROM gallery_images))"
    );
    await client.query("COMMIT");
    return gallery.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedShopSettings() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM shop_settings");

    await client.query(
      `INSERT INTO shop_settings
        (id, shop_name, address, phone, email, hours_json,
         appointment_duration_minutes, max_concurrent_appointments)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)`,
      [
        shopSettings.shop_name,
        shopSettings.address,
        shopSettings.phone,
        shopSettings.email,
        JSON.stringify(shopSettings.hours_json),
        shopSettings.appointment_duration_minutes,
        shopSettings.max_concurrent_appointments,
      ]
    );

    await client.query("COMMIT");
    return 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  const inserted = {
    services: await seedServices(),
    reviews: await seedReviews(),
    gallery_images: await seedGalleryImages(),
    shop_settings: await seedShopSettings(),
  };

  const { rows: counts } = await pool.query(
    `SELECT 'services' AS table_name, count(*)::int AS total FROM services
      UNION ALL
     SELECT 'reviews', count(*)::int FROM reviews
      UNION ALL
     SELECT 'gallery_images', count(*)::int FROM gallery_images
      UNION ALL
     SELECT 'shop_settings', count(*)::int FROM shop_settings
     ORDER BY table_name`
  );

  console.log("rows inserted:");
  for (const [table, total] of Object.entries(inserted)) {
    console.log(`  ${table}: ${total}`);
  }
  console.log("");
  console.log("rows now in database:");
  for (const { table_name, total } of counts) {
    console.log(`  ${table_name}: ${total}`);
  }
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
