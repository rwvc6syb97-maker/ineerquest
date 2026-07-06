import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

/** 中国大陆手机号（阶段1仅支持 +86） */
const CN_PHONE = /^1[3-9]\d{9}$/;

/** T1-01 发送验证码 */
export class SendSmsDto {
  @Matches(CN_PHONE, { message: '手机号格式不正确' })
  phone!: string;
}

/** T1-02 手机号+验证码登录 */
export class LoginDto {
  @Matches(CN_PHONE, { message: '手机号格式不正确' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: '验证码为 6 位数字' })
  code!: string;
}

/** 邮箱注册 */
export class EmailRegisterDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(64, { message: '密码最长 64 位' })
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  nickname?: string;
}

/** 邮箱+密码登录 */
export class EmailLoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password!: string;
}

/** T1-04 刷新 Token */
export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken!: string;
}

/** T1-05 更新用户资料 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  nickname?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  avatarUrl?: string;

  @IsOptional()
  gender?: number;
}