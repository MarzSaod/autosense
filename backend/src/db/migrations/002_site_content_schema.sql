CREATE TABLE IF NOT EXISTS services (
  id serial PRIMARY KEY,
  name varchar NOT NULL,
  description text,
  image_url varchar,
  est_price_min numeric NOT NULL,
  est_price_max numeric NOT NULL,
  est_duration_minutes integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS reviews (
  id serial PRIMARY KEY,
  customer_name varchar NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id serial PRIMARY KEY,
  image_url varchar NOT NULL,
  caption varchar,
  category varchar,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS shop_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name varchar NOT NULL,
  address varchar,
  phone varchar,
  email varchar,
  hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  appointment_duration_minutes integer NOT NULL,
  max_concurrent_appointments integer NOT NULL
);
