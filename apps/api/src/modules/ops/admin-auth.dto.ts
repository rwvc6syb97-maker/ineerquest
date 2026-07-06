import { IsNotEmpty, IsString } from 'class-validator';

/** T4-10 后台登录（独立管理员账号 + 密码） */
export class AdminLoginDto {
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password!: string;
}

/** T4-10 后台 Token 刷新 */
export class AdminRefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken!: string;
}