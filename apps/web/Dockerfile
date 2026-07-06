# InnerQuest 前端镜像（React 18 + Vite）多阶段构建
# 构建上下文应为 monorepo 根目录（含 packages/shared 源码直引）
# builder: vite build -> dist；runner: nginx:alpine 托管静态产物

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# workspace 清单，最大化缓存
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci

# 源码
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# 构建：tsc -b && vite build，产物在 apps/web/dist
RUN npm --workspace apps/web run build

# ---------- runner：nginx 托管 ----------
FROM nginx:alpine AS runner

# 自定义 nginx 配置（SPA history fallback + /api 反代占位）
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# 静态产物
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# 健康检查：nginx 首页可访问
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]