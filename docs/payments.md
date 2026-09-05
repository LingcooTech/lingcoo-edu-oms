# Payments

Payments 提供与行业订单解耦的支付事实层。模块拥有支付意图、Provider 交易、验签回调和退款；不直接更新教育合同、零售订单或其他行业表。

## 数据与事务边界

- `payment_intents`：以 `merchant_reference` 作为调用方稳定业务身份，保存金额、币种、Provider 身份快照和状态。
- `payment_provider_transactions`：保存 Provider Transaction ID、状态和最后查询时间。
- `payment_callbacks`：只保存验签成功且通过金额、币种、App ID、商户 ID 校验的回调事实及原始 Body SHA-256；数据库 Trigger 禁止更新和删除。
- `payment_refunds`：`(intent_id, request_key)` 唯一，先在行锁事务中预留退款金额，再调用 Provider，防止并发超额退款。

Provider 调用不放在数据库长事务中。创建请求使用 Payment Intent ID 作为 Provider 幂等身份；超时后 Intent 保持 `unknown`，可通过对账操作重新创建/查询同一 Provider 交易。

## Mock Provider

Starter 默认只注册 `mock` Adapter，用于本地开发、契约测试和项目接入验证。支付宝、微信或其他 Provider 应在具体项目中实现 `PaymentProviderAdapter`，不得把 SDK 类型、密钥或原始响应泄漏到 Contracts。

Mock 回调签名为：

```text
hex(HMAC-SHA256(PAYMENTS_MOCK_SIGNING_SECRET, exact_raw_http_body))
```

签名放在 `x-payment-signature`。服务端使用原始请求字节验签，解析后的字段继续校验 App ID、商户 ID、Provider Transaction ID、金额和币种。原始 Body 不落库，只保存 SHA-256。

## 设置

- `payments.provider`
- `payments.mock.app-id` / `PAYMENTS_MOCK_APP_ID`
- `payments.mock.merchant-id` / `PAYMENTS_MOCK_MERCHANT_ID`
- `payments.mock.signing-secret` / `PAYMENTS_MOCK_SIGNING_SECRET`（Secret，永不回读）

## API 与权限

- `payments.read`：查询支付意图、Provider 交易、回调与退款。
- `payments.manage`：创建、关闭、对账和退款。
- `POST /api/payments/providers/mock/callback`：公开但限速的 Provider 回调，只接受有效签名。

管理端入口为 `/admin/payments`。业务模块通过 `PaymentFactReceiver` 接收稳定支付事实；Payments 不导入行业 Repository。

## 验证

```bash
DATABASE_URL=postgres://app:app_password@127.0.0.1:5438/app pnpm db:migrate
RUN_DATABASE_TESTS=true DATABASE_URL=postgres://app:app_password@127.0.0.1:5438/app \
  pnpm --filter @lingcoo-edu-oms/server test
pnpm e2e
```
