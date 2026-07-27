-- 新建管理员账号（写入独立的 admin 表，后台登录用 username）
-- 明文密码：InnerQuest@2026  （首次登录后请立即修改）
-- role=3 表示 super_admin（全权限 *），status=1 启用
USE innerquest;

INSERT INTO admin (username, password_hash, nickname, email, role, status, is_deleted, created_at, updated_at)
VALUES (
  'superadmin',
  '$2b$10$.iivoCwGAk693YW3Xiqrh.L/aIKXOrU0J0wKN5O8N0AtgscxKx5uK',
  '超级管理员',
  'superadmin@innerquest.local',
  3,
  1,
  0,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  nickname      = VALUES(nickname),
  email         = VALUES(email),
  role          = VALUES(role),
  status        = VALUES(status),
  is_deleted    = 0,
  updated_at    = NOW();

SELECT id, username, email, role, status FROM admin WHERE username = 'superadmin';