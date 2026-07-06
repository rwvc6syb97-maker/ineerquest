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
  return request<CareerDetail>({ url: `/careers/${id}`, method: 'GET' });
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
    url: '/careers/recommend',
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