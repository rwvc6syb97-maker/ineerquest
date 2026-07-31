-- P2① 内容审核态默认值收敛为草稿态
-- 权威依据：全量回归 P2 完善——reviewStatus 默认从 2(已上线) 改为 1(草稿)，
-- 使"任何新增内容默认进草稿待审"成为数据库层兜底铁律，不再仅依赖 service 层显式覆盖。
--
-- 影响范围：仅改变列 DEFAULT（影响未显式传 review_status 的新 INSERT）；
--   不修改任何存量行数据（存量已上线行保持 review_status=2）。
--   审核通过路径(update 显式写 review_status=2)不受默认值影响。
--
-- 非破坏性：纯 ALTER COLUMN ... DEFAULT，不删列、不改类型、不动存量数据。

ALTER TABLE `career`
    MODIFY COLUMN `review_status` TINYINT NOT NULL DEFAULT 1;

ALTER TABLE `learning_resource`
    MODIFY COLUMN `review_status` TINYINT NOT NULL DEFAULT 1;