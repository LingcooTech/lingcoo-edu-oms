import type { WechatMiniAuthService as WechatMiniAuthServiceType } from './application/wechat-mini-auth.service.js';

export { WechatMiniProgramService } from './application/wechat-mini-program.service.js';
export {
  WechatMiniAuthService,
  type WechatMiniAuthIdentityPort,
} from './application/wechat-mini-auth.service.js';
export type WechatMiniProgramIdentityDirectory = Pick<
  WechatMiniAuthServiceType,
  'openIdForIdentity'
>;
export type {
  WechatCodeSession,
  WechatMiniProgramGateway,
  WechatPhoneNumber,
  WechatSubscribeMessageInput,
} from './domain/model.js';
export { WECHAT_MINI_PROGRAM_SETTINGS } from './domain/wechat-mini-program-settings.js';
export {
  createWechatMiniProgramConnectionTester,
  createWechatMiniProgramService,
  createWechatMiniAuthModule,
  createWechatMiniAuthService,
} from './plugin.js';
