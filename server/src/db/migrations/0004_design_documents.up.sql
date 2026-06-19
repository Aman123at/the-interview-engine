-- 0004_design_documents.up.sql
--
-- Phase 19: design-interview documents. This is a NEW, container-free track
-- that lives ALONGSIDE the `sessions` table and is INDEPENDENT from it:
-- design docs have no container, no port, no volume, and they DO NOT
-- participate in the partial-unique one-session index on sessions(user_id).
-- A user can have any number of design docs of either kind concurrently with
-- a code session.

CREATE TYPE design_doc_kind AS ENUM ('db_design', 'system_design');
CREATE TYPE design_db_engine AS ENUM ('postgresql', 'mysql', 'mongodb');

CREATE TABLE design_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind        design_doc_kind NOT NULL,
  title       varchar(200) NOT NULL,
  -- db_engine is only meaningful for kind = 'db_design'; for system_design it
  -- must be NULL. Enforced by the CHECK below.
  db_engine   design_db_engine,
  -- The canvas model. Per-kind shape lives in the contract; the DB just
  -- stores it as jsonb so the column is forward-compatible with new fields.
  document    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Small thumbnail (data URL or external ref). Nullable until first save.
  thumbnail   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT design_documents_db_engine_kind_chk
    CHECK ((kind = 'db_design' AND db_engine IS NOT NULL)
        OR (kind = 'system_design' AND db_engine IS NULL))
);

CREATE INDEX design_documents_user_idx
  ON design_documents(user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX design_documents_user_kind_idx
  ON design_documents(user_id, kind, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER design_documents_set_updated_at
  BEFORE UPDATE ON design_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
