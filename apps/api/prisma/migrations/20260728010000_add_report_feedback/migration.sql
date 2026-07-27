-- 补建 report_feedback 表（首页"用户满意度""报告评分"两个真实指标的数据源）
-- 背景：model ReportFeedback 随 stats/feedback 特性加入 schema.prisma，但从未生成对应迁移，
--       导致生产库缺表、StatsService.reportFeedback.count() 恒 500（stats/home code 5000）。
-- 非破坏性：纯 CREATE TABLE + 一条 report 外键，不改动任何现有表。
-- 表结构严格对齐 schema.prisma model ReportFeedback；外键范式与 init 迁移中 report_share_report_id_fkey 一致。

-- CreateTable
CREATE TABLE `report_feedback` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `rating` TINYINT NOT NULL,
    `is_satisfied` TINYINT NOT NULL DEFAULT 0,
    `content` VARCHAR(200) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_report`(`report_id`),
    INDEX `idx_rating`(`rating`),
    UNIQUE INDEX `uk_user_report`(`user_id`, `report_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `report_feedback` ADD CONSTRAINT `report_feedback_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `report`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;