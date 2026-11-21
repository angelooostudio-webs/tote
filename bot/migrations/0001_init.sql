-- Orders, conversation log and payment proofs for the tote pre-sale bot.
-- All timestamps are ISO-8601 UTC strings. Money is integer COP.

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT    NOT NULL UNIQUE,          -- ANG-7F3K, made by the site
  wa_id            TEXT    NOT NULL,                 -- customer's WhatsApp number (digits)
  name             TEXT    NOT NULL,
  option           TEXT    NOT NULL,                 -- bundle | toteOnly
  qty              INTEGER NOT NULL,
  add_ons          TEXT    NOT NULL DEFAULT '[]',    -- JSON array of add-on ids
  delivery         TEXT    NOT NULL,                 -- pickup | shipping
  total            INTEGER NOT NULL,                 -- recomputed by the bot, never from the message
  status           TEXT    NOT NULL,                 -- AWAITING_PAYMENT | PENDING_REVIEW | CONFIRMED | REJECTED | EXPIRED | NEEDS_HUMAN
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  reserved_until   TEXT,                             -- stock held until (AWAITING_PAYMENT)
  reminder_sent    INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  confirmed_at     TEXT
);
CREATE INDEX orders_wa ON orders (wa_id, created_at);
CREATE INDEX orders_status ON orders (status);

-- every inbound and outbound message; inbound wa_message_id dedupes Meta's retries
CREATE TABLE messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  wa_message_id TEXT UNIQUE,
  wa_id         TEXT NOT NULL,
  direction     TEXT NOT NULL,                       -- in | out
  kind          TEXT NOT NULL,                       -- text | image | button | template | document | other
  body          TEXT,
  order_code    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX messages_wa ON messages (wa_id, created_at);

-- payment screenshots: only the hash and extracted fields are kept, never the image
CREATE TABLE payment_proofs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code     TEXT NOT NULL,
  wa_media_id    TEXT NOT NULL,
  image_hash     TEXT NOT NULL,                      -- perceptual hash (hex)
  extracted_json TEXT,
  verdict        TEXT NOT NULL,                      -- pass | fail
  reasons        TEXT,                               -- JSON array of failed checks
  created_at     TEXT NOT NULL
);
CREATE INDEX proofs_hash ON payment_proofs (image_hash);
CREATE INDEX proofs_order ON payment_proofs (order_code);
