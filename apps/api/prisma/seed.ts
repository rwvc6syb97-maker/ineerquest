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

// ============ 核心链路 seed（技能/路线图/学习资源/辅导师）============
interface LinkSkill { name: string; skillType: number; requireLevel: number; weight: string; }
interface LinkStage { stageNo: number; stageName: string; duration: string; milestones: string[]; }
interface LinkResource { title: string; resourceType: number; url: string; skillTags: string; provider: string; }
interface LinkCoach { realName: string; title: string; intro: string; expertise: string[]; pricePerHour: number; rating: string; }
interface CareerLinkSeed {
  careerCode: string;
  skills: LinkSkill[];
  stages: LinkStage[];
  resources: LinkResource[];
  coaches: LinkCoach[];
}

const CAREER_LINK_SEED: CareerLinkSeed[] = [
  {
    careerCode: 'software-engineer',
    skills: [
      { name: '数据结构与算法', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '后端开发（Java/Go）', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '系统设计与架构', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '初级工程师', duration: '0-2年', milestones: ['掌握一门主力语言', '独立完成模块开发', '熟悉 Git 与 CI 流程'] },
      { stageNo: 2, stageName: '高级工程师', duration: '3-5年', milestones: ['主导子系统设计', '性能与稳定性优化', '带教新人 Code Review'] },
      { stageNo: 3, stageName: '技术专家/架构师', duration: '6年以上', milestones: ['把控整体技术架构', '推动技术选型与标准', '影响团队技术方向'] },
    ],
    resources: [
      { title: '算法与数据结构专项课', resourceType: 1, url: 'https://www.coursera.org', skillTags: '数据结构与算法,编程基础', provider: 'Coursera' },
      { title: '《代码整洁之道》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '编码规范,软件工程', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '陈明远', title: '资深后端架构师 · 前大厂技术专家', intro: '10 年后端与分布式系统经验，擅长帮助初中级工程师梳理成长路径与系统设计能力。', expertise: ['系统设计', '职业晋升', '分布式架构'], pricePerHour: 40000, rating: '4.90' },
      { realName: '林晓彤', title: '全栈工程师 · 技术面试官', intro: '专注互联网校招与社招面试辅导，帮助候选人打磨算法与项目表达。', expertise: ['算法面试', '简历优化', '模拟面试'], pricePerHour: 30000, rating: '4.80' },
    ],
  },
  {
    careerCode: 'data-analyst',
    skills: [
      { name: 'SQL 与数据查询', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: 'Python 数据分析', skillType: 1, requireLevel: 3, weight: '0.90' },
      { name: '数据可视化与叙事', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '初级数据分析师', duration: '0-2年', milestones: ['熟练编写 SQL 报表', '搭建基础数据看板', '理解业务指标口径'] },
      { stageNo: 2, stageName: '资深数据分析师', duration: '3-5年', milestones: ['构建分析模型', '驱动关键业务决策', '沉淀分析方法论'] },
      { stageNo: 3, stageName: '数据分析负责人', duration: '6年以上', milestones: ['搭建数据分析体系', '带领分析团队', '影响公司数据战略'] },
    ],
    resources: [
      { title: 'SQL 与数据分析实战', resourceType: 1, url: 'https://www.coursera.org', skillTags: 'SQL 与数据查询,数据分析', provider: 'Coursera' },
      { title: '《精益数据分析》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '数据分析,业务指标', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '赵一帆', title: '资深数据分析专家', intro: '擅长把业务问题拆解为可量化的数据指标，帮助新人建立分析框架。', expertise: ['指标体系', 'A/B 测试', '业务分析'], pricePerHour: 35000, rating: '4.85' },
      { realName: '孙悦', title: '数据科学导师', intro: '专注 Python 与统计建模教学，带你从取数到洞察全链路上手。', expertise: ['Python', '统计建模', '数据可视化'], pricePerHour: 32000, rating: '4.78' },
    ],
  },
  {
    careerCode: 'product-manager',
    skills: [
      { name: '需求分析与拆解', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '产品设计与原型', skillType: 1, requireLevel: 3, weight: '0.90' },
      { name: '跨团队沟通协调', skillType: 2, requireLevel: 4, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '产品助理/初级PM', duration: '0-2年', milestones: ['撰写清晰的 PRD', '独立负责小功能迭代', '掌握需求评审流程'] },
      { stageNo: 2, stageName: '产品经理', duration: '3-5年', milestones: ['负责完整产品线', '数据驱动迭代决策', '协调多方资源落地'] },
      { stageNo: 3, stageName: '产品总监', duration: '6年以上', milestones: ['制定产品战略', '搭建产品团队', '对业务结果负责'] },
    ],
    resources: [
      { title: '互联网产品经理入门课', resourceType: 1, url: 'https://www.coursera.org', skillTags: '需求分析与拆解,产品设计', provider: 'Coursera' },
      { title: '《俞军产品方法论》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '产品思维,用户价值', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '王思远', title: '资深产品总监', intro: '主导过多款千万级用户产品，帮助新人建立产品思维与决策框架。', expertise: ['产品战略', '需求分析', '职业规划'], pricePerHour: 45000, rating: '4.92' },
      { realName: '李静', title: 'B端产品专家', intro: '专注企业级产品设计，擅长复杂业务的流程梳理与方案落地。', expertise: ['B端产品', '流程设计', '需求管理'], pricePerHour: 38000, rating: '4.80' },
    ],
  },
  {
    careerCode: 'investment-analyst',
    skills: [
      { name: '财务建模与估值', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '行业与基本面研究', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '研究报告撰写', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '研究助理', duration: '0-2年', milestones: ['搭建财务模型', '整理行业数据', '协助撰写研报'] },
      { stageNo: 2, stageName: '投资分析师', duration: '3-5年', milestones: ['独立覆盖行业', '产出深度研报', '形成投资观点'] },
      { stageNo: 3, stageName: '基金经理/首席分析师', duration: '6年以上', milestones: ['管理投资组合', '把控研究方向', '对投资业绩负责'] },
    ],
    resources: [
      { title: '公司金融与估值', resourceType: 1, url: 'https://www.coursera.org', skillTags: '财务建模与估值,公司金融', provider: 'Coursera' },
      { title: '《证券分析》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '价值投资,基本面研究', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '周凯', title: '资深卖方分析师', intro: '覆盖消费与科技行业多年，帮助新人建立研究框架与估值能力。', expertise: ['估值建模', '行业研究', '研报写作'], pricePerHour: 50000, rating: '4.88' },
      { realName: '吴敏', title: '买方投资经理', intro: '专注一级/二级市场投资，擅长从基本面到投资决策的完整训练。', expertise: ['投资决策', '财务分析', '风险控制'], pricePerHour: 55000, rating: '4.86' },
    ],
  },
  {
    careerCode: 'management-consultant',
    skills: [
      { name: '结构化问题分析', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '商业方案撰写', skillType: 1, requireLevel: 3, weight: '0.90' },
      { name: '客户沟通与汇报', skillType: 2, requireLevel: 4, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '分析员', duration: '0-2年', milestones: ['掌握结构化分析', '完成数据与访谈支持', '交付分析模块'] },
      { stageNo: 2, stageName: '咨询顾问', duration: '3-5年', milestones: ['独立负责项目模块', '主导客户沟通', '交付整体方案'] },
      { stageNo: 3, stageName: '项目经理/合伙人', duration: '6年以上', milestones: ['把控项目全局', '拓展客户关系', '对交付结果负责'] },
    ],
    resources: [
      { title: '结构化思维与问题解决', resourceType: 1, url: 'https://www.coursera.org', skillTags: '结构化问题分析,咨询方法', provider: 'Coursera' },
      { title: '《金字塔原理》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '逻辑表达,结构化思维', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '郑昊', title: '前咨询公司项目经理', intro: '擅长结构化思维训练与 Case 面试辅导，帮助新人进入咨询行业。', expertise: ['Case 面试', '结构化思维', '方案汇报'], pricePerHour: 48000, rating: '4.89' },
      { realName: '何雨', title: '战略咨询顾问', intro: '专注企业战略与运营诊断，帮助学员建立商业分析框架。', expertise: ['战略分析', '商业方案', '客户沟通'], pricePerHour: 46000, rating: '4.82' },
    ],
  },
  {
    careerCode: 'ui-designer',
    skills: [
      { name: '交互设计', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '视觉设计与规范', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '用户研究', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '初级设计师', duration: '0-2年', milestones: ['掌握设计工具', '产出高保真设计稿', '遵循设计规范'] },
      { stageNo: 2, stageName: '资深设计师', duration: '3-5年', milestones: ['主导产品视觉', '建立设计系统', '推动体验优化'] },
      { stageNo: 3, stageName: '设计负责人', duration: '6年以上', milestones: ['把控设计方向', '带领设计团队', '影响产品体验策略'] },
    ],
    resources: [
      { title: 'UI/UX 设计基础', resourceType: 1, url: 'https://www.coursera.org', skillTags: '交互设计,视觉设计', provider: 'Coursera' },
      { title: '《写给大家看的设计书》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '视觉设计,设计原则', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '许诺', title: '资深体验设计师', intro: '主导过多款 App 的体验升级，帮助新人构建设计思维与作品集。', expertise: ['体验设计', '作品集', '设计系统'], pricePerHour: 36000, rating: '4.83' },
      { realName: '冯洁', title: 'UI 设计导师', intro: '专注视觉规范与界面设计教学，带你系统提升设计基本功。', expertise: ['视觉设计', '界面规范', '设计工具'], pricePerHour: 30000, rating: '4.76' },
    ],
  },
  {
    careerCode: 'content-strategist',
    skills: [
      { name: '内容选题策划', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '文案与创意写作', skillType: 1, requireLevel: 3, weight: '0.90' },
      { name: '数据复盘与增长', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '内容运营专员', duration: '0-2年', milestones: ['独立产出内容', '维护发布排期', '掌握平台规则'] },
      { stageNo: 2, stageName: '内容策划', duration: '3-5年', milestones: ['策划爆款选题', '运营矩阵账号', '驱动粉丝增长'] },
      { stageNo: 3, stageName: '内容负责人', duration: '6年以上', milestones: ['制定内容战略', '带领内容团队', '对品牌与增长负责'] },
    ],
    resources: [
      { title: '新媒体内容运营实战', resourceType: 1, url: 'https://www.coursera.org', skillTags: '内容选题策划,新媒体运营', provider: 'Coursera' },
      { title: '《爆款文案》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '文案写作,内容创意', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '苏晴', title: '资深新媒体主编', intro: '操盘过百万粉账号，擅长选题策划与内容增长方法论。', expertise: ['内容策划', '账号运营', '增长复盘'], pricePerHour: 28000, rating: '4.79' },
      { realName: '曹阳', title: '品牌内容导师', intro: '专注文案与创意训练，帮助新人打磨内容表达与传播能力。', expertise: ['文案写作', '创意策划', '品牌传播'], pricePerHour: 26000, rating: '4.72' },
    ],
  },
  {
    careerCode: 'college-teacher',
    skills: [
      { name: '学术研究能力', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '课程教学设计', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '论文写作与发表', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '讲师/博士后', duration: '0-3年', milestones: ['承担基础课程教学', '发表核心期刊论文', '申请青年科研项目'] },
      { stageNo: 2, stageName: '副教授', duration: '4-8年', milestones: ['主持科研项目', '指导研究生', '形成研究方向'] },
      { stageNo: 3, stageName: '教授/学科带头人', duration: '9年以上', milestones: ['引领学科建设', '带领科研团队', '产出标志性成果'] },
    ],
    resources: [
      { title: '高等教育教学法公开课', resourceType: 1, url: 'https://ocw.mit.edu', skillTags: '课程教学设计,教育学', provider: 'MIT OpenCourseWare' },
      { title: '《如何做研究》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '学术研究,论文写作', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '钱教授', title: '高校博导 · 学术导师', intro: '多年研究生培养经验，帮助青年学者规划科研与教职发展路径。', expertise: ['科研规划', '论文写作', '教职求职'], pricePerHour: 42000, rating: '4.90' },
      { realName: '朱琳', title: '青年副教授', intro: '专注教学设计与基金申报辅导，帮助新入职教师快速成长。', expertise: ['教学设计', '基金申报', '学术发展'], pricePerHour: 34000, rating: '4.81' },
    ],
  },
  {
    careerCode: 'psychologist',
    skills: [
      { name: '心理评估与诊断', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '咨询会谈技术', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '共情与倾听', skillType: 2, requireLevel: 4, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '实习咨询师', duration: '0-2年', milestones: ['完成系统培训', '积累督导个案时长', '掌握基础咨询技术'] },
      { stageNo: 2, stageName: '执业咨询师', duration: '3-6年', milestones: ['独立接案', '形成咨询取向', '持续参加督导'] },
      { stageNo: 3, stageName: '资深咨询师/督导', duration: '7年以上', milestones: ['带教与督导新人', '开展专业培训', '建立个人品牌'] },
    ],
    resources: [
      { title: '心理咨询基础理论课', resourceType: 1, url: 'https://www.coursera.org', skillTags: '心理评估,咨询技术', provider: 'Coursera' },
      { title: '《心理咨询与治疗的理论及实践》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '咨询理论,会谈技术', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '林心怡', title: '资深心理咨询师 · 督导', intro: '十余年临床咨询经验，帮助新人建立个案概念化与职业规划。', expertise: ['个案督导', '职业发展', '咨询技术'], pricePerHour: 45000, rating: '4.91' },
      { realName: '罗晨', title: '临床心理师', intro: '专注咨询技术训练与执业路径指导，陪伴新人稳步成长。', expertise: ['咨询会谈', '执业规划', '自我照顾'], pricePerHour: 38000, rating: '4.84' },
    ],
  },
  {
    careerCode: 'general-practitioner',
    skills: [
      { name: '临床诊疗能力', skillType: 1, requireLevel: 5, weight: '1.00' },
      { name: '慢病管理', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '医患沟通', skillType: 2, requireLevel: 4, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '住院医师', duration: '0-3年', milestones: ['完成规范化培训', '掌握常见病诊疗', '通过执业医师考试'] },
      { stageNo: 2, stageName: '主治医师', duration: '4-8年', milestones: ['独立接诊与处置', '管理慢病患者', '参与健康教育'] },
      { stageNo: 3, stageName: '副主任/主任医师', duration: '9年以上', milestones: ['带教下级医师', '疑难病例把关', '推动全科建设'] },
    ],
    resources: [
      { title: '全科医学基础课程', resourceType: 1, url: 'https://www.coursera.org', skillTags: '临床诊疗,全科医学', provider: 'Coursera' },
      { title: '《全科医学概论》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '全科医学,慢病管理', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '黄伟', title: '主任医师 · 全科带教', intro: '长期从事全科临床与规培带教，帮助青年医生规划成长路径。', expertise: ['临床带教', '规培指导', '职业发展'], pricePerHour: 40000, rating: '4.88' },
      { realName: '谢岚', title: '全科主治医师', intro: '专注慢病管理与医患沟通，帮助新人提升临床综合能力。', expertise: ['慢病管理', '医患沟通', '临床思维'], pricePerHour: 33000, rating: '4.80' },
    ],
  },
  {
    careerCode: 'brand-manager',
    skills: [
      { name: '品牌策略制定', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '整合营销策划', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '预算与 ROI 管理', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '品牌专员', duration: '0-2年', milestones: ['执行营销活动', '维护品牌素材', '协助数据复盘'] },
      { stageNo: 2, stageName: '品牌经理', duration: '3-5年', milestones: ['制定品牌策略', '主导 Campaign', '管理营销预算'] },
      { stageNo: 3, stageName: '品牌总监', duration: '6年以上', milestones: ['把控品牌战略', '带领营销团队', '对品牌增长负责'] },
    ],
    resources: [
      { title: '品牌管理与营销策略', resourceType: 1, url: 'https://www.coursera.org', skillTags: '品牌策略,整合营销', provider: 'Coursera' },
      { title: '《定位》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '品牌定位,市场营销', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '唐悦', title: '资深品牌总监', intro: '操盘过多个消费品牌，帮助新人建立品牌策略与营销框架。', expertise: ['品牌战略', '整合营销', '职业规划'], pricePerHour: 44000, rating: '4.87' },
      { realName: '韩磊', title: '整合营销专家', intro: '专注 Campaign 策划与投放优化，帮助学员提升营销实战能力。', expertise: ['营销策划', '投放优化', 'ROI 管理'], pricePerHour: 36000, rating: '4.79' },
    ],
  },
  {
    careerCode: 'b2b-sales',
    skills: [
      { name: '客户开发与拓展', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '商务谈判', skillType: 2, requireLevel: 4, weight: '0.90' },
      { name: '方案匹配与呈现', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '销售代表', duration: '0-2年', milestones: ['掌握产品知识', '完成客户拜访', '达成基础业绩'] },
      { stageNo: 2, stageName: '大客户经理', duration: '3-5年', milestones: ['管理关键客户', '主导商务谈判', '稳定回款签约'] },
      { stageNo: 3, stageName: '销售总监', duration: '6年以上', milestones: ['制定销售策略', '带领销售团队', '对营收目标负责'] },
    ],
    resources: [
      { title: 'B2B 销售与谈判技巧', resourceType: 1, url: 'https://www.coursera.org', skillTags: '客户开发,商务谈判', provider: 'Coursera' },
      { title: '《销售巨人：SPIN 销售法》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '销售方法,客户沟通', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '梁俊', title: '资深销售总监', intro: '深耕企业级销售多年，帮助新人建立客户开发与谈判方法论。', expertise: ['大客户销售', '商务谈判', '职业晋升'], pricePerHour: 38000, rating: '4.85' },
      { realName: '范婷', title: 'SaaS 销售专家', intro: '专注企服赛道销售训练，帮助学员提升方案呈现与成交能力。', expertise: ['方案销售', '客户成功', '成交技巧'], pricePerHour: 32000, rating: '4.77' },
    ],
  },
  {
    careerCode: 'hrbp',
    skills: [
      { name: '人才盘点与规划', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '组织诊断', skillType: 1, requireLevel: 3, weight: '0.90' },
      { name: '员工关系管理', skillType: 2, requireLevel: 4, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: 'HR 专员', duration: '0-2年', milestones: ['熟悉招聘全流程', '支持业务线人事', '掌握基础政策'] },
      { stageNo: 2, stageName: 'HRBP', duration: '3-5年', milestones: ['深入业务提供支持', '推动绩效与晋升', '处理员工关系'] },
      { stageNo: 3, stageName: 'HRBP 负责人', duration: '6年以上', milestones: ['制定人才战略', '推动组织变革', '对业务人力结果负责'] },
    ],
    resources: [
      { title: '人力资源业务伙伴实务', resourceType: 1, url: 'https://www.coursera.org', skillTags: '人才规划,组织诊断', provider: 'Coursera' },
      { title: '《HR 转型突破》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: 'HRBP,组织发展', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '沈琳', title: '资深 HRBP 负责人', intro: '服务过多家高成长企业，帮助新人建立业务导向的 HR 视角。', expertise: ['人才盘点', '组织发展', '职业规划'], pricePerHour: 40000, rating: '4.86' },
      { realName: '龚敏', title: '组织发展专家', intro: '专注组织诊断与绩效体系设计，帮助学员提升 HRBP 专业能力。', expertise: ['组织诊断', '绩效体系', '员工关系'], pricePerHour: 34000, rating: '4.78' },
    ],
  },
  {
    careerCode: 'civil-servant',
    skills: [
      { name: '公文写作', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '政策研究与执行', skillType: 1, requireLevel: 4, weight: '0.90' },
      { name: '沟通协调', skillType: 2, requireLevel: 4, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '科员', duration: '0-3年', milestones: ['熟悉岗位职责', '掌握公文规范', '完成基础事务'] },
      { stageNo: 2, stageName: '副科级/主任科员', duration: '4-8年', milestones: ['独立承办事项', '协调跨部门工作', '牵头小型项目'] },
      { stageNo: 3, stageName: '科级及以上', duration: '9年以上', milestones: ['分管业务模块', '把控政策落地', '带领科室团队'] },
    ],
    resources: [
      { title: '公共管理与政策分析', resourceType: 1, url: 'https://www.coursera.org', skillTags: '政策研究,公共管理', provider: 'Coursera' },
      { title: '《机关公文写作范例大全》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '公文写作,行政管理', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '袁峰', title: '资深公考辅导讲师', intro: '多年公考与面试辅导经验，帮助考生系统备考行测与申论。', expertise: ['申论写作', '面试辅导', '备考规划'], pricePerHour: 30000, rating: '4.83' },
      { realName: '邵华', title: '公共管理导师', intro: '专注公文写作与政策解读，帮助新人快速适应机关工作。', expertise: ['公文写作', '政策研究', '沟通协调'], pricePerHour: 28000, rating: '4.75' },
    ],
  },
  {
    careerCode: 'npo-manager',
    skills: [
      { name: '项目设计与申请', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '资源链接与筹款', skillType: 1, requireLevel: 3, weight: '0.90' },
      { name: '志愿者管理', skillType: 2, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '项目专员', duration: '0-2年', milestones: ['执行公益项目', '撰写项目报告', '协助活动组织'] },
      { stageNo: 2, stageName: '项目经理', duration: '3-5年', milestones: ['独立设计项目', '对接资助方', '管理志愿者团队'] },
      { stageNo: 3, stageName: '项目总监/机构负责人', duration: '6年以上', milestones: ['制定机构战略', '拓展资源网络', '对社会影响力负责'] },
    ],
    resources: [
      { title: '公益项目管理与筹款', resourceType: 1, url: 'https://www.coursera.org', skillTags: '项目设计,公益筹款', provider: 'Coursera' },
      { title: '《非营利组织管理》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '公益管理,项目运营', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '文倩', title: '资深公益项目总监', intro: '深耕公益行业多年，帮助新人建立项目设计与筹款能力。', expertise: ['项目设计', '筹款策略', '职业规划'], pricePerHour: 26000, rating: '4.80' },
      { realName: '常宁', title: '社会创新导师', intro: '专注公益创新与志愿者管理，陪伴学员成长为专业项目人。', expertise: ['社会创新', '志愿者管理', '资源链接'], pricePerHour: 24000, rating: '4.73' },
    ],
  },
  {
    careerCode: 'entrepreneur',
    skills: [
      { name: '商业模式设计', skillType: 1, requireLevel: 4, weight: '1.00' },
      { name: '团队搭建与管理', skillType: 2, requireLevel: 4, weight: '0.90' },
      { name: '融资与资源整合', skillType: 1, requireLevel: 3, weight: '0.80' },
    ],
    stages: [
      { stageNo: 1, stageName: '起步期', duration: '0-1年', milestones: ['验证商业假设', '打磨最小可行产品', '组建核心团队'] },
      { stageNo: 2, stageName: '成长期', duration: '2-4年', milestones: ['实现产品市场契合', '完成早期融资', '搭建组织体系'] },
      { stageNo: 3, stageName: '扩张期', duration: '5年以上', milestones: ['规模化增长', '构建管理梯队', '探索第二曲线'] },
    ],
    resources: [
      { title: '从 0 到 1 创业课', resourceType: 1, url: 'https://www.coursera.org', skillTags: '商业模式,创业管理', provider: 'Coursera' },
      { title: '《精益创业》', resourceType: 2, url: 'https://www.ituring.com.cn', skillTags: '精益创业,MVP', provider: '图灵社区' },
    ],
    coaches: [
      { realName: '毕然', title: '连续创业者 · 创业导师', intro: '有多次从 0 到 1 经验，帮助创业者梳理商业模式与融资路径。', expertise: ['商业模式', '融资', '团队管理'], pricePerHour: 60000, rating: '4.90' },
      { realName: '康宇', title: '早期投资人', intro: '专注早期项目辅导，帮助创始人打磨 BP 与增长策略。', expertise: ['BP 打磨', '增长策略', '融资对接'], pricePerHour: 55000, rating: '4.85' },
    ],
  },
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

  // ===== 6. 核心链路 seed：技能/路线图/学习资源/辅导师（按职业关联）=====
  console.log('[seed] 写入核心链路数据（技能/路线图/资源/教练）…');
  let skillCount = 0;
  let roadmapCount = 0;
  let resourceCount = 0;
  let coachCount = 0;

  // 先取出 16 个职业的 id 映射
  const careerRows = await prisma.career.findMany({ select: { id: true, careerCode: true } });
  const careerIdMap = new Map<string, bigint>();
  for (const r of careerRows) careerIdMap.set(r.careerCode, r.id);

  let coachUserSeq = 900001; // 教练占位 userId 自增起点

  for (const cfg of CAREER_LINK_SEED) {
    const careerId = careerIdMap.get(cfg.careerCode);
    if (!careerId) {
      console.warn(`[seed] 跳过：未找到职业 ${cfg.careerCode}`);
      continue;
    }

    // 6.1 技能 career_skill（每职业 3 条）
    for (const s of cfg.skills) {
      const exist = await prisma.careerSkill.findFirst({ where: { careerId, skillName: s.name } });
      const data = { careerId, skillName: s.name, skillType: s.skillType, requireLevel: s.requireLevel, weight: s.weight };
      if (exist) await prisma.careerSkill.update({ where: { id: exist.id }, data });
      else await prisma.careerSkill.create({ data });
      skillCount++;
    }

    // 6.2 路线图 career_roadmap（每职业 3 阶段）
    for (const st of cfg.stages) {
      const exist = await prisma.careerRoadmap.findFirst({ where: { careerId, stageNo: st.stageNo } });
      const data = { careerId, stageNo: st.stageNo, stageName: st.stageName, duration: st.duration, milestones: st.milestones as unknown as object };
      if (exist) await prisma.careerRoadmap.update({ where: { id: exist.id }, data });
      else await prisma.careerRoadmap.create({ data });
      roadmapCount++;
    }

    // 6.3 学习资源 learning_resource（每职业 2 条）
    for (const res of cfg.resources) {
      const exist = await prisma.learningResource.findFirst({ where: { title: res.title, careerId } });
      const data = { title: res.title, resourceType: res.resourceType, url: res.url, skillTags: res.skillTags, careerId, provider: res.provider, status: 1, isDeleted: 0 };
      if (exist) await prisma.learningResource.update({ where: { id: exist.id }, data });
      else await prisma.learningResource.create({ data });
      resourceCount++;
    }

    // 6.4 辅导师 coach（每职业 2 条）
    for (const co of cfg.coaches) {
      const userId = BigInt(coachUserSeq++);
      const exist = await prisma.coach.findFirst({ where: { userId } });
      const data = {
        userId,
        realName: co.realName,
        title: co.title,
        intro: co.intro,
        expertise: co.expertise as unknown as object,
        pricePerHour: BigInt(co.pricePerHour),
        rating: co.rating,
        auditStatus: 1,
        status: 1,
        isDeleted: 0,
      };
      if (exist) await prisma.coach.update({ where: { id: exist.id }, data });
      else await prisma.coach.create({ data });
      coachCount++;
    }
  }
  console.log(`[seed] 核心链路完成：技能 ${skillCount} 条 / 路线图 ${roadmapCount} 条 / 资源 ${resourceCount} 条 / 教练 ${coachCount} 条`);

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