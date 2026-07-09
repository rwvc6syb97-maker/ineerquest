/**
 * InnerQuest 种子脚本（v3 · 题库 + 职业库 + 会员套餐）
 * -------------------------------------------------------------
 * 向 assessment_question/option 写入 v2 版 40 道 MBTI 题目；
 * 向 career 写入示例职业数据；
 * 向 membership_plan 写入套餐数据。
 *
 * 幂等策略：以 version / code 为粒度先删除旧数据再重建。
 * 可重复执行：`pnpm --filter @innerquest/api db:seed`
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VERSION = 'v2';

/** 维度编码 */
const DIM = { EI: 1, SN: 2, TF: 3, JP: 4 } as const;

/** 5 档李克特文案（sortOrder/optionKey 1..5） */
const LIKERT_LABELS = ['非常不同意', '不同意', '中立', '同意', '非常同意'] as const;

/**
 * 单档李克特映射到 (polarity, score)。
 * base 为正向题（陈述指向第一极）的映射；反向题在生成时整体交换 polarity。
 * 中立(index 2) score=0，polarity 记 1（不影响两极累加）。
 */
const FORWARD_MAP: { polarity: number; score: number }[] = [
  { polarity: 2, score: 2 }, // 非常不同意 → 偏第二极 +2
  { polarity: 2, score: 1 }, // 不同意 → 偏第二极 +1
  { polarity: 1, score: 0 }, // 中立 → 不计
  { polarity: 1, score: 1 }, // 同意 → 偏第一极 +1
  { polarity: 1, score: 2 }, // 非常同意 → 偏第一极 +2
];

/** 一道题：题干陈述 + pole（同意所指极性 1/2）。 */
interface SeedQuestion {
  dimension: number;
  content: string;
  /** 同意时指向的极性：1=第一极(E/S/T/J)，2=第二极(I/N/F/P，即反向题) */
  pole: 1 | 2;
}

/** EI 维度（前极 E / 后极 I）10 题，含 3 道反向(pole=2) */
const EI: SeedQuestion[] = [
  { dimension: DIM.EI, content: '我喜欢约上朋友外出聚会、参加热闹的活动。', pole: 1 },
  { dimension: DIM.EI, content: '在陌生的社交场合，我会主动上前认识新朋友。', pole: 1 },
  { dimension: DIM.EI, content: '与人聊天互动能让我快速恢复精力。', pole: 1 },
  { dimension: DIM.EI, content: '讨论问题时，我习惯一边说一边理清思路。', pole: 1 },
  { dimension: DIM.EI, content: '我更享受开放协作、频繁交流的工作节奏。', pole: 1 },
  { dimension: DIM.EI, content: '别人常形容我热情外向、好相处。', pole: 1 },
  { dimension: DIM.EI, content: '面对新想法，我更愿意立刻找人讨论。', pole: 1 },
  { dimension: DIM.EI, content: '长时间独处会让我感到无聊、想找人。', pole: 1 },
  { dimension: DIM.EI, content: '我更倾向待在家里独处、做点安静的事。', pole: 2 },
  { dimension: DIM.EI, content: '我通常先在心里想清楚再开口。', pole: 2 },
];

/** SN 维度（前极 S / 后极 N）10 题，含 3 道反向(pole=2) */
const SN: SeedQuestion[] = [
  { dimension: DIM.SN, content: '接收信息时，我更关注具体的事实与细节。', pole: 1 },
  { dimension: DIM.SN, content: '我更信任亲身经验与已被验证的做法。', pole: 1 },
  { dimension: DIM.SN, content: '学习新东西时，我偏好按部就班、循序渐进。', pole: 1 },
  { dimension: DIM.SN, content: '我更容易被实用、能马上落地的方案吸引。', pole: 1 },
  { dimension: DIM.SN, content: '描述一件事时，我倾向如实还原发生了什么。', pole: 1 },
  { dimension: DIM.SN, content: '我做事更看重当下的现实条件。', pole: 1 },
  { dimension: DIM.SN, content: '别人说我是个脚踏实地的现实派。', pole: 1 },
  { dimension: DIM.SN, content: '我更关注信息背后的含义与各种可能性。', pole: 2 },
  { dimension: DIM.SN, content: '我更愿意从理想蓝图倒推来规划未来。', pole: 2 },
  { dimension: DIM.SN, content: '读一本书，我更留意它的主题与深层寓意。', pole: 2 },
];

