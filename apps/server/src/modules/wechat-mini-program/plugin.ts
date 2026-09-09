import type { SettingsReader } from '../settings/public.js';
import { WechatMiniProgramService } from './application/wechat-mini-program.service.js';
import { WechatMiniProgramClient } from './infrastructure/wechat-mini-program.client.js';

export interface WechatMiniProgramModuleDependencies {
  settings: SettingsReader;
  service?: WechatMiniProgramService;
}

export function createWechatMiniProgramService(dependencies: WechatMiniProgramModuleDependencies) {
  return (
    dependencies.service ??
    new WechatMiniProgramService(
      dependencies.settings,
      new WechatMiniProgramClient(dependencies.settings),
    )
  );
}

export function createWechatMiniProgramConnectionTester(service: WechatMiniProgramService) {
  return {
    key: 'wechat-mini-program.connection',
    group: 'wechat-mini-program',
    label: '测试微信小程序连接',
    description: '使用 AppID 与 AppSecret 获取服务端接口调用凭证，不会向用户发送消息。',
    requiredSettings: ['wechat-mini-program.app-id', 'wechat-mini-program.app-secret'],
    timeoutMs: 10_000,
    async test(_values: ReadonlyMap<string, unknown>, signal: AbortSignal) {
      await service.testConnection(signal);
      return { ok: true, message: '微信小程序接口连接正常' };
    },
  };
}
