/**
 * 后台敏感字段脱敏工具（T4-14 用户 PII 保护 / 全后台复用）。
 * - 手机号：保留前 3 后 4，中间 4 位掩码，如 138****8888；短号兜底全掩。
 * - 未持 user:pii 权限时后台默认下发脱敏值，持权限方可请求明文（controller 层判定）。
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return phone ?? null;
  const p = phone.trim();
  if (p.length <= 4) return '*'.repeat(p.length);
  if (p.length <= 7) return p.slice(0, 1) + '*'.repeat(p.length - 2) + p.slice(-1);
  return p.slice(0, 3) + '****' + p.slice(-4);
}

/** 邮箱脱敏：a***@domain */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return email ?? null;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  const masked = name.length <= 1 ? '*' : name.slice(0, 1) + '***';
  return masked + email.slice(at);
}