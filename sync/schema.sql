-- Stash Ledger sync: one row per sync code. id is a SHA-256 hash of the code, never the code itself.
CREATE TABLE IF NOT EXISTS saves (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL,     -- ticks, goal, Have counts, settings (JSON, max 32 KB)
  rev     INTEGER NOT NULL,  -- goes up by 1 on every save; stops two devices overwriting each other
  updated INTEGER NOT NULL,  -- last change, ms since 1970
  seen    INTEGER NOT NULL   -- last read or change; saves unseen for 180 days are deleted
);
CREATE INDEX IF NOT EXISTS saves_seen ON saves (seen);
