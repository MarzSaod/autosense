-- Messages sent from the Contact page. Stored rather than only emailed so a
-- message is never lost when mail is unconfigured or the SMTP server is down:
-- the insert is what makes the request succeed, and the notification email is
-- best effort on top of it.
--
-- `read` is for whoever works the inbox later; nothing sets it today.
CREATE TABLE IF NOT EXISTS contact_messages (
  id serial PRIMARY KEY,
  name varchar(255) NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(50),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read boolean NOT NULL DEFAULT false
);

-- The inbox view reads newest first, unread first.
CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx
  ON contact_messages (created_at DESC);
