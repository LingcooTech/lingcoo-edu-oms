import type { SettingsReader } from '../../settings/public.js';
import type { WechatMiniProgramGateway, WechatSubscribeMessageInput } from '../domain/model.js';

export class WechatMiniProgramService {
  constructor(
    private readonly settings: SettingsReader,
    private readonly gateway: WechatMiniProgramGateway,
  ) {}

  exchangeCode(code: string, signal?: AbortSignal) {
    return this.gateway.exchangeCode(code, signal);
  }

  getPhoneNumber(code: string, signal?: AbortSignal) {
    return this.gateway.getPhoneNumber(code, signal);
  }

  sendSubscribeMessage(input: WechatSubscribeMessageInput, signal?: AbortSignal) {
    return this.gateway.sendSubscribeMessage(input, signal);
  }

  testConnection(signal: AbortSignal) {
    return this.gateway.testConnection(signal);
  }

  async status() {
    const [enabled, appId, state, sessionTemplate, consumptionTemplate] = await Promise.all([
      this.settings.getValue<boolean>('wechat-mini-program.enabled'),
      this.settings.getValue<string>('wechat-mini-program.app-id'),
      this.settings.getValue<string>('wechat-mini-program.state'),
      this.settings.getValue<string>('wechat-mini-program.session-reminder-template-id'),
      this.settings.getValue<string>('wechat-mini-program.lesson-consumption-template-id'),
    ]);
    return {
      enabled: enabled ?? false,
      appIdConfigured: Boolean(appId),
      state: state ?? 'formal',
      capabilities: {
        codeSession: true,
        phoneNumber: true,
        subscribeMessages: {
          sessionReminder: Boolean(sessionTemplate),
          lessonConsumption: Boolean(consumptionTemplate),
        },
      },
    };
  }
}
