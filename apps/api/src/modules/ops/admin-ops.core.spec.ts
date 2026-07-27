import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { AdminCoachService } from './admin-coach.service';
import { AdminContentService } from './admin-content.service';
import { CoachingOrderStatus, CoachStatus } from '../coaching/coaching.constants';

/**
 * T4-14 / T4-15 / T4-16 运营后台核心业务逻辑单测（纯内存 mock，无真实 DB/Redis）。
 *
 * 覆盖关键约束：
 *  - 封禁强制下线：status→0 且调用 token.banUser；Redis 降级返回 forceLogout=false 不抛错
 *  - 辅导师下线拦截：存在进行中订单且 !force 抛 ConflictException；force=true 放行
 *  - 上架前置：未审核通过（auditStatus≠1）无法上架
 *  - 内容软删除：isDeleted=1 且 ES 索引降级 indexed=false（不影响主流程）
 */
describe('运营后台核心逻辑 (T4-14/15/16)', () => {
  // ---------------- T4-14 封禁强制下线 ----------------
  describe('AdminUserService.ban 封禁强制下线', () => {
    const makePrisma = (user: any) =>
      ({
        user: {
          findFirst: jest.fn(async () => user),
          update: jest.fn(async () => ({ ...user, status: 0 })),
        },
      }) as any;

    it('正常封禁：status→0 且调用 token.banUser，forceLogout=true', async () => {
      const prisma = makePrisma({ id: 10n, status: 1, isDeleted: 0 });
      const token = { banUser: jest.fn(async () => true), unbanUser: jest.fn() } as any;
      const svc = new AdminUserService(prisma, token);

      const res = await svc.ban('10', '违规');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 10n }, data: { status: 0 } });
      expect(token.banUser).toHaveBeenCalledWith('10');
      expect(res).toMatchObject({ status: 0, forceLogout: true, reason: '违规' });
    });

    it('Redis 降级：banUser 返回 false 时不抛错，forceLogout=false', async () => {
      const prisma = makePrisma({ id: 11n, status: 1, isDeleted: 0 });
      const token = { banUser: jest.fn(async () => false), unbanUser: jest.fn() } as any;
      const svc = new AdminUserService(prisma, token);

      const res = await svc.ban('11', '降级测试');
      expect(res.forceLogout).toBe(false);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('已封禁：短路返回 alreadyBanned，不重复写库', async () => {
      const prisma = makePrisma({ id: 12n, status: 0, isDeleted: 0 });
      const token = { banUser: jest.fn(), unbanUser: jest.fn() } as any;
      const svc = new AdminUserService(prisma, token);

      const res = await svc.ban('12', 'x');
      expect(res).toMatchObject({ status: 0, alreadyBanned: true });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(token.banUser).not.toHaveBeenCalled();
    });
  });

  // 四缺陷整改 · 任务4.1/4.2 用户管理 email/latestReport/dimensions
  describe('AdminUserService.detail email脱敏+最新报告+四维度', () => {
    const baseUser = {
      id: 100n,
      userNo: 'U100',
      nickname: '张三',
      avatarUrl: null,
      phone: '13800008888',
      email: 'zhangsan@example.com',
      phoneCountry: '+86',
      gender: 1,
      role: 1,
      status: 1,
      isPaid: 1,
      lastLoginAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      isDeleted: 0,
    };
    const mkPrisma = (user: any, report: any) =>
      ({
        user: { findFirst: jest.fn(async () => user) },
        report: { findFirst: jest.fn(async () => report) },
      }) as any;
    const token = { banUser: jest.fn(), unbanUser: jest.fn() } as any;

    it('无pii：email脱敏 z***@example.com，phone脱敏', async () => {
      const svc = new AdminUserService(mkPrisma(baseUser, null), token);
      const res = (await svc.detail('100', false)) as any;
      expect(res.email).toBe('z***@example.com');
      expect(res.phone).toBe('138****8888');
    });

    it('持pii：email/phone明文', async () => {
      const svc = new AdminUserService(mkPrisma(baseUser, null), token);
      const res = (await svc.detail('100', true)) as any;
      expect(res.email).toBe('zhangsan@example.com');
      expect(res.phone).toBe('13800008888');
    });

    it('无报告：latestReport=null，dimensions=[]', async () => {
      const svc = new AdminUserService(mkPrisma(baseUser, null), token);
      const res = (await svc.detail('100', false)) as any;
      expect(res.latestReport).toBeNull();
      expect(res.dimensions).toEqual([]);
    });

    it('有报告：latestReport四字段+dimensions四维度', async () => {
      const report = {
        mbtiType: 'INTJ',
        reportNo: 'R20260701001',
        reportType: 1,
        createdAt: new Date('2026-07-02T00:00:00.000Z'),
        result: { scoreEi: 62.5, scoreSn: 71.0, scoreTf: 55.5, scoreJp: 80.0 },
      };
      const prisma = mkPrisma(baseUser, report);
      const svc = new AdminUserService(prisma, token);
      const res = (await svc.detail('100', false)) as any;
      expect(res.latestReport).toMatchObject({ mbtiType: 'INTJ', reportNo: 'R20260701001', reportType: 1 });
      expect(res.dimensions).toEqual([
        { dimension: 'EI', score: 62.5},
        { dimension: 'SN', score: 71.0 },
        { dimension: 'TF', score: 55.5 },
        { dimension: 'JP', score: 80.0 },
      ]);
      expect(prisma.report.findFirst).toHaveBeenCalledWith({
        where: { userId: 100n, isDeleted: 0 },
        orderBy: { createdAt: 'desc' },
        include: { result: true },
      });
    });
  });

  // 后台整改 · 任务A 出参字段对齐前端 AdminUser 契约
  describe('AdminUserService.detail 出参字段名对齐前端契约', () => {
    const baseUser = {
      id: 200n, userNo: 'U200', nickname: '李四', avatarUrl: null,
      phone: '13900001111', email: 'lisi@example.com', phoneCountry: '+86',
      gender: 1, role: 1, status: 1, isPaid: 1, lastLoginAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'), isDeleted: 0,
    };
    const prisma = {
      user: { findFirst: jest.fn(async () => baseUser) },
      report: { findFirst: jest.fn(async () => null) },
    } as any;
    const token = { banUser: jest.fn(), unbanUser: jest.fn() } as any;

    it('输出 registeredAt/lastActiveAt/paid/masked，且无旧字段名', async () => {
      const svc = new AdminUserService(prisma, token);
      const res = (await svc.detail('200', false)) as any;
      expect(res.registeredAt).toEqual(baseUser.createdAt);
      expect(res).toHaveProperty('lastActiveAt');
      expect(res.paid).toBe(true);
      expect(res.masked).toBe(true); // 无 pii → 脱敏
      // 旧字段名不再出现
      expect(res.createdAt).toBeUndefined();
      expect(res.lastLoginAt).toBeUndefined();
      expect(res.isPaid).toBeUndefined();
    });

    it('持 pii：masked=false', async () => {
      const svc = new AdminUserService(prisma, token);
      const res = (await svc.detail('200', true)) as any;
      expect(res.masked).toBe(false);
    });
  });

  // 后台整改 · 任务B 导出接口权限脱敏分支
  describe('AdminUserService 导出接口 PII 脱敏', () => {
    const baseUser = {
      id: 300n, userNo: 'U300', nickname: '王五', avatarUrl: null,
      phone: '13700002222', email: 'wangwu@example.com', phoneCountry: '+86',
      gender: 1,role: 1, status: 1, isPaid: 1, lastLoginAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'), isDeleted: 0,
    };
    const token = { banUser: jest.fn(), unbanUser: jest.fn() } as any;

    it('批量导出：无 pii → CSV 内手机/邮箱脱敏', async () => {
      const prisma = {
        user: { findMany: jest.fn(async () => [baseUser]) },
        report: { findMany: jest.fn(async () => []) },
      } as any;
      const svc = new AdminUserService(prisma, token);
      const file = await svc.exportUsersSheet({ pii: false });
      const csv = file.buffer.toString('utf-8');
      expect(file.contentType).toContain('ms-excel');
      expect(csv).toContain('137****2222');
      expect(csv).toContain('w***@example.com');
      expect(csv).not.toContain('13700002222');
    });

    it('批量导出：持 pii → CSV 内明文', async () => {
      const prisma = {
        user: { findMany: jest.fn(async () => [baseUser]) },
        report: { findMany: jest.fn(async () => []) },
      } as any;
      const svc = new AdminUserService(prisma, token);
      const file = await svc.exportUsersSheet({ pii: true });
      const csv = file.buffer.toString('utf-8');
      expect(csv).toContain('13700002222');
      expect(csv).toContain('wangwu@example.com');
    });

    it('单用户 PDF：用户不存在抛 NotFound', async () => {
      const prisma = {
        user: { findFirst: jest.fn(async () => null) },
        report: { findFirst: jest.fn(async () => null) },
      } as any;
      const svc = new AdminUserService(prisma, token);
      await expect(svc.exportUserReportPdf('999', false)).rejects.toThrow();
    });

    it('单用户 PDF：返回 application/pdf 文件流', async () => {
   const prisma = {
        user: { findFirst: jest.fn(async () => baseUser) },
        report: { findFirst: jest.fn(async () => null) },
      } as any;
      const svc = new AdminUserService(prisma, token);
      const file = await svc.exportUserReportPdf('300', false);
      expect(file.contentType).toBe('application/pdf');
      expect(file.buffer.length).toBeGreaterThan(0);
    });
  });

  // ---------------- T4-15 辅导师下线拦截 ----------------
  describe('AdminCoachService.shelf 下线拦截进行中订单', () => {
    const makePrisma = (coach: any, activeCount: number) =>
      ({
        coach: {
          findFirst: jest.fn(async () => coach),
          update: jest.fn(async () => ({ ...coach })),
        },
        coachingOrder: {
          count: jest.fn(async () => activeCount),
        },
      }) as any;

    it('下线时存在进行中订单且未 force：抛 ConflictException', async () => {
      const prisma = makePrisma({ id: 5n, auditStatus: 1, status: 1, isDeleted: 0 }, 2);
      const svc = new AdminCoachService(prisma);
      await expect(
        svc.shelf('5', CoachStatus.OFFLINE, { reason: '违规下线' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.coach.update).not.toHaveBeenCalled();
    });

    it('下线时存在进行中订单但 force=true：放行并更新 status=0', async () => {
      const prisma = makePrisma({ id: 6n, auditStatus: 1, status: 1, isDeleted: 0 }, 2);
      const svc = new AdminCoachService(prisma);
      const res = await svc.shelf('6', CoachStatus.OFFLINE, { force: true, reason: '强制' });
      expect(res).toMatchObject({ status: CoachStatus.OFFLINE, forced: true });
      expect(prisma.coach.update).toHaveBeenCalledWith({
        where: { id: 6n },
        data: { status: CoachStatus.OFFLINE },
      });
    });

    it('下线时无进行中订单：正常下线', async () => {
      const prisma = makePrisma({ id: 7n, auditStatus: 1, status: 1, isDeleted: 0 }, 0);
      const svc = new AdminCoachService(prisma);
      const res = await svc.shelf('7', CoachStatus.OFFLINE, { reason: '正常' });
      expect(res.status).toBe(CoachStatus.OFFLINE);
    });

    it('上架时未审核通过（auditStatus≠1）：抛 BadRequestException', async () => {
      const prisma = makePrisma({ id: 8n, auditStatus: 0, status: 0, isDeleted: 0 }, 0);
      const svc = new AdminCoachService(prisma);
      await expect(
        svc.shelf('8', CoachStatus.ONLINE, { reason: '上架' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('countActiveOrders 只统计 PENDING/PAID', async () => {
      const prisma = makePrisma({ id: 9n, auditStatus: 1, status: 1, isDeleted: 0 }, 3);
      const svc = new AdminCoachService(prisma);
      await svc.countActiveOrders(9n);
      expect(prisma.coachingOrder.count).toHaveBeenCalledWith({
        where: {
          coachId: 9n,
          isDeleted: 0,
          status: { in: [CoachingOrderStatus.PENDING, CoachingOrderStatus.PAID] },
        },
      });
    });
  });

  // ---------------- T4-15 评价管理 ----------------
  describe('AdminCoachService 评价管理', () => {
    it('deleteReview 软删除：isDeleted=1', async () => {
      const prisma = {
        coachingReview: {
          findFirst: jest.fn(async () => ({ id: 3n, isDeleted: 0 })),
          update: jest.fn(async () => ({})),
        },
      } as any;
      const svc = new AdminCoachService(prisma);
      const res = await svc.deleteReview('3', '违规');
      expect(prisma.coachingReview.update).toHaveBeenCalledWith({
        where: { id: 3n },
        data: { isDeleted: 1 },
      });
      expect(res).toMatchObject({ deleted: true, reason: '违规' });
    });
  });

  // ---------------- T4-16 内容管理 + ES 降级 ----------------
  describe('AdminContentService 软删除与 ES 索引降级', () => {
    it('removeCareer 软删除：isDeleted=1/status=0，indexed=false（ES 未接入降级）', async () => {
      const prisma = {
        career: {
          findFirst: jest.fn(async () => ({ id: 20n, isDeleted: 0 })),
          update: jest.fn(async () => ({})),
        },
      } as any;
      const svc = new AdminContentService(prisma);
      const res = await svc.removeCareer('20', '过期');
      expect(prisma.career.update).toHaveBeenCalledWith({
        where: { id: 20n },
        data: expect.objectContaining({ isDeleted: 1, status: 0 }),
      });
      expect(res).toMatchObject({ removed: true, indexed: false, reason: '过期' });
    });

    it('createCareer：编码重复抛 BadRequestException', async () => {
      const prisma = {
        career: {
          findFirst: jest.fn(async () => ({ id: 1n })),
          create: jest.fn(),
        },
      } as any;
      const svc = new AdminContentService(prisma);
      await expect(
        svc.createCareer({ careerCode: 'DUP', name: 'x', category: 'c' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.career.create).not.toHaveBeenCalled();
    });

    it('createResource：成功创建返回 indexed=false 降级标记', async () => {
      const prisma = {
        learningResource: {
          create: jest.fn(async () => ({ id: 30n, title: 't' })),
        },
      } as any;
      const svc = new AdminContentService(prisma);
      const res = await svc.createResource({ title: 't', resourceType: 1 } as any);
      expect(res).toMatchObject({ indexed: false });
      expect((res as any).id).toBe('30');
    });
  });
});