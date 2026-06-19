-- 0006_design_doc_share.down.sql

DROP INDEX IF EXISTS design_documents_share_token_uniq;
ALTER TABLE design_documents DROP COLUMN IF EXISTS share_token;
