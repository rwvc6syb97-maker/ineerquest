import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** MBTI 合法类型正则：4 位大，E/I·S/N·T/F·J/P。 */
export const MBTI_REGEX = /^[EI][SN][TF][JP]$/;

/** §3.1 单个协作成员。 */
export class CollabMemberDto {
  @ApiPropertyOptional({ description: '成员姓名（可选，≤32）', example: '张三' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'name 超长' })
  name?: string;

  @ApiProperty({ description: 'MBTI 类型（4 位大写，如 INTJ）', example: 'INTJ' })
  @IsString()
  @Matches(MBTI_REGEX, { message: 'mbtiType 非法（须为 E/I·S/N·T/F·J/P 组合）' })
  mbtiType!: string;
}

/**
 * §3.1 AI 双人/团队协作分析入参（POST /api/v1/ai/collab/analyze）。
 * 后端二次校验：members 2~6 人、每人 mbtiType 合法、scene 可选限长。
 * 游客可试用（不落库），登录用户可保存结果。
 */
export class CollabAnalyzeDto {
  @ApiProperty({ description: '协作成员（2~6 人）', type: [CollabMemberDto] })
  @IsArray()
  @ArrayMinSize(2, { message: 'members 至少 2 人' })
  @ArrayMaxSize(6, { message: 'members 最多 6 人' })
  @ValidateNested({ each: true })
  @Type(() => CollabMemberDto)
  members!: CollabMemberDto[];

  @ApiPropertyOptional({ description: '协作场景（可选，≤64）', example: '项目协作' })
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'scene 超长' })
  scene?: string;

  @ApiPropertyOptional({ description: '是否保存结果（仅登录用户有效，默认 false）', example: false })
  @IsOptional()
  save?: boolean;
}

/** 成员两两协作对。 */
export class CollabPairVo {
  @ApiProperty({ description: '成员 A（name 或 mbtiType）' })
  a!: string;

  @ApiProperty({ description: '成员 B（name 或 mbtiType）' })
  b!: string;

  @ApiProperty({ description: '协同度（0~100）' })
  synergy!: number;

  @ApiProperty({ description: '协作建议' })
  advice!: string;
}

/** §3.1 协作分析出参。 */
export class CollabAnalyzeVo {
  @ApiPropertyOptional({ description: '分析结果 id（仅登录且保存时返回）' })
  analysisId?: string;

  @ApiProperty({ description: '整体协作摘要' })
  summary!: string;

  @ApiProperty({ description: '两两协作对', type: [CollabPairVo] })
  pairs!: CollabPairVo[];

  @ApiProperty({ description: '协作风险预警', type: [String] })
  risks!: string[];

  @ApiProperty({ description: '是否走了降级兜底（LLM 失败/超时为 true）' })
  degraded!: boolean;
}