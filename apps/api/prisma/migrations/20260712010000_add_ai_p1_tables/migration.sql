-- AI 能力拓展 Batch P1 新增 3 张表（契约 §2.1~2.3）
-- 非破坏性：纯 CREATE TABLE，不改动任何现有表；容器内 prisma migrate deploy 执行。
-- 关联策略：逻辑关联（字段+索引，无物理外键/无级联），与规则版表分表隔离（护城河）。

-- §2.1 AI 动态成长计划（与规则版 career_roadmap / growth_plan 分表隔离）
CREATE TABLE `career_growth_plan` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `target_months` TINYINT UNSIGNED NOT NULL,
    `weeks_data` JSON NOT NULL,
    `degraded` TINYINT NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `idx_user_career` (`user_id`, `career_id`),
    INDEX `idx_user_status` (`user_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §2.2 AI 咨询前问题梳理提纲（一订单一提纲，orderId 唯一 → 幂等 4710）
CREATE TABLE `coaching_pre_brief` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `outline` TEXT NOT NULL,
    `tags` JSON NOT NULL,
    `answers_data` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_order_id` (`order_id`),
    INDEX `idx_user_id` (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- §2.3 AI 咨询后行动纪要（一订单一纪要，orderId 唯一 → 幂等 4711）
CREATE TABLE `coaching_summary` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `summary` TEXT NOT NULL,
    `todos_data` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `uk_order_id` (`order_id`),
    INDEX `idx_user_id` (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;