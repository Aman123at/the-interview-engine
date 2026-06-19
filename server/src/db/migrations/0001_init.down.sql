-- 0001_init.down.sql — reverse of 0001_init.up.sql

DROP TABLE IF EXISTS session_files;
DROP TABLE IF EXISTS session_events;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS session_event_level;
DROP TYPE IF EXISTS session_status;
DROP TYPE IF EXISTS user_role;

DROP FUNCTION IF EXISTS set_updated_at();
