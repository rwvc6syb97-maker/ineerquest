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