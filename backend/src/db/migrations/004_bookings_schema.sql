-- Appointments. One row per customer appointment; the services attached to it
-- live in booking_services (a booking can include more than one service).
--
-- appointment_date / appointment_time are stored as plain date + time in the
-- shop's local wall-clock time, not as a timestamptz: the shop's hours in
-- shop_settings.hours_json are wall-clock too, so keeping both in the same
-- frame of reference means availability never has to convert between zones.
--
-- duration_minutes is the total length of the appointment, snapshotted from the
-- sum of services.est_duration_minutes at booking time. Snapshotting it (rather
-- than re-summing the joined services on every read) keeps already-booked
-- appointments at the length they were actually booked for if a service's
-- estimated duration is later edited, and lets availability answer collision
-- questions from the bookings table alone.
CREATE TABLE IF NOT EXISTS bookings (
  id serial PRIMARY KEY,
  reference_id varchar NOT NULL UNIQUE,
  customer_name varchar NOT NULL,
  customer_email varchar NOT NULL,
  customer_phone varchar,
  vehicle_make varchar NOT NULL,
  vehicle_model varchar NOT NULL,
  vehicle_year integer NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  status varchar NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  diagnosis_request_id integer REFERENCES diagnosis_requests(id),
  created_at timestamp NOT NULL DEFAULT now()
);

-- Availability always queries by date (one day, or one calendar month).
CREATE INDEX IF NOT EXISTS bookings_appointment_date_idx
  ON bookings (appointment_date);

CREATE TABLE IF NOT EXISTS booking_services (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES services(id),
  UNIQUE (booking_id, service_id)
);

CREATE INDEX IF NOT EXISTS booking_services_booking_id_idx
  ON booking_services (booking_id);
