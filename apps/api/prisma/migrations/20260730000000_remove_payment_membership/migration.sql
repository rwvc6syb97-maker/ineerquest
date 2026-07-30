-- =====================================================================
-- Migration: 20260730000000_remove_payment_membership
-- 目的: 会员付费彻底移除 · 方案A(不可回滚) · L4/L5 数据库删表删字段
-- 说明:
--   1) 删除范围经 PM 裁定: 6 张付费/会员表 + user/report/report_section/
--      coaching_order 的付费相关字段与索引。
--   2) 外键删除铁律: 先删子表(payment_transaction/payment_refund)的外键
--      与表, 再删主表(payment_order)。
--   3) 部分表/字段(membership_level 等)历史经 db push 同步、无正式迁移,
--      故本迁移一律使用 IF EXISTS 保护, 保证在有/无该对象的库上都可执行。
--   4) 执行前置: 已由 backups/20260730_remove_payment_membership_backup.sql
--      完成全表 + 字段快照备份。此操作不可回滚。
-- =====================================================================

-- ---------------------------------------------------------------------
-- Step 1: 删除子表外键约束 (先解除对 payment_order 的引用)
-- ---------------------------------------------------------------------
ALTER TABLE `payment_transaction` DROP FOREIGN KEY `payment_transaction_pay_order_id_fkey`;
ALTER TABLE `payment_refund` DROP FOREIGN KEY `payment_refund_pay_order_id_fkey`;

-- ---------------------------------------------------------------------
-- Step 2: 删除子表 (payment_transaction / payment_refund)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `payment_transaction`;
DROP TABLE IF EXISTS `payment_refund`;

-- ---------------------------------------------------------------------
-- Step 3: 删除主表 (payment_order)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `payment_order`;

-- ---------------------------------------------------------------------
-- Step 4: 删除独立的会员/激活相关表 (无外键依赖)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `membership_plan`;
DROP TABLE IF EXISTS `activation_code`;
DROP TABLE IF EXISTS `membership_redeem_record`;

-- ---------------------------------------------------------------------
-- Step 5a: 删除 user 表确定存在的付费字段 (init 迁移已建, 直接删除)
-- ---------------------------------------------------------------------
ALTER TABLE `user` DROP COLUMN `is_paid`;
ALTER TABLE `user` DROP COLUMN `paid_expire_at`;

-- ---------------------------------------------------------------------
-- Step 5b: 删除 user 表 drift 对象 (membership_level / membership_expire_at
--   / idx_membership 历史经 db push 同步、无正式迁移, 可能不存在)。
--   MySQL 的 ALTER ... DROP COLUMN/INDEX 不支持 IF EXISTS(8.0.29 前),
--   故用 information_schema 判定后动态执行, 保证幂等且跨库安全。
-- ---------------------------------------------------------------------
-- drop index idx_membership if present
SET @idx_exists := (
  SELECT COUNT(1) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND INDEX_NAME = 'idx_membership'
);
SET @sql := IF(@idx_exists > 0, 'ALTER TABLE `user` DROP INDEX `idx_membership`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- drop column membership_level if present
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'membership_level'
);
SET @sql := IF(@col_exists > 0, 'ALTER TABLE `user` DROP COLUMN `membership_level`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- drop column membership_expire_at if present
SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'membership_expire_at'
);
SET @sql := IF(@col_exists > 0, 'ALTER TABLE `user` DROP COLUMN `membership_expire_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Step 6: 删除 report / report_section 付费字段
--   report.is_unlocked 由 init 迁移建立, 直接删除;
--   report_section.is_free 历史经 db push 同步、无正式迁移, 条件删除。
-- ---------------------------------------------------------------------
ALTER TABLE `report` DROP COLUMN `is_unlocked`;

SET @col_exists := (
  SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_section' AND COLUMN_NAME = 'is_free'
);
SET @sql := IF(@col_exists > 0, 'ALTER TABLE `report_section` DROP COLUMN `is_free`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- Step 7: 删除 coaching_order 付费字段与索引
-- ---------------------------------------------------------------------
ALTER TABLE `coaching_order` DROP INDEX `idx_pay_expire`;
ALTER TABLE `coaching_order` DROP COLUMN `payment_order_id`;
ALTER TABLE `coaching_order` DROP COLUMN `pay_expire_at`;