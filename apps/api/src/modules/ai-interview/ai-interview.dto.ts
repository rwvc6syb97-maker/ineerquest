import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * §4.1 开始 AI 模拟面试入参（POST /api/v1/ai/interview/start）。
 * 权限：已登录 + 会员/付费（非会员 4515）。
 */
export class InterviewStartDto {
  @ApiProperty({ description: '目标职业 id（career.id）', example: '10001' })
  @IsString()
  @IsNotEmpty({ message: 'careerId 不能为空' })
  @MaxLength(32, { message: 'careerId 超长' })
  careerId!: string;

  @ApiPropertyOptional({ description: '难度', enum: ['easy', 'medium', 'hard'], default: 'medium' })
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'], { message: 'difficulty 仅支持 easy | medium | hard' })
  difficulty?: 'easy' | 'medium' | 'hard';
}

/** §4.1 提交面试作答入参（POST /api/v1/ai/interview/:interviewId/answer）。 */
export class InterviewAnswerDto {
  @ApiProperty({ description: '本轮作答内容', example: '我认为……' })
  @IsString()
  @IsNotEmpty({ message: 'answer 不能为空' })
  @MaxLength(2000, { message: 'answer 超长' })
  answer!: string;
}

/** §4.1 开始面试出参。 */
export class InterviewStartVo {
  @ApiProperty({ description: '面试会话 id（ai_interview.id）' })
  interviewId!: string;

  @ApiProperty({ description: '首个面试问题' })
  firstQuestion!: string;
}

/** §4.1 作答评分出参。 */
export class InterviewAnswerVo {
  @ApiProperty({ description: '本轮评分（0~100）' })
  score!: number;

  @ApiProperty({ description: '本轮反馈' })
  feedback!: string;

  @ApiPropertyOptional({ description: '下一个问题；面试结束时为空' })
  nextQuestion?: string;

  @ApiProperty({ description: '面试是否已结束' })
  finished!: boolean;

  @ApiProperty({ description: '是否走了降级兜底' })
  degraded!: boolean;
}

/** 面试维度评分。 */
export class InterviewDimensionVo {
  @ApiProperty({ description: '维度名' })
  name!: string;

  @ApiProperty({ description: '维度分（0~100）' })
  score!: number;
}

/** §4.1 面试报告出参。 */
export class InterviewReportVo {
  @ApiProperty({ description: '综合总分（0~100）' })
  overallScore!: number;

  @ApiProperty({ description: '各维度评分', type: [InterviewDimensionVo] })
  dimensions!: InterviewDimensionVo[];

  @ApiProperty({ description: '改进建议', type: [String] })
  suggestions!: string[];
}