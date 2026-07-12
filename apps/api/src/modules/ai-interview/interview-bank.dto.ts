import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** §4.2 题库列表查询参数（GET /ai/interview/questions）。 */
export class QuestionListQueryDto {
  @ApiProperty({ description: '职业 ID', example: '1' })
  @IsNotEmpty({ message: 'careerId 不能为空' })
  @IsString()
  careerId!: string;

  @ApiPropertyOptional({ description: '难度', enum: ['easy', 'medium', 'hard'] })
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'], { message: 'difficulty 非法' })
  difficulty?: string;

  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 题库列表项。 */
export class QuestionItemVo {
  @ApiProperty({ description: '题目 ID' })
  qId!: string;

  @ApiProperty({ description: '题干' })
  question!: string;

  @ApiProperty({ description: '标签', type: [String] })
  tags!: string[];
}

/** 题库列表返回。 */
export class QuestionListVo {
  @ApiProperty({ type: [QuestionItemVo] })
  list!: QuestionItemVo[];

  @ApiProperty({ description: '总数' })
  total!: number;
}

/** §4.2 单题评分入参（POST /ai/interview/questions/:qId/score）。 */
export class QuestionScoreDto {
  @ApiProperty({ description: '用户作答', example: '我认为……' })
  @IsNotEmpty({ message: 'answer 不能为空' })
  @IsString()
  @MaxLength(5000, { message: 'answer 超长' })
  answer!: string;
}

/** 单题评分返回。 */
export class QuestionScoreVo {
  @ApiProperty({ description: '评分 0~100' })
  score!: number;

  @ApiProperty({ description: '反馈' })
  feedback!: string;

  @ApiProperty({ description: '参考答案' })
  sampleAnswer!: string;
}