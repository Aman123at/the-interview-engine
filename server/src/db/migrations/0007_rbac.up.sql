-- 0007_rbac.up.sql
--
-- Phase 30 — Role-based access control.
--
-- - Widens users.role from a pg enum to TEXT + CHECK ('admin'|'hr'|'interviewer')
--   so the role set is reversible/extendable without an ALTER TYPE dance.
-- - Enforces ONE admin via a partial unique index that excludes soft-deleted rows.
-- - Adds the interview_types catalogue + interviewer specializations (with level)
--   and the candidate/candidate-types tables HR will own.
-- - Adds sessions.candidate_record_id linking a code session to a stable
--   candidate record (set by interviewers, read by HR reporting).
--
-- None of the new objects participate in the partial-unique one-session index on
-- sessions(user_id) — that invariant is unchanged.

--------------------------------------------------------------------------------
-- users.role: pg-enum -> TEXT + CHECK
--------------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'interviewer';
ALTER TABLE users
  ADD CONSTRAINT users_role_chk
  CHECK (role IN ('admin','hr','interviewer'));
DROP TYPE user_role;

-- Exactly ONE admin (across non-deleted rows).
CREATE UNIQUE INDEX users_single_admin_uniq
  ON users(role)
  WHERE role = 'admin' AND deleted_at IS NULL;

--------------------------------------------------------------------------------
-- interview_types  (skill domains for interviewer specialization +
-- candidate routing — NOT sandbox frameworks)
--------------------------------------------------------------------------------
CREATE TABLE interview_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         varchar(64) NOT NULL UNIQUE,
  label       varchar(120) NOT NULL,
  is_active   boolean NOT NULL DEFAULT TRUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER interview_types_set_updated_at
  BEFORE UPDATE ON interview_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Starter catalogue. Idempotent on the unique `key`.
INSERT INTO interview_types (key, label) VALUES
  ('javascript', 'JavaScript'),
  ('dotnet',     'Dotnet'),
  ('cpp',        'C++'),
  ('python',     'Python'),
  ('golang',     'GoLang'),
  ('react',      'React'),
  ('node',       'Node')
ON CONFLICT (key) DO NOTHING;

--------------------------------------------------------------------------------
-- interviewer_specializations
--------------------------------------------------------------------------------
CREATE TABLE interviewer_specializations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interview_type_id  uuid NOT NULL REFERENCES interview_types(id) ON DELETE RESTRICT,
  level              text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT interviewer_specializations_level_chk
    CHECK (level IN ('L1','L2','L3')),
  CONSTRAINT interviewer_specializations_user_type_uniq
    UNIQUE (user_id, interview_type_id)
);

CREATE INDEX interviewer_specializations_user_idx
  ON interviewer_specializations(user_id);

--------------------------------------------------------------------------------
-- candidates  (HR-owned. external_id is editable -> NOT a primary key.)
--------------------------------------------------------------------------------
CREATE TABLE candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id  varchar(120) NOT NULL,
  name         varchar(200) NOT NULL,
  created_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TRIGGER candidates_set_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Soft unique on external_id among non-deleted rows. HR can override by
-- soft-deleting the previous occupant before reusing the id.
CREATE UNIQUE INDEX candidates_external_id_uniq
  ON candidates(external_id)
  WHERE deleted_at IS NULL;

CREATE INDEX candidates_created_by_idx ON candidates(created_by);

--------------------------------------------------------------------------------
-- candidate_interview_types  (a candidate can be listed for >=1 type)
--------------------------------------------------------------------------------
CREATE TABLE candidate_interview_types (
  candidate_id       uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  interview_type_id  uuid NOT NULL REFERENCES interview_types(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, interview_type_id)
);

CREATE INDEX candidate_interview_types_type_idx
  ON candidate_interview_types(interview_type_id);

--------------------------------------------------------------------------------
-- sessions.candidate_record_id (nullable FK -> candidates)
-- Interviewers set this at create/close; HR reporting reads it. The Phase 25
-- free-text candidate_id stays as a snapshot/fallback.
--------------------------------------------------------------------------------
ALTER TABLE sessions
  ADD COLUMN candidate_record_id uuid REFERENCES candidates(id) ON DELETE SET NULL;

CREATE INDEX sessions_candidate_record_idx
  ON sessions(candidate_record_id)
  WHERE candidate_record_id IS NOT NULL;
