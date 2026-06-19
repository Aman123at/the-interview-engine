-- 0007_rbac.down.sql
--
-- Reverse Phase 30. Order matters: drop dependents first, then narrow the
-- users.role column back to the original pg enum ('interviewer','admin').
-- Any rows that adopted the new 'hr' role are folded back to 'interviewer'
-- so the enum cast succeeds (a destructive cast we accept on rollback).

ALTER TABLE sessions DROP COLUMN IF EXISTS candidate_record_id;

DROP TABLE IF EXISTS candidate_interview_types;
DROP TABLE IF EXISTS candidates;
DROP TABLE IF EXISTS interviewer_specializations;
DROP TABLE IF EXISTS interview_types;

DROP INDEX IF EXISTS users_single_admin_uniq;

-- Narrow role back to the original enum.
UPDATE users SET role = 'interviewer' WHERE role NOT IN ('interviewer','admin');
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_chk;
CREATE TYPE user_role AS ENUM ('interviewer', 'admin');
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'interviewer';
