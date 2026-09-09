import { describe, expect, it, vi } from 'vitest';

import type { SettingsReader } from '../src/modules/settings/public.js';
import { WechatMiniProgramClient } from '../src/modules/wechat-mini-program/infrastructure/wechat-mini-program.client.js';

function settings(values: Record<string, unknown>): SettingsReader {
  return {
    async getValue<T>(key: string) {
      return values[key] as T | undefined;
    },
    async publicValues() {
      return {};
    },
  };
}

describe('WeChat mini program client', () => {
  it('exchanges a one-time login code without returning credentials to the caller request', async () => {
    const request = vi.fn<typeof fetch>();
    request.mockResolvedValue(
      Response.json({ openid: 'openid-1', unionid: 'unionid-1', session_key: 'session-key' }),
    );
    const client = new WechatMiniProgramClient(
      settings({
        'wechat-mini-program.enabled': true,
        'wechat-mini-program.app-id': 'wx1234567890abcdef',
        'wechat-mini-program.app-secret': 'secret-value-1234567890',
      }),
      request as typeof fetch,
    );

    await expect(client.exchangeCode('temporary-code')).resolves.toEqual({
      openId: 'openid-1',
      unionId: 'unionid-1',
      sessionKey: 'session-key',
    });
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://api.weixin.qq.com/sns/jscode2session');
    expect(url.searchParams.get('js_code')).toBe('temporary-code');
  });

  it('tests credentials through stable_token and caches the resulting access token', async () => {
    const request = vi.fn<typeof fetch>();
    request
      .mockResolvedValueOnce(Response.json({ access_token: 'access-token', expires_in: 7200 }))
      .mockResolvedValueOnce(Response.json({ errcode: 0, errmsg: 'ok' }));
    const client = new WechatMiniProgramClient(
      settings({
        'wechat-mini-program.enabled': true,
        'wechat-mini-program.app-id': 'wx1234567890abcdef',
        'wechat-mini-program.app-secret': 'secret-value-1234567890',
        'wechat-mini-program.state': 'trial',
      }),
      request as typeof fetch,
    );

    await client.testConnection(new AbortController().signal);
    await client.sendSubscribeMessage({
      openId: 'openid-1',
      templateId: 'template-1',
      page: 'pages/sessions/detail?id=1',
      data: { thing1: { value: '课程提醒' } },
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[0]?.[0])).toBe(
      'https://api.weixin.qq.com/cgi-bin/stable_token',
    );
    const messageBody = JSON.parse(String(request.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(messageBody).toMatchObject({
      touser: 'openid-1',
      template_id: 'template-1',
      miniprogram_state: 'trial',
    });
  });

  it('does not call WeChat business APIs while the integration is disabled', async () => {
    const request = vi.fn<typeof fetch>();
    const client = new WechatMiniProgramClient(
      settings({
        'wechat-mini-program.enabled': false,
        'wechat-mini-program.app-id': 'wx1234567890abcdef',
        'wechat-mini-program.app-secret': 'secret-value-1234567890',
      }),
      request as typeof fetch,
    );

    await expect(client.exchangeCode('temporary-code')).rejects.toMatchObject({
      code: 'WECHAT_MINI_PROGRAM_DISABLED',
    });
    expect(request).not.toHaveBeenCalled();
  });
});