/** TF 维度（前极 T / 后极 F）10 题，含 3 道反向(pole=2) */
const TF: SeedQuestion[] = [
  { dimension: DIM.TF, content: '做决定时，我更看重客观逻辑与公平。', pole: 1 },
  { dimension: DIM.TF, content: '评价一件事，我先问它是否合理、正确。', pole: 1 },
  { dimension: DIM.TF, content: '与人意见冲突时，我倾向就事论事、坚持道理。', pole: 1 },
  { dimension: DIM.TF, content: '给别人反馈时，我更可能直接指出问题。', pole: 1 },
  { dimension: DIM.TF, content: '我更希望被认可为有能力、讲道理的人。', pole: 1 },
  { dimension: DIM.TF, content: '我认为好的决策应该不受情绪干扰。', pole: 1 },
  { dimension: DIM.TF, content: '别人形容我更像理性冷静的分析者。', pole: 1 },
  { dimension: DIM.TF, content: '做决定时，我更看重他人的感受与和谐。', pole: 2 },
  { dimension: DIM.TF, content: '面对朋友诉苦，我第一反应是先共情、陪他感受。', pole: 2 },
  { dimension: DIM.TF, content: '分配任务时，我会优先照顾每个人的意愿与感受。', pole: 2 },
];

/** JP 维度（前极 J / 后极 P）10 题，含 3 道反向(pole=2) */
const JP: SeedQuestion[] = [
  { dimension: DIM.JP, content: '面对一天的安排，我喜欢提前列好计划、按表推进。', pole: 1 },
  { dimension: DIM.JP, content: '对待截止日期，我通常早早完成、留出余量。', pole: 1 },
  { dimension: DIM.JP, content: '我的生活空间倾向井井有条、物归原位。', pole: 1 },
  { dimension: DIM.JP, content: '事情没定下来时，我会感到不安、想尽快敲定。', pole: 1 },
  { dimension: DIM.JP, content: '出行旅游，我偏好有明确的行程和攻略。', pole: 1 },
  { dimension: DIM.JP, content: '我更享受把事情一件件完成的状态。', pole: 1 },
  { dimension: DIM.JP, content: '别人眼中的我更像有条理、靠谱的执行者。', pole: 1 },
  { dimension: DIM.JP, content: '我更喜欢随机应变、看情况再决定。', pole: 2 },
  { dimension: DIM.JP, content: '做选择时，我更希望多留些选项、保持开放。', pole: 2 },
  { dimension: DIM.JP, content: '计划被打乱时，我更容易顺其自然、快速调整。', pole: 2 },
];

// ============ 职业库种子数据 ============

interface SeedCareer {
  careerCode: string;
  name: string;
  category: string;
  description: string;
  responsibility?: string;
  salaryMin?: number;
  salaryMax?: number;
  prospect?: string;
  suitTypes?: string;
}

