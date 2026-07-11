/**
 * CORS 允许来源白名单（HTTP 层与 Socket.IO 层共享，避免两处漂移）。
 *
 * 生产安全门槛：禁止使用通配符(*)或 origin:true 反射任意来源；
 * 叠加 credentials:true 时更须收敛为固定白名单，防止 CSRF / 越权。
 */
export const CORS_ALLOWED_ORIGINS: readonly string[] = buildAllowedOrigins();

/**
 * 构建 CORS 白名单：固定业务域名 + Railway 部署域名 + 环境变量追加。
 * 环境变量 CORS_EXTRA_ORIGINS 支持逗号分隔，便于按环境（预览/自定义域名）扩展而无需改代码。
 */
function buildAllowedOrigins(): string[] {
  const base = [
    'https://innerquest.online',
    'https://www.innerquest.online',
    // http 明文变体兜底：用户仍可能从 http://innerquest.online 访问（自定义域名未强制跳 https），
    // 浏览器 Origin 头会是 http，白名单缺 http 变体则 preflight 无 Access-Control-Allow-Origin → 被拦。
    'http://innerquest.online',
    'http://www.innerquest.online',
    // Railway 前端部署域名（web 服务），不加则线上请求会被 CORS 拦截 → 前端表现为 network error
    'https://innerquestweb-production.up.railway.app',
    'http://localhost:5173',
  ];
  const extra = (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...base, ...extra]));
}

/** CORS 允许的方法（HTTP 层与 Socket.IO 层保持一致） */
export const CORS_ALLOWED_METHODS: readonly string[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS',
];