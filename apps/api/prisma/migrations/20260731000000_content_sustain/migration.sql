-- 内容可持续化与AI求职工具升级（M1/M4）数据库变更
-- 权威依据：PRD《需求文档-内容可持续化与AI求职工具升级》§3.1 / §6.2
-- 非破坏性：career/ai_resume_doc 加列均给默认值或可空，避免锁表阻塞与存量报错；纯 ALTER + CREATE，不删任何字段。
-- 逻辑关联无物理外键（沿用护城河风格）；软删 is_deleted + deleted_at；C端表保留 user_id 隔离。
-- 【生产执行前必须备份】本项目 Railway MySQL，方案不可回滚，migrate deploy 前先物理备份 career / ai_resume_doc。

-- ============ 变更点1：career 表新增来源/审核字段 + 索引 ============
-- 存量行 review_status 默认 2（已上线），不影响前台既有展示；source_type 默认 1（人工）。
ALTER TABLE `career`
    ADD COLUMN `source_type` TINYINT NOT NULL DEFAULT 1 AFTER `suit_types`,
    ADD COLUMN `review_status` TINYINT NOT NULL DEFAULT 2 AFTER `source_type`,
    ADD COLUMN `source_url` VARCHAR(512) NULL AFTER `review_status`,
    ADD COLUMN `last_crawl_at` DATETIME(3) NULL AFTER `source_url`;

CREATE INDEX `idx_review_source` ON `career` (`review_status`, `source_type`);

-- ============ 变更点2：learning_resource 扩展（表已存在于 init，改为 ALTER 加列）============
-- 新增来源/审核/编码/摘要字段；resource_code 可空（存量为空，MySQL 唯一键允许多 NULL）。
ALTER TABLE `learning_resource`
    ADD COLUMN `resource_code` VARCHAR(32) NULL AFTER `id`,
    ADD COLUMN `summary` TEXT NULL AFTER `provider`,
    ADD COLUMN `source_type` TINYINT NOT NULL DEFAULT 1 AFTER `summary`,
    ADD COLUMN `review_status` TINYINT NOT NULL DEFAULT 2 AFTER `source_type`;

CREATE UNIQUE INDEX `uk_resource_code` ON `learning_resource` (`resource_code`);
CREATE INDEX `idx_career_review` ON `learning_resource` (`career_id`, `review_status`);

-- ============ 变更点3：新增 content_source_task（AI 检索任务）============
CREATE TABLE `content_source_task` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `task_name` VARCHAR(128) NOT NULL,
    `target_type` TINYINT NOT NULL,
    `keywords` JSON NOT NULL,
    `schedule` VARCHAR(64) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `last_run_at` DATETIME(3) NULL,
    `last_result_count` INT NOT NULL DEFAULT 0,
    `error_msg` VARCHAR(512) NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_status_target` (`status`, `target_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============ 变更点4：ai_resume_doc 语义调整 + 新增字段 + 索引 ============
-- 不删旧字段；mode 默认 2（上传优化）。放宽 content/sections_data 为可空以兼容 mode=2；
-- 存量 mode=1 数据这两列已有值，改可空不影响存量读取。
ALTER TABLE `ai_resume_doc`
    MODIFY COLUMN `content` TEXT NULL,
    MODIFY COLUMN `sections_data` JSON NULL,
    ADD COLUMN `mode` TINYINT NOT NULL DEFAULT 2 AFTER `degraded`,
    ADD COLUMN `target_career_id` BIGINT UNSIGNED NULL AFTER `mode`,
    ADD COLUMN `source_file_name` VARCHAR(255) NULL AFTER `target_career_id`,
    ADD COLUMN `extracted_text` TEXT NULL AFTER `source_file_name`,
    ADD COLUMN `suggestions` JSON NULL AFTER `extracted_text`,
    ADD COLUMN `expire_at` DATETIME(3) NULL AFTER `suggestions`;

CREATE INDEX `idx_expire` ON `ai_resume_doc` (`expire_at`);