const CAREERS: SeedCareer[] = [
  // ---- 技术/IT 类 ----
  { careerCode: 'software-engineer', name: '软件工程师', category: '技术/IT', description: '负责软件设计、编码、测试与维护，将需求转化为可运行的系统。', responsibility: '编写高质量代码；参与系统架构设计；代码审查与性能优化；编写技术文档。', salaryMin: 150000, salaryMax: 500000, prospect: '互联网/云计算/AI 持续扩张，需求稳定增长。', suitTypes: 'INTJ,INTP,ISTJ'},
  { careerCode: 'data-analyst', name: '数据分析师', category: '技术/IT', description: '通过数据采集、清洗、建模，为业务决策提供洞察支持。', responsibility: '构建数据看板；编写 SQL 与 Python 分析脚本；产出分析报告。', salaryMin: 120000, salaryMax: 400000, prospect: '数据驱动决策已成企业标配，人才缺口大。', suitTypes: 'INTJ,INTP,ISTJ'},
  { careerCode: 'product-manager', name: '产品经理', category: '技术/IT', description: '发掘用户需求，定义产品功能，协调设计、研发、运营资源推动产品落地。', responsibility: '需求调研与竞品分析；PRD 撰写；迭代排期与进度跟踪；数据驱动决策。', salaryMin: 180000, salaryMax: 600000, prospect: '产品岗位是互联网核心角色，路径向 CPO/CEO 延伸。', suitTypes: 'ENTJ,ENFJ,ENTP'},

  // ---- 金融/咨询 类 ----
  { careerCode: 'investment-analyst', name: '投资分析师', category: '金融/咨询', description: '研究行业与企业基本面，提供投资建议与决策支持。', responsibility: '撰写行业研究报告；财务建模与估值；投资组合建议。', salaryMin: 200000, salaryMax: 800000, prospect: '资本市场持续发展，买方/卖方均需研究人才。', suitTypes: 'INTJ,ISTJ,ENTJ'},
  { careerCode: 'management-consultant', name: '管理咨询顾问', category: '金融/咨询', description: '为企业提供战略、运营、组织等核心问题的解决方案。', responsibility: '企业诊断与访谈分析；交付结构化方案；推动客户变革落地。', salaryMin: 250000, salaryMax: 1000000, prospect: '头部咨询公司的平台溢价可观，职业出口广泛。', suitTypes: 'ENTJ,ENTP,INTJ'},

  // ---- 创意/设计 类 ----
  { careerCode: 'ui-designer', name: 'UI/UX 设计师', category: '创意/设计', description: '以用户为中心设计数字产品的视觉与交互体验。', responsibility: '绘制界面原型与高保真设计稿；用户测试与迭代；维护设计系统。', salaryMin: 120000, salaryMax: 450000, prospect: '体验经济下设计人才持续吃香，可向产品设计/全栈设计发展。', suitTypes: 'INFP,ENFP,ISFP'},
  { careerCode: 'content-strategist', name: '内容策划 / 新媒体运营', category: '创意/设计', description: '策划内容选题，运营新媒体矩阵，驱动用户增长与品牌建设。', responsibility: '内容选题与排期；多平台发布与数据复盘；热点追踪与创意输出。', salaryMin: 80000, salaryMax: 350000, prospect: '内容营销/短视频/直播电商拉动了运营类需求。', suitTypes: 'ENFP,ENFJ,ESFP'},

  // ---- 教育/科研 类 ----
  { careerCode: 'college-teacher', name: '高校教师', category: '教育/科研', description: '从事高等教育教学与科研，培养专业人才并产出学术成果。', responsibility: '课程讲授与辅导；科研项目申报与论文发表；学业指导。', salaryMin: 100000, salaryMax: 300000, prospect: '高校岗位稳定，教研并重方向发展空间大。', suitTypes: 'INTJ,INTP,INFJ'},
  { careerCode: 'psychologist', name: '心理咨询师', category: '教育/科研', description: '运用心理学理论为来访者提供评估、咨询与干预服务。', responsibility: '心理评估与个案概念化；咨询会谈与方案推进；专业督导与继续教育。', salaryMin: 80000, salaryMax: 400000, prospect: '心理健康关注度持续上升，行业规范化带来更高准入门槛与回报。', suitTypes: 'INFJ,INFP,ENFJ'},

  // ---- 医疗/健康 类 ----
  { careerCode: 'general-practitioner', name: '全科医生', category: '医疗/健康', description: '提供常见病诊疗、慢病管理与健康指导的一线医疗服务。', responsibility: '接诊问诊与处方；转诊与随访；健康教育宣传。', salaryMin: 120000, salaryMax: 350000, prospect: '分级诊疗推进下全科医生价值凸显。', suitTypes: 'ISFJ,ISTJ,INFJ'},

  // ---- 市场/销售 类 ----
  { careerCode: 'brand-manager', name: '品牌经理', category: '市场/销售', description: '制定品牌策略，通过整合营销手段塑造品牌形象并驱动增长。', responsibility: '品牌定位与策略制定；Campaign 策划与执行；预算与 ROI 管理。', salaryMin: 150000, salaryMax: 500000, prospect: '消费品/互联网品牌竞争加剧，品牌岗重要性持续上升。', suitTypes: 'ENTJ,ENFJ,ESTP'},
  { careerCode: 'b2b-sales', name: 'B2B 大客户销售', category: '市场/销售', description: '面向企业客户销售产品或服务，完成商务谈判与签约回款。', responsibility: '客户开发与拜访；需求挖掘与方案匹配；招投标与合同管理。', salaryMin: 100000, salaryMax: 600000, prospect: 'SaaS/企服赛道成长快，优秀销售晋升通道清晰。', suitTypes: 'ESTJ,ENTJ,ESTP'},

  // ---- 人力资源/行政 类 ----
  { careerCode: 'hrbp', name: 'HRBP（人力资源业务伙伴）', category: '人力资源/行政', description: '深入业务线，提供人才规划、组织诊断、员工发展等 HR 支持。', responsibility: '业务线招聘与人才盘点；绩效/晋升方案落地；员工关系与组织文化。', salaryMin: 120000, salaryMax: 400000, prospect: 'HR 职能向战略伙伴转型，懂业务的 HRBP 会越来越值钱。', suitTypes: 'ENFJ,ESFJ,ENTJ'},

  // ---- 公务员/公共服务 类 ----
  { careerCode: 'civil-servant', name: '公务员 / 公共管理人员', category: '公务员/公共服务', description: '在政府或公共机构从事行政管理与公共服务。', responsibility: '政策研究与文书撰写；窗口服务与群众接待；项目执行与跨部门协调。', salaryMin: 80000, salaryMax: 250000, prospect: '编制岗位稳定性强，职级晋升路径明晰。', suitTypes: 'ISTJ,ISFJ,ESTJ'},
  { careerCode: 'npo-manager', name: '非营利组织项目经理', category: '公务员/公共服务', description: '策划与执行公益项目，链接资源，推动社会问题改善。', responsibility: '项目设计与申请书撰写；资助方沟通与报告；志愿者管理与活动执行。', salaryMin: 60000, salaryMax: 200000, prospect: 'ESG/公益倡导热度上升，专业型 NPO 管理岗位增多。', suitTypes: 'ENFJ,INFJ,ESFJ'},

  // ---- 创业/自由职业 类 ----
  { careerCode: 'entrepreneur', name: '创业者 / 创始人', category: '创业/自由职业', description: '识别商业机会，组建团队，从 0 到 1 搭建产品并寻求增长。', responsibility: '战略方向与目标制定；团队招聘与文化塑造；融资与资源整合。', salaryMin: 0, salaryMax: -1, prospect: '创新创业生态完善，但高风险高回报。', suitTypes: 'ENTP,ENTJ,ESTP'},
];

