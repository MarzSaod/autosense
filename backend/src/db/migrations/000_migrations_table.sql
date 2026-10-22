CREATE TABLE IF NOT EXISTS applied_migrations (
  filename text PRIMARY KEY,
  applied_at timestamp DEFAULT now()
);
