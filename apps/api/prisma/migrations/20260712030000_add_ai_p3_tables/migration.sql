-- AI 能力拓展 Batch P3 新增 5 张表（契约 §4.1~4.4；daily_brief 拆日报+订阅两表）
-- 非破坏性：纯 CREATE TABLE，不改动任何现有表；容器内 prisma migrate deploy 执行。
-- 护城河铁律：所有表无物理外键 / 无级联 / 无反向 relation，仅逻辑关联字段+索引。
--   career_ai_draft 为草稿独立表，AI 生成先入草稿，approve 后业务层同步 career/career_skill（S-04）。

-- §4.1 AI 模拟面试会话表
CREATE TABLE `ai_interview` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `difficulty` VARCHAR(16) NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `overall_score` INT NULL,
    `dimensions_data` JSON NULL,
    `suggestions_data` JSON NULL,
    `degraded` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_user_career` (`user_id`, `career_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §4.1 AI 面试问答明细表（属于某个 interview，逻辑关联 ai_interview.id）
CREATE TABLE `ai_interview_qa` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `interview_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `seq` INT NOT NULL,
    `question` TEXT NOT NULL,
    `answer` TEXT NULL,
    `score` INT NULL,
    `feedback` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `idx_interview_seq` (`interview_id`, `seq`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §4.2 AI 面试题库表（AI 生成 + 人工审核发布，status=0 未审核不对外）
CREATE TABLE `interview_question` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `difficulty` VARCHAR(16) NOT NULL,
    `question` TEXT NOT NULL,
    `tags_data` JSON NULL,
    `sample_answer` TEXT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_career_status` (`career_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §4.3 职业热点日报表（个性化，每人每天一份，ops 审核后发布）
CREATE TABLE `daily_brief` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `brief_date` DATE NOT NULL,
    `items_data` JSON NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_user_date` (`user_id`, `brief_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §4.3 日报订阅设置表（一人一条）
CREATE TABLE `daily_brief_subscription` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `enabled` TINYINT NOT NULL DEFAULT 1,
    `categories_data` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_user_id` (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §4.4 职业库 AI 草稿表（S-04 铁律：先入草稿，approve 后业务层同步正式表）
CREATE TABLE `career_ai_draft` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `creator_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `draft_data` JSON NOT NULL,
    `skills_data` JSON NOT NULL,
    `ref_sources_data` JSON NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `review_remark` VARCHAR(255) NULL,
    `synced_career_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_status` (`status`),
    INDEX `idx_creator` (`creator_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;