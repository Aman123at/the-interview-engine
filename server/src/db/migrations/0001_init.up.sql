-- 0001_init.up.sql — initial schema for interview-sandbox-server
--
-- Tables: users, sessions, session_events, session_files
-- Plus: shared updated_at trigger, role/status/level enums, and a partial
-- unique index that enforces the HARD ONE-SESSION RULE at the DB level
-- (a user may have at most one session in a non-terminal status).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh on UPDATE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--------------------------------------------------------------------------------
-- Enums
--------------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('interviewer', 'admin');

CREATE TYPE session_status AS ENUM (
  'pending',
  'initializing',
  'running',
  'saving',
  'ended',
  'error',
  'recoverable'
);

CREATE TYPE session_event_level AS ENUM ('info', 'warn', 'error');

--------------------------------------------------------------------------------
-- users
--------------------------------------------------------------------------------
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           varchar(320) NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  display_name    varchar(120) NOT NULL,
  role            user_role NOT NULL DEFAULT 'interviewer',
  is_active       boolean NOT NULL DEFAULT TRUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--------------------------------------------------------------------------------
-- sessions
--------------------------------------------------------------------------------
CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  framework           varchar(40) NOT NULL,
  customization       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              session_status NOT NULL DEFAULT 'pending',
  container_id        varchar(128),
  volume_name         varchar(128),
  host_preview_port   integer,
  started_at          timestamptz,
  ended_at            timestamptz,
  last_active_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx      ON sessions(user_id);
CREATE INDEX sessions_status_idx       ON sessions(status);
CREATE INDEX sessions_user_created_idx ON sessions(user_id, created_at);

-- HARD ONE-SESSION RULE: at most one non-terminal session per user.
-- Enforced at the DB level so a race in the API can never break the invariant.
CREATE UNIQUE INDEX sessions_one_active_per_user_uniq
  ON sessions(user_id)
  WHERE status IN ('pending','initializing','running','saving','recoverable');

CREATE TRIGGER sessions_set_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

--------------------------------------------------------------------------------
-- session_events  (append-only audit / lifecycle log)
--------------------------------------------------------------------------------
CREATE TABLE session_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type        varchar(64) NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  level       session_event_level NOT NULL DEFAULT 'info',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX session_events_session_idx ON session_events(session_id, created_at);
CREATE INDEX session_events_type_idx    ON session_events(type);

--------------------------------------------------------------------------------
-- session_files  (durable source-file copy, EXCLUDES node_modules)
--------------------------------------------------------------------------------
CREATE TABLE session_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  path        varchar(1024) NOT NULL,
  content     text NOT NULL DEFAULT '',
  size        integer NOT NULL DEFAULT 0,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX session_files_session_path_uniq ON session_files(session_id, path);

CREATE TRIGGER session_files_set_updated_at
  BEFORE UPDATE ON session_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
