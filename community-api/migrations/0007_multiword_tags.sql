-- P15.7 UX correction: tags may contain spaces; commas separate tags in the UI.
-- Preserve all historical animation tag associations and search indexes.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS animation_tags_migration_v7 (
  animation_id TEXT NOT NULL REFERENCES animations(id) ON DELETE CASCADE,
  tag TEXT NOT NULL CHECK(length(tag) BETWEEN 1 AND 32
    AND tag NOT GLOB '*[^a-z0-9_ -]*'
    AND tag=trim(tag)
    AND instr(tag,'  ')=0),
  PRIMARY KEY(animation_id,tag)
);
INSERT OR IGNORE INTO animation_tags_migration_v7(animation_id,tag)
  SELECT animation_id,tag FROM animation_tags;
DROP TABLE animation_tags;
ALTER TABLE animation_tags_migration_v7 RENAME TO animation_tags;
CREATE INDEX IF NOT EXISTS idx_tags_lookup ON animation_tags(tag,animation_id);
CREATE TRIGGER IF NOT EXISTS trg_tags_limit BEFORE INSERT ON animation_tags
WHEN (SELECT COUNT(*) FROM animation_tags WHERE animation_id=NEW.animation_id)>=12
BEGIN SELECT RAISE(ABORT,'too many tags'); END;
