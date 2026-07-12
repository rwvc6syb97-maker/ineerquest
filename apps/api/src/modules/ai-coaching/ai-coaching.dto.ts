import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** §2.2 咨询前梳理——单条问答。 */
export class PreBriefAnswerDto {
  @ApiProperty({ description: '引导问题', maxLength: 256 })
  @IsString()
  @IsNotEmpty({ message: 'question 不能为空' })
  @MaxLength(256, { message: 'question 过长' })
  question!: string;

  @ApiProperty({ description: '用户回答', maxLength: 2000 })
  @IsString()
  @IsNotEmpty({ message: 'answer 不能为空' })
  @MaxLength(2000, { message: 'answer 过长' })
  answer!: string;
}

/** §2.2 POST /ai/coaching/pre-brief 入参。 */
export class PreBriefDto {
  @ApiProperty({ description: '咨询订单 id', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: 'orderId 不能为空' })
  @MaxLength(32)
  orderId!: string;

  @ApiProperty({ description: '引导问答列表', type: [PreBriefAnswerDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'answers 不能为空' })
  @ArrayMaxSize(30, { message: 'answers 过多' })
  @ValidateNested({ each: true })
  @Type(() => PreBriefAnswerDto)
  answers!: PreBriefAnswerDto[];
}

/** §2.2 出参。 */
export class PreBriefVo {
  @ApiProperty({ description: '提纲 id' })
  briefId!: string;

  @ApiProperty({ description: '结构化提纲' })
  outline!: string;

  @ApiProperty({ description: '标签', type: [String] })
  tags!: string[];

  @ApiProperty({ description: '是否降级兜底' })
  degraded!: boolean;
}

/** §2.3 POST /ai/coaching/summary 入参。 */
export class SummaryDto {
  @ApiProperty({ description: '咨询订单 id', maxLength: 32 })
  @IsString()
  @IsNotEmpty({ message: 'orderId 不能为空' })
  @MaxLength(32)
  orderId!: string;
}

/** §2.3 待办项。 */
export class SummaryTodoVo {
  @ApiProperty({ description: '待办标题' })
  title!: string;

  @ApiProperty({ description: '是否完成', default: false })
  done!: boolean;
}

/** §2.3 出参。 */
export class SummaryVo {
  @ApiProperty({ description: '纪要 id' })
  summaryId!: string;

  @ApiProperty({ description: '行动纪要' })
  summary!: string;

  @ApiProperty({ description: '待办清单', type: [SummaryTodoVo] })
  todos!: SummaryTodoVo[];

  @ApiProperty({ description: '是否降级兜底' })
  degraded!: boolean;
}

/** §2.4 POST /ai/coaching/match 入参。 */
export class MatchDto {
  @ApiProperty({ description: '咨询诉求描述', maxLength: 500 })
  @IsString()
  @IsNotEmpty({ message: 'demand 不能为空' })
  @MaxLength(500, { message: 'demand 超长（≤500字）' })
  demand!: string;

  @ApiPropertyOptional({ description: '返回条数', default: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'topN 最小为 1' })
  @Max(10, { message: 'topN 最大为 10' })
  topN?: number;
}

/** §2.4 单条匹配结果。 */
export class MatchItemVo {
  @ApiProperty({ description: '辅导师 id' })
  coachId!: string;

  @ApiProperty({ description: '辅导师姓名' })
  name!: string;

  @ApiProperty({ description: '匹配度 0~100' })
  matchScore!: number;

  @ApiProperty({ description: '匹配理由' })
  reason!: string;
}

/** §2.4 出参。 */
export class MatchVo {
  @ApiProperty({ description: '匹配列表', type: [MatchItemVo] })
  matches!: MatchItemVo[];

  @ApiProperty({ description: '是否降级兜底' })
  degraded!: boolean;
}