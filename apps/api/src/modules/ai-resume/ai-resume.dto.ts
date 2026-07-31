import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** 单条工作/项目经历。 */
export class ResumeExperienceDto {
  @ApiProperty({ description: '角色/职位', example: '产品经理' })
  @IsString()
  @IsNotEmpty({ message: 'experience.role 不能为空' })
  @MaxLength(64, { message: 'role 超长' })
  role!: string;

  @ApiProperty({ description: '经历描述', example: '负责 B 端产品从 0 到 1' })
  @IsString()
  @MaxLength(500, { message: 'description 超长' })
  description!: string;
}

/** 用户经历表单。 */
export class ResumeProfileDto {
  @ApiProperty({ description: '教育背景', example: '本科·计算机' })
  @IsString()
  @IsNotEmpty({ message: 'profile.education 不能为空' })
  @MaxLength(128, { message: 'education 超长' })
  education!: string;

  @ApiProperty({ description: '工作/项目经历', type: [ResumeExperienceDto] })
  @IsArray()
  @ArrayMaxSize(20, { message: 'experiences 数量超限' })
  @ValidateNested({ each: true })
  @Type(() => ResumeExperienceDto)
  experiences!: ResumeExperienceDto[];

  @ApiProperty({ description: '技能列表', type: [String], example: ['SQL', '沟通'] })
  @IsArray()
  @ArrayMaxSize(50, { message: 'skills 数量超限' })
  @IsString({ each: true })
  @MaxLength(64, { each: true, message: 'skills 单项超长' })
  skills!: string[];
}

/**
 * §3.2 AI 简历/求职信生成入参（POST /api/v1/ai/resume/generate）。
 * 权限：已登录 + 会员/付费（非会员 4515）。
 */
export class ResumeGenerateDto {
  @ApiProperty({ description: '目标职业 id（career.id）', example: '10001' })
  @IsString()
  @IsNotEmpty({ message: 'careerId 不能为空' })
  @MaxLength(32, { message: 'careerId 超长' })
  careerId!: string;

  @ApiProperty({ description: '用户经历表单', type: ResumeProfileDto })
  @ValidateNested()
  @Type(() => ResumeProfileDto)
  profile!: ResumeProfileDto;

  @ApiPropertyOptional({ description: '文档类型', enum: ['resume', 'coverLetter'], default: 'resume' })
  @IsOptional()
  @IsIn(['resume', 'coverLetter'], { message: 'type 仅支持 resume | coverLetter' })
  type?: 'resume' | 'coverLetter';
}

/** 文档段落。 */
export class ResumeSectionVo {
  @ApiProperty({ description: '段落标题' })
  title!: string;

  @ApiProperty({ description: '段落正文' })
  body!: string;
}

/** §3.2 简历生成出参。 */
export class ResumeGenerateVo {
  @ApiProperty({ description: '文档 id（ai_resume_doc.id）' })
  docId!: string;

  @ApiProperty({ description: '全文初稿' })
  content!: string;

  @ApiProperty({ description: '结构化段落', type: [ResumeSectionVo] })
  sections!: ResumeSectionVo[];

  @ApiProperty({ description: '是否走了降级兜底' })
  degraded!: boolean;
}

// ============ M4 简历上传优化（POST /ai/resume/optimize，multipart） ============

/**
 * §6 简历上传优化入参（表单字段，file 走 multipart 由 FileInterceptor 解析，不在此 DTO）。
 * 校验次序（LLM 前）：4620 无文件→4621 非PDF→4622>10MB→4624 岗位缺失/不存在→4623 提取空/加密/扫描件→4625>20000字→4516 敏感词→4090 同哈希幂等。
 */
export class ResumeOptimizeFormDto {
  @ApiProperty({ description: '目标职业 id（career.id）', example: '10001' })
  @IsString()
  @IsNotEmpty({ message: 'targetCareerId 不能为空' })
  @MaxLength(32, { message: 'targetCareerId 超长' })
  targetCareerId!: string;

  @ApiPropertyOptional({ description: '备注', example: '偏向后端方向', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'note 超长（≤500）' })
  note?: string;
}

/** §6.3 冻结：单条优化建议。 */
export class ResumeSuggestionItemVo {
  @ApiProperty({ description: '简历段落名' })
  section!: string;

  @ApiProperty({ description: '原文片段' })
  original!: string;

  @ApiProperty({ description: '优化后建议' })
  suggestion!: string;

  @ApiProperty({ description: '优化理由' })
  reason!: string;
}

/** §6.3 冻结：目标职业信息。 */
export class ResumeTargetCareerVo {
  @ApiProperty({ description: '职业 id' })
  careerId!: string;

  @ApiProperty({ description: '职业名称' })
  name!: string;

  @ApiProperty({ description: '职业分类' })
  category!: string;
}

/** §6.3 冻结：suggestions 结构化结果。 */
export class ResumeSuggestionsVo {
  @ApiProperty({ description: '匹配度 0~100' })
  matchScore!: number;

  @ApiProperty({ description: '整体评价' })
  overallComment!: string;

  @ApiProperty({ description: '逐段优化建议', type: [ResumeSuggestionItemVo] })
  items!: ResumeSuggestionItemVo[];

  @ApiProperty({ description: '缺失关键词', type: [String] })
  missingKeywords!: string[];

  @ApiProperty({ description: '目标职业', type: ResumeTargetCareerVo })
  targetCareer!: ResumeTargetCareerVo;
}

/** §6 简历上传优化出参。 */
export class ResumeOptimizeVo {
  @ApiProperty({ description: '文档 id（ai_resume_doc.id）' })
  docId!: string;

  @ApiProperty({ description: '上传原文件名（不存二进制）' })
  sourceFileName!: string;

  @ApiProperty({ description: '优化建议', type: ResumeSuggestionsVo })
  suggestions!: ResumeSuggestionsVo;

  @ApiProperty({ description: '是否走了降级兜底' })
  degraded!: boolean;

  @ApiProperty({ description: '过期时间（ISO8601，默认30天）' })
  expireAt!: string;
}

/** §6 历史优化文档列表项。 */
export class ResumeOptimizeListItemVo {
  @ApiProperty({ description: '文档 id' })
  docId!: string;

  @ApiProperty({ description: '上传原文件名' })
  sourceFileName!: string;

  @ApiProperty({ description: '目标职业 id' })
  targetCareerId!: string;

  @ApiProperty({ description: '匹配度 0~100' })
  matchScore!: number;

  @ApiProperty({ description: '是否降级' })
  degraded!: boolean;

  @ApiProperty({ description: '创建时间（ISO8601）' })
  createdAt!: string;

  @ApiProperty({ description: '过期时间（ISO8601）' })
  expireAt!: string;
}