// ============ 会员套餐种子数据 ============

interface SeedPlan {
  code: string;
  name: string;
  subtitle: string;
  price: number;       // 分
  originalPrice: number | null;
  durationDays: number | null;
  planType: number;    // 1=单次 2=周期
  benefits: string[];
  sortOrder: number;
  isRecommended: number;
}

const PLANS: SeedPlan[] = [
  {
    code: 'free',
    name: '免费入门',
    subtitle: '开启你的 MBTI 探索之旅',
    price: 0,
    originalPrice: null,
    durationDays: null,
    planType: 2,
    benefits: ['基础 MBTI 测评（40 题标准版）', '简要结果概览', 'TOP 5 职业匹配推荐', '1 次 AI 对话（限 5 轮）'],
    sortOrder: 1,
    isRecommended: 0,
  },
  {
    code: 'pro-monthly',
    name: 'Pro 月度',
    subtitle: '解锁深度报告与职业规划 · 月付灵活',
    price: 4900, // ¥49.00
    originalPrice: 6900,
    durationDays: 30,
    planType: 2,
    benefits: ['深度 MBTI 报告（4 大维度详解）', 'TOP 10 职业匹配 + 技能差距分析', '无限 AI 对话（每会话 50 轮）', '职业路线图与学习资源推荐', '报告 PDF 导出与分享', '历史报告永久保存'],
    sortOrder: 2,
    isRecommended: 0,
  },
  {
    code: 'pro-yearly',
    name: 'Pro 年度',
    subtitle: '完整成长方案 · 性价比之选',
    price: 29900, // ¥299.00
    originalPrice: 58800,
    durationDays: 365,
    planType: 2,
    benefits: ['Pro 月度全部权益', '优先体验新功能与 AI 模型', '专属 MBTI 类型社群', '年度成长复盘报告', '辅导咨询 9 折权益'],
    sortOrder: 3,
    isRecommended: 1,
  },
  {
    code: 'coaching-single',
    name: '1 对 1 辅导（单次）',
    subtitle: '与认证辅导师 60 分钟深度对话',
    price: 29900, // ¥299.00
    originalPrice: null,
    durationDays: null,
    planType: 1,
    benefits: ['60 分钟线上视频/文字咨询', '辅导前个人画像分析', '咨询后成长建议摘要', '7 天内查看回放记录'],
    sortOrder: 4,
    isRecommended: 0,
  },
];

