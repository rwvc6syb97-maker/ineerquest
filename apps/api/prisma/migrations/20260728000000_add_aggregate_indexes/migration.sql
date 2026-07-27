-- 四缺陷整改·任务3.3：后台/首页全量聚合索引优化（仅新增索引，不改字段语义/命名）
--
-- 背景：assessmentRate 与首页统计以 assessment_record 表全量聚合（不带 user_id），
--   started    = count(assessment_record WHERE is_deleted=0)
--   submitted  = count(assessment_record WHERE status=2(SUBMITTED) AND is_deleted=0)
--   reportCount= count(report WHERE is_deleted=0)
-- 现有复合索引均以 user_id 为最左前缀，上述无 user_id 的聚合无法命中，会全表扫描。

-- CreateIndex：assessment_record(is_deleted, status)
--   - count(is_deleted=0) 命中最左前缀 is_deleted
--   - count(status=2 AND is_deleted=0) 命中全字段（覆盖 started/submitted 两个口径）
CREATE INDEX `idx_deleted_status` ON `assessment_record`(`is_deleted`, `status`);

-- CreateIndex：report(is_deleted)
--   - count(report WHERE is_deleted=0) 报告生成数全量聚合命中 is_deleted 前缀
CREATE INDEX `idx_deleted` ON `report`(`is_deleted`);