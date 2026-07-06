import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  CreateCareerDto,
  CreateResourceDto,
  CreateTopicDto,
  ReviewTopicDto,
  UpdateCareerDto,
  UpdateResourceDto,
  UpdateTopicDto,
} from './admin-content.dto';

/**
 * T4-16 内容管理服务 `/admin/content/*`。
 *
 * 覆盖：职业库 Career（career:*）、学习资源库 LearningResource（resource:*）的 CRUD。
 * 写操作触发搜索引擎增量索引 —— 当前无 ES 实例（infra 未集成 Elasticsearch），
 * 通过 reindex() 做 try-catch 降级占位，返回 indexed 标记；真实 ES 接入为 blocked 项。
 * 话题管理 topic:review 无对应 Prisma model，视为 blocked（见待办清单）。
 */
@Injectable()
export class AdminContentService {
  private readonly logger = new Logger(AdminContentService.name);

  constructor(private readonly prisma: PrismaService) {}

  private serialize<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'bigint' ? v.toString() : v;
    }
    return out;
  }

  private toId(id: string | number, label = '内容'): bigint {
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException(`无效的${label} ID`);
    }
  }

  /**
   * 搜索引擎增量索引降级钩子。ES 未接入时仅记录日志并返回 indexed=false，
   * 保证 CRUD 主流程不受外部依赖不可用影响。
   */
  private async reindex(entity: string, id: bigint, action: 'upsert' | 'remove'): Promise<boolean> {
    try {
      // TODO(blocked): 接入 Elasticsearch 后在此推送增量索引。
      this.logger.debug(`[reindex-skip] ${entity}#${id.toString()} ${action} (ES 未接入，已降级)`);
      return false;
    } catch (e) {
      this.logger.warn(`[reindex-fail] ${entity}#${id.toString()} ${action}: ${(e as Error).message}`);
      return false;
    }
  }

  // ================= 职业库 Career =================

  async listCareers(params: {
    category?: string;
    status?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 20;
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.category) where.category = params.category;
    if (params.status !== undefined) where.status = params.status;
    if (params.keyword) {
      where.OR = [
        { name: { contains: params.keyword } },
        { careerCode: { contains: params.keyword } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.career.count({ where }),
      this.prisma.career.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, list: rows.map((r) => this.serialize(r)) };
  }

  async careerDetail(id: string) {
    const row = await this.prisma.career.findFirst({
      where: { id: this.toId(id, '职业'), isDeleted: 0 },
      include: { skills: true },
    });
    if (!row) throw new NotFoundException('职业不存在');
    return {
      ...this.serialize(row),
      skills: (row.skills ?? []).map((s) => this.serialize(s)),
    };
  }

  async careerSnapshot(id: string) {
    const row = await this.prisma.career.findFirst({
      where: { id: this.toId(id, '职业') },
      select: { id: true, name: true, status: true, isDeleted: true },
    });
    return row ? this.serialize(row) : null;
  }

  async createCareer(dto: CreateCareerDto) {
    const exists = await this.prisma.career.findFirst({ where: { careerCode: dto.careerCode } });
    if (exists) throw new BadRequestException('职业编码已存在');
    const row = await this.prisma.career.create({
      data: {
        careerCode: dto.careerCode,
        name: dto.name,
        category: dto.category,
        description: dto.description ?? null,
        responsibility: dto.responsibility ?? null,
        salaryMin: dto.salaryMin ?? null,
        salaryMax: dto.salaryMax ?? null,
        prospect: dto.prospect ?? null,
        suitTypes: dto.suitTypes ?? null,
        status: dto.status ?? 1,
      },
    });
    const indexed = await this.reindex('career', row.id, 'upsert');
    return { ...this.serialize(row), indexed };
  }

  async updateCareer(id: string, dto: UpdateCareerDto) {
    const cid = this.toId(id, '职业');
    const cur = await this.prisma.career.findFirst({ where: { id: cid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('职业不存在');
    const row = await this.prisma.career.update({
      where: { id: cid },
      data: {
        name: dto.name ?? undefined,
        category: dto.category ?? undefined,
        description: dto.description ?? undefined,
        responsibility: dto.responsibility ?? undefined,
        salaryMin: dto.salaryMin ?? undefined,
        salaryMax: dto.salaryMax ?? undefined,
        prospect: dto.prospect ?? undefined,
        suitTypes: dto.suitTypes ?? undefined,
        status: dto.status ?? undefined,
      },
    });
    const indexed = await this.reindex('career', row.id, 'upsert');
    return { ...this.serialize(row), indexed };
  }

  async removeCareer(id: string, reason?: string) {
    const cid = this.toId(id, '职业');
    const cur = await this.prisma.career.findFirst({ where: { id: cid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('职业不存在');
    await this.prisma.career.update({
      where: { id: cid },
      data: { isDeleted: 1, status: 0, deletedAt: new Date() },
    });
    const indexed = await this.reindex('career', cid, 'remove');
    return { id: cid.toString(), removed: true, indexed, reason: reason ?? null };
  }

  // ================= 学习资源库 LearningResource =================

  async listResources(params: {
    resourceType?: number;
    status?: number;
    careerId?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 20;
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.resourceType !== undefined) where.resourceType = params.resourceType;
    if (params.status !== undefined) where.status = params.status;
    if (params.careerId) where.careerId = this.toId(params.careerId, '职业');
    if (params.keyword) where.title = { contains: params.keyword };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.learningResource.count({ where }),
      this.prisma.learningResource.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, list: rows.map((r) => this.serialize(r)) };
  }

  async resourceSnapshot(id: string) {
    const row = await this.prisma.learningResource.findFirst({
      where: { id: this.toId(id, '资源') },
      select: { id: true, title: true, status: true, isDeleted: true },
    });
    return row ? this.serialize(row) : null;
  }

  async createResource(dto: CreateResourceDto) {
    const row = await this.prisma.learningResource.create({
      data: {
        title: dto.title,
        resourceType: dto.resourceType,
        url: dto.url ?? null,
        skillTags: dto.skillTags ?? null,
        careerId: dto.careerId ? this.toId(dto.careerId, '职业') : null,
        provider: dto.provider ?? null,
        status: dto.status ?? 1,
      },
    });
    const indexed = await this.reindex('resource', row.id, 'upsert');
    return { ...this.serialize(row), indexed };
  }

  async updateResource(id: string, dto: UpdateResourceDto) {
    const rid = this.toId(id, '资源');
    const cur = await this.prisma.learningResource.findFirst({ where: { id: rid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('资源不存在');
    const row = await this.prisma.learningResource.update({
      where: { id: rid },
      data: {
        title: dto.title ?? undefined,
        resourceType: dto.resourceType ?? undefined,
        url: dto.url ?? undefined,
        skillTags: dto.skillTags ?? undefined,
        careerId: dto.careerId ? this.toId(dto.careerId, '职业') : undefined,
        provider: dto.provider ?? undefined,
        status: dto.status ?? undefined,
      },
    });
    const indexed = await this.reindex('resource', row.id, 'upsert');
    return { ...this.serialize(row), indexed };
  }

  async removeResource(id: string, reason?: string) {
    const rid = this.toId(id, '资源');
    const cur = await this.prisma.learningResource.findFirst({ where: { id: rid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('资源不存在');
    await this.prisma.learningResource.update({
      where: { id: rid },
      data: { isDeleted: 1, status: 0, deletedAt: new Date() },
    });
    const indexed = await this.reindex('resource', rid, 'remove');
    return { id: rid.toString(), removed: true, indexed, reason: reason ?? null };
  }

  // ================= 话题管理 Topic =================

  async listTopics(params: {
    auditStatus?: number;
    status?: number;
    category?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 20;
    const where: Record<string, unknown> = { isDeleted: 0 };
    if (params.auditStatus !== undefined) (where as any).auditStatus = params.auditStatus;
    if (params.status !== undefined) (where as any).status = params.status;
    if (params.category) (where as any).category = params.category;
    if (params.keyword) {
      (where as any).OR = [
        { title: { contains: params.keyword } },
        { content: { contains: params.keyword } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.topic.count({ where }),
      this.prisma.topic.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, list: rows.map((r) => this.serialize(r)) };
  }

  async topicDetail(id: string) {
    const row = await this.prisma.topic.findFirst({
      where: { id: this.toId(id, '话题'), isDeleted: 0 },
    });
    if (!row) throw new NotFoundException('话题不存在');
    return this.serialize(row);
  }

  async topicSnapshot(id: string) {
    const row = await this.prisma.topic.findFirst({
      where: { id: this.toId(id, '话题') },
      select: { id: true, title: true, auditStatus: true, status: true, isDeleted: true },
    });
    return row ? this.serialize(row) : null;
  }

  async createTopic(dto: CreateTopicDto, authorId: bigint) {
    const row = await this.prisma.topic.create({
      data: {
        title: dto.title,
        content: dto.content,
        category: dto.category ?? null,
        tags: dto.tags ?? null,
        authorId,
        auditStatus: 0,
        status: 1,
        isPinned: dto.isPinned ?? 0,
      },
    });
    return this.serialize(row);
  }

  async updateTopic(id: string, dto: UpdateTopicDto) {
    const tid = this.toId(id, '话题');
    const cur = await this.prisma.topic.findFirst({ where: { id: tid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('话题不存在');
    const row = await this.prisma.topic.update({
      where: { id: tid },
      data: {
        title: dto.title ?? undefined,
        content: dto.content ?? undefined,
        category: dto.category ?? undefined,
        tags: dto.tags ?? undefined,
        isPinned: dto.isPinned ?? undefined,
        status: dto.status ?? undefined,
      },
    });
    return this.serialize(row);
  }

  async removeTopic(id: string, reason?: string) {
    const tid = this.toId(id, '话题');
    const cur = await this.prisma.topic.findFirst({ where: { id: tid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('话题不存在');
    await this.prisma.topic.update({
      where: { id: tid },
      data: { isDeleted: 1, status: 0, deletedAt: new Date() },
    });
    return { id: tid.toString(), removed: true, reason: reason ?? null };
  }

  async reviewTopic(id: string, dto: ReviewTopicDto) {
    const tid = this.toId(id, '话题');
    const cur = await this.prisma.topic.findFirst({ where: { id: tid, isDeleted: 0 } });
    if (!cur) throw new NotFoundException('话题不存在');
    const row = await this.prisma.topic.update({
      where: { id: tid },
      data: { auditStatus: dto.auditStatus, status: dto.auditStatus === 1 ? 1 : 0 },
    });
    return this.serialize(row);
  }
}