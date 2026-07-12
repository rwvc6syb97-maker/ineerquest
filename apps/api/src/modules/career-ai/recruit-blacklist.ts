/**
 * S-05 红线工具 · 招聘平台黑名单校验。
 *
 * 契约要求（PRD §4.4）：refSources 仅允许权威数据源（政府/行业协会/官方职业标准等），
 * 严禁引用 BOSS 直聘、猎聘、脉脉、前程无忧、智联招聘等招聘平台作为职业库生产的数据源。
 * 命中任一黑名单域名/关键词 → 拒绝生成（AI_BAD_PARAM 4005）。
 */

/** 招聘平台域名/关键词黑名单（小写匹配） */
const RECRUIT_BLACKLIST: string[] = [
  // 域名
  'zhipin.com', // BOSS 直聘
  'liepin.com', // 猎聘
  'maimai.cn', // 脉脉
  '51job.com', // 前程无忧
  'zhaopin.com', // 智联招聘
  'lagou.com', // 拉勾
  'jobui.com',
  'dajie.com',
  'chinahr.com',
  'linkedin.com', // 领英（招聘属性）
  'indeed.com',
  'glassdoor.com',
  // 中文关键词
  'boss直聘',
  'boss 直聘',
  '猎聘',
  '脉脉',
  '前程无忧',
  '智联招聘',
  '智联',
  '拉勾',
  '大街网',
  '招聘平台',
  '招聘网站',
];

/**
 * 校验 refSources 是否命中招聘平台黑名单。
 * @param refSources 参考来源数组（URL 或名称）
 * @returns 命中的第一个黑名单项；未命中返回 null
 */
export function findRecruitSource(refSources?: string[] | null): string | null {
  if (!refSources || refSources.length === 0) {
    return null;
  }
  for (const raw of refSources) {
    if (typeof raw !== 'string') {
      continue;
    }
    const s = raw.trim().toLowerCase();
    if (!s) {
      continue;
    }
    for (const bad of RECRUIT_BLACKLIST) {
      if (s.includes(bad)) {
        return raw;
      }
    }
  }
  return null;
}