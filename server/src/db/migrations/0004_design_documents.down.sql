-- 0004_design_documents.down.sql

DROP TRIGGER IF EXISTS design_documents_set_updated_at ON design_documents;
DROP INDEX IF EXISTS design_documents_user_kind_idx;
DROP INDEX IF EXISTS design_documents_user_idx;
DROP TABLE IF EXISTS design_documents;
DROP TYPE IF EXISTS design_db_engine;
DROP TYPE IF EXISTS design_doc_kind;
