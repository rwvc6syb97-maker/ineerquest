import { Injectable, Logger } from '@nestjs/common';

/** 单条联网检索结果（供 RAG 上下文拼装）。 */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * P2② 联网检索层（M1 内容可持续化真联网增强）。
 *
 * 定位：为 AI 内容检索提供【真实网页】检索结果，作为 LLM 的 RAG 上下文，
 *   使候选条目不再仅凭模型内部知识，而是基于当下真实网页摘要生成 → 可溯源。
 *
 * 铁律与边界：
 *  - 零硬编码密钥：API Key 一律走环境变量 WEB_SEARCH_API_KEY，缺失即视为未启用。
 *  - 优雅降级：未配置/超时/异常一律返回空数组，绝不抛错阻断上层检索任务
 *    （上层无检索结果时回退纯 LLM 生成，行为与改造前一致，向后兼容）。
 *  - 兼容 Serper.dev（默认）与任意返回 {organic:[{title,link,snippet}]} 的 JSON 搜索 API。
 *    通过 WEB_SEARCH_API_URL 覆盖端点，便于切换 Bing/SearXNG 等自建代理。
 */
@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  /** 默认 Serper.dev；可用 WEB_SEARCH_API_URL 覆盖为自建/其他兼容端点。 */
  private get endpoint(): string {
    return process.env.WEB_SEARCH_API_URL ?? 'https://google.serper.dev/search';
  }

  private get apiKey(): string {
    return process.env.WEB_SEARCH_API_KEY ?? '';
  }

  /** 单次检索超时（毫秒），默认 8s；超时降级返回空。 */
  private get timeoutMs(): number {
    const raw = Number(process.env.WEB_SEARCH_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 8000;
  }

  /** 是否已配置可用的联网检索能力（Key 存在且非占位）。 */
  isEnabled(): boolean {
    const key = this.apiKey;
    return !!key && key !== 'CHANGE_ME';
  }

  /**
   * 联网检索，返回 topK 条结果。未启用/失败一律返回 []（不抛错、不阻断）。
   * @param query 检索关键词
   * @param topK 取前 N 条（默认 6，上限 10）
   */
  async search(query: string, topK = 6): Promise<WebSearchResult[]> {
    if (!this.isEnabled()) {
      this.logger.debug('[web-search] 未配置 WEB_SEARCH_API_KEY，降级返回空（回退纯 LLM 生成）');
      return [];
    }
    const q = (query ?? '').trim();
    if (!q) return [];
    const num = Math.min(Math.max(topK, 1), 10);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q, num }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        this.logger.warn(`[web-search] 上游返回 ${resp.status}，降级返回空`);
        return [];
      }
      const data = (await resp.json()) as unknown;
      return this.normalize(data, num);
    } catch (err) {
      // 超时(abort)/网络异常一律降级，不阻断上层
      this.logger.warn(`[web-search] 检索降级：${(err as Error)?.message ?? 'unknown'}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 多关键词批量检索并去重合并（按 url 去重）。
   * 关键词间串行以复用超时预算，任一失败不影响其他（各自降级）。
   */
  async searchMany(keywords: string[], topKPerQuery = 4): Promise<WebSearchResult[]> {
    if (!this.isEnabled()) return [];
    const seen = new Set<string>();
    const merged: WebSearchResult[] = [];
    for (const kw of keywords.filter((k) => !!k && k.trim())) {
      const list = await this.search(kw, topKPerQuery);
      for (const item of list) {
        if (item.url && seen.has(item.url)) continue;
        if (item.url) seen.add(item.url);
        merged.push(item);
      }
    }
    return merged;
  }

  /** 归一化上游响应为 WebSearchResult[]；兼容 Serper organic / 通用 results 结构。 */
  private normalize(data: unknown, num: number): WebSearchResult[] {
    if (!data || typeof data !== 'object') return [];
    const obj = data as Record<string, unknown>;
    const rawList =
      (Array.isArray(obj.organic) && obj.organic) ||
      (Array.isArray(obj.results) && obj.results) ||
      [];
    const out: WebSearchResult[] = [];
    for (const r of rawList as Array<Record<string, unknown>>) {
      if (out.length >= num) break;
      const title = typeof r.title === 'string' ? r.title : '';
      const url = typeof r.link === 'string' ? r.link : typeof r.url === 'string' ? r.url : '';
      const snippet =
        typeof r.snippet === 'string'
          ? r.snippet
          : typeof r.description === 'string'
            ? r.description
            : '';
      if (!title && !snippet) continue;
      out.push({ title, url, snippet });
    }
    return out;
  }
}