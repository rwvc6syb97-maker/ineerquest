-- AI 能力拓展 Batch P2 新增 3 张表（契约 §3.1~3.3）
-- 非破坏性：纯 CREATE TABLE，不改动任何现有表；容器内 prisma migrate deploy 执行。
-- 护城河铁律：AI 增值表与规则本体表（report/report_section/career）分表隔离，
--   仅保留逻辑关联字段+索引，无物理外键 / 无级联 / 无反向 relation。

-- §3.3 AI 深度报告「个性化章节」表（护城河核心）
-- 结果绝不写入 report / report_section 本体表，独立存储；逻辑关联 report_id。
CREATE TABLE `report_ai_chapter` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `focus_career_id` BIGINT UNSIGNED NULL,
    `title` VARCHAR(255) NOT NULL,
    `paragraphs` JSON NOT NULL,
    `degraded` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_report_user` (`report_id`, `user_id`),
    INDEX `idx_user_id` (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §3.2 AI 简历/求职信文档表（可长期保存 + 软删，用户可删除自己文档）
CREATE TABLE `ai_resume_doc` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `type` VARCHAR(16) NOT NULL DEFAULT 'resume',
    `content` TEXT NOT NULL,
    `sections_data` JSON NOT NULL,
    `degraded` TINYINT NOT NULL DEFAULT 0,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_user_career` (`user_id`, `career_id`),
    INDEX `idx_user_type` (`user_id`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §3.1 AI 双人/团队协作分析结果表（登录用户保存才落库，可长期保存 + 软删）
CREATE TABLE `ai_collab_analysis` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `members_data` JSON NOT NULL,
    `scene` VARCHAR(64) NULL,
    `summary` TEXT NOT NULL,
    `pairs_data` JSON NOT NULL,
    `risks_data` JSON NOT NULL,
    `degraded` TINYINT NOT NULL DEFAULT 0,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `idx_user_id` (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;