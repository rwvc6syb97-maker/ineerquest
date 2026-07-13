-- AlterTable: 补齐 user_favorite 缺失列（BUG6 / P0 修复）
-- 背景：schema.prisma 的 UserFavorite 模型后加了 status/updatedAt/deletedAt 三字段，
--       但未生成迁移，导致 Railway 线上库缺列，"我的收藏" count(status) 报列不存在。
-- 说明：初始建表(20260705152338_init) 仅有 id/user_id/target_type/target_id/created_at。
--       本迁移仅 ADD 缺失列，字段类型/默认值严格对齐 schema。
--       status: Int @default(1) @db.TinyInt        -> TINYINT NOT NULL DEFAULT 1
--       updatedAt: DateTime @updatedAt @map(...)    -> DATETIME(3) NOT NULL（Prisma 应用层维护）
--       deletedAt: DateTime? @map(...)              -> DATETIME(3) NULL
-- 索引 idx_user_type / uk_user_target 已在初始迁移创建，schema 未声明含 status 的索引，故不新增。

-- 1) 补列。updated_at 先带 DEFAULT CURRENT_TIMESTAMP(3) 以回填存量行，避免 NOT NULL 无默认报错。
ALTER TABLE `user_favorite`
    ADD COLUMN `status` TINYINT NOT NULL DEFAULT 1,
    ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- 2) 去除 updated_at 的临时默认，字节级对齐 Prisma 对 @updatedAt 生成的列形态（DATETIME(3) NOT NULL）。
ALTER TABLE `user_favorite`
    MODIFY COLUMN `updated_at` DATETIME(3) NOT NULL;