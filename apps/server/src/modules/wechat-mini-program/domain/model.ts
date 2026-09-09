export type WechatMiniProgramState = 'developer' | 'trial' | 'formal';

export interface WechatCodeSession {
  openId: string;
  unionId: string | null;
  sessionKey: string;
}

export interface WechatPhoneNumber {
  phoneNumber: string;
  purePhoneNumber: string;
  countryCode: string;
}

export interface WechatSubscribeMessageInput {
  openId: string;
  templateId: string;
  page?: string;
  data: Record<string, { value: string | number }>;
}

export interface WechatMiniProgramGateway {
  exchangeCode(code: string, signal?: AbortSignal): Promise<WechatCodeSession>;
  getPhoneNumber(code: string, signal?: AbortSignal): Promise<WechatPhoneNumber>;
  sendSubscribeMessage(input: WechatSubscribeMessageInput, signal?: AbortSignal): Promise<void>;
  testConnection(signal: AbortSignal): Promise<void>;
}
