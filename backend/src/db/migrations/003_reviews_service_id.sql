ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS service_id integer REFERENCES services(id);
