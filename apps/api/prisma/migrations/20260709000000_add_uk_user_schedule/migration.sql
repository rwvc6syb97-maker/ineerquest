-- AlterTable: coaching_order 添加用户+时段幂等约束
ALTER TABLE `coaching_order` ADD UNIQUE INDEX `uk_user_schedule` (`user_id`, `schedule_id`);