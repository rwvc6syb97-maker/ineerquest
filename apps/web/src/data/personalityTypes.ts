/**
 * 16 型 MBTI 人格静态数据（拟真中文文案，禁 Lorem ipsum）
 * -------------------------------------------------------------
 * 供 P02 总览页与 P03 详情页消费。族群映射复用 theme/tokens.ts。
 */
import type { Family } from '../theme/tokens';

export interface DimensionScore {
  /** 维度名 */
  label: string;
  /** 左极标签 */
  leftPole: string;
  /** 右极标签 */
  rightPole: string;
  /** 0-100，越大越偏右极 */
  value: number;
}

export interface CareerFit {
  /** 职业名 */
  title: string;
  /** 匹配度 0-100 */
  match: number;
}

export interface PersonalityType {
  /** 四字母类型码，如 "INTJ" */
  code: string;
  /** 中文昵称，如 "建筑师" */
  nickname: string;
  /** 英文别名 */
  alias: string;
  /** 所属族群 */
  family: Family;
  /** 一句话主张 */
  tagline: string;
  /** 人群占比（拟真） */
  population: string;
  /** 概述段落 */
  overview: string;
  /** 核心特质关键词 */
  traits: string[];
  /** 优势 */
  strengths: string[];
  /** 潜在盲点 */
  weaknesses: string[];
  /** 职业倾向 */
  careers: CareerFit[];
  /** 名人案例 */
  famous: string[];
  /** 四维度倾向 */
  dimensions: DimensionScore[];
  /** 内省寄语（serif 引文） */
  quote: string;
}

/** 构造四维度分数的便捷函数 */
function dims(ei: number, sn: number, tf: number, jp: number): DimensionScore[] {
  return [
    { label: '能量来源', leftPole: '内向 I', rightPole: '外向 E', value: ei },
    { label: '认知方式', leftPole: '实感 S', rightPole: '直觉 N', value: sn },
    { label: '决策依据', leftPole: '思考 T', rightPole: '情感 F', value: tf },
    { label: '生活态度', leftPole: '判断 J', rightPole: '知觉 P', value: jp },
  ];
}

