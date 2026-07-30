-- ============================================================================
-- 【删库前置强制备份】会员付费彻底移除 · 方案A不可回滚
-- 生成时间: 2026-07-30
-- 用途: 执行 20260730000000_remove_payment_membership 迁移前，对将被 DROP 的
--       表数据与 user 表付费字段做完整快照备份，供事后审计/兜底。
--
-- 执行方式(生产库，务必先跑本文件再执行迁移):
--   mysql -h <HOST> -u <USER> -p<PWD> <DB> < 20260730_remove_payment_membership_backup.sql
--   或用 mysqldump 单独导出(见文件末尾附录)。
--
-- 备份策略: 采用 CREATE TABLE ... AS SELECT 生成带时间戳后缀的影子备份表，
--           数据留存在同库内(bak_ 前缀)，不落物理文件亦可回查。
--           如需物理文件，改用文件末尾 mysqldump 命令。
-- ============================================================================

-- ---------- 1. 支付相关全表备份(子表→主表) ----------
CREATE TABLE IF NOT EXISTS `bak_20260730_payment_transaction` AS SELECT * FROM `payment_transaction`;
CREATE TABLE IF NOT EXISTS `bak_20260730_payment_refund`      AS SELECT * FROM `payment_refund`;
CREATE TABLE IF NOT EXISTS `bak_20260730_payment_order`       AS SELECT * FROM `payment_order`;

-- ---------- 2. 会员/激活/兑换相关全表备份 ----------
CREATE TABLE IF NOT EXISTS `bak_20260730_membership_plan`           AS SELECT * FROM `membership_plan`;
CREATE TABLE IF NOT EXISTS `bak_20260730_activation_code`           AS SELECT * FROM `activation_code`;
CREATE TABLE IF NOT EXISTS `bak_20260730_membership_redeem_record`  AS SELECT * FROM `membership_redeem_record`;

-- ---------- 3. user 表付费字段快照(仅关键列，附带 id/user_no 便于回填) ----------
CREATE TABLE IF NOT EXISTS `bak_20260730_user_paid_fields` AS
SELECT
  `id`,
  `user_no`,
  `is_paid`,
  `paid_expire_at`,
  `membership_level`,
  `membership_expire_at`
FROM `user`;

-- ---------- 4. report / report_section / coaching_order 待删字段快照 ----------
CREATE TABLE IF NOT EXISTS `bak_20260730_report_isunlocked` AS
SELECT `id`, `report_no`, `is_unlocked`, `order_id` FROM `report`;

CREATE TABLE IF NOT EXISTS `bak_20260730_report_section_isfree` AS
SELECT `id`, `report_id`, `section_key`, `is_free` FROM `report_section`;

CREATE TABLE IF NOT EXISTS `bak_20260730_coaching_order_payfields` AS
SELECT `id`, `order_no`, `payment_order_id`, `pay_expire_at` FROM `coaching_order`;

-- ---------- 备份完成校验(记录各备份表行数) ----------
SELECT 'bak_payment_transaction'      AS backup_table, COUNT(*) AS rows FROM `bak_20260730_payment_transaction`
UNION ALL SELECT 'bak_payment_refund',              COUNT(*) FROM `bak_20260730_payment_refund`
UNION ALL SELECT 'bak_payment_order',               COUNT(*) FROM `bak_20260730_payment_order`
UNION ALL SELECT 'bak_membership_plan',             COUNT(*) FROM `bak_20260730_membership_plan`
UNION ALL SELECT 'bak_activation_code',             COUNT(*) FROM `bak_20260730_activation_code`
UNION ALL SELECT 'bak_membership_redeem_record',    COUNT(*) FROM `bak_20260730_membership_redeem_record`
UNION ALL SELECT 'bak_user_paid_fields',            COUNT(*) FROM `bak_20260730_user_paid_fields`
UNION ALL SELECT 'bak_report_isunlocked',           COUNT(*) FROM `bak_20260730_report_isunlocked`
UNION ALL SELECT 'bak_report_section_isfree',       COUNT(*) FROM `bak_20260730_report_section_isfree`
UNION ALL SELECT 'bak_coaching_order_payfields',    COUNT(*) FROM `bak_20260730_coaching_order_payfields`;

-- ============================================================================
-- 附录: 物理文件备份(推荐在删库前额外执行一次，落到本地/对象存储)
-- mysqldump -h <HOST> -u <USER> -p <DB> \
--   payment_order payment_transaction payment_refund \
--   membership_plan activation_code membership_redeem_record \
--   > 20260730_payment_membership_dump.sql
--
-- user 付费字段无法单列 dump，可用:
-- mysql -h <HOST> -u <USER> -p -N -e \
--   "SELECT id,user_no,is_paid,paid_expire_at,membership_level,membership_expire_at FROM <DB>.user" \
--   > 20260730_user_paid_fields.tsv
-- ============================================================================