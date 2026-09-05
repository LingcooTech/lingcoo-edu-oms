# Transactional Outbox

Transactional Outbox 用于把业务事务中已经发生的稳定事实可靠地交给外部系统。业务写入与 Event
写入原子提交，独立 Worker 在事务提交后发布。它不替代同步请求幂等，也不与 Jobs 共用状态表。

## 一致性边界

- `append(input, transaction)` 强制接受调用方数据库事务；业务写入回滚时 Event 同步回滚；
- Event ID、Topic、Version、Aggregate、Payload Hash、去重身份和发生时间属于不可变事实，PostgreSQL
  Trigger 拒绝修改；
- 发布语义是 **at-least-once**。外部 Provider 已成功但 Worker 在标记 `published` 前崩溃时，Event 会被
  再次发布；
- Publisher 必须把 Event ID 作为 Provider 幂等键，或以等价的业务唯一键实现幂等；数据库无法对外部
  副作用提供 exactly-once；
- claim 使用 `FOR UPDATE SKIP LOCKED`，每次领取生成随机 Claim Token。heartbeat、完成和失败写回均受
  Token fencing 与数据库执行截止时间约束；
- heartbeat 不确定、租约过期或 Worker 崩溃后，旧 Token 不能写回，Event 由恢复流程重新排队或进入死信；
- 可重试失败使用带 jitter 的有界指数退避；永久失败或尝试耗尽进入 `dead`；
- 手动重放只允许死信，保留原 Event ID 和历史 Attempt，增加一次尝试预算，并与 Audit 事件共享事务。

## Event 身份与顺序

可使用 Event ID、`(topic, deduplicationKey)` 或 `(aggregateType, aggregateId, aggregateVersion)` 建立唯一
身份。原始去重键不落库，只保存 SHA-256 和不可逆短预览。相同身份只能对应完全相同的 Topic、Version、
Payload Hash、Aggregate、去重 Hash，以及显式提供的发生时间；交叉复用会返回冲突。

同一 Aggregate 已存在的低版本 Event 未发布时，高版本不会被领取；低版本死信也会阻塞后续版本，直到人工
处理。这里保证的是“已写入 Event 的相对顺序”，不自动生成连续版本。Aggregate Version 必须来自业务事务中
受锁保护的聚合修订号；版本间隙是生产模块的业务语义，不由 Outbox 猜测或补齐。

不需要顺序保证的事实不要填写 Aggregate。不要把数据库 Row、实时余额或可变档案直接作为 Event Payload；
Payload 应是消费者可以长期解释的稳定事实快照。

## 注册 Event 与 Publisher

API 和 Worker 都从 `apps/server/src/outbox-event-definitions.ts` 加载稳定 Topic、历史 Version 和 Zod Payload
Schema。旧版本只要仍可能存在于数据库，就必须保留 Schema；新写入自动选择该 Topic 的最高注册版本。

```ts
export const applicationOutboxEvents = [
  {
    topic: 'payments.succeeded',
    eventVersion: 1,
    payloadSchema: z.object({ paymentId: z.uuid(), amount: z.number().int().positive() }),
  },
];
```

带副作用的 Publisher 只在 `apps/server/src/outbox-publisher-definitions.ts` 注册，并只由独立 Worker 加载。
一个 Topic 只允许一个 Publisher；同一 Publisher 必须能处理该 Topic 所有仍受支持的 Event Version。

```ts
export const applicationOutboxPublishers = [
  {
    topic: 'payments.succeeded',
    async handler(event, { eventId, signal }) {
      await broker.publish(event, { idempotencyKey: eventId, signal });
    },
  },
];
```

若未来一个 Topic 需要多个独立投递目标，应新增按 `(eventId, destination)` 建模的 Delivery 表，不能在当前
Registry 中注册多个 Publisher 后共享一个 `published` 状态。

## 业务事务内追加

生产模块只通过公开 `OutboxPort` 写入，并把自身事务显式传入：

```ts
await database.transaction(async (transaction) => {
  await paymentRepository.markSucceeded(paymentId, transaction);
  await outbox.append(
    {
      topic: 'payments.succeeded',
      payload: { paymentId, amount },
      aggregate: { type: 'payment_intent', id: paymentId, version: paymentVersion },
      deduplicationKey: `payment-succeeded:${paymentId}`,
    },
    transaction,
  );
});
```

## 数据库 Consumer 去重

`OutboxConsumerInbox.consumeOnce(eventId, work)` 在同一数据库事务内先领取 `(consumer, eventId)`，再执行
业务写入。并发重复只执行一次；业务写入失败时 Receipt 同步回滚。不同 Consumer 拥有独立 Receipt。

Receipt 故意不外键关联 `outbox_events`：已发布 Event 清理后，Consumer 仍需保留去重记忆，否则旧消息重投
可能再次产生副作用。只有当消息系统的最大重投窗口和所有下游恢复策略都明确后，应用才能单独制定 Receipt
保留期。外部 API、邮件、消息代理等非数据库副作用仍必须使用 Provider 幂等键。

## Admin 与隐私边界

`outbox.read` 可查询 Event 和 Attempt；`outbox.manage` 可重放死信。Admin/API 仅返回安全诊断投影，不返回：

- Payload 正文；
- 原始去重键或完整去重 Hash；
- Worker ID、Claim Token；
- Provider 原始响应、Error Stack、Token、Secret、邮箱等敏感内容。

列表支持状态、Topic、Aggregate Type、发生时间和安全字段搜索。事件事实不可编辑；唯一管理动作是经过 CSRF、
权限和 Audit 保护的死信重放。

## Worker 与保留策略

开发环境运行 `pnpm dev:worker`。同一个 Worker 进程承载 Jobs Runner 与 Outbox Runner，但二者使用独立表、
Registry 和状态机。主要配置：

- `OUTBOX_POLL_INTERVAL_MS`：空闲轮询间隔；
- `OUTBOX_CONCURRENCY`：单进程并发；
- `OUTBOX_HEARTBEAT_INTERVAL_MS`：heartbeat 上限，实际不超过租约三分之一；
- `OUTBOX_SHUTDOWN_GRACE_MS`：优雅关闭等待时间；
- `OUTBOX_STALE_RECOVERY_BATCH`：单轮租约恢复上限；
- `OUTBOX_RETENTION_DAYS`：已发布 Event 保留天数；
- `OUTBOX_MAINTENANCE_INTERVAL_MS`：清理维护间隔；
- `OUTBOX_WORKER_ID`：可选实例标识，默认自动生成。

自动清理只删除超过保留期的 `published` Event，并级联删除对应 Attempt；`pending`、`publishing` 和 `dead`
不会被批量删除。Consumer Receipt 不随 Event 清理。

## 模块边界

- **Idempotency**：同步命令执行和结果重放；
- **Jobs**：应用内部延迟异步命令；
- **Transactional Outbox**：业务事务产生的不可变事实和外部可靠发布；
- **Webhook Inbox**：外部系统进入本应用的事实，是否通用化在真实支付回调验证后决定。

核心写入/投递、Admin 用例、Append Persistence、Delivery Persistence 和只读 Diagnostics Persistence 分离，
避免 Worker 状态机、业务事务写入和管理查询重新聚合成单文件模块。
