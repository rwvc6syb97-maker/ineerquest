import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** @Audit 元数据 key */
export const AUDIT_KEY = 'auditMeta';

export interface AuditMeta {
  /** 资源/动作标识，写入 event_log.properties.resource，如 'membership:plan' */
  resource: string;
  /** 动作描述（可选），如 'update' */
  action?: string;
}

/**
 * @Audit('membership:plan', 'update') —— 标记该写接口需记录审计前后值快照。
 * 未标注的写接口仍会被审计拦截器兜底记录（方法/路径/操作人/IP/请求体），
 * 但 resource 会回退为路由路径。
 */
export const Audit = (resource: string, action?: string): MethodDecorator =>
  SetMetadata(AUDIT_KEY, { resource, action } as AuditMeta);

/**
 * 供业务在 handler 内写入「前值快照」的辅助：
 * 在执行变更前调用 setAuditBefore(req, oldValue)，审计拦截器会取出作为 before。
 * 例如更新套餐前：setAuditBefore(req, await this.service.getPlan(id))
 */
export function setAuditBefore(req: Request, before: unknown): void {
  (req as Request & { __auditBefore?: unknown }).__auditBefore = before;
}

/** 读取业务写入的前值快照（审计拦截器内部使用） */
export function getAuditBefore(req: Request): unknown {
  return (req as Request & { __auditBefore?: unknown }).__auditBefore;
}