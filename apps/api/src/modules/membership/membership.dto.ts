import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PLAN_STATUS_VALUES, PLAN_TYPE_VALUES } from './membership.constants';

/** 后台创建会员套餐请求。字段严格回溯 membership_plan 表。 */
export class CreatePlanDto {
  /** 套餐编码（uk_code，唯一） */
  @IsString()
  @Length(1, 32)
  code!: string;

  /** 套餐名称 */
  @IsString()
  @Length(1, 64)
  name!: string;

  /** 副标题 */
  @IsOptional()
  @IsString()
  @Length(0, 128)
  subtitle?: string;

  /** 价格（分） */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  /** 原价（分） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  originalPrice?: number;

  /** 有效天数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationDays?: number;

  /** 套餐类型：1单次 2周期 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(PLAN_TYPE_VALUES)
  planType?: number;

  /** 权益点列表 */
  @IsOptional()
  @IsArray()
  benefits?: unknown[];

  /** 排序值（越小越前） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  /** 是否推荐：0否 1是 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1])
  isRecommended?: number;
}

/** 后台更新会员套餐请求：所有字段可选。 */
export class UpdatePlanDto extends CreatePlanDto {}

/** PATCH /:id/status 上下架请求。 */
export class UpdatePlanStatusDto {
  /** 目标状态：0下架 1上架 */
  @Type(() => Number)
  @IsInt()
  @IsIn(PLAN_STATUS_VALUES)
  status!: number;
}