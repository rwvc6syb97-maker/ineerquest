import { IsEmail, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** 激活码状态 */
export const ActivationCodeStatus = {
  UNUSED: 0,
  USED: 1,
  EXPIRED: 2,
} as const;

/** 触达渠道 */
export const SendChannel = {
  EMAIL: 1,
  SMS: 2,
} as const;

/** 管理员批量生成激活码 */
export class GenerateCodesDto {
  @IsString() @Length(1, 32)
  planCode!: string;

  @Type(() => Number) @IsInt() @Min(1)
  count!: number;

  @IsOptional() @Type(() => Number) @IsInt()
  expireDays?: number;

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

/** 发送激活码（邮件或短信） */
export class SendCodeDto {
  @IsOptional() @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @Type(() => Number) @IsInt() @IsIn([1, 2])
  channel!: number; // 1=email, 2=sms
}

/** 用户兑换激活码 */
export class RedeemCodeDto {
  @IsString() @Length(1, 32)
  code!: string;
}
