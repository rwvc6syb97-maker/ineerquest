import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * §2.1 AI 动态成长计划入参（POST /api/v1/ai/career/growth-plan）。
 * 后端二次校验：careerId 必填、targetMonths 1~24、currentSkills 可选且逐项限长。
 * 与规则版 career_roadmap 分表落库（护城河）。
 */
export class GrowthPlanDto {
  @ApiProperty({ description: '职业 id（career.id）', example: '10001' })
  @IsString()
  @IsNotEmpty({ message: 'careerId 不能为空' })
  @MaxLength(32, { message: 'careerId 超长' })
  careerId!: string;

  @ApiProperty({ description: '目标月数（1~24）', example: 6 })
  @IsInt({ message: 'targetMonths 必须为整数' })
  @Min(1, { message: 'targetMonths 越界（1~24）' })
  @Max(24, { message: 'targetMonths 越界（1~24）' })
  targetMonths!: number;

  @ApiPropertyOptional({ description: '已具备技能（可选）', type: [String], example: ['SQL', '沟通'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50, { message: 'currentSkills 数量超限' })
  @IsString({ each: true })
  @MaxLength(64, { each: true, message: 'currentSkills 单项超长' })
  currentSkills?: string[];
}

/** 单个任务。 */
export class GrowthTaskVo {
  @ApiProperty({ description: '任务标题' })
  title!: string;

  @ApiPropertyOptional({ description: '参考资源链接（可选）' })
  resourceUrl?: string;
}

/** 单周计划。 */
export class GrowthWeekVo {
  @ApiProperty({ description: '第几周（从 1 开始）' })
  weekNo!: number;

  @ApiProperty({ description: '本周主题' })
  theme!: string;

  @ApiProperty({ description: '本周任务列表', type: [GrowthTaskVo] })
  tasks!: GrowthTaskVo[];
}

/** §2.1 成长计划出参。 */
export class GrowthPlanVo {
  @ApiProperty({ description: '计划 id（career_growth_plan.id）' })
  planId!: string;

  @ApiProperty({ description: '分周计划', type: [GrowthWeekVo] })
  weeks!: GrowthWeekVo[];

  @ApiProperty({ description: '是否走了降级兜底（LLM 失败/超时时为 true）' })
  degraded!: boolean;
}