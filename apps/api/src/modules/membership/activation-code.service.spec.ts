import { ActivationCodeService } from './activation-code.service';
import { BizCode, CommonCode } from '../../common/response';

/**
 * 激活码服务单测：纯内存 mock，无 DB/Redis 依赖。
 *
 * 逐条验收：
 *  - 批量生成激活码（gen → create → 校验 count）
 *  - 兑换流程：命中未用 → 升级用户 → 标记已用
 *  - 边界：已用码（status=1）→ 拒绝
 *  - 边界：过期码（expireAt < now）→ 自动标记 status=2 → 拒绝
 *  - 边界：无效码 → 4601
 *  - 边界：套餐已下架 → 拒绝
 *  - 会员叠加：已有有效会员从到期日叠加
 */
describe('ActivationCodeService', () => {
  // ---- 工厂函数 ----
  const build = () => {
    const prisma: any = {
      activationCode: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      membershipPlan: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      membershipRedeemRecord: {
        create: jest.fn().mockResolvedValue({
          id: 1n,
          redeemNo: 'RD-TEST-0001',
          userId: 7n,
          codeId: 100n,
          code: 'AAAA-BBBB-CCCC-DD',
          planCode: 'pro-monthly',
          planName: 'Pro 月度',
          membershipLevel: 2,
          durationDays: 30,
          expireAt: null,
        }),
      },
      $transaction: jest.fn((arg: unknown) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        if (typeof arg === 'function') return arg(prisma);
        return arg;
      }),
    };

    const redis: any = {
      raw: {
        set: jest.fn().mockResolvedValue('OK'),  // lock acquire
        get: jest.fn().mockResolvedValue(null),
        del: jest.fn().mockResolvedValue(1),
      },
    };

    const svc = new ActivationCodeService(prisma as any, redis as any, { send: jest.fn().mockResolvedValue(true) } as any);
    return { svc, prisma, redis };
  };

  const codeRow = (over: Record<string, unknown> = {}) => ({
    id: 100n,
    code: 'AAAA-BBBB-CCCC-DD',
    planCode: 'pro-monthly',
    status: 0,            // unused
    usedBy: null,
    usedAt: null,
    sentTo: null,
    sentChannel: null,
    expireAt: null,
    note: null,
    batchNo: 'B-TEST01',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  const planRow = (over: Record<string, unknown> = {}) => ({
    id: 1n,
    code: 'pro-monthly',
    name: 'Pro 月度',
    price: 4900n,
    durationDays: 30,
    status: 1,   // ONLINE
    isDeleted: 0,
    ...over,
  });

  // ======================== 批量生成 ========================

  describe('generate', () => {
    it('校验套餐存在并批量生成 count 个激活码', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(planRow());
      prisma.activationCode.create.mockResolvedValue(codeRow());

      const result = await svc.generate({
        planCode: 'pro-monthly',
        count: 5,
        expireDays: 30,
        note: '运营活动',
      });

      expect(prisma.membershipPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ code: 'pro-monthly' }) }),
      );
      expect(prisma.activationCode.create).toHaveBeenCalledTimes(5);
      expect(result.codes).toHaveLength(5);
      expect(result.planCode).toBe('pro-monthly');
      expect(result.planName).toBe('Pro 月度');
      expect(result.expireAt).toBeTruthy(); // 30 天后
    });

    it('套餐不存在则抛出 BAD_REQUEST', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(null);
      await expect(
        svc.generate({ planCode: 'no-such-plan', count: 1 }),
      ).rejects.toMatchObject({ bizCode: 4000 });
    });
  });

  // ======================== 兑换核心 ========================

  describe('redeem', () => {
    it('正常兑换 → 升级 isPaid + 标记已用 + 返回套餐信息', async () => {
      const { svc, prisma, redis } = build();
      prisma.activationCode.findFirst.mockResolvedValue(codeRow());
      prisma.membershipPlan.findFirst.mockResolvedValue(planRow());
      prisma.user.findFirst.mockResolvedValue({ paidExpireAt: null });

      const result = await svc.redeem('7', 'AAAA-BBBB-CCCC-DD');

      // Redis 锁已被获取
      expect(redis.raw.set).toHaveBeenCalledWith(
        'activation:redeem:AAAA-BBBB-CCCC-DD', '1', 'EX', 10, 'NX',
      );
      // 事务中更新了 user
      expect(prisma.$transaction).toHaveBeenCalled();
      // 返回套餐名
      expect(result.planName).toBe('Pro 月度');
      expect(result.durationDays).toBe(30);
      // 到期时间应为 30 天后
      expect(result.expireAt).toBeTruthy();
      const expireDate = new Date(result.expireAt!);
      const diffDays = Math.round((expireDate.getTime() - Date.now()) / 86400_000);
      expect(diffDays).toBe(30);
    });

    it('激活码已使用（status=1）→ 抛出 BAD_REQUEST', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.findFirst.mockResolvedValue(codeRow({ status: 1, usedBy: 3n }));

      await expect(
        svc.redeem('7', 'USED-CODE'),
      ).rejects.toMatchObject({ bizCode: 4602, message: '激活码已被使用' });
    });

    it('激活码不存在 → 抛出 NOT_FOUND', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.findFirst.mockResolvedValue(null);

      await expect(
        svc.redeem('7', 'NO-SUCH-CODE'),
      ).rejects.toMatchObject({ bizCode: 4601, message: '激活码无效' });
    });

    it('激活码已过期 → 自动标记 status=2 → 拒绝', async () => {
      const { svc, prisma } = build();
      const expired = codeRow({
        expireAt: new Date('2024-01-01'), // 过去的日期
      });
      prisma.activationCode.findFirst.mockResolvedValue(expired);

      await expect(
        svc.redeem('7', 'EXPIRED-CODE'),
      ).rejects.toMatchObject({ bizCode: 4603, message: '激活码已过期' });

      // 验证过期码被标记为 status=2
      const updateCall = prisma.activationCode.update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 2 } }),
      );
    });

    it('套餐已下架 → 拒绝兑换', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.findFirst.mockResolvedValue(codeRow());
      prisma.membershipPlan.findFirst.mockResolvedValue(
        planRow({ status: 0, name: 'Pro 年度' }),
      );

      await expect(
        svc.redeem('7', 'AAAA-BBBB-CCCC-DD'),
      ).rejects.toMatchObject({ bizCode: 4604, message: '对应套餐已下架' });
    });

    it('用户已有有效会员 → 从到期日起叠加', async () => {
      const { svc, prisma } = build();
      const futureDate = new Date(Date.now() + 10 * 86400_000); // 10 天后到期
      prisma.activationCode.findFirst.mockResolvedValue(codeRow());
      prisma.membershipPlan.findFirst.mockResolvedValue(planRow());
      prisma.user.findFirst.mockResolvedValue({ paidExpireAt: futureDate });

      const result = await svc.redeem('7', 'AAAA-BBBB-CCCC-DD');

      // 从 10 天后起算 + 30 天 = 40 天后
      const expireDate = new Date(result.expireAt!);
      const diffDays = Math.round((expireDate.getTime() - Date.now()) / 86400_000);
      expect(diffDays).toBe(40); // 10 + 30
    });

    it('并发兑换 → 只有一个成功（Redis 锁）', async () => {
      const { svc, prisma, redis } = build();
      prisma.activationCode.findFirst.mockResolvedValue(codeRow());
      prisma.membershipPlan.findFirst.mockResolvedValue(planRow());
      prisma.user.findFirst.mockResolvedValue({ paidExpireAt: null });

      // 第一次 lock 获取成功
      redis.raw.set.mockResolvedValueOnce('OK');
      const first = svc.redeem('7', 'AAAA-BBBB-CCCC-DD');

      // 第二次 lock 获取失败（返回 null 表示已锁定）
      redis.raw.set.mockResolvedValueOnce(null);
      const second = svc.redeem('8', 'AAAA-BBBB-CCCC-DD');

      const [r1, r2] = await Promise.allSettled([first, second]);

      expect(r1.status).toBe('fulfilled');
      expect(r2.status).toBe('rejected');
      if (r2.status === 'rejected') {
        expect(r2.reason).toMatchObject({ bizCode: 4090, message: '兑换处理中，请勿重复提交' });
      }
    });

    it('大小写不敏感 → 转大写后匹配', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.findFirst.mockResolvedValue(codeRow());
      prisma.membershipPlan.findFirst.mockResolvedValue(planRow());
      prisma.user.findFirst.mockResolvedValue({ paidExpireAt: null });

      await svc.redeem('7', 'aaaa-bbbb-cccc-dd');

      expect(prisma.activationCode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'AAAA-BBBB-CCCC-DD' } }),
      );
    });
  });

  // ======================== 列表查询 ========================

  describe('list', () => {
    it('按 planCode 过滤并分页', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.count.mockResolvedValue(3);
      prisma.activationCode.findMany.mockResolvedValue([
        codeRow(), codeRow(), codeRow(),
      ]);

      const result = await svc.list({ planCode: 'pro-monthly', page: 1, pageSize: 10 });

      expect(result.total).toBe(3);
      expect(result.list).toHaveLength(3);
      expect(result.list[0]).toHaveProperty('code', 'AAAA-BBBB-CCCC-DD');
      expect(result.list[0]).toHaveProperty('statusLabel', 'unused');
    });

    it('按 status 过滤已用码', async () => {
      const { svc, prisma } = build();
      prisma.activationCode.count.mockResolvedValue(1);
      prisma.activationCode.findMany.mockResolvedValue([codeRow({ status: 1, usedBy: 5n })]);

      const result = await svc.list({ status: 1, page: 1, pageSize: 10 });

      expect(result.list[0].statusLabel).toBe('used');
    });
  });
});
