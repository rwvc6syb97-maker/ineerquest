import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * T4-14 用户管理 DTO。
 * 封禁/解封为敏感操作：需附操作理由（审计留痕），封禁触发强制下线。
 */

/** 封禁用户：status=0，需二次确认 confirm=true 与理由 reason */
export class BanUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;

  /** 二次确认标志，前端二次弹窗后回传 true */
  @IsOptional()
  confirm?: boolean;
}

/** 解封用户：status=1，需理由 */
export class UnbanUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}

/** 用户列表查询过滤 */
export class UserListQuery {
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @IsInt()
  role?: number;
}