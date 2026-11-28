-- anonymous visit funnel: one counter per day and step (no personal data)
CREATE TABLE events (
  day   TEXT    NOT NULL,           -- YYYY-MM-DD, Bogotá
  name  TEXT    NOT NULL,           -- visit | sheet_open | option | delivery | whatsapp
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
);
