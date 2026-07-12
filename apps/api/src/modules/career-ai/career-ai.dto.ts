import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * §4.4 AI 辅助职业库生产 DTO/VO（仅管理员）。
 * 契约：PRD §4.4；错误码 4001/4030(越权)/4005/4460/4461/4462/5002/5003。
 * 红线 S-04：草稿先入 career_ai_draft，approve 才同步 career/career_skill；
 * 红线 S-05：refSources 严禁招聘平台（命中抛 4005）。
 */

/** 生成职业草稿入参 */
export class CareerGenerateDto {
  @ApiProperty({ description: '职业名', example: '数据分析师' })
  @IsString()
  @IsNotEmpty({ message: 'name 不能为空' })
  @MaxLength(128)
  name!: string;

  @ApiProperty({ description: '职业品类', example: '数据科学' })
  @IsString()
  @IsNotEmpty({ message: 'category 不能为空' })
  @MaxLength(64)
  category!: string;

  @ApiPropertyOptional({
    description: '权威参考来源（严禁招聘平台）',
    type: [String],
    example: ['https://www.stats.gov.cn'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  refSources?: string[];
}

/** 草稿列表查询 */
export class DraftListQueryDto {
  @ApiPropertyOptional({ description: '状态 0待审/1通过/2拒绝', example: 0 })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2])
  status?: number;

  @ApiPropertyOptional({ description: '页码，从 1 开始', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页条数，最大 50', example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 草稿审核入参 */
export class ReviewDto {
  @ApiProperty({ description: '审核动作', enum: ['approve', 'reject'] })
  @IsString()
  @IsIn(['approve', 'reject'], { message: 'action 仅支持 approve/reject' })
  action!: 'approve' | 'reject';

  @ApiPropertyOptional({ description: '审核备注', example: '资料完整，通过' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

/** 生成结果 VO */
export class CareerGenerateVo {
  @ApiProperty() draftId!: string;
  @ApiProperty() career!: Record<string, unknown>;
  @ApiProperty({ type: [Object] }) skills!: Record<string, unknown>[];
}

/** 审核结果 VO */
export class ReviewResultVo {
  @ApiProperty({ description: '审核后状态 1通过/2拒绝' }) status!: number;
  @ApiPropertyOptional({ description: 'approve 时同步的正式职业 id' }) syncedCareerId?: string;
}