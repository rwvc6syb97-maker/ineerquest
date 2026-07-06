-- CreateTable
CREATE TABLE `user` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_no` CHAR(20) NOT NULL,
    `nickname` VARCHAR(64) NOT NULL DEFAULT '',
    `avatar_url` VARCHAR(512) NOT NULL DEFAULT '',
    `phone` VARCHAR(20) NULL,
    `phone_country` VARCHAR(8) NOT NULL DEFAULT '+86',
    `email` VARCHAR(128) NULL,
    `password_hash` VARCHAR(255) NULL,
    `gender` TINYINT NOT NULL DEFAULT 0,
    `role` TINYINT NOT NULL DEFAULT 1,
    `admin_role` VARCHAR(32) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_paid` TINYINT NOT NULL DEFAULT 0,
    `paid_expire_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `deactivated_at` DATETIME(3) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_role_status`(`role`, `status`),
    INDEX `idx_deactivated_at`(`deactivated_at`),
    INDEX `idx_created_at`(`created_at`),
    UNIQUE INDEX `uk_user_no`(`user_no`),
    UNIQUE INDEX `uk_phone`(`phone`, `phone_country`),
    UNIQUE INDEX `uk_email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_oauth` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `provider` TINYINT NOT NULL,
    `open_id` VARCHAR(128) NOT NULL,
    `union_id` VARCHAR(128) NULL,
    `access_data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_id`(`user_id`),
    INDEX `idx_union_id`(`union_id`),
    UNIQUE INDEX `uk_provider_openid`(`provider`, `open_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_privacy_setting` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `profile_public` TINYINT NOT NULL DEFAULT 0,
    `report_shareable` TINYINT NOT NULL DEFAULT 1,
    `allow_recommend` TINYINT NOT NULL DEFAULT 1,
    `allow_data_analysis` TINYINT NOT NULL DEFAULT 1,
    `push_notification` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_deactivation` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `reason` VARCHAR(255) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `apply_at` DATETIME(3) NOT NULL,
    `purge_at` DATETIME(3) NOT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_id`(`user_id`),
    INDEX `idx_status_purge`(`status`, `purge_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_question` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `version` VARCHAR(16) NOT NULL DEFAULT 'v1',
    `dimension` TINYINT NOT NULL,
    `content` VARCHAR(512) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_reverse` TINYINT NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_version_status_sort`(`version`, `status`, `sort_order`),
    INDEX `idx_dimension`(`dimension`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_option` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `question_id` BIGINT UNSIGNED NOT NULL,
    `content` VARCHAR(255) NOT NULL,
    `option_key` VARCHAR(8) NOT NULL,
    `polarity` TINYINT NOT NULL,
    `score` TINYINT NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_question_id`(`question_id`),
    UNIQUE INDEX `uk_question_key`(`question_id`, `option_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_record` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `record_no` CHAR(24) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `question_version` VARCHAR(16) NOT NULL,
    `total_questions` SMALLINT NOT NULL DEFAULT 60,
    `status` TINYINT NOT NULL DEFAULT 1,
    `started_at` DATETIME(3) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_status_created`(`user_id`, `status`, `created_at`),
    UNIQUE INDEX `uk_record_no`(`record_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_answer` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `question_id` BIGINT UNSIGNED NOT NULL,
    `option_id` BIGINT UNSIGNED NOT NULL,
    `answered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_id`(`user_id`),
    UNIQUE INDEX `uk_record_question`(`record_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_progress` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `answered_count` SMALLINT NOT NULL DEFAULT 0,
    `current_question` SMALLINT NOT NULL DEFAULT 1,
    `draft_answers` JSON NULL,
    `last_saved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_id`(`user_id`),
    UNIQUE INDEX `uk_record_id`(`record_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_result` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `mbti_type` CHAR(4) NOT NULL,
    `score_ei` DECIMAL(5, 2) NOT NULL,
    `score_sn` DECIMAL(5, 2) NOT NULL,
    `score_tf` DECIMAL(5, 2) NOT NULL,
    `score_jp` DECIMAL(5, 2) NOT NULL,
    `type_group` TINYINT NOT NULL,
    `is_abnormal` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_type`(`user_id`, `mbti_type`),
    INDEX `idx_mbti_type`(`mbti_type`),
    UNIQUE INDEX `uk_record_id`(`record_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_no` CHAR(24) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `result_id` BIGINT UNSIGNED NOT NULL,
    `report_type` TINYINT NOT NULL DEFAULT 1,
    `mbti_type` CHAR(4) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_unlocked` TINYINT NOT NULL DEFAULT 0,
    `order_id` BIGINT UNSIGNED NULL,
    `summary` JSON NULL,
    `generated_at` DATETIME(3) NULL,
    `expire_at` DATETIME(3) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `report_result_id_key`(`result_id`),
    INDEX `idx_user_type_created`(`user_id`, `report_type`, `created_at`),
    INDEX `idx_result_id`(`result_id`),
    UNIQUE INDEX `uk_report_no`(`report_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_section` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` BIGINT UNSIGNED NOT NULL,
    `section_key` VARCHAR(32) NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `content` JSON NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_report_sort`(`report_id`, `sort_order`),
    UNIQUE INDEX `uk_report_section`(`report_id`, `section_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `report_share` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `report_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `share_code` CHAR(16) NOT NULL,
    `poster_url` VARCHAR(512) NULL,
    `channel` TINYINT NULL,
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_report_id`(`report_id`),
    INDEX `idx_user_id`(`user_id`),
    UNIQUE INDEX `uk_share_code`(`share_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `career` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `career_code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `description` TEXT NULL,
    `responsibility` TEXT NULL,
    `salary_min` INTEGER NULL,
    `salary_max` INTEGER NULL,
    `prospect` TEXT NULL,
    `suit_types` VARCHAR(128) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_category_status`(`category`, `status`),
    UNIQUE INDEX `uk_career_code`(`career_code`),
    FULLTEXT INDEX `ft_name_desc`(`name`, `description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `career_skill` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `skill_name` VARCHAR(64) NOT NULL,
    `skill_type` TINYINT NOT NULL DEFAULT 1,
    `require_level` TINYINT NOT NULL DEFAULT 3,
    `weight` DECIMAL(4, 2) NOT NULL DEFAULT 1.00,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_career_id`(`career_id`),
    UNIQUE INDEX `uk_career_skill`(`career_id`, `skill_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `career_match` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `report_id` BIGINT UNSIGNED NOT NULL,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `match_score` DECIMAL(5, 2) NOT NULL,
    `rank_no` SMALLINT NOT NULL,
    `match_reason` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_report_rank`(`report_id`, `rank_no`),
    INDEX `idx_user_id`(`user_id`),
    UNIQUE INDEX `uk_report_career`(`report_id`, `career_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `skill_gap_analysis` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `skill_name` VARCHAR(64) NOT NULL,
    `require_level` TINYINT NOT NULL,
    `current_level` TINYINT NOT NULL DEFAULT 0,
    `gap_level` TINYINT NOT NULL,
    `suggestion` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_career`(`user_id`, `career_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_resource` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(128) NOT NULL,
    `resource_type` TINYINT NOT NULL,
    `url` VARCHAR(512) NULL,
    `skill_tags` VARCHAR(255) NULL,
    `career_id` BIGINT UNSIGNED NULL,
    `provider` VARCHAR(64) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_career_status`(`career_id`, `status`),
    INDEX `idx_type_status`(`resource_type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `career_roadmap` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `career_id` BIGINT UNSIGNED NOT NULL,
    `stage_no` TINYINT NOT NULL,
    `stage_name` VARCHAR(64) NOT NULL,
    `duration` VARCHAR(32) NULL,
    `milestones` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_career_stage`(`career_id`, `stage_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_favorite` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `target_type` TINYINT NOT NULL,
    `target_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_type`(`user_id`, `target_type`),
    UNIQUE INDEX `uk_user_target`(`user_id`, `target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `growth_plan` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `career_id` BIGINT UNSIGNED NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `progress` TINYINT NOT NULL DEFAULT 0,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_status`(`user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `growth_plan_task` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `plan_id` BIGINT UNSIGNED NOT NULL,
    `content` VARCHAR(255) NOT NULL,
    `resource_id` BIGINT UNSIGNED NULL,
    `is_done` TINYINT NOT NULL DEFAULT 0,
    `done_at` DATETIME(3) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_plan_id`(`plan_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_conversation` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `conv_no` CHAR(32) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `scene` TINYINT NOT NULL DEFAULT 1,
    `biz_type` TINYINT NULL,
    `biz_id` BIGINT UNSIGNED NULL,
    `title` VARCHAR(128) NULL,
    `round_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `max_round` SMALLINT UNSIGNED NOT NULL DEFAULT 50,
    `token_used` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `last_msg_at` DATETIME(3) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_scene`(`user_id`, `scene`, `last_msg_at`),
    INDEX `idx_biz`(`biz_type`, `biz_id`),
    UNIQUE INDEX `uk_conv_no`(`conv_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_message` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `conversation_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `round_no` SMALLINT UNSIGNED NOT NULL,
    `role` TINYINT NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `token_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `model` VARCHAR(64) NULL,
    `feedback` TINYINT NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_conv_round`(`conversation_id`, `round_no`),
    INDEX `idx_user_time`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_conversation_summary` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `conversation_id` BIGINT UNSIGNED NOT NULL,
    `summary` TEXT NOT NULL,
    `covered_round` SMALLINT UNSIGNED NOT NULL,
    `token_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_conversation`(`conversation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `real_name` VARCHAR(64) NOT NULL,
    `avatar` VARCHAR(255) NULL,
    `title` VARCHAR(128) NULL,
    `intro` VARCHAR(1000) NULL,
    `expertise` JSON NULL,
    `price_per_hour` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `rating` DECIMAL(3, 2) NOT NULL DEFAULT 5.00,
    `order_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `audit_status` TINYINT NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_audit_status`(`audit_status`, `status`),
    INDEX `idx_rating`(`rating`),
    UNIQUE INDEX `uk_user_id`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_qualification` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `coach_id` BIGINT UNSIGNED NOT NULL,
    `cert_type` TINYINT NOT NULL,
    `cert_name` VARCHAR(128) NOT NULL,
    `cert_no` VARCHAR(128) NULL,
    `file_url` VARCHAR(255) NOT NULL,
    `audit_status` TINYINT NOT NULL DEFAULT 0,
    `audit_remark` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_coach_id`(`coach_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coach_schedule` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `coach_id` BIGINT UNSIGNED NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `order_id` BIGINT UNSIGNED NULL,
    `lock_expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_status_time`(`status`, `start_time`),
    INDEX `idx_lock_expire`(`status`, `lock_expire_at`),
    UNIQUE INDEX `uk_coach_slot`(`coach_id`, `start_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coaching_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_no` CHAR(32) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `coach_id` BIGINT UNSIGNED NOT NULL,
    `schedule_id` BIGINT UNSIGNED NOT NULL,
    `consult_type` TINYINT NOT NULL DEFAULT 1,
    `duration_min` SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    `amount` BIGINT UNSIGNED NOT NULL,
    `payment_order_id` BIGINT UNSIGNED NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `pay_expire_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `cancel_reason` VARCHAR(255) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_status`(`user_id`, `status`),
    INDEX `idx_coach_status`(`coach_id`, `status`),
    INDEX `idx_pay_expire`(`status`, `pay_expire_at`),
    UNIQUE INDEX `uk_order_no`(`order_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coaching_session` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT UNSIGNED NOT NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `channel` TINYINT NOT NULL DEFAULT 1,
    `record_url` VARCHAR(255) NULL,
    `msg_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `coach_note` TEXT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_order_id`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coaching_review` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `coach_id` BIGINT UNSIGNED NOT NULL,
    `rating` TINYINT UNSIGNED NOT NULL,
    `content` VARCHAR(1000) NULL,
    `tags` JSON NULL,
    `is_anonymous` TINYINT NOT NULL DEFAULT 0,
    `reply` VARCHAR(500) NULL,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_coach_rating`(`coach_id`, `rating`),
    UNIQUE INDEX `uk_order_id`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `pay_no` CHAR(32) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `biz_type` TINYINT NOT NULL,
    `biz_id` BIGINT UNSIGNED NOT NULL,
    `subject` VARCHAR(128) NOT NULL,
    `amount` BIGINT UNSIGNED NOT NULL,
    `paid_amount` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `channel` TINYINT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `expire_at` DATETIME(3) NULL,
    `paid_at` DATETIME(3) NULL,
    `refunded_amount` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_user_status`(`user_id`, `status`),
    INDEX `idx_biz`(`biz_type`, `biz_id`),
    INDEX `idx_expire`(`status`, `expire_at`),
    UNIQUE INDEX `uk_pay_no`(`pay_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_plan` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `subtitle` VARCHAR(128) NULL,
    `price` BIGINT UNSIGNED NOT NULL,
    `original_price` BIGINT UNSIGNED NULL,
    `duration_days` INTEGER NULL,
    `plan_type` TINYINT NOT NULL DEFAULT 2,
    `benefits` JSON NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_recommended` TINYINT NOT NULL DEFAULT 0,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_status_sort`(`status`, `sort_order`),
    UNIQUE INDEX `uk_code`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_transaction` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `pay_order_id` BIGINT UNSIGNED NOT NULL,
    `channel` TINYINT NOT NULL,
    `channel_trade_no` VARCHAR(64) NOT NULL,
    `type` TINYINT NOT NULL DEFAULT 1,
    `amount` BIGINT UNSIGNED NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `raw_notify` JSON NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_pay_order`(`pay_order_id`),
    UNIQUE INDEX `uk_channel_trade_no`(`channel`, `channel_trade_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_refund` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `refund_no` CHAR(32) NOT NULL,
    `pay_order_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `amount` BIGINT UNSIGNED NOT NULL,
    `reason` VARCHAR(255) NULL,
    `channel_refund_no` VARCHAR(64) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `operator_id` BIGINT UNSIGNED NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_pay_order`(`pay_order_id`),
    INDEX `idx_user_status`(`user_id`, `status`),
    UNIQUE INDEX `uk_refund_no`(`refund_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `session_id` CHAR(32) NULL,
    `event_type` VARCHAR(64) NOT NULL,
    `page` VARCHAR(128) NULL,
    `properties` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `ua` VARCHAR(512) NULL,
    `device` VARCHAR(64) NULL,
    `event_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_time`(`user_id`, `event_time`),
    INDEX `idx_event_type`(`event_type`, `event_time`),
    PRIMARY KEY (`id`, `event_time`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topic` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(128) NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `category` VARCHAR(32) NULL,
    `tags` VARCHAR(255) NULL,
    `author_id` BIGINT UNSIGNED NOT NULL,
    `view_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `like_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `reply_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_pinned` TINYINT NOT NULL DEFAULT 0,
    `audit_status` TINYINT NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_audit_status`(`audit_status`, `status`),
    INDEX `idx_author_id`(`author_id`),
    INDEX `idx_category_status`(`category`, `status`),
    INDEX `idx_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activation_code` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` CHAR(16) NOT NULL,
    `plan_code` VARCHAR(32) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 0,
    `used_by` BIGINT UNSIGNED NULL,
    `used_at` DATETIME(3) NULL,
    `sent_to` VARCHAR(255) NULL,
    `sent_channel` TINYINT NULL,
    `expire_at` DATETIME(3) NULL,
    `note` VARCHAR(255) NULL,
    `batch_no` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_plan_status`(`plan_code`, `status`),
    INDEX `idx_used_by`(`used_by`),
    INDEX `idx_batch_no`(`batch_no`),
    UNIQUE INDEX `uk_code`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_upload` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `file_no` CHAR(32) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `biz_type` TINYINT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `file_ext` VARCHAR(16) NOT NULL,
    `mime_type` VARCHAR(128) NOT NULL,
    `file_size` INTEGER UNSIGNED NOT NULL,
    `storage_url` VARCHAR(512) NOT NULL,
    `md5` CHAR(32) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `is_deleted` TINYINT NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_biz`(`user_id`, `biz_type`),
    INDEX `idx_md5`(`md5`),
    UNIQUE INDEX `uk_file_no`(`file_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_oauth` ADD CONSTRAINT `user_oauth_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_privacy_setting` ADD CONSTRAINT `user_privacy_setting_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_deactivation` ADD CONSTRAINT `user_deactivation_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_option` ADD CONSTRAINT `assessment_option_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `assessment_question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_record` ADD CONSTRAINT `assessment_record_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_answer` ADD CONSTRAINT `assessment_answer_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `assessment_record`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_answer` ADD CONSTRAINT `assessment_answer_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `assessment_question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_progress` ADD CONSTRAINT `assessment_progress_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `assessment_record`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_result` ADD CONSTRAINT `assessment_result_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `assessment_record`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report` ADD CONSTRAINT `report_result_id_fkey` FOREIGN KEY (`result_id`) REFERENCES `assessment_result`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_section` ADD CONSTRAINT `report_section_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `report`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `report_share` ADD CONSTRAINT `report_share_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `report`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `career_skill` ADD CONSTRAINT `career_skill_career_id_fkey` FOREIGN KEY (`career_id`) REFERENCES `career`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `career_match` ADD CONSTRAINT `career_match_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `report`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `career_match` ADD CONSTRAINT `career_match_career_id_fkey` FOREIGN KEY (`career_id`) REFERENCES `career`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skill_gap_analysis` ADD CONSTRAINT `skill_gap_analysis_career_id_fkey` FOREIGN KEY (`career_id`) REFERENCES `career`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `career_roadmap` ADD CONSTRAINT `career_roadmap_career_id_fkey` FOREIGN KEY (`career_id`) REFERENCES `career`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `growth_plan` ADD CONSTRAINT `growth_plan_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `growth_plan_task` ADD CONSTRAINT `growth_plan_task_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `growth_plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_message` ADD CONSTRAINT `ai_message_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_conversation_summary` ADD CONSTRAINT `ai_conversation_summary_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_qualification` ADD CONSTRAINT `coach_qualification_coach_id_fkey` FOREIGN KEY (`coach_id`) REFERENCES `coach`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coach_schedule` ADD CONSTRAINT `coach_schedule_coach_id_fkey` FOREIGN KEY (`coach_id`) REFERENCES `coach`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coaching_order` ADD CONSTRAINT `coaching_order_coach_id_fkey` FOREIGN KEY (`coach_id`) REFERENCES `coach`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coaching_order` ADD CONSTRAINT `coaching_order_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `coach_schedule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coaching_session` ADD CONSTRAINT `coaching_session_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `coaching_order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coaching_review` ADD CONSTRAINT `coaching_review_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `coaching_order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_transaction` ADD CONSTRAINT `payment_transaction_pay_order_id_fkey` FOREIGN KEY (`pay_order_id`) REFERENCES `payment_order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_refund` ADD CONSTRAINT `payment_refund_pay_order_id_fkey` FOREIGN KEY (`pay_order_id`) REFERENCES `payment_order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
