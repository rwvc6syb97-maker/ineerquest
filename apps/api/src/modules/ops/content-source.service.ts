import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LlmGatewayService } from '../llm-gateway/llm-gateway.service';
import { WebSearchService, WebSearchResult } from './web-search.service';
import { BizCode, BizException } from '../../common/response';
import { CreateSourceTaskDto, UpdateSourceTaskDto } from './content-source.dto';

/**
 * M1 内容可持续化服务 `/admin/content/source-tasks` + 审核/导入导出（PRD 内容升级 §4）。
 *
 * 铁律：
 *  - AI 检索结果一律【草稿态】入库：reviewStatus=1(草稿) + sourceType=2(AI)，待人工审核后方可上线。
 *  - AI 检索采用 RAG 模式：优先经 WebSearchService 联网检索真实网页摘要作为 LLM 上下文，
 *    使候选可溯源；未配置 WEB_SEARCH_API_KEY 时优雅降级为纯 LLM 生成（行为与改造前一致，向后兼容）。
 *  - 触发采用 status=2 并发锁（单实例判定）；重复触发命中 4601。多实例部署需替换为分布式锁（DB 行锁/Redis），已在注释标注。
 *  - LLM 失败或解析失败：任务落 status=4(失败) + errorMsg，不抛系统堆栈给前端。
 */
