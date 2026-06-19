-- 0005_session_history.up.sql
--
-- Phase 22 foundation: columns the past-sessions page + download (Phase 23),
-- delete (Phase 24) and close-rating (Phase 25) actions all read or write.
--
-- None of these columns affect the partial unique index
-- `sessions_one_active_per_user_uniq`, which is restricted to non-terminal
-- statuses (pending/initializing/running/saving/recoverable). Past-session
-- rows live in terminal statuses (ended/error/recoverable), so adding
-- soft-delete/rating fields on them cannot violate the one-session rule.

ALTER TABLE sessions
  ADD COLUMN candidate_rating  smallint,
  ADD COLUMN candidate_id      text,
  ADD COLUMN volume_deleted    boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN deleted_at        timestamptz;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_candidate_rating_chk
    CHECK (candidate_rating IS NULL OR (candidate_rating BETWEEN 1 AND 5));

-- Fast filter for the history listing: terminal, not soft-deleted, by user.
CREATE INDEX sessions_history_idx
  ON sessions(user_id, COALESCE(ended_at, last_active_at) DESC)
  WHERE deleted_at IS NULL
    AND status IN ('ended','error','recoverable');
