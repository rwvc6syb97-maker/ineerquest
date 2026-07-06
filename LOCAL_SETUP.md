# InnerQuest 零依赖本地开发指南（不需要 Docker）
# --------------------------------------------------
# 适用：无法安装 Docker Desktop，只想在本地跑起来
# 前提：已安装 Node.js (已有 v23.10.0)

# ===== 第 1 步：安装本地 MySQL =====
# 下载 MySQL 8.0 社区版 (约 200MB)：
#   https://dev.mysql.com/downloads/installer/
# 安装时选 "Server only"，设置 root 密码为 innerquest
# 安装完成后 MySQL 会自动运行在 3306 端口

# ===== 第 2 步：创建数据库 =====
# 打开 "MySQL 8.0 Command Line Client"（开始菜单有）
# 输入密码 innerquest，然后执行：
#
#   CREATE DATABASE innerquest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
#   exit;

# ===== 第 3 步：配置连接 =====
# 编辑 apps/api/.env 文件（项目里已有），内容改为：
#
#   DATABASE_URL="mysql://root:innerquest@localhost:3306/innerquest"
#   JWT_SECRET="dev-secret-not-for-prod"
#
# 其他行保留不变

# ===== 第 4 步：执行迁移和种子 =====
# 打开终端：
#   cd "c:\Users\DD\OneDrive\桌面\mbti+职业规划辅导\project\apps\api"
#   npx prisma generate
#   npx prisma migrate deploy
#   npx prisma db seed

# ===== 第 5 步：启动后端 =====
#   npm run start:dev
#
# 看到 "Nest application successfully started" 就成功了
# API 运行在 http://localhost:3000

# ===== 第 6 步：启动前端 =====
# 新开一个终端：
#   cd "c:\Users\DD\OneDrive\桌面\mbti+职业规划辅导\project\apps\web"
#   npm run dev
#
# 前端运行在 http://localhost:5173
