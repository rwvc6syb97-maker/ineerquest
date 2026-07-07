-- 新增缓存表：替代 Redis 的 MySQL 持久化实现
-- cache_kv：字符串/计数/TTL/黑名单/分布式锁
-- cache_zset：有序集合（支付延迟关单队列等）

-- CreateTable
CREATE TABLE `cache_kv` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `cache_key` VARCHAR(255) NOT NULL,
    `cache_val` MEDIUMTEXT NOT NULL,
    `expire_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_cache_key`(`cache_key`),
    INDEX `idx_expire_at`(`expire_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cache_zset` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `zkey` VARCHAR(255) NOT NULL,
    `member` VARCHAR(255) NOT NULL,
    `score` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_zkey_score`(`zkey`, `score`),
    UNIQUE INDEX `uk_zkey_member`(`zkey`, `member`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;