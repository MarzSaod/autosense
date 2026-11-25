ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS responded_at timestamptz;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reference_id varchar(20) UNIQUE;

UPDATE bookings SET reference_id = 'AS-' || lpad(id::text, 5, '0') WHERE reference_id IS NULL;
