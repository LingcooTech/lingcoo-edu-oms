import type { FastifyPluginAsync } from 'fastify';

import type { DatabaseHandle } from '../../database/database.js';
import type { IdentityService } from '../identity/public.js';
import type { SettingsReader } from '../settings/public.js';
import { registerWechatMiniAuthRoutes } from './api/routes.js';
import {
  createWechatMiniAuthRepositoryStore,
  WechatMiniAuthService,
} from './application/wechat-mini-auth.service.js';
import { WechatMiniProgramService } from './application/wechat-mini-program.service.js';
import { WechatMiniAuthRepository } from './infrastructure/persistence/wechat-mini-auth.repository.js';
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

export interface WechatMiniAuthModuleDependencies {
  settings: SettingsReader;
  database: DatabaseHandle;
  identity: IdentityService;
  miniProgramService?: WechatMiniProgramService;
  authService?: WechatMiniAuthService;
}

export function createWechatMiniAuthService(
  dependencies: WechatMiniAuthModuleDependencies,
): WechatMiniAuthService {
  if (dependencies.authService) return dependencies.authService;
  const miniProgramService =
    dependencies.miniProgramService ??
    createWechatMiniProgramService({ settings: dependencies.settings });
  return new WechatMiniAuthService(
    dependencies.settings,
    miniProgramService,
    createWechatMiniAuthRepositoryStore(new WechatMiniAuthRepository(dependencies.database)),
    dependencies.identity,
  );
}

export function createWechatMiniAuthModule(
  dependencies: WechatMiniAuthModuleDependencies,
): FastifyPluginAsync {
  return async (app) =>
    registerWechatMiniAuthRoutes(app, createWechatMiniAuthService(dependencies));
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
