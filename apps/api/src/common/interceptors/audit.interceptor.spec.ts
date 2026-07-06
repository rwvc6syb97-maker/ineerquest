import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';
import { AuditInterceptor, ADMIN_OP_EVENT } from './audit.interceptor';
import { setAuditBefore } from './audit.decorator';

/**
 * T4-11 AuditInterceptor 单测：
 *  - scope=admin 写操作 → 写入 event_log(admin_op)，properties 含操作人/IP/前后值
 *  - 读操作(GET) → 跳过入库
 *  - 非 admin 写操作 → 跳过入库
 *  - 入库异常 → 不阻断主流程（吞掉异常）
 */
describe('AuditInterceptor (T4-11 审计)', () => {
  const makeReflector = (meta?: unknown): Reflector =>
    ({ getAllAndOverride: () => meta } as unknown as Reflector);

  const makePrisma = (createImpl?: jest.Mock) => ({
    eventLog: { create: createImpl ?? jest.fn().mockResolvedValue({}) },
  });

  const makeCtx = (req: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext);

  const makeReq = (over: Record<string, unknown> = {}) => ({
    method: 'POST',
    originalUrl: '/admin/questions/1',
    headers: {},
    body: { title: 'new' },
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
    user: { userId: '1001', jti: 'j1', scope: 'admin', role: 3, perms: ['*'] },
    ...over,
  });

  const run = async (interceptor: AuditInterceptor, req: Record<string, unknown>, resp: unknown) => {
    const next: CallHandler = { handle: () => of(resp) };
    await lastValueFrom(interceptor.intercept(makeCtx(req), next));
    // 等待 fire-and-forget 微任务落地
    await new Promise((r) => setImmediate(r));
  };

  it('admin 写操作写入 admin_op 审计，含操作人/IP/前后值', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = makePrisma(create);
    const it0 = new AuditInterceptor(
      makeReflector({ resource: 'question:1', action: 'update' }),
      prisma as never,
    );
    const req = makeReq();
    setAuditBefore(req as never, { title: 'old' });
    await run(it0, req, { data: { title: 'new' } });

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.data.eventType).toBe(ADMIN_OP_EVENT);
    expect(arg.data.userId).toBe(BigInt('1001'));
    const props = arg.data.properties;
    expect(props.operatorId).toBe('1001');
    expect(props.resource).toBe('question:1');
    expect(props.before).toEqual({ title: 'old' });
    expect(props.after).toEqual({ title: 'new' });
    expect(props.ip).toBe('10.0.0.1');
  });

  it('读操作(GET) 跳过入库', async () => {
    const create = jest.fn().mockResolvedValue({});
    const it0 = new AuditInterceptor(makeReflector(undefined), makePrisma(create) as never);
    await run(it0, makeReq({ method: 'GET' }), { data: {} });
    expect(create).not.toHaveBeenCalled();
  });

  it('非 admin 写操作 跳过入库', async () => {
    const create = jest.fn().mockResolvedValue({});
    const it0 = new AuditInterceptor(makeReflector(undefined), makePrisma(create) as never);
    await run(it0, makeReq({ user: { userId: '2', jti: 'x', scope: 'app' } }), { data: {} });
    expect(create).not.toHaveBeenCalled();
  });

  it('入库异常不阻断主流程', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const it0 = new AuditInterceptor(makeReflector(undefined), makePrisma(create) as never);
    const next: CallHandler = { handle: () => of({ data: {} }) };
    // 主流程正常 resolve，异常被吞
    await expect(
      lastValueFrom(it0.intercept(makeCtx(makeReq()), next)),
    ).resolves.toBeDefined();
    await new Promise((r) => setImmediate(r));
    expect(create).toHaveBeenCalled();
  });
});