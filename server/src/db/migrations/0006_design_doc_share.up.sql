-- 0006_design_doc_share.up.sql
--
-- Adds an unguessable per-document `share_token` so a design owner can hand a
-- LIVE design canvas to UNAUTHENTICATED guests via a link. Unique while
-- non-null so a token resolves to exactly one design document. NULL = sharing
-- not enabled.
--
-- Independent from `sessions.share_token` (different table, separate index) —
-- multi-user collaboration semantics live in the WS layer, not the schema.

ALTER TABLE design_documents
  ADD COLUMN share_token varchar(64);

CREATE UNIQUE INDEX design_documents_share_token_uniq
  ON design_documents(share_token)
  WHERE share_token IS NOT NULL;
