import { ApiError } from '@lingcoo-tech/http';
import { z } from 'zod';

import type { SettingsReader } from '../../settings/public.js';
import type {
  WechatCodeSession,
  WechatMiniProgramGateway,
  WechatMiniProgramState,
  WechatPhoneNumber,
  WechatSubscribeMessageInput,
} from '../domain/model.js';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const codeSessionSchema = z.object({
  openid: z.string().min(1),
  session_key: z.string().min(1),
  unionid: z.string().min(1).optional(),
});
const phoneResponseSchema = z.object({
  errcode: z.number().int(),
  errmsg: z.string(),
  phone_info: z
    .object({
      phoneNumber: z.string().min(1),
      purePhoneNumber: z.string().min(1),
      countryCode: z.string().min(1),
    })
    .optional(),
});
const commonResponseSchema = z.object({ errcode: z.number().int(), errmsg: z.string() });

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class WechatMiniProgramClient implements WechatMiniProgramGateway {
  private token: CachedToken | null = null;

  constructor(
    private readonly settings: SettingsReader,
    private readonly request: typeof fetch = fetch,
  ) {}

  async exchangeCode(code: string, signal?: AbortSignal): Promise<WechatCodeSession> {
    await this.assertEnabled();
    const { appId, appSecret } = await this.credentials();
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: z.string().trim().min(1).max(256).parse(code),
      grant_type: 'authorization_code',
    }).toString();
    const payload = await this.json(url, { method: 'GET', signal });
    this.assertWechatSuccess(payload, '小程序登录凭证校验失败');
    const session = codeSessionSchema.parse(payload);
    return {
      openId: session.openid,
      unionId: session.unionid ?? null,
      sessionKey: session.session_key,
    };
  }

  async getPhoneNumber(code: string, signal?: AbortSignal): Promise<WechatPhoneNumber> {
    await this.assertEnabled();
    const accessToken = await this.accessToken(signal);
    const payload = phoneResponseSchema.parse(
      await this.json(
        `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: z.string().trim().min(1).max(256).parse(code) }),
          signal,
        },
      ),
    );
    if (payload.errcode !== 0 || !payload.phone_info) {
      this.failure('获取小程序手机号失败', payload.errcode, payload.errmsg);
    }
    return payload.phone_info;
  }

  async sendSubscribeMessage(
    input: WechatSubscribeMessageInput,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.assertEnabled();
    const accessToken = await this.accessToken(signal);
    const state =
      (await this.settings.getValue<WechatMiniProgramState>('wechat-mini-program.state')) ??
      'formal';
    const payload = commonResponseSchema.parse(
      await this.json(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            touser: input.openId,
            template_id: input.templateId,
            page: input.page,
            miniprogram_state: state,
            lang: 'zh_CN',
            data: input.data,
          }),
          signal,
        },
      ),
    );
    if (payload.errcode !== 0) {
      this.failure('发送小程序订阅消息失败', payload.errcode, payload.errmsg);
    }
  }

  async testConnection(signal: AbortSignal): Promise<void> {
    await this.credentials();
    await this.accessToken(signal, true);
  }

  private async accessToken(signal?: AbortSignal, refresh = false): Promise<string> {
    if (!refresh && this.token && this.token.expiresAt > Date.now() + 300_000) {
      return this.token.value;
    }
    const { appId, appSecret } = await this.credentials();
    const raw = await this.json('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credential',
        appid: appId,
        secret: appSecret,
        force_refresh: refresh,
      }),
      signal,
    });
    this.assertWechatSuccess(raw, '获取小程序接口调用凭证失败');
    const payload = tokenResponseSchema.parse(raw);
    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + payload.expires_in * 1_000,
    };
    return this.token.value;
  }

  private async credentials() {
    const [appId, appSecret] = await Promise.all([
      this.settings.getValue<string>('wechat-mini-program.app-id'),
      this.settings.getValue<string>('wechat-mini-program.app-secret'),
    ]);
    if (!appId || !appSecret) {
      throw new ApiError(
        503,
        'WECHAT_MINI_PROGRAM_NOT_CONFIGURED',
        '微信小程序 AppID 或 AppSecret 尚未配置',
      );
    }
    return { appId, appSecret };
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.settings.getValue<boolean>('wechat-mini-program.enabled'))) {
      throw new ApiError(503, 'WECHAT_MINI_PROGRAM_DISABLED', '微信小程序接口尚未启用');
    }
  }

  private async json(url: string | URL, init: RequestInit): Promise<unknown> {
    const response = await this.request(url, init);
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new ApiError(502, 'WECHAT_MINI_PROGRAM_UPSTREAM_ERROR', '微信接口请求失败');
    }
    return payload;
  }

  private assertWechatSuccess(payload: unknown, message: string): void {
    const error = z
      .object({ errcode: z.number(), errmsg: z.string().optional() })
      .safeParse(payload);
    if (error.success && error.data.errcode !== 0) {
      this.failure(message, error.data.errcode, error.data.errmsg ?? 'unknown');
    }
  }

  private failure(message: string, code: number, detail: string): never {
    throw new ApiError(502, 'WECHAT_MINI_PROGRAM_API_ERROR', message, {
      providerCode: code,
      providerMessage: detail,
    });
  }
}
