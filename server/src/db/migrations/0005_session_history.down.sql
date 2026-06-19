-- 0005_session_history.down.sql

DROP INDEX IF EXISTS sessions_history_idx;

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_candidate_rating_chk;

ALTER TABLE sessions
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS volume_deleted,
  DROP COLUMN IF EXISTS candidate_id,
  DROP COLUMN IF EXISTS candidate_rating;
