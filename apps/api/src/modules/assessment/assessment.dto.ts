import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMaxSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** T1-07 拉取题库查询参数 */
export class GetQuestionsQueryDto {
  /** 题库版本（默认 v1） */
  @IsOptional()
  @IsString()
  version?: string;

  /** 可选：仅拉取某维度（1=EI 2=SN 3=TF 4=JP） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  dimension?: number;
}

/** T1-08 创建测评记录请求 */
export class CreateRecordDto {
  /** 题库版本（默认取当前版本） */
  @IsOptional()
  @IsString()
  version?: string;
}

/** 单条答案项（题目 -> 选择的选项） */
export class AnswerItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  optionId!: number;
}

/** T1-09 分段暂存答案（草稿）请求 */
export class SaveAnswersDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers!: AnswerItemDto[];
}