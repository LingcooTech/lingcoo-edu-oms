export { PaymentsService } from './application/payments.service.js';
export type {
  PaymentFact,
  PaymentFactReceiver,
  PaymentProviderAdapter,
  PaymentProviderConfiguration,
} from './domain/model.js';
export { NOOP_PAYMENT_FACT_RECEIVER } from './domain/model.js';
export { PAYMENT_SETTINGS } from './domain/payment-settings.js';
export { WECHAT_PAY_SETTINGS } from './domain/wechat-pay-settings.js';
export { MockPaymentProvider } from './infrastructure/mock-payment.provider.js';
export { WechatPayV3ProviderAdapter } from './infrastructure/wechat-pay-v3.provider.js';
export {
  createWechatPayConnectionTester,
  WechatPayV3Client,
} from './infrastructure/wechat-pay-v3.client.js';
export { createPaymentsModule, createPaymentsService } from './plugin.js';
