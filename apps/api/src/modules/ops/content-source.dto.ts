import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';

/**
 * M1 内容可持续化 DTO（PRD 内容升级 §4 冻结契约）。
 * 覆盖：AI 检索任务 ContentSourceTask、职业/资源审核流转、CSV 导入。
 * 命名严格驼峰；参数二次校验（长度/类型/枚举）。
 */

/** 创建 AI 检索任务：targetType 1=岗位 2=资源；keywords 关键词数组。 */
export class CreateSourceTaskDto {
  @IsString() @IsNotEmpty() @MaxLength(64) taskName!: string;

  /** 采集目标类型：1=岗位(Career) 2=资源(LearningResource) */
  @IsInt() @IsIn([1, 2]) targetType!: number;

  /** 检索关键词（1~20 个，单个 ≤32 字） */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  keywords!: string[];

  /** 可选 cron 调度表达式（≤64） */
  @IsOptional() @IsString() @MaxLength(64) schedule?: string;
}

/** 更新 AI 检索任务（部分字段） */
export class UpdateSourceTaskDto {
  @IsOptional() @IsString() @MaxLength(64) taskName?: string;
  @IsOptional() @IsInt() @IsIn([1, 2]) targetType?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  keywords?: string[];
  @IsOptional() @IsString() @MaxLength(64) schedule?: string;
}

/**
 * 审核流转：reviewStatus 目标态 2=上线 3=下线（1=草稿仅系统写入，人工不可直接置回草稿）。
 * 非法流转由服务端二次判定，命中 4605。
 */
export class ReviewContentDto {
  @IsInt() @IsIn([2, 3]) reviewStatus!: number;
  @IsOptional() @IsString() @MaxLength(255) remark?: string;
}