/** 完整 40 题（按 EI→SN→TF→JP，各维度内部顺序排列） */
const QUESTIONS: SeedQuestion[] = [...EI, ...SN, ...TF, ...JP];

/** 由 pole 生成 5 个李克特选项（pole=2 时整体翻转 polarity）。 */
function buildOptions(pole: 1 | 2) {
  return LIKERT_LABELS.map((label, i) => {
    const base = FORWARD_MAP[i];
    // 中立(score=0)不翻转极性；其余在反向题时交换极性。
    const polarity =
      base.score === 0 ? base.polarity : pole === 1 ? base.polarity : base.polarity === 1 ? 2 : 1;
    return {
      content: label,
      optionKey: String(i + 1),
      polarity,
      score: base.score,
      sortOrder: i + 1,
    };
  });
}

async function main(): Promise<void> {
  // ===== 1. 测评题库 =====
  console.log(`[seed] 开始写入测评题库 version=${VERSION} …`);

  await prisma.$transaction(async (tx) => {
    // —— 幂等：先清除该版本旧题及其选项 ——
    const olds = await tx.assessmentQuestion.findMany({
      where: { version: VERSION },
      select: { id: true },
    });
    if (olds.length) {
      const ids = olds.map((q) => q.id);
      // 删除顺序须遵循外键依赖：assessment_answer 同时引用 question_id 与 option_id，
      // 故必须先删 answer，再删 option，最后删 question，否则触发 P2003 外键约束（存在用户作答时）。
      await tx.assessmentAnswer.deleteMany({ where: { questionId: { in: ids } } });
      await tx.assessmentOption.deleteMany({ where: { questionId: { in: ids } } });
      await tx.assessmentQuestion.deleteMany({ where: { id: { in: ids } } });
      console.log(`[seed] 已清除旧题 ${olds.length} 道`);
    }

    // —— 重建：逐题 create（嵌套 5 个李克特 options） ——
    let sort = 1;
    for (const q of QUESTIONS) {
      await tx.assessmentQuestion.create({
        data: {
          version: VERSION,
          dimension: q.dimension,
          content: q.content,
          sortOrder: sort,
          isReverse: q.pole === 2 ? 1 : 0,
          status: 1,
          options: { create: buildOptions(q.pole) },
        },
      });
      sort += 1;
    }
  });

  const total = await prisma.assessmentQuestion.count({ where: { version: VERSION } });
  const optCount = await prisma.assessmentOption.count({
    where: { question: { version: VERSION } },
  });
  console.log(`[seed] 题库完成：${total} 题（预期 40）、${optCount} 选项（预期 200）`);
  if (total !== 40 || optCount !== 200) {
    throw new Error(`[seed] 题库计数校验失败：题=${total}/40，选项=${optCount}/200`);
  }

  // ===== 2. 职业库 =====
  console.log('[seed] 开始写入职业库 …');
  let careerCount = 0;
  for (const c of CAREERS) {
    const exists = await prisma.career.findFirst({ where: { careerCode: c.careerCode } });
    if (exists) {
      await prisma.career.update({
        where: { id: exists.id },
        data: {
          name: c.name,
          category: c.category,
          description: c.description,
          responsibility: c.responsibility ?? null,
          salaryMin: c.salaryMin,
          salaryMax: c.salaryMax !== undefined && c.salaryMax >= 0 ? c.salaryMax : null,
          prospect: c.prospect ?? null,
          suitTypes: c.suitTypes ?? null,
          status: 1,
        },
      });
    } else {
      await prisma.career.create({
        data: {
          careerCode: c.careerCode,
          name: c.name,
          category: c.category,
          description: c.description,
          responsibility: c.responsibility ?? null,
          salaryMin: c.salaryMin,
          salaryMax: c.salaryMax !== undefined && c.salaryMax >= 0 ? c.salaryMax : null,
          prospect: c.prospect ?? null,
          suitTypes: c.suitTypes ?? null,
          status: 1,
        },
      });
    }
    careerCount++;
  }
  console.log(`[seed] 职业库完成：${careerCount} 条（预期 ${CAREERS.length}）`);

  // ===== 3. 会员套餐 =====
  console.log('[seed] 开始写入会员套餐 …');
  let planCount = 0;
  for (const p of PLANS) {
    const exists = await prisma.membershipPlan.findFirst({ where: { code: p.code } });
    if (exists) {
      await prisma.membershipPlan.update({
        where: { id: exists.id },
        data: {
          name: p.name,
          subtitle: p.subtitle,
          price: BigInt(p.price),
          originalPrice: p.originalPrice != null ? BigInt(p.originalPrice) : null,
          durationDays: p.durationDays,
          planType: p.planType,
          benefits: p.benefits,
          sortOrder: p.sortOrder,
          isRecommended: p.isRecommended,
          status: 1,
        },
      });
    } else {
      await prisma.membershipPlan.create({
        data: {
          code: p.code,
          name: p.name,
          subtitle: p.subtitle,
          price: BigInt(p.price),
          originalPrice: p.originalPrice != null ? BigInt(p.originalPrice) : null,
          durationDays: p.durationDays,
          planType: p.planType,
          benefits: p.benefits,
          sortOrder: p.sortOrder,
          isRecommended: p.isRecommended,
          status: 1,
        },
      });
    }
    planCount++;
  }
  console.log(`[seed] 套餐完成：${planCount} 个（预期 ${PLANS.length}）`);

  // ===== 4. 开发测试激活码 =====
  console.log('[seed] 写入开发测试激活码 …');
  const demoCodes = [
    { code: 'DEMO-FREE-AAAAAA', plan: 'free', note: '开发测试: 免费套餐' },
    { code: 'DEMO-PRO-BBBBBB', plan: 'pro-monthly', note: '开发测试: Pro月度' },
    { code: 'DEMO-PRO-CCCCCC', plan: 'pro-yearly', note: '开发测试: Pro年度' },
  ];
  for (const dc of demoCodes) {
    const exists = await prisma.activationCode.findFirst({ where: { code: dc.code } });
    if (!exists) {
      await prisma.activationCode.create({
        data: {
          code: dc.code,
          planCode: dc.plan,
          status: 0,
          note: dc.note,
          batchNo: 'DEMO-SEED',
        },
      });
    }
  }
  console.log(`[seed] 激活码完成：${demoCodes.length} 个`);

  // ===== 5. 默认管理员账号（独立于用户体系）=====
  console.log('[seed] 写入默认管理员账号 …');
  const adminUsername = 'admin';
  const adminPasswordHash = '$2b$10$XFi4JRIEhRnz79OsFMrpreGNKq1wmeWjQL530fX0JobG5EYuxDzju';
  const adminExists = await prisma.admin.findFirst({ where: { username: adminUsername } });
  if (!adminExists) {
    await prisma.admin.create({
      data: {
        username: adminUsername,
        passwordHash: adminPasswordHash,
        nickname: '系统管理员',
        email: 'admin@innerquest.local',
        role: 3,
        status: 1,
      },
    });
    console.log('[seed] 默认管理员账号创建成功');
  } else {
    await prisma.admin.update({
      where: { id: adminExists.id },
      data: {
        passwordHash: adminPasswordHash,
        nickname: '系统管理员',
        role: 3,
        status: 1,
      },
    });
    console.log('[seed] 默认管理员账号已更新');
  }

  console.log('[seed] 全部种子数据写入完毕！');
}

main()
  .catch((e) => {
    console.error('[seed] 失败：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });