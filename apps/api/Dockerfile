# InnerQuest 后端镜像（NestJS 10）多阶段构建
# 构建上下文应为 monorepo 根目录（含 packages/shared 源码直引）
# 端口对齐 main.ts：默认 3000；健康检查 /api/v1/health

# ---------- builder：安装全部依赖 + prisma generate + nest build ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 复制 workspace 清单，最大化依赖缓存命中
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# 安装全部（含 dev）依赖用于构建
RUN npm ci

# 复制源码
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# 生成 Prisma Client（schema 位于 apps/api/prisma/schema.prisma）
RUN npm --workspace apps/api run prisma:generate

# 编译 NestJS 到 dist
RUN npm --workspace apps/api run build

# ---------- prod-deps：仅安装生产依赖 ----------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --omit=dev

# ---------- runner：仅生产依赖 + dist + prisma 产物 ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# 生产依赖
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules

# 共享包源码（@innerquest/shared main 指向 src/index.ts，运行期需要）
COPY --from=builder /app/packages/shared ./packages/shared

# 构建产物 + prisma schema（Prisma Client 运行期需 schema 与引擎）
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
# 复制 builder 中已生成的 Prisma Client（位于 node_modules/.prisma 与 @prisma/client）
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 使用非 root 用户运行
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nodejs
USER nodejs

EXPOSE 3000

# 健康检查：命中聚合探针接口
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/v1/health || exit 1

WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]