@Injectable()
export class ContentSourceService {
  private readonly logger = new Logger(ContentSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmGatewayService,
    private readonly webSearch: WebSearchService,
  ) {}

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
      throw new BizException(BizCode.CONTENT_SOURCE_TASK_NOT_FOUND, 'AI 检索任务不存在');
    }
  }

  // ================= AI 检索任务 CRUD =================

  async listTasks(params: { targetType?: number; status?: number; page?: number; pageSize?: number }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(params.pageSize, 100) : 20;
    const where: Record<string, unknown> = {};
    if (params.targetType !== undefined) where.targetType = params.targetType;
    if (params.status !== undefined) where.status = params.status;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contentSourceTask.count({ where }),
      this.prisma.contentSourceTask.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, list: rows.map((r) => this.serialize(r)) };
  }

  async createTask(dto: CreateSourceTaskDto, adminId: bigint) {
    if (!Array.isArray(dto.keywords) || dto.keywords.length === 0) {
      throw new BizException(BizCode.BAD_REQUEST, 'keywords 至少包含 1 个关键词');
    }
    const row = await this.prisma.contentSourceTask.create({
      data: {
        taskName: dto.taskName,
        targetType: dto.targetType,
        keywords: dto.keywords,
        schedule: dto.schedule ?? null,
        status: 1, // 1=待执行
        createdBy: adminId,
      },
    });
    return this.serialize(row);
  }

  async updateTask(id: string, dto: UpdateSourceTaskDto) {
    const tid = this.toId(id);
    const cur = await this.prisma.contentSourceTask.findUnique({ where: { id: tid } });
    if (!cur) throw new BizException(BizCode.CONTENT_SOURCE_TASK_NOT_FOUND, 'AI 检索任务不存在');
    if (cur.status === 2) {
      throw new BizException(BizCode.CONTENT_SOURCE_TASK_RUNNING, '任务执行中，暂不可修改');
    }
    const row = await this.prisma.contentSourceTask.update({
      where: { id: tid },
      data: {
        taskName: dto.taskName ?? undefined,
        targetType: dto.targetType ?? undefined,
        keywords: dto.keywords ?? undefined,
        schedule: dto.schedule ?? undefined,
      },
    });
    return this.serialize(row);
  }

  /**
   * 触发任务执行：并发锁 → AI 检索 → 草稿态入库 → 更新任务状态。
   * 并发锁：以 status=2 为锁标记；单实例内串行保护，重复触发 4601。
   * TODO(multi-instance): 多实例部署需将 status 抢占改为 DB 条件更新（updateMany where status!=2）或 Redis 分布式锁。
   */
  async runTask(id: string) {
    const tid = this.toId(id);
    const cur = await this.prisma.contentSourceTask.findUnique({ where: { id: tid } });
    if (!cur) throw new BizException(BizCode.CONTENT_SOURCE_TASK_NOT_FOUND, 'AI 检索任务不存在');
    if (cur.status === 2) {
      throw new BizException(BizCode.CONTENT_SOURCE_TASK_RUNNING, '任务执行中，请勿重复触发');
    }

    // 抢锁：条件更新（仅当当前非执行中）——降低单实例竞态窗口
    const locked = await this.prisma.contentSourceTask.updateMany({
      where: { id: tid, status: { not: 2 } },
      data: { status: 2, lastRunAt: new Date(), errorMsg: null },
    });
    if (locked.count === 0) {
      throw new BizException(BizCode.CONTENT_SOURCE_TASK_RUNNING, '任务执行中，请勿重复触发');
    }

    const keywords = Array.isArray(cur.keywords) ? (cur.keywords as unknown[]).map(String) : [];
    let inserted = 0;
    let skipped = 0;
    try {
      const candidates = await this.retrieveByLlm(cur.targetType, keywords);
      if (cur.targetType === 1) {
        ({ inserted, skipped } = await this.saveCareerDrafts(candidates));
      } else {
        ({ inserted, skipped } = await this.saveResourceDrafts(candidates));
      }
      await this.prisma.contentSourceTask.update({
        where: { id: tid },
        data: { status: 3, lastResultCount: inserted, errorMsg: null },
      });
      return { taskId: tid.toString(), status: 3, inserted, skipped };
    } catch (e) {
      const msg = (e as Error)?.message ?? 'unknown';
      this.logger.warn(`[source-task-run-fail] task#${tid.toString()}: ${msg}`);
      await this.prisma.contentSourceTask.update({
        where: { id: tid },
        data: { status: 4, errorMsg: msg.slice(0, 255) },
      });
      return { taskId: tid.toString(), status: 4, inserted: 0, skipped: 0, errorMsg: msg.slice(0, 255) };
    }
  }

  /**
   * RAG 模式产出候选条目（岗位/资源）。
   * 先经 WebSearchService 联网检索真实网页摘要（未配置则降级空），拼入 LLM context 作为可溯源上下文；
   * 检索为空时回退纯 LLM 生成。返回结构化数组；解析失败抛错由 runTask 落 status=4。
   */
  private async retrieveByLlm(
    targetType: number,
    keywords: string[],
  ): Promise<Array<Record<string, unknown>>> {
    const isCareer = targetType === 1;
    const schema = isCareer
      ? '[{"name":"职业名","category":"分类","description":"简介","responsibility":"职责","suitTypes":"适配MBTI逗号分隔"}]'
      : '[{"title":"资源标题","resourceType":1,"url":"链接","provider":"来源","summary":"摘要","skillTags":"技能逗号分隔"}]';

    // RAG：联网检索真实网页摘要（无 Key/失败均降级为空，绝不阻断）
    const hits = await this.webSearch.searchMany(keywords).catch(() => [] as WebSearchResult[]);
    const evidence = this.buildEvidence(hits);
    const contextBase = `目标类型：${isCareer ? '职业岗位' : '学习资源'}；关键词：${keywords.join('、')}。`;
    const context = evidence
      ? `${contextBase}\n以下为联网检索到的真实网页摘要，请【基于】这些资料生成候选（可提炼、去重、结构化，不得编造资料外链接）：\n${evidence}`
      : contextBase;
    const system = evidence
      ? '你是内容运营助手，根据提供的联网检索资料生成结构化候选条目，仅输出 JSON 数组，不要额外解释。'
      : '你是内容运营助手，根据关键词生成结构化候选条目，仅输出 JSON 数组，不要额外解释。';

    const res = await this.llm.chat({
      prompt: {
        system,
        context,
        user: `请生成 3~8 条候选，严格按此 JSON schema 输出：${schema}`,
      },
      scene: 'content-source-task',
    });
    const parsed = this.extractJsonArray(res.text);
    if (!parsed || parsed.length === 0) {
      throw new Error(res.degraded ? 'LLM 降级无有效候选' : 'LLM 返回无法解析为候选数组');
    }
    return parsed;
  }

  /** 将联网检索结果压缩为编号证据文本（截断防超长/防注入：仅作资料非指令）。 */
  private buildEvidence(hits: WebSearchResult[]): string {
    if (!hits || hits.length === 0) return '';
    return hits
      .slice(0, 8)
      .map((h, i) => {
        const title = (h.title ?? '').slice(0, 120);
        const snippet = (h.snippet ?? '').slice(0, 240);
        const url = (h.url ?? '').slice(0, 300);
        return `${i + 1}. ${title}${url ? `（${url}）` : ''}：${snippet}`;
      })
      .join('\n');
  }

  /** 从 LLM 文本中提取 JSON 数组（容忍围栏/前后缀噪声）。 */
  private extractJsonArray(text: string): Array<Record<string, unknown>> | null {
    if (!text) return null;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object') : null;
    } catch {
      return null;
    }
  }

  /** 草稿态职业入库：sourceType=2(AI)+reviewStatus=1(草稿)，careerCode 自动补编码；去重 skip。 */
  private async saveCareerDrafts(
    candidates: Array<Record<string, unknown>>,
  ): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const c of candidates) {
      const name = typeof c.name === 'string' ? c.name.trim() : '';
      if (!name) {
        skipped++;
        continue;
      }
      const careerCode = this.genCode('AI');
      const dup = await this.prisma.career.findFirst({ where: { name, isDeleted: 0 } });
      if (dup) {
        skipped++;
        continue;
      }
      await this.prisma.career.create({
        data: {
          careerCode,
          name,
          category: typeof c.category === 'string' ? c.category.slice(0, 32) : '未分类',
          description: typeof c.description === 'string' ? c.description : null,
          responsibility: typeof c.responsibility === 'string' ? c.responsibility : null,
          suitTypes: typeof c.suitTypes === 'string' ? c.suitTypes.slice(0, 128) : null,
          sourceType: 2, // AI
          reviewStatus: 1, // 草稿，待人工审核
          status: 1,
        },
      });
      inserted++;
    }
    return { inserted, skipped };
  }

  /** 草稿态资源入库：sourceType=2(AI)+reviewStatus=1(草稿)，resourceCode 自动补编码；按 title 去重。 */
  private async saveResourceDrafts(
    candidates: Array<Record<string, unknown>>,
  ): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0;
    let skipped = 0;
    for (const c of candidates) {
      const title = typeof c.title === 'string' ? c.title.trim() : '';
      if (!title) {
        skipped++;
        continue;
      }
      const dup = await this.prisma.learningResource.findFirst({ where: { title, isDeleted: 0 } });
      if (dup) {
        skipped++;
        continue;
      }
      const rt = typeof c.resourceType === 'number' && [1, 2, 3, 4].includes(c.resourceType)
        ? c.resourceType
        : 2;
      await this.prisma.learningResource.create({
        data: {
          resourceCode: this.genCode('AIR'),
          title,
          resourceType: rt,
          url: typeof c.url === 'string' ? c.url.slice(0, 512) : null,
          provider: typeof c.provider === 'string' ? c.provider.slice(0, 64) : null,
          summary: typeof c.summary === 'string' ? c.summary : null,
          skillTags: typeof c.skillTags === 'string' ? c.skillTags.slice(0, 255) : null,
          sourceType: 2,
          reviewStatus: 1,
          status: 1,
        },
      });
      inserted++;
    }
    return { inserted, skipped };
  }

  /** 生成去重编码（前缀+时间戳+随机）。 */
  private genCode(prefix: string): string {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 6);
    return `${prefix}-${ts}${rnd}`.toUpperCase();
  }

  async taskDetail(id: string) {
    const tid = this.toId(id);
    const row = await this.prisma.contentSourceTask.findUnique({ where: { id: tid } });
    if (!row) throw new BizException(BizCode.CONTENT_SOURCE_TASK_NOT_FOUND, 'AI 检索任务不存在');
    return this.serialize(row);
  }

  async removeTask(id: string) {
    const tid = this.toId(id);
    const cur = await this.prisma.contentSourceTask.findUnique({ where: { id: tid } });
    if (!cur) throw new BizException(BizCode.CONTENT_SOURCE_TASK_NOT_FOUND, 'AI 检索任务不存在');
    if (cur.status === 2) {
      throw new BizException(BizCode.CONTENT_SOURCE_TASK_RUNNING, '任务执行中，暂不可删除');
    }
    await this.prisma.contentSourceTask.delete({ where: { id: tid } });
    return { taskId: tid.toString(), deleted: true };
  }

  // ================= 内容审核流转（岗位/资源共用）=================

  /**
   * 审核流转合法性：草稿(1)→上线(2)/下线(3)；上线(2)⇄下线(3)可互转。
   * 目标 reviewStatus 仅允许 2/3（DTO 已 IsIn），此处再做「当前态→目标态」服务端二次判定。
   * 非法流转命中 4605。
   */
  private assertReviewTransition(from: number, to: number): void {
    const allowed: Record<number, number[]> = { 1: [2, 3], 2: [3], 3: [2] };
    if (!allowed[from] || !allowed[from].includes(to)) {
      throw new BizException(
        BizCode.CONTENT_REVIEW_STATUS_INVALID,
        `非法的审核流转：${from} → ${to}`,
      );
    }
  }

  async reviewCareer(id: string, reviewStatus: number, remark?: string) {
    const cid = this.toId(id);
    const cur = await this.prisma.career.findFirst({ where: { id: cid, isDeleted: 0 } });
    if (!cur) throw new BizException(BizCode.NOT_FOUND, '职业不存在');
    this.assertReviewTransition(cur.reviewStatus, reviewStatus);
    const row = await this.prisma.career.update({
      where: { id: cid },
      data: {
        reviewStatus,
        // 审核通过(上线)则状态置启用，下线置停用，与列表可见性对齐
        status: reviewStatus === 2 ? 1 : 0,
      },
    });
    void remark; // remark 由审计中间件记录，不落业务表
    return this.serialize(row);
  }

  async reviewResource(id: string, reviewStatus: number, remark?: string) {
    const rid = this.toId(id);
    const cur = await this.prisma.learningResource.findFirst({ where: { id: rid, isDeleted: 0 } });
    if (!cur) throw new BizException(BizCode.NOT_FOUND, '学习资源不存在');
    this.assertReviewTransition(cur.reviewStatus, reviewStatus);
    const row = await this.prisma.learningResource.update({
      where: { id: rid },
      data: { reviewStatus, status: reviewStatus === 2 ? 1 : 0 },
    });
    void remark;
    return this.serialize(row);
  }

  // ================= 导入 / 导出（CSV, UTF-8 BOM）=================

  private readonly CAREER_HEADER = ['careerCode', 'name', 'category', 'description', 'suitTypes'];
  private readonly RESOURCE_HEADER = ['resourceCode', 'title', 'resourceType', 'url', 'provider', 'skillTags'];

  /** 极简 CSV 解析：按行、逗号切分，支持双引号包裹与转义。 */
  private parseCsv(content: string): string[][] {
    const text = content.replace(/^\uFEFF/, ''); // 去 BOM
    const rows: string[][] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      if (rawLine.trim() === '') continue;
      const cells: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < rawLine.length; i++) {
        const ch = rawLine[i];
        if (inQuote) {
          if (ch === '"' && rawLine[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') {
            inQuote = false;
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuote = true;
        } else if (ch === ',') {
          cells.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur);
      rows.push(cells.map((c) => c.trim()));
    }
    return rows;
  }

  /** 导入职业 CSV：表头非法 4602；逐行校验，非法行收集入 failRows(不整批中断)。 */
  async importCareers(content: string) {
    const rows = this.parseCsv(content);
    if (rows.length === 0) {
      throw new BizException(BizCode.CONTENT_IMPORT_FORMAT_INVALID, 'CSV 内容为空');
    }
    const header = rows[0];
    if (header.join(',') !== this.CAREER_HEADER.join(',')) {
      throw new BizException(
        BizCode.CONTENT_IMPORT_FORMAT_INVALID,
        `表头非法，应为：${this.CAREER_HEADER.join(',')}`,
      );
    }
    let inserted = 0;
    const failRows: Array<{ row: number; reason: string }> = [];
    for (let i = 1; i < rows.length; i++) {
      const [careerCode, name, category, description, suitTypes] = rows[i];
      if (!name || !category) {
        failRows.push({ row: i + 1, reason: 'name/category 必填' });
        continue;
      }
      const code = careerCode || this.genCode('IMP');
      const dup = await this.prisma.career.findFirst({
        where: { OR: [{ careerCode: code }, { name }], isDeleted: 0 },
      });
      if (dup) {
        failRows.push({ row: i + 1, reason: '编码或名称已存在' });
        continue;
      }
      await this.prisma.career.create({
        data: {
          careerCode: code,
          name: name.slice(0, 64),
          category: category.slice(0, 32),
          description: description || null,
          suitTypes: suitTypes ? suitTypes.slice(0, 128) : null,
          sourceType: 3, // 导入
          reviewStatus: 1, // 草稿态，待审核
          status: 1,
        },
      });
      inserted++;
    }
    return { total: rows.length - 1, inserted, failCount: failRows.length, failRows };
  }

  /** 导入资源 CSV：表头非法 4602；行级校验收集 failRows。 */
  async importResources(content: string) {
    const rows = this.parseCsv(content);
    if (rows.length === 0) {
      throw new BizException(BizCode.CONTENT_IMPORT_FORMAT_INVALID, 'CSV 内容为空');
    }
    const header = rows[0];
    if (header.join(',') !== this.RESOURCE_HEADER.join(',')) {
      throw new BizException(
        BizCode.CONTENT_IMPORT_FORMAT_INVALID,
        `表头非法，应为：${this.RESOURCE_HEADER.join(',')}`,
      );
    }
    let inserted = 0;
    const failRows: Array<{ row: number; reason: string }> = [];
    for (let i = 1; i < rows.length; i++) {
      const [resourceCode, title, resourceType, url, provider, skillTags] = rows[i];
      if (!title) {
        failRows.push({ row: i + 1, reason: 'title 必填' });
        continue;
      }
      const rt = Number(resourceType);
      if (!Number.isInteger(rt) || ![1, 2, 3, 4].includes(rt)) {
        failRows.push({ row: i + 1, reason: 'resourceType 须为 1~4' });
        continue;
      }
      const code = resourceCode || this.genCode('IMR');
      const dup = await this.prisma.learningResource.findFirst({
        where: { OR: [{ resourceCode: code }, { title }], isDeleted: 0 },
      });
      if (dup) {
        failRows.push({ row: i + 1, reason: '编码或标题已存在' });
        continue;
      }
      await this.prisma.learningResource.create({
        data: {
          resourceCode: code,
          title: title.slice(0, 128),
          resourceType: rt,
          url: url ? url.slice(0, 512) : null,
          provider: provider ? provider.slice(0, 64) : null,
          skillTags: skillTags ? skillTags.slice(0, 255) : null,
          sourceType: 3,
          reviewStatus: 1,
          status: 1,
        },
      });
      inserted++;
    }
    return { total: rows.length - 1, inserted, failCount: failRows.length, failRows };
  }

  private csvCell(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** 导出职业为 CSV（UTF-8 BOM）。 */
  async exportCareers(): Promise<{ fileName: string; contentType: string; content: string }> {
    const rows = await this.prisma.career.findMany({ where: { isDeleted: 0 }, orderBy: { id: 'asc' } });
    const lines = [this.CAREER_HEADER.join(',')];
    for (const r of rows) {
      lines.push(
        [r.careerCode, r.name, r.category, r.description, r.suitTypes].map((c) => this.csvCell(c)).join(','),
      );
    }
    return {
      fileName: `careers_${Date.now()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: '\uFEFF' + lines.join('\r\n'),
    };
  }

  /** 导出学习资源为 CSV（UTF-8 BOM）。 */
  async exportResources(): Promise<{ fileName: string; contentType: string; content: string }> {
    const rows = await this.prisma.learningResource.findMany({ where: { isDeleted: 0 }, orderBy: { id: 'asc' } });
    const lines = [this.RESOURCE_HEADER.join(',')];
    for (const r of rows) {
      lines.push(
        [r.resourceCode, r.title, r.resourceType, r.url, r.provider, r.skillTags]
          .map((c) => this.csvCell(c))
          .join(','),
      );
    }
    return {
      fileName: `resources_${Date.now()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: '\uFEFF' + lines.join('\r\n'),
    };
  }
}