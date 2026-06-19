-- 0003_session_share_token.up.sql
--
-- Adds an unguessable per-session `share_token` so an interviewer can hand a
-- LIVE session to an UNAUTHENTICATED candidate via a link. Unique while non-null
-- so a token resolves to exactly one session. NULL = sharing not enabled.

ALTER TABLE sessions
  ADD COLUMN share_token varchar(64);

CREATE UNIQUE INDEX sessions_share_token_uniq
  ON sessions(share_token)
  WHERE share_token IS NOT NULL;
