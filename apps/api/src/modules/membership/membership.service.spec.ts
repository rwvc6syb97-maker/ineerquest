import { MembershipService } from './membership.service';
import { PlanStatus } from './membership.constants';
import { PaymentService } from '../payment/payment.service';
import { WechatPayAdapter } from '../payment/pay-channel.adapter';
import { BizType } from '../payment/payment.constants';

/**
 * T2-10 会员套餐服务单测：纯内存 mock Prisma，无 DB/网络依赖。
 *
 * 逐条验收：
 *  - 游客只读上架套餐（listPublicPlans 过滤 status=1）
 *  - getPublicPlanByCode 未上架/不存在 → 4040
 *  - 后台 CRUD 与 PATCH status 上下架
 *  - 下架套餐下单（bizType=3）→ 4040（在 PaymentService 中校验）
 */
describe('MembershipService (T2-10)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1n,
    code: 'vip_year',
    name: '年度会员',
    subtitle: null,
    price: 9900n,
    originalPrice: null,
    durationDays: 365,
    planType: 2,
    benefits: null,
    sortOrder: 0,
    status: PlanStatus.ONLINE,
    isRecommended: 0,
    isDeleted: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  const build = () => {
    const prisma: any = {
      membershipPlan: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const svc = new MembershipService(prisma as any);
    return { svc, prisma };
  };

  describe('游客可访问', () => {
    it('listPublicPlans 仅查询上架套餐（where status=ONLINE）', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findMany.mockResolvedValue([row()]);
      const list = await svc.listPublicPlans();
      expect(prisma.membershipPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PlanStatus.ONLINE, isDeleted: 0 },
        }),
      );
      expect(list[0]).toMatchObject({ code: 'vip_year', price: 9900 });
      // 公开 VO 不暴露内部状态字段
      expect((list[0] as Record<string, unknown>).isDeleted).toBeUndefined();
    });

    it('getPublicPlanByCode 命中上架套餐返回 VO', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(row());
      const vo = await svc.getPublicPlanByCode('vip_year');
      expect(vo.code).toBe('vip_year');
    });

    it('getPublicPlanByCode 未上架/不存在 → 4040', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(null);
      await expect(svc.getPublicPlanByCode('none')).rejects.toMatchObject({
        bizCode: 4040,
      });
    });
  });

  describe('后台 CRUD 与上下架', () => {
    it('createPlan 新建默认下架', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(null);
      prisma.membershipPlan.create.mockImplementation(async ({ data }: any) =>
        row({ status: data.status }),
      );
      const vo = await svc.createPlan({ code: 'vip_m', name: '月卡', price: 1900 } as any);
      const arg = prisma.membershipPlan.create.mock.calls[0][0];
      expect(arg.data.status).toBe(PlanStatus.OFFLINE);
      expect(vo.statusLabel).toBe('offline');
    });

    it('createPlan code 冲突 → 4000', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(row());
      await expect(
        svc.createPlan({ code: 'vip_year', name: 'x', price: 1 } as any),
      ).rejects.toMatchObject({ bizCode: 4000 });
    });

    it('updateStatus 上架切换 status=1', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(row({ status: PlanStatus.OFFLINE }));
      prisma.membershipPlan.update.mockResolvedValue(row({ status: PlanStatus.ONLINE }));
      const vo = await svc.updateStatus('1', PlanStatus.ONLINE);
      expect(prisma.membershipPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PlanStatus.ONLINE } }),
      );
      expect(vo.status).toBe(PlanStatus.ONLINE);
    });

    it('deletePlan 软删除 is_deleted=1', async () => {
      const { svc, prisma } = build();
      prisma.membershipPlan.findFirst.mockResolvedValue(row());
      prisma.membershipPlan.update.mockResolvedValue(row({ isDeleted: 1 }));
      const res = await svc.deletePlan('1');
      const arg = prisma.membershipPlan.update.mock.calls[0][0];
      expect(arg.data.isDeleted).toBe(1);
      expect(res.deleted).toBe(true);
    });
  });

  describe('下单上架校验（与 PaymentService 协同）', () => {
    it('下架套餐下单 bizType=3 → 4040', async () => {
      const prisma: any = {
        paymentOrder: { create: jest.fn() },
        membershipPlan: {
          findFirst: jest.fn().mockResolvedValue({
            id: 2n,
            name: 'vip',
            price: 5000n,
            status: PlanStatus.OFFLINE,
          }),
        },
      };
      const redis: any = { raw: { zadd: jest.fn() } };
      const analytics: any = { fire: jest.fn() };
      process.env.NODE_ENV = 'test';
      const coaching: any = { confirmAfterPaid: jest.fn() };
      const pay = new PaymentService(prisma, redis, analytics, new WechatPayAdapter(), coaching);
      await expect(pay.createOrder('7', BizType.MEMBERSHIP, '2')).rejects.toMatchObject({
        bizCode: 4040,
      });
    });
  });
});