import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** 深度报告可扩展章节主题 key（§3.3）。 */
export const CHAPTER_FOCUS = ['career', 'relationship', 'growth', 'leadership'] as const;
export type ChapterFocus = (typeof CHAPTER_FOCUS)[number];

/**
 * §3.3 深度报告 AI 扩展章节入参（POST /api/v1/ai/report/chapter）。
 * 权限：已登录；仅 DEEP 报告可扩展（非 DEEP → 4517）；仅报告归属人可操作（越权 4003）。
 * 护城河：结果仅写 report_ai_chapter，绝不写 report / report_section 本体表。
 */
export class ReportChapterDto {
  @ApiProperty({ description: '报告 id（report.id）', example: '20001' })
  @IsString()
  @IsNotEmpty({ message: 'reportId 不能为空' })
  @MaxLength(32, { message: 'reportId 超长' })
  reportId!: string;

  @ApiProperty({ description: '章节主题', enum: CHAPTER_FOCUS, example: 'career' })
  @IsIn(CHAPTER_FOCUS as unknown as string[], { message: 'focus 不在支持范围内' })
  focus!: ChapterFocus;

  @ApiPropertyOptional({ description: '聚焦职业 id（career.id，可选）', example: '10001' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'focusCareerId 超长' })
  focusCareerId?: string;
}

/** §3.3 扩展章节出参。 */
export class ReportChapterVo {
  @ApiProperty({ description: '章节 id（report_ai_chapter.id）' })
  chapterId!: string;

  @ApiProperty({ description: '关联报告 id' })
  reportId!: string;

  @ApiProperty({ description: '章节标题' })
  title!: string;

  @ApiProperty({ description: '章节段落', type: [String] })
  paragraphs!: string[];

  @ApiProperty({ description: '是否走了降级兜底' })
  degraded!: boolean;
}