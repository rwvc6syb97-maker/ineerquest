/**
 * CORS 允许来源白名单（HTTP 层与 Socket.IO 层共享，避免两处漂移）。
 *
 * 生产安全门槛：禁止使用通配符(*)或 origin:true 反射任意来源；
 * 叠加 credentials:true 时更须收敛为固定白名单，防止 CSRF / 越权。
 */
export const CORS_ALLOWED_ORIGINS: readonly string[] = [
  'https://innerquest.online',
  'https://www.innerquest.online',
  'http://localhost:5173',
];

/** CORS 允许的方法（HTTP 层与 Socket.IO 层保持一致） */
export const CORS_ALLOWED_METHODS: readonly string[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'OPTIONS',
];