import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TokenService } from '../user/auth/token.service';
import { maskPhone, maskEmail } from './admin-mask.util';

/** 导出文件流统一结构（controller 层转 res 头 + 二进制流）。 */
export interface AdminExportFile {
  fileName: string;
  contentType: string;
  buffer: Buffer;
}

/**
 * T4-14 用户管理服务 `/admin/users/*`。
 * 权限：user:read（列表/详情，默认脱敏）、user:pii（明文 PII）、user:ban（封禁/解封）。
 *
 * 封禁强制下线：user.status=0 + TokenService.banUser 写 Redis 用户级封禁标记，
 * verifyActive 命中即拒绝该用户所有存量 token。Redis 不可用时降级为仅改 status，
 * 由后续 token 校验依赖 status 拦截（标 blocked，见待办清单）。
 */
@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly token: TokenService,
  ) {}

  private toId(id: string | number): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效的用户 ID');
    }
  }

  /**
   * 组装对外用户视图。pii=true 且持 user:pii 权限时下发明文，否则脱敏。
   * 出参字段名对齐前端 AdminUser 契约（admin-users.api.ts）：
   *   registeredAt(=createdAt) / lastActiveAt(=lastLoginAt) / paid(=isPaid 布尔) / masked(无 pii 权限时为 true)。
   */
  private view(u: Record<string, unknown>, pii: boolean) {
    const phone = (u.phone as string | null) ?? null;
    const email = (u.email as string | null) ?? null;
    return {
      id: (u.id as bigint)?.toString?.() ?? String(u.id),
      userNo: u.userNo,
      nickname: u.nickname,
      avatarUrl: u.avatarUrl,
      phone: pii ? phone : maskPhone(phone),
      // email 受 user:pii 权限控制：无权限脱敏为 a***@b.com 形式（任务4.1）
      email: pii ? email : maskEmail(email),
      // masked=true 表示当前手机/邮箱为脱敏值（即无 user:pii 权限）
      masked: !pii,
      phoneCountry: u.phoneCountry,
      gender: u.gender,
      role: u.role,
      status: u.status,
      // paid：布尔化 isPaid（旧字段 0/1 或 boolean 均归一）
      paid: Boolean(u.isPaid),
      lastActiveAt: u.lastLoginAt,
      registeredAt: u.createdAt,
    };
  }

  /** 分页列表（默认脱敏）。 */
  async list(params: {
    status?: number;
    role?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
    pii?: boolean;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.status === 0 || params.status === 1) where.status = params.status;
    if (Number.isInteger(params.role)) where.role = params.role;
    if (params.keyword) {
      where.OR = [
        { nickname: { contains: params.keyword } },
        { userNo: { contains: params.keyword } },
        { phone: { contains: params.keyword } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
     this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => this.view(r as unknown as Record<string, unknown>, !!params.pii)),
    };
  }

  /** 用户详情。pii 由 controller 依据 user:pii 权限传入。 */
  async detail(id: string | number, pii: boolean) {
    const uid = this.toId(id);
    const row = await this.prisma.user.findFirst({
      where: { id: uid, isDeleted: 0 },
    });
    if (!row) throw new NotFoundException('用户不存在');
    const base = this.view(row as unknown as Record<string, unknown>, pii);
    const { latestReport, dimensions } = await this.latestReportView(uid);
    return { ...base, latestReport, dimensions };
  }

  /**
   * 关联该用户「最新一条报告」(report 按 createdAt desc, isDeleted=0)（任务4.2）。
   * - latestReport: { mbtiType, reportNo, reportType, createdAt }（无报告时 null）
   * - dimensions:   对应 assessment_result 四维度 [{ dimension, score }]
   *                 dimension ∈ EI/SN/TF/JP，score 取 scoreEi/scoreSn/scoreTf/scoreJp（Decimal→number）
   * report.result 已强关联 AssessmentResult，故随报告取维度，保证与该报告口径一致。
   */
  private async latestReportView(uid: bigint): Promise<{
    latestReport: {
      mbtiType: string;
      reportNo: string;
      reportType: number;
      createdAt: Date;
    } | null;
    dimensions: Array<{ dimension: string; score: number }>;
  }> {
    const report = await this.prisma.report.findFirst({
      where: { userId: uid, isDeleted: 0 },
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    });
    if (!report) return { latestReport: null, dimensions: [] };

    const r = report.result;
    const dimensions = r
      ? [
          { dimension: 'EI', score: Number(r.scoreEi) },
          { dimension: 'SN', score: Number(r.scoreSn) },
          { dimension: 'TF', score: Number(r.scoreTf) },
          { dimension: 'JP', score: Number(r.scoreJp) },
        ]
      : [];

    return {
      latestReport: {
        mbtiType: report.mbtiType,
        reportNo: report.reportNo,
        reportType: report.reportType,
        createdAt: report.createdAt,
      },
      dimensions,
    };
  }

  /**
   * 封禁用户：status=1→0，并强制下线（Redis 用户级封禁标记）。
   * @returns 含 forceLogout 标记（Redis 是否成功；false 表示降级需依赖 status 拦截）
   */
  async ban(id: string | number, reason: string) {
    const uid = this.toId(id);
    const user = await this.prisma.user.findFirst({ where: { id: uid, isDeleted: 0 } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === 0) {
      return { id: uid.toString(), status: 0, alreadyBanned: true, reason };
    }

    await this.prisma.user.update({ where: { id: uid }, data: { status: 0 } });
    const forceLogout = await this.token.banUser(uid.toString());
    if (!forceLogout) {
      this.logger.warn(`用户 ${uid} 封禁：Redis 强制下线降级，仅改 status`);
    }
    return { id: uid.toString(), status: 0, forceLogout, reason };
  }

  /** 解封用户：status=0→1，清除强制下线标记。 */
  async unban(id: string | number, reason: string) {
    const uid = this.toId(id);
    const user = await this.prisma.user.findFirst({ where: { id: uid, isDeleted: 0 } });
    if (!user) throw new NotFoundException('用户不存在');
    if (user.status === 1) {
      return { id: uid.toString(), status: 1, alreadyActive: true, reason };
    }

    await this.prisma.user.update({ where: { id: uid }, data: { status: 1 } });
    await this.token.unbanUser(uid.toString());
    return { id: uid.toString(), status: 1, reason };
  }

  /** 供审计前值快照使用（返回未脱敏的关键状态字段）。 */
  async snapshot(id: string | number) {
    const uid = this.toId(id);
    const row = await this.prisma.user.findFirst({
      where: { id: uid, isDeleted: 0 },
      select: { id: true, status: true, role: true },
    });
    if (!row) return null;
    return { id: row.id.toString(), status: row.status, role: row.role };
  }

  // ============ 后台导出（问题② 双接口 · 强制复用 pii 脱敏）============

  /**
   * 取用户「最新报告全文 + 四维度」用于导出。无报告返回 null。
   * 维度取自报告强关联的 AssessmentResult（scoreEi/Sn/Tf/Jp）。
   */
  private async exportSourceOf(uid: bigint): Promise<{
    user: Record<string, unknown>;
    mbtiType: string | null;
    dims: { EI: number; SN: number; TF: number; JP: number } | null;
    sections: Array<{ title: string; content: unknown }>;
    reportNo: string | null;
  } | null> {
    const user = await this.prisma.user.findFirst({ where: { id: uid, isDeleted: 0 } });
    if (!user) return null;
    const report = await this.prisma.report.findFirst({
      where: { userId: uid, isDeleted: 0 },
      orderBy: { createdAt: 'desc' },
      include: { result: true, sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!report) {
      return { user: user as unknown as Record<string, unknown>, mbtiType: null, dims: null, sections: [], reportNo: null };
    }
    const r = report.result;
    const dims = r
      ? { EI: Number(r.scoreEi), SN: Number(r.scoreSn), TF: Number(r.scoreTf), JP: Number(r.scoreJp) }
      : null;
    return {
      user: user as unknown as Record<string, unknown>,
      mbtiType: report.mbtiType,
      dims,
      sections: (report.sections ?? []).map((s) => ({ title: s.title, content: s.content })),
      reportNo: report.reportNo,
    };
  }

  /**
   * 单用户 PDF 详版导出：最新 MBTI 报告全文 + 四维度得分。
   * PII：pii=false 时 PDF 内手机/邮箱脱敏（复用 maskPhone/maskEmail）。
   */
  async exportUserReportPdf(id: string | number, pii: boolean): Promise<AdminExportFile> {
    const uid = this.toId(id);
    const src = await this.exportSourceOf(uid);
    if (!src) throw new NotFoundException('用户不存在');
    const buffer = await this.buildUserPdf(src, pii);
    const fileName = `user-${uid.toString()}-report.pdf`;
    return { fileName, contentType: 'application/pdf', buffer };
  }

  /** 生成单用户报告 PDF（复用 CJK 字体逻辑）。 */
  private buildUserPdf(
    src: NonNullable<Awaited<ReturnType<AdminUserService['exportSourceOf']>>>,
    pii: boolean,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new (PDFDocument as any)({ size: 'A4', margin: 50, bufferPages: true }) as typeof PDFDocument;
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fontPath = this.resolveCjkFont();
      if (fontPath && fs.existsSync(fontPath)) doc.registerFont('CJK', fontPath);
      const font = fontPath && fs.existsSync(fontPath) ? 'CJK' : 'Helvetica';

      const u = src.user;
      const phone = (u.phone as string | null) ?? null;
      const email = (u.email as string | null) ?? null;

      doc.font(font).fontSize(20).text('InnerQuest 用户报告（后台导出）', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`昵称：${(u.nickname as string) ?? '-'}`);
      doc.text(`手机：${pii ? (phone ?? '-') : (maskPhone(phone) ?? '-')}`);
      doc.text(`邮箱：${pii ? (email ?? '-') : (maskEmail(email) ?? '-')}`);
      doc.text(`MBTI 类型：${src.mbtiType ?? '未测评'}`);
      if (src.dims) {
        doc.text(`四维度得分：EI=${src.dims.EI} SN=${src.dims.SN} TF=${src.dims.TF} JP=${src.dims.JP}`);
      }
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      for (const section of src.sections) {
        if (doc.y > 700) doc.addPage();
        doc.font(font).fontSize(14).text(section.title, { underline: true });
        doc.moveDown(0.3);
        const text = this.extractSectionText(section.content);
        for (const para of text.split('\n').filter((p) => p.trim())) {
          if (doc.y > 760) doc.addPage();
          doc.font(font).fontSize(10).text(para, { lineGap: 4 });
          doc.moveDown(0.2);
        }
        doc.moveDown(0.5);
      }
      doc.end();
    });
  }

  /** 解析系统可用 CJK 字体路径（与 report.service 保持一致的候选集）。 */
  private resolveCjkFont(): string | null {
    const candidates = [
      'C:/Windows/Fonts/simhei.ttf',
      'C:/Windows/Fonts/simsun.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      '/System/Library/Fonts/PingFang.ttc',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  /** 段落内容 → 可读文本。 */
  private extractSectionText(content: unknown): string {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      const c = content as Record<string, unknown>;
      return (c.text as string) || (c.overview as string) || JSON.stringify(c);
    }
    return String(content);
  }

  /**
   * 批量导出汇总（Excel 兼容 CSV，UTF-8 BOM 防中文乱码）：
   * 一行一用户 = 用户信息 + MBTI 类型 + 四维度分值。筛选参数复用 list 语义。
   * PII：pii=false 时手机/邮箱脱敏（复用 maskPhone/maskEmail），禁绕过权限直出明文。
   */
  async exportUsersSheet(params: {
    status?: number;
    role?: number;
    keyword?: string;
    pii?: boolean;
  }): Promise<AdminExportFile> {
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.status === 0 || params.status === 1) where.status = params.status;
    if (Number.isInteger(params.role)) where.role = params.role;
    if (params.keyword) {
      where.OR = [
        { nickname: { contains: params.keyword } },
        { userNo: { contains: params.keyword } },
        { phone: { contains: params.keyword } },
      ];
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    // 一次性拉取这批用户的报告(desc)，Map 去重取每用户「最新一条」，避免 N+1。
    const userIds = rows.map((r) => (r as unknown as { id: bigint }).id);
    const reports = userIds.length
      ? await this.prisma.report.findMany({
          where: { userId: { in: userIds }, isDeleted: 0 },
          orderBy: { createdAt: 'desc' },
          include: { result: true },
        })
      : [];
    const latestByUser = new Map<string, (typeof reports)[number]>();
    for (const rep of reports) {
      const key = rep.userId.toString();
      if (!latestByUser.has(key)) latestByUser.set(key, rep);
    }

    const pii = !!params.pii;
    const header = [
     '用户ID', '用户编号', '昵称', '手机', '邮箱', '状态', '角色', '是否付费',
      'MBTI类型', 'EI', 'SN', 'TF', 'JP', '注册时间',
    ];
    const lines = [header.map((h) => this.csvCell(h)).join(',')];
    for (const r of rows as unknown as Array<Record<string, any>>) {
      const rep = latestByUser.get(r.id?.toString?.() ?? String(r.id)) ?? null;
      const res = rep?.result ?? null;
      const phone = (r.phone as string | null) ?? null;
      const email = (r.email as string | null) ?? null;
      const cells = [
        r.id?.toString?.() ?? String(r.id),
        r.userNo ?? '',
        r.nickname ?? '',
        pii ? (phone ?? '') : (maskPhone(phone) ?? ''),
        pii ? (email ?? '') : (maskEmail(email) ?? ''),
        r.status === 0 ? '封禁' : '正常',
        String(r.role ?? ''),
        r.isPaid ? '是' : '否',
        rep?.mbtiType ?? '',
        res ? String(Number(res.scoreEi)) : '',
        res ? String(Number(res.scoreSn)) : '',
        res ? String(Number(res.scoreTf)) : '',
        res ? String(Number(res.scoreJp)) : '',
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
      ];
      lines.push(cells.map((c) => this.csvCell(c)).join(','));
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    return {
      fileName: `users-export-${Date.now()}.csv`,
      // Excel 可直接打开 CSV；声明 spreadsheet 类型便于前端识别
      contentType: 'application/vnd.ms-excel; charset=utf-8',
      buffer: Buffer.from(csv, 'utf-8'),
    };
  }

  /** CSV 单元格转义：含逗号/引号/换行时包裹双引号并转义内部引号。 */
  private csvCell(v: unknown): string {
    const s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
}