-- CreateTable
CREATE TABLE `coaching_message` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `session_id` BIGINT UNSIGNED NOT NULL,
    `seq` INTEGER UNSIGNED NOT NULL,
    `server_msg_id` CHAR(36) NOT NULL,
    `client_msg_id` VARCHAR(64) NOT NULL,
    `sender_id` BIGINT UNSIGNED NOT NULL,
    `sender_role` VARCHAR(16) NOT NULL,
    `content` MEDIUMTEXT NOT NULL,
    `ts` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_session_seq`(`session_id`, `seq`),
    UNIQUE INDEX `uk_session_seq`(`session_id`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `coaching_message` ADD CONSTRAINT `coaching_message_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `coaching_session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;