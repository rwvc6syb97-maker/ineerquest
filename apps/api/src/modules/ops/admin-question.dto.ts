import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * T4-13 题库管理 DTO（AssessmentQuestion / AssessmentOption）。
 * 题库天然支持版本隔离（version）与上下架（status），敏感操作需附操作理由。
 */

/** 选项入参 */
export class QuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  content!: string;

  /** 选项标识，如 A/B */
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  optionKey!: string;

  /** 计分极性 */
  @IsInt()
  polarity!: number;

  @IsOptional()
  @IsInt()
  score?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/** 创建题目 */
export class CreateQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  version?: string;

  /** MBTI 维度 0~3 */
  @IsInt()
  @Min(0)
  dimension!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  content!: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /** 是否反向计分 0/1 */
  @IsOptional()
  @IsInt()
  isReverse?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}

/** 更新题目（字段可选） */
export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  version?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dimension?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  content?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  isReverse?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}

/** 批量上下架（0=下架 1=上架），需附理由 */
export class BatchStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  ids!: (string | number)[];

  @IsInt()
  @IsIn([0, 1])
  status!: number;

  /** 敏感操作理由（审计留痕） */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}

/** 批量导入题库（含选项），按 version 隔离 */
export class ImportQuestionsDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  version?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  items!: CreateQuestionDto[];
}