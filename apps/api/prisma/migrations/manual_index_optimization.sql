-- Manual index optimization for user listing queries
-- Date: 2026-07-06
-- Fixes: Using filesort on user_id + is_deleted + ORDER BY created_at DESC

-- Drop redundant index (result_id already covered by UNIQUE report_result_id_key)
ALTER TABLE report DROP INDEX IF EXISTS idx_result_id;

-- Add composite index for user report listing (WHERE user_id=? AND is_deleted=0 ORDER BY created_at DESC)
ALTER TABLE report ADD INDEX idx_user_deleted_created (user_id, is_deleted, created_at);

-- Add composite index for user assessment listing (WHERE user_id=? AND is_deleted=0 ORDER BY created_at DESC)
ALTER TABLE assessment_record ADD INDEX idx_user_deleted_created (user_id, is_deleted, created_at);
