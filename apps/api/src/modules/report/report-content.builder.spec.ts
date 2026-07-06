import { buildSections, describeDimension, getProfile } from './report-content.builder';
import { DEEP_SECTION_FALLBACK, PAID_SECTION_KEYS } from './report.constants';

describe('report-content.builder（纯函数）', () => {
  describe('getProfile', () => {
    it('已知类型返回对应 profile', () => {
      const p = getProfile('INTJ');
      expect(p).toBeDefined();
      expect(p.nickname).toBeTruthy();
    });

    it('未知/空类型回落兜底 profile', () => {
      const p = getProfile('ZZZZ');
      expect(p).toBeDefined();
      expect(p.overview).toBeTruthy();
    });

    it('大小写不感', () => {
      expect(getProfile('intj')).toEqual(getProfile('INTJ'));
    });
  });

  describe('describeDimension', () => {
    it('>50 偏 first 极', () => {
      const r = describeDimension('EI', 80);
      expect(r.percent).toBe(80);
      expect(r.leaning).toBeTruthy();
    });

    it('<50 偏 second', () => {
      const r = describeDimension('TF', 20);
      expect(r.percent).toBe(20);
    });

    it('=50 平衡', () => {
      const r = describeDimension('JP', 50);
      expect(r.leaning).toContain('平衡');
    });

    it('越得分被裁剪到 0~100', () => {
      expect(describeDimension('SN', 200).percent).toBe(100);
      expect(describeDimension('SN', -10).percent).toBe(0);
    });
  });

  describe('buildSections', () => {
    const scores = { EI: 60, SN: 40, TF: 55, JP: 45 };

    it('免费段落 3 个（非付费），付费段落与 PAID_SECTION_KEYS 一致', () => {
      const sections = buildSections('INTJ', scores);
      const free = sections.filter((s) => !s.paid);
      const paid = sections.filter((s) => s.paid);
      expect(free).toHaveLength(3);
      expect(paid.map((s) => s.sectionKey).sort()).toEqual([...PAID_SECTION_KEYS].sort());
    });

    it('sortOrder 连续递增', () => {
      const sections = buildSections('INTJ', scores);
      const orders = sections.map((s) => s.sortOrder);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size).toBe(orders.length);
    });

    it('LLM 缺省时付费段落走兜底文案且标记 fallback', () => {
      const sections = buildSections('INTJ', scores);
      const paid = sections.filter((s) => s.paid);
      for (const s of paid) {
        const c = s.content as { text: string; fallback: boolean };
        expect(c.text).toBe(DEEP_SECTION_FALLBACK);
        expect(c.fallback).toBe(true);
      }
    });

    it('LLM 有文本时使用文本且不标 fallback', () => {
      const key = PAID_SECTION_KEYS[0];
      const sections = buildSections('INTJ', scores, { [key]: '这是深度解读文本' });
      const target = sections.find((s) => s.sectionKey === key)!;
      const c = target.content as { text: string; fallback: boolean };
      expect(c.text).toBe('这是深度解读文本');
      expect(c.fallback).toBe(false);
    });

    it('维度段落包含 4 个维度', () => {
      const sections = buildSections('INTJ', scores);
      const dim = sections.find((s) => s.sectionKey === 'dimension_scores');
      const dims = (dim!.content as { dimensions: unknown[] }).dimensions;
      expect(dims).toHaveLength(4);
    });
  });
});