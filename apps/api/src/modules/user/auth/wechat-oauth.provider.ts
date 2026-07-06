import { Injectable, Logger } from '@nestjs/common';

export interface OauthUserInfo {
  openId: string;
  unionId?: string;
  nickname?: string;
  avatarUrl?: string;
}

/**
 * WechatOauthProvider — 微信 OAuth 交换适配器（T1-03）。
 *
 * blocked：微信 OAuth 凭证（AppID/AppSecret）未就位，
 * 此处以 mock 交换占位；一旦真实凭证缺失或交换异常，
 * 上层 AuthService 会降级到手机号登录路径（真实实现）。
 */
@Injectable()
export class WechatOauthProvider {
  private readonly logger = new Logger(WechatOauthProvider.name);
  private readonly enabled = process.env.WECHAT_OAUTH_ENABLED === 'true';

  /**
   * 用授权 code 交换用户信息。
   * @throws Error 交换失败（触发上层降级）
   */
  async exchange(code: string): Promise<OauthUserInfo> {
    if (!this.enabled) {
      // blocked：mock 交换。以 code 派生稳定 openId，便于本地联调
      this.logger.warn(`[WECHAT MOCK][blocked] 凭证未就位，mock 交换 code=${code}`);
      if (!code || code === 'INVALID') {
        throw new Error('OAUTH_EXCHANGE_FAILED: mock invalid code');
      }
      return {
        openId: `mock_openid_${code}`,
        unionId: `mock_unionid_${code}`,
        nickname: '微信用户',
        avatarUrl: '',
      };
    }
    // TODO(blocked): 调用微信 sns/oauth2/access_token + sns/userinfo，
    // 失败抛出异常由 AuthService 捕获后降级手机号登录。
    throw new Error('OAUTH_EXCHANGE_FAILED: real channel not configured');
  }
}