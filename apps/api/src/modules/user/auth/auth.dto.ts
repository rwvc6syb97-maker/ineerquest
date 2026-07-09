import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

/** 中国大陆手机号（阶段1仅支持 +86） */
const CN_PHONE = /^1[3-9]\d{9}$/;

/** 密码强度：8~32 位，必须同时含字母与数字（契约 4107） */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,32}$/;

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
  @Matches(PASSWORD_RULE, { message: '密码需为 8~32 位且同时包含字母和数字' })
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20, { message: '昵称长度需在 1~20 之间' })
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

/** 发送邮箱验证码 */
export class SendEmailCodeDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;
}

/** 邮箱+验证码登录 */
export class EmailCodeLoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: '验证码为 6 位数字' })
  code!: string;
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
  @Length(1, 20, { message: '昵称长度需在 1~20 之间' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  avatarUrl?: string;

  @IsOptional()
  gender?: number;
}