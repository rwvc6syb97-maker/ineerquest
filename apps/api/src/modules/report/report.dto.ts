import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** T1-14 生成报告请求：基于某次测评结果 */
export class GenerateReportDto {
  /** 测评记录 id（record_id） */
  @IsString()
  recordId!: string;
}

/** T1-15 查询报告章节参数（可指定 sectionKey 以触发付费段解锁校验） */
export class GetReportQueryDto {
  @IsOptional()
  @IsString()
  sectionKey?: string;
}

/** T1-17 生成分享请求 */
export class CreateShareDto {
  /** 分享渠道（1=微信 2=朋友圈 3=微博 …），可选 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  channel?: number;
}

/** T1-14 触发 LLM 深度生成请求（§6.1 #4） */
export class GenerateDeepContentDto {
  /** 指定要生成的付费章节 key 列表（可选，默认全部三段） */
  @IsOptional()
  @IsString({ each: true })
  sections?: string[];
}

// ============ 出参 DTO（Swagger 文档，PM 权威裁定 v2.1 §6.2①） ============

/** 概览维度项（固定 4 项 EI/SN/TF/JP） */
export class ReportDimensionDto {
  @ApiProperty({ description: '维度标识', enum: ['EI', 'SN', 'TF', 'JP'] })
  dimension!: string;

  @ApiProperty({ description: '低分极标签（如 内向 I）' })
  left!: string;

  @ApiProperty({ description: '高分极标签（如 外向 E）' })
  right!: string;

  @ApiProperty({ description: '偏向 right 极的得分 0~100' })
  score!: number;
}

/** 概览章节项 */
export class ReportSectionDto {
  @ApiProperty({ description: '章节 key' })
  sectionKey!: string;

  @ApiProperty({ description: '章节标题' })
  title!: string;

  @ApiProperty({ description: '章节正文（结构化 Json 或文本）' })
  content!: unknown;

  @ApiProperty({ description: '排序序号' })
  sortOrder!: number;

  @ApiProperty({ description: '是否付费段落' })
  paid!: boolean;
}

/** GET /reports/:id 概览出参 data（v2.1 权威结构） */
export class ReportOverviewDto {
  @ApiProperty({ description: '报告 id' })
  id!: string;

  @ApiProperty({ description: '关联测评记录 id（record_id）' })
  recordId!: string;

  @ApiProperty({ description: '报告编号' })
  reportNo!: string;

  @ApiProperty({ description: 'MBTI 类型（4 字母）' })
  mbtiType!: string;

  @ApiProperty({
    description: '性格家族（后端推导，前端不得反解）',
    enum: ['analyst', 'diplomat', 'sentinel', 'explorer'],
  })
  family!: string;

  @ApiProperty({ description: '后端渲染的概览文案（string）' })
  summary!: string;

  @ApiProperty({ description: '固定 4 项维度得分', type: [ReportDimensionDto] })
  dimensions!: ReportDimensionDto[];

  @ApiProperty({
    description: '深度生成状态',
    enum: ['pending', 'generating', 'done', 'failed'],
  })
  generateStatus!: string;

  @ApiProperty({ description: '可见章节列表', type: [ReportSectionDto] })
  sections!: ReportSectionDto[];

  @ApiProperty({ description: '未解锁被隐藏的付费章节 key 列表', type: [String] })
  lockedSectionKeys!: string[];

  @ApiProperty({ description: '是否已解锁付费段落' })
  isUnlocked!: boolean;

  @ApiProperty({ description: '创建时间（北京时间字符串 YYYY-MM-DD HH:mm:ss）' })
  createdAt!: string;
}