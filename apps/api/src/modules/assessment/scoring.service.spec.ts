import { ScoringService, ScoredAnswer } from './scoring.service';
import { Dimension, Polarity, TypeGroup } from './assessment.constants';

/**
 * ScoringService 最小单测：验证纯规则计分四字母判定与分组。
 * 严禁任何 LLM/网络依赖，纯确定性输入输出。
 */
describe('ScoringService', () => {
  const service = new ScoringService();

  /** 构造四维各一条答案的辅助函数。 */
  const build = (polarity: number, score = 10): ScoredAnswer[] =>
    [Dimension.EI, Dimension.SN, Dimension.TF, Dimension.JP].map((dimension) => ({
      dimension,
      polarity,
      score,
    }));

  it('全部 polarity=1 → ESTJ（SJ 守护者）', () => {
    const r = service.score(build(Polarity.FIRST));
    expect(r.mbtiType).toBe('ESTJ');
    expect(r.typeGroup).toBe(TypeGroup.SENTINEL);
    expect(r.isAbnormal).toBe(false);
    expect(r.scoreEi).toBe(100);
  });

  it('全部 polarity=2 → INFP（NF 外交家）', () => {
    const r = service.score(build(Polarity.SECOND));
    expect(r.mbtiType).toBe('INFP');
    expect(r.typeGroup).toBe(TypeGroup.DIPLOMAT);
    expect(r.isAbnormal).toBe(false);
  });

  it('混合极性 → 逐维按优势极判定字母', () => {
    const answers: ScoredAnswer[] = [
      { dimension: Dimension.EI, polarity: Polarity.SECOND, score: 8 }, // I
      { dimension: Dimension.SN, polarity: Polarity.SECOND, score: 8 }, // N
      { dimension: Dimension.TF, polarity: Polarity.FIRST, score: 8 }, // T
      { dimension: Dimension.JP, polarity: Polarity.FIRST, score: 8 }, // J
    ];
    const r = service.score(answers);
    expect(r.mbtiType).toBe('INTJ');
    expect(r.typeGroup).toBe(TypeGroup.ANALYST);
  });

  it('单维度平票 → isAbnormal=true 且偏向第二极', () => {
    const answers: ScoredAnswer[] = [
      { dimension: Dimension.EI, polarity: Polarity.FIRST, score: 5 },
      { dimension: Dimension.EI, polarity: Polarity.SECOND, score: 5 }, // EI 平票
      { dimension: Dimension.SN, polarity: Polarity.FIRST, score: 5 }, // S
      { dimension: Dimension.TF, polarity: Polarity.FIRST, score: 5 }, // T
      { dimension: Dimension.JP, polarity: Polarity.FIRST, score: 5 }, // J
    ];
    const r = service.score(answers);
    expect(r.isAbnormal).toBe(true);
    expect(r.mbtiType.charAt(0)).toBe('I'); // 平票偏向第二极
    expect(r.mbtiType).toBe('ISTJ');
  });

  it('偏好百分比按优势极占比计算', () => {
    const answers: ScoredAnswer[] = [
      { dimension: Dimension.EI, polarity: Polarity.FIRST, score: 7 },
      { dimension: Dimension.EI, polarity: Polarity.SECOND, score: 3 },
    ];
    const r = service.score(answers);
    expect(r.scoreEi).toBe(70);
  });

  it('无作答维度 → percent 记为 50', () => {
    const r = service.score([]);
    expect(r.scoreEi).toBe(50);
    expect(r.mbtiType).toBe('INFP'); // 无作答全部偏向第二极
  });
});