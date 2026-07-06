import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { SmsCodeService } from './sms-code.service';
import { SmsProvider } from './sms.provider';

/**
 * AuthModule — 认证链（T1-01~T1-04）。
 * 标记 @Global：TokenService 需被全局 AuthGuard 注入，故全局导出。
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SmsCodeService,
    SmsProvider,
  ],
  exports: [TokenService, SmsCodeService, AuthService],
})
export class AuthModule {}