export const PERSONALITY_TYPES: PersonalityType[] = [
  // ============ NT 分析家 ============
  {
    code: 'INTJ',
    nickname: '建筑师',
    alias: 'Architect',
    family: 'analyst',
    tagline: '一切皆有系统，一切皆可优化。',
    population: '约占人口 2.1%',
    overview:
      '建筑师是富有想象力又极具战略头脑的思考者，凡事都要有计划。他们能在纷繁表象下看清底层结构，并以惊人的意志力推动长期目标的实现。独立、理性、笃信能力胜过资历，是他们最鲜明的标签。',
    traits: ['战略远见', '独立自主', '理性克制', '追求精通'],
    strengths: ['善于制定长远规划并坚定执行', '在复杂问题中快速识别关键变量', '对自我与他人都保持高标准'],
    weaknesses: ['有时显得过于批判、难以共情', '不耐烦于低效流程与情绪化沟通', '容易低估人际关系的隐性价值'],
    careers: [
      { title: '战略咨询顾问', match: 94 },
      { title: '系统架构师', match: 92 },
      { title: '投资分析师', match: 88 },
      { title: '科研工作者', match: 86 },
    ],
    famous: ['埃隆·马斯克', '尼古拉·特斯拉', '克里斯托弗·诺兰'],
    dimensions: dims(22, 82, 30, 24),
    quote: '真正的自由，是有能力独自把一件复杂的事做成。',
  },
  {
    code: 'INTP',
    nickname: '逻辑学家',
    alias: 'Logician',
    family: 'analyst',
    tagline: '为知识本身而痴迷的思想者。',
    population: '约占人口 3.3%',
    overview:
      '逻辑学家对世界抱有永不满足的好奇，热衷于拆解概念、构建理论、寻找规律。他们享受纯粹的思辨，常常沉浸在自己的思维宇宙里，为一个精巧的想法而兴奋不已。',
    traits: ['抽象思辨', '客观中立', '灵活开放', '追根究底'],
    strengths: ['擅长发现逻辑漏洞与隐藏关联', '思维开放，乐于接纳新观点', '在无人涉足的领域独立探索'],
    weaknesses: ['执行力与落地常滞后于构想', '易忽视情感与现实约束', '难以忍受重复与琐碎事务'],
    careers: [
      { title: '算法研究员', match: 93 },
      { title: '数据科学家', match: 90 },
      { title: '大学教授', match: 87 },
      { title: '产品架构师', match: 84 },
    ],
    famous: ['阿尔伯特·爱因斯坦', '比尔·盖茨', '玛丽·居里'],
    dimensions: dims(20, 85, 28, 72),
    quote: '我不是失败了，我只是找到了一万种行不通的方法。',
  },
  {
    code: 'ENTJ',
    nickname: '指挥官',
    alias: 'Commander',
    family: 'analyst',
    tagline: '天生的领导者，为目标而生。',
    population: '约占人口 1.8%',
    overview:
      '指挥官是果决而富有魅力的领导者，擅长把混乱化为秩序、把愿景变为路线图。他们享受挑战，从不畏惧艰难决策，总能激励团队朝着宏大目标前进。',
    traits: ['领导魄力', '高效果断', '战略布局', '结果导向'],
    strengths: ['卓越的组织与决策能力', '善于凝聚资源、推动执行', '在压力下依然清醒自信'],
    weaknesses: ['有时过于强势、缺乏耐心', '容易忽略团队的情感需求', '对失败的容忍度偏低'],
    careers: [
      { title: '企业高管 / CEO', match: 95 },
      { title: '管理咨询合伙人', match: 91 },
      { title: '投资并购总监', match: 88 },
      { title: '创业公司创始人', match: 90 },
    ],
    famous: ['史蒂夫·乔布斯', '玛格丽特·撒切尔', '戈登·拉姆齐'],
    dimensions: dims(78, 80, 26, 22),
    quote: '愿景若不能付诸行动，便只是一场白日梦。',
  },
  {
    code: 'ENTP',
    nickname: '辩论家',
    alias: 'Debater',
    family: 'analyst',
    tagline: '为思想的碰撞而生的挑战者。',
    population: '约占人口 3.2%',
    overview:
      '辩论家机敏、健谈，热爱智力上的交锋。他们乐于挑战既有观念、探索各种可能，总能从意想不到的角度提出创见，是天生的头脑风暴引擎。',
    traits: ['思维敏捷', '善于创新', '能言善辩', '不拘一格'],
    strengths: ['极强的创意与应变能力', '善于说服与激发讨论', '对新事物保持旺盛热情'],
    weaknesses: ['容易半途而废、缺乏耐心', '有时为辩而辩、忽视他人感受', '不喜欢被规则与细节束缚'],
    careers: [
      { title: '创新产品经理', match: 92 },
      { title: '创业者', match: 90 },
      { title: '市场营销总监', match: 87 },
      { title: '风险投资人', match: 85 },
    ],
    famous: ['托马斯·爱迪生', '莱昂纳多·达·芬奇', '罗伯特·唐尼'],
    dimensions: dims(74, 83, 34, 74),
    quote: '真理越辩越明，可能越想越多。',
  },

  // ============ NF 外交家 ============
  {
    code: 'INFJ',
    nickname: '提倡者',
    alias: 'Advocate',
    family: 'diplomat',
    tagline: '安静的理想主义者，心怀改变世界之志。',
    population: '约占人口 1.5%',
    overview:
      '提倡者是最稀有的类型，兼具深邃的洞察与坚定的信念。他们温和却有原则，善于理解他人内心，并渴望为世界带来有意义的改变。',
    traits: ['深度共情', '理想坚定', '洞察人心', '内省深刻'],
    strengths: ['敏锐感知他人情绪与动机', '为信念全力以赴', '兼具创造力与执行力'],
    weaknesses: ['过度理想化易失望', '倾向压抑自我需求', '容易身心俱疲'],
    careers: [
      { title: '心理咨询师', match: 93 },
      { title: '非营利组织负责人', match: 90 },
      { title: '作家 / 编剧', match: 88 },
      { title: '用户体验研究员', match: 85 },
    ],
    famous: ['马丁·路德·金', '柏拉图', '妮可·基德曼'],
    dimensions: dims(24, 80, 68, 26),
    quote: '哪怕微光，也要为需要的人点亮。',
  },
  {
    code: 'INFP',
    nickname: '调停者',
    alias: 'Mediator',
    family: 'diplomat',
    tagline: '诗意的灵魂，追寻内心的真实。',
    population: '约占人口 4.4%',
    overview:
      '调停者是理想主义的梦想家，重视价值观胜过一切。他们富有想象力与同理心，渴望活出真实的自我，并帮助他人找到属于自己的意义。',
    traits: ['价值驱动', '富有想象', '温柔真诚', '追求意义'],
    strengths: ['深切的同理心与包容', '强大的创意与表达欲', '对理想的执着坚守'],
    weaknesses: ['不切实际、易逃避现实', '对批评过度敏感', '难以在琐事中保持专注'],
    careers: [
      { title: '文字创作者', match: 92 },
      { title: '心理治疗师', match: 89 },
      { title: '插画 / 设计师', match: 87 },
      { title: '公益项目策划', match: 84 },
    ],
    famous: ['威廉·莎士比亚', 'J.R.R. 托尔金', '约翰尼·德普'],
    dimensions: dims(22, 78, 72, 70),
    quote: '不是所有漫游的人，都迷失了方向。',
  },
  {
    code: 'ENFJ',
    nickname: '主人公',
    alias: 'Protagonist',
    family: 'diplomat',
    tagline: '天生的引路人，点燃他人的潜能。',
    population: '约占人口 2.5%',
    overview:
      '主人公富有魅力与感召力，天生擅长激励他人。他们真诚地关心身边的人，善于凝聚共识，总能带领团队走向更好的方向。',
    traits: ['感召力强', '利他温暖', '善于沟通', '组织领导'],
    strengths: ['卓越的人际影响力', '真诚关怀、激发他人潜能', '善于化解冲突、凝聚团队'],
    weaknesses: ['过度在意他人评价', '容易牺牲自我边界', '面对批评时较为脆弱'],
    careers: [
      { title: '教师 / 培训师', match: 93 },
      { title: '人力资源总监', match: 90 },
      { title: '公共关系经理', match: 87 },
      { title: '团队教练', match: 88 },
    ],
    famous: ['巴拉克·奥巴马', '奥普拉·温弗瑞', '玛雅·安杰卢'],
    dimensions: dims(76, 76, 70, 28),
    quote: '看见他人的光，是我一生的使命。',
  },
  {
    code: 'ENFP',
    nickname: '竞选者',
    alias: 'Campaigner',
    family: 'diplomat',
    tagline: '热情洋溢的自由灵魂，永远充满可能。',
    population: '约占人口 8.1%',
    overview:
      '竞选者充满热情与创造力，把生活看作一场充满可能的冒险。他们善于与人建立情感连接，总能在平凡中发现火花，感染身边每一个人。',
    traits: ['热情外放', '创意无限', '善解人意', '崇尚自由'],
    strengths: ['极具感染力与社交魅力', '思维发散、点子层出不穷', '对人真诚、乐于成就他人'],
    weaknesses: ['注意力易分散、难以坚持', '情绪起伏较大', '不擅长处理枯燥细节'],
    careers: [
      { title: '品牌创意总监', match: 91 },
      { title: '记者 / 主持人', match: 88 },
      { title: '活动策划人', match: 86 },
      { title: '创业合伙人', match: 85 },
    ],
    famous: ['罗宾·威廉姆斯', '沃尔特·迪士尼', '艾伦·德詹尼丝'],
    dimensions: dims(80, 79, 66, 76),
    quote: '生命的意义，在于点燃更多的生命。',
  },

  // ============ SJ 守护者 ============
  {
    code: 'ISTJ',
    nickname: '物流师',
    alias: 'Logistician',
    family: 'sentinel',
    tagline: '值得信赖的实干者，言出必行。',
    population: '约占人口 11.6%',
    overview:
      '物流师务实、可靠，笃信责任与秩序。他们尊重事实与传统，做事一丝不苟，是任何组织中最值得托付的中坚力量。',
    traits: ['责任可靠', '注重事实', '条理严谨', '坚守承诺'],
    strengths: ['极强的责任心与执行力', '严谨细致、注重细节', '稳定可靠、信守承诺'],
    weaknesses: ['过于固守成规、抗拒变化', '有时显得刻板缺乏灵活', '不善表达情感'],
    careers: [
      { title: '财务总监 / 审计师', match: 92 },
      { title: '项目管理专家', match: 89 },
      { title: '法务合规经理', match: 87 },
      { title: '运维工程师', match: 85 },
    ],
    famous: ['乔治·华盛顿', '沃伦·巴菲特', '安格拉·默克尔'],
    dimensions: dims(26, 24, 30, 22),
    quote: '把每一件小事做对，才有资格谈大事。',
  },
  {
    code: 'ISFJ',
    nickname: '守护者',
    alias: 'Defender',
    family: 'sentinel',
    tagline: '温暖的守护者，默默守护所珍视的一切。',
    population: '约占人口 13.8%',
    overview:
      '守护者是最尽责的类型之一，温和体贴、心思细腻。他们乐于照顾他人，把关怀落到实处，是团队与家庭里最坚实的后盾。',
    traits: ['体贴细致', '尽职尽责', '踏实可靠', '默默奉献'],
    strengths: ['无微不至的关怀与责任感', '踏实勤恳、值得信赖', '记忆力强、注重实际需求'],
    weaknesses: ['不善拒绝、易被过度索取', '压抑自身情绪与需求', '对变化较为抗拒'],
    careers: [
      { title: '护理 / 医护人员', match: 92 },
      { title: '行政 / 后勤主管', match: 88 },
      { title: '小学教师', match: 87 },
      { title: '客户成功经理', match: 84 },
    ],
    famous: ['特蕾莎修女', '比尤斯女王', '罗莎·帕克斯'],
    dimensions: dims(24, 26, 70, 24),
    quote: '被需要，是我最踏实的幸福。',
  },
  {
    code: 'ESTJ',
    nickname: '总经理',
    alias: 'Executive',
    family: 'sentinel',
    tagline: '出色的管理者，让一切井然有序。',
    population: '约占人口 8.7%',
    overview:
      '总经理是天生的组织者，果断、务实、崇尚秩序。他们擅长制定规则、推动落实，总能把混乱的局面梳理得井井有条。',
    traits: ['组织高效', '果断务实', '尊重秩序', '责任担当'],
    strengths: ['出色的组织与管理能力', '果断执行、说到做到', '维护规则、公正可靠'],
    weaknesses: ['过于强硬、缺乏弹性', '难以接受非常规做法', '有时忽视他人情感'],
    careers: [
      { title: '运营总监', match: 92 },
      { title: '银行分行行长', match: 88 },
      { title: '军警指挥官', match: 86 },
      { title: '供应链经理', match: 85 },
    ],
    famous: ['约翰·D·洛克菲勒', '希拉里·克林顿', '朱迪法官'],
    dimensions: dims(78, 26, 30, 22),
    quote: '规则不是束缚，而是让好事更快发生。',
  },
  {
    code: 'ESFJ',
    nickname: '执政官',
    alias: 'Consul',
    family: 'sentinel',
    tagline: '热心的社群纽带，让人倍感温暖。',
    population: '约占人口 12.0%',
    overview:
      '执政官热情、尽责，天生擅长照顾他人、维系关系。他们重视和谐与归属，乐于为集体付出，是社群里最受欢迎的组织者。',
    traits: ['热心助人', '重视和谐', '组织能力', '忠诚可靠'],
    strengths: ['强大的人际连接与协调力', '尽心尽责、乐于奉献', '善于营造归属与温暖'],
    weaknesses: ['过于在意他人看法', '难以接受批评', '有时回避冲突与变化'],
    careers: [
      { title: '客户关系总监', match: 90 },
      { title: '活动 / 会务经理', match: 88 },
      { title: '护士长', match: 86 },
      { title: '销售团队主管', match: 85 },
    ],
    famous: ['泰勒·斯威夫特', '比尔·克林顿', '珍妮弗·加纳'],
    dimensions: dims(80, 28, 72, 26),
    quote: '把每个人照顾好，团队自然会发光。',
  },

  // ============ SP 探险家 ============
  {
    code: 'ISTP',
    nickname: '鉴赏家',
    alias: 'Virtuoso',
    family: 'explorer',
    tagline: '冷静的实践派，动手解决一切。',
    population: '约占人口 5.4%',
    overview:
      '鉴赏家是天生的工匠与问题解决者，冷静、灵巧、务实。他们热衷动手探索事物运作原理，在危机中总能保持镇定并快速找到方案。',
    traits: ['动手能力', '冷静灵活', '务实高效', '独立自主'],
    strengths: ['卓越的实操与应急能力', '冷静理性、临危不乱', '灵活适应、乐于探索'],
    weaknesses: ['不喜长期承诺与规划', '容易冲动冒险', '不善表达情感'],
    careers: [
      { title: '工程师 / 技师', match: 91 },
      { title: '飞行员 / 驾驶员', match: 87 },
      { title: '外科医生', match: 86 },
      { title: '数据安全专家', match: 84 },
    ],
    famous: ['迈克尔·乔丹', '克林特·伊斯特伍德', '贝爷（贝尔·格里尔斯）'],
    dimensions: dims(26, 30, 32, 74),
    quote: '与其空谈，不如亲手把它拆开看看。',
  },
  {
    code: 'ISFP',
    nickname: '探险家',
    alias: 'Adventurer',
    family: 'explorer',
    tagline: '灵动的艺术家，活在当下的美里。',
    population: '约占人口 8.8%',
    overview:
      '探险家是敏感而灵动的艺术家，热爱美与自由。他们活在当下，用行动而非言语表达自我，总能在平凡生活里创造出独特的诗意。',
    traits: ['艺术敏感', '随性自由', '温柔谦逊', '活在当下'],
    strengths: ['敏锐的审美与创造力', '随和包容、易于相处', '行动力强、勇于尝试'],
    weaknesses: ['不喜长远规划', '对压力较为敏感', '容易回避冲突'],
    careers: [
      { title: '设计师 / 艺术家', match: 91 },
      { title: '摄影师', match: 88 },
      { title: '厨师 / 调香师', match: 85 },
      { title: '理疗 / 康复师', match: 83 },
    ],
    famous: ['迈克尔·杰克逊', '弗里达·卡罗', '碧昂丝'],
    dimensions: dims(28, 32, 70, 76),
    quote: '美不需要理由，感受到了，就足够。',
  },
  {
    code: 'ESTP',
    nickname: '企业家',
    alias: 'Entrepreneur',
    family: 'explorer',
    tagline: '大胆的行动派，敢闯敢拼。',
    population: '约占人口 4.3%',
    overview:
      '企业家精力充沛、机敏果敢，热爱在真实世界里冒险。他们善于把握机会、临场应变，总能以行动打破僵局，是充满能量的开拓者。',
    traits: ['行动果敢', '机敏应变', '善于社交', '追求刺激'],
    strengths: ['敏锐把握机会、当机立断', '出色的临场应变与社交力', '充满活力、勇于冒险'],
    weaknesses: ['缺乏耐心与长远规划', '容易冲动冒进', '不喜受规则束缚'],
    careers: [
      { title: '销售总监', match: 90 },
      { title: '创业者', match: 89 },
      { title: '危机公关顾问', match: 85 },
      { title: '职业运动员', match: 84 },
    ],
    famous: ['欧内斯特·海明威', '麦当娜', '杰克·尼科尔森'],
    dimensions: dims(82, 34, 34, 78),
    quote: '机会不等人，先干起来再说。',
  },
  {
    code: 'ESFP',
    nickname: '表演者',
    alias: 'Entertainer',
    family: 'explorer',
    tagline: '天生的焦点，把快乐带给每个人。',
    population: '约占人口 8.5%',
    overview:
      '表演者热情、活泼，天生擅长活跃气氛。他们享受当下、热爱与人相处，用真挚的能量感染周围，让平凡的时刻变得难忘。',
    traits: ['活力四射', '热情友善', '临场表现', '乐于分享'],
    strengths: ['极强的感染力与表现力', '热情友善、善于活跃氛围', '适应力强、乐于尝试'],
    weaknesses: ['不喜规划、易分心', '对批评较敏感', '难以专注长期目标'],
    careers: [
      { title: '演员 / 主持人', match: 90 },
      { title: '活动主理人', match: 87 },
      { title: '导游 / 体验官', match: 84 },
      { title: '销售顾问', match: 83 },
    ],
    famous: ['玛丽莲·梦露', '威尔·史密斯', '贾斯汀·比伯'],
    dimensions: dims(84, 34, 72, 78),
    quote: '此刻的快乐，就是最真实的意义。',
  },
];

/** 类型码 → 数据 的快速索引 */
export const TYPE_MAP: Record<string, PersonalityType> = Object.fromEntries(
  PERSONALITY_TYPES.map((t) => [t.code, t]),
);

/** 按族群取类型 */
export function typesByFamily(family: Family): PersonalityType[] {
  return PERSONALITY_TYPES.filter((t) => t.family === family);
}