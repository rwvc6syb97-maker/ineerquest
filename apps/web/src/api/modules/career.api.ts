/**
 * 职业服务 API
 * 对齐契约：
 *  GET /careers           职业列表
 *  GET /careers/:id       职业详情
 *  GET /careers/recommend MBTI 匹配 TOP10
 *  GET /careers/search    搜索
 */
import { request } from '../client';
import type { Paginated } from '@innerquest/shared';

/** 职业卡片（列表/推荐用） */
export interface CareerCard {
  id: string;
  title: string;
  /** 所属大类 */
  category: string;
  /** 与当前 MBTI 的匹配度 0-100（推荐接口返回） */
  matchScore?: number;
  /** 一句话简介 */
  summary: string;
  /** 薪资区间（如 "15k-30k"） */
  salaryRange?: string;
  tags: string[];
}

/** 职业详情 */
export interface CareerDetail extends CareerCard {
  /** 岗位职责 */
  responsibilities: string[];
  /** 技能要求 */
  skills: { name: string; level: number }[];
  /** 薪资明细 */
  salary: { junior: string; middle: string; senior: string };
  /** 发展路径 */
  growthPath: string[];
  /** 匹配该职业的 MBTI 类型 */
  fitTypes: string[];
}

/** 职业列表 */
export function listCareers(
  params: { page?: number; pageSize?: number; category?: string } = {},
): Promise<Paginated<CareerCard>> {
  return request<Paginated<CareerCard>>({
    url: '/careers',
    method: 'GET',
    params: { page: 1, pageSize: 12, ...params },
  });
}

/** 职业详情 */
export function getCareer(id: string): Promise<CareerDetail> {
  return request<RawCareerDetail>({ url: `/careers/${id}`, method: 'GET' }).then(toCareerDetail);
}

/**
 * 后端职业详情原始出参（GET /careers/:id 的 data，request 已解包 data）。
 * 字段命名与前端 CareerDetail 不一致，需 toCareerDetail 归一化。
 * 全部可选，做防御性判空，杜绝页面 undefined 崩溃。
 */
interface RawCareerDetail {
  id?: string | number;
  name?: string;
  category?: string;
  description?: string;
  /** 岗位职责（字符串，按换行/分号拆数组） */
  responsibility?: string;
  skills?: { skillName?: string; requireLevel?: number }[];
  roadmaps?: { stageName?: string }[];
  suitTypes?: string[];
  salaryMin?: number;
  salaryMax?: number;
  matchScore?: number;
  tags?: string[];
}

/** 将职责字符串按换行/分号/顿号拆成数组（无则 []） */
function splitResponsibilities(v?: string): string[] {
  if (typeof v !== 'string' || !v.trim()) return [];
  return v
    .split(/[\r\n;；]/)
    .map((s) => s.replace(/^[\s\-•·\d.、]+/, '').trim())
    .filter(Boolean);
}

/** 千元档薪资展示（缺失兜底空串，避免 undefined） */
function toSalaryText(n?: number): string {
  return typeof n === 'number' && n > 0 ? `${Math.round(n / 1000)}k` : '';
}

/**
 * 后端 → 前端 CareerDetail 归一化（BUG-4：职业详情字段全 undefined）。
 * 参照 toCareerCard 模式，所有取值可选链+默认值。
 */
function toCareerDetail(raw: RawCareerDetail): CareerDetail {
  const min = raw?.salaryMin;
  const max = raw?.salaryMax;
  const junior = toSalaryText(min);
  const senior = toSalaryText(max);
  // 中位：有 min/max 取均值，否则回退到可展示的一端
  const middle =
    typeof min === 'number' && typeof max === 'number' && (min > 0 || max > 0)
      ? toSalaryText(Math.round((min + max) / 2))
      : junior || senior;
  const salaryRange = junior && senior ? `${junior}-${senior}` : junior || senior || undefined;

  return {
    id: String(raw?.id ?? ''),
    title: raw?.name ?? '',
    category: raw?.category ?? '',
    matchScore: raw?.matchScore,
    summary: raw?.description ?? '',
    salaryRange,
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    responsibilities: splitResponsibilities(raw?.responsibility),
    skills: Array.isArray(raw?.skills)
      ? raw.skills.map((s) => ({ name: s?.skillName ?? '', level: Number(s?.requireLevel ?? 0) }))
      : [],
    salary: { junior, middle, senior },
    growthPath: Array.isArray(raw?.roadmaps)
      ? raw.roadmaps.map((r) => r?.stageName ?? '').filter(Boolean)
      : [],
    fitTypes: Array.isArray(raw?.suitTypes) ? raw.suitTypes : [],
  };
}

/** 后端推荐项（GET /careers/recommend 返回 list 元素） */
export interface RecommendItem {
  rankNo: number;
  matchScore: number;
  id: string;
  careerCode: string;
  name: string;
  category: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  suitTypes: string[];
}

/** 后端推荐响应 data 结构 */
export interface RecommendResult {
  mbtiType: string;
  total: number;
  list: RecommendItem[];
}

/** 将后端推荐项映射为前端职业卡片 */
function toCareerCard(item: RecommendItem): CareerCard {
  const salaryRange =
    item.salaryMin != null && item.salaryMax != null
      ? `${Math.round(item.salaryMin / 1000)}k-${Math.round(item.salaryMax / 1000)}k`
      : undefined;
  return {
    id: item.id,
    title: item.name,
    category: item.category,
    matchScore: item.matchScore,
    summary: item.description,
    salaryRange,
    tags: item.suitTypes ?? [],
  };
}

/** MBTI 匹配 TOP10 推荐（后端按 reportId 关联报告的 mbtiType） */
export async function recommendCareers(reportId: string): Promise<CareerCard[]> {
  const res = await request<RecommendResult>({
    url: '/careers/recommendations',
    method: 'GET',
    params: { reportId },
  });
  return (res.list ?? []).map(toCareerCard);
}

/** 职业搜索 */
export function searchCareers(keyword: string): Promise<CareerCard[]> {
  return request<CareerCard[]>({
    url: '/careers/search',
    method: 'GET',
    params: { keyword },
  });
}