import { AiCalibrationService } from './ai-calibration.service';
import { BizCode } from '../../common/response';

/**
 * L-P0-3 · AiCalibrationService 单测（纯内存 mock，无真实 DB/LLM）。
 *
 * 逐条验收断言：
 *  - check 有临界维度 → 返回追问题目（percent∈[50,55]）
 *  - check 无临界维度 → 抛 NO_NEED_CALIBRATE(4514)
 *  - mustOwnResult 查无/非本人/非法 id → 抛 ASSESSMENT_RECORD_NOT_FOUND(4203)
 *  - submit 正常重算 → 落 calibrated=1 + calibrationData（不写 mbtiType）
 *  - submit 幂等：calibrated=1 → 抛 DUPLICATE_SUBMIT(4090)
 *  - submit 类型变化 changed 判定正确
 */
describe('AiCalibrationService (L-P0-3 追问式测评校准)', () => {
  const USER = '1001';

  /** Prisma mock：单条 assessmentResult 行。EI 临界(52)，其余清晰。 */
  const makePrisma = (row?: Partial<any>) => {
    const base ={
      id: 5n,
      userId: BigInt(USER),
      mbtiType: 'ENTJ',
      scoreEi: 52, // 临界
      scoreSn: 80,
      scoreTf: 75,
      scoreJp: 90,
      calibrated: 0,
      calibrationData: null,
      ...row,
    };
    return {
      base,
      updated: null as any,
      assessmentResult: {
  findFirst: jest.fn(async () => base),
        update: jest.fn(async ({ data }: any) => ({ ...base, ...data })),
      },
    } as any;
  };

  const build = (prisma?: any) => {
    const p = prisma ?? makePrisma();
    const svc = new AiCalibrationService(p);
    return { svc, prisma: p };
  };

  it('check 有临界维度 → 返回 EI 追问题目', async () => {
    const { svc } = build();
    const vo = await svc.check(USER, '5');
    expect(vo.mbtiType).toBe('ENTJ');
    expect(vo.questions).toHaveLength(1);
    expect(vo.questions[0].dimension).toBe('EI');
    expect(vo.questions[0].options).toHaveLength(2);
  });

  it('check 无临界维度 → 抛 4514', async () => {
    const prisma = makePrisma({ scoreEi: 80 }); // 全部清晰
    const { svc } = build(prisma);
    await expect(svc.check(USER, '5')).rejects.toMatchObject({
      bizCode: BizCode.NO_NEED_CALIBRATE,
    });
  });

  it('查无结果 → 抛 4203', async () => {
    const prisma = makePrisma();
    prisma.assessmentResult.findFirst = jest.fn(async () => null);
    const { svc } = build(prisma);
    await expect(svc.check(USER, '5')).rejects.toMatchObject({
      bizCode: BizCode.ASSESSMENT_RECORD_NOT_FOUND,
    });
  });

  it('非法 resultId → 抛 4203', async () => {
    const { svc } = build();
    await expect(svc.check(USER, 'abc')).rejects.toMatchObject({
      bizCode: BizCode.ASSESSMENT_RECORD_NOT_FOUND,
    });
  });

  it('submit 正常：EI 选 second → 重算 INTJ、changed=true、落 calibrated=1 不写 mbtiType', async () => {
    const { svc, prisma } = build();
    const vo = await svc.submit(USER, '5', {
      answers: [{ dimension: 'EI', choice: 'second' }],
    });
    expect(vo.originalType).toBe('ENTJ');
    expect(vo.calibratedType).toBe('INTJ');
    expect(vo.changed).toBe(true);
    const arg = prisma.assessmentResult.update.mock.calls[0][0];
    expect(arg.data.calibrated).toBe(1);
    expect(arg.data.calibrationData.calibratedType).toBe('INTJ');
    expect(arg.data.mbtiType).toBeUndefined(); // 护城河：不写本体 mbtiType
  });

  it('submit 选 first（维持 E）→ changed=false', async () => {
    const { svc } = build();
    const vo = await svc.submit(USER, '5', {
      answers: [{ dimension: 'EI', choice: 'first' }],
    });
    expect(vo.calibratedType).toBe('ENTJ');
    expect(vo.changed).toBe(false);
  });

  it('submit 幂等：calibrated=1 → 抛 4090', async () => {
    const prisma = makePrisma({ calibrated: 1 });
    const { svc } = build(prisma);
    await expect(
      svc.submit(USER, '5', { answers: [{ dimension: 'EI', choice: 'second' }] }),
    ).rejects.toMatchObject({ bizCode: BizCode.DUPLICATE_SUBMIT });
  });
});