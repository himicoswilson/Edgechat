PRAGMA foreign_keys = OFF;

CREATE TABLE channels_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('public', 'private', 'dm')),
  dm_key TEXT UNIQUE,
  created_by INTEGER,
  mute_everyone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO channels_new (id, name, description, avatar_key, kind, dm_key, created_by, mute_everyone, created_at, deleted_at)
SELECT id, name, description, avatar_key, kind, dm_key, created_by, mute_everyone, created_at, deleted_at
FROM channels;

DROP TABLE channels;
ALTER TABLE channels_new RENAME TO channels;

-- 唯一性只约束未删除的群组：软删除后同名可复用
CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_name_active
  ON channels(name) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;