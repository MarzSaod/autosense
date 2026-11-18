CREATE TABLE IF NOT EXISTS staff_users (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  email varchar(255) UNIQUE NOT NULL,
  password_hash varchar(255) NOT NULL,
  role varchar(50) DEFAULT 'staff',
  created_at timestamp DEFAULT now()
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at timestamp;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at timestamp;
