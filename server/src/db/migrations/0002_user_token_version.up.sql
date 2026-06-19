-- 0002_user_token_version.up.sql
--
-- Adds a per-user `token_version` counter for refresh-token rotation.
-- Logout bumps it, which invalidates all outstanding refresh tokens for that user.

ALTER TABLE users
  ADD COLUMN token_version integer NOT NULL DEFAULT 0;
