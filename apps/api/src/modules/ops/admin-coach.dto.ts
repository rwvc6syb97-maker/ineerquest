import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * T4-15 辅导师管理 DTO。
 * 审核（通过/驳回）、上下架（下线需校验进行中订单）、评价管理，均为敏感操作需理由。
 */

/** 审核辅导师：approve=1 通过 / approve=2 驳回，驳回需理由 */
export class AuditCoachDto {
  @IsInt()
  @IsIn([1, 2])
  auditStatus!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

/** 上下架：status=1 上架 / status=0 下架，下架需理由与二次确认 */
export class ShelfCoachDto {
  @IsInt()
  @IsIn([0, 1])
  status!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;

  /** 存在进行中订单时是否强制下线（默认 false，拦截） */
  @IsOptional()
  force?: boolean;

  @IsOptional()
  confirm?: boolean;
}

/** 评价管理：回复 / 删除（软删）。删除需理由 */
export class ReviewManageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reply?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}