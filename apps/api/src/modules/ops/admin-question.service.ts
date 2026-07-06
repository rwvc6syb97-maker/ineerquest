import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  BatchStatusDto,
  CreateQuestionDto,
  ImportQuestionsDto,
  UpdateQuestionDto,
} from './admin-question.dto';

/**
 * T4-13 题库管理服务 `/admin/questions/*`（权限 question:read / question:write）。
 *
 * 复用 Prisma model AssessmentQuestion（含 version 版本隔离 / status 上下架 / isDeleted 软删除）
 * 与 AssessmentOption（选项）。无独立 Question model，题库即评估题目表。
 * 所有写操作在 controller 层挂 @Audit 落审计（前值经 setAuditBefore 快照）。
 */
@Injectable()
export class AdminQuestionService {
  constructor(private readonly prisma: PrismaService) {}

  /** BigInt 主键统一序列化为字符串，避免 JSON 序列化抛错。 */
  private serialize<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'bigint' ? v.toString() : v;
    }
    return out;
  }

  private toId(id: string | number): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException('无效的题目 ID');
    }
  }

  /** 分页列表：支持按 version / status / dimension 过滤，默认排除软删除。 */
  async list(params: {
    version?: string;
    status?: number;
    dimension?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.version) where.version = params.version;
    if (params.status === 0 || params.status === 1) where.status = params.status;
    if (Number.isInteger(params.dimension)) where.dimension = params.dimension;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.assessmentQuestion.count({ where }),
      this.prisma.assessmentQuestion.findMany({
        where,
        orderBy: [{ version: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      list: rows.map((r) => ({
        ...this.serialize(r as unknown as Record<string, unknown>),
        options: (r.options ?? []).map((o) =>
          this.serialize(o as unknown as Record<string, unknown>),
        ),
      })),
    };
  }

  /** 详情（含选项）。 */
  async detail(id: string | number) {
    const row = await this.prisma.assessmentQuestion.findFirst({
      where: { id: this.toId(id), isDeleted: 0 },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) throw new NotFoundException('题目不存在');
    return {
      ...this.serialize(row as unknown as Record<string, unknown>),
      options: (row.options ?? []).map((o) =>
        this.serialize(o as unknown as Record<string, unknown>),
      ),
    };
  }

  /** 创建题目（可含选项），默认下架状态待复核后上架。 */
  async create(dto: CreateQuestionDto) {
    const created = await this.prisma.assessmentQuestion.create({
      data: {
        version: dto.version ?? 'v1',
        dimension: dto.dimension,
        content: dto.content,
        sortOrder: dto.sortOrder ?? 0,
        isReverse: dto.isReverse ?? 0,
        status: 0,
        options: dto.options?.length
          ? {
              create: dto.options.map((o, i) => ({
                content: o.content,
                optionKey: o.optionKey,
                polarity: o.polarity,
                score: o.score ?? 1,
                sortOrder: o.sortOrder ?? i,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });
    return this.serialize(created as unknown as Record<string, unknown>);
  }

  /** 更新题目基础字段；若传 options 则整体替换选项。 */
  async update(id: string | number, dto: UpdateQuestionDto) {
    const qid = this.toId(id);
    const exists = await this.prisma.assessmentQuestion.findFirst({
      where: { id: qid, isDeleted: 0 },
    });
    if (!exists) throw new NotFoundException('题目不存在');

    return this.prisma.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (dto.version !== undefined) data.version = dto.version;
      if (dto.dimension !== undefined) data.dimension = dto.dimension;
      if (dto.content !== undefined) data.content = dto.content;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.isReverse !== undefined) data.isReverse = dto.isReverse;

      const updated = await tx.assessmentQuestion.update({ where: { id: qid }, data });

      if (dto.options) {
        await tx.assessmentOption.deleteMany({ where: { questionId: qid } });
        if (dto.options.length) {
          await tx.assessmentOption.createMany({
            data: dto.options.map((o, i) => ({
              questionId: qid,
              content: o.content,
              optionKey: o.optionKey,
              polarity: o.polarity,
              score: o.score ?? 1,
              sortOrder: o.sortOrder ?? i,
            })),
          });
        }
      }
      return this.serialize(updated as unknown as Record<string, unknown>);
    });
  }

  /** 软删除（isDeleted=1 + deletedAt），同时下架。 */
  async remove(id: string | number) {
    const qid = this.toId(id);
    const exists = await this.prisma.assessmentQuestion.findFirst({
      where: { id: qid, isDeleted: 0 },
    });
    if (!exists) throw new NotFoundException('题目不存在');
    await this.prisma.assessmentQuestion.update({
      where: { id: qid },
      data: { isDeleted: 1, status: 0, deletedAt: new Date() },
    });
    return { id: qid.toString(), deleted: true };
  }

  /** 批量上下架（status 0/1）。仅作用于未软删除题目。 */
  async batchStatus(dto: BatchStatusDto) {
    const ids = dto.ids.map((i) => this.toId(i));
    if (!ids.length) throw new BadRequestException('ids 不能为空');
    const res = await this.prisma.assessmentQuestion.updateMany({
      where: { id: { in: ids }, isDeleted: 0 },
      data: { status: dto.status },
    });
    return { affected: res.count, status: dto.status, reason: dto.reason };
  }

  /**
   * 批量导入题库（按 version 隔离）。整批事务写入，任一失败回滚。
   * 导入的题目默认下架（status=0），复核后再批量上架。
   */
  async import(dto: ImportQuestionsDto) {
    if (!dto.items?.length) throw new BadRequestException('items 不能为空');
    const version = dto.version ?? 'v1';

    const created = await this.prisma.$transaction(async (tx) => {
      const results: string[] = [];
      for (let i = 0; i < dto.items.length; i++) {
        const q = dto.items[i];
        const row = await tx.assessmentQuestion.create({
          data: {
            version: q.version ?? version,
            dimension: q.dimension,
            content: q.content,
            sortOrder: q.sortOrder ?? i,
            isReverse: q.isReverse ?? 0,
            status: 0,
            options: q.options?.length
              ? {
                  create: q.options.map((o, j) => ({
                    content: o.content,
                    optionKey: o.optionKey,
                    polarity: o.polarity,
                    score: o.score ?? 1,
                    sortOrder: o.sortOrder ?? j,
                  })),
                }
              : undefined,
          },
        });
        results.push(row.id.toString());
      }
      return results;
    });

    return { version, imported: created.length, ids: created };
  }
}