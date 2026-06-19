-- 0003_session_share_token.down.sql

DROP INDEX IF EXISTS sessions_share_token_uniq;
ALTER TABLE sessions DROP COLUMN IF EXISTS share_token;
