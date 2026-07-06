-- CreateIndex
CREATE INDEX `idx_user_deleted_created` ON `assessment_record`(`user_id`, `is_deleted`, `created_at`);

-- CreateIndex
CREATE INDEX `idx_user_deleted_created` ON `report`(`user_id`, `is_deleted`, `created